const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const fragment = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "Expected source section " + start);
  return app.slice(a, b);
};

test("manual per-PS targets are not allowed to override the equal branch share", () => {
  const block = fragment("  function personalTargetProgress(", "  function psTargetCharts(");
  const ctx = vm.createContext({
    currentProfile: { id: "ps-a", branch_id: "santiago" },
    liveData: {
      psDashboard: { ps_count: 17 },
      targets: [{ branch_id: "santiago", month: "2026-11-01", amount: 9000000 }],
      individualGoals: [{ ps_id: "ps-a", branch_id: "santiago", month: "2026-11-01", amount: 1 }],
      sales: [{ id: "sale-a", ps_id: "ps-a", branch_id: "santiago", sold_on: "2026-11-19" }],
    },
    ui: { salesBasis: "srp", period: "month", month: "2026-11" },
    targetInPeriod: () => true, inStatus: () => true,
    saleTotal: (sale, basis) => basis === "price" ? 960000 : 1200000,
  });
  const result = vm.runInContext(block + "\npersonalTargetProgress();", ctx);
  assert.equal(result.actual, 960000, "Achievement must use actual selling-price sales, not SRP");
  assert.ok(Math.abs(result.target - 9000000 / 17) < 0.001);
  assert.equal(result.activePsCount, 17);
  assert.equal(result.targetSource, "equal-share");
  assert.ok(Math.abs(result.actual / result.target * 100 - 181.3333333333) < 0.01);
  assert.doesNotMatch(block, /individualGoals|assigned|explicit \?\?/);
});

test("PS ranking includes active zero-sale members, excludes inactive/test PS, and uses selling-price sales for achievement", () => {
  const rank = fragment("  function psRankingRows(", "  function rankFilterSelect(");
  const people = [
    { id: "a", role: "ps", active: true, branch_id: "b", full_name: "A", salesperson_code: "PS01" },
    { id: "b", role: "ps", active: true, branch_id: "b", full_name: "B", salesperson_code: "PS02" },
    { id: "c", role: "ps", active: true, branch_id: "b", full_name: "C" },
    { id: "inactive", role: "ps", active: false, branch_id: "b", full_name: "D" },
    { id: "test", role: "ps", active: true, branch_id: "b", full_name: "Test user" },
  ];
  const sales = [
    { id: "s1", ps_id: "a", branch_id: "b", sold_on: "2026-11-19", salesperson_code: "" },
    { id: "s2", ps_id: "inactive", branch_id: "b", sold_on: "2026-11-19" },
    { id: "s3", ps_id: "a", branch_id: "elsewhere", sold_on: "2026-11-19" },
  ];
  const ctx = vm.createContext({
    liveData: {
      profiles: people, sales,
      targets: [{ branch_id: "b", month: "2026-11-01", amount: 9000000 }],
    },
    ui: { rankBrand: "", rankCategory: "", rankSub: "", month: "2026-11", period: "month", salesBasis: "srp" },
    scopeBranchIds: () => new Set(["b"]),
    isTestProfile: person => /^Test/i.test(person.full_name),
    isTestSale: () => false,
    inPeriod: () => true,
    lineMatches: () => true,
    linesForSale: () => [{ value: 1000000 }],
    window: { BranchlineAnalytics: {
      salesLineAmount: (line, basis) => basis === "price" ? line.value : 1200000,
    } },
    addTo: (map, key, amount) => map.set(key, (map.get(key) || 0) + amount),
    natural: (a, b) => String(a).localeCompare(String(b)),
    branchName: () => "Santiago",
  });
  const rows = vm.runInContext(rank + "\npsRankingRows(new Set(['b']));", ctx);
  assert.deepEqual([...rows.map(row => row.id)], ["a", "b", "c"]);
  assert.equal(rows[0].salesCode, "PS01");
  assert.equal(rows[0].total, 1200000, "Comparison view can show SRP");
  assert.equal(rows[0].target, 3000000);
  assert.ok(Math.abs(rows[0].achievement - 100 / 3) < 0.0001,
    "Achievement must use the actual selling price instead of SRP");
  assert.equal(rows[1].total, 0);
  assert.equal(rows[1].target, 3000000);
  assert.equal(rows[1].achievement, 0);
});

test("manager overview replaces individual-goal editor with read-only equal-share achievements", () => {
  const block = fragment("  function psIndividualTargetPanel()", "  // Local, per-account and per-day snooze.");
  const ctx = vm.createContext({
    currentProfile: { role: "manager" },
    ui: { period: "month", month: "2026-11" },
    liveData: {
      profiles: [
        { id: "a", role: "ps", active: true, branch_id: "b", full_name: "A", salesperson_code: "PS01" },
        { id: "b", role: "ps", active: true, branch_id: "b", full_name: "B", salesperson_code: "PS02" },
      ],
      targets: [{ branch_id: "b", month: "2026-11-01", amount: 800000 }],
      sales: [{ id: "s", ps_id: "a", branch_id: "b", sold_on: "2026-11-19", salesperson_code: "" }],
    },
    panelIds: () => new Set(["b"]), scopeBranchIds: () => new Set(["b"]),
    branchName: () => "Santiago", natural: (a, b) => String(a).localeCompare(String(b)),
    isTestProfile: () => false, isTestSale: () => false,
    addTo: (map, key, value) => map.set(key, (map.get(key) || 0) + value),
    saleTotal: () => 200000, monthLabel: () => "November 2026",
    formatMoney: amount => "PHP " + amount.toFixed(2),
    percent: (amount, target) => ((amount / target) * 100).toFixed(1) + "%",
    escapeHTML: String, panel: (title, detail, content) => ({ title, detail, content }),
  });
  const result = vm.runInContext(block + "\npsIndividualTargetPanel();", ctx);
  assert.equal(result.title, "Automatic Product Specialist targets and achievement");
  assert.match(result.content, /PHP 400000.00/);
  assert.match(result.content, /50.0%/);
  assert.match(result.content, /linked PS account but no Sales Code/);
  assert.doesNotMatch(result.content, /data-save-ps-goal|Save goal/);
  assert.doesNotMatch(block, /client\.from|client\.rpc|upsert|delete\(/);
  assert.doesNotMatch(app, /saveIndividualPsMonthlyTarget\(|data-save-ps-goal/);
});
