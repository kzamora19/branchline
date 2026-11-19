const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sql = fs.readFileSync(path.join(__dirname,
  "supabase/migrations/20261119021750_ps_individual_monthly_targets_release.sql"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");

test("individual PS target migration enforces branch scope, record identity and nonnegative monetary amounts", () => {
  assert.match(sql, /create table if not exists public\.ps_monthly_targets/);
  assert.match(sql, /amount numeric\(16,2\) not null check \(amount >= 0\)/);
  assert.match(sql, /unique \(branch_id, ps_id, month\)/);
  assert.match(sql, /alter table public\.ps_monthly_targets enable row level security/);
  assert.match(sql, /revoke all on table public\.ps_monthly_targets from public, anon, authenticated/);
  assert.match(sql, /is_dealer_member\(dealer_id\)/);
  assert.match(sql, /can_manage_branch\(branch_id\)/);
  assert.match(sql, /p\.branch_id = branch_id and p\.role = 'ps' and p\.active = true/);
  assert.match(sql, /ps_id = \(select auth\.uid\(\)\)/);
});

test("individual goal editor is manager-only, blank removes a goal, and sale records remain untouched", () => {
  const start = app.indexOf("  function psIndividualTargetPanel()");
  const end = app.indexOf("  function managementAttentionPanel(", start);
  assert.ok(start >= 0 && end > start);
  const editor = app.slice(start, end);
  assert.match(editor, /\["manager", "district_manager", "admin"\]\.includes\(currentProfile\?\.role\)/);
  assert.match(editor, /data-save-ps-goal/);
  assert.match(editor, /ps_monthly_targets"\)\.upsert/);
  assert.match(editor, /ps_monthly_targets"\)\.delete/);
  assert.match(editor, /scopeBranchIds\(\)\.has\(p\.branch_id\)/);
  assert.match(editor, /currentProfile\.dealer_id/);
  assert.doesNotMatch(editor, /from\("sales"\)|from\("sale_lines"\)|rpc\(/);
  assert.match(app, /personal\.targetSource === "individual"/);
  assert.match(app, /targetLabel = realTarget !== null \? "Assigned PS target"/);
});
