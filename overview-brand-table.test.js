const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test("sales chart legends show brand shares for PSs and add amounts for management", () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    const context = vm.createContext({
      currentProfile: { role }, escapeHTML: String, PERCENT_DECIMALS: 4,
      PIE_COLORS: ["#355ee8", "#16a34a"], chartExport: () => "",
      formatMoney: value => "₱" + Number(value).toFixed(2),
    });
    vm.runInContext(section("  function pieChart(", "  // Share of the target"), context);
    vm.runInContext(section("  function brandPie(", "  const tableStore"), context);
    const html = vm.runInContext('brandPie("Sales by brand", "November", [{label:"Midea / Toshiba",value:80},{label:"TCL",value:20}])', context);
    const legend = html.match(/<ul class="pie-legend">.*?<\/ul>/s)?.[0];
    assert.ok(legend, role);
    assert.match(legend, /Midea \/ Toshiba/);
    assert.match(legend, /TCL/);
    assert.match(legend, /80\.0000%/);
    assert.match(legend, /20\.0000%/);
    if (role === "ps") {
      assert.doesNotMatch(legend, /₱/);
      const sharedChart = vm.runInContext('pieChart("Payment modes", "November", [{label:"Cash",value:80}])', context);
      assert.doesNotMatch(sharedChart.match(/<ul class="pie-legend">.*?<\/ul>/s)[0], /₱/);
    } else {
      assert.match(legend, /₱80\.00 · 80\.0000%/);
      assert.match(legend, /₱20\.00 · 20\.0000%/);
    }
  }
});

test("Overview retains brand charts but does not render the duplicate brand table for any sales role", () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    for (const brands of [[], [{ brand: "TCL", actual: 100 }]]) {
      const context = vm.createContext({
        currentProfile: { role }, demoStore: null, ui: { month: "2026-11" },
        mountPage: (_heading, _actions, _filters, draw) => draw(),
        pageHeading() {}, filterBar() {}, exportButton: () => "", monthLabel: String, anchorMonth: () => "2026-11",
        statusLabel: () => "MTD", scopeBranchIds: () => new Set(["allowed"]),
        panelIds: (_key, ids) => ids, brandRows: () => brands,
        branchRows: () => [{ actual: 100, target: 200, ytd: 1000, ytdTarget: 2000 }],
        psTargetCharts: () => [], progressChart: () => "", brandProgressChart: () => "",
        brandPie: () => '<div data-pie-table="brands"></div>',
        escapeHTML: String, formatMoney: String, percent: () => "",
        overviewPaymentPanels: () => "", psRankingPanel: () => "",
        brandTable: () => assert.fail("Overview must not render the brand table"),
      });
      vm.runInContext(section("  function renderOverview(", "  function brandPerformancePanel("), context);
      assert.match(vm.runInContext("renderOverview()", context), /data-pie-table="brands"/);
    }
  }
});

test("brand chart opens the standalone table when no inline source exists, including empty charts", () => {
  const context = vm.createContext({
    resultsView: () => "", document: { querySelector: () => null },
    brandPerformancePanel: () => "scoped brand table",
    currentProfile: { role: "ps" },
    alert: () => assert.fail("Brand table must remain available"),
  });
  vm.runInContext(section("  function openPieTable(", "    closeModal();") + "pickedSource = source;\n  }", context);
  vm.runInContext('openPieTable("brands", {})', context);
  assert.equal(context.pickedSource, context.brandPerformancePanel);
});

test("standalone brand table retains the same scoped rows, controls and product drilldown renderer", () => {
  const ids = new Set(["allowed"]), rows = [{ brand: "TCL", actual: 100 }];
  const context = vm.createContext({
    scopeBranchIds: () => ids,
    panelIds: (key, scoped) => { assert.equal(key, "brandBranch"); assert.equal(scoped, ids); return scoped; },
    brandRows: scoped => { assert.equal(scoped, ids); return rows; },
    brandTable: (data, empty) => {
      assert.equal(data, rows);
      assert.equal(empty, "No brand sales for this selection.");
      return "existing table";
    },
    brandPanelControl: () => "existing controls",
    panel: (title, _note, content, controls) => ({ title, content, controls }),
  });

  vm.runInContext(section("  function brandPerformancePanel(", "  function branchPerformancePanel("), context);
  assert.deepEqual({ ...vm.runInContext("brandPerformancePanel()", context) }, {
    title: "Brand performance", content: "existing table", controls: "existing controls",
  });
});

test("PS contribution chart opens its own authorized brand log directly for all assigned brands", () => {
    for (const assigned_brand of ["TCL", "MIDEA / TOSHIBA", "FUJIDENZO / WHIRLPOOL", "CON-DEVANT"]) {
      const context = vm.createContext({
        resultsView: () => "", document: { querySelector: () => null },
        brandLogPanel: () => "authorized price-free branch log",
        currentProfile: { role: "ps", assigned_brand },
        alert: () => assert.fail("Contribution table must remain available"),
      });
      vm.runInContext(section("  function openPieTable(", "    closeModal();") + "pickedSource = source;\n  }", context);
      vm.runInContext('openPieTable("brandlog", {})', context);
      assert.equal(context.pickedSource, context.brandLogPanel);
    }
  });

  test("failed brand-log loading retains its popup source and real error instead of looking like a missing table", () => {
    const context = vm.createContext({
      currentProfile: { role: "ps", assigned_brand: "MIDEA / TOSHIBA" },
      liveData: { brandSalesError: "Unable to load authorized branch log: fixture failure" },
      escapeHTML: String,
      panel: (title, detail, body, action, sourceKey) => ({ title, detail, body, action, sourceKey }),
    });
    vm.runInContext(section("  function brandLogPanel(", "  function inventoryStockFor("), context);
    const result = vm.runInContext("brandLogPanel()", context);
    assert.equal(result.sourceKey, "brandlog");
    assert.match(result.body, /role="alert"/);
    assert.match(result.body, /fixture failure/);
    assert.match(result.body, /contribution chart is loaded separately/);
    assert.doesNotMatch(result.body, /No sales/);
  });
