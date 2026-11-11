const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("printed PDF columns preserve integer cash prices, tag prices, installment totals and monthly amounts", async () => {
  const { promotionPdfCandidates } = await import("./import-engine/promotion-pdf.mjs");
  const item = (text, x, y, width = 20) => ({ text, transform: [1, 0, 0, 1, x, y], width, height: 7 });
  const rows = promotionPdfCandidates({ sourceName: "offers.pdf", pages: [{ number: 1, items: [
    item("BARCODE", 10, 200), item("MODEL", 80, 200), item("SRP", 200, 200),
    item("CASH PAYMENT", 280, 200), item("TAG THIS", 360, 200), item("12 MOS.", 440, 200),
    item("64112", 10, 180), item("42CEP009308-1", 80, 180), item("47,300.00", 200, 180),
    item("40,273", 280, 180), item("4 2,039", 360, 180), item("4415/MO.", 440, 180),
  ] }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cashPayment, 40273);
  assert.equal(rows[0].tagPrice, 42039);
  assert.equal(rows[0].sourceColumns.tagPrice, "4 2,039");
  assert.deepEqual(rows[0].installments, [{ months: 12, amount: 4415, basis: "monthly", raw: "4415/MO." }]);
});

test("direct mixed bundles retain one offer barcode and map each product once", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = { barcode: "61503", description: "BUNDLE ASAHI OT-102/EK-017", brand: "ASAHI", category: "BUNDLE",
    remarks: "", sourceColumns: {}, sourceExcerpt: "BUNDLE ASAHI OT-102/EK-017", sourceName: "offers.pdf", tagPrice: 2439, warnings: [] };
  const products = [
    { barcode: "10001", brand: "ASAHI", model_description: "ASAHI OVEN TOASTER OT-102", srp: 1200 },
    { barcode: "10002", brand: "ASAHI", model_description: "ASAHI ELECTRIC KETTLE EK-017", srp: 800 },
  ];
  const prepared = preparePromotionImport([row], products, [])[0];
  assert.equal(prepared.ready, true);
  assert.equal(prepared.code, "00061503");
  assert.deepEqual(prepared.components.map(part => [part.barcode, part.quantity, part.free]), [
    ["00010001", 1, false], ["00010002", 1, false],
  ]);
  assert.equal(preparePromotionImport([row], products.slice(0, 1), [])[0].ready, false);
  const existingBundle = { barcode: "61503", brand: "ASAHI", model_description: row.description, srp: 2670 };
  assert.equal(preparePromotionImport([row], [existingBundle], [])[0].ready, false);
  assert.equal(preparePromotionImport([row], [...products, existingBundle], [])[0].ready, true);
});

test("direct buy/get components distinguish paid and free units and installation service terms stay ordinary", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = { barcode: "65433", description: "BUY5 GET1 CK-2010S CAMEL", brand: "", category: "", remarks: "BUY5 GET1",
    sourceColumns: {}, sourceExcerpt: "description: BUY5 GET1 CK-2010S CAMEL | remarks: BUY5 GET1", sourceName: "offers.pdf", tagPrice: 3479, warnings: [] };
  const catalog = [{ barcode: "56682", brand: "CAMEL", model_description: "CAMEL KETTLE CK-2010S", srp: 710 }];
  const prepared = preparePromotionImport([row], catalog, [])[0];
  assert.equal(prepared.ready, true);
  assert.deepEqual(prepared.components.map(part => [part.quantity, part.free]), [[5, false], [1, true]]);
  const aircon = { ...row, barcode: "63471", brand: "LG", description: "HSN09ISA", remarks: "FREE FIRST 10FT INSTALLATION" };
  const variants = [aircon, { ...aircon, remarks: "UNIT ONLY", tagPrice: 20829 }];
  const result = preparePromotionImport(variants, [{ barcode: "63471", brand: "LG", model_description: "LG HSN09ISA", srp: 36998 }], []);
  assert.ok(result.every(value => value.ready));
});

test("bundle 65138 uses the exact printed cooker model when two barcodes differ by a hyphen", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = { barcode: "65138", description: "TOUGH MAMA BUNDLE NRC1M RICE COOKER & NTMGS-S3CTD GAS STOVE",
    brand: "TOUGH MAMA", category: "BUNDLE", remarks: "", sourceColumns: {}, tagPrice: 1749, warnings: [] };
  const catalog = [
    { barcode: "36639", brand: "TOUGH MAMA", model_description: "TOUGH MAMA RICE COOKER NRC-1M", srp: 1149 },
    { barcode: "64025", brand: "TOUGH MAMA", model_description: "TOUGH MAMA RICE COOKER NRC1M 6-CUP", srp: 1149 },
    { barcode: "44895", brand: "TOUGH MAMA", model_description: "TOUGH MAMA GAS STOVE NTMGS-S3CTD 2 BURNER", srp: 1199 },
  ];
  const [prepared] = preparePromotionImport([row], catalog, []);
  assert.equal(prepared.ready, true);
  assert.deepEqual(prepared.components.map(part => [part.barcode, part.quantity, part.free]), [
    ["00064025", 1, false], ["00044895", 1, false],
  ]);
  const samePrintedModel = { ...catalog[1], barcode: "77777" };
  assert.equal(preparePromotionImport([row], [...catalog, samePrintedModel], [])[0].ready, false);
});

test("all six original PDFs retain their complete row counts and separate printed price columns", {
  skip: !process.env.PROMOTION_SOURCE_DIR || !process.env.BRANCHLINE_PDFJS,
}, async () => {
  const { inspectPromotionPdf, promotionPdfCandidates } = await import("./import-engine/promotion-pdf.mjs");
  const pdfjs = await import(pathToFileURL(process.env.BRANCHLINE_PDFJS));
  const files = [
    ["PRE CHRISTMAS OFFER - SMALL APPS (BUY5 GET1 & BUNDLE) (1).pdf", 58],
    ["PRE CHRISTMAS OFFER - SMALL APPS (Below 1k to 5K) (1).pdf", 59],
    ["PRE CHRISTMAS OFFER - SMALL APPS (BUY1 GET1) (1).pdf", 26],
    ["PRE -CHRISTMAS SPECIAL OFFER FURNITURE  2026.pdf", 20],
    ["PRE CHRISTMAS SPECIAL OFFER REF AND WASHING.pdf", 49],
    ["PRE CHRISTMAS SPECIAL OFFER AIRCONS.pdf", 61],
  ];
  const results = [];
  for (const [name, count] of files) {
    const document = await inspectPromotionPdf(pdfjs, new Uint8Array(fs.readFileSync(path.join(process.env.PROMOTION_SOURCE_DIR, name))), name);
    const rows = promotionPdfCandidates(document);
    assert.equal(rows.length, count, name);
    assert.ok(rows.every(row => row.description), name);
    assert.ok(rows.every(row => row.warnings.every(warning => !/printed .* amount needs review/.test(warning))), name);
    results.push(rows);
  }
  const aircon = results[5].filter(row => row.barcode === "64112");
  assert.deepEqual(aircon.map(row => [row.cashPayment, row.tagPrice, row.remarks]), [
    [40273, 42039, "FREE FIRST 10FT INSTALLATION"], [33768, 35249, "UNIT ONLY"],
  ]);
  const furniture = results[3].find(row => row.barcode === "62555");
  assert.equal(furniture.tagPrice, 104599);
  assert.equal(furniture.validFrom, "");
  assert.equal(results[0].find(row => row.barcode === "65462").tagPrice, null);
  assert.equal(results[0].find(row => row.barcode === "65462").installments[0].amount, 10299);
  assert.match(results[0].find(row => row.barcode === "65462").description, /12G/);
});
