"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("promotion review is scoped to managers, validates real products and preserves source evidence", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const [dealer, district, branch, other, ps, manager, admin] = [1, 2, 3, 4, 5, 6, 7].map(id);
  const call = async (sql, params = []) => (await db.query(sql, params)).rows;
  const actor = user => call("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const components = [
    { id: "paid", barcode: "101", quantity: 5, free: false },
    { id: "free", barcode: "101", quantity: 1, free: true },
  ];
  const review = (target, parts = components, conflict = false) => call(
    "select public.review_promotion($1,'65122','Buy five get one',null,null,$2,'offer.pdf',1,'Source description',$3::jsonb) id",
    [target, conflict, JSON.stringify(parts)]);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema extensions;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const dir = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname, "supabase", "migrations");
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".sql")).sort()) {
      try { await db.exec(fs.readFileSync(path.join(dir, file), "utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i, "")); }
      catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
    }
    await db.exec(`insert into dealers(id,name) values('${dealer}','Fixture');
      insert into districts(id,dealer_id,name) values('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name) values('${branch}','${dealer}','${district}','One'),('${other}','${dealer}','${district}','Two');
      insert into auth.users values('${ps}'),('${manager}'),('${admin}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name) values
        ('${ps}','${dealer}','${district}','${branch}','ps','TCL','PS'),
        ('${manager}','${dealer}','${district}',null,'manager',null,'Manager'),
        ('${admin}','${dealer}',null,null,'admin',null,'Admin');
      insert into manager_branches(manager_id,branch_id,dealer_id,district_id) values('${manager}','${branch}','${dealer}','${district}');
      insert into products(dealer_id,branch_id,barcode,model_description,brand,srp) values
        ('${dealer}','${branch}','00000101','Fan','TCL',100),
        ('${dealer}','${branch}','00000102','Other','TCL',null);`);
    await actor(ps);
    await db.exec("set role authenticated");
    await assert.rejects(review(branch), /manager/);
    await actor(manager);
    await assert.rejects(review(other), /manager/);
    await assert.rejects(review(branch, [{ id: "bad", barcode: "999", quantity: 1, free: false }]), /not active/);
    await assert.rejects(review(branch, [{ id: "bad", barcode: "102", quantity: 1, free: false }]), /standard SRP/);
    await assert.rejects(review(branch, [components[0], components[0]]), /unique/);
    await assert.rejects(review(branch, [{ ...components[0], quantity: 1.5 }]), /whole quantity/);
    const promotion = (await review(branch, components, true))[0].id;
    const saved = (await call("select * from reviewed_promotions where id=$1", [promotion]))[0];
    assert.equal(saved.barcode, "00065122");
    assert.equal(saved.reviewed_by, manager);
    assert.equal(saved.source_name, "offer.pdf");
    assert.equal(saved.source_excerpt, "Source description");
    assert.equal(saved.price_conflict, true);
    assert.deepEqual(saved.components, components.map(item => ({ ...item, barcode: "00000101" })));
    await assert.rejects(call("update reviewed_promotions set description='Tampered' where id=$1", [promotion]), /permission denied/);
    await actor(ps);
    assert.equal((await call("select count(*)::int n from reviewed_promotions"))[0].n, 1);
    await assert.rejects(call("select revoke_promotion($1)", [promotion]), /manager/);
    await actor(manager);
    await call("select revoke_promotion($1)", [promotion]);
    assert.equal((await call("select revoked_by from reviewed_promotions where id=$1", [promotion]))[0].revoked_by, manager);
    await actor(ps);
    await assert.rejects(call("select save_promotion_sale($1,90,true,'Customer','I',current_date,'[]'::jsonb,'Cash','City','Barangay','[]'::jsonb,'pickup',null)", [promotion]), /unavailable/);
    await actor(admin);
    assert.equal((await call("select count(*)::int n from reviewed_promotions"))[0].n, 1);
    const priced = (price, srp) => call(
      "select review_priced_promotion($1,'65433','Bundle',null,null,false,'offer.pdf',1,'Source',$2::jsonb,$3,$4) id",
      [branch, JSON.stringify(components), srp, price]);
    await assert.rejects(priced(null, 120), /tag price/);
    await assert.rejects(priced(10.001, 120), /tag price/);
    const pricedId = (await priced(99.50, 120))[0].id;
    const prices = (await call("select memo_srp,tag_price from reviewed_promotions where id=$1", [pricedId]))[0];
    assert.equal(prices.memo_srp, "120.00");
    assert.equal(prices.tag_price, "99.50");
    await actor(ps);
    await assert.rejects(priced(90, 100), /manager/);
  } finally { await db.close(); }
});
