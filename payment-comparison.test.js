const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const H = require("./daily-history.js");
const Demo = require("./demo-data.js");
const channels = ["Store Operations", "Corporate", "Sub Dealer", "Non-Store", "Home Credit", "Credit Card", "Deferred", "Goldmine", "Techzone"];
const breakdown = (overrides = {}) => ({ ...Object.fromEntries(channels.map(key => [key, 0])), ...overrides });
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("comparison groups debit with credit, cash/COD together and preserves input labels and summed targets", () => {
  const sales = [
    { mode: "Debit Card", amount: 100 }, { mode: "Credit Card", amount: 200 },
    { mode: "Cash", amount: 300 }, { mode: "COD", amount: 400 },
  ];
  const targets = [
    { mode: "Debit Card", branch_id: "one", share_pct: 10, amount: null },
    { mode: "Credit Card", branch_id: "one", share_pct: 20, amount: null },
    { mode: "Cash", branch_id: "one", share_pct: 30, amount: null },
    { mode: "COD", branch_id: "one", share_pct: 40, amount: null },
  ];
  const before = JSON.stringify({ sales, targets });
  const mix = A.paymentMix({ sales, modes: ["Cash", "COD", "Debit Card", "Credit Card"], targets, branchTargets: new Map([["one", 1000]]) });
  assert.equal(mix.total, 1000);
  assert.equal(mix.totalTransactions, 4);
  assert.equal(mix.rows.length, 2);
  const credit = mix.rows.find(row => row.mode === "Credit Card");
  assert.deepEqual([credit.sales, credit.transactions, credit.share, credit.targetPct, credit.targetAmount], [300, 2, 30, 30, 300]);
  const store = mix.rows.find(row => row.mode === "Store Operations");
  assert.deepEqual([store.sales, store.transactions, store.share, store.targetPct], [700, 2, 70, 70]);
  assert.equal(JSON.stringify({ sales, targets }), before);
  for (const [input, expected] of [["Non-Store", "Digital Payment"], ["Deferred", "Flexi Deals"], ["Goldmine", "Gold Mine"], ["Techzone", "Techzone"], ["Sub Dealer", "Subdealer"]]) {
    assert.equal(A.comparisonPaymentMode(input), expected);
  }
  const across = A.paymentMix({ targets: [...targets, ...targets.map(row => ({ ...row, branch_id: "two" }))], branchTargets: new Map([["one", 1000], ["two", 2000]]) });
  assert.equal(across.rows.find(row => row.mode === "Credit Card").targetPct, 30);
  assert.equal(across.rows.find(row => row.mode === "Credit Card").targetAmount, 900);
});

test("monitoring parser imports verified TY/LY channels, keeps old layouts and reports inconsistent amounts", () => {
  const headers = ["Date", "FT TY", "FT LY", "# of INV. TY", "# of INV. LY", "Total TY", "Total LY",
    ...channels.map(mode => mode + " TY"), ...channels.map(mode => mode + " LY")];
  const row = [1, 3, 5, 2, 4, 100, 200, ...Object.values(breakdown({ "Store Operations": 60, "Credit Card": 40 })),
    ...Object.values(breakdown({ "Non-Store": 50, "Deferred": 150 }))];
  const parsed = H.parseMonitoring({ January: [headers, row] }, { year: 2026, cutoff: "2026-01-31" });
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.rows.find(item => item.day === "2025-01-01").payment_breakdown, breakdown({ "Non-Store": 50, "Deferred": 150 }));
  assert.equal(parsed.rows.find(item => item.day === "2026-01-01").payment_breakdown["Credit Card"], 40);
  const bad = [...row]; bad[6] = 201;
  const mismatch = H.parseMonitoring({ January: [headers, bad] }, { year: 2026, cutoff: "2026-01-31" });
  assert.match(mismatch.warnings[0], /2025-01-01.*do not match/);
  assert.equal(mismatch.rows.find(item => item.day === "2025-01-01").payment_breakdown, undefined);
});

function paymentContext(role = "admin") {
  const context = vm.createContext({
    window: { BranchlineAnalytics: A }, currentProfile: { role }, visibleSales: () => context.liveData.sales,
    liveData: { sales: [], targets: [], paymentTargets: [], paymentModes: [{ name: "Cash" }, { name: "Debit Card" }], dailyHistory: [] },
    saleTotal: sale => sale.total, addTo: (map, key, value) => map.set(key, (map.get(key) || 0) + value),
  });
  vm.runInContext(source.slice(source.indexOf("  function computePaymentMix("), source.indexOf("  const MIX_STATUS")), context);
  return context;
}

test("LY comparison uses scoped summary channels only for empty 2025 branch/months and includes prior-only modes", () => {
  const context = paymentContext();
  context.liveData.sales = [
    { branch_id: "one", sold_on: "2026-11-02", payment_mode: "Debit Card", total: 40 },
    { branch_id: "two", sold_on: "2025-11-20", payment_mode: "COD", total: 99 },
  ];
  context.liveData.dailyHistory = [
    { branch_id: "one", day: "2025-11-02", sales: 100, payment_breakdown: breakdown({ "Non-Store": 70, "Credit Card": 30 }) },
    { branch_id: "one", day: "2025-11-03", sales: 500 },
    { branch_id: "one", day: "2025-11-04", sales: 900, payment_breakdown: breakdown({ "Store Operations": 900 }) },
    { branch_id: "two", day: "2025-11-02", sales: 999, payment_breakdown: breakdown({ "Store Operations": 999 }) },
    { branch_id: "foreign", day: "2025-11-02", sales: 9999, payment_breakdown: breakdown({ "Store Operations": 9999 }) },
  ];
  const mix = context.computePaymentMix("2026-11", new Set(["one", "two"]), "2026-11-03");
  assert.equal(mix.total, 40);
  assert.equal(mix.lyTotal, 100);
  assert.equal(mix.missingPaymentDays, 1);
  assert.equal(mix.rows.find(row => row.mode === "Credit Card").lySales, 30);
  const digital = mix.rows.find(row => row.mode === "Digital Payment");
  assert.equal(digital.sales, 0); assert.equal(digital.lySales, 70); assert.equal(digital.lyShare, 70);
  assert.equal(mix.rows.some(row => row.mode === "Debit Card"), false);
  context.currentProfile.role = "ps";
  assert.equal(context.computePaymentMix("2026-11", new Set(["one"]), "2026-11-03").lyTotal, 0);
});

test("demo re-import fills missing channels without modifying saved totals and rejects invalid input atomically", async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const demo = Demo.create({ storage, catalog: Demo.sampleCatalog(), today: "2026-11-03" });
  const branch = demo.profile.branch_id;
  demo.setRole("admin");
  const payload = { p_batch: "payment-fixture", p_label: "Payment fixture", p_file: "fictional.xlsx", p_branch: branch,
    p_rows: [{ day: "2025-02-02", sales: 100, transactions: 2, walkins: 5 }] };
  assert.equal((await demo.client.rpc("import_daily_history", payload)).error, null);
  payload.p_rows[0].payment_breakdown = breakdown({ "Store Operations": 100 });
  const filled = await demo.client.rpc("import_daily_history_with_payments", payload);
  assert.equal(filled.error, null);
  assert.equal(filled.data.payment_days, 1);
  const read = async () => (await demo.client.from("branch_daily_history").select("*")).data.find(row => row.day === "2025-02-02");
  assert.equal((await read()).sales, 100);
  assert.equal((await read()).transactions, 2);
  assert.deepEqual((await read()).payment_breakdown, payload.p_rows[0].payment_breakdown);
  assert.equal((await demo.client.rpc("import_daily_history_with_payments", payload)).data.payment_skipped, 1);
  const before = JSON.stringify(await read());
  payload.p_rows[0].payment_breakdown["Store Operations"] = 101;
  assert.match((await demo.client.rpc("import_daily_history_with_payments", payload)).error.message, /does not match/);
  assert.equal(JSON.stringify(await read()), before);
});

test("database channel import is admin/dealer scoped, atomic, backfills only matching totals and preserves existing values", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const [admin, manager, inactive, foreignAdmin, dealer, foreignDealer, branch] = [1, 2, 3, 4, 10, 11, 20].map(id);
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,dealer_id uuid,role text,active boolean);
      create table public.branches(id uuid primary key,dealer_id uuid);
      create table public.sales_import_batches(id uuid primary key,dealer_id uuid,label text,source_file text,created_by uuid,kind text,sales_count integer,lines_count integer,amount numeric,date_from date,date_to date);
      create table public.branch_daily_history(id uuid primary key default gen_random_uuid(),dealer_id uuid,branch_id uuid,day date,sales numeric(14,2),transactions integer,walkins integer,remarks text,batch_id uuid,unique(branch_id,day));
      insert into public.profiles values('${admin}','${dealer}','admin',true),('${manager}','${dealer}','manager',true),
        ('${inactive}','${dealer}','admin',false),('${foreignAdmin}','${foreignDealer}','admin',true);
      insert into public.branches values('${branch}','${dealer}');`);
    const dir = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname, "supabase", "migrations");
    const original = fs.readFileSync(path.join(dir, "20261103000000_daily_history.sql"), "utf8");
    await db.exec(original.slice(original.indexOf("create or replace function public.import_daily_history("), original.indexOf("-- One removal function")));
    await db.exec(fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261128000000_monitoring_payment_breakdown.sql"), "utf8"));
    await db.exec("set role authenticated");
    const actor = user => db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const payload = [{ day: "2025-01-02", sales: 100, transactions: 2, walkins: 5, payment_breakdown: breakdown({ "Credit Card": 100 }) }];
    const call = (batch, rows = payload) => db.query("select public.import_daily_history_with_payments($1,'Fixture','fictional.xlsx',$2,$3::jsonb) result", [batch, branch, JSON.stringify(rows)]);
    for (const user of [manager, inactive]) { await actor(user); await assert.rejects(call(id(100)), /Only administrators/); }
    await actor(foreignAdmin); await assert.rejects(call(id(100)), /Unknown branch/);
    await actor(admin);
    const added = (await call(id(100))).rows[0].result;
    assert.equal(added.payment_days, 1); assert.equal(added.days, 1);
    const duplicate = (await call(id(100))).rows[0].result;
    assert.equal(duplicate.payment_skipped, 1); assert.equal(duplicate.days, 0);
    const wrong = [{ ...payload[0], day: "2025-01-03", payment_breakdown: breakdown({ "Credit Card": 101 }) }];
    await assert.rejects(call(id(101), [payload[0], ...wrong]), /does not match/);
    await assert.rejects(call(id(101), [{ ...payload[0], payment_breakdown: breakdown({ "Credit Card": -1 }) }]), /negative/);
    await assert.rejects(call(id(101), [{ ...payload[0], payment_breakdown: { ...breakdown(), Unknown: 100 } }]), /nine/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*) n from sales_import_batches")).rows[0].n, 1);
    await db.exec("update branch_daily_history set payment_breakdown=null;");
    await db.exec("set role authenticated"); await actor(admin);
    assert.equal((await call(id(100))).rows[0].result.payment_days, 1);
    await db.exec("reset role");
    const saved = (await db.query("select sales,transactions,payment_breakdown from branch_daily_history")).rows[0];
    assert.equal(Number(saved.sales), 100); assert.equal(saved.transactions, 2); assert.deepEqual(saved.payment_breakdown, payload[0].payment_breakdown);
    await db.exec("update branch_daily_history set payment_breakdown=null,sales=99;");
    await db.exec("set role authenticated"); await actor(admin);
    assert.equal((await call(id(100))).rows[0].result.payment_skipped, 1);
    await db.exec("reset role");
    assert.equal((await db.query("select payment_breakdown from branch_daily_history")).rows[0].payment_breakdown, null);
    const acl = (await db.query("select has_function_privilege('anon','public.import_daily_history_with_payments(uuid,text,text,uuid,jsonb)','execute') allowed")).rows[0];
    assert.equal(acl.allowed, false);
  } finally { await db.close(); }
});
