const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");

function preferences() {
  const store = new Map(), warnings = [];
  const context = vm.createContext({
    ui: {}, currentProfile: { id: "a", dealer_id: "dealer", role: "admin" }, demoStore: null,
    liveData: { districts: [{ id: "d" }], branches: [{ id: "b", district_id: "d" }] },
    window: { BranchlineAnalytics: { RULES: { all: {} } } },
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    currentMonth: () => "2026-11", resetUi() { Object.assign(context.ui, { period: "month", anRange: "month", month: "", date: "", district: "", branch: "", search: "" }); },
    console: { warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(source.slice(source.indexOf("  const universalPages"), source.indexOf("  let productsFiltered")), context);
  return { context, store, warnings };
}

test("floating filters preserve layout, fit the viewport, and dismiss only outside or on Escape", () => {
  const listeners = {};
  const summary = { getBoundingClientRect: () => ({ bottom: 200 }), focus() { summary.focused = true; } };
  const inside = {};
  const details = { open: true, querySelector: () => summary, contains: target => target === inside,
    style: { setProperty: (key, value) => { details.height = [key, value]; } } };
  const c = vm.createContext({ ui: { filtersOpen: true }, connectedContent: { querySelector: () => details.open ? details : null },
    document: { addEventListener: (type, fn) => { listeners[type] = fn; } },
    window: { innerHeight: 700, addEventListener() {} } });
  vm.runInContext(source.slice(source.indexOf("  function positionFloatingFilters("), source.indexOf("  let capturingPieResults")), c);
  c.positionFloatingFilters();
  assert.deepEqual(details.height, ["--filter-available-height", "484px"]);
  listeners.pointerdown({ type: "pointerdown", target: inside });
  assert.equal(details.open, true);
  listeners.keydown({ type: "keydown", key: "Tab" });
  assert.equal(details.open, true);
  listeners.pointerdown({ type: "pointerdown", target: {} });
  assert.equal(details.open, false); assert.equal(c.ui.filtersOpen, false);
  details.open = true; c.ui.filtersOpen = true;
  listeners.keydown({ type: "keydown", key: "Escape" });
  assert.equal(details.open, false); assert.equal(summary.focused, true);
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.match(css, /\.universal-filter-body \{ position: absolute; top: 100%;/);
  assert.match(css, /max-height: var\(--filter-available-height, 65vh\); overflow-y: auto/);
});

test("preferences are isolated by account/dealer/demo and survive a new session", () => {
  const { context: c, store } = preferences();
  c.restoreAccountFilters();
  Object.assign(c.ui, { district: "d", branch: "b", month: "2026-09", period: "year", anDim: "category", pdTop: "day" });
  c.saveAccountFilters();
  c.currentProfile = { ...c.currentProfile, id: "second" };
  c.restoreAccountFilters();
  assert.equal(c.ui.month, "2026-11"); assert.equal(c.ui.branch, ""); assert.equal(c.ui.pdTop, "");
  c.currentProfile = { ...c.currentProfile, id: "a" };
  c.restoreAccountFilters(); c.sanitizeAccountScope();
  assert.equal(c.ui.month, "2026-09"); assert.equal(c.ui.period, "year"); assert.equal(c.ui.branch, "b");
  assert.equal(c.ui.pdTop, "day");
  c.demoStore = {}; c.restoreAccountFilters(); assert.equal(c.ui.branch, "");
  c.demoStore = null; c.currentProfile = { ...c.currentProfile, dealer_id: "other" };
  c.restoreAccountFilters(); assert.equal(c.ui.month, "2026-11");
  assert.equal(store.size, 1);
});

test("saved scope cannot expand a restricted roster; PS remains on its assigned branch", () => {
  const { context: c, store } = preferences();
  store.set(c.filterStorageKey(), JSON.stringify({ district: "foreign", branch: "foreign", month: "nonsense", period: "all", date: "2026-02-31", anBasis: "invalid" }));
  c.restoreAccountFilters(); c.sanitizeAccountScope();
  assert.equal(c.ui.district, ""); assert.equal(c.ui.branch, ""); assert.equal(c.ui.month, "2026-11");
  assert.equal(c.ui.period, "month"); assert.equal(c.ui.date, ""); assert.equal(c.ui.anBasis, "all");
  c.currentProfile = { id: "ps", dealer_id: "dealer", role: "ps", district_id: "d", branch_id: "b" };
  c.restoreAccountFilters(); c.ui.branch = "foreign"; c.sanitizeAccountScope();
  assert.equal(c.ui.branch, "b"); assert.equal(c.ui.district, "d");
});

test("corrupt or unavailable preference storage produces an explicit warning", () => {
  const { context: c, store, warnings } = preferences();
  store.set(c.filterStorageKey(), "{invalid");
  c.restoreAccountFilters(); assert.equal(warnings.length, 1);
  c.localStorage.setItem = () => { throw Error("Storage blocked"); };
  c.saveAccountFilters(); assert.equal(warnings.length, 2);
});

test("staff actions are role-limited and use existing confirmation workflows", () => {
  assert.match(source, /data-person-action=.*aria-label="Actions for/);
  assert.match(source, /p\.role === "admin" \? "" : `<option value="transfer">/);
  assert.match(source, /select\.value = "";/);
  assert.match(source, /person\.role !== "admin" \|\| action === "edit"/);
  assert.match(source, /openPersonAction\(action, person\)/);
});

test("navigation preserves the shared account scope and clears only menu-local search", () => {
  const c = vm.createContext({ ui: { district: "d", branch: "b", date: "2026-09-10", month: "2026-09", search: "local", pages: { sales: 2 } },
    button: { dataset: { livePage: "sales" } }, activePage: "overview",
    connectedSidebar: { classList: { remove() {} } }, window: { scrollTo() {} }, renderConnected() {} });
  const start = source.indexOf('    activePage = button.dataset.livePage;');
  vm.runInContext(source.slice(start, source.indexOf("\n  });", start)), c);
  assert.equal(c.activePage, "sales");
  assert.equal(c.ui.district, "d"); assert.equal(c.ui.branch, "b");
  assert.equal(c.ui.date, "2026-09-10"); assert.equal(c.ui.month, "2026-09");
  assert.equal(c.ui.search, ""); assert.deepEqual(Object.keys(c.ui.pages), []);
});

test("Settings is available to every role but imports and danger zone remain role-limited", () => {
  const c = vm.createContext({ currentProfile: { role: "admin" }, liveData: {}, demoStore: null, connectedContent: { querySelector: () => ({ append() {} }) },
    document: { getElementById: () => null }, managesInventory: () => ["admin", "manager", "district_manager", "inventory_controller", "stock_custodian"].includes(c.currentProfile.role),
    pageHeading: () => "", panel: (title, detail, body) => `${title}${body}`,
    pushMessagesPanel: () => c.currentProfile.role === "admin" ? "Alert messages" : "",
    mountPage: (heading, before, filters, results) => { c.output = results(); } });
  vm.runInContext(source.slice(source.indexOf("  const rolePages"), source.indexOf("  const PAGE_SIZE")), c);
  const start = source.indexOf("  function dangerZonePanel");
  const end = source.indexOf("  function renderDemoControls", start);
  vm.runInContext(source.slice(start, end), c);
  for (const role of ["ps", "manager", "district_manager", "admin", "inventory_controller", "stock_custodian"]) {
    c.currentProfile.role = role;
    assert.equal(vm.runInContext(`rolePages["${role}"].includes("settings")`, c), true);
    c.renderSettingsPage();
    assert.equal(c.output.includes("Import Center"), role !== "ps");
    assert.equal(c.output.includes("Danger zone"), role === "admin");
    assert.equal(c.output.includes("Alert messages"), role === "admin");
    assert.match(c.output, /settings-account-controls/);
  }
});
