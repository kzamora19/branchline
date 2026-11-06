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

function sectionFixture(storage = new Map(), failStorage = false) {
  const warnings = [];
  function element() {
    const classes = new Set(), attributes = {};
    return {
      childNodes: [], dataset: {}, textContent: "", hidden: false,
      classList: { add: value => classes.add(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) },
      setAttribute: (name, value) => { attributes[name] = value; },
      getAttribute: name => attributes[name],
      append(...nodes) { this.childNodes.push(...nodes); },
      replaceChildren(...nodes) { this.childNodes = nodes; },
      addEventListener(type, handler) { this[type] = handler; },
    };
  }
  const title = element(), heading = element(), content = element(), panel = element();
  title.textContent = "Sales log";
  heading.querySelector = selector => selector === "h2" ? title : null;
  panel.querySelector = selector => selector.includes("connected-panel-heading") ? heading : null;
  panel.querySelectorAll = () => [];
  panel.childNodes = [heading, content];
  const root = { querySelectorAll: () => [panel] };
  const sandbox = { window: {}, console: { warn: (...args) => warnings.push(args) },
    document: { body: {}, querySelectorAll: () => [], createElement: element },
    localStorage: {
      getItem: key => { if (failStorage) throw new Error("Storage blocked"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (failStorage) throw new Error("Storage blocked"); storage.set(key, value); },
    }, MutationObserver: class { observe() {} } };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.window.BranchlineTableUI, root, panel, heading, title, content, storage, warnings };
}

test("sections default collapsed, toggle independently, and remain idempotent", () => {
  const f = sectionFixture();
  f.api.enhanceSections(f.root, "sales");
  const toggle = f.title.childNodes[0], body = f.panel.childNodes.at(-1);
  assert.equal(toggle.type, "button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), body.id);
  assert.equal(body.hidden, true);
  assert.deepEqual(body.childNodes, [f.content]);
  const count = f.panel.childNodes.length;
  f.api.enhanceSections(f.root, "sales");
  assert.equal(f.panel.childNodes.length, count);
  f.heading.click({ target: { closest: () => toggle } });
  assert.equal(body.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  f.heading.click({ target: { closest: () => ({}) } });
  assert.equal(body.hidden, false, "other header controls must not toggle");
  f.heading.click({ target: { closest: () => null } });
  assert.equal(body.hidden, true, "header background must toggle");
});

test("section choices survive rerender/reload and do not leak across pages", () => {
  const first = sectionFixture();
  first.api.enhanceSections(first.root, "sales");
  first.heading.click({ target: { closest: () => null } });
  const next = sectionFixture(first.storage);
  next.api.enhanceSections(next.root, "sales");
  assert.equal(next.panel.childNodes.at(-1).hidden, false);
  const other = sectionFixture(first.storage);
  other.api.enhanceSections(other.root, "analytics");
  assert.equal(other.panel.childNodes.at(-1).hidden, true);
  for (const page of ["overview", "inventory", "products", undefined]) {
    const untouched = sectionFixture();
    untouched.api.enhanceSections(untouched.root, page);
    assert.equal(untouched.panel.dataset.collapsibleSection, undefined);
  }
  for (const page of ["settings", "targets", "users"]) {
    const included = sectionFixture();
    included.api.enhanceSections(included.root, page);
    assert.equal(included.panel.childNodes.at(-1).hidden, true);
  }
});

test("blocked device storage reports a warning and keeps session choices", () => {
  const f = sectionFixture(new Map(), true);
  f.api.enhanceSections(f.root, "sales");
  f.heading.click({ target: { closest: () => null } });
  assert.equal(f.panel.childNodes.at(-1).hidden, false);
  assert.equal(f.warnings.length, 1);
  assert.match(f.warnings[0][0], /session only/);
});
