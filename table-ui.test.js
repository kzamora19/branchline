"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "table-ui.js"), "utf8");
const context = { window: {}, document: { body: {}, querySelectorAll: () => [] },
  MutationObserver: class { observe() {} } };
vm.runInNewContext(source, context);
const compare = context.window.BranchlineTableUI.compare;

test("shared table sorting handles numbers, currency, percentages, dates and natural text", () => {
  for (const [left, right] of [[2,10],["₱2,000.00","₱12,000.00"],["2%","10%"],
    ["(100)","0"],["2026-01-01","2026-10-01"],["Model 2","Model 10"],["000002","000010"]]) {
    assert.ok(compare(left,right,"asc") < 0, `${left} before ${right}`);
    assert.ok(compare(left,right,"desc") > 0);
  }
  assert.equal(compare("same","SAME","asc"),0);
});
test("unavailable values sort last in both directions instead of becoming valid numeric zero", () => {
  for (const blank of ["","—","-","n/a","Unavailable"]) {
    assert.ok(compare(blank,0,"asc")>0);
    assert.ok(compare(blank,0,"desc")>0);
  }
});
test("table controls load before the application and are cached for offline use", () => {
  const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
  assert.ok(html.indexOf('src="table-ui.js"') < html.indexOf('src="auth-app.js"'));
  assert.match(fs.readFileSync(path.join(__dirname,"sw.js"),"utf8"),/"\.\/table-ui\.js"/);
  assert.match(source,/table:not\(\.event-calendar\)/);
  assert.match(source,/\.total-row, \[data-sort-fixed\]/);
});
