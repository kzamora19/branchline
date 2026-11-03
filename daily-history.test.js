const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMonitoring, historyFacts, reconcileSalesFacts, transactionFacts, historyWalkins } = require("./daily-history.js");

const header = ["Date", "TY", "FT TY", "FT LY", "# of INV. TY", "# of INV. LY", "Conv. Rate TY", "Conv. Rate LY", "Total TY", "Total LY", "REMARKS THIS YEAR", "REMARKS LAST YEAR"];
const dayRow = (d, c, dl, e, f, ty, ly, ry = "", rl = "") => [d, "(X)", c, dl, e, f, "", "", ty, ly, ry, rl];
const book = {
  January: [["title"], header, dayRow(1, 0, 0, 0, 0, 0, 0, "", "STORE CLOSED"), dayRow(2, 19, 21, 14, 10, 298738, 217774), dayRow(3, 0, 15, 5, 9, 1000, 169557)],
  October: [header, dayRow(1, 10, 10, 5, 5, 50000, 60000)],
  Sheet2: [["x"]],
};

test("this year is cut off, last year is always imported, closed days keep their remark", () => {
  const { rows, months } = parseMonitoring(book, { year: 2026, cutoff: "2026-09-30" });
  const byDay = Object.fromEntries(rows.map(row => [row.day, row]));
  assert.equal(byDay["2026-01-02"].sales, 298738);
  assert.equal(byDay["2026-01-02"].walkins, 19);
  assert.equal(byDay["2025-01-02"].transactions, 10);
  assert.equal(byDay["2026-01-03"].walkins, null);
  assert.equal(byDay["2025-01-01"].remarks, "STORE CLOSED");
  assert.equal(byDay["2026-01-01"], undefined);
  assert.equal(byDay["2026-10-01"], undefined);
  assert.equal(byDay["2025-10-01"].sales, 60000);
  assert.equal(months.length, 2);
  assert.equal(months[0].ty.sales, 299738);
});

test("a sheet without the expected columns is reported, not guessed", () => {
  const { rows, warnings } = parseMonitoring({ March: [["a", "b"], [1, 2]] }, { year: 2026, cutoff: "2026-09-30" });
  assert.equal(rows.length, 0);
  assert.match(warnings[0], /March/);
});

test("monitoring sales never fill database gaps outside the explicit October exception; counts remain available", () => {
  const history = [
    { branch_id: "b1", day: "2026-07-01", sales: 900, transactions: 3 },
    { branch_id: "b1", day: "2026-07-02", sales: 500, transactions: 1 },
    { branch_id: "b2", day: "2026-07-01", sales: 700, transactions: 2 },
  ];
  const live = [{ branchId: "b1", date: "2026-07-02", amount: 100, saleId: "invoice" }];
  const facts = historyFacts(history, live, new Set(["b1"]));
  assert.equal(facts.length, 0);
  assert.equal(reconcileSalesFacts(history, live, new Set(["b1"])).reduce((sum, fact) => sum + fact.amount, 0), 100);
  assert.equal(transactionFacts(history, live, new Set(["b1"])).length, 4);
});

test("history walk-ins never replace a real store count", () => {
  const history = [
    { branch_id: "b1", day: "2026-07-01", walkins: 20 },
    { branch_id: "b1", day: "2026-07-02", walkins: 30 },
    { branch_id: "b1", day: "2026-07-03", walkins: null },
  ];
  const added = historyWalkins(history, [{ branch_id: "b1", counted_on: "2026-07-02", visitors: 25 }]);
  assert.deepEqual(added.map(row => [row.counted_on, row.visitors]), [["2026-07-01", 20]]);
});

test("2025 fallback uses whole empty branch/months, not daily gaps or zero-value invoice totals", () => {
  const history = [
    { branch_id: "b1", day: "2025-01-02", sales: 300, transactions: 1 },
    { branch_id: "b1", day: "2025-01-20", sales: 400, transactions: 1 },
    { branch_id: "b2", day: "2025-01-02", sales: 800, transactions: 1 },
    { branch_id: "b1", day: "2025-02-02", sales: 900, transactions: 1 },
    { branch_id: "b1", day: "2026-02-02", sales: 9999, transactions: 1 },
    { branch_id: "foreign", day: "2025-01-02", sales: 9999, transactions: 1 },
  ];
  const live = [
    { branchId: "b1", date: "2025-01-15", amount: 100, saleId: "invoice" },
    { branchId: "b1", date: "2025-02-15", amount: 0, saleId: "zero" },
  ];
  const ids = new Set(["b1", "b2"]);
  const before = JSON.stringify({ history, live });
  const facts = reconcileSalesFacts(history, live, ids);
  assert.deepEqual(facts.map(row => row.amount), [100, 0, 800]);
  assert.equal(facts.find(row => row.summary).branchId, "b2");
  assert.equal(JSON.stringify({ history, live }), before);
  assert.deepEqual(reconcileSalesFacts(history, facts, ids), facts, "Reconciliation must be idempotent");
});
