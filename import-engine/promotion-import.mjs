import { promotionVariantKey } from "./promotion-pdf.mjs";

function normalizeBarcode(value) {
  const code = String(value || "").trim();
  return /^\d{1,7}$/.test(code) ? code.padStart(8, "0") : code;
}

function modelTokens(value, preserveHyphens = false) {
  return [...new Set((String(value || "").toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g) || [])
    .map(token => preserveHyphens ? token : token.replace(/-/g, ""))
    .filter(token => token.length >= 4 && /[A-Z]/.test(token) && /\d/.test(token) &&
      !/^(?:BUY|GET|TAKE)\d+$|^\d+(?:MOS?|MONTHS?|HP|LITER|LITRE|INCH|FT)$/.test(token)))];
}

function matchingModel(row, catalog) {
  const description = String(row.description || "").toUpperCase();
  const models = modelTokens(description);
  if (!models.length) return null;
  const matches = [...new Set(models.flatMap(model => catalog.models.get(model) || []))];
  if (!matches.length) return null;
  const words = description.replace(/[^A-Z0-9]+/g, " ").trim();
  const hasNamedBrand = [...catalog.brands].some(brand => (` ${words} `).includes(` ${brand} `));
  const mentionedBrands = new Set(matches.map(product =>
    String(product.brand || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim())
    .filter(brand => brand.length >= 3 && (` ${words} `).includes(` ${brand} `)));
  if (mentionedBrands.size > 1) return null;
  if (hasNamedBrand && !mentionedBrands.size) return null;
  const branded = matches.filter(product => {
    const brand = String(product.brand || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    return mentionedBrands.has(brand);
  });
  let selected = mentionedBrands.size ? branded : matches;
  if (selected.length > 1 && mentionedBrands.size === 1) {
    // The catalog can carry different barcodes for models such as NRC1M and NRC-1M.
    const printedModels = new Set(modelTokens(description, true));
    selected = selected.filter(product => modelTokens(product.model_description, true)
      .some(model => printedModels.has(model)));
  }
  if (selected.length !== 1) return null;
  const product = selected[0];
  if (!normalizeBarcode(product.barcode)) return null;
  return product;
}

function matchingBuyGetBundle(row, catalog) {
  const excerpt = String(row.sourceColumns
    ? [row.description, row.model, row.category, row.remarks].join(" ") : row.sourceExcerpt || "").toUpperCase();
  if (/\b(?:BUNDLE|FREE|WITH|AND|ASSORTED|CHOOSE)\b|[+&/]/.test(excerpt)) return null;
  const terms = [...excerpt.matchAll(/\bBUY\s*(\d{1,2})\s+(?:GET|TAKE)\s*(\d{1,2})\b/g)];
  if (!terms.length) return null;
  const quantities = [...new Set(terms.map(match => `${Number(match[1])}:${Number(match[2])}`))];
  if (quantities.length !== 1) return null;
  const [paid, free] = quantities[0].split(":").map(Number);
  if (!paid || !free) return null;
  const models = modelTokens(row.sourceColumns ? row.description : `${row.description} ${row.sourceExcerpt}`);
  if (models.length !== 1) return null;
  const product = matchingModel(row, catalog);
  if (!product || product.srp == null || !Number.isFinite(Number(product.srp)) || Number(product.srp) <= 0) return null;
  const barcode = normalizeBarcode(product.barcode);
  return [
    { id: "paid", barcode, quantity: paid, free: false },
    { id: "free", barcode, quantity: free, free: true },
  ];
}

function matchingCombination(row, catalog) {
  if (!row.sourceColumns || /\b(?:BUY|GET|TAKE)\s*\d|\bB\dT\d\b|\bFREE\b|\(\s*\d+\s*\)/i.test(row.description)) return null;
  // A slash often separates model codes after a combined item name such as
  // "RICE COOKER & KETTLE RC-87/EK-017". Keep that descriptive ampersand together.
  let parts = row.description.split(/[+/]/).map(value => value.trim());
  if (parts.length < 2) parts = row.description.split(/&/).map(value => value.trim());
  if (parts.length < 2 || parts.some(part => !part)) return null;
  const components = [];
  let brand = "";
  for (const part of parts) {
    const words = part.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
    const brands = [...catalog.brands].filter(value => (" " + words + " ").includes(" " + value + " "));
    if (brands.length > 1) return null;
    if (brands.length) brand = brands[0];
    const product = matchingModel({ description: brand + " " + part }, catalog);
    // Every printed combination part must name exactly one uniquely matched model.
    if (!product || modelTokens(part).length !== 1 || !Number.isFinite(Number(product.srp)) || Number(product.srp) <= 0) return null;
    components.push({ id: "product-" + (components.length + 1), barcode: normalizeBarcode(product.barcode), quantity: 1, free: false });
  }
  return components;
}

export function preparePromotionImport(candidates, products, existing) {
  const productByCode = new Map();
  const catalog = { models: new Map(), brands: new Set() };
  for (const product of products) {
    const code = normalizeBarcode(product.barcode);
    if (!productByCode.has(code)) productByCode.set(code, []);
    productByCode.get(code).push(product);
    const promotionProduct = /\b(?:BUNDLE|BUY\s*\d|B\dT\d)\b/i.test(product.model_description || "");
    for (const model of promotionProduct ? [] : modelTokens(product.model_description)) {
      if (!catalog.models.has(model)) catalog.models.set(model, []);
      catalog.models.get(model).push(product);
    }
    const brand = String(product.brand || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    if (brand.length >= 3) catalog.brands.add(brand);
  }
  const existingCodes = new Set(existing.map(row => normalizeBarcode(row.barcode)));
  const counts = new Map();
  for (const row of candidates) {
    const code = promotionVariantKey(row);
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return candidates.map(row => {
    const code = normalizeBarcode(row.barcode);
    const matches = productByCode.get(code) || [];
    const reasons = [];
    if (!code) reasons.push("Barcode is missing.");
    if (!row.description) reasons.push("Description is missing.");
    if (row.tagPrice == null || !Number.isFinite(row.tagPrice) || row.tagPrice < 0) reasons.push("Tag/now price needs review.");
    if (row.warnings.length) reasons.push(...row.warnings);
    const sourceTerms = row.sourceColumns
      ? [row.description, row.category, row.remarks].join(" ") : `${row.sourceName} ${row.sourceExcerpt}`;
    const hasBundleTerms = /\b(?:bundle|buy\s*\d|buy\s+one|get\s*\d|get\s+one|B\dT\d)\b/i.test(sourceTerms) ||
      (!row.sourceColumns && /\bfree\b/i.test(sourceTerms));
    const bundle = hasBundleTerms ? matchingBuyGetBundle(row, catalog) || matchingCombination(row, catalog) : null;
    if (hasBundleTerms && !bundle) {
      reasons.push("Bundle or free-item terms need product mapping.");
    }
    if (counts.get(promotionVariantKey(row)) > 1 && !row.warnings.some(warning => /more than once/i.test(warning))) {
      reasons.push("This barcode appears more than once in the PDF.");
    }
    const simpleTerms = !/\b(?:set|pack|pair|pcs?|pieces?|units?|with|and|assorted|choose)\b|[+&]/i.test(row.description);
    const matchingRow = { ...row, description: [row.brand, row.description].filter(Boolean).join(" ") };
    const matchedModel = !hasBundleTerms && simpleTerms && matches.length === 0 && modelTokens(row.description).length === 1
      ? matchingModel(matchingRow, catalog) : null;
    const product = matches.length === 1 ? matches[0] : matchedModel;
    if (!bundle && !product) reasons.push("No unique matching inventory barcode or product model.");
    else if (!bundle && (product.srp == null || !Number.isFinite(Number(product.srp)) || Number(product.srp) <= 0)) {
      reasons.push("The matching product needs a positive standard SRP.");
    }
    if (existingCodes.has(code)) reasons.push("An active promotion already uses this barcode.");
    const components = bundle || [{ id: "component-1", barcode: product ? normalizeBarcode(product.barcode) : code, quantity: 1, free: false }];
    return { row, code, reasons, components, ready: reasons.length === 0 };
  });
}

