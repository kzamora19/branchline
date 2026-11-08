function normalizeBarcode(value) {
  const code = String(value || "").trim();
  return /^\d{1,7}$/.test(code) ? code.padStart(8, "0") : code;
}

function modelTokens(value) {
  return [...new Set((String(value || "").toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g) || [])
    .map(token => token.replace(/-/g, ""))
    .filter(token => token.length >= 5 && /[A-Z]/.test(token) && /\d/.test(token) &&
      !/^(?:BUY|GET)\d+$|^\d+(?:MOS?|MONTHS?)$/.test(token)))];
}

function matchingModel(row, catalog) {
  const description = String(row.description || "").toUpperCase();
  const models = modelTokens(description);
  if (!models.length) return null;
  const matches = [...new Set(models.flatMap(model => catalog.models.get(model) || []))];
  if (!matches.length) return null;
  const words = description.replace(/[^A-Z0-9]+/g, " ").trim();
  const mentionedBrands = new Set([...catalog.brands].filter(brand => (` ${words} `).includes(` ${brand} `)));
  if (mentionedBrands.size > 1) return null;
  const branded = matches.filter(product => {
    const brand = String(product.brand || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    return mentionedBrands.has(brand);
  });
  const selected = mentionedBrands.size ? branded : matches;
  if (selected.length !== 1) return null;
  const product = selected[0];
  if (!normalizeBarcode(product.barcode)) return null;
  return product;
}

function matchingBuyGetBundle(row, catalog) {
  const excerpt = String(row.sourceExcerpt || "").toUpperCase();
  if (/\b(?:BUNDLE|FREE|WITH|AND|ASSORTED|CHOOSE)\b|[+&/]/.test(excerpt)) return null;
  const terms = [...excerpt.matchAll(/\bBUY\s*(\d{1,2})\s+GET\s*(\d{1,2})\b/g)];
  if (!terms.length) return null;
  const quantities = [...new Set(terms.map(match => `${Number(match[1])}:${Number(match[2])}`))];
  if (quantities.length !== 1) return null;
  const [paid, free] = quantities[0].split(":").map(Number);
  if (!paid || !free) return null;
  const models = modelTokens(`${row.description} ${row.sourceExcerpt}`);
  if (models.length !== 1) return null;
  const product = matchingModel(row, catalog);
  if (!product || product.srp == null || !Number.isFinite(Number(product.srp)) || Number(product.srp) <= 0) return null;
  const barcode = normalizeBarcode(product.barcode);
  return [
    { id: "paid", barcode, quantity: paid, free: false },
    { id: "free", barcode, quantity: free, free: true },
  ];
}

export function preparePromotionImport(candidates, products, existing) {
  const productByCode = new Map();
  const catalog = { models: new Map(), brands: new Set() };
  for (const product of products) {
    const code = normalizeBarcode(product.barcode);
    if (!productByCode.has(code)) productByCode.set(code, []);
    productByCode.get(code).push(product);
    for (const model of modelTokens(product.model_description)) {
      if (!catalog.models.has(model)) catalog.models.set(model, []);
      catalog.models.get(model).push(product);
    }
    const brand = String(product.brand || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    if (brand.length >= 3) catalog.brands.add(brand);
  }
  const existingCodes = new Set(existing.map(row => normalizeBarcode(row.barcode)));
  const counts = new Map();
  for (const row of candidates) {
    const code = normalizeBarcode(row.barcode);
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
    const hasBundleTerms = /\b(?:bundle|free|buy\s*\d|buy\s+one|get\s*\d|get\s+one)\b/i.test(`${row.sourceName} ${row.sourceExcerpt}`);
    const bundle = hasBundleTerms ? matchingBuyGetBundle(row, catalog) : null;
    if (hasBundleTerms && !bundle) {
      reasons.push("Bundle or free-item terms need product mapping.");
    }
    if (counts.get(code) > 1 && !row.warnings.some(warning => /more than once/i.test(warning))) {
      reasons.push("This barcode appears more than once in the PDF.");
    }
    const simpleTerms = !/\b(?:set|pack|pair|pcs?|pieces?|units?|with|and|assorted|choose)\b|[+&]/i.test(row.description);
    const matchedModel = !hasBundleTerms && simpleTerms && matches.length === 0 && modelTokens(row.description).length === 1
      ? matchingModel(row, catalog) : null;
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
