function normalizeBarcode(value) {
  const code = String(value || "").trim();
  return /^\d{1,7}$/.test(code) ? code.padStart(8, "0") : code;
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
    if (!row.description) reasons.push("Description is missing.");
    if (row.tagPrice == null || !Number.isFinite(row.tagPrice) || row.tagPrice < 0) reasons.push("Tag/now price needs review.");
    if (row.warnings.length) reasons.push(...row.warnings);
    if (/\b(?:bundle|free|buy\s*\d|buy\s+one|get\s*\d|get\s+one)\b/i.test(`${row.sourceName} ${row.sourceExcerpt}`)) {
      reasons.push("Bundle or free-item terms need product mapping.");
    }
    if (counts.get(code) > 1 && !row.warnings.some(warning => /more than once/i.test(warning))) {
      reasons.push("This barcode appears more than once in the PDF.");
    }
    if (matches.length !== 1) reasons.push("No unique matching inventory barcode.");
    else if (matches[0].srp == null || !Number.isFinite(Number(matches[0].srp)) || Number(matches[0].srp) <= 0) {
      reasons.push("The matching product needs a positive standard SRP.");
    }
    if (existingCodes.has(code)) reasons.push("An active promotion already uses this barcode.");
    return { row, code, reasons, ready: reasons.length === 0 };
  });
}
