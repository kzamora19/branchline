const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("confirmed multiword brands survive every catalog and sales write without changing prices or scope", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const dealer=id(1), district=id(2), branch=id(3), other=id(4), admin=id(5), manager=id(6);
  const call = async (sql, params=[]) => (await db.query(sql,params)).rows;
  const actor = user => call("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  const item = (brand,description,srp=100) => ({barcode:"101",brand,description,category:"KITCHEN",srp});
  const brands = async () => (await call("select brand from products where barcode='00000101' order by branch_id")).map(row=>row.brand);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    const directory=process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname,"supabase","migrations");
    for (const filename of fs.readdirSync(directory).filter(name=>name.endsWith(".sql")).sort()) {
      const sql=fs.readFileSync(path.join(directory,filename),"utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i,"");
      try { await db.exec(sql); } catch(error) { throw new Error(`${filename}: ${error.message}`,{cause:error}); }
    }
    await db.exec(`
      insert into dealers(id,name) values('${dealer}','Fixture');
      insert into districts(id,dealer_id,name) values('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name,code) values
        ('${branch}','${dealer}','${district}','Santiago','STG'),('${other}','${dealer}','${district}','Other','OTH');
      insert into auth.users values('${admin}'),('${manager}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,full_name) values
        ('${admin}','${dealer}',null,null,'admin','Admin'),
        ('${manager}','${dealer}','${district}',null,'manager','Manager');
      insert into manager_branches(dealer_id,manager_id,district_id,branch_id) values
        ('${dealer}','${manager}','${district}','${branch}');
    `);
    const examples = [
      ["La","La Germania Gas Stove G-1000MAX","LA GERMANIA"],
      [" la ","  LA \t GERMANIA Stove","LA GERMANIA"],
      ["Lagermania","Rangehood CTSH25602X","LA GERMANIA"],
      ["LA","LA-Z-BOY CHAIR","LA-Z-BOY"],
      ["American","American Master Gas Range AM54300GHBT","AMERICAN MASTER"],
      ["AMERICAN","AMERICAN HOME REFRIGERATOR","AMERICAN HOME"],
      ["AMERICAN HOME","AMERICAN MASTER source disagreement","AMERICAN HOME"],
      ["TCL","LA GERMANIA unrelated text","TCL"],
      ["CON-DEVANT","DEVANT TV","CON-DEVANT"],
      ["Alpha","Alpha Steel Cabinet","ALPHA STEEL"],
      [" multi ","Generic supplied description","MULTI-PURPOSE"],
      ["Royal","ROYAL KLUDGE Keyboard","ROYAL KLUDGE"],
      ["Tough","Tough Mama Rice Cooker","TOUGH MAMA"],
      ["Fisher","Fisher & Paykel Fridge","FISHER & PAYKEL"],
      ["G","G Skill Memory","G SKILL"],
      ["LA","LA GERMANIAX unrelated","LA"],
      ["AMERICAN","AMERICAN HOMEWARE unrelated","AMERICAN"],
      ["AMERICAN","Unidentified range","AMERICAN"],
    ];
    for (const [brand,description,expected] of examples) {
      assert.equal((await call("select confirmed_product_brand($1,$2) as brand",[brand,description]))[0].brand,expected);
    }
    const { BRAND_REFERENCE } = await import("./import-engine/brand-reference.mjs");
    const approvedAliases = Object.entries(BRAND_REFERENCE.aliases).filter(([,value])=>typeof value==="string");
    for (const [alias,canonicals] of Object.entries(BRAND_REFERENCE.aliases).filter(([,value])=>Array.isArray(value))) {
      for (const canonical of canonicals) {
        assert.equal((await call("select confirmed_product_brand($1,$2) as brand",[alias,canonical]))[0].brand,canonical);
        assert.equal((await call("select confirmed_product_brand($1,$2) as brand",[alias,`${canonical} Fixture`]))[0].brand,canonical);
      }
    }
    for (const [alias,canonical] of approvedAliases) {
      for (const brand of [alias,alias.toLowerCase(),` ${alias} `]) {
        assert.equal((await call("select confirmed_product_brand($1,'No model details supplied') as brand",[brand]))[0].brand,canonical);
      }
    }
    for (const { name } of BRAND_REFERENCE.brands) {
      const expected=typeof BRAND_REFERENCE.aliases[name]==="string" ? BRAND_REFERENCE.aliases[name] : name;
      assert.equal((await call("select confirmed_product_brand($1,'Unrelated source description') as brand",[name]))[0].brand,expected);
    }
    await actor(admin);
    for (const rpc of ["import_products","import_unified_products"]) {
      for (const [brand,description,expected] of examples.slice(0,-3)) {
        await call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item(brand,description)])]);
        assert.deepEqual(await brands(),[expected,expected]);
      }
      for (const [alias,canonical] of approvedAliases) {
        await call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item(canonical,`${canonical} Fixture`,450)])]);
        await call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item(alias,`${canonical} Fixture`,null)])]);
        assert.deepEqual(await brands(),[canonical,canonical]);
        assert.ok((await call("select srp from products where barcode='00000101'")).every(row=>Number(row.srp)===450));
        await call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item(alias,`${canonical} Fixture`,0)])]);
        await call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item(alias,`${canonical} Fixture`,null)])]);
        assert.deepEqual(await brands(),[canonical,canonical]);
        assert.ok((await call("select srp from products where barcode='00000101'")).every(row=>Number(row.srp)===0));
      }
      const before=await call("select * from products order by id");
      await assert.rejects(call(`select ${rpc}($1::jsonb)`,[JSON.stringify([item("American","Unidentified range")])]),/ambiguous.*confirmed full brand/);
      assert.deepEqual(await call("select * from products order by id"),before);
    }
    await call("select import_products($1::jsonb)",[JSON.stringify([item("La","La Germania Stove")])]);
    for (const rpc of ["import_inventory","import_unified_inventory"]) {
      await call(`select ${rpc}($1,now(),'fixture',$2::jsonb)`,
        [branch,JSON.stringify([
          {...item("La","La Germania Stove",null),quantity:0,serialized:false,serials:[]},
          {...item("American","American Master Range",0),barcode:"201",quantity:0,serialized:false,serials:[]},
        ])]);
      assert.deepEqual(await brands(),["LA GERMANIA","LA GERMANIA"]);
      assert.deepEqual((await call("select brand from products where barcode='00000201'")).map(row=>row.brand),["Unclassified","Unclassified"]);
      assert.deepEqual((await call("select srp::float8 as srp from products where barcode='00000101'")).map(row=>row.srp),[100,100]);
    }
    await call("select update_product('00000101','American','American Master Range','101','KITCHEN',null,0)");
    assert.deepEqual(await brands(),["AMERICAN MASTER","AMERICAN MASTER"]);
    assert.ok((await call("select srp from products where barcode='00000101'")).every(row=>Number(row.srp)===0));
    await call("select add_product('La','La Germania Stove','101','KITCHEN',null,null)");
    assert.deepEqual(await brands(),["LA GERMANIA","LA GERMANIA"]);
    await call("select import_unified_sales_history($1,'Historical','fixture',$2::jsonb)",[id(30),JSON.stringify([{
      branch_id:branch,invoice:"HISTORICAL",sold_on:"2026-01-16",ps_name:"Source",customer:"Historical",payment_mode:"Cash",
      lines:[{barcode:"00000102",description:"American Master Range",brand:"American",qty:1,price:90,srp:120}],
    }])]);
    assert.equal((await call("select brand from sale_lines"))[0].brand,"AMERICAN MASTER");
    for (const [index,[alias,canonical]] of approvedAliases.entries()) {
      await call("select import_unified_sales_history($1,'Historical','fixture',$2::jsonb)",[id(40+index),JSON.stringify([{
        branch_id:branch,invoice:`ALIAS-${index}`,sold_on:"2026-01-16",ps_name:"Source",customer:"Historical",payment_mode:"Cash",
        lines:[{barcode:String(301+index),description:`${canonical} Fixture`,brand:alias,qty:1,price:90,srp:120}],
      }])]);
      const line=(await call("select brand,selling_price,srp from sale_lines where barcode=$1",[String(301+index).padStart(8,"0")]))[0];
      assert.equal(line.brand,canonical);
      assert.equal(Number(line.selling_price),90);
      assert.equal(Number(line.srp),120);
    }
    const salesBefore=await call("select * from sale_lines order by id");
    const stockBefore=await call("select * from inventory_stock order by branch_id,barcode");
    await call("update products set brand='La',model_description='La Germania Stove' where barcode='00000101'");
    assert.deepEqual(await call("select * from sale_lines order by id"),salesBefore);
    assert.deepEqual(await call("select * from inventory_stock order by branch_id,barcode"),stockBefore);
    await actor(manager);
    await assert.rejects(call("select import_products($1::jsonb)",[JSON.stringify([item("La","La Germania Stove")])]),/Only.*admin/i);
    await db.exec("set role authenticated");
    await assert.rejects(call("select confirmed_product_brand('LA','LA GERMANIA STOVE')"),/permission denied/);
    await db.exec("reset role");
    await actor(admin);
    await db.exec("set role authenticated");
    await call("select import_products($1::jsonb)",[JSON.stringify([item("American","American Home Refrigerator")])]);
    assert.deepEqual(await brands(),["AMERICAN HOME","AMERICAN HOME"]);
    await db.exec("reset role; set role anon");
    await assert.rejects(call("select import_products('[]'::jsonb)"),/permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
