const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");

test("management ranges anchor to selected month/date, handle Monday week starts and YTD", async () => {
  const { managementRange } = await import("./management-reports.mjs");
  assert.deepEqual(managementRange("daily", { month: "2026-11", day: "2026-11-18", today: "2026-11-18" }),
    { kind: "daily", from: "2026-11-18", to: "2026-11-18", label: "Daily · 2026-11-18" });
  const w = managementRange("weekly", { month: "2026-11", day: "2026-11-18", today: "2026-11-18" });
  assert.equal(w.from, "2026-11-16");
  assert.equal(w.to, "2026-11-22");
  assert.equal(managementRange("monthly", { month: "2026-10", today: "2026-11-18" }).to, "2026-10-31");
  assert.equal(managementRange("ytd", { month: "2026-11", today: "2026-11-18" }).from, "2026-01-01");
  assert.throws(() => managementRange("quarterly", { month: "2026-11", today: "2026-11-18" }), /Unsupported/);
});

test("management summaries are scoped, aggregated, test-excluded, and never include customer names", async () => {
  const { buildManagementReport } = await import("./management-reports.mjs");
  const branches = [{ id: "A", name: "Santiago" }, { id: "B", name: "Cauayan" }];
  const profiles = [{ id: "ps", role: "ps", active: true, branch_id: "A", full_name: "Fictional PS" }];
  const sales = [
    { id: "1", ps_id: "ps", branch_id: "A", sold_on: "2026-11-18", customer_name: "Private Customer" },
    { id: "2", ps_id: "ps", branch_id: "B", sold_on: "2026-11-18" },
    { id: "3", ps_id: "ps", branch_id: "A", sold_on: "2026-10-18" },
    { id: "4", ps_id: "ps", branch_id: "A", sold_on: "2026-11-18", test: true },
  ];
  const lines = { "1": [{ brand: "LG", value: 1200.123 }, { brand: "LG", value: 300 }],
    "2": [{ brand: "TCL", value: 4000 }], "3": [{ brand: "LG", value: 500 }], "4": [{ brand: "LG", value: 999 }] };
  const result = buildManagementReport({
    kind: "daily", month: "2026-11", day: "2026-11-18", today: "2026-11-18",
    branches, profiles, sales, branchIds: new Set(["A"]),
    isTestSale: sale => !!sale.test, linesForSale: id => lines[id], amountForLine: line => line.value,
  });
  assert.equal(result.transactions, 1);
  assert.equal(result.net, 1500.12);
  assert.equal(result.sheets.find(s => s.name === "By branch").rows[1][0], "Santiago");
  assert.equal(result.sheets.find(s => s.name === "By brand").rows[1][1], 1);
  assert.equal(result.sheets.find(s => s.name === "By PS").rows[1][0], "Fictional PS · Santiago");
  assert.equal(result.sheets.find(s => s.name === "Daily totals").rows[1][0], "2026-11-18");
  assert.doesNotMatch(JSON.stringify(result), /Private Customer/);
  assert.ok(result.sheets.every(sheet => sheet.rows[0].length === sheet.rows[1]?.length));
});

test("management Report Center is manager-only and reuses existing export functionality", () => {
  assert.match(source, /function managementReportPanel\(\)/);
  assert.match(source, /data-management-report="daily"/);
  assert.match(source, /data-management-report="weekly"/);
  assert.match(source, /data-management-report="monthly"/);
  assert.match(source, /data-management-report="ytd"/);
  assert.match(source, /chooseExportFormat\(managementReport, format => exportManagementReport/);
  assert.match(source, /exportWorkbook\(result\.sheets/);
  assert.ok(source.includes('!["manager", "district_manager", "admin"].includes(currentProfile?.role)'));
});
