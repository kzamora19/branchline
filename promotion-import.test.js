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
