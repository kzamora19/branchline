const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("manager attention notices are read-only, actionable, rate-limited in view and correctly prioritized", async () => {
  const { managerAttention } = require("./manager-attention.js");
  const rows = [
    { branch: { id: "a", name: "Santiago" }, actual: 1000, target: 10000 },
    { branch: { id: "b", name: "Cauayan" }, actual: 5300, target: 10000 },
    { branch: { id: "c", name: "Solano" }, actual: 100, target: 0 },
    { branch: { id: "d", name: "Ilagan" }, actual: 9500, target: 10000 },
  ];
  const snapshot = JSON.stringify(rows);
  const notices = managerAttention({ rows, expectedByBranch: { a: 0.55, b: 0.61, c: 0.6, d: 0.6 }, unassignedCount: 2 });
  assert.equal(notices.length, 4);
  assert.equal(notices[0].level, "high");
  assert.equal(notices[1].id, "pace:b");
  assert.equal(notices[2].id, "attribution");
  assert.equal(notices[3].level, "info");
  assert.match(notices[0].detail, /10.0% · Expected: 55.0%/);
  assert.equal(JSON.stringify(rows), snapshot);
  assert.equal(managerAttention({ rows, expectedByBranch: { a: 0.55, b: 0.61 }, maxItems: 2 }).length, 2);
});

test("missing expected pace, healthy branches and zero sales with no target generate no false warning", async () => {
  const { managerAttention } = require("./manager-attention.js");
  assert.deepEqual(managerAttention({ rows: [{ branch: { id: "a", name: "A" }, actual: 0, target: 0 }] }), []);
  assert.deepEqual(managerAttention({ rows: [{ branch: { id: "a", name: "A" }, actual: 2000, target: 10000 }], expectedByBranch: {} }), []);
  assert.deepEqual(managerAttention({ rows: [{ branch: { id: "a", name: "A" }, actual: 9000, target: 10000 }], expectedByBranch: { a: 0.7 } }), []);
});

test("manager attention UI is manager-only and does not schedule or push notifications", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
  const start = source.indexOf("  function managementAttentionPanel(");
  const end = source.indexOf("  function managementReportPanel(", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.ok(body.includes('currentProfile?.role'));
  assert.match(body, /managerAttention/);
  assert.match(body, /data-manager-attention-analytics/);
  assert.doesNotMatch(body, /\.rpc\(|\.from\(|pushManager|setInterval/i);
});
