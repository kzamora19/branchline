import { FIELDS, key, numeric, text } from "./core.mjs";

const TAG_HEADERS = ["tag", "tagthis", "cashtag", "cashtagthis", "nowprice", "promoprice", "promotionprice", "bundlesellingprice"];
const DATE_HEADERS = ["startdate", "enddate", "validfrom", "validto", "period", "periodcovered", "effectivity", "expirydate"];

export function promotionSheetCandidates(rows, sourceName, sheetName, sheetNumber) {
  if (!Array.isArray(rows) || !text(sourceName) || !text(sheetName) ||
      !Number.isInteger(sheetNumber) || sheetNumber < 1 || sheetNumber > 100) {
    throw new Error("The promotion sheet source is invalid.");
  }
  const fields = { barcode: FIELDS.barcode, description: FIELDS.description, memoSrp: FIELDS.srp, tagPrice: TAG_HEADERS };
  let header = -1, columns;
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const keys = (rows[i] || []).map(key);
    if (!keys.some(value => fields.barcode.includes(value)) || !keys.some(value => fields.description.includes(value))) continue;
    const matches = Object.fromEntries(Object.entries(fields).map(([field, aliases]) =>
      [field, keys.flatMap((value, index) => aliases.includes(value) ? [index] : [])]));
    if (Object.values(matches).some(indices => indices.length > 1)) {
      throw new Error(`${sourceName}, sheet ${sheetName}: duplicate recognized column headings need review.`);
    }
    header = i;
    columns = Object.fromEntries(Object.entries(matches).map(([field, indices]) => [field, indices[0] ?? -1]));
    break;
  }
  if (header < 0) throw new Error(`${sourceName}, sheet ${sheetName}: barcode and description headings were not recognized.`);
  const result = [];
  const dateColumns = (rows[header] || []).flatMap((value, index) => DATE_HEADERS.includes(key(value)) ? [index] : []);
  for (let i = header + 1; i < rows.length; i++) {
    const values = rows[i] || [];
    if (!values.some(value => text(value))) continue;
    const code = text(values[columns.barcode]);
    const description = text(values[columns.description]);
    const readPrice = column => column < 0 ? null : numeric(values[column]);
    const memoSrp = readPrice(columns.memoSrp), tagPrice = readPrice(columns.tagPrice);
    const validPrice = value => value === null || Number.isFinite(value) && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
    const warnings = [];
    if (!code) warnings.push("Barcode is missing.");
    if (/^\d{16,}$/.test(code)) warnings.push("Long numeric barcode may have lost precision in the spreadsheet.");
    if (!description) warnings.push("Description is missing.");
    if (dateColumns.some(index => text(values[index]))) warnings.push("Promotion dates in this sheet need review.");
    if (!validPrice(memoSrp)) warnings.push("Memo SRP is invalid.");
    if (!validPrice(tagPrice)) warnings.push("Tag/now price is invalid.");
    const excerpt = `${sheetName}, row ${i + 1}: ${values.map(text).join(" | ")}`;
    if (excerpt.length > 4000) warnings.push("Source row is too long to save without review.");
    result.push({
      barcode: code, description, sourceName, sourcePage: sheetNumber, sourceExcerpt: excerpt.slice(0, 4000),
      memoSrp: validPrice(memoSrp) ? memoSrp : null, tagPrice: validPrice(tagPrice) ? tagPrice : null,
      validFrom: "", validTo: "", warnings,
    });
  }
  return result;
}
