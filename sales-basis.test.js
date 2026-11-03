const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const H = require("./daily-history.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => {
  const index = source.indexOf(start);
  assert.ok(index >= 0, start);
  return source.slice(index, source.indexOf(end, index));
};

test("comparison amount preserves zero SRP, falls back only for missing SRP and never mutates lines", () => {
  for (const [srp, price, quantity, expected] of [[150, 100, 2, 300], [0, 100, 2, 0], [null, 100, 2, 200], [undefined, 100, 2, 200], ["125.50", "90", 3, 376.5], [150, 0, 1, 150]]) {
    const line = { srp, selling_price: price, quantity };
    const before = { ...line };
    assert.equal(A.salesLineAmount(line, "srp"), expected);
    assert.equal(A.salesLineAmount(line, "price"), Number(price) * quantity);
    assert.equal(A.salesLineAmount(line), Number(price) * quantity);
    assert.deepEqual(line, before);
  }
});

test("all sales roles use selected basis in invoice totals and analytics while scope and pricing diagnostics stay unchanged", () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    const lines = [{ srp: 150, selling_price: 100, quantity: 2 }, { srp: null, selling_price: 40, quantity: 1 }, { srp: 0, selling_price: 20, quantity: 1 }];
    const sales = [{ id: "mine", branch_id: "one", sold_on: "2026-11-03" }, { id: "foreign", branch_id: "two", sold_on: "2026-11-03" }];
    const c = vm.createContext({ window: { BranchlineAnalytics: A }, ui: { salesBasis: "srp" },
      currentProfile: { role }, liveData: { sales }, visibleSales: () => [sales[0]], linesForSale: () => lines });
    vm.runInContext(section("  function saleTotal(", "  function periodDay("), c);
    vm.runInContext(section("  function analyticsFacts(", "  function dailySalesChart("), c);
    assert.equal(c.saleTotal(sales[0]), 340);
    assert.equal(c.saleTotal(sales[0], "price"), 260);
    const facts = c.analyticsFacts(new Set(["one"]));
    assert.equal(facts.length, 3);
    assert.equal(facts.reduce((sum, f) => sum + f.amount, 0), 340);
    assert.equal(facts[0].soldAmount, 200);
    assert.equal(facts[0].srpAmount, 300);
    c.ui.salesBasis = "price";
    assert.equal(c.analyticsFacts(new Set(["one"])).reduce((sum, f) => sum + f.amount, 0), 260);
  }
});

test("summary precedence retains selling-price totals in SRP mode without duplicating database sales", () => {
  const facts = [{ branchId: "one", date: "2025-01-02", saleId: "a", amount: 300 }];
  const history = [{ branch_id: "one", day: "2025-01-02", sales: 999 }, { branch_id: "one", day: "2025-02-02", sales: 200 }];
  const result = H.reconcileSalesFacts(history, facts, new Set(["one"]));
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 500);
  assert.equal(result.find(row => row.summary).amount, 200);
});

test("selector is shared and persisted; warnings, raw transaction totals, report exports and pace checks are explicit", () => {
  const c = vm.createContext({ ui: { salesBasis: "srp" } });
  vm.runInContext(section("  function salesBasisNote(", "  function filterBar("), c);
  assert.match(c.salesBasisNote(), /mixed basis.*missing SRPs and summary-only totals\/channels use selling price/);
  assert.match(source, /savedFilterKeys = \[[\s\S]*?"salesBasis"/);
  assert.match(source, /if \(!\["price", "srp"\]\.includes\(ui.salesBasis\)\) ui.salesBasis = "price"/);
  assert.match(section("  function filterBar(", "  function pageHeading("), /universalPages.has\(activePage\)[\s\S]*data-filter="salesBasis"/);
  assert.doesNotMatch(source, /data-filter="brandBasis"/);
  assert.match(source, /data-sales-basis-note/);
  assert.match(source, /Transaction total: \$\{formatMoney\(saleTotal\(sale, "price"\)\)\}/);
  assert.match(source, /personalTargetProgress\("price"\)/);
  assert.match(source, /ui.salesBasis = savedUi.salesBasis/);
  assert.match(source, /name: "Comparison basis"/);
  assert.match(source, /"Comparison amount"/);
});

test("comparison preference restores per account, rejects invalid values and defaults to actual selling price", () => {
  const storage = new Map();
  const ui = {};
  const c = vm.createContext({ ui, savedFilterKeys: ["salesBasis"], filterAccount: "", demoStore: null,
    currentProfile: { dealer_id: "dealer", id: "one" }, currentMonth: () => "2026-11",
    resetUi: () => Object.assign(ui, { period: "month", anRange: "month", anBasis: "all", month: "2026-11", salesBasis: "price" }),
    window: { BranchlineAnalytics: A }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, console });
  vm.runInContext(section("  function filterStorageKey(", "  function sanitizeAccountScope("), c);
  vm.runInContext(section("  function saveAccountFilters(", "  let productsFiltered"), c);
  c.restoreAccountFilters();
  assert.equal(ui.salesBasis, "price");
  ui.salesBasis = "srp";
  c.saveAccountFilters();
  c.currentProfile.id = "two";
  c.restoreAccountFilters();
  assert.equal(ui.salesBasis, "price");
  c.currentProfile.id = "one";
  c.restoreAccountFilters();
  assert.equal(ui.salesBasis, "srp");
  storage.set("branchline-filters-v1:live:dealer:invalid", '{"salesBasis":"not-a-basis"}');
  c.currentProfile.id = "invalid";
  c.restoreAccountFilters();
  assert.equal(ui.salesBasis, "price");
});

const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;
test("PS contribution SQL uses matching fallback without broadening access or changing stored prices", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const directory = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname, "supabase", "migrations");
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table profiles(id int,active boolean,role text,branch_id int,dealer_id int,assigned_brand text,full_name text,login_id text);
      create table sales(id int,ps_id int,branch_id int,dealer_id int,sold_on date,customer_name text,invoice_number text);
      create table sale_lines(sale_id int,selling_price numeric,srp numeric,quantity int,brand text,category text,sub_category text,model_description text);
      create function auth.uid() returns int language sql as $$select nullif(current_setting('app.actor',true),'')::int$$;
      create function is_dealer_member(int) returns boolean language sql as $$select true$$;
      create function is_test_sale(text,text) returns boolean language sql as $$select false$$;
      create function is_test_profile(text,text) returns boolean language sql as $$select false$$;
      create function line_in_scope(text,text,text,text) returns boolean language sql as $$select true$$;
      create function ps_brand_parts(text,int) returns table(base text,scope text) language sql as $$select lower($1),null::text$$;
      insert into profiles values(1,true,'ps',1,1,'TCL','One','one'),(2,true,'ps',2,1,'TCL','Two','two'),(3,true,'admin',1,1,'TCL','Admin','admin');
      insert into sales values(1,1,1,1,'2026-11-03','Customer','A'),(2,2,2,1,'2026-11-03','Customer','B');
      insert into sale_lines values(1,100,150,2,'TCL','','','A'),(1,40,null,1,'TCL','','','B'),(1,20,0,1,'TCL','','','C'),(2,999,9999,1,'TCL','','','D');`);
    await db.exec(fs.readFileSync(path.join(directory, "20261107000000_brand_contribution_performance.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261130000000_srp_comparison_fallback.sql"), "utf8"));
    await db.exec("select set_config('app.actor','1',false); set role authenticated;");
    const row = (await db.query("select * from brand_sales_contribution()")).rows[0];
    assert.equal(Number(row.own_srp), 340);
    assert.equal(Number(row.branch_srp), 340);
    assert.equal(Number(row.own_price), 260);
    assert.equal(Number(row.missing_srp), 1);
    await db.exec("select set_config('app.actor','3',false)");
    assert.equal((await db.query("select * from brand_sales_contribution()")).rows.length, 0);
    await db.exec("reset role");
    assert.equal((await db.query("select sum(selling_price*quantity)::int amount from sale_lines where sale_id=1")).rows[0].amount, 260);
    assert.equal((await db.query("select has_function_privilege('anon','brand_sales_contribution()','execute') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
