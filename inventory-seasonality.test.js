"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const I = require("./inventory.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8").replace(/\r\n/g, "\n");
const product = { branch_id: "one", barcode: "001", category: "Aircon", brand: "TCL", quantity: 5 };
function history() {
  return [2024, 2025].flatMap(year => Array.from({ length: 12 }, (_, index) => ({
    branchId: "one", barcode: "001", category: "Aircon", date: `${year}-${String(index + 1).padStart(2, "0")}-15`,
    quantity: index === 3 ? 30 : 10,
  })));
}
function forecast(options = {}) {
  return A.inventoryForecast({
    products: [product], facts: history(), branchIds: new Set(["one"]),
    from: "2024-01-01", to: "2025-12-31", today: "2026-11-04", targetMonth: "2027-04", ...options,
  });
}

test("summer category pattern raises April demand and other months use their own observed factor", () => {
  const april = forecast().products[0];
  assert.equal(april.branchSold, 280);
  assert.equal(april.seasonalFactor, 30 * 12 / 140);
  assert.equal(april.forecast, 30);
  assert.equal(april.stockTarget,90);
  assert.equal(april.reorder, 85);
  assert.equal(april.forecastBasis, "Seasonal category pattern (2024, 2025)");
  const december = forecast({ targetMonth: "2026-12" }).products[0];
  assert.equal(december.seasonalFactor, 10 * 12 / 140);
  assert.equal(december.forecast, 10);
  assert.equal(december.reorder, 25);
  assert.equal(december.forecastMonth, "2026-12");
});

test("annual baseline retains older complete years for seasonal evidence and targets three months",()=>{
  const facts=[{...history()[0],date:"2024-01-01",barcode:"OTHER",category:"Other",quantity:1},
    ...history(),...history().filter(row=>row.date.startsWith("2025")).map(row=>({...row,date:row.date.replace("2025","2026")}))];
  const row=forecast({facts,from:"0001-01-01",to:"2026-10-31",targetMonth:"2027-04"}).products[0];
  assert.equal(row.historyFrom,"2026-01-01");assert.equal(row.historyTo,"2026-10-31");
  assert.equal(row.historyMonths,10);assert.equal(row.branchSold,120);
  assert.equal(row.forecast,31);assert.equal(row.stockTarget,93);assert.equal(row.reorder,88);
  assert.equal(row.forecastBasis,"Seasonal category pattern (2024, 2025)");
});

test("category seasonality is shared by other items but never by a different branch or category", () => {
  const facts = [...history(),
    ...history().map(row => ({ ...row, barcode: "002", quantity: row.quantity * 2 })),
    ...history().map(row => ({ ...row, barcode: "TV", category: "TV", quantity: row.date.slice(5, 7) === "12" ? 120 : 0 })),
    ...history().map(row => ({ ...row, branchId: "two", quantity: row.date.slice(5, 7) === "04" ? 10 : 30 }))];
  const result = forecast({ facts, branchIds: new Set(["one", "two"]), products: [
    product, { ...product, barcode: "002" }, { ...product, branch_id: "two" }, { ...product, category: "TV", barcode: "TV" },
  ] }).products;
  assert.equal(result[0].forecast, 30);
  assert.equal(result[1].forecast, 60);
  assert.equal(result[2].forecast, 10);
  assert.equal(result[3].seasonalFactor, 0);
  assert.equal(result[3].forecast, 0);
  assert.match(result[3].forecastBasis, /Seasonal category pattern/);
});

test("Q4-only gas-range demand learns quiet months and forecasts each target month separately", () => {
  const activity = history().map(row => ({ ...row, barcode: "OTHER", category: "Other", quantity: 1 }));
  const gas = history().filter(row => Number(row.date.slice(5, 7)) >= 10).map(row => ({
    ...row, barcode: "GAS", category: "Gas range", quantity: ({ "10": 30, "11": 40, "12": 50 })[row.date.slice(5, 7)],
  }));
  const options = { facts: [...activity, ...gas], products: [{ ...product, barcode: "GAS", category: "Gas range", quantity: 3 }] };
  for (const [month, units] of [["01", 0], ["04", 0], ["07", 0], ["10", 30], ["11", 40], ["12", 50]]) {
    const row = forecast({ ...options, targetMonth: `2026-${month}` }).products[0];
    assert.equal(row.branchSold, 240);
    assert.equal(row.forecast, units);
    assert.equal(row.reorder, Math.max(0, units * 3 - 3));
    assert.equal(row.seasonalFactor, units / 10);
    assert.match(row.forecastBasis, /Seasonal category pattern \(2024, 2025\)/);
  }
  const current = forecast({ ...options, targetMonth: undefined, facts: [...options.facts,
    { ...gas[0], date: "2026-11-02", quantity: 4 },
    { ...gas[0], date: "2026-11-05", quantity: 999 },
  ] }).products[0];
  assert.equal(current.forecastMonth, "2026-11");
  assert.equal(current.forecast, 40);
  assert.equal(current.soldThisMonth, 4);
  assert.equal(current.remainingDemand, 36);
  assert.equal(current.reorder, 117);
  const missingMonth = forecast({ ...options, targetMonth: "2026-11",
    facts: options.facts.filter(row => row.date !== "2024-02-15") }).products[0];
  assert.equal(missingMonth.seasonalFactor, 1);
  assert.match(missingMonth.forecastBasis, /insufficient seasonal history/);
  const otherBranch = forecast({ ...options, targetMonth: "2026-11",
    facts: [...gas, ...activity.map(row => ({ ...row, branchId: "two" }))] }).products[0];
  assert.equal(otherBranch.seasonalFactor, 1);
});

test("incomplete years, missing months and missing classification use labelled monthly average", () => {
  for (const options of [
    { facts: history().filter(row => row.date >= "2025") },
    { facts: history().filter(row => row.date !== "2024-02-15") },
    { from: "2024-01-02" },
    { to: "2025-12-30" },
    { facts: history().map(row => ({ ...row, category: "" })), products: [{ ...product, category: "" }] },
    { facts: history().map(row => ({ ...row, category: "Unclassified" })), products: [{ ...product, category: "Unclassified" }] },
  ]) {
    const result = forecast(options), row = result.products[0];
    assert.equal(row.seasonalFactor, 1);
    assert.equal(row.forecast, Math.ceil(row.branchSold / result.months));
    assert.match(row.forecastBasis, /Monthly average \(insufficient seasonal history\)/);
  }
});

test("two full prior years must lie inside learning dates, no target/future sales leak into learning", () => {
  const oldTarget = forecast({ targetMonth: "2025-04" });
  assert.equal(oldTarget.to, "2025-03-31");
  assert.equal(oldTarget.months, 15);
  assert.equal(oldTarget.products[0].branchSold, 170);
  assert.equal(oldTarget.products[0].seasonalFactor, 1);
  const extra = forecast({ facts: [...history(), { ...history()[0], date: "2027-04-01", quantity: 99999 }] });
  assert.equal(extra.products[0].forecast, 30);
  const future = forecast({ from: "2027-01-01", to: "2027-03-31" }).products[0];
  assert.equal(future.forecast, null);
  assert.equal(future.seasonalFactor, null);
  assert.equal(future.forecastBasis, "Insufficient history");
});

test("fallback has no preset aircon summer boost, failed loads and zero history stay explicit", () => {
  const short = forecast({ from: "2026-01-01", to: "2026-10-31", facts: [
    { ...history()[0], date: "2026-04-01", quantity: 100 },
  ] }).products[0];
  assert.equal(short.forecast, 10);
  assert.equal(short.reorder, 25);
  assert.equal(short.seasonalFactor, 1);
  const failed = forecast({ unavailable: true }).products[0];
  assert.equal(failed.forecast, null);
  assert.equal(failed.seasonalFactor, null);
  assert.equal(failed.forecastBasis, "Forecast unavailable");
  const empty = forecast({ facts: [] }).products[0];
  assert.equal(empty.forecast, 0);
  assert.equal(empty.reorder, 0);
  assert.equal(empty.seasonalFactor, 1);
});

test("default forecast month stays in the current month and invalid month is rejected", () => {
  const options = { targetMonth: undefined, today: "2026-12-31" };
  assert.equal(forecast(options).targetMonth, "2026-12");
  for (const targetMonth of ["", "2027-00", "2027-13", "April", "2027-04-01"]) {
    assert.throws(() => forecast({ targetMonth }), /valid forecast month/);
  }
});

test("category labels ignore case and spaces; absent historic category can use exact catalog identity", () => {
  const result = forecast({ facts: history().map(row => ({ ...row, category: row.date.startsWith("2024") ? " AIRCON " : "" })) }).products[0];
  assert.equal(result.forecast, 30);
  assert.match(result.forecastBasis, /Seasonal category pattern/);
  const badCode = forecast({ facts: history().map(row => ({ ...row, barcode: "1", category: "" })) }).products[0];
  assert.equal(badCode.forecast, 0);
  assert.equal(badCode.seasonalFactor, 1);
});

test("actual inventory table wires target month, seasonal metadata, branch-only units and red-bold shortage", () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    const tables = new Map(), personal = history().map(row => ({ ...row, quantity: row.quantity / 10, amount: 10 }));
    const annualFacts = [{...history()[0],date:"2024-01-01",quantity:0}, ...history(),
      {...history()[0],date:"2026-01-01",quantity:100}];
    const context = vm.createContext({
      activeClimateAdjustments: () => [], climateReviewPanel: () => "",
      calendarClosures: () => [], companyHolidayDates: () => [], activeEventAdjustments: () => [], eventCalendarPanel: () => "",
      window: { BranchlineAnalytics: A, BranchlineInventory: I }, PAGE_SIZE: 10,
      ui: { inventoryForecastFrom: "2024-01-01", inventoryForecastTo: "2025-12-31", inventoryForecastMonth: "2027-04" },
      currentProfile: { id: "self", role, assigned_brand: "TCL", branch_id: "one" },
      liveData: { inventoryCatalog: [{ ...product, model_description: "Summer unit" }],
        inventoryStock: [{ ...product, quantity: 0 }], inventorySerials: [], profiles: [],
        brandSales: annualFacts.map(row => ({ branch_id: row.branchId, barcode: row.barcode, category: row.category, sold_on: row.date, quantity: row.quantity })) },
      branchName: String, formatMoney: String, escapeHTML: String, localISODate: date => date.toISOString().slice(0, 10),
      panel: (_title, _note, html, controls) => html + (controls || ""),
      tableBlock: (key, headers, rows, rowHtml) => { tables.set(key, { headers, items: rows }); return rows.map(rowHtml).join(""); },
      ids: new Set(["one"]), inputFacts: role === "ps" ? personal : annualFacts.map(row => ({ ...row, amount: 100 })),
    });

    test("forecast month is persisted per account and invalid stored month resets to automatic current month", () => {
      const store = new Map(), ui = {};
      const context = vm.createContext({
        ui, demoStore: null, currentProfile: { id: "one", dealer_id: "dealer" },
        window: { BranchlineAnalytics: A }, currentMonth: () => "2026-11",
        resetUi: () => Object.assign(ui, { period: "month", month: "2026-11", date: "", district: "", branch: "", anRange: "month" }),
        localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
        console,
      });

      test("current-month forecast uses elapsed sales through today for the same month's re-order", () => {
        const result = forecast({ targetMonth: undefined, from: "2026-11-01", to: "2026-11-30", facts: [
          { ...history()[0], date: "2026-11-04", quantity: 2 },
          { ...history()[0], date: "2026-11-05", quantity: 999 },
        ] });
        assert.equal(result.targetMonth, "2026-11");
        assert.equal(result.to, "2026-11-04");
        assert.equal(result.months, 4 / 30);
        assert.equal(result.products[0].branchSold, 2);
        assert.equal(result.products[0].forecast, 15);
        assert.equal(result.products[0].remainingDemand, 13);
        assert.equal(result.products[0].reorder, 40);
        const firstDay = forecast({ targetMonth: undefined, today: "2026-01-01",
          from: "2026-01-01", to: "2026-01-31", facts: [{ ...history()[0], date: "2026-01-01", quantity: 1 }] });
        assert.equal(firstDay.targetMonth, "2026-01");
        assert.equal(firstDay.products[0].forecast, 31);
      });

      test("sorting restores the replaced table's horizontal position in both directions", () => {
        const start = source.indexOf("    if (sortButton) {", source.indexOf('const sortButton = event.target.closest("[data-sort-table]")'));
        const handler = source.slice(start, source.indexOf('    if (event.target.closest("[data-delete-products]")', start));
        for (const tableKey of ["an-inventory-products", "products"]) {
          const ui = { sort: {}, pages: { [tableKey]: 3 } };
          for (const position of [850, 850, 0]) {
            const replacement = { scrollLeft: 0 };
            let refreshed = false;
            vm.runInNewContext(`(function () { ${handler} })()`, {
              ui, sortButton: { dataset: { sortTable: tableKey, sortCol: "13" }, closest: () => ({ scrollLeft: position }) },
              refreshResults: () => { refreshed = true; },
              connectedContent: { querySelector: selector => {
                assert.ok(refreshed);
                assert.equal(selector, `[data-sort-table="${tableKey}"]`);
                return { closest: () => replacement };
              } },
            });
            assert.equal(replacement.scrollLeft, position);
            assert.equal(ui.pages[tableKey], 1);
            assert.equal(ui.sort[tableKey].col, 13);
          }
          assert.equal(ui.sort[tableKey].dir, "asc");
        }
      });
      vm.runInContext(source.slice(source.indexOf("  const universalPages"), source.indexOf("  let productsFiltered")), context);
      context.restoreAccountFilters();
      ui.inventoryForecastMonth = "2027-04";
      context.saveAccountFilters();
      context.currentProfile = { id: "two", dealer_id: "dealer" };
      context.restoreAccountFilters();
      assert.equal(ui.inventoryForecastMonth, "");
      context.currentProfile = { id: "one", dealer_id: "dealer" };
      context.restoreAccountFilters();
      assert.equal(ui.inventoryForecastMonth, "2027-04");
      context.currentProfile = { id: "bad", dealer_id: "dealer" };
      store.set(context.filterStorageKey(), JSON.stringify({ inventoryForecastMonth: "2027-13" }));
      context.restoreAccountFilters();
      assert.equal(ui.inventoryForecastMonth, "");
    });

    test("cleared/invalid forecast month reports an error instead of silently applying a target", () => {
      const listeners = {}, alerts = [];
      let refreshed = 0;
      const ui = { inventoryForecastMonth: "2027-04" };
      const context = vm.createContext({
        ui, window: { BranchlineAnalytics: A }, localISODate: () => "2026-11-04",
        resultsView: () => "", connectedContent: { addEventListener: (type, fn) => { listeners[type] = fn; } },
        refreshResults: () => refreshed++, saveAccountFilters: () => {},
        alert: message => alerts.push(message),
      });
      const start = source.indexOf('  connectedContent.addEventListener("input", event => {\n    const control = event.target.closest("[data-filter]");');
      vm.runInContext(source.slice(start, source.indexOf('  connectedContent.addEventListener("change",', start)), context);
      for (const value of ["", "2027-13"]) {
        const control = { dataset: { filter: "inventoryForecastMonth" }, value, closest: () => null };
        listeners.input({ target: { closest: () => control } });
        assert.equal(control.value, "2027-04");
        assert.equal(ui.inventoryForecastMonth, "2027-04");
      }
      assert.equal(alerts.length, 2);
      assert.equal(refreshed, 0);
    });
    const start = source.indexOf("  function analyticsDataTable(");
    vm.runInContext(source.slice(start, source.indexOf("  function allTimeAnalyticsPanels(", start)), context);
    const html = vm.runInContext('inventoryAnalyticsPanels(ids,inputFacts,"2024-01-01","2025-12-31","2026-11-04")', context);
    const table = tables.get("an-inventory-products"), row = table.items[0];
    assert.equal(row[7], 100);
    assert.equal(row[32], role === "ps" ? 28 : 280);
    assert.equal(row[12], 78);
    assert.equal(row[13], 78);
    assert.equal(row[15], "2027-04");
    assert.equal(row[16], 30 * 12 / 140);
    assert.equal(row[17], "Seasonal category pattern (2024, 2025)");
    assert.match(html, /inventory-stock-attention/);
    assert.match(html, /data-filter="inventoryForecastMonth" value="2027-04"/);
    context.tableStore = { "an-inventory-products": table };
    context.table = table;
    const exportStart = source.indexOf("  function tableToSheet(");
    vm.runInContext(source.slice(exportStart, source.indexOf("  function exportTable(", exportStart)), context);
    const sheet = vm.runInContext('tableToSheet(table,"Forecast")', context);
    assert.equal(sheet.rows[1][12], 78);
    assert.equal(typeof sheet.rows[1][16], "number");
    assert.equal(sheet.rows[1][15], "2027-04");
  }
});
