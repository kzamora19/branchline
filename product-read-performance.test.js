"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("cached product read scopes preserve exact sales-role permissions without per-product authorization", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const actor = user => query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    const directory = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname, "supabase", "migrations");
    for (const filename of fs.readdirSync(directory).filter(name => name.endsWith(".sql")).sort()) {
      await db.exec(fs.readFileSync(path.join(directory, filename), "utf8")
        .replace(/create extension if not exists pgcrypto with schema extensions;/i, ""));
    }
    await db.exec(`
      insert into dealers(id,name) values('${id(1)}','One'),('${id(2)}','Other');
      insert into districts(id,dealer_id,name) values
        ('${id(3)}','${id(1)}','Assigned'),('${id(4)}','${id(1)}','Outside district'),('${id(5)}','${id(2)}','Other dealer');
      insert into branches(id,dealer_id,district_id,name) values
        ('${id(6)}','${id(1)}','${id(3)}','Assigned'),('${id(7)}','${id(1)}','${id(3)}','Unassigned'),
        ('${id(8)}','${id(1)}','${id(4)}','Outside district'),('${id(9)}','${id(2)}','${id(5)}','Other dealer');
      insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(10,15) n;
      insert into profiles(id,dealer_id,district_id,branch_id,role,full_name,assigned_brand) values
        ('${id(10)}','${id(1)}','${id(3)}','${id(6)}','ps','PS','TCL'),
        ('${id(11)}','${id(1)}','${id(3)}',null,'manager','Manager',null),
        ('${id(12)}','${id(1)}','${id(3)}',null,'district_manager','DM',null),
        ('${id(13)}','${id(1)}',null,null,'admin','Admin',null),
        ('${id(14)}','${id(1)}',null,null,'inventory_controller','Inventory',null),
        ('${id(15)}','${id(1)}',null,null,'stock_custodian','Custodian',null);
      insert into manager_branches(dealer_id,manager_id,district_id,branch_id)
        values('${id(1)}','${id(11)}','${id(3)}','${id(6)}');
      insert into products(dealer_id,branch_id,barcode,brand,model_description,srp)
        select b.dealer_id,b.id,lpad(n::text,8,'0'),'TCL','Fixture',100
        from branches b cross join generate_series(1,1001) n;
    `);
    for (let user = 10; user <= 15; user++) {
      await actor(id(user));
      const expected = await query(`select branch_id,barcode,srp from products
        where active and public.is_dealer_member(dealer_id) and public.can_access_branch(branch_id)
        order by branch_id,barcode`);
      await db.exec("set role authenticated");
      try {
        const actual = await query("select branch_id,barcode,srp from products where active order by branch_id,barcode");
        assert.deepEqual(actual, expected, `actor ${user} retains exact read scope`);
        assert.equal(actual.length, ({10:1001,11:1001,12:2002,13:3003,14:0,15:0})[user]);
        const page = await query("select branch_id,barcode,srp from products where active order by branch_id,barcode offset 1000 limit 1000");
        assert.deepEqual(page, expected.slice(1000,2000));
      } finally { await db.exec("reset role"); }
    }
    await actor(id(10));
    await db.exec(`update profiles set active=false where id='${id(10)}'; set role authenticated`);
    assert.equal((await query("select barcode from products")).length,0);
    await db.exec("reset role");
    await actor(id(12));
    await db.exec(`update dealers set enabled=false where id='${id(1)}'; set role authenticated`);
    assert.equal((await query("select barcode from products")).length,0);
    await db.exec("reset role");
    await actor(id(13));
    await db.exec("set role authenticated");
    assert.equal((await query("select barcode from products")).length,3003);
    const plan = await query("explain (format json) select branch_id,barcode,srp from products where active order by branch_id,barcode limit 1000");
    const nodes = [];
    function walk(node) { nodes.push(node); for (const child of node.Plans || []) walk(child); }
    walk(plan[0]["QUERY PLAN"][0].Plan);
    const productScans = nodes.filter(node => node["Relation Name"] === "products");
    assert.ok(productScans.length > 0);
    assert.ok(productScans.every(node => !/can_access_branch|is_dealer_member/.test(node.Filter || "")),
      "product scan uses cached membership sets, not per-product permission calls");
    await db.exec("reset role; set role anon");
    await assert.rejects(query("select srp from products"), /permission denied/);
  } finally { await db.close(); }
});
