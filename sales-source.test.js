const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const H = require("./daily-history.js");
const A = require("./analytics.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const fact = (saleId, date, amount, branchId = "one") => ({ saleId, date, amount, branchId, psId: "ps", quantity: 1 });
const raw = [
  fact("jan-a", "2026-01-01", 100), fact("jan-a", "2026-01-01", 50), fact("jan-b", "2026-01-09", 50),
  fact("sep", "2026-09-10", 300), fact("oct", "2026-10-01", 100), fact("oct-gap", "2026-10-09", 20),
  fact("nov", "2026-11-02", 40), fact("prior-jan", "2025-01-01", 80), fact("prior-oct", "2025-10-01", 150),
  fact("two-jan", "2026-01-01", 50, "two"), fact("two-oct", "2026-10-01", 70, "two"),
  fact("foreign", "2026-10-01", 999999, "foreign"),
];
const row = (day, sales, transactions, walkins = 20, branch_id = "one") => ({ branch_id, day, sales, transactions, walkins });
const history = [
  row("2026-01-01", 9999, 5), row("2026-09-01", 9000, 9),
  row("2026-10-01", 1000, 2), row("2026-10-02", -50, 0),
  row("2025-01-01", 8000, 3), row("2025-10-01", 9000, 7), row("2025-06-01", 5000, 2),
  row("2026-10-01", 999999, 99, 99, "foreign"),
];
const sum = facts => facts.reduce((total, f) => total + f.amount, 0);

function context(role = "admin", ids = new Set(["one"])) {
  const c = vm.createContext({
    window: { BranchlineDailyHistory: H, BranchlineAnalytics: A },
    currentProfile: { role, id: "ps" }, ui: {}, liveData: { dailyHistory: history, branchWalkins: [], psWalkins: [] },
    branchName: id => id, addTo: (map, key, value) => map.set(key, (map.get(key) || 0) + value),
    escapeHTML: String, formatMoney: value => `P${value}`, monthLabel: value => value,
    panel: (title, note, html) => `${title}\n${note}\n${html}`,
    manualExport: (key, title, head, rows) => { c.exports.set(key, rows); return ""; },
    columnFilterTable: (key, head, rows) => ({ html: "", kept: rows }),
    growthCell: value => String(value), exports: new Map(),
    scopeBranchIds: () => ids, anchorMonth: () => "2026-11", inStatus: date => date.startsWith("2026"),
    districtName: id => id, natural: (a, b) => a.localeCompare(b),
  });
  vm.runInContext(section("  function withHistoryFacts(", "  function analyticsFacts("), c);
  vm.runInContext(section("  function trafficStats(", "  function insightsPanel("), c);
  return c;
}

test("database sales win for both years; full October replaces partial imports by branch/month, never by day", () => {
  const ids = new Set(["one", "two"]);
  const input = JSON.stringify({ history, raw });
  const facts = H.reconcileSalesFacts(history, raw, ids);
  assert.equal(sum(facts.filter(f => f.date.startsWith("2026"))), 1610);
  assert.equal(sum(facts.filter(f => f.date.startsWith("2025"))), 230);
  assert.equal(sum(facts.filter(f => f.branchId === "one" && f.date.startsWith("2026-10"))), 950);
  assert.equal(sum(facts.filter(f => f.branchId === "two" && f.date.startsWith("2026-10"))), 70);
  assert.equal(facts.some(f => f.saleId === "oct-gap"), false, "Missing summary days must not fill with partial database sales");
  assert.equal(facts.some(f => f.date.startsWith("2025-06")), false, "Summary-only other months do not become sales");
  assert.deepEqual(H.SUMMARY_SALES_MONTHS, ["2026-10"]);
  assert.equal(JSON.stringify({ history, raw }), input, "No imported records are mutated");
});

test("summary transaction counts are independent of sales and replace whole months, including zero", () => {
  const counts = H.transactionFacts(history, raw, new Set(["one", "two"]));
  assert.equal(counts.filter(f => f.date.startsWith("2026")).length, 19);
  assert.equal(counts.filter(f => f.date.startsWith("2025")).length, 12);
  assert.equal(counts.filter(f => f.branchId === "one" && f.date.startsWith("2026-01")).length, 5);
  assert.equal(counts.some(f => f.saleId === "jan-b"), false);
  assert.equal(counts.some(f => f.date === "2026-10-02"), false, "A nonzero sales amount does not invent a transaction");
  assert.equal(H.transactionFacts([], raw, new Set(["one"])).length, 8, "Multiline invoices count once without monitoring");
  const zero = H.transactionFacts([row("2026-01-01", 100, 0)], raw, new Set(["one"]));
  assert.equal(zero.filter(f => f.date.startsWith("2026-01")).length, 0);
});

test("yearly comparison and exported months, YTD, average sale and conversion use the same authoritative sources", () => {
  const c = context();
  const ids = new Set(["one"]);
  const ctx = c.trafficContext(raw.filter(f => ids.has(f.branchId)), ids, false);
  const current = c.trafficStats(A, ctx, "2026-01-01", "2026-11-03");
  const prior = c.trafficStats(A, ctx, "2025-01-01", "2025-11-03");
  assert.equal(current.sales, 1490); assert.equal(current.transactions, 17);
  assert.equal(prior.sales, 230); assert.equal(prior.transactions, 12);
  assert.equal(current.avgTicket, 1490 / 17);
  assert.equal(current.visitors, 80); assert.equal(current.conversion, 16 / 80);
  const output = c.trafficPanels(A, ctx, "2026-11", "2026-11-03");
  const months = c.exports.get("traffic-monthly");
  assert.equal(months.find(r => r.month === "2026-01").stat.sales, 200);
  assert.equal(months.find(r => r.month === "2026-01").ly.sales, 80);
  assert.equal(months.find(r => r.month === "2026-06").ly.sales, 0);
  assert.equal(months.find(r => r.month === "2026-10").stat.sales, 950);
  assert.equal(months.find(r => r.month === "2026-10").ly.sales, 150);
  assert.match(output.trend, /Year to date<\/strong><\/td><td>P1490<\/td><td>P230<\/td>/);
  assert.match(output.trend, /Sales Database/);
});

test("PS sales and transactions are invoice-only; summary totals cannot be attributed to an account", () => {
  const c = context("ps");
  const ids = new Set(["one"]);
  const facts = raw.filter(f => ids.has(f.branchId));
  assert.equal(c.withHistoryFacts(facts, ids, true), facts);
  const ctx = c.trafficContext(facts, ids, true);
  const october = c.trafficStats(A, ctx, "2026-10-01", "2026-10-31");
  assert.equal(october.sales, 120); assert.equal(october.transactions, 2);
  assert.equal(october.visitors, 0);
});

test("Overview branch actuals and YTD match the yearly comparison, including the October exception", () => {
  const ids = new Set(["one", "two"]);
  const c = context("admin", ids);
  c.liveData.branches = [{ id: "one", name: "One", district_id: "d" }, { id: "two", name: "Two", district_id: "d" }];
  c.liveData.targets = [];
  c.analyticsFacts = () => raw.filter(f => ids.has(f.branchId));
  vm.runInContext(section("  function branchRows(", "  function personalTargetProgress("), c);
  const branches = c.branchRows();
  assert.equal(branches.find(r => r.branch.id === "one").ytd, 1490);
  assert.equal(branches.find(r => r.branch.id === "two").ytd, 120);
});

test("monthly targets use database amounts except October's complete summary, within branch scope", () => {
  const c = context();
  c.liveData.targets = [
    { branch_id: "one", month: "2026-01-01", amount: 1000 },
    { branch_id: "one", month: "2026-10-01", amount: 1000 },
    { branch_id: "foreign", month: "2026-10-01", amount: 1000 },
  ];
  Object.assign(c, {
    analyticsFacts: () => raw.filter(f => f.branchId === "one"),
    mountPage: (heading, before, filters, render) => render(), pageHeading() {}, filterBar() {},
    canSetPaymentTargets: () => false, searchQuery: () => "", targetInPeriod: () => true, matches: () => true,
    branchDistrictName: () => "District", statusLabel: () => "", tableBlock: (key, heads, rows) => { c.targetRows = rows; return ""; },
    brandTable: () => "", brandRows: () => [], panelIds: (key, ids) => ids, brandPanelControl: () => "", psRankingPanel: () => "",
  });
  vm.runInContext(section("  function renderTargetsPage(", "  function renderProductsPage("), c);
  c.renderTargetsPage();
  assert.equal(c.targetRows.length, 2);
  assert.equal(c.targetRows.find(r => r.month === "2026-01").actual, 200);
  assert.equal(c.targetRows.find(r => r.month === "2026-10").actual, 950);
});

test("all-time totals and exported month rows keep sales separate from monitoring counts, including count-only months", () => {
  const c = context();
  const tables = new Map();
  Object.assign(c, {
    percent: (a, b) => String(a / b), visibleSales: () => [],
    analyticsDataTable: (key, title, detail, headers, rows) => { tables.set(key, rows); return ""; },
    inventoryAnalyticsPanels: () => "",
  });
  Object.assign(c.liveData, { sales: [], targets: [], profiles: [] });
  vm.runInContext(section("  function allTimeAnalyticsPanels(", "  function renderAnalyticsPage("), c);
  const html = c.allTimeAnalyticsPanels(new Set(["one"]), raw.filter(f => f.branchId === "one"), false, "2026-11-03");
  assert.match(html, /All-time sales<\/span><strong>P1720<\/strong>/);
  assert.match(html, /Transactions<\/span><strong>29<\/strong>/);
  const months = tables.get("an-all-month");
  assert.deepEqual(Array.from(months.find(r => r[0] === "2026-01")).slice(0, 3), ["2026-01", "P200", 5]);
  assert.deepEqual(Array.from(months.find(r => r[0] === "2026-10")).slice(0, 3), ["2026-10", "P950", 2]);
  assert.deepEqual(Array.from(months.find(r => r[0] === "2025-06")).slice(0, 3), ["2025-06", "P0", 2]);
});
