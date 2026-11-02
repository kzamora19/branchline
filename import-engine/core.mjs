import { BRAND_REFERENCE } from "./brand-reference.mjs";

export const FORMAT_VERSION = "1.1";
const CONFIRMED_BRANDS = BRAND_REFERENCE.brands.filter(brand => brand.automaticMatch).map(brand => brand.name);
const BRAND_ALIASES = BRAND_REFERENCE.aliases;
const CONDITIONAL_BRANDS = new Set(Object.entries(BRAND_ALIASES).filter(([, value]) => Array.isArray(value)).map(([alias]) => alias));
function canonicalBrand(value, description = "") {
  const id = identity(value);
  const canonical = BRAND_ALIASES[id];
  if (typeof canonical === "string") return canonical;
  if (Array.isArray(canonical)) return canonical.find(name => identity(description).startsWith(`${name} `)) || text(value);
  if (id === "AMERICAN HOME" || id === "AMERICAN MASTER") return text(value);
  return text(value);
}
export const ROLES = ["forecast", "memo", "reference", "inventory", "serials", "products", "skip"];
export const FIELDS = {
  barcode: ["barcode", "itemcode", "itembarcode", "ean", "upc"],
  description: ["description", "completedescription", "itemname", "productname", "modeldescription", "product"],
  model: ["model", "modelno", "modelnumber"],
  brand: ["brand", "brandname"],
  category: ["itemcategory", "category", "maincateg"],
  subcategory: ["subcategory", "subcat"],
  srp: ["srp", "suggestedretailprice"],
  location: ["loccode", "location", "locationcode", "branch", "branchlocation"],
  serial: ["serialno", "serialnumber", "serial"],
  received: ["trandate", "transactiondate", "receiveddate", "receivedon", "datereceived"],
  age: ["ageinmos", "ageinmonths", "reportedageinmonths"],
  total: ["total", "quantity", "qty", "availableqty"],
  bucket: ["agingbucket", "reportedagingbucket"],
  current: ["currentdue"], over30: ["over30"], over60: ["over60"],
  over90: ["over90"], over120: ["over120"], over1yr: ["over1yr"], over2yrs: ["over2yrs"]
};
const BUCKETS = { current: "Current Due", over30: "Over 30", over60: "Over 60", over90: "Over 90", over120: "Over 120", over1yr: "Over 1YR", over2yrs: "Over 2YRs" };
export function filenameYear(name) {
  const years = [...new Set((String(name).replace(/\.[^.]+$/, "").match(/(?<!\d)20\d{2}(?!\d)/g) || []))];
  return years.length === 1 ? Number(years[0]) : null;
}
export function memoIdentity(value) {
  const number = text(value).toUpperCase();
  const match = /^([A-Z][A-Z0-9]*)-(\d+)(?:-\d{6}-\d{6})?$/.exec(number);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return { memo_number: number, memo_prefix: "", memo_sequence: null };
  return { memo_number: number, memo_prefix: match[1], memo_sequence: Number(match[2]) };
}
export const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
export const key = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
export function barcode(value) {
  const code = text(value);
  return /^\d{1,7}$/.test(code) ? code.padStart(8, "0") : code;
}
export function numeric(value) {
  if (text(value) === "") return null;
  const cleaned = text(value).replace(/[₱,\s]/g, "");
  if (typeof value !== "number" && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  const raw = typeof value === "number" ? value : Number(cleaned);
  return Number.isFinite(raw) && raw >= 0 ? raw : NaN;
}
export function dateISO(value, date1904 = false, order = "mdy") {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "string" && /^\d{5}(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 100000) return "";
    const serial = Math.floor(value);
    if (!date1904 && serial === 60) return "";
    const correction = !date1904 && serial < 60 ? 1 : 0;
    return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + (serial + correction) * 86400000).toISOString().slice(0, 10);
  }
  const raw = text(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(raw);
  let y, m, d;
  if (match) [, y, m, d] = match.map(String);
  else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$| )/.exec(raw);
    if (!match) return "";
    y = match[3]; m = match[order === "dmy" ? 2 : 1]; d = match[order === "dmy" ? 1 : 2];
  }
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : "";
}
export function detect(rows, name = "") {
  let best = null;
  for (let index = 0; index < Math.min(rows.length, 100); index++) {
    const header = rows[index] || [];
    const normalized = header.map(key);
    const cols = Object.fromEntries(Object.entries(FIELDS).map(([field, aliases]) => [field, normalized.findIndex(value => aliases.includes(value))]));
    if (cols.barcode < 0) continue;
    let role = "products";
    if (["invoiceno", "trandate", "divisioncode"].every(field => normalized.includes(field)) && cols.description >= 0) role = "reference";
    else if (cols.serial >= 0) role = "serials";
    else if (cols.srp >= 0 && (/forecast/i.test(name) || normalized.includes("itemcategory"))) role = "forecast";
    else if (cols.total >= 0) role = "inventory";
    else if (cols.srp >= 0 && (cols.model >= 0 && cols.brand >= 0 || /memo/i.test(name))) role = "memo";
    const score = Object.values(cols).filter(at => at >= 0).length;
    if (!best || score > best.score) best = { role, header: index, cols, score };
  }
  if (!best) return { role: "unknown", header: 0, cols: {}, locationCols: [] };
  const used = new Set(Object.values(best.cols).filter(at => at >= 0));
  const locationCols = best.role === "inventory" ? rows[best.header].flatMap((value, index) =>
    text(value) && !used.has(index) ? [{ index, name: text(value) }] : []) : [];
  return { ...best, locationCols };
}

export function expandMerges(rows, merges, header, cols) {
  const selected = new Set(["barcode", "description", "model", "brand", "category", "subcategory", "location"].map(field => cols[field]).filter(at => at >= 0));
  for (const range of merges || []) {
    if (range.s.r <= header || range.e.r <= range.s.r || !selected.has(range.s.c)) continue;
    const value = rows[range.s.r]?.[range.s.c];
    if (!text(value)) continue;
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      rows[row] ||= [];
      if (!text(rows[row][range.s.c])) rows[row][range.s.c] = value;
    }
  }
  return rows;
}
function classificationMerges(sheet, header, cols, issues, source) {
  const merges = sheet.merges || [];
  const fields = [cols.category, cols.subcategory];
  const shifted = cols.category === 0 && cols.subcategory === 2 && cols.barcode === 5
    && fields.every(col => merges.some(range => range.s.r === header && range.e.r === header
      && range.s.c === col + 1 && range.e.c === (col === 0 ? 2 : 5))
      && text(sheet.rows[header]?.[col]) && !text(sheet.rows[header]?.[col + 1]));
  if (!shifted) return merges;
  let repaired = 0;
  const corrected = merges.map(range => {
    const col = range.s.c - 1;
    if (range.s.r <= header || !fields.includes(col) || range.e.c !== (col === 0 ? 2 : 5) || range.e.r <= range.s.r
      || !text(sheet.rows[range.s.r]?.[col]) || text(sheet.rows[range.s.r]?.[range.s.c])) return range;
    const value = text(sheet.rows[range.s.r][col]);
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      if (text(sheet.rows[row]?.[col]) && text(sheet.rows[row][col]) !== value) {
        issue(issues, "WARNING", "CLASSIFICATION_MERGE_AMBIGUOUS", "Shifted classification range contains different values; not expanded.", source, "", `Column ${col + 1}, rows ${range.s.r + 1}-${range.e.r + 1}`);
        return range;
      }
    }
    repaired++;
    return { s: { ...range.s, c: col }, e: { ...range.e, c: range.e.c - 1 } };
  });
  if (repaired) issue(issues, "INFO", "CLASSIFICATION_MERGES_REPAIRED", "Recognized forecast export stores classification merge columns one position to the right. Expanded the verified classification ranges at their actual cells.", source, "", `${repaired} ranges`);
  return corrected;
}
export function locationParts(value) {
  const raw = text(value);
  const match = /^([A-Z][A-Z0-9]{1,9})\s+-\s+(.+)$/i.exec(raw);
  return match ? { code: match[1].toUpperCase(), name: text(match[2]), raw } : { code: "", name: raw, raw };
}
const identity = value => text(value).toUpperCase();
const sourceOf = (sheet, row) => ({ source_file: sheet.file, source_sheet: sheet.name, source_row: row + 1, source_id: sheet.id });
function issue(list, severity, code, message, source = {}, item = "", details = "") {
  list.push({ severity, issue: code, barcode: item, message, details, ...source });
}
function isFooter(value) { return /^(?:grand\s+total|total(?:\s+qty)?\s*:?)$/i.test(text(value)); }
function readNumber(row, at, issues, source, item, label, integer = false) {
  const value = numeric(at >= 0 ? row[at] : "");
  if (Number.isNaN(value) || value !== null && integer && !Number.isSafeInteger(value)) {
    issue(issues, "ERROR", "INVALID_NUMBER", `${label} must be a non-negative ${integer ? "whole " : ""}number; left blank.`, source, item, text(row[at]));
    return null;
  }
  return value;
}

export function extractSheet(sheet, config = {}) {
  const detected = detect(sheet.rows, sheet.file);
  const mapping = { ...detected, ...config };
  const { role, header, cols } = mapping;
  const out = { products: [], inventory: [], serials: [], issues: [], sources: [] };
  const reportDate = text(config.reportDate || sheet.reportDate);
  const forecastYear = role === "forecast" ? (config.forecastYear === "" ? null : Number(config.forecastYear ?? filenameYear(sheet.file))) : null;
  const metadata = { forecast_year: forecastYear || null, valid_from: text(config.validFrom ?? sheet.validFrom), valid_to: text(config.validTo ?? sheet.validTo),
    ...memoIdentity(config.memoNumber ?? sheet.memoNumber ?? "") };
  const source = { ...sourceOf(sheet, header), role, ...metadata, report_date: reportDate, date_order: config.dateOrder || "mdy", complete: !!config.complete, blank_stock_zero: !!config.blankZero };
  if (role === "skip") {
    out.sources.push({ ...source, status: "EXCLUDED_BY_USER", records: 0 });
    return out;
  }
  if (role === "unknown" || !ROLES.includes(role)) {
    issue(out.issues, "ERROR", "UNRECOGNIZED_LAYOUT", "Map this worksheet or explicitly exclude it.", source);
    out.sources.push({ ...source, status: "NEEDS_MAPPING", records: 0 });
    return out;
  }
  if (detected.role === "reference" && role !== "reference") {
    issue(out.issues, "ERROR", "SALES_REFERENCE_ROLE_REQUIRED", "Historical sales must use Sales database reference (or be excluded). Sold serials, sales quantities and historical SRP cannot be current stock/pricing.", source);
    out.sources.push({ ...source, status: "NEEDS_MAPPING", records: 0 });
    return out;
  }
  if (role === "reference") issue(out.issues, "INFO", "SALES_REFERENCE_ONLY", "Historical sales supplies product descriptions, brands and classifications only. Historical SRP, quantities, serials and transaction dates are excluded from current price/stock.", source);
  if (reportDate && (!dateISO(reportDate) || !Number.isFinite(Date.parse(reportDate)))) issue(out.issues, "ERROR", "INVALID_REPORT_DATE", "Source report date is invalid.", source, "", reportDate);
  if (role === "forecast" && (!Number.isInteger(forecastYear) || forecastYear < 2000 || forecastYear > 2099)) {
    issue(out.issues, "ERROR", "MISSING_FORECAST_YEAR", "Set the forecast reference year (for example 2025 or 2026).", source);
    metadata.forecast_year = null;
  }
  if (role === "memo" && (!dateISO(metadata.valid_from) || !dateISO(metadata.valid_to) || metadata.valid_from > metadata.valid_to)) {
    issue(out.issues, "ERROR", "MEMO_PERIOD_REQUIRED", "Confirm the memo validity start/end dates before its SRP can be selected.", source);
  }
  if (role === "memo" && metadata.memo_sequence === null) issue(out.issues, "WARNING", "MEMO_NUMBER_MISSING", "Memo number is missing/unrecognized; period date can rank it, but same-period ties may require review.", source);
  const mappedFields = Object.entries(cols).filter(([, at]) => Number.isInteger(at) && at >= 0);
  if (new Set(mappedFields.map(([, at]) => at)).size !== mappedFields.length) {
    issue(out.issues, "ERROR", "OVERLAPPING_COLUMN_MAPPING", "Different fields map to the same column. Correct the mapping before import.", source);
  }
  const required = ["barcode", ...(role === "serials" ? ["serial", "location", "received"] : [])];
  const missing = required.filter(field => !(cols[field] >= 0));
  if (missing.length || role === "inventory" && !mapping.locationCols?.length && !(cols.location >= 0 && cols.total >= 0)) {
    issue(out.issues, "ERROR", "MAPPING_REQUIRED", `Missing column mapping: ${missing.join(", ") || "quantity and location"}.`, source);
    out.sources.push({ ...source, status: "NEEDS_MAPPING", records: 0 });
    return out;
  }
  expandMerges(sheet.rows, role === "forecast" ? classificationMerges(sheet, header, cols, out.issues, source) : sheet.merges, header, cols);
  let currentBarcode = "";
  let currentDescription = "";
  let blankQuantities = 0;
  const totals = new Map();
  const declared = new Map();
  const matrix = role === "inventory" && mapping.locationCols?.length;
  for (let index = header + 1; index < sheet.rows.length; index++) {
    const row = sheet.rows[index] || [];
    if (!row.some(value => text(value))) continue;
    const get = field => cols[field] >= 0 ? row[cols[field]] : "";
    const rawCode = text(get("barcode"));
    if (isFooter(rawCode) || isFooter(get("description"))) {
      if (matrix) for (const location of mapping.locationCols) {
        const value = numeric(row[location.index]);
        if (value !== null && !Number.isNaN(value)) declared.set(location.name, value);
      }
      continue;
    }
    if (key(rawCode) === key(sheet.rows[header]?.[cols.barcode])) continue;
    if (rawCode) { currentBarcode = barcode(rawCode); currentDescription = text(get("description")); }
    const item = role === "serials" ? currentBarcode : barcode(rawCode);
    const origin = { ...sourceOf(sheet, index), ...metadata, report_date: reportDate };
    const meaningful = role === "serials" ? text(get("serial")) : text(get("description")) || text(get("model")) || text(get("srp")) || (matrix && mapping.locationCols.some(loc => text(row[loc.index])));
    if (!item) {
      if (meaningful) issue(out.issues, "ERROR", "MISSING_BARCODE", "Missing/unreadable barcode; row retained only in review.", origin, "", row.map(text).join(" | "));
      continue;
    }
    if (!rawCode && role !== "serials") continue;
    if (typeof get("barcode") === "number" && (!Number.isSafeInteger(get("barcode")) || String(get("barcode")).length > 15 || /e[+-]/i.test(String(get("barcode"))))) {
      issue(out.issues, "ERROR", "UNSAFE_BARCODE", "Numeric barcode may have lost digits; confirm the original text value.", origin, item);
      continue;
    }
    if (/^[#?]+$/.test(item) || /^#(?:N\/A|REF!|VALUE!|NAME\?)/i.test(item) || /^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(item)) {
      issue(out.issues, "ERROR", "UNREADABLE_BARCODE", "Barcode is an error or placeholder.", origin, item);
      continue;
    }
    const product = {
      barcode: item, description: text(get("description")), model: text(get("model")), brand: text(get("brand")),
      category: text(get("category")).replace(/^\*+\s*/, ""), subcategory: text(get("subcategory")),
      srp: role === "reference" ? null : readNumber(row, cols.srp, out.issues, origin, item, "SRP"), role, ...origin
    };
    if (role !== "serials" || rawCode) out.products.push(product);
    if (role === "inventory") {
      const entries = matrix ? mapping.locationCols.map(loc => ({ location: loc.name, at: loc.index }))
        : [{ location: text(get("location")), at: cols.total }];
      let rowSum = 0;
      let knownRow = true;
      for (const entry of entries) {
        let quantity = readNumber(row, entry.at, out.issues, origin, item, "Quantity", true);
        if (quantity === null && !text(row[entry.at]) && config.blankZero) quantity = 0;
        if (quantity !== null && quantity > 2147483647) {
          issue(out.issues, "ERROR", "QUANTITY_OUT_OF_RANGE", "Quantity exceeds Branchline's current integer range; left blank.", origin, item, text(row[entry.at]));
          quantity = null;
        }
        if (quantity === null) { blankQuantities++; knownRow = false; }
        if (!entry.location) issue(out.issues, "ERROR", "MISSING_LOCATION", "Stock row has no location.", origin, item);
        out.inventory.push({ barcode: item, location: entry.location, quantity, complete: !!config.complete, ...origin });
        if (quantity !== null) { rowSum += quantity; totals.set(entry.location, (totals.get(entry.location) || 0) + quantity); }
      }
      if (matrix && cols.total >= 0 && knownRow) {
        const value = numeric(get("total"));
        if (value !== null && value !== rowSum) issue(out.issues, "ERROR", "ROW_TOTAL_MISMATCH", "Location quantities do not match the product total.", origin, item, `Calculated ${rowSum}; reported ${value}`);
      }
    }
    if (role === "serials") {
      const serial = text(get("serial"));
      if (!serial) { issue(out.issues, "ERROR", "MISSING_SERIAL", "Serialized row has no serial number.", origin, item); continue; }
      const location = text(get("location"));
      if (!location) issue(out.issues, "ERROR", "MISSING_LOCATION", "Serial row has no location.", origin, item);
      if (typeof get("serial") === "number" && (!Number.isSafeInteger(get("serial")) || String(get("serial")).length > 15)) issue(out.issues, "ERROR", "UNSAFE_SERIAL", "Numeric serial may have lost digits.", origin, item, serial);
      const received = dateISO(get("received"), sheet.date1904, config.dateOrder || "mdy");
      if (!received) issue(out.issues, "ERROR", "INVALID_RECEIVED_DATE", "Received date is missing/invalid; left blank.", origin, item, text(get("received")));
      if (received && reportDate && received > reportDate.slice(0, 10)) issue(out.issues, "ERROR", "FUTURE_RECEIVED_DATE", "Received date is later than the report date.", origin, item, received);
      const buckets = Object.entries(BUCKETS).filter(([field, label]) => readNumber(row, cols[field], out.issues, origin, item, `${label} aging indicator`, true) > 0).map(([, label]) => label);
      if (buckets.length > 1) issue(out.issues, "WARNING", "AMBIGUOUS_AGING", "More than one reported aging bucket is marked.", origin, item, buckets.join("; "));
      out.serials.push({
        barcode: item, description: product.description || currentDescription, location, serial_number: serial,
        received_on: received, reported_age_months: readNumber(row, cols.age, out.issues, origin, item, "Reported age", true),
        reported_aging_bucket: text(get("bucket")) || (buckets.length === 1 ? buckets[0] : ""),
        complete: !!config.complete, ...origin
      });
    }
  }
  if (blankQuantities) issue(out.issues, "ERROR", "UNKNOWN_QUANTITIES", `${blankQuantities} quantities are blank/invalid. Blank is not assumed to mean zero.`, source);
  for (const [location, value] of declared) {
    if (value !== (totals.get(location) || 0)) issue(out.issues, "ERROR", "LOCATION_TOTAL_MISMATCH", "Calculated quantity differs from the location footer total.", source, "", `${location}: calculated ${totals.get(location) || 0}; reported ${value}`);
  }
  const records = role === "inventory" ? out.inventory.length : role === "serials" ? out.serials.length : out.products.length;
  if (!records) issue(out.issues, "WARNING", "EMPTY_TABLE", "No usable records found beneath this header.", source);
  if (!reportDate && ["inventory", "serials"].includes(role)) issue(out.issues, "ERROR", "MISSING_REPORT_DATE", "Set the source report date/time before this data can be import-ready.", source);
  out.sources.push({ ...source, status: "READ", records });
  return out;
}

const priority = { forecast: 0, memo: 1, reference: 2, products: 3, inventory: 4, serials: 5 };
function memoEligible(row, asOf) {
  return row.role !== "memo" || !!(dateISO(row.valid_from) && dateISO(row.valid_to) && row.valid_from <= row.valid_to && row.valid_from <= asOf);
}
function preference(a, b) {
  if (a.role === "memo" && b.role === "memo") {
    if (!text(a.brand) || !text(b.brand) || identity(a.brand) !== identity(b.brand)) return 0;
    const period = (b.valid_from || "").localeCompare(a.valid_from || "");
    if (period) return period;
    if (a.memo_prefix && a.memo_prefix === b.memo_prefix && a.memo_sequence !== null && b.memo_sequence !== null) return b.memo_sequence - a.memo_sequence;
    return 0;
  }
  const rank = row => row.role === "memo" ? -2 : row.role === "reference" ? -1 : priority[row.role];
  return rank(a) - rank(b) || (Number(b.forecast_year) || 0) - (Number(a.forecast_year) || 0)
    || (Date.parse(b.report_date) || 0) - (Date.parse(a.report_date) || 0);
}
function leaders(rows) {
  return rows.filter(row => !rows.some(other => preference(other, row) < 0));
}
function descriptionScore(value) {
  const tokens = new Set(text(value).toUpperCase().split(/\s+/));
  return tokens.size * 100 + Math.min(text(value).length, 99);
}
function descriptionClassification(value) {
  const description = identity(value);
  const accessory = /\b(?:BAG|BACKPACK|SLEEVE|CARRYING|CASE|COVER|CHARGER|ADAPTER|GASKET|HINGE|SHELF|HANDLE|ACCESSORY|SPARE|PARTS?)\b/.test(description)
    || /\b(?:LAPTOP|MONITOR|TV|SPEAKER)\s+STAND\b/.test(description);
  if (/\bCHEST\s+FREEZER\b/.test(description)) return { category: "FREEZER", subcategory: "CHEST FREEZER" };
  if (/\bFREEZER\b/.test(description) && !accessory) return { category: "FREEZER", subcategory: "" };
  if (/\b(?:LAPTOP|NOTEBOOK)\b/.test(description) && !accessory) {
    return { category: "LAPTOPS", subcategory: /\bGAMING\s+LAPTOP\b/.test(description) ? "GAMING LAPTOP" : "CONSUMER LAPTOP" };
  }
  if (/\b(?:AIRCON|AIR\s+CONDITIONER)\b/.test(description) && !accessory) {
    const subcategory = /\bWINDOW\s+TYPE\b/.test(description) ? "WINDOW TYPE"
      : /\bSPLIT\s+TYPE\b/.test(description) ? "SPLIT TYPE"
        : /\bFLOOR\s+STANDING\b/.test(description) ? "FLOOR STANDING" : "";
    return { category: "AIRCON", subcategory };
  }
  if (/\bREFRIGERATOR\b/.test(description) && !accessory) {
    const subcategory = /\bSIDE\s+BY\s+SIDE\b/.test(description) ? "SIDE BY SIDE"
      : /\bTWO\s+DOOR\b/.test(description) ? "TWO DOOR"
        : /\bMULTI\s+DOOR\b/.test(description) ? "MULTI DOOR" : "";
    return { category: "REFRIGERATOR", subcategory };
  }
  if (/\b(?:WASHING\s+MACHINE|WASHER)\b/.test(description) && !accessory) {
    const subcategory = /\bTOP\s+LOAD\b/.test(description) ? "TOP LOAD WASHER"
      : /\bFRONT\s+LOAD\b/.test(description) ? "FRONT LOAD WASHER"
        : /\bTWIN\s+TUB\b/.test(description) ? "TWIN TUB"
          : /\bSINGLE\s+TUB\b/.test(description) ? "SINGLE TUB" : "";
    return { category: "WASHER & DRYER", subcategory };
  }
  if (/\b(?:TV|TELEVISION)\b/.test(description) && !accessory) {
    const subcategory = /\bSMART\b/.test(description) ? "SMART" : /\bUHD\b/.test(description) ? "UHD" : "";
    return { category: "TV", subcategory };
  }
  return null;
}
function classificationText(value) {
  return text(value).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
}
function containsClassificationPhrase(description, phrase) {
  return ` ${classificationText(description)} `.includes(` ${classificationText(phrase)} `);
}
function descriptionHead(item, brandNames) {
  const tokens = classificationText(item.description).split(" ").filter(Boolean);
  const brand = classificationText(item.brand).split(" ").filter(Boolean);
  if (brand.length && brand.every((token, index) => tokens[index] === token)) tokens.splice(0, brand.length);
  else {
    const matched = brandNames.find(name => {
      const parts = name.split(" ");
      return parts.every((token, index) => tokens[index] === token);
    });
    if (matched) tokens.splice(0, matched.split(" ").length);
  }
  const ignored = new Set(["FREE", "PROMO", "GIFT", "WITH", "FOR", "AND", "THE", "OF", "BY"]);
  const head = [];
  for (const token of tokens) {
    if (/\d/.test(token)) break;
    if (token.length < 2 || ignored.has(token)) continue;
    head.push(token);
    if (head.length === 4) break;
  }
  return head.join(" ");
}
function dominantClassification(rows, field, minimum = 3) {
  const counts = new Map();
  for (const row of rows) {
    const value = text(row[field]);
    if (value) counts.set(identity(value), { value, count: (counts.get(identity(value))?.count || 0) + 1 });
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0);
  return total >= minimum
    && (ranked.length === 1 || ranked[0].count > ranked[1].count)
    ? { value: ranked[0].value, count: total, precision: ranked[0].count / total, votes: ranked[0].count }
    : null;
}
const NON_PRODUCT_CATEGORIES = new Set(["FREE", "BUNDLE", "UNASSIGNED", "OTHERS", "SERVICES", "SERVICE & MAINT."]);
function learnedPhraseRules(products, field, category = "") {
  const phrases = new Map();
  for (const item of products) {
    if (!text(item.category) || NON_PRODUCT_CATEGORIES.has(identity(item.category))
      || category && identity(item.category) !== identity(category)
      || item.description_resolution === "ASSEMBLED_FROM_FIELDS"
      || String(item[`${field}_source`] || "").startsWith("Description inference: ")
      || String(item[`${field}_source`] || "").startsWith("Description pattern inference: ")) continue;
    const values = field === "category" ? [item.category, item.subcategory] : [item[field]];
    for (const value of values) {
      const phrase = classificationText(value);
      if (phrase.length < 3 || field === "subcategory" && identity(value) === identity(item.category)) continue;
      if (!phrases.has(phrase)) phrases.set(phrase, []);
    }
  }
  const rules = [];
  for (const phrase of phrases.keys()) {
    const evidence = products.filter(item => text(item.category) && !NON_PRODUCT_CATEGORIES.has(identity(item.category))
      && (!category || identity(item.category) === identity(category))
      && item.description_resolution !== "ASSEMBLED_FROM_FIELDS"
      && !String(item[`${field}_source`] || "").startsWith("Description inference: ")
      && !String(item[`${field}_source`] || "").startsWith("Description pattern inference: ")
      && containsClassificationPhrase(item.description, phrase));
    if (field === "category") {
      const inferredCategory = dominantClassification(evidence, "category");
      if (inferredCategory) rules.push({ phrase, value: inferredCategory.value, precision: inferredCategory.precision, support: inferredCategory.count });
      continue;
    }
    const inferredSubcategory = dominantClassification(evidence, "subcategory");
    if (inferredSubcategory) {
      rules.push({ phrase, category, value: inferredSubcategory.value, precision: inferredSubcategory.precision, support: inferredSubcategory.count });
    }
  }
  return rules;
}
function selectPhraseRule(rules, description) {
  const matching = rules.filter(rule => containsClassificationPhrase(description, rule.phrase))
    .sort((a, b) => b.phrase.split(" ").length - a.phrase.split(" ").length
      || b.precision - a.precision || b.support - a.support);
  if (!matching.length) return null;
  const specificity = matching[0].phrase.split(" ").length;
  const top = matching.filter(rule => rule.phrase.split(" ").length === specificity);
  if (new Set(top.map(rule => identity(rule.value))).size !== 1) return null;
  return top[0];
}
function directDescriptionCategory(description, categories) {
  if (/\b(?:WALL\s+BRACKET|(?:TV|MONITOR|LAPTOP|SPEAKER)\s+STAND|CARRYING\s+BAG)\b/i.test(description)) return null;
  const matches = categories.filter(category => containsClassificationPhrase(description, category))
    .sort((a, b) => classificationText(b).length - classificationText(a).length);
  if (!matches.length) return null;
  const longest = classificationText(matches[0]).length;
  const top = matches.filter(category => classificationText(category).length === longest);
  return new Set(top.map(identity)).size === 1 ? top[0] : null;
}
function references(records) {
  return [...new Set(records.map(row => `${row.source_file} :: ${row.source_sheet} :: row ${row.source_row}`))].join("\n");
}
export function consolidate(parts, mappings = [], now = new Date().toISOString(), asOf = now.slice(0, 10)) {
  if (!dateISO(asOf)) throw new Error("A valid pricing as-of date is required.");
  const issues = parts.flatMap(part => part.issues);
  const sources = parts.flatMap(part => part.sources);
  const groups = new Map();
  for (const original of parts.flatMap(part => part.products)) {
    const value = canonicalBrand(original.brand, original.description);
    const record = value !== original.brand ? { ...original, brand: value } : original;
    const id = identity(record.barcode);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(record);
  }
  const products = [], audit = [];
  const explicitBrands = new Map(CONFIRMED_BRANDS.filter(brand => !CONDITIONAL_BRANDS.has(brand)).map(brand =>
    [brand, { brand: canonicalBrand(brand), source: `User-confirmed brand reference: ${brand}${canonicalBrand(brand) !== brand ? ` -> ${canonicalBrand(brand)}` : ""}` }]));
  for (const canonical of Object.values(BRAND_ALIASES).flat()) {
    explicitBrands.set(identity(canonical), { brand: canonical, source: `User-confirmed canonical brand: ${canonical}` });
  }
  for (const records of groups.values()) for (const row of records) {
    if (!text(row.brand) || CONDITIONAL_BRANDS.has(identity(row.brand)) || !memoEligible(row, asOf)) continue;
    const id = identity(row.brand);
    if (!explicitBrands.has(id) || explicitBrands.get(id).source.startsWith("User-confirmed")) {
      explicitBrands.set(id, { brand: row.brand, source: references([row]) });
    }
  }
  const brandNames = [...explicitBrands.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const classificationConflictsByProduct = new Map();
  const descriptionSourceByProduct = new Map();
  for (const records of groups.values()) {
    const sorted = [...records].sort((a, b) => priority[a.role] - priority[b.role] || preference(a, b));
    const item = { barcode: sorted[0].barcode };
    const classificationConflicts = new Set();
    for (const field of ["brand", "category", "subcategory", "model"]) {
      const candidates = sorted.filter(row => text(row[field]) && memoEligible(row, asOf));
      const top = leaders(candidates);
      const unresolved = new Set(top.map(row => identity(row[field]))).size > 1;
      if (unresolved && ["category", "subcategory"].includes(field)) classificationConflicts.add(field);
      item[field] = unresolved ? "" : top[0]?.[field] || "";
      item[`${field}_source`] = !unresolved && top.length ? references(top) : "";
      const values = new Set(candidates.map(row => identity(row[field])));
      if (values.size > 1) issue(issues, unresolved ? "ERROR" : "INFO", unresolved ? "CLASSIFICATION_CONFLICT" : "CLASSIFICATION_AUTO_RESOLVED",
        unresolved ? `Equally ranked ${field} values disagree; left blank for review.` : `${field} differences automatically resolved by memo/reference/forecast priority.`,
        sorted[0], item.barcode, candidates.map(row => `${row[field]} [${row.memo_number || row.source_file}; ${row.valid_from || row.forecast_year || ""}]`).join(" | "));
    }
    const descriptions = sorted.filter(row => text(row.description)).sort((a, b) => descriptionScore(b.description) - descriptionScore(a.description));
    item.description = descriptions[0]?.description || "";
    item.description_resolution = "";
    item.description_source = descriptions.length ? references([descriptions[0]]) : "";
    classificationConflictsByProduct.set(identity(item.barcode), classificationConflicts);
    descriptionSourceByProduct.set(identity(item.barcode), descriptions[0] || sorted[0]);
    item.brand_resolution = "";
    if (!item.brand && !records.some(row => text(row.brand) && memoEligible(row, asOf))) {
      const description = identity(item.description);
      const matched = brandNames.filter(brand => brand !== "AMERICAN")
        .find(brand => description.startsWith(`${brand} `));
      if (matched) {
        const evidence = explicitBrands.get(matched);
        item.brand = evidence.brand;
        item.brand_resolution = "DESCRIPTION_MATCH";
        item.brand_source = `Description match: ${item.description_source}\nKnown brand: ${evidence.source}`;
        issue(issues, "INFO", "BRAND_INFERRED", "Missing brand recovered from the longest exact known-brand prefix in the description (uploaded or user-confirmed); explicit brands are never replaced.", descriptions[0], item.barcode, item.brand);
      }
    }
    if (!item.description && text(item.model) && !/^[*?#-]+$/.test(text(item.model)) && (item.brand || item.category)) {
      const fields = ["brand", "category", "model"].filter(field => text(item[field]));
      const seen = new Set();
      item.description = fields.map(field => text(item[field])).filter(value => {
        const id = identity(value);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).join(" ");
      item.description_resolution = "ASSEMBLED_FROM_FIELDS";
      item.description_source = fields.map(field => `${field}: ${item[`${field}_source`]}`).join("\n");
      issue(issues, "INFO", "DESCRIPTION_ASSEMBLED", "No source description was supplied. Built a fallback from the selected brand/category/model without adding specifications.", sorted[0], item.barcode, item.description);
    }
    if (item.description && item.description_resolution !== "ASSEMBLED_FROM_FIELDS" && !classificationConflicts.has("category")) {
      const inferred = descriptionClassification(item.description);
      if (inferred) {
        const missingCategory = !item.category;
        const canInferSubcategory = !classificationConflicts.has("subcategory")
          && !item.subcategory
          && (missingCategory || identity(item.category) === inferred.category);
        if (missingCategory) {
          item.category = inferred.category;
          item.category_source = `Description inference: ${item.description_source}`;
        }
        if (canInferSubcategory && inferred.subcategory) {
          item.subcategory = inferred.subcategory;
          item.subcategory_source = `Description inference: ${item.description_source}`;
        }
        if (missingCategory || canInferSubcategory && inferred.subcategory) {
          issue(issues, "INFO", "CLASSIFICATION_INFERRED_FROM_DESCRIPTION",
            "A missing classification was inferred from a recognized product type in the selected source description; supplied classifications are never replaced.",
            descriptions[0], item.barcode, `Category: ${item.category || "(blank)"}; subcategory: ${item.subcategory || "(blank)"}`);
        }
      }
    }
    const suppliedPrices = sorted.filter(row => row.role !== "reference" && row.srp !== null && row.srp !== undefined);
    const applicable = suppliedPrices.filter(row => memoEligible(row, asOf));
    const topPrices = leaders(applicable);
    const prices = [...topPrices, ...applicable.filter(row => !topPrices.includes(row))];
    item.srp = prices[0]?.srp ?? null;
    item.srp_source = prices.length ? references([prices[0]]) : "";
    item.srp_basis = prices.length ? `${prices[0].role.toUpperCase()}${prices[0].forecast_year ? ` ${prices[0].forecast_year}` : ""}` : "";
    item.srp_reference_year = prices[0]?.forecast_year ?? null;
    item.srp_report_date = prices[0]?.report_date || "";
    item.srp_valid_from = prices[0]?.valid_from || "";
    item.srp_valid_to = prices[0]?.valid_to || "";
    item.srp_memo_number = prices[0]?.memo_number || "";
    item.srp_as_of = asOf;
    const priceValues = new Set(prices.map(row => row.srp));
    const unresolvedPrice = new Set(topPrices.map(row => row.srp)).size > 1;
    item.srp_conflict = unresolvedPrice ? "YES" : "";
    item.srp_resolution = unresolvedPrice ? "REVIEW_REQUIRED" : priceValues.size > 1 ? "AUTO_RESOLVED" : "";
    if (priceValues.size > 1) issue(issues, unresolvedPrice ? "ERROR" : "INFO", unresolvedPrice ? "SRP_CONFLICT" : "SRP_AUTO_RESOLVED",
      unresolvedPrice ? "Top-ranked SRPs disagree; review required." : "SRP differences automatically resolved by memo period/sequence or forecast year/report date.",
      prices[0], item.barcode, prices.map(row => `${row.srp} [${row.memo_number || row.source_file}, period ${row.valid_from || "n/a"}, year ${row.forecast_year || "n/a"}, report ${row.report_date || "unknown"}, row ${row.source_row}]`).join(" | "));
    const excludedPrices = suppliedPrices.filter(row => !applicable.includes(row));
    if (excludedPrices.length) issue(issues, "INFO", "MEMO_PRICE_NOT_APPLICABLE", "Future or invalid/undated memo prices were not selected. Ended memos remain effective until superseded.", excludedPrices[0], item.barcode, excludedPrices.map(row => `${row.srp} [${row.source_file}; ${row.valid_from || "unknown"} to ${row.valid_to || "unknown"}]`).join(" | "));
    if (unresolvedPrice) {
      item.srp = null; item.srp_source = ""; item.srp_basis = "UNRESOLVED_TIE";
      item.srp_reference_year = null; item.srp_report_date = ""; item.srp_valid_from = ""; item.srp_valid_to = "";
      item.srp_memo_number = "";
      issue(issues, "ERROR", "SRP_ORDER_UNRESOLVED", "Conflicting prices have equal/unknown recency; no price was selected.", prices[0], item.barcode);
    }
    item.sources = references(records);
    products.push(item);
    if (records.length > 1) audit.push({ barcode: item.barcode, source_records: records.length, preferred_srp: item.srp, srp_conflict: item.srp_conflict, resolution: item.srp_resolution || "Classifications: effective memo then sales reference then forecast; most detailed source description", sources: item.sources });
  }
  const eligiblePatternProducts = products.filter(item => item.description
    && item.description_resolution !== "ASSEMBLED_FROM_FIELDS"
    && !NON_PRODUCT_CATEGORIES.has(identity(item.category))
    && !String(item.category_source || "").startsWith("Description inference: ")
    && !String(item.category_source || "").startsWith("Description pattern inference: ")
    && !classificationConflictsByProduct.get(identity(item.barcode))?.has("category"));
  const directCategoryLabels = [...new Map(eligiblePatternProducts
    .filter(item => text(item.category))
    .map(item => [identity(item.category), item.category])).values()];
  const categoryPhraseRules = learnedPhraseRules(eligiblePatternProducts, "category");
  const categoryHeads = new Map();
  for (const item of eligiblePatternProducts) {
    const head = descriptionHead(item, brandNames);
    if (!head) continue;
    if (!categoryHeads.has(head)) categoryHeads.set(head, []);
    categoryHeads.get(head).push(item);
  }
  const categoryHeadRules = new Map();
  for (const [head, evidence] of categoryHeads) {
    const classification = dominantClassification(evidence, "category");
    if (classification) categoryHeadRules.set(head, classification.value);
  }
  const subcategoryPhraseRules = new Map();
  for (const category of new Set(eligiblePatternProducts.map(item => item.category).filter(Boolean))) {
    subcategoryPhraseRules.set(identity(category), learnedPhraseRules(eligiblePatternProducts, "subcategory", category));
  }
  const globalSubcategoryPhraseRules = learnedPhraseRules(eligiblePatternProducts, "subcategory");
  const subcategoryHeads = new Map();
  for (const item of eligiblePatternProducts) {
    if (!item.subcategory) continue;
    const head = descriptionHead(item, brandNames);
    if (head.split(" ").length < 2) continue;
    const key = `${identity(item.category)}\0${head}`;
    if (!subcategoryHeads.has(key)) subcategoryHeads.set(key, []);
    subcategoryHeads.get(key).push(item);
  }
  const subcategoryHeadRules = new Map();
  for (const [key, evidence] of subcategoryHeads) {
    const classification = dominantClassification(evidence, "subcategory");
    if (classification) subcategoryHeadRules.set(key, classification.value);
  }
  for (const item of products) {
    if (!item.description || item.description_resolution === "ASSEMBLED_FROM_FIELDS") continue;
    const conflicts = classificationConflictsByProduct.get(identity(item.barcode));
    const source = descriptionSourceByProduct.get(identity(item.barcode));
    let inferredCategory = "";
    let categoryRule = null;
    if (!item.category && !conflicts?.has("category")) {
      const directCategory = directDescriptionCategory(item.description, directCategoryLabels);
      if (directCategory) inferredCategory = directCategory;
      else {
        categoryRule = selectPhraseRule(categoryPhraseRules, item.description);
        inferredCategory = categoryRule?.value || categoryHeadRules.get(descriptionHead(item, brandNames)) || "";
      }
      if (inferredCategory) {
        item.category = inferredCategory;
        item.category_source = `Description ${directCategory ? "" : "pattern "}inference: ${item.description_source}`;
      }
    }
    let inferredSubcategory = "";
    if (!item.subcategory && !conflicts?.has("subcategory")) {
      const categoryRules = item.category ? subcategoryPhraseRules.get(identity(item.category)) || [] : [];
      const subcategoryRule = selectPhraseRule(categoryRules, item.description)
        || selectPhraseRule(globalSubcategoryPhraseRules, item.description);
      const headRule = item.category
        ? subcategoryHeadRules.get(`${identity(item.category)}\0${descriptionHead(item, brandNames)}`) || ""
        : "";
      inferredSubcategory = subcategoryRule?.value || headRule;
      if (inferredSubcategory) {
        item.subcategory = inferredSubcategory;
        item.subcategory_source = `Description pattern inference: ${item.description_source}`;
      }
    }
    if (inferredCategory || inferredSubcategory) {
      issue(issues, "INFO", "CLASSIFICATION_INFERRED_FROM_DESCRIPTION",
        "A missing classification was inferred from a matching category label or the most common existing classification for a repeated description phrase or pattern; supplied classifications and unresolved conflicts are never replaced.",
        source, item.barcode,
        `Category: ${item.category || "(blank)"}${categoryRule ? ` (matched "${categoryRule.phrase}", ${categoryRule.support} examples)` : ""}; subcategory: ${item.subcategory || "(blank)"}`);
    }
    for (const field of ["brand", "description", "category", "srp"]) {
      if (item[field] === "" || item[field] === null) issue(issues, "WARNING", "MISSING_PRODUCT_FIELD", `${field} is missing and remains blank.`, source, item.barcode);
    }
  }
  const locations = [];
  const aliases = new Map();
  function register(raw, explicit = {}) {
    const parsed = locationParts(raw);
    const id = identity(explicit.location_name || parsed.name);
    const existing = aliases.get(identity(raw)) || aliases.get(id) || (parsed.code && aliases.get(parsed.code));
    if (existing) {
      const newCode = explicit.location_code || parsed.code;
      if (newCode && existing.location_code && identity(newCode) !== identity(existing.location_code)) issue(issues, "ERROR", "LOCATION_CODE_CONFLICT", "One location has different codes.", {}, "", `${raw}: ${existing.location_code} / ${newCode}`);
      else if (newCode) existing.location_code = identity(newCode);
      aliases.set(identity(raw), existing);
      aliases.set(id, existing);
      if (parsed.code) aliases.set(parsed.code, existing);
      return existing;
    }
    const loc = { location_code: identity(explicit.location_code || parsed.code), location_name: text(explicit.location_name || parsed.name), location_type: explicit.location_type || (/warehouse/i.test(parsed.name) ? "WAREHOUSE" : "UNCONFIRMED"), source_names: raw };
    locations.push(loc); aliases.set(identity(raw), loc); aliases.set(id, loc);
    if (loc.location_code) aliases.set(loc.location_code, loc);
    return loc;
  }
  for (const mapping of mappings) if (text(mapping.source_name)) register(mapping.source_name, mapping);
  const rawStock = parts.flatMap(part => part.inventory);
  const rawSerials = parts.flatMap(part => part.serials);
  for (const record of [...rawSerials, ...rawStock]) if (record.location) {
    const loc = register(record.location);
    if (!loc.source_names.split("\n").includes(record.location)) loc.source_names += `\n${record.location}`;
  }
  const canonicalProducts = new Map(products.map(row => [identity(row.barcode), row.barcode]));
  const withLocation = row => {
    const loc = aliases.get(identity(row.location));
    return { ...row, barcode: canonicalProducts.get(identity(row.barcode)) || row.barcode, location_code: loc?.location_code || "", location_name: loc?.location_name || row.location };
  };
  const inventory = [], serials = [], stockSeen = new Map(), serialSeen = new Map(), serialOwners = new Map();
  const locIdentity = row => identity(row.location_name);
  for (const raw of rawStock) {
    const row = withLocation(raw);
    const id = `${identity(row.barcode)}\0${locIdentity(row)}`;
    if (stockSeen.has(id)) {
      const previous = stockSeen.get(id);
      issue(issues, previous.quantity === row.quantity && previous.report_date === row.report_date ? "WARNING" : "ERROR", "DUPLICATE_STOCK", "Repeated stock snapshot; kept first, never summed.", row, row.barcode,
        `Kept quantity ${previous.quantity ?? "(blank)"} at ${previous.report_date}; other quantity ${row.quantity ?? "(blank)"} at ${row.report_date}.\n${references([previous, row])}`);
      continue;
    }
    stockSeen.set(id, row); inventory.push(row);
  }
  for (const raw of rawSerials) {
    const row = withLocation(raw);
    const serialKey = `${identity(row.barcode)}\0${identity(row.serial_number)}`;
    const id = `${serialKey}\0${locIdentity(row)}`;
    if (serialSeen.has(id)) {
      const previous = serialSeen.get(id);
      const same = ["received_on", "reported_age_months", "reported_aging_bucket", "report_date"].every(field => previous[field] === row[field]);
      issue(issues, same ? "WARNING" : "ERROR", "DUPLICATE_SERIAL", "Duplicate serial unit removed; source details retained in review.", row, row.barcode,
        [previous, row].map(unit => `${unit.serial_number}: received ${unit.received_on || "(blank)"}, age ${unit.reported_age_months ?? "(blank)"}, bucket ${unit.reported_aging_bucket || "(blank)"}, report ${unit.report_date}\n${references([unit])}`).join("\n"));
      continue;
    }
    const owners = serialOwners.get(identity(row.serial_number)) || [];
    if (owners.some(previous => identity(previous.barcode) === identity(row.barcode) && locIdentity(previous) !== locIdentity(row))) issue(issues, "ERROR", "SERIAL_MULTIPLE_LOCATIONS", "The same product/serial is reported at multiple locations.", row, row.barcode, references([...owners, row]));
    if (owners.some(previous => identity(previous.barcode) !== identity(row.barcode))) issue(issues, "WARNING", "SERIAL_SHARED_BARCODES", "Serial text appears under different barcodes; units were not merged.", row, row.barcode, references([...owners, row]));
    owners.push(row); serialOwners.set(identity(row.serial_number), owners);
    serialSeen.set(id, row); serials.push(row);
  }
  const serializedCodes = new Set(serials.map(row => identity(row.barcode)));
  const units = new Map();
  for (const row of serials) {
    const id = `${identity(row.barcode)}\0${locIdentity(row)}`;
    units.set(id, (units.get(id) || 0) + 1);
    if (!stockSeen.has(id)) issue(issues, "ERROR", "SERIAL_WITHOUT_STOCK", "Serial has no matching location stock record.", row, row.barcode, row.location_name);
  }
  for (const row of inventory) {
    const count = units.get(`${identity(row.barcode)}\0${locIdentity(row)}`) || 0;
    row.serial_count = count;
    row.serialized = serializedCodes.has(identity(row.barcode)) ? "YES" : "UNKNOWN";
    if (row.serialized === "YES" && row.quantity !== null && count !== row.quantity) issue(issues, "ERROR", "SERIAL_QUANTITY_MISMATCH", "Known serialized product quantity differs from available serial count.", row, row.barcode, `${row.location_name}: stock ${row.quantity}, serials ${count}`);
  }
  const coverage = [];
  const codeOwners = new Map();
  for (const loc of locations) {
    if (!loc.location_code) issue(issues, "ERROR", "UNMAPPED_LOCATION", "Location code is missing. Supply a confirmed mapping.", {}, "", loc.location_name);
    else {
      if (!/^[A-Z][A-Z0-9]{1,19}$/.test(loc.location_code)) issue(issues, "ERROR", "INVALID_LOCATION_CODE", "Location codes must have 2-20 letters/numbers and start with a letter.", {}, "", loc.location_code);
      const owner = codeOwners.get(loc.location_code);
      if (owner && identity(owner) !== identity(loc.location_name)) issue(issues, "ERROR", "LOCATION_CODE_CONFLICT", "One source code is assigned to different locations.", {}, "", `${loc.location_code}: ${owner} / ${loc.location_name}`);
      codeOwners.set(loc.location_code, loc.location_name);
    }
    const stock = inventory.filter(row => locIdentity(row) === identity(loc.location_name));
    const serial = serials.filter(row => locIdentity(row) === identity(loc.location_name));
    coverage.push({
      location_code: loc.location_code, location_name: loc.location_name,
      quantity_rows: stock.length, serial_rows: serial.length,
      quantity_complete: stock.length && stock.every(row => row.complete) ? "YES" : "NO",
      serials_complete: serial.length && serial.every(row => row.complete) ? "YES" : "NO",
      stock_report_dates: [...new Set(stock.map(row => row.report_date))].join("\n"),
      serial_report_dates: [...new Set(serial.map(row => row.report_date))].join("\n")
    });
  }
  for (const entry of coverage) {
    if (entry.quantity_rows && entry.quantity_complete !== "YES") issue(issues, "ERROR", "INCOMPLETE_STOCK_COVERAGE", "Stock completeness has not been confirmed for this location.", {}, "", entry.location_name);
    if (entry.quantity_rows && entry.serials_complete !== "YES") issue(issues, "WARNING", "UNCONFIRMED_SERIAL_COVERAGE", "Serial coverage is unconfirmed; absence of serials does not prove nonserialized stock.", {}, "", entry.location_name);
  }
  if (!products.length && !inventory.length && !serials.length) issue(issues, "ERROR", "NO_DATA", "No usable data was extracted. Review mappings, excluded sheets and file failures.");
  products.sort((a, b) => a.barcode.localeCompare(b.barcode));
  const errors = issues.filter(row => row.severity === "ERROR").length;
  const manifest = [
    { property: "format", value: "BRANCHLINE_EXTRACTOR_WORKBOOK" },
    { property: "format_version", value: FORMAT_VERSION },
    { property: "generated_at", value: now },
    { property: "review_status", value: errors ? "REVIEW_REQUIRED" : "VALIDATED_FOR_EXTRACTOR_RULES" },
    { property: "branchline_compatibility", value: "REQUIRES_FUTURE_UNIFIED_IMPORTER; NOT FOR CURRENT IMPORTERS" },
    { property: "inventory_mode", value: "PROPOSED_REPLACEMENT_PER_CONFIRMED_LOCATION; NEVER ADD SERIAL COUNTS" },
    { property: "blank_fields", value: "MISSING; NOT ZERO AND NOT AN INSTRUCTION TO CLEAR EXISTING DATA" },
    { property: "source_priority", value: "SUPPLIED CLASSIFICATIONS: EFFECTIVE MEMO (SAME BRAND/BARCODE; PERIOD START DESC, SAME-PREFIX SEQUENCE DESC) > SALES DATABASE REFERENCE > FORECAST YEAR DESC, REPORT DATE DESC > OTHER; REFERENCE NEVER SUPPLIES CURRENT SRP/STOCK; ZERO IS PRESENT" },
    { property: "memo_expiry_policy", value: "START DATE REACHED; RETAIN UPDATES AFTER END DATE UNTIL SUPERSEDED" },
    { property: "confirmed_brand_reference", value: CONFIRMED_BRANDS.join(", ") },
    { property: "brand_labels_pending_match_approval", value: "" },
    { property: "description_fallback", value: "ONLY WHEN NO SOURCE DESCRIPTION: SELECTED BRAND + CATEGORY + MODEL; REQUIRES A USABLE MODEL AND BRAND OR CATEGORY; AUDITED AS ASSEMBLED_FROM_FIELDS" },
    { property: "pricing_as_of", value: asOf },
    { property: "product_count", value: products.length },
    { property: "inventory_rows", value: inventory.length },
    { property: "serial_rows", value: serials.length },
    { property: "error_count", value: errors }
  ];
  const evidence = parts.flatMap(part => ["products", "inventory", "serials", "issues", "sources"].flatMap(dataset =>
    part[dataset].map(record => ({ dataset, record_json: JSON.stringify(record) }))));
  return { products, inventory, serials, locations, coverage, issues, audit, sources, manifest, evidence };
}
