"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("batch import selects only unique ordinary products with usable SRP", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = (barcode, excerpt, extra = {}) => ({
    barcode, description: "Fan", sourceName: "ordinary.pdf", sourceExcerpt: excerpt,
    sourcePage: 1, warnings: [], memoSrp: 100, tagPrice: 90, ...extra,
  });

  const rows = [
    row("12345", "12345 Fan 100.00 90.00"),
    row("12346", "BUY1 GET1 12346 Fan 100.00 90.00"),
    row("12347", "12347 Fan 100.00 90.00"),
    row("12347", "12347 Fan 100.00 80.00"),
    row("12348", "12348 Fan 100.00 90.00"),
    row("12349", "12349 Fan 100.00 90.00"),
    row("12350", "12350 Fan 100.00 90.00"),
    row("12351", "12351 Fan 100.00 90.00", { sourceName: "BUY5 GET1.pdf" }),
  ];
  const products = ["12345", "12346", "12347", "12349", "12350", "12351"]
    .map(barcode => ({ barcode: barcode.padStart(8, "0"), srp: barcode === "12349" ? null : 100 }));
  const results = preparePromotionImport(rows, products, [{ barcode: "12350" }]);
  assert.deepEqual(results.map(item => item.ready), [true, false, false, false, false, false, false, false]);
  assert.match(results[1].reasons.join(" "), /Bundle/);
  assert.match(results[2].reasons.join(" "), /more than once/);
  assert.match(results[4].reasons.join(" "), /inventory barcode/);
  assert.match(results[5].reasons.join(" "), /SRP/);
  assert.match(results[6].reasons.join(" "), /already/);
  assert.match(results[7].reasons.join(" "), /Bundle/);
});

test("clear buy/get rows match one model and preserve paid and free quantities", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = {
    barcode: "65433", description: "BUY5 GET1 CK-2010S CAMEL", sourceName: "offers.pdf",
    sourceExcerpt: "65433 BUY5 GET1 CK-2010S CAMEL BUY5 GET1 ₱3,479.00",
    sourcePage: 1, warnings: [], memoSrp: null, tagPrice: 3479,
  };
  const product = { barcode: "56682", model_description: "CAMEL E. KETTLE CK-2010S 2.0 LITER", srp: 710 };
  const result = preparePromotionImport([row], [product], [])[0];
  assert.equal(result.ready, true);
  assert.deepEqual(result.components, [
    { id: "paid", barcode: "00056682", quantity: 5, free: false },
    { id: "free", barcode: "00056682", quantity: 1, free: true },
  ]);
  for (const unsafe of [
    { ...row, sourceExcerpt: `${row.sourceExcerpt} + FREE MUG` },
    { ...row, sourceExcerpt: `${row.sourceExcerpt} BUY1 GET1` },
    { ...row, sourceExcerpt: `${row.sourceExcerpt} OTHER-123` },
  ]) assert.equal(preparePromotionImport([unsafe], [product], [])[0].ready, false);
  assert.equal(preparePromotionImport([row], [product, { ...product, barcode: "56683" }], [])[0].ready, false);
  assert.equal(preparePromotionImport([row], [product], [{ barcode: "65433" }])[0].ready, false);
});

test("description models match real barcodes and disambiguate by named catalog brand", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = {
    barcode: "65425", description: "BUY5 GET1 CFI-1010 CAMEL BUY5 GET1",
    sourceName: "BUY5 GET1.pdf", sourceExcerpt: "65425 BUY5 GET1 CFI-1010 CAMEL BUY5 GET1 2779.00",
    warnings: [], tagPrice: 2779,
  };
  const paid = { barcode: "29070", brand: "CAMEL", model_description: "CAMEL FLAT IRON CFI1010 NON STICK", srp: 560 };
  const free = { barcode: "36109", brand: "FREE", model_description: "FREE CAMEL FLAT IRON CFI-1010", srp: 0 };
  const result = preparePromotionImport([row], [paid, free], [])[0];
  assert.equal(result.ready, true);
  assert.deepEqual(result.components.map(item => [item.barcode, item.quantity, item.free]), [
    ["00029070", 5, false], ["00029070", 1, true],
  ]);
  const plain = { ...row, barcode: "99999", description: "CAMEL FLAT IRON CFI1010",
    sourceName: "ordinary.pdf", sourceExcerpt: "99999 CAMEL FLAT IRON CFI1010 100.00", tagPrice: 100 };
  const ordinary = preparePromotionImport([plain], [paid, free], [])[0];
  assert.equal(ordinary.ready, true);
  assert.equal(ordinary.components[0].barcode, "00029070");
  assert.equal(preparePromotionImport([{ ...plain, description: "FLAT IRON CFI1010" }], [paid, free], [])[0].ready, false);
  assert.equal(preparePromotionImport([plain], [free, { ...paid, barcode: "30000" }, paid], [])[0].ready, false);
  assert.equal(preparePromotionImport([plain], [free, { ...paid, model_description: "DIFFERENT XX123" }], [])[0].ready, false);
  assert.equal(preparePromotionImport([{ ...plain, description: "CAMEL FLAT IRON CFI1010 XX123" }], [paid], [])[0].ready, false);
  assert.equal(preparePromotionImport([{ ...plain, description: "CAMEL FLAT IRON CFI1010 WITH MUG" }], [paid], [])[0].ready, false);
  assert.equal(preparePromotionImport([{ ...row, description: "BUY5 GET1 CFI1010 OTHER-123 CAMEL" }], [paid], [])[0].ready, false);
  assert.equal(preparePromotionImport([{ ...plain, tagPrice: null }], [paid], [])[0].ready, false);
  assert.equal(preparePromotionImport([plain], [{ ...paid, model_description: "CAMEL CFI1010A" }], [])[0].ready, false);
});

test("buy/get model matching ignores unrelated catalog brands but not matching model conflicts", async () => {
  const { preparePromotionImport } = await import("./import-engine/promotion-import.mjs");
  const row = {
    barcode: "00065148", description: "CAMEL BUY1 GET1 1MS-SF MEGASAVER STAND FAN",
    sourceName: "BUY1 GET1.pdf",
    sourceExcerpt: "CAMEL BUY1 GET1 00065148 CAMEL BUY1 GET1 1MS-SF MEGASAVER STAND FAN ₱2,280.00 ₱2,159.00",
    warnings: [], tagPrice: 2159,
  };
  const camel = { barcode: "00054736", brand: "CAMEL", model_description: "CAMEL ELECTRIC FAN 1MS-SF", srp: 1140 };
  const unrelated = { barcode: "10000", brand: "MEGASAVER", model_description: "MEGASAVER OTHER ZZ999", srp: 100 };
  const result = preparePromotionImport([row], [camel, unrelated], [])[0];
  assert.equal(result.ready, true);
  assert.deepEqual(result.components.map(part => [part.barcode, part.quantity, part.free]), [
    ["00054736", 1, false], ["00054736", 1, true],
  ]);
  const otherMatch = { ...unrelated, model_description: "MEGASAVER 1MS-SF" };
  assert.equal(preparePromotionImport([row], [camel, otherMatch], [])[0].ready, false);
  assert.equal(preparePromotionImport([row], [{ ...camel, brand: "OTHER" }, unrelated], [])[0].ready, false);
  assert.equal(preparePromotionImport([{ ...row, description: `${row.description} & MUG`, sourceExcerpt: `${row.sourceExcerpt} & MUG` }], [camel, unrelated], [])[0].ready, false);
});
