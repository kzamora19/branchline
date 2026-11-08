function normalizeBarcode(value) {
  const code = String(value || "").trim();
  return /^\d{1,7}$/.test(code) ? code.padStart(8, "0") : code;
}

function matchingBuyGetBundle(row, products) {
  const excerpt = String(row.sourceExcerpt || "").toUpperCase();
  if (/\b(?:BUNDLE|FREE|WITH|AND|ASSORTED|CHOOSE)\b|[+&/]/.test(excerpt)) return null;
  const terms = [...excerpt.matchAll(/\bBUY\s*(\d{1,2})\s+GET\s*(\d{1,2})\b/g)];
  if (!terms.length) return null;
  const quantities = [...new Set(terms.map(match => `${Number(match[1])}:${Number(match[2])}`))];
  if (quantities.length !== 1) return null;
  const [paid, free] = quantities[0].split(":").map(Number);
  if (!paid || !free) return null;
  const models = [...new Set((excerpt.match(/\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g) || [])
    .filter(token => /[A-Z]/.test(token) && /\d/.test(token)))];
  if (models.length !== 1) return null;
  const matches = products.filter(product =>
    String(product.model_description || "").toUpperCase().split(/[^A-Z0-9-]+/).includes(models[0]));
  if (matches.length !== 1 || !normalizeBarcode(matches[0].barcode) ||
      !Number.isFinite(Number(matches[0].srp)) || Number(matches[0].srp) <= 0) return null;
  const barcode = normalizeBarcode(matches[0].barcode);
  return [
    { id: "paid", barcode, quantity: paid, free: false },
    { id: "free", barcode, quantity: free, free: true },
  ];
}

export function preparePromotionImport(candidates, products, existing) {
  const productByCode = new Map();
  for (const product of products) {
    const code = normalizeBarcode(product.barcode);
    if (!productByCode.has(code)) productByCode.set(code, []);
    productByCode.get(code).push(product);
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
    const bundle = hasBundleTerms ? matchingBuyGetBundle(row, products) : null;
    if (hasBundleTerms && !bundle) {
      reasons.push("Bundle or free-item terms need product mapping.");
    }
    if (counts.get(code) > 1 && !row.warnings.some(warning => /more than once/i.test(warning))) {
      reasons.push("This barcode appears more than once in the PDF.");
    }
    if (!bundle && matches.length !== 1) reasons.push("No unique matching inventory barcode.");
    else if (!bundle && (matches[0].srp == null || !Number.isFinite(Number(matches[0].srp)) || Number(matches[0].srp) <= 0)) {
      reasons.push("The matching product needs a positive standard SRP.");
    }
    if (existingCodes.has(code)) reasons.push("An active promotion already uses this barcode.");
    const components = bundle || [{ id: "component-1", barcode: code, quantity: 1, free: false }];
    return { row, code, reasons, components, ready: reasons.length === 0 };
  });
}
