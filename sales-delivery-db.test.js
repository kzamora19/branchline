const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("real DB delivery saves are atomic, fees excluded from sales, edits audited and reads role/branch scoped", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const dealer=id(1),district=id(2),branch=id(3),other=id(4),ps=id(5),admin=id(6),manager=id(7),second=id(8),controller=id(9);
  const call = async (sql, params=[]) => (await db.query(sql,params)).rows;
  const actor = user => call("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  const save = async (method,fee,saleId=null,qty=1) => (await call(
    "select save_sale_with_delivery('Customer','DG-TEST',current_date,$1::jsonb,$2,'Cash','City','Barangay','[]',false,$3,$4) id",
    [JSON.stringify([{barcode:"00000101",quantity:qty,selling_price:100,srp:150}]),saleId,method,fee]))[0].id;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema extensions;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const directory = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname,"supabase","migrations");
    const files=fs.readdirSync(directory).filter(name=>name.endsWith(".sql")).sort();
    assert.ok(files.some(name=>name.includes("initial_schema")), "Set BRANCHLINE_MIGRATIONS to the complete migration chain for integration tests.");
    for (const file of files) {
      if (file==="20261118000000_sales_history_ps_aliases.sql" || file==="20261124000000_delivery_guarranty.sql") continue;
      await db.exec(fs.readFileSync(path.join(directory,file),"utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i,""));
    }
    await db.exec(fs.readFileSync(path.join(__dirname,"supabase","migrations","20261124000000_delivery_guarranty.sql"),"utf8"));
    await db.exec(`insert into dealers(id,name)values('${dealer}','Fixture');
      insert into districts(id,dealer_id,name)values('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name,code)values('${branch}','${dealer}','${district}','Santiago','STG'),('${other}','${dealer}','${district}','Other','OTH');
      insert into auth.users values('${ps}'),('${admin}'),('${manager}'),('${second}'),('${controller}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name)values
      ('${ps}','${dealer}','${district}','${branch}','ps','TCL','PS One'),
      ('${second}','${dealer}','${district}','${other}','ps','TCL','PS Two'),
      ('${admin}','${dealer}',null,null,'admin',null,'Admin'),
      ('${manager}','${dealer}','${district}',null,'manager',null,'BM'),
      ('${controller}','${dealer}',null,null,'inventory_controller',null,'Stock');
      insert into manager_branches(dealer_id,manager_id,district_id,branch_id)values('${dealer}','${manager}','${district}','${branch}');
      insert into manager_branch_assignments(dealer_id,manager_id,district_id,branch_id)values('${dealer}','${manager}','${district}','${branch}');
      insert into payment_modes(dealer_id,name)values('${dealer}','Cash');`);
    await actor(admin);
    await call("select import_inventory($1,now(),'fixture',$2::jsonb)",[branch,JSON.stringify([{barcode:"00000101",description:"TCL TEST UNIT",brand:"TCL",category:"TV",quantity:5,serialized:false,serials:[]}])]);
    await actor(ps);await db.exec("set role authenticated");
    for (const [method,fee] of [[null,null],["unknown",null],["pickup",10],["delivery",-1],["delivery",0],["delivery",1.001],["delivery","NaN"]]) {
      await assert.rejects(save(method,fee));
    }
    const sale=await save("delivery",200);
    await assert.rejects(save(null,null,sale),/Choose Delivery or Pick up/);
    assert.equal((await call("select sum(quantity*selling_price)::numeric amount from sale_lines where sale_id=$1",[sale]))[0].amount,"100.00");
    assert.equal((await call("select amount from sale_delivery_guaranties where sale_id=$1",[sale]))[0].amount,"200.00");
    await assert.rejects(call("update sale_delivery_guaranties set amount=999 where sale_id=$1",[sale]),/permission denied/);
    await assert.rejects(save("delivery",300,sale,10),/Insufficient/);
    assert.equal((await call("select amount from sale_delivery_guaranties where sale_id=$1",[sale]))[0].amount,"200.00");
    await actor(second);
    assert.equal((await call("select * from sale_delivery_guaranties")).length,0);
    await assert.rejects(save("pickup",null,sale));
    await actor(controller);
    assert.equal((await call("select * from sale_delivery_guaranties")).length,0);
    await actor(manager);
    assert.equal((await call("select * from sale_delivery_guaranties")).length,1);
    await save("pickup",null,sale);
    assert.equal((await call("select * from sale_delivery_guaranties")).length,0);
    assert.equal((await call("select fulfillment_method from sales where id=$1",[sale]))[0].fulfillment_method,"pickup");
    const history=(await call("select previous_values from sale_edit_history where sale_id=$1",[sale]))[0].previous_values;
    assert.equal(history.delivery_guarranty_amount,200);
    assert.equal(history.fulfillment_method,"delivery");
    await actor(ps);
    await save("delivery",250,sale);
    await db.exec("reset role");
    await call("update sales set fulfillment_method=null where id=$1",[sale]);
    await db.exec("set role authenticated");
    await save(null,null,sale);
    assert.equal((await call("select fulfillment_method from sales where id=$1",[sale]))[0].fulfillment_method,null);
    await save("delivery",250,sale);
    assert.equal((await call("select quantity from inventory_stock where branch_id=$1 and barcode='00000101'",[branch]))[0].quantity,4);
    await actor(admin);
    await call("select admin_delete_sale($1)",[sale]);
    assert.equal((await call("select * from sale_delivery_guaranties")).length,0);
    await db.exec("reset role");
    assert.equal((await call("select has_function_privilege('authenticated','public.save_inventory_sale(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean)','execute') allowed"))[0].allowed,false);
  } finally { await db.close(); }
});
