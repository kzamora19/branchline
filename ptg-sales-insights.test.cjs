const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const edge = fs.readFileSync(path.join(__dirname, "supabase/functions/ptg-inventory/index.ts"), "utf8");

test("PTG sales insights require verified PTG session and use mapped authorized branch codes", () => {
  assert.match(edge, /ptg-auth/);
  assert.match(edge, /action: "session"/);
  assert.match(edge, /account\.mustChangePassword/);
  assert.match(edge, /account\.role === "SYSTEM_ADMIN" \? linkedBranches/);
  assert.match(edge, /code === account\.branchCode/);
  assert.match(edge, /\.in\("branch_id", ids\)/);
  assert.match(edge, /PTG_SALES_INSIGHTS_ENABLED/);
  assert.match(edge, /!== "true"/);
});

test("insights return only product-level aggregation without private sale-line or identity fields", () => {
  const from = edge.indexOf('if (mode === "insights")');
  const to = edge.indexOf('if (mode === "stock" || !serialized)', from);
  assert.ok(from >= 0 && to > from);
  const body = edge.slice(from, to);
  assert.match(body, /sales\.from\("sale_lines"\)/);
  assert.match(body, /\.select\("id,sale_id,quantity,sales!inner\(sold_on\)"\)/);
  assert.match(body, /\.gte\("sales\.sold_on", from\)/);
  assert.match(body, /\.lte\("sales\.sold_on", today\)/);
  assert.match(body, /transactions\.add\(line\.sale_id\)/);
  assert.match(body, /recent: \{ from, to: today, units, transactions: transactions\.size/);
  assert.doesNotMatch(body, /\b(?:customer_name|ps_name|salesperson_code|payment_mode|serial_numbers)\b/i);
  assert.match(body, /too many sales lines to summarize safely/);
});

test("existing inventory and serial lookup modes remain available", () => {
  assert.match(edge, /if \(mode === "codes"\)/);
  assert.match(edge, /"stock", "serials", "insights"/);
  assert.match(edge, /if \(mode === "stock" \|\| !serialized\)/);
  assert.match(edge, /inventory_serials/);
});
