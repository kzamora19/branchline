const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("PDF summary charts contain only top five aggregated amounts and fit an A4 portrait report", async () => {
  const { managementPdfChartBlocks } = await import("./management-charts.mjs");
  const charts = [{ title: "Top branches by recorded sales", rows:
    Array.from({ length: 8 }, (_, i) => ({ label: "Branch " + i, amount: (8-i) * 1500.25 })) }];
  const blocks = managementPdfChartBlocks(charts);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].table.body.length, 5);
  assert.ok(blocks[1].table.widths.reduce((a,b) => a + b, 0) < 500);
  assert.ok(blocks[1].table.body.every(row => row[1].canvas[0].w <= 198));
  assert.ok(blocks[1].table.body[0][2].text.startsWith("₱"));
  assert.deepEqual(managementPdfChartBlocks([]), []);
  assert.equal(JSON.stringify(blocks).includes("Customer"), false);
});
test("management chart data originates from already scoped report groups", () => {
  const source=fs.readFileSync(path.join(__dirname,"management-reports.mjs"),"utf8");
  assert.match(source, /Top branches by recorded sales/);
  assert.match(source, /Top brands by recorded sales/);
  assert.match(source, /const charts = \[/);
  const app=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8");
  assert.match(app, /managementPdfChartBlocks/);
  assert.match(app, /reportCharts: result\.charts/);
});
