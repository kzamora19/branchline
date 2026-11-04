"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const A = require("./analytics.js");
const H = require("./daily-history.js");

function fixture(role = "manager", branches = ["one"], overrides = {}) {
  const context = vm.createContext({
    window: { BranchlineAnalytics: A, BranchlineDailyHistory: H },
    currentProfile: { id: "self", role }, isPs: role === "ps",
    ids: new Set(branches), dsYear: "2026", dsMonth: "11", dsPrefix: "2026-11", todayISO: "2026-11-04",
    liveData: {
      branchWalkins: [{ branch_id: "one", counted_on: "2026-11-02", visitors: 20 }],
      psWalkins: [
        { branch_id: "one", counted_on: "2026-11-02", ps_id: "self", clients_assisted: 5 },
        { branch_id: "one", counted_on: "2026-11-02", ps_id: "other", clients_assisted: 3 },
        { branch_id: "two", counted_on: "2026-11-02", ps_id: "self", clients_assisted: 100 },
      ],
      dailyHistory: [],
      ...overrides,
    },
    panelIds: (_key, ids) => ids,
    analyticsFacts: ids => [
      { branchId: "one", date: "2026-11-02", saleId: "own" },
      { branchId: "one", date: "2026-11-02", saleId: "own" },
      ...(role === "ps" ? [] : [{ branchId: "one", date: "2026-11-02", saleId: "other" },
        { branchId: "two", date: "2026-11-02", saleId: "remote" }]),
    ].filter(row => ids.has(row.branchId)),
    totalOf: () => ({ count: 2, total: 500 }),
    escapeHTML: text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    formatMoney: amount => `P${amount}`, monthLabel: month => month, chartExport: () => "",
  });
  vm.runInContext(section("  function withHistoryTransactions(", "  function analyticsFacts("), context);
  vm.runInContext(section("        const dailyIds =", "        const monthTotal ="), context);
  vm.runInContext(section("  function dailySalesChart(", "  function growthCell("), context);
  return {
    day: date => vm.runInContext(`dayRows.find(row => row.date === "${date}")`, context),
    html: () => vm.runInContext('dailySalesChart(dayRows, dsPrefix, todayISO, isPs)', context),
  };
}

test("daily hover uses scoped store traffic, deduplicated invoices and conversion for all manager roles", () => {
  for (const role of ["manager", "district_manager", "admin"]) {
    const result = fixture(role);
    assert.equal(result.day("2026-11-02").traffic.visitors, 20);
    assert.equal(result.day("2026-11-02").traffic.transactions, 2);
    assert.match(result.html(), /\|Walk-ins: 20\|Conversion rate: 10\.0%/);
    assert.match(result.html(), /aria-label="[^"]*Walk-ins: 20, Conversion rate: 10\.0%"/);
  }
});

test("PS daily hover uses only that person's clients and personal invoice count", () => {
  const result = fixture("ps");
  assert.equal(result.day("2026-11-02").traffic.visitors, 5);
  assert.equal(result.day("2026-11-02").traffic.transactions, 1);
  assert.match(result.html(), /\|Clients assisted: 5\|Conversion rate: 20\.0%/);
  assert.doesNotMatch(result.html(), /Walk-ins:/);
});

test("missing and zero traffic are distinguished; zero sales with traffic has zero conversion", () => {
  const missing = fixture();
  assert.match(missing.html(), /2026-11-01[^|]*\|2 sales\|P500\|Walk-ins: Not recorded\|Conversion rate: n\/a/);
  const zero = fixture("manager", ["one"], { branchWalkins: [{ branch_id: "one", counted_on: "2026-11-02", visitors: 0 }] });
  assert.match(zero.html(), /\|Walk-ins: 0\|Conversion rate: n\/a/);
  const noSales = fixture("manager", ["one"], { branchWalkins: [{ branch_id: "one", counted_on: "2026-11-01", visitors: 10 }] });
  assert.equal(noSales.day("2026-11-01").traffic.conversion, 0);
  assert.match(noSales.html(), /\|Walk-ins: 10\|Conversion rate: 0\.0%/);
  assert.match(noSales.html(), /2026-11-05[^|]*\|Not yet recorded\|Future day[^|]*\|Walk-ins: Not recorded\|Conversion rate: n\/a/);
  assert.doesNotMatch(zero.html(), /NaN|Infinity/);
});

test("multi-branch scope uses weighted traffic and PS fallback; partial coverage is disclosed", () => {
  const all = fixture("district_manager", ["one", "two"]);
  assert.equal(all.day("2026-11-02").traffic.visitors, 120);
  assert.equal(all.day("2026-11-02").traffic.transactions, 3);
  assert.match(all.html(), /\|Walk-ins: 120\|Conversion rate: 2\.5%/);
  const partial = fixture("district_manager", ["one", "two"], { psWalkins: [] });
  assert.equal(partial.day("2026-11-02").traffic.transactions, 2);
  assert.match(partial.html(), /\|Walk-ins: 20\|Conversion rate: 10\.0% \(counted branches only\)/);
});

test("historical walk-ins and transaction sources match Analytics; real store count wins", () => {
  const history = [{ branch_id: "one", day: "2026-11-02", walkins: 50, transactions: 8, sales: 500 }];
  const historical = fixture("manager", ["one"], { branchWalkins: [], dailyHistory: history });
  assert.match(historical.html(), /\|Walk-ins: 50\|Conversion rate: 16\.0%/);
  const real = fixture("manager", ["one"], { dailyHistory: history });
  assert.match(real.html(), /\|Walk-ins: 20\|Conversion rate: 40\.0%/);
  const ps = fixture("ps", ["one"], { dailyHistory: history });
  assert.match(ps.html(), /\|Clients assisted: 5\|Conversion rate: 20\.0%/);
});

test("shared tooltip renders extra daily lines safely without changing pie tooltip layout", () => {
  const context = vm.createContext({
    pieTip: { style: {}, offsetWidth: 200, offsetHeight: 80 },
    escapeHTML: text => String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    window: { innerWidth: 1000 },
  });
  vm.runInContext(section("  function showPieTip(", "  function hidePieTip("), context);
  const render = tip => {
    context.slice = { dataset: { tip } };
    vm.runInContext("showPieTip(slice, 500, 300)", context);
    return context.pieTip.innerHTML;
  };
  assert.equal(render("Brand|P100|25%"), "<strong>Brand</strong><span>P100 · 25%</span>");
  assert.equal(render("Brand||25%"), "<strong>Brand</strong><span>25%</span>");
  assert.match(render("Date|2 sales|P500|Walk-ins: 20|Conversion rate: 10.0%"), /<span>Walk-ins: 20<\/span><span>Conversion rate: 10\.0%<\/span>/);
  assert.match(render("Date|2 sales|P500|<img>|n/a"), /&lt;img&gt;/);
});
