"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const I = require("./inventory.js");
const A = require("./analytics.js");
const Demo = require("./demo-data.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test("CON- aliases normalize in both directions without damaging other hyphenated brands", () => {
  for (const assignment of ["DEVANT", "CON-DEVANT", " con - Devant "]) {
    const profile = { id: "p", assigned_brand: assignment, branch_id: "b" };
    const matches = I.brandMatcher(profile, [], [{ brand: "CON-DEVANT" }]);
    for (const brand of ["DEVANT", "CON-DEVANT", " con - Devant "]) assert.equal(matches({ brand }), true);
    assert.equal(matches({ brand: "CON-DEVANTAGE" }), false);
  }
  const parts = I.brandParts("CON-DEVANT / Brand-With-Hyphen", [{ brand: "Brand-With-Hyphen" }]);
  assert.deepEqual(parts.map(({ brand, scope }) => ({ brand, scope })), [
    { brand: "devant", scope: "" }, { brand: "brand-with-hyphen", scope: "" },
  ]);
});

test("slash groups combine every listed brand; category scope belongs only to its own part", () => {
  for (const group of ["FUJIDENZO / WHIRLPOOL", "MIDEA / TOSHIBA"]) {
    const parts = I.brandParts(group, []);
    for (const brand of group.split(" / ")) {
      assert.equal(I.matchesBrandParts({ brand, category: "TV" }, parts), true);
      assert.equal(I.matchesBrandParts({ brand: `CON-${brand}`, category: "Aircon" }, parts), true);
    }
    assert.equal(I.matchesBrandParts({ brand: "TCL" }, parts), false);
  }
  const scoped = I.brandParts("CARRIER / CON-CONDURA - AIRCON", []);
  for (const [brand, category, expected] of [
    ["Carrier", "TV", true], ["CON-CARRIER", "Aircon", true], ["Condura", "Aircon", true],
    ["CON-CONDURA", "Aircon", true], ["Condura", "Refrigerator", false], ["LG", "Aircon", false],
  ]) assert.equal(I.matchesBrandParts({ brand, category }, scoped), expected);
});

test("general PS excludes category claimed by an active peer, not another branch or inactive account", () => {
  const profiles = [
    { id: "general", role: "ps", branch_id: "b", active: true, assigned_brand: "CON-CONDURA" },
    { id: "scoped", role: "ps", branch_id: "b", active: true, assigned_brand: "CARRIER / CONDURA - AIRCON" },
    { id: "inactive", role: "ps", branch_id: "b", active: false, assigned_brand: "CONDURA - Refrigerator" },
    { id: "remote", role: "ps", branch_id: "other", active: true, assigned_brand: "CONDURA - TV" },
  ];
  const general = I.brandMatcher(profiles[0], profiles, []);
  assert.equal(general({ brand: "Condura", category: "Aircon" }), false);
  assert.equal(general({ brand: "CON-CONDURA", sub_category: "Split Aircon" }), false);
  assert.equal(general({ brand: "Condura", category: "Refrigerator" }), true);
  assert.equal(general({ brand: "Condura", category: "TV" }), true);
  const scoped = I.brandMatcher(profiles[1], profiles, []);
  assert.equal(scoped({ brand: "CON-CONDURA", model_description: "Window Aircon" }), true);
  assert.equal(scoped({ brand: "Carrier", category: "Refrigerator" }), true);
});

function targetRows({ basis = "price", branch = "b", targets, sales } = {}) {
  const liveData = {
    products: [],
    brandTargets: targets || [
      { branch_id: "b", month: "2026-11-01", brand: "FUJIDENZO / WHIRLPOOL", amount: 600 },
      { branch_id: "b", month: "2026-11-01", brand: "MIDEA / TOSHIBA", amount: 800 },
      { branch_id: "b", month: "2026-11-01", brand: "CARRIER / CONDURA - AIRCON", amount: 1000 },
      { branch_id: "b", month: "2026-11-01", brand: "CONDURA", amount: 500 },
      { branch_id: "b", month: "2026-11-01", brand: "CON-DEVANT", amount: 300 },
      { branch_id: "b", month: "2026-11-01", brand: "LG - AIRCON", amount: 400 },
      { branch_id: "b", month: "2026-11-01", brand: "LG", amount: 700 },
    ],
    sales: sales || [
      ...[
        ["FUJIDENZO", "Refrigerator"], ["CON-WHIRLPOOL", "Washer"], ["MIDEA", "TV"], ["CON-TOSHIBA", "TV"],
        ["CARRIER", "Refrigerator"], ["CON-CONDURA", "Aircon"], ["CONDURA", "Refrigerator"],
        ["DEVANT", "TV"], ["CON-DEVANT", "TV"], ["CON-LG", "Aircon"], ["LG", "TV"],
      ].map(([brand, category], index) => ({ id: index, branch_id: "b", sold_on: "2026-11-02", lines: [{ brand, category, quantity: 1, selling_price: 100, srp: 200 }] })),
      { id: "remote", branch_id: "other", sold_on: "2026-11-02", lines: [{ brand: "DEVANT", quantity: 1, selling_price: 999, srp: 999 }] },
      { id: "past", branch_id: "b", sold_on: "2026-10-02", lines: [{ brand: "DEVANT", quantity: 1, selling_price: 999, srp: 999 }] },
    ],
  };
  const context = vm.createContext({
    window: { BranchlineInventory: I, BranchlineAnalytics: A }, liveData,
    ui: { salesBasis: basis, brandSort: "brand" }, scopeBranchIds: () => new Set([branch]),
    targetInPeriod: date => date.startsWith("2026-11"), inStatus: date => date.startsWith("2026-11"),
    linesForSale: id => liveData.sales.find(sale => sale.id === id).lines,
    natural: (a, b) => a.localeCompare(b),
  });
  vm.runInContext(section("  function addTo(", "  function visibleSales("), context);
  vm.runInContext(section("  function brandRows(", "  // Header sorting"), context);
  return JSON.parse(vm.runInContext("JSON.stringify(brandRows())", context));
}

test("target actuals combine slash brands and CON aliases while routing scoped categories separately", () => {
  for (const basis of ["price", "srp"]) {
    const rows = targetRows({ basis });
    const get = brand => rows.find(row => row.brand.toUpperCase() === brand);
    const multiplier = basis === "srp" ? 2 : 1;
    for (const [brand, amount, target] of [
      ["FUJIDENZO / WHIRLPOOL", 200, 600], ["MIDEA / TOSHIBA", 200, 800],
      ["CARRIER / CONDURA - AIRCON", 200, 1000], ["CONDURA", 100, 500],
      ["DEVANT", 200, 300], ["LG - AIRCON", 100, 400], ["LG", 100, 700],
    ]) {
      assert.equal(get(brand)?.actual, amount * multiplier, brand);
      assert.equal(get(brand)?.target, target, brand);
    }
    assert.equal(rows.reduce((sum, row) => sum + row.actual, 0), 1100 * multiplier);
    assert.equal(rows.length, 7);
  }
});

test("targets route by branch and sale month; no-target and canonical alias rows retain all actuals", () => {
  assert.equal(targetRows({ branch: "other" })[0].actual, 999);
  const rows = targetRows({ targets: [] });
  assert.equal(rows.find(row => row.brand === "DEVANT").actual, 200);
  assert.equal(rows.reduce((sum, row) => sum + row.actual, 0), 1100);
  const monthly = targetRows({
    targets: [
      { branch_id: "b", month: "2026-11-01", brand: "CON-CONDURA - AIRCON", amount: 100 },
      { branch_id: "other", month: "2026-11-01", brand: "CONDURA - Refrigerator", amount: 200 },
    ],
  });
  assert.equal(monthly.find(row => row.brand === "CONDURA").actual, 100);
});

test("demo product access, contributions and price-free logs share canonical multi-brand matching", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const demo = Demo.create({ storage, catalog: Demo.sampleCatalog() });
  const ps = demo.profile.id;
  const result = async promise => {
    const response = await promise;
    assert.equal(response.error, null, response.error?.message);
    return response.data;
  };
  demo.setRole("admin");
  await result(demo.client.rpc("admin_update_profile", { p_user_id: ps, p_full_name: "Fixture PS", p_assigned_brand: "CON-TCL / CON-LG" }));
  demo.setRole("ps");
  const log = await result(demo.client.rpc("export_brand_branch_sales"));
  assert.ok(log.some(row => row.brand === "TCL"));
  assert.ok(log.some(row => row.brand === "LG"));
  assert.ok(log.every(row => ["tcl", "lg"].includes(I.brandKey(row.brand)) && !("amount" in row)));
  const products = await result(demo.client.from("products"));
  assert.ok(products.every(row => ["tcl", "lg"].includes(I.brandKey(row.brand))));
  const before = await result(demo.client.rpc("brand_sales_contribution"));
  demo.setRole("admin");
  await result(demo.client.rpc("admin_update_profile", { p_user_id: ps, p_full_name: "Fixture PS", p_assigned_brand: "TCL / LG" }));
  demo.setRole("ps");
  assert.deepEqual(await result(demo.client.rpc("brand_sales_contribution")), before);
});

test("grouped target drilldowns match their rows, include aliases and show the actual brand column", () => {
  let opened;
  const rows = [
    { id: "ac", branch_id: "b", sold_on: "2026-11-02", lines: [{ brand: "CON-CONDURA", category: "Aircon" }] },
    { id: "ref", branch_id: "b", sold_on: "2026-11-02", lines: [{ brand: "CONDURA", category: "Refrigerator" }] },
    { id: "carrier", branch_id: "b", sold_on: "2026-11-02", lines: [{ brand: "CON-CARRIER", category: "TV" }] },
    { id: "remote", branch_id: "other", sold_on: "2026-11-02", lines: [{ brand: "CONDURA", category: "Aircon" }] },
  ];
  const context = vm.createContext({
    window: { BranchlineInventory: I }, scopeBranchIds: () => new Set(["b"]),
    visibleSales: () => rows, inStatus: () => true, periodLabel: () => "November 2026",
    linesForSale: id => rows.find(row => row.id === id).lines,
    liveData: { sales: rows, products: [], brandTargets: [
      { branch_id: "b", month: "2026-11-01", brand: "CARRIER / CONDURA - AIRCON" },
      { branch_id: "b", month: "2026-11-01", brand: "CONDURA" },
    ] }, openBreakdownModal: options => { opened = options; },
  });
  vm.runInContext(section("  function openBrandDetailModal(", "  function openBreakdownModal("), context);
  context.openBrandDetailModal("CARRIER / CONDURA - AIRCON");
  assert.deepEqual(Array.from(opened.all, row => row.sale.id), ["ac", "carrier"]);
  assert.equal(opened.showBrand, true);
  context.openBrandDetailModal("CONDURA");
  assert.deepEqual(Array.from(opened.all, row => row.sale.id), ["ref"]);
});
