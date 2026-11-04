"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;
const directory = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname, "supabase", "migrations");
const read = name => fs.readFileSync(path.join(directory, name + ".sql"), "utf8");

test("database brand aliases preserve scoped routing, access checks, test exclusions and price-free logs", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const dealer = id(1), branch = id(2), otherBranch = id(3), otherDealer = id(4), general = id(5), scoped = id(6), seller = id(7), testPs = id(8), admin = id(9);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const actor = user => query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public, auth to authenticated;
      create table profiles(id uuid primary key, dealer_id uuid, branch_id uuid, role text, assigned_brand text, full_name text, login_id text, active boolean default true, salesperson_code text);
      create table products(dealer_id uuid, brand text);
      create table sales(id uuid primary key, dealer_id uuid, branch_id uuid, ps_id uuid, sold_on date, invoice_number text, customer_name text, created_at timestamptz default now(), salesperson_code text);
      create table sale_lines(id uuid primary key, sale_id uuid, brand text, category text, sub_category text, model_description text, quantity integer, selling_price numeric, srp numeric);
      alter table sale_lines add column barcode text default '0001';
      create table sale_serials(sale_id uuid, barcode text, position integer, serial text);
      create function is_dealer_member(p_dealer uuid) returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and dealer_id=p_dealer and active)$$;
      create function is_test_sale(p_customer text,p_invoice text) returns boolean language sql immutable as $$select coalesce(p_customer,'') ~* '^test([^a-z]|$)' or coalesce(p_invoice,'') ~* '^test([^a-z]|$)'$$;`);
    const scopedSql = read("20261028000000_brand_scope_product_delete");
    await db.exec(scopedSql.slice(0, scopedSql.indexOf("-- Branch-wide")));
    const multiSql = read("20261029000000_multi_brand_ps");
    await db.exec(multiSql.slice(0, multiSql.indexOf("drop function")));
    const testSql = read("20261030000000_exclude_test_profiles");
    await db.exec(testSql.slice(0, testSql.indexOf("-- PS dashboard:")));
    await db.exec(testSql.slice(testSql.indexOf("-- Branch-wide brand log:")));
    await db.exec(read("20261107000000_brand_contribution_performance"));
    await db.exec(read("20261108000000_complete_brand_log_export"));
    await db.exec(read("20261203000000_canonical_brand_matching"));
    await db.exec(read("20261204000000_itemized_brand_exports"));
    await db.exec(`insert into profiles(id,dealer_id,branch_id,role,assigned_brand,full_name) values
      ('${general}','${dealer}','${branch}','ps','CON-CONDURA','General'),
      ('${scoped}','${dealer}','${branch}','ps','CARRIER / CON-CONDURA - AIRCON','Scoped'),
      ('${seller}','${dealer}','${branch}','ps','FUJIDENZO / WHIRLPOOL','Seller'),
      ('${testPs}','${dealer}','${branch}','ps','TCL','Test_PS'),
      ('${admin}','${dealer}',null,'admin',null,'Admin');
      insert into products values('${dealer}','CON-CONDURA'),('${dealer}','CON-DEVANT'),('${dealer}','BRAND-WITH-HYPHEN');`);
    const lines = [
      ["CONDURA", "Aircon", branch, dealer, scoped, "Normal"],
      ["CON-CONDURA", "Aircon", branch, dealer, seller, "Normal"],
      ["CONDURA", "Refrigerator", branch, dealer, general, "Normal"],
      ["CON-CONDURA", "Refrigerator", branch, dealer, seller, "Normal"],
      ["CARRIER", "TV", branch, dealer, scoped, "Normal"],
      ["CON-CARRIER", "Aircon", branch, dealer, seller, "Normal"],
      ["CONDURA", "Aircon", otherBranch, dealer, seller, "Normal"],
      ["CONDURA", "Aircon", branch, otherDealer, seller, "Normal"],
      ["CONDURA", "Aircon", branch, dealer, testPs, "Normal"],
      ["CONDURA", "Aircon", branch, dealer, seller, "Test Customer"],
      ["FUJIDENZO", "Refrigerator", branch, dealer, seller, "Normal"],
      ["CON-WHIRLPOOL", "Washer", branch, dealer, seller, "Normal"],
      ["MIDEA", "TV", branch, dealer, seller, "Normal"],
      ["CON-TOSHIBA", "TV", branch, dealer, seller, "Normal"],
      ["DEVANT", "TV", branch, dealer, seller, "Normal"],
      ["CON-DEVANT", "TV", branch, dealer, seller, "Normal"],
    ];
    for (const [index, [brandName, category, branchId, dealerId, psId, customer]] of lines.entries()) {
      await query("insert into sales(id,dealer_id,branch_id,ps_id,sold_on,invoice_number,customer_name) values($1,$2,$3,$4,'2026-11-02',$5,$6)",
        [id(100 + index), dealerId, branchId, psId, `INV-${index}`, customer]);
      await query("insert into sale_lines(id,sale_id,brand,category,sub_category,model_description,quantity,selling_price,srp) values($1,$2,$3,$4,'','Fixture',1,100,150)", [id(200 + index), id(100 + index), brandName, category]);
    }
    const countsBefore = await query("select (select count(*) from sales)::int sales,(select count(*) from sale_lines)::int lines");
    await actor(scoped);
    await db.exec("set role authenticated");
    await assert.rejects(query("select * from ps_brand_parts('CONDURA',$1)", [dealer]), /permission denied/);
    const check = async (user, expected, own) => {
      await actor(user);
      const log = await query("select * from export_brand_branch_sales()");
      const detailed = await query("select * from export_brand_branch_sales_v2()");
      assert.equal(detailed.length, log.length);
      assert.ok(detailed.every(row => !("amount" in row) && !("selling_price" in row) && !("srp" in row) && !("customer_name" in row)));
      assert.equal(log.length, expected);
      assert.ok(log.every(row => row.branch_id === branch));
      assert.ok(log.every(row => !("amount" in row) && !("selling_price" in row) && !("srp" in row)));
      const contribution = (await query("select * from brand_sales_contribution()"))[0];
      assert.equal(Number(contribution.branch_price), expected * 100);
      assert.equal(Number(contribution.branch_srp), expected * 150);
      assert.equal(Number(contribution.own_price), own * 100);
      assert.equal((await query("select * from brand_branch_sales()")).length, expected);
    };
    await check(scoped, 4, 2);
    await check(general, 2, 1);
    await check(seller, 2, 2);
    await db.exec("reset role");
    for (const assignment of ["MIDEA / TOSHIBA", "DEVANT", "CON-DEVANT"]) {
      await query("update profiles set assigned_brand=$1 where id=$2", [assignment, seller]);
      await db.exec("set role authenticated");
      await check(seller, 2, 2);
      await db.exec("reset role");
    }
    const parts = await query("select * from ps_brand_parts('CARRIER / CON-CONDURA - AIRCON / CON-DEVANT',$1)", [dealer]);
    assert.deepEqual(parts, [{ base: "carrier", scope: null }, { base: "condura", scope: "aircon" }, { base: "devant", scope: null }]);
    await actor(admin); await db.exec("set role authenticated");
    await assert.rejects(query("select * from export_brand_branch_sales()"), /active Product Specialist/);
    await assert.rejects(query("select * from export_brand_branch_sales_v2()"), /active Product Specialist/);
    assert.equal((await query("select * from brand_sales_contribution()")).length, 0);
    await db.exec("reset role");
    assert.deepEqual(await query("select (select count(*) from sales)::int sales,(select count(*) from sale_lines)::int lines"), countsBefore);
    assert.equal((await query("select brand from sale_lines where id=$1", [id(201)]))[0].brand, "CON-CONDURA");
    await query("update profiles set salesperson_code='CURRENT' where id=$1", [general]);
    await query("update sales set salesperson_code='0001937' where id=$1", [id(102)]);
    await query("insert into sale_lines(id,sale_id,brand,category,sub_category,model_description,quantity,selling_price,srp) values($1,$2,'CON-CONDURA','Refrigerator','','Second',2,100,150)", [id(999), id(102)]);
    for (let index = 0; index < 3; index++) await query("insert into sale_serials values($1,'0001',$2,$3)", [id(102), index + 1, `SN-${index + 1}`]);
    await actor(general); await db.exec("set role authenticated");
    const units = await query("select * from export_brand_branch_sales_v2() where invoice_number='INV-2' order by line_id");
    assert.deepEqual(units.map(row => row.serial_numbers), [["SN-1"], ["SN-2", "SN-3"]]);
    assert.ok(units.every(row => row.salesperson_code === "0001937" && row.ps_id === general && row.ps_name === "General"));
    assert.equal((await query("select has_function_privilege('anon','public.export_brand_branch_sales_v2()','execute') allowed"))[0].allowed, false);
  } finally { await db.close(); }
});
