"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const I = require("./inventory.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8").replace(/\r\n/g, "\n");

const product = (barcode = "001", quantity = 5, branch_id = "one") => ({
  branch_id, barcode, quantity, brand: "TCL", category: "TV", model_description: barcode, srp: 100,
});
const sale = (quantity = 100, date = "2026-10-31", barcode = "001", branchId = "one") => ({
  branchId, barcode, date, quantity,
});
function forecast(options = {}) {
  return A.inventoryForecast({
    products: [product()], facts: [sale()], branchIds: new Set(["one"]),
    from: "2026-01-01", to: "2026-10-31", today: "2026-11-04", ...options,
  });
}

test("100 units over ten calendar months gives monthly average ten, target thirty and reorder twenty-five", () => {
  const result = forecast();
  assert.equal(result.months, 10);
  assert.equal(result.products[0].branchSold, 100);
  assert.equal(result.products[0].forecast, 10);
  assert.equal(result.products[0].stockTarget, 30);
  assert.equal(result.products[0].reorder, 25);
  assert.equal(result.products[0].stockAlert, "Critical stock");
  assert.equal(forecast({ facts: [sale(101)] }).products[0].forecast, 11);
});

test("zero-sales months count; excess/equal stock never creates a negative re-order", () => {
  for (const quantity of [30, 31, 100]) {
    const row = forecast({ products: [product("001", quantity)] }).products[0];
    assert.equal(row.reorder, 0);
    assert.equal(row.stockAlert, "Sufficient stock");
  }
  const noSales = forecast({ facts: [], products: [product("001", 0)] }).products[0];
  assert.equal(noSales.forecast, 0);
  assert.equal(noSales.reorder, 0);
  assert.equal(noSales.stockAlert, "No recorded demand");
  const stockout = forecast({ products: [product("001", 0)] }).products[0];
  assert.equal(stockout.reorder, 30);
  assert.equal(stockout.stockAlert, "Critical stock");
});

test("stock coverage uses inclusive 30/60/90 boundaries against the three-month target without percentage gaps", () => {
  const options = { from: "2026-08-01", to: "2026-10-31", facts: [sale(100)] };
  for (const [stock, status] of [[0,"Critical stock"],[30,"Critical stock"],[31,"Low stock"],
    [60,"Low stock"],[61,"Moderate stock"],[90,"Moderate stock"],[91,"Sufficient stock"],[100,"Sufficient stock"],[101,"Sufficient stock"]]) {
    const row=forecast({ ...options, products: [product("001",stock)] }).products[0];
    assert.equal(row.stockTarget,100);
    assert.equal(row.stockAlert,status);
    assert.equal(row.reorder,Math.max(0,100-stock));
  }
  const fractional=forecast({facts:[sale(110)],products:[product("001",10)]}).products[0];
  assert.equal(fractional.stockTarget,33);
  assert.equal(fractional.stockAlert,"Low stock");
  const fulfilled = forecast({ ...options, products:[product("001",7)], facts:[...options.facts,sale(100,"2026-11-02")] }).products[0];
  assert.equal(fulfilled.reorder,93);
  assert.equal(fulfilled.stockAlert,"Critical stock");
});

test("annual sell-out is exact branch/barcode calendar YTD net units, independent of forecast dates and target", () => {
  const facts = [sale(10,"2026-01-01"),sale(-2,"2026-06-01"),sale(3,"2026-11-04"),
    sale(99,"2025-12-31"),sale(99,"2026-11-05"),sale(99,"2026-06-01","1"),
    sale(99,"2026-06-01","001","foreign"),{...sale(99,"2026-06-01"),summary:true}];
  for (const targetMonth of ["2026-02","2026-11","2027-01"]) {
    const row=forecast({facts,targetMonth,from:"2026-08-01",to:"2026-10-31"}).products[0];
    assert.equal(row.annualSold,11);
    assert.equal(row.annualFrom,"2026-01-01");
    assert.equal(row.annualTo,"2026-11-04");
  }
  assert.equal(forecast({facts:[sale(-2,"2026-01-01")]}).products[0].annualSold,-2);
  assert.equal(forecast({facts:[]}).products[0].annualSold,0);
  assert.equal(forecast({unavailable:true}).products[0].annualSold,null);
  assert.equal(forecast({facts,unavailable:true,annualUnavailable:false}).products[0].annualSold,11);
  assert.equal(forecast({today:"2027-01-01",facts:[...facts,sale(4,"2027-01-01")]}).products[0].annualSold,4);
  assert.throws(()=>forecast({facts:[sale(0.5,"2026-01-01")],from:"2026-08-01"}),/annual sell-out.*invalid unit quantity/);
});

test("January has no completed current-year months and never borrows last year's baseline", () => {
  const row=forecast({from:"0001-01-01",to:"2027-01-05",today:"2027-01-05",
    facts:[sale(1,"2025-01-01","OTHER"),sale(99,"2026-09-30"),sale(6,"2026-10-01"),sale(3,"2026-12-31"),sale(999,"2027-01-01")]}).products[0];
  assert.equal(row.historyFrom,"2027-01-01");
  assert.equal(row.historyTo,"2026-12-31");
  assert.equal(row.historyMonths,0);
  assert.equal(row.branchSold,0);
  assert.equal(row.forecast,null);
  assert.equal(row.soldThisMonth,999);
  assert.equal(row.reorder,null);
  assert.equal(row.annualSold,999);
});

test("unknown stock and failed demand loading never become a zero-stock/zero-demand recommendation", () => {
  const unknown = forecast({ products: [product("001", null)] }).products[0];
  assert.equal(unknown.forecast, 10);
  assert.equal(unknown.reorder, null);
  assert.equal(unknown.stockAlert, "Stock unknown");
  const failed = forecast({ unavailable: true }).products[0];
  assert.equal(failed.branchSold, null);
  assert.equal(failed.forecast, null);
  assert.equal(failed.reorder, null);
  assert.equal(failed.stockAlert, "Forecast unavailable");
});

test("calendar fractions handle partial months, leap February, inclusive dates and future clipping", () => {
  const partial = forecast({ facts: [sale(2, "2026-11-04"), sale(999, "2026-11-05")],
    from: "2026-11-01", to: "2026-11-30" });
  assert.equal(partial.months, 4 / 30);
  assert.equal(partial.to, "2026-11-04");
  assert.equal(partial.products[0].forecast, 15);
  const leap = forecast({ facts: [sale(1, "2024-02-29")], from: "2024-02-29", to: "2024-02-29" });
  assert.equal(leap.months, 1 / 29);
  assert.equal(leap.products[0].forecast, 29);
  const cross = forecast({ from: "2026-01-16", to: "2026-02-14", facts: [sale(1, "2026-01-16"), sale(1, "2026-02-14")] });
  assert.equal(cross.months, 16 / 31 + 14 / 28);
  assert.equal(cross.products[0].branchSold, 2);
  const future = forecast({ from: "2026-12-01", to: "2026-12-31" });
  assert.equal(future.months, 0);
  assert.equal(future.products[0].forecast, null);
});

test("branch/barcode joins are exact and summary-only totals cannot invent product units", () => {
  const rows = forecast({
    products: [product(), product("1"), product("001", 0, "two")],
    facts: [sale(), sale(99, "2026-10-31", "1"), sale(500, "2026-10-31", "001", "two"),
      sale(700, "2026-10-31", "001", "foreign"), sale(600, "2025-12-31"),
      { ...sale(900), summary: true }],
    branchIds: new Set(["one", "two"]),
  }).products;
  assert.deepEqual(rows.map(row => row.branchSold), [100, 99, 500]);
  assert.deepEqual(rows.map(row => row.forecast), [10, 10, 50]);
  assert.equal(rows[2].stockAlert, "Critical stock");
});

test("partial-month whole-number forecasts do not acquire an extra unit from rounding", () => {
  for (let day = 1; day <= 31; day++) {
    const result = forecast({ facts: [sale(day, "2026-01-01")],
      from: "2026-01-01", to: `2026-01-${String(day).padStart(2, "0")}` });
    assert.equal(result.products[0].forecast, 31, `Day ${day} should forecast exactly 31`);
  }
});

test("automatic history excludes the partial current month and never uses unauthorized branches", () => {
  const result = forecast({ from: "0001-01-01", to: "9999-12-31", today: "2026-10-31",
    facts: [sale(50, "2026-01-01"), sale(50), sale(999, "2000-01-01", "001", "foreign")] });
  assert.equal(result.from, "2026-01-01");
  assert.equal(result.months, 10);
  assert.equal(result.products[0].historyMonths,9);
  assert.equal(result.products[0].historyFrom,"2026-01-01");
  assert.equal(result.products[0].branchSold,50);
  assert.equal(result.products[0].forecast, 6);
  assert.equal(result.products[0].stockTarget,17);
  assert.equal(result.products[0].reorder,12);
  const empty = forecast({ from: "0001-01-01", to: "9999-12-31", facts: [] });
  assert.equal(empty.months, 0);
  assert.equal(empty.products[0].forecast, 0);
});

test("invalid unit data fails explicitly instead of returning a plausible forecast", () => {
  for (const quantity of [0.5, NaN, undefined]) {
    assert.throws(() => forecast({ facts: [{ ...sale(), quantity }] }), /invalid unit quantity/);
  }
});

test("large branch demand is aggregated without per-product scans", t => {
  const products = Array.from({ length: 30000 }, (_, i) => product(String(i)));
  const facts = Array.from({ length: 100000 }, (_, i) => sale(1, "2026-10-31", String(i % 30000)));
  const start = performance.now(), result = forecast({ products, facts }), elapsed = performance.now() - start;
  assert.equal(result.products.reduce((total, row) => total + row.branchSold, 0), 100000);
  assert.ok(elapsed < 3000, `Forecast exceeded 3 seconds: ${elapsed}ms`);
  t.diagnostic(`30000 products and 100000 sales: ${Math.round(elapsed)}ms`);
});

function render(role = "ps", options = {}, filters = {}) {
  const catalog = [product(), product("ZERO", 0), product("UNKNOWN", null), product("ENOUGH", 20),
    { ...product("OTHER", 5), brand: "LG" }, product("001", 5, "two")];
  const facts = [sale(20), sale(20, "2026-10-31", "ZERO")].map(row => ({ ...row, amount: 200 }));
  const branchSales = [sale(), sale(100, "2026-10-31", "ZERO"), sale(100, "2026-10-31", "UNKNOWN"),
    sale(100, "2026-10-31", "ENOUGH"), sale(999, "2026-10-31", "001", "foreign")].map(row => ({
    branch_id: row.branchId, barcode: row.barcode, sold_on: row.date, quantity: row.quantity,
    ps_name: "Peer name must not leak", invoice_number: "PEER-SECRET",
  }));
  const tables = new Map(), ids = new Set(["one"]);
  const context = vm.createContext({
    activeClimateAdjustments: () => [], climateReviewPanel: () => "",
    calendarClosures: () => [], companyHolidayDates: () => [], activeEventAdjustments: () => [], eventCalendarPanel: () => "",
    window: { BranchlineAnalytics: A, BranchlineInventory: I }, PAGE_SIZE: 10,
    ui: { inventoryForecastFrom: "2026-01-01", inventoryForecastTo: "2026-10-31", ...filters },
    currentProfile: { id: "self", role, branch_id: "one", assigned_brand: "TCL" },
    liveData: { inventoryCatalog: catalog, inventoryStock: catalog.filter(row => row.quantity !== null),
      inventorySerials: [], profiles: [], brandSales: branchSales, brandSalesError: "",
      inventoryTransfers: [], inventoryEvents: [], inventorySnapshots: [], ...options },
    branchName: String, formatMoney: amount => `P${amount}`, localISODate: date => date.toISOString().slice(0, 10),
    inventoryTransferStatus: String, inventoryEventNote: () => "",
    escapeHTML: value => String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]),
    panel: (title, detail, body) => `<section><h2>${title}</h2><p>${detail}</p>${body}</section>`,
    tableBlock: (key, headers, rows, rowHtml, _empty, _pageSize, sortValue) => {
      tables.set(key, { headers, rows, html: rows.map(rowHtml).join(""), sortValue });
      return rows.map(rowHtml).join("");
    },
  });
  const start = source.indexOf("  function analyticsDataTable(");
  vm.runInContext(source.slice(start, source.indexOf("  function allTimeAnalyticsPanels(", start)), context);
  context.inputFacts = role === "ps" ? facts : [
    ...facts, ...[sale(80), sale(80, "2026-10-31", "ZERO"), sale(100, "2026-10-31", "UNKNOWN"), sale(100, "2026-10-31", "ENOUGH")]
      .map(row => ({ ...row, amount: 800 })),
  ];
  context.inputIds = ids;
  const html = vm.runInContext('inventoryAnalyticsPanels(inputIds,inputFacts,"2026-01-01","2026-10-31","2026-11-04")', context);
  return { html, table: tables.get("an-inventory-products"), tables };
}

test("PS annual sell-out uses branch units while selected-period personal units and Sales stay unchanged", () => {
  const { table, html } = render();
  assert.equal(table.rows.length, 4);
  const row = table.rows.find(row => row[1] === "001");
  assert.equal(row[7], 100);
  assert.equal(row[32], 20);
  assert.equal(row[8], "P200");
  assert.deepEqual(Array.from(row.slice(11, 15)), [100, 30, 25, "Critical stock"]);
  assert.deepEqual(Array.from(row.slice(15, 18)), ["2026-11", 1, "Monthly average (insufficient seasonal history)"]);
  assert.doesNotMatch(html, /Peer name must not leak|PEER-SECRET|foreign/);
  assert.ok(table.rows.every(row => row[0] === "one" && row[3] === "TCL"));
  assert.equal(table.sortValue(row, 13), 25);
});

test("all manager roles forecast scoped branch demand, and exports retain numeric quantities", () => {
  for (const role of ["manager", "district_manager", "admin"]) {
    const { table } = render(role);
    const row = table.rows.find(row => row[1] === "001");
    assert.equal(row[7], 100);
    assert.deepEqual(Array.from(row.slice(11, 15)), [100, 30, 25, "Critical stock"]);
    assert.ok(table.rows.every(row => row[0] === "one"));
    for (const index of [6, 11, 12, 13]) assert.equal(typeof row[index], "number");
  }
});

test("registered inventory worksheet exports use raw numeric quantities and text barcodes, not styled HTML", () => {
  const { table } = render();
  table.items = table.rows;
  const context = vm.createContext({ tableStore: { "an-inventory-products": table }, table });
  const start = source.indexOf("  function tableToSheet(");
  vm.runInContext(source.slice(start, source.indexOf("  function exportTable(", start)), context);
  const sheet = vm.runInContext('tableToSheet(table,"Inventory and product sales")', context);
  assert.equal(sheet.rows[1][1], "001");
  assert.equal(sheet.rows[1][12], 30);
  assert.equal(sheet.rows[1][13], 25);
  assert.equal(sheet.rows[1][14], "Critical stock");
  assert.equal(sheet.rows[2][14], "Critical stock");
  assert.equal(sheet.rows[0][7], "Annual sell-out (YTD)");
  assert.equal(sheet.rows[1][7], 100);
  assert.equal(sheet.rows[1][32], 20);
  assert.equal(typeof sheet.rows[1][12], "number");
});

test("low stock is amber, critical stock is red and zero stock with demand is red/bold", () => {
  const { table } = render();
  const rows = table.html.match(/<tr>.*?<\/tr>/g);
  assert.match(rows[0], /<td class="inventory-stock-alert">5<\/td>/);
  assert.doesNotMatch(rows[0], /inventory-stock-attention/);
  assert.match(rows[1], /<td class="inventory-stock-alert inventory-stock-attention">0<\/td>/);
  assert.match(rows[1], /class="inventory-stock-alert inventory-stock-attention">Critical stock/);
  assert.doesNotMatch(rows[2], /inventory-stock-alert/);
  assert.match(rows[2], /Stock unknown/);
  assert.doesNotMatch(rows[3], /inventory-stock-alert/);
  assert.match(rows[3], /Moderate stock/);
  assert.match(rows[3], /inventory-stock-moderate/);
  const low=render("ps",{inventoryStock:[product("001",15)]}).table.html;
  assert.match(low,/<td class="inventory-stock-low">15<\/td>/);
});

test("failed PS branch log is visibly reported and forecasts are unavailable, never personal-sale fallbacks", () => {
  const { html, table } = render("ps", { brandSales: [], brandSalesError: "Branch log connection failed" });
  assert.match(html, /role="alert">Forecast unavailable: Branch log connection failed/);
  assert.equal(table.rows[0][7], "Unavailable");
  assert.equal(table.rows[0][32], 20);
  assert.deepEqual(Array.from(table.rows[0].slice(11, 15)), ["Unavailable", "Unavailable", "Unavailable", "Forecast unavailable"]);
  const missing = render("ps", { brandSales: undefined });
  assert.match(missing.html, /Branch-wide product demand is unavailable/);
});

test("calendar loading failures block forecasting without hiding valid annual branch sell-out", () => {
  const {html,table}=render("ps",{calendar:{error:"Calendar loading failed"}});
  assert.match(html,/Forecast unavailable: Calendar loading failed/);
  assert.equal(table.rows[0][7],100);
  assert.equal(table.rows[0][12],"Unavailable");
});

test("Analytics brand MOH uses branch-wide SRP value, stays independent of product search and exports raw numbers", () => {
  const options = { inventoryCatalog:[product("001",40)],inventoryStock:[product("001",40)],
    brandSales:[{branch_id:"one",barcode:"001",sold_on:"2026-10-31",quantity:100,brand:"TCL"}] };
  const {table,tables,html}=render("ps",options);
  assert.equal(tables.has("an-inventory-brand-moh"),false);
  assert.equal(table.rows[0][33],4);
  assert.match(table.html,/<td class="inventory-stock-alert">4<\/td>/);
  assert.doesNotMatch(html,/<h2>Inventory overview<\/h2>/);
  const filtered=render("ps",options,{inventoryProductSearch:"no-match"});
  assert.equal(filtered.table.rows.length,0);
  for(const stock of [30,31]){
    const result=render("ps",{...options,inventoryCatalog:[product("001",stock)],inventoryStock:[product("001",stock)]});
    assert.equal(result.table.rows[0][33],stock/10);
    assert.equal(/inventory-stock-alert">3(?:\.1)?<\/td>/.test(result.table.html),stock>30);
  }
  const noSales=render("ps",{...options,brandSales:[]});
  assert.match(noSales.table.html,/<td class="inventory-stock-alert">No sell-out<\/td>/);
});

test("old saved learning calendars cannot override annual learning or change personal sales", () => {
  const { table, html } = render("ps", {}, { inventoryForecastFrom: "2026-10-01", inventoryForecastTo: "2026-10-31", inventoryProductDetails: true });
  assert.equal(table.rows[0][7], 100);
  assert.equal(table.rows[0][32], 20);
  assert.equal(table.rows[0][8], "P200");
  assert.deepEqual(Array.from(table.rows[0].slice(11, 15)), [100, 30, 25, "Critical stock"]);
  assert.equal(table.rows[0][20], "2026-01-01");
  assert.equal(table.rows[0][21], 10);
  assert.doesNotMatch(html,/data-filter="inventoryForecast(?:From|To)"/);
  assert.doesNotMatch(html, /History ends 2026-10-31/);
});

test("inventory product view is basic by default with local search and optional full forecast details",()=>{
  const basic=render();
  assert.match(basic.html,/data-inventory-product-search/);
  assert.match(basic.html,/data-inventory-product-details/);
  assert.match(basic.html,/inventory-product-basic/);
  assert.doesNotMatch(basic.html,/History ends 2026-10-31/);
  const detail=render("ps",{}, {inventoryProductDetails:true});
  assert.doesNotMatch(detail.html,/inventory-product-basic/);
  assert.doesNotMatch(detail.html,/History ends 2026-10-31/);
  assert.deepEqual(JSON.parse(JSON.stringify(basic.table.rows)),JSON.parse(JSON.stringify(detail.table.rows)));
  assert.equal(basic.table.headers.length,35);
  assert.equal(basic.table.headers[7],"Annual sell-out (YTD)");
  assert.equal(basic.table.headers[32],"Your units sold (selected period)");
  assert.equal(basic.table.headers[14],"Stock status");
  for(const role of ["ps","manager","district_manager","admin"]){
    for(const search of [" zero ","ZeRo"]){
      const filtered=render(role,{}, {inventoryProductSearch:search});
      assert.equal(filtered.table.rows.length,1);assert.equal(filtered.table.rows[0][1],"ZERO");
      const original=render(role).table.rows.find(row=>row[1]==="ZERO");
      assert.deepEqual(Array.from(filtered.table.rows[0]),Array.from(original));
    }
    assert.equal(render(role,{}, {inventoryProductSearch:"tcl"}).table.rows.length,render(role).table.rows.filter(row=>row[3]==="TCL").length);
    assert.equal(render(role,{}, {inventoryProductSearch:"nonexistent model"}).table.rows.length,0);
    assert.equal(render(role,{}, {inventoryProductSearch:"foreign"}).table.rows.length,0);
  }
});

test("annual learning uses January through last completed month, ignoring last-year and partial-month demand", () => {
  const { table } = render("ps", { brandSales: [
    { branch_id: "one", barcode: "001", sold_on: "2025-11-01", quantity: 150 },
    { branch_id: "one", barcode: "001", sold_on: "2026-08-01", quantity: 24 },
    { branch_id: "one", barcode: "001", sold_on: "2026-11-04", quantity: 4 },
  ] }, { inventoryForecastFrom: "", inventoryForecastTo: "" });
  const row = table.rows.find(row => row[1] === "001");
  assert.equal(row[7], 28);
  assert.equal(row[11], 24);
  assert.equal(row[12], 8);
  assert.equal(row[18], 4);
  assert.equal(row[19], 0);
  assert.equal(row[13], 3);
  assert.equal(row[20], "2026-01-01");
  assert.equal(row[21], 10);
});

test("three-month stock target rounds the unrounded rate once; current-month sales do not reduce stock coverage", () => {
  const options = { products: [product("001", 3)], from: "2025-11-01", to: "2026-10-31",
    facts: [sale(150, "2025-11-01")] };
  const row = forecast(options).products[0];
  assert.equal(row.forecast, 13);
  assert.equal(row.stockTarget,38);
  assert.equal(row.reorder, 35);
  const fulfilled = forecast({ ...options, facts: [...options.facts, sale(4, "2026-11-04")] }).products[0];
  assert.equal(fulfilled.branchSold, 150);
  assert.equal(fulfilled.soldThisMonth, 4);
  assert.equal(fulfilled.remainingDemand, 9);
  assert.equal(fulfilled.reorder, 35);
  const complete = forecast({ ...options, products: [product("001", 0)],
    facts: [...options.facts, sale(13, "2026-11-04")] }).products[0];
  assert.equal(complete.reorder, 38);
  assert.equal(complete.stockAlert, "Critical stock");
});

test("returns reduce historical net sell-out and current-month fulfillment without negative forecasts", () => {
  const row = forecast({ facts: [sale(110), sale(-10)] }).products[0];
  assert.equal(row.branchSold, 100);
  assert.equal(row.forecast, 10);
  const current = forecast({ facts: [sale(100), sale(4, "2026-11-01"), sale(-1, "2026-11-02")] }).products[0];
  assert.equal(current.soldThisMonth, 3);
  assert.equal(current.remainingDemand, 7);
  assert.equal(current.reorder, 25);
  assert.equal(forecast({ facts: [sale(-5)] }).products[0].forecast, 0);
});

test("automatic denominators include branch quiet months before each item's first sale", () => {
  const rows = forecast({ from: "0001-01-01", to: "2026-10-31",
    products: [product(), product("NEW"), product("NONE")],
    facts: [sale(100, "2026-01-01"), sale(10, "2026-10-01", "NEW")] }).products;
  assert.equal(rows[0].historyMonths, 10);
  assert.equal(rows[1].historyMonths, 10);
  assert.equal(rows[0].forecast, 10);
  assert.equal(rows[1].forecast, 1);
  assert.equal(rows[2].forecast, 0);
});

test("one sale across a year with two units available is slow moving, forecasts one and never reorders",()=>{
  const row=forecast({from:"0001-01-01",to:"2026-10-31",products:[product("SLOW",2)],
    facts:[sale(10,"2025-11-01","OTHER"),sale(1,"2026-10-31","SLOW")]}).products[0];
  assert.equal(row.historyFrom,"2026-01-01");assert.equal(row.historyMonths,10);
  assert.equal(row.branchSold,1);assert.equal(row.forecast,1);assert.equal(row.reorder,0);
  assert.equal(row.stockAlert,"Sufficient stock");assert.equal(row.movementStatus,"Slow moving");
  assert.match(row.movementReason,/1 net branch units \/ 10/);
});
test("automatic thin history never extrapolates one day into a month's reorder; branch histories remain separate",()=>{
  const rows=forecast({from:"0001-01-01",to:"2026-10-31",branchIds:new Set(["one","two"]),
    products:[product("SLOW",2),product("SLOW",2,"two")],
    facts:[sale(1,"2025-11-01","OTHER"),sale(1,"2026-10-31","SLOW"),sale(1,"2026-10-31","SLOW","two")]}).products;
  assert.equal(rows[0].forecast,1);assert.equal(rows[0].reorder,0);
  assert.equal(rows[1].forecast,1);assert.equal(rows[1].reorder,0);
  assert.equal(rows[1].historyMonths,10);
  assert.equal(rows[1].movementStatus,"Slow moving");
});
test("movement labels use raw net branch demand, three-month threshold, returns and exact barcode",()=>{
  for(const [units,status] of [[0,"No recorded net sales"],[-1,"No recorded net sales"],[2,"Slow moving"],[3,"Regular movement"]]){
    const row=forecast({from:"2026-08-01",to:"2026-10-31",facts:[sale(units)]}).products[0];
    assert.equal(row.movementStatus,status);
  }
  assert.equal(forecast({from:"2026-09-01",to:"2026-10-31",facts:[sale(1)]}).products[0].movementStatus,"Insufficient history");
  assert.equal(forecast({unavailable:true}).products[0].movementStatus,"Unavailable");
});

test("reversed forecast calendars are rejected without changing saved dates or results", () => {
  const listeners = {}, alerts = [];
  let refreshed = 0, saved = 0;
  const ui = { inventoryForecastFrom: "2026-01-01", inventoryForecastTo: "2026-10-31" };
  const context = vm.createContext({
    ui, resultsView: () => "", connectedContent: { addEventListener: (type, fn) => { listeners[type] = fn; } },
    alert: message => alerts.push(message), refreshResults: () => refreshed++, saveAccountFilters: () => saved++,
  });
  const start = source.indexOf('  connectedContent.addEventListener("input", event => {\n    const control = event.target.closest("[data-filter]");');
  vm.runInContext(source.slice(start, source.indexOf('  connectedContent.addEventListener("change",', start)), context);
  const control = { dataset: { filter: "inventoryForecastFrom" }, value: "2026-11-01", closest: () => null };
  listeners.input({ target: { closest: () => control } });
  assert.equal(alerts.length, 1);
  assert.equal(ui.inventoryForecastFrom, "2026-01-01");
  assert.equal(control.value, "2026-01-01");
  assert.equal(refreshed, 0);
  assert.equal(saved, 0);
  control.value = "2026-02-01";
  listeners.input({ target: { closest: () => control } });
  assert.equal(ui.inventoryForecastFrom, "2026-02-01");
  assert.equal(refreshed, 1);
  assert.equal(saved, 1);
});
