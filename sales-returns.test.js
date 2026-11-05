"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
const {pathToFileURL}=require("node:url");
const PGlite=process.env.BRANCHLINE_PGLITE?require(process.env.BRANCHLINE_PGLITE).PGlite:null;

test("return selections validate remaining units, exact serials and duplicate product/serial selection",async()=>{
  const {returnPayload}=await import(pathToFileURL(path.join(__dirname,"sales-returns.mjs")));
  const lines=[{id:"one",barcode:"01",remaining:2,serials:["A","B"]},{id:"two",barcode:"02",remaining:3,serials:[]}];
  assert.deepEqual(returnPayload(lines,[{line_id:"one",quantity:1,serials:["B"]},{line_id:"two",quantity:2}]),
    [{line_id:"one",quantity:1,serials:["B"]},{line_id:"two",quantity:2,serials:[]}]);
  for(const selections of [[],[{line_id:"bad",quantity:1}], [{line_id:"one",quantity:3,serials:[]}],
    [{line_id:"one",quantity:1,serials:[]}],[{line_id:"one",quantity:1,serials:["OTHER"]}],
    [{line_id:"one",quantity:1,serials:["A"]},{line_id:"one",quantity:1,serials:["A"]}],
    [{line_id:"two",quantity:1.5}]]) assert.throws(()=>returnPayload(lines,selections));
  assert.throws(()=>returnPayload([...lines,{id:"three",barcode:"01",remaining:1,serials:["A"]}],
    [{line_id:"one",quantity:1,serials:["A"]},{line_id:"three",quantity:1,serials:["A"]}]),/multiple product lines/);
});

test("real return APIs atomically post negative lines, restore stock/serials, enforce access and reject duplicate/over returns",{skip:!PGlite},async()=>{
  const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
  const dealer=id(1),district=id(2),branch=id(3),other=id(4),ps=id(5),admin=id(6),manager=id(7),peer=id(8),custodian=id(9),dm=id(10);
  const call=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const actor=user=>call("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  let request=100;
  const post=(sale,lines,key=id(++request))=>call("select process_sales_return($1,current_date,$2::jsonb,'Customer return',$3) id",[sale,JSON.stringify(lines),key]);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema extensions;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const dir=process.env.BRANCHLINE_MIGRATIONS||path.join(__dirname,"supabase","migrations");
    for(const file of fs.readdirSync(dir).filter(n=>n.endsWith(".sql")).sort()){
      try{await db.exec(fs.readFileSync(path.join(dir,file),"utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i,""));}
      catch(error){throw new Error(`${file}: ${error.message}`,{cause:error});}
    }
    await db.exec(`insert into dealers(id,name) values('${dealer}','Fixture');
      insert into districts(id,dealer_id,name) values('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name) values('${branch}','${dealer}','${district}','Santiago'),('${other}','${dealer}','${district}','Other');
      insert into auth.users values('${ps}'),('${admin}'),('${manager}'),('${peer}'),('${custodian}'),('${dm}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name) values
      ('${ps}','${dealer}','${district}','${branch}','ps','TCL','PS'),
      ('${peer}','${dealer}','${district}','${branch}','ps','TCL','Peer'),
      ('${admin}','${dealer}',null,null,'admin',null,'Admin'),
      ('${manager}','${dealer}','${district}',null,'manager',null,'Manager'),
      ('${custodian}','${dealer}',null,null,'stock_custodian',null,'Custodian'),
      ('${dm}','${dealer}','${district}',null,'district_manager',null,'DM');
      insert into manager_branches(manager_id,branch_id,dealer_id,district_id) values('${manager}','${branch}','${dealer}','${district}');
      insert into products(dealer_id,branch_id,barcode,model_description,brand,srp) values
        ('${dealer}','${branch}','00000001','TV','TCL',100),('${dealer}','${branch}','00000002','Fan','TCL',50);
      insert into sales(id,dealer_id,branch_id,ps_id,customer_name,invoice_number,sold_on) values
        ('${id(20)}','${dealer}','${branch}','${ps}','Repeat Customer','SI-1',current_date-10),
        ('${id(21)}','${dealer}','${branch}','${ps}','Repeat Customer','SI-2',current_date-5),
        ('${id(23)}','${dealer}','${branch}','${ps}','Duplicate Product','SI-DUP',current_date-5),
        ('${id(22)}','${dealer}','${other}','${peer}','Other Customer','OTHER',current_date-5);
      insert into sale_lines(id,dealer_id,branch_id,sale_id,barcode,model_description,brand,selling_price,srp,quantity) values
        ('${id(30)}','${dealer}','${branch}','${id(20)}','00000001','TV','TCL',90,100,2),
        ('${id(31)}','${dealer}','${branch}','${id(20)}','00000002','Fan','TCL',40,50,3),
        ('${id(32)}','${dealer}','${branch}','${id(21)}','00000002','Fan','TCL',40,50,1),
        ('${id(34)}','${dealer}','${branch}','${id(23)}','00000001','TV first','TCL',90,100,1),
        ('${id(35)}','${dealer}','${branch}','${id(23)}','00000001','TV second','TCL',80,100,1);
      insert into sale_serials(dealer_id,branch_id,sale_id,barcode,serial) values
        ('${dealer}','${branch}','${id(20)}','00000001','A'),('${dealer}','${branch}','${id(20)}','00000001','B'),
        ('${dealer}','${branch}','${id(23)}','00000001','C'),('${dealer}','${branch}','${id(23)}','00000001','D');
      insert into inventory_snapshots(id,branch_id,imported_by,reported_at,files,products,quantity)
        values('${id(40)}','${branch}','${admin}',now(),'Fixture',2,5);
      insert into inventory_stock(branch_id,barcode,quantity,serialized,snapshot_id) values
        ('${branch}','00000001',1,true,'${id(40)}'),('${branch}','00000002',4,false,'${id(40)}');
      insert into inventory_serials(branch_id,barcode,serial,received_on,status) values
        ('${branch}','00000001','a',current_date-100,'sold'),('${branch}','00000001','B',current_date-100,'sold');
    `);
    await actor(ps);
    assert.equal((await call("select * from search_return_sales('Repeat Customer')")).length,2);
    const details=(await call("select return_sale_details($1) d",[id(20)]))[0].d;
    assert.equal(details.lines.length,2);
    assert.equal(details.lines.find(l=>l.barcode==="00000001").remaining,2);
    const args=[{line_id:id(30),quantity:1,serials:["B"]},{line_id:id(31),quantity:2,serials:[]}];
    await assert.rejects(post(id(20),[{line_id:id(30),quantity:1,serials:[]}]),/recorded serials/);
    await assert.rejects(post(id(20),[{line_id:id(30),quantity:1,serials:["OTHER"]}]),/not returnable/);
    await assert.rejects(post(id(20),[{line_id:id(32),quantity:1,serials:[]}]),/original sale/);
    await actor(peer);await assert.rejects(post(id(20),args),/outside your return access/);
    assert.equal((await call("select * from search_return_sales('Repeat Customer')")).length,0);
    await actor(custodian);await assert.rejects(post(id(20),args),/outside your return access/);
    await actor(manager);assert.equal((await call("select can_return_sale($1) allowed",[id(20)]))[0].allowed,true);
    assert.equal((await call("select can_return_sale($1) allowed",[id(22)]))[0].allowed,false);
    await actor(dm);assert.equal((await call("select can_return_sale($1) allowed",[id(20)]))[0].allowed,true);
    await actor(ps);
    await db.exec("set role authenticated");
    const key=id(1000),returned=(await post(id(20),args,key))[0].id;
    await db.exec("reset role");
    assert.equal((await post(id(20),args,key))[0].id,returned);
    await assert.rejects(post(id(20),[{line_id:id(31),quantity:1,serials:[]}],key),/already posted a different return/);
    assert.equal((await call("select count(*)::int n from sales_returns"))[0].n,1);
    assert.deepEqual((await call("select barcode,quantity from inventory_stock order by barcode")).map(r=>[r.barcode,r.quantity]),[["00000001",2],["00000002",6]]);
    assert.equal((await call("select sum(quantity*selling_price) n from sale_lines where sale_id=$1",[returned]))[0].n,"-170.00");
    assert.equal((await call("select status from inventory_serials where serial='B'"))[0].status,"available");
    assert.equal((await call("select inventory_sale_serial_eligible($1,'00000001','B') ok",[branch]))[0].ok,true);
    assert.equal((await call("select inventory_sale_serial_eligible($1,'00000001','A') ok",[branch]))[0].ok,false);
    assert.equal((await call("select count(*)::int n from sale_serials where sale_id=$1",[returned]))[0].n,1);
    const exported=(await call("select serial_numbers from export_brand_branch_sales_v2() e join sale_lines l on l.id=e.line_id where l.sale_id=$1 and l.barcode='00000001'",[returned]))[0];
    assert.deepEqual(exported.serial_numbers,["B"]);
    await assert.rejects(post(id(20),args),/not returnable|remain returnable/);
    await assert.rejects(post(id(20),[{line_id:id(31),quantity:2,serials:[]}]),/only 1 units/);
    await assert.rejects(post(returned,[{line_id:id(31),quantity:1}]),/outside your return access/);
    await assert.rejects(call("update sales set customer_name='Changed' where id=$1",[id(20)]),/linked to a posted return/);
    await assert.rejects(call("delete from sale_serials where sale_id=$1",[id(20)]),/linked to a posted return/);
    await assert.rejects(call("delete from sale_lines where sale_id=$1",[returned]),/linked to a posted return/);
    await assert.rejects(call("insert into sale_serials(dealer_id,branch_id,sale_id,barcode,serial) values($1,$2,$3,'00000001','FORGED')",
      [dealer,branch,id(20)]),/cannot be added/);
    await assert.rejects(call("insert into sale_serials(dealer_id,branch_id,sale_id,barcode,serial) values($1,$2,$3,'00000001','FORGED')",
      [dealer,branch,returned]),/must match their return audit/);
    await assert.rejects(call("insert into sale_lines(dealer_id,branch_id,sale_id,barcode,model_description,brand,selling_price,srp,quantity) values($1,$2,$3,'00000001','TV','TCL',90,100,1)",
      [dealer,branch,id(20)]),/cannot be added/);
    await assert.rejects(call("insert into sale_lines(dealer_id,branch_id,sale_id,barcode,model_description,brand,selling_price,srp,quantity) values($1,$2,$3,'00000001','TV','TCL',90,100,-1)",
      [dealer,branch,returned]),/must match their return audit/);
    await call("update sale_lines set model_description='Corrected TV description' where id=$1",[id(30)]);
    await assert.rejects(call("update sale_lines set quantity=4 where id=$1",[id(30)]),/linked to a posted return/);
    assert.equal((await call("select count(*)::int n from inventory_events where kind='sales_return'"))[0].n,2);
    const before=(await call("select count(*)::int n from sales"))[0].n;
    await assert.rejects(post(id(20),[{line_id:id(31),quantity:1,serials:[]},{line_id:id(30),quantity:9,serials:[]}]),/remain returnable/);
    assert.equal((await call("select count(*)::int n from sales"))[0].n,before);
    assert.equal((await call("select quantity from inventory_stock where barcode='00000002'"))[0].quantity,6);
    await post(id(20),[{line_id:id(30),quantity:1,serials:["A"]},{line_id:id(31),quantity:1,serials:[]}]);
    assert.equal((await call("select status from inventory_serials where serial='a'"))[0].status,"available");
    assert.deepEqual(await call("select * from search_return_sales('SI-1')"),[]);
    await actor(peer);await db.exec("set role authenticated");
    assert.equal((await call("select count(*)::int n from sales_returns"))[0].n,0);
    await assert.rejects(call("delete from sales_returns"),/permission denied/);
    await assert.rejects(call("truncate sales_return_lines"),/permission denied/);
    await db.exec("reset role");
    await actor(ps);
    await call("insert into payment_modes(dealer_id,name) values($1,'Cash')",[dealer]);
    const resale=(await call("select save_inventory_sale('Resale customer','RESALE',current_date,$1::jsonb,null,'Cash','City','Barangay',$2::jsonb,false) id",[
      JSON.stringify([{barcode:"00000001",quantity:1,selling_price:90,srp:100}]),JSON.stringify([{barcode:"00000001",serial:"B"}])]))[0].id;
    assert.equal((await call("select status from inventory_serials where serial='B'"))[0].status,"sold");
    assert.equal((await call("select inventory_sale_serial_eligible($1,'00000001','B') ok",[branch]))[0].ok,false);
    const resaleLine=(await call("select id from sale_lines where sale_id=$1",[resale]))[0].id;
    await post(resale,[{line_id:resaleLine,quantity:1,serials:["B"]}]);
    assert.equal((await call("select status from inventory_serials where serial='B'"))[0].status,"available");
    await call("insert into sale_lines(id,dealer_id,branch_id,sale_id,barcode,model_description,brand,selling_price,srp,quantity) values($1,$2,$3,$4,'00000003','Legacy item','TCL',0,0,2)",
      [id(33),dealer,branch,id(21)]);
    await assert.rejects(call("select process_sales_return($1,current_date+1,$2::jsonb,'Customer return',$3)",[id(21),JSON.stringify([{line_id:id(33),quantity:1}]),id(2000)]),/return date/);
    await assert.rejects(call("select process_sales_return($1,current_date,$2::jsonb,' ',$3)",[id(21),JSON.stringify([{line_id:id(33),quantity:1}]),id(2001)]),/return reason/);
    await post(id(21),[{line_id:id(33),quantity:1,serials:[]}]);
    assert.equal((await call("select quantity from inventory_stock where barcode='00000003'"))[0].quantity,1);
    assert.equal((await call("select srp from products where barcode='00000003'"))[0].srp,"0.00");
    await call("update products set active=false where branch_id=$1 and barcode='00000002'",[branch]);
    await post(id(21),[{line_id:id(32),quantity:1,serials:[]}]);
    const restoredCatalog=(await call("select active,srp from products where branch_id=$1 and barcode='00000002'",[branch]))[0];
    assert.deepEqual(restoredCatalog,{active:true,srp:"50.00"});
    const duplicateReturn=(await post(id(23),[{line_id:id(34),quantity:1,serials:["D"]},{line_id:id(35),quantity:1,serials:["C"]}]))[0].id;
    const duplicateExports=await call("select l.selling_price,e.serial_numbers from export_brand_branch_sales_v2() e join sale_lines l on l.id=e.line_id where l.sale_id=$1 order by l.selling_price desc",[duplicateReturn]);
    assert.deepEqual(duplicateExports,[{selling_price:"90.00",serial_numbers:["D"]},{selling_price:"80.00",serial_numbers:["C"]}]);
    await actor(admin);await call("update profiles set active=false where id=$1",[ps]);await actor(ps);
    assert.equal((await call("select can_return_sale($1) ok",[id(21)]))[0].ok,false);
  }finally{await db.close();}
});
