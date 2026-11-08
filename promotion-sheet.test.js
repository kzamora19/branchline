"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("promotion sheets recognize named prices and flag uncertain data", async () => {
  const { promotionSheetCandidates } = await import("./import-engine/promotion-sheet.mjs");
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const rows = promotionSheetCandidates([
    ["Memo"],
    ["Item Code", "Item Name", "SRP", "TAG THIS", "12 MOS", "Start Date"],
    ["00123456", "Fan", "1,000.00", "900.00", "100.00", ""],
    ["", "Missing barcode", "100", "90", "", ""],
    ["12347", "Dated", "100", "90", "", "2026-01-01"],
    ["12348", "Bad price", "100", "not a price", "", ""],
  ], "offers.xlsx", "Promotions", 1);
  assert.equal(rows[0].barcode, "00123456");
  assert.equal(rows[0].tagPrice, 900);
  assert.equal(rows[0].memoSrp, 1000);
  assert.match(rows[0].sourceExcerpt, /Promotions, row 3/);
  assert.match(rows[1].warnings.join(" "), /Barcode is missing/);
  assert.match(rows[2].warnings.join(" "), /dates.*review/);
  assert.match(rows[3].warnings.join(" "), /price is invalid/);
  const prepared = preparePromotionImport(rows, [{ barcode: "00123456", srp: 1000 }], []);
  assert.deepEqual(prepared.map(row => row.ready), [true, false, false, false]);
});

test("promotion sheets do not guess installment prices or ambiguous columns", async () => {
  const { promotionSheetCandidates } = await import("./import-engine/promotion-sheet.mjs");
  const rows = promotionSheetCandidates([
    ["Barcode", "Description", "SRP", "12 MOS"],
    ["12345", "Fan", 100, 8],
  ], "offer.csv", "Sheet1", 1);
  assert.equal(rows[0].tagPrice, null);
  assert.throws(() => promotionSheetCandidates([["Barcode", "Item Code", "Description"]], "offer.csv", "Sheet1", 1), /duplicate/);
  assert.throws(() => promotionSheetCandidates([["Product", "Price"]], "offer.csv", "Sheet1", 1), /not recognized/);
});

test("promotion sheets accept only unambiguous valid ISO date ranges", async () => {
  const { promotionSheetCandidates } = await import("./import-engine/promotion-sheet.mjs");
  const rows = promotionSheetCandidates([
    ["Barcode", "Description", "TAG THIS", "Start date", "End date"],
    ["12345", "Fan", "90", "2026-11-01", "2026-11-30"],
    ["12346", "Fan", "90", "2026-02-30", "2026-03-01"],
    ["12347", "Fan", "90", "2026-12-01", "2026-11-30"],
    ["12348", "Fan", "90", "11/01/2026", "11/30/2026"],
  ], "offers.csv", "Sheet1", 1);
  assert.equal(rows[0].validFrom, "2026-11-01");
  assert.equal(rows[0].validTo, "2026-11-30");
  assert.deepEqual(rows[0].warnings, []);
  for (const row of rows.slice(1)) assert.match(row.warnings.join(" "), /dates.*review/);
});
