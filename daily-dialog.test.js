const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "auth-app.js"), "utf8");
const start = source.indexOf("  function openWalkInDailyModal(");
const code = source.slice(start, source.indexOf("  function closeModal(", start));

function fixture(isPs, psWalkins = [
  { branch_id: "branch", counted_on: "2026-11-03", ps_id: "ps", clients_assisted: 5 },
  { branch_id: "branch", counted_on: "2026-11-03", ps_id: "other", clients_assisted: 3 },
  { branch_id: "other", counted_on: "2026-11-03", ps_id: "other", clients_assisted: 100 },
]) {
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
    currentProfile: { id: "ps", role: isPs ? "ps" : "manager" }, liveData: { psWalkins },
    storeCountsFor: () => [], withHistoryTransactions: () => [], analyticsFacts: () => [],
    dailyComparisonSheet: (name, body, headers) => ({ name, body, headers }),
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

test("managers see scoped daily PS assistance before store walk-ins", () => {
  const f = fixture(false);
  f.context.openWalkInDailyModal();
  const html = f.roots.at(-1).innerHTML;
  assert.match(html, /<th>Date<\/th><th>Clients assisted<\/th><th>This year<\/th>/);
  assert.match(html, /<tr><td>2026-11-03<\/td><td>8<\/td><td>3<\/td>/);
  assert.doesNotMatch(html, />108</);
});

test("assistance comparison distinguishes missing counts from explicitly recorded zero", () => {
  const missing = fixture(false, []);
  missing.context.openWalkInDailyModal();
  assert.match(missing.roots.at(-1).innerHTML, /<tr><td>2026-11-03<\/td><td>—<\/td>/);
  const zero = fixture(false, [{ branch_id: "branch", counted_on: "2026-11-03", ps_id: "ps", clients_assisted: 0 }]);
  zero.context.openWalkInDailyModal();
  assert.match(zero.roots.at(-1).innerHTML, /<tr><td>2026-11-03<\/td><td>0<\/td>/);
});

test("only managers and above receive the additional clients-assisted column", () => {
  for (const role of ["district_manager", "admin"]) {
    const f = fixture(false);
    f.context.currentProfile.role = role;
    f.context.openWalkInDailyModal();
    assert.match(f.roots.at(-1).innerHTML, /<th>Clients assisted<\/th><th>This year<\/th>/);
  }
  const ps = fixture(true);
  ps.context.openWalkInDailyModal();
  assert.doesNotMatch(ps.roots.at(-1).innerHTML, /<th>Clients assisted<\/th>/);
  assert.match(ps.roots.at(-1).innerHTML, /<th>Date<\/th><th>This year<\/th>/);
  for (const role of ["inventory_controller", "stock_custodian"]) {
    const f = fixture(false);
    f.context.currentProfile.role = role;
    f.context.openWalkInDailyModal();
    assert.doesNotMatch(f.roots.at(-1).innerHTML, /<th>Clients assisted<\/th>/);
  }
});

test("downloaded manager comparison exports the additional column in the same position", () => {
  const f = fixture(false);
  f.context.collectingExports = true;
  const exported = f.context.openWalkInDailyModal();
  assert.equal(exported.name, "Walk-in traffic by day");
  assert.deepEqual(Array.from(exported.headers), ["Date", "Clients assisted", "This year", "Last year date", "Last year", "Change"]);
});

test("manager comparison uses store entries or imported history, never PS fallback", () => {
  const A = require("./analytics.js"), H = require("./daily-history.js");
  const date = "2026-11-03";
  const ps = [{ branch_id: "branch", counted_on: date, ps_id: "ps", clients_assisted: 5 }];
  for (const [real, history, expected] of [
    [[], [], "—"],
    [[], [{ branch_id: "branch", day: date, walkins: 12 }], "12"],
    [[{ branch_id: "branch", counted_on: date, visitors: 0 }], [{ branch_id: "branch", day: date, walkins: 12 }], "0"],
    [[{ branch_id: "branch", counted_on: date, visitors: 20 }], [{ branch_id: "branch", day: date, walkins: 12 }], "20"],
  ]) {
    const f = fixture(false, ps);
    f.context.window.BranchlineAnalytics.walkInSummary = A.walkInSummary;
    f.context.storeCountsFor = () => [...real, ...H.historyWalkins(history, real)];
    f.context.openWalkInDailyModal();
    assert.ok(f.roots.at(-1).innerHTML.includes(`<tr><td>${date}</td><td>5</td><td>${expected}</td>`));
  }
  const own = fixture(true, ps);
  own.context.window.BranchlineAnalytics.walkInSummary = A.walkInSummary;
  own.context.openWalkInDailyModal();
  assert.ok(own.roots.at(-1).innerHTML.includes(`<tr><td>${date}</td><td>5</td>`));
});
