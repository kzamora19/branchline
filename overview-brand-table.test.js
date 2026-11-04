const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test("Overview retains brand charts but does not render the duplicate brand table for any sales role", () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    for (const brands of [[], [{ brand: "TCL", actual: 100 }]]) {
      const context = vm.createContext({
        currentProfile: { role }, demoStore: null, ui: { month: "2026-11" },
        mountPage: (_heading, _actions, _filters, draw) => draw(),
        pageHeading() {}, filterBar() {}, monthLabel: String, anchorMonth: () => "2026-11",
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
