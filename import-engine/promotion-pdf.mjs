const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 100;

// Keep source positions and page boundaries for later layout review; never infer prices or product links here.
export async function inspectPromotionPdf(pdfjs, bytes, sourceName) {
  if (!pdfjs || typeof pdfjs.getDocument !== "function") throw new Error("The PDF reader is unavailable.");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    throw new Error("Choose a nonempty PDF no larger than 30 MB.");
  }

  if (typeof sourceName !== "string" || !sourceName.trim()) throw new Error("The PDF source name is required.");
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  let document;
  try {
    document = await task.promise;
    if (!Number.isInteger(document.numPages) || document.numPages < 1 || document.numPages > MAX_PAGES) {
      throw new Error("The PDF must contain between 1 and 100 pages.");
    }
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      try {
        const content = await page.getTextContent();
        const items = content.items.filter(item => typeof item.str === "string" && item.str.trim()).map(item => {
          if (!Array.isArray(item.transform) || item.transform.length !== 6 ||
            !item.transform.every(Number.isFinite) || !Number.isFinite(item.width) || !Number.isFinite(item.height)) {
            throw new Error(`Page ${number} contains text with invalid position data.`);
          }
          return {
            text: item.str,
            transform: [...item.transform],
            width: item.width,
            height: item.height,
            direction: item.dir || "",
            endOfLine: item.hasEOL === true,
          };
        });
        pages.push({
          number,
          items,
          warnings: items.length ? [] : ["No selectable text detected; this page may require OCR or manual review."],
        });
      } finally {
        page.cleanup();
      }
    }
    return { sourceName: sourceName.trim(), pages };
  } finally {
    await task.destroy();
  }
}

const COLUMN_NAMES = [
  ["barcode", /^barcode$/i], ["brand", /^brand$/i], ["category", /^category$/i],
  ["description", /^(?:model|description|item name)$/i], ["remarks", /^rema(?:rks|krs)$/i],
  ["memoSrp", /^srp$/i], ["cashPayment", /^cash payment(?: only)?$/i],
  ["tagPrice", /^(?:cash\s*\/\s*)?tag(?:\s*this)?$|^now\s+price$/i],
  ...[6, 9, 12, 18, 24].map(months => ["months" + months, new RegExp("^" + months + "\\s*(?:mos?\\.?|months?)(?:\\s+0%)?$", "i")]),
];
const center = item => item.transform[4] + (Number.isFinite(item.width) ? item.width / 2 : 0);
const lineText = items => items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
  .map(item => item.text.trim()).join(" ").replace(/\s+/g, " ").trim();

function columnHeaders(items) {
  const matches = COLUMN_NAMES.flatMap(([key, pattern]) =>
    items.filter(item => pattern.test(item.text.trim())).map(item => ({ key, item, x: center(item) })));
  // A later MODEL column can contain a short code while DESCRIPTION contains the complete product name.
  const descriptions = matches.filter(header => header.key === "description");
  if (descriptions.some(header => /^description$/i.test(header.item.text))) {
    for (const header of descriptions) if (/^model$/i.test(header.item.text)) header.key = "model";
  }
  return matches;
}

function sourceAmount(raw) {
  const compact = raw.replace(/[₱,\s]/g, "");
  if (!compact || /^[-–—]$/.test(compact)) return null;
  const match = compact.match(/^(\d+(?:\.\d{1,2})?)(\/MO\.?)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount <= 9999999999.99 ? { amount, monthly: Boolean(match[2]) } : null;
}

// Candidate rows are suggestions only: layouts and source text must be checked by a manager.
export function promotionPdfCandidates(document) {
  if (!document || !Array.isArray(document.pages) || typeof document.sourceName !== "string") {
    throw new Error("Inspect a promotion PDF before finding its product rows.");
  }
  if (!document.pages.some(page => page.items?.some(item => /^barcode$/i.test(item.text?.trim())))) {
    return legacyPromotionPdfCandidates(document);
  }
  const rows = [];
  const period = promotionPdfPeriod(document);
  let previousHeaders = [];
  for (const page of document.pages) {
    if (!Array.isArray(page.items) || !Number.isInteger(page.number)) throw new Error("The inspected PDF page is invalid.");
    if (page.items.some(item => !Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite))) {
      throw new Error(`Page ${page.number} has invalid text positions.`);
    }
    const headers = columnHeaders(page.items);
    const available = headers.length ? headers : previousHeaders;
    const barcodeHeaders = available.filter(header => header.key === "barcode");
    if (!barcodeHeaders.length) continue;
    const codes = page.items.filter(item => /^\d{4,8}$/.test(item.text.trim()) &&
      barcodeHeaders.some(header => Math.abs(center(item) - header.x) <= 22 &&
        (!headers.length || item.transform[5] < header.item.transform[5] - 3)))
      .sort((a, b) => b.transform[5] - a.transform[5]);
    for (const code of codes) {
      const y = code.transform[5];
      const sectionHeaders = available.filter(header => !headers.length || header.item.transform[5] > y + 2);
      const columns = new Map();
      for (const header of sectionHeaders.sort((a, b) => a.item.transform[5] - b.item.transform[5])) {
        if (!columns.has(header.key)) columns.set(header.key, header);
      }
      const anchors = [...columns.values()].sort((a, b) => a.x - b.x);
      const cells = {};
      for (const item of page.items) {
        if (headers.some(header => header.item === item)) continue;
        if (Math.abs(item.transform[5] - y) > Math.max(2, (code.height || 7) * 1.5)) continue;
        const nearestRow = codes.reduce((nearest, row) =>
          Math.abs(row.transform[5] - item.transform[5]) < Math.abs(nearest.transform[5] - item.transform[5]) ? row : nearest, code);
        if (nearestRow !== code) continue;
        const anchor = anchors.reduce((nearest, header) =>
          Math.abs(header.x - center(item)) < Math.abs(nearest.x - center(item)) ? header : nearest);
        (cells[anchor.key] ??= []).push(item);
      }
      const sourceColumns = Object.fromEntries(Object.entries(cells).map(([key, items]) => [key, lineText(items)]));
      const description = sourceColumns.description || "";
      const warnings = [];
      const prices = {};
      const installments = [];
      for (const key of ["memoSrp", "cashPayment", "tagPrice", "months6", "months9", "months12", "months18", "months24"]) {
        const raw = sourceColumns[key] || "";
        const value = sourceAmount(raw);
        if (raw && !value && !/^[-–—]$/.test(raw)) warnings.push("The printed " + key + " amount needs review: " + raw);
        if (key.startsWith("months")) {
          if (value) installments.push({ months: Number(key.slice(6)), amount: value.amount, basis: value.monthly ? "monthly" : "total", raw });
        } else prices[key] = value?.amount ?? null;
      }
      const excerpt = Object.entries(sourceColumns).map(([key, value]) => key + ": " + value).join(" | ");
      rows.push({
        barcode: code.text.trim(), description, sourceName: document.sourceName,
        sourcePage: page.number, sourceExcerpt: excerpt, validFrom: period.validFrom, validTo: period.validTo,
        brand: sourceColumns.brand || "", category: sourceColumns.category || "",
        remarks: sourceColumns.remarks || "", model: sourceColumns.model || "",
        sourceColumns, installments, ...prices,
        warnings: [
          ...(!description ? ["Description was not detected; enter it from the PDF."] : []),
          ...(prices.tagPrice === null ? ["Tag/now price is not printed in this row."] : []),
          ...warnings,
        ],
      });
    }
    if (headers.length) previousHeaders = headers;
  }
  const occurrences = new Map();
  for (const row of rows) {
    const code = promotionVariantKey(row);
    occurrences.set(code, (occurrences.get(code) || 0) + 1);
  }
  for (const row of rows) {
    const code = promotionVariantKey(row);
    if (occurrences.get(code) > 1) row.warnings.push("This barcode appears more than once; compare the source prices and terms.");
  }
  return rows;
}

export function promotionVariantKey(row) {
  const code = /^\d{1,7}$/.test(row.barcode) ? row.barcode.padStart(8, "0") : row.barcode;
  const terms = row.remarks || (/^(?:BUNDLE|BUY\s*\d)/i.test(row.category || "") ? row.category : "");
  return [code, terms.trim().toUpperCase()].join("|");
}

export function promotionPdfPeriod(document) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const names = `(${months.join("|")})`;
  const pattern = new RegExp(`period\\s+covered\\s*:?\\s*${names}\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\s*(?:to|[-–—])\\s*${names}\\s+(\\d{1,2}),?\\s+(20\\d{2})`, "gi");
  const text = document.pages.flatMap(page => page.items.map(item => item.text)).join(" ").replace(/\s+/g, " ");
  const values = [];
  for (const match of text.matchAll(pattern)) {
    const make = (month, day, year) => {
      const value = `${year}-${String(months.indexOf(month.toLowerCase()) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
    };
    const from = make(match[1], match[2], match[3] || match[6]);
    const to = make(match[4], match[5], match[6]);
    if (from && to && from <= to) values.push(`${from}/${to}`);
  }
  const distinct = [...new Set(values)];
  if (distinct.length !== 1) return { validFrom: "", validTo: "" };
  const [validFrom, validTo] = distinct[0].split("/");
  return { validFrom, validTo };
}

function legacyPromotionPrices(page, items, y) {
  const headers = page.items.filter(item => item.transform[5] > y);
  const find = expression => {
    const header = headers.filter(item => expression.test(item.text.trim()))
      .sort((a, b) => a.transform[5] - b.transform[5])[0];
    if (!header) return null;
    const center = item => item.transform[4] + (Number.isFinite(item.width) ? item.width / 2 : 0);
    const amounts = items.filter(item => /^(?:₱\s*)?[\d,]+\.\d{2}$/.test(item.text.trim()))
      .map(item => ({ item, distance: Math.min(Math.abs(center(item) - center(header)), Math.abs(item.transform[4] - header.transform[4])) }))
      .filter(match => match.distance <= 12)
      .sort((a, b) => a.distance - b.distance);
    if (amounts.length !== 1) return null;
    return Number(amounts[0].item.text.replace(/[₱,\s]/g, ""));
  };
  return { memoSrp: find(/^srp$/i), tagPrice: find(/^(?:cash\s*\/\s*)?tag(?:\s*this)?$|^now\s+price$/i) };
}

// Candidate rows are suggestions only: layouts and source text must be checked by a manager.
function legacyPromotionPdfCandidates(document) {
  if (!document || !Array.isArray(document.pages) || typeof document.sourceName !== "string") {
    throw new Error("Inspect a promotion PDF before finding its product rows.");
  }
  const rows = [];
  const period = promotionPdfPeriod(document);
  for (const page of document.pages) {
    if (!Array.isArray(page.items) || !Number.isInteger(page.number)) throw new Error("The inspected PDF page is invalid.");
    if (page.items.some(item => !Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite))) {
      throw new Error(`Page ${page.number} has invalid text positions.`);
    }
    const lines = [];
    for (const item of [...page.items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
      let line = lines.find(candidate => Math.abs(candidate.y - item.transform[5]) <= 1.5);
      if (!line) { line = { y: item.transform[5], items: [] }; lines.push(line); }
      line.items.push(item);
    }
    for (const line of lines) {
      const items = line.items.sort((a, b) => a.transform[4] - b.transform[4]);
      const codes = items.filter(item => /^\d{4,8}$/.test(item.text.trim()));
      if (codes.length !== 1) continue;
      const code = codes[0];
      const after = items.filter(item => item.transform[4] > code.transform[4]);
      const priceAt = after.findIndex(item => /^(?:₱\s*)?[\d,]+\.\d{2}$/.test(item.text.trim()));
      const description = (priceAt < 0 ? after : after.slice(0, priceAt))
        .map(item => item.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      const excerpt = items.map(item => item.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      const prices = legacyPromotionPrices(page, items, line.y);
      rows.push({
        barcode: code.text.trim(), description, sourceName: document.sourceName,
        sourcePage: page.number, sourceExcerpt: excerpt, validFrom: period.validFrom, validTo: period.validTo,
        ...prices,
        warnings: [
          ...(!description ? ["Description was not detected; enter it from the PDF."] : []),
          ...(priceAt < 0 ? ["Price columns were not identified; review the PDF."] : []),
        ],
      });
    }
  }
  const occurrences = new Map();
  for (const row of rows) {
    const code = /^\d{1,7}$/.test(row.barcode) ? row.barcode.padStart(8, "0") : row.barcode;
    occurrences.set(code, (occurrences.get(code) || 0) + 1);
  }
  for (const row of rows) {
    const code = /^\d{1,7}$/.test(row.barcode) ? row.barcode.padStart(8, "0") : row.barcode;
    if (occurrences.get(code) > 1) row.warnings.push("This barcode appears more than once; compare the source prices and terms.");
  }
  return rows;
}

