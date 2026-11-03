const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "auth-app.js"), "utf8");
const start = source.indexOf("  function openWalkInDailyModal(");
const code = source.slice(start, source.indexOf("  function closeModal(", start));

function fixture(isPs) {
  const roots = [];
  let closed = 0, entries = 0;
  const summary = { coveredDays: 1, visitors: 3, conversion: 0.5 };
  const context = vm.createContext({
    window: { BranchlineAnalytics: {
      walkInSummary: () => summary, sameDayPriorYear: day => day.replace("2026", "2025"),
      addDays: () => "2026-11-04",
    } },
    walkInDailyCtx: { ids: new Set(["branch"]), isPs, monthStart: "2026-11-03", through: "2026-11-03" },
    transactionsDailyCtx: null, collectingExports: false, modalRoot: null,
    currentProfile: { id: "ps" }, liveData: { psWalkins: [] },
    storeCountsFor: () => [], withHistoryTransactions: () => [], analyticsFacts: () => [],
    escapeHTML: String, exportButton: () => "", wireDialogExport: () => {},
    closeModal: () => { closed++; }, openWalkInModal: kind => { assert.equal(kind, "store"); entries++; },
    document: {
      body: { appendChild: root => roots.push(root) },
      createElement: () => {
        const nodes = new Map();
        return { handlers: {}, innerHTML: "", addEventListener(name, fn) { this.handlers[name] = fn; },
          querySelector(selector) {
            if (selector === "[data-walkin-entry]" && isPs) return null;
            if (!nodes.has(selector)) nodes.set(selector, { value: "2026-11-03",
              handlers: {}, setCustomValidity() {}, reportValidity: () => true,
              addEventListener(name, fn) { this.handlers[name] = fn; } });
            return nodes.get(selector);
          } };
      },
    },
  });
  vm.runInContext(code, context);
  return { context, roots, get closed() { return closed; }, get entries() { return entries; } };
}

for (const isPs of [true, false]) {
  test(`${isPs ? "PS clients" : "manager walk-ins"} daily popup closes through X, Close and backdrop, not content`, () => {
    for (const action of ["x", "close", "nested-close", "backdrop", "content"]) {
      const f = fixture(isPs);
      f.context.openWalkInDailyModal();
      const root = f.roots.at(-1), before = f.closed;
      const target = action === "backdrop" ? root : { closest: () => action === "content" ? null : {} };
      assert.doesNotThrow(() => root.handlers.pointerdown({ target }));
      assert.equal(f.closed - before, action === "content" ? 0 : 1);
      assert.match(root.innerHTML, /data-modal-close>×/);
      assert.match(root.innerHTML, /data-modal-close>Close/);
    }
  });
  test(`${isPs ? "PS clients" : "manager walk-ins"} popup still closes after changing dates`, () => {
    const f = fixture(isPs);
    f.context.openWalkInDailyModal();
    const root = f.roots.at(-1);
    root.handlers.change({ target: root.querySelector("[data-walkin-from]") });
    assert.equal(f.roots.length, 2);
    const replacement = f.roots.at(-1), before = f.closed;
    replacement.handlers.pointerdown({ target: { closest: () => ({}) } });
    assert.equal(f.closed, before + 1);
  });
}

test("manager traffic popup still opens store visitor entry", () => {
  const f = fixture(false);
  f.context.openWalkInDailyModal();
  f.roots.at(-1).querySelector("[data-walkin-entry]").handlers.click();
  assert.equal(f.entries, 1);
});
