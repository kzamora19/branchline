const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const start = source.indexOf("  function renderSalesPage(");
const code = source.slice(start, source.indexOf("  let deliveryGroups", start));

function render(role = "ps", filters = {}, branches = ["one"]) {
  const sales = [
    { id: "past", ps_id: "self", branch_id: "one", sold_on: "2026-10-31", amount: 50 },
    { id: "earlier", ps_id: "self", branch_id: "one", sold_on: "2026-11-02", amount: 100 },
    { id: "today", ps_id: "self", branch_id: "one", sold_on: "2026-11-04", amount: 200 },
    { id: "peer", ps_id: "other", branch_id: "one", sold_on: "2026-11-04", amount: 9000 },
    { id: "remote", ps_id: "self", branch_id: "two", sold_on: "2026-11-04", amount: 8000 },
    { id: "test", ps_id: "self", branch_id: "one", sold_on: "2026-11-04", amount: 700, test: true },
  ].map(sale => ({ ...sale, invoice_number: sale.id, customer_name: sale.id, created_at: sale.sold_on }));
  const ui = { period: "month", month: "2026-11", search: "", logFrom: "", logTo: "", dsYear: "", dsMonth: "", basis: "price", ...filters };
  const ownScope = sales.filter(sale => branches.includes(sale.branch_id) && (role !== "ps" || sale.ps_id === "self"));
  const amount = sale => sale.amount * (ui.basis === "srp" ? 1.5 : 1);
  const facts = ownScope.filter(sale => !sale.test).map(sale => ({
    saleId: sale.id, psId: sale.ps_id, branchId: sale.branch_id, date: sale.sold_on, amount: amount(sale),
  }));
  const panels = {}, tables = {};
  const context = vm.createContext({
    currentProfile: { id: "self", role }, ui,
    liveData: { testSales: ownScope.filter(sale => sale.test), testPsIds: new Set(), profiles: [], psWalkins: [] },
    visibleSales: () => ownScope.filter(sale => !sale.test),
    mountPage: (_heading, _actions, _filters, draw) => draw(),
    pageHeading() {}, filterBar() {}, scopeBranchIds: () => new Set(branches),
    searchQuery: () => ui.search,
    matches: (query, ...values) => values.some(value => String(value).includes(query)),
    inPeriod: date => ui.period === "day" ? date === "2026-11-04" : date.startsWith(ui.month),
    branchName: id => id, titleCase: String, linesForSale: () => [],
    serialsFor: () => [], addressOf: () => "", saleTotal: amount, isTestSale: sale => Boolean(sale.test),
    salesLogExport: null, escapeHTML: String, natural: (a, b) => a.localeCompare(b),
    localISODate: () => "2026-11-04", periodDay: () => "2026-11-04",
    currentMonth: () => "2026-11", monthLabel: String,
    canPickBranch: () => ["district_manager", "admin"].includes(role),
    analyticsFacts: () => facts, withHistoryFacts: rows => rows, withHistoryTransactions: rows => rows,
    panelIds: (_key, ids) => ids, storeCountsFor: () => [],
    window: { BranchlineAnalytics: { walkInSummary: () => ({}) } },
    formatMoney: value => `P${value}`, exportButton: () => "", dailySalesChart: () => "",
    panelBranchSelect: () => "", deliveryMonitoringPanel: () => "", brandLogPanel: () => "", saleSummaryRowHTML: () => "",
    panel: (title, note, body) => { panels[title] = { note, body }; return body; },
    tableBlock: (key, _headers, rows) => { tables[key] = rows; return ""; },
  });
  vm.runInContext(code, context);
  vm.runInContext("renderSalesPage()", context);
  const panel = panels[role === "ps" ? "My sales log" : "Sales log"];
  return { ...panel, tables, cards: [...panel.body.matchAll(/<article class="([^"]*)">([\s\S]*?)<\/article>/g)].map(match => ({ className: match[1], html: match[2] })) };
}

test("PS log highlights its filtered total on the left and keeps today's sales on the right", () => {
  const result = render();
  assert.equal(result.cards.length, 2);
  assert.match(result.cards[0].className, /log-total-highlight/);
  assert.match(result.cards[0].html, /My total sales.*<strong>P300<\/strong>.*2 sales/);
  assert.match(result.cards[1].html, /My daily sales.*today, 2026-11-04.*<strong>P200<\/strong>.*1 sale/);
  assert.doesNotMatch(result.note, /P300|2 sales/);
  assert.match(result.note, /TEST \(not counted\).*Click a transaction/);
});

test("left total follows search without changing the existing daily card", () => {
  const result = render("ps", { search: "earlier" });
  assert.match(result.cards[0].html, /<strong>P100<\/strong>.*1 sale/);
  assert.match(result.cards[1].html, /<strong>P200<\/strong>/);
  const empty = render("ps", { search: "no match" });
  assert.match(empty.cards[0].html, /<strong>P0<\/strong>.*0 sales/);
  assert.match(empty.cards[1].html, /<strong>P200<\/strong>/);
});

test("inclusive log calendars and one-sided dates retain date-range behavior on the right", () => {
  const result = render("ps", { logFrom: "2026-10-31", logTo: "2026-11-02" });
  assert.match(result.cards[0].html, /<strong>P150<\/strong>.*2 sales/);
  assert.match(result.cards[1].html, /My date-range sales.*2026-10-31 to 2026-11-02.*<strong>P150<\/strong>/);
  assert.match(render("ps", { logTo: "2026-11-02" }).cards[1].html, /start to 2026-11-02.*<strong>P150<\/strong>/);
  assert.match(render("ps", { logFrom: "2026-11-04" }).cards[1].html, /2026-11-04 to today.*<strong>P200<\/strong>/);
});

test("day/month and Price/SRP selections apply to totals without including peers or TEST sales", () => {
  assert.match(render("ps", { period: "day" }).cards[0].html, /<strong>P200<\/strong>.*1 sale/);
  assert.match(render("ps", { month: "2026-10" }).cards[0].html, /<strong>P50<\/strong>.*1 sale/);
  const srp = render("ps", { basis: "srp" });
  assert.match(srp.cards[0].html, /<strong>P450<\/strong>.*2 sales/);
  assert.match(srp.cards[1].html, /<strong>P300<\/strong>.*1 sale/);
});

test("manager cards and header totals retain their existing behavior", () => {
  for (const role of ["manager", "district_manager", "admin"]) {
    const result = render(role, {}, role === "manager" ? ["one"] : ["one", "two"]);
    assert.equal(result.cards.length, role === "manager" ? 1 : 2);
    assert.doesNotMatch(result.body, /log-total-highlight|ps-log-totals|My daily sales/);
    assert.match(result.note, role === "manager" ? /3 sales.*P9300/ : /4 sales.*P17300/);
  }
});
