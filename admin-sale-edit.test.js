const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test("sale products pair serials by barcode, align each product, and display its own unit and extended prices", () => {
  const c = vm.createContext({
    escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    formatMoney: value => `PHP ${value.toFixed(2)}`,
    serialsFor: (id, barcode) => {
      assert.equal(id, "sale");
      return barcode === "A" ? ["SERIAL-A1", "<SERIAL-A2>"] : barcode === "B" ? ["SERIAL-B"] : [];
    },
  });
  vm.runInContext(section("  function productLineHTML(", "  function brandProgressChart("), c);
  const html = c.saleProductsHTML("sale", [
    { barcode: "B", brand: "BRAND", model_description: "Short B", quantity: 1, selling_price: 50 },
    { barcode: "A", brand: "BRAND", model_description: "Very long A description", quantity: 1, selling_price: 100 },
    { barcode: "A", brand: "BRAND", model_description: "Repeated historical barcode A", quantity: 1, selling_price: 200 },
    { barcode: "C", brand: "BRAND", model_description: "Non-serialized", quantity: 2, selling_price: 12.5 },
  ]);
  const rows = html.split('<div class="sale-product-detail">').slice(1);
  assert.equal(rows.length, 4);
  assert.match(rows[0], /Short B[\s\S]*SERIAL-B[\s\S]*Unit price[\s\S]*PHP 50.00/);
  assert.doesNotMatch(rows[0], /SERIAL-A/);
  assert.match(rows[1], /long A description[\s\S]*SERIAL-A1[\s\S]*PHP 100.00/);
  assert.doesNotMatch(rows[1], /SERIAL-A2/);
  assert.match(rows[2], /Repeated historical barcode A[\s\S]*&lt;SERIAL-A2>/);
  assert.match(rows[3], /Non-serialized[\s\S]*<span>—<\/span>[\s\S]*PHP 12.50[\s\S]*Line total[\s\S]*PHP 25.00/);
  assert.equal(c.saleProductsHTML("sale", []), "—");
});

test("sales log offers admin Edit and Delete without granting editing to district or inventory roles", () => {
  assert.match(source, /const canEditSales = isPs \|\| \["manager", "admin"\]\.includes\(currentProfile\.role\)/);
  assert.match(source, /sale-log-actions[\s\S]*data-edit-sale=[\s\S]*isAdmin \?[\s\S]*data-delete-sale=/);
  assert.match(source, /if \(editSale && \["ps", "manager", "admin"\]\.includes\(currentProfile\.role\)\)/);
});

test("demo admin edits preserve PS attribution and cannot create new sales", async () => {
  const Demo = require("./demo-data.js");
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const demo = Demo.create({ storage, catalog: Demo.sampleCatalog(), today: "2026-11-03" });
  demo.setRole("admin");
  const sales = (await demo.client.from("sales")).data;
  const sale = sales[0];
  const lines = (await demo.client.from("sale_lines")).data.filter(line => line.sale_id === sale.id);
  const serials = (await demo.client.from("sale_serials")).data.filter(unit => unit.sale_id === sale.id);
  const params = {
    p_customer_name: "Corrected Demo Customer", p_invoice_number: sale.invoice_number, p_sold_on: sale.sold_on,
    p_payment_mode: sale.payment_mode, p_city: sale.city, p_barangay: sale.barangay,
    p_sale_id: sale.id, p_lines: lines.map(line => ({ ...line, selling_price: 123 })),
    p_serials: serials, p_fulfillment_method: "pickup", p_dg_amount: null,
  };
  const result = await demo.client.rpc("save_sale_with_delivery", params);
  assert.equal(result.error, null, result.error?.message);
  const edited = (await demo.client.from("sales")).data.find(row => row.id === sale.id);
  assert.equal(edited.customer_name, params.p_customer_name);
  assert.equal(edited.ps_id, sale.ps_id);
  assert.equal(edited.branch_id, sale.branch_id);
  const denied = await demo.client.rpc("save_sale_with_delivery", { ...params, p_sale_id: null, p_invoice_number: "ADMIN-CANNOT-CREATE" });
  assert.match(denied.error.message, /not allowed|Only|role|permission/i);
});

test("real DB admin edits are same-dealer, audited, atomic and keep attribution/stock/serials; no new admin sales or other-role expansion", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const dealer=id(1),district=id(2),branch=id(3),other=id(4),ps=id(5),admin=id(6),manager=id(7),second=id(8),dm=id(9),stock=id(10),foreignDealer=id(11),foreignAdmin=id(12);
  const call = async (sql, params=[]) => (await db.query(sql,params)).rows;
  const actor = user => call("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  const save = async (sale, price=100, qty=1, serials=[]) => (await call(
    "select save_sale_with_delivery('Corrected Customer','ADMIN-EDIT',current_date,$1::jsonb,$2,'Cash','City','Barangay',$3::jsonb,false,'delivery',50) id",
    [JSON.stringify([{barcode:"00000101",quantity:qty,selling_price:price,srp:150}]),sale,JSON.stringify(serials)]))[0].id;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema extensions;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const directory = process.env.BRANCHLINE_MIGRATIONS || path.join(__dirname,"supabase","migrations");
    const files = fs.readdirSync(directory).filter(name=>name.endsWith(".sql")).sort();
    assert.ok(files.some(name=>name.includes("initial_schema")), "Use the complete migrations directory.");
    const migration = "20261127000000_admin_sale_edit.sql";
    for (const file of files) {
      if (file === "20261118000000_sales_history_ps_aliases.sql" || file === migration) continue;
      await db.exec(fs.readFileSync(path.join(directory,file),"utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i,""));
    }
    await db.exec(fs.readFileSync(path.join(__dirname,"supabase","migrations",migration),"utf8"));
    await db.exec(`insert into dealers(id,name)values('${dealer}','Fixture'),('${foreignDealer}','Foreign');
      insert into districts(id,dealer_id,name)values('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name,code)values('${branch}','${dealer}','${district}','Santiago','STG'),('${other}','${dealer}','${district}','Other','OTH');
      insert into auth.users values('${ps}'),('${admin}'),('${manager}'),('${second}'),('${dm}'),('${stock}'),('${foreignAdmin}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name)values
      ('${ps}','${dealer}','${district}','${branch}','ps','TCL','PS One'),
      ('${second}','${dealer}','${district}','${other}','ps','TCL','PS Two'),
      ('${admin}','${dealer}',null,null,'admin',null,'Admin'),
      ('${foreignAdmin}','${foreignDealer}',null,null,'admin',null,'Foreign Admin'),
      ('${manager}','${dealer}','${district}',null,'manager',null,'BM'),
      ('${dm}','${dealer}','${district}',null,'district_manager',null,'DM'),
      ('${stock}','${dealer}',null,null,'inventory_controller',null,'Stock');
      insert into manager_branches(dealer_id,manager_id,district_id,branch_id)values('${dealer}','${manager}','${district}','${branch}');
      insert into manager_branch_assignments(dealer_id,manager_id,district_id,branch_id)values('${dealer}','${manager}','${district}','${branch}');
      insert into payment_modes(dealer_id,name)values('${dealer}','Cash');`);
    await actor(admin);
    for (const b of [branch, other]) await call("select import_inventory($1,now(),'fixture',$2::jsonb)",[b,JSON.stringify([
      {barcode:"00000101",description:"TCL TEST UNIT",brand:"TCL",category:"TV",quantity:3,serialized:true,serials:[1,2,3].map(n=>({serial:`${b===other?"S":"B"}${n}`,received_on:"2026-01-01"}))},
    ])]);
    await actor(second); await db.exec("set role authenticated");
    const serials = [{barcode:"00000101",serial:"S1"}];
    const sale = await save(null, 100, 1, serials);
    await db.exec("reset role");
    await call("update sales set created_at=current_timestamp-interval '2 years', salesperson_code='0012' where id=$1",[sale]);
    const before = (await call("select ps_id,branch_id,dealer_id,salesperson_code from sales where id=$1",[sale]))[0];
    const stockBefore = await call("select branch_id,barcode,quantity from inventory_stock order by branch_id");
    const serialBefore = await call("select branch_id,barcode,serial,status from inventory_serials order by branch_id,serial");
    await db.exec("set role authenticated");
    for (const user of [ps, manager, dm, stock, foreignAdmin]) {
      await actor(user);
      await assert.rejects(save(sale, 120, 1, serials), /not editable|not found|account/i);
    }
    await actor(admin); await save(sale, 120, 1, serials);
    assert.deepEqual((await call("select ps_id,branch_id,dealer_id,salesperson_code from sales where id=$1",[sale]))[0],before);
    assert.equal((await call("select selling_price from sale_lines where sale_id=$1",[sale]))[0].selling_price,"120.00");
    const audit = (await call("select edited_by,previous_values from sale_edit_history where sale_id=$1",[sale]))[0];
    assert.equal(audit.edited_by,admin);
    assert.equal(audit.previous_values.lines[0].selling_price,100);
    assert.equal(audit.previous_values.delivery_guarranty_amount,50);
    await assert.rejects(save(null), /not editable|Only a Product Specialist/i);
    await assert.rejects(call("select save_ps_sale('C','NEW',current_date,$1::jsonb,null,'Cash')",[JSON.stringify([{barcode:"00000101",quantity:1,selling_price:10}])]),/permission denied/);
    await assert.rejects(save(sale, 500, 4, serials));
    assert.equal((await call("select selling_price from sale_lines where sale_id=$1",[sale]))[0].selling_price,"120.00");
    assert.equal((await call("select count(*)::int n from sale_edit_history where sale_id=$1",[sale]))[0].n,1);
    await db.exec("reset role");
    assert.deepEqual(await call("select branch_id,barcode,quantity from inventory_stock order by branch_id"), stockBefore);
    assert.deepEqual(await call("select branch_id,barcode,serial,status from inventory_serials order by branch_id,serial"), serialBefore);
    await call("update profiles set active=false where id=$1",[admin]);
    await db.exec("set role authenticated");
    await assert.rejects(save(sale, 130, 1, serials),/not editable/);
    assert.equal((await call("select has_function_privilege('authenticated','public.save_sale_extras(uuid,text,text,jsonb)','execute') allowed"))[0].allowed,false);
    assert.equal((await call("select has_function_privilege('authenticated','public.save_inventory_sale(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean)','execute') allowed"))[0].allowed,false);
  } finally { await db.close(); }
});
