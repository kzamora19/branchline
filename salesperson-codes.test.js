const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {stripTypeScriptTypes}=require("node:module");
const {webcrypto}=require("node:crypto");
const Demo=require("./demo-data.js");
const PGlite=process.env.BRANCHLINE_PGLITE?require(process.env.BRANCHLINE_PGLITE).PGlite:null;

test("PS code edit and both history import APIs use exact codes, preserve zeroes, and leave old invoices alone",{skip:!PGlite},async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
 const dealer=id(1),district=id(2),branch=id(3),other=id(4),ps=id(5),second=id(6),admin=id(7),foreign=id(8),foreignAdmin=id(9);
 const call=async(sql,params=[]) => (await db.query(sql,params)).rows;
 const actor=async who=>call("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 const edit=async(user,code,name="Correct PS")=>call("select admin_update_profile_with_sales_code($1,$2,'ps',$3,$4,'TCL',$5)",[user,name,district,user===second?other:branch,code]);
 const invoice=(number,code,name="Different Source Spelling",at=branch)=>({branch_id:at,invoice:number,sold_on:"2026-09-10",customer:"Customer",ps_name:name,salespersoncode:code,
  lines:[{barcode:"101",description:"TCL TV",brand:"TCL",price:100,qty:1}]});
 const run=async(api,batch,rows)=>(await call(`select ${api}($1,'Code test','fictional',$2::jsonb) result`,[batch,JSON.stringify(rows)]))[0].result;
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema extensions;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const dir=process.env.BRANCHLINE_MIGRATIONS||path.join(__dirname,"supabase","migrations");
  assert.ok(fs.readdirSync(dir).some(f=>f.includes("initial_schema")),"Set BRANCHLINE_MIGRATIONS to the complete migration chain.");
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith(".sql")&&!f.includes("20261118")&&!f.includes("20261126")).sort())
   await db.exec(fs.readFileSync(path.join(dir,f),"utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i,""));
  await db.exec(fs.readFileSync(path.join(__dirname,"supabase","migrations","20261126000000_ps_salesperson_codes.sql"),"utf8"));
  await db.exec(`insert into dealers(id,name)values('${dealer}','Company'),('${foreign}','Foreign');
   insert into districts(id,dealer_id,name)values('${district}','${dealer}','District');
   insert into branches(id,dealer_id,district_id,name)values('${branch}','${dealer}','${district}','Santiago'),('${other}','${dealer}','${district}','Other');
   insert into auth.users values('${ps}'),('${second}'),('${admin}'),('${foreignAdmin}');
   insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name)values
   ('${ps}','${dealer}','${district}','${branch}','ps','TCL','Correct PS'),
   ('${second}','${dealer}','${district}','${other}','ps','TCL','Other PS'),
   ('${admin}','${dealer}',null,null,'admin',null,'Admin'),
   ('${foreignAdmin}','${foreign}',null,null,'admin',null,'Foreign Admin');`);
  await actor(admin);await db.exec("set role authenticated");
  await edit(ps,"  000Ab-7  ");
  assert.equal((await call("select salesperson_code from profiles where id=$1",[ps]))[0].salesperson_code,"000Ab-7");
  await assert.rejects(edit(second,"000Ab-7","Should not change"),/already assigned/);
  assert.equal((await call("select full_name from profiles where id=$1",[second]))[0].full_name,"Other PS");
  await actor(ps);await assert.rejects(edit(ps,"HACK"),/administrator/);
  await actor(foreignAdmin);await assert.rejects(edit(ps,"HACK"),/administrator/);
  await actor(admin);
  const old=invoice("EXISTING",null,"Correct PS");
  await run("import_sales_history",id(20),[old]);
  const existing=(await call("select id,ps_id,salesperson_code from sales where invoice_number='EXISTING'"))[0];
  await edit(ps,"NEW");
  assert.deepEqual((await call("select id,ps_id,salesperson_code from sales where invoice_number='EXISTING'"))[0],existing);
  await edit(ps,"000Ab-7");
  for(const [index,api] of ["import_sales_history","import_unified_sales_history"].entries()) {
   const batch=id(30+index);
   const result=await run(api,batch,[
    invoice(api+"-CODE","000Ab-7"),
    invoice(api+"-UNKNOWN","MISSING","Correct PS"),
    invoice(api+"-CASE","000ab-7","Correct PS"),
    invoice(api+"-BRANCH","000Ab-7","Correct PS",other),
    invoice(api+"-NAME",null,"Correct PS"),
   ]);
   assert.equal(result.matched_ps,2);
   const rows=await call("select invoice_number,ps_id,salesperson_code from sales where import_batch_id=$1 order by invoice_number",[batch]);
   assert.equal(rows.find(r=>r.invoice_number.endsWith("-CODE")).ps_id,ps);
   assert.equal(rows.find(r=>r.invoice_number.endsWith("-NAME")).ps_id,ps);
   for(const suffix of ["-UNKNOWN","-CASE","-BRANCH"])assert.equal(rows.find(r=>r.invoice_number.endsWith(suffix)).ps_id,null);
   assert.equal(rows.find(r=>r.invoice_number.endsWith("-CODE")).salesperson_code,"000Ab-7");
   await run(api,batch,[invoice(api+"-CODE","MISSING")]);
   assert.equal((await call("select ps_id,salesperson_code from sales where invoice_number=$1",[api+"-CODE"]))[0].ps_id,ps);
  }
  await edit(ps," ");
  assert.equal((await call("select salesperson_code from profiles where id=$1",[ps]))[0].salesperson_code,null);
  await assert.rejects(call("select admin_update_profile_with_sales_code($1,'Admin','admin',null,null,null,'BAD')",[admin]),/Product Specialists only/);
 } finally {await db.close();}
});

test("demo create/edit enforces unique codes and code matching overrides a mismatched name",async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const demo=Demo.create({storage,catalog:Demo.sampleCatalog(),today:"2026-11-03"}),branch=demo.profile.branch_id;
 demo.setRole("admin");
 const data=async q=>{const r=await q;assert.equal(r.error,null,r.error?.message);return r.data;};
 const body={role:"ps",full_name:"Code Person",login:"code.person",district_id:demo.profile.district_id,branch_id:branch,brand:"TCL",salesperson_code:"000aB"};
 await data(demo.client.functions.invoke("admin-create-user",{body}));
 const people=await data(demo.client.from("profiles")),person=people.find(p=>p.login_id===body.salesperson_code);
 assert.equal(person.salesperson_code,"000aB");
 assert.match((await demo.client.functions.invoke("admin-create-user",{body:{...body,login:"duplicate.person"}})).error.message,/already assigned/);
 await data(demo.client.rpc("admin_update_profile_with_sales_code",{p_user_id:person.id,p_full_name:"Renamed Person",p_role:"ps",p_assigned_brand:"TCL",p_salesperson_code:" 000aB "}));
 const row={branch_id:branch,invoice:"CODE-FIXTURE",sold_on:"2026-09-01",customer:"Customer",ps_name:"WRONG SPELLING",salespersoncode:"000aB",lines:[{barcode:"1",description:"TV",brand:"TCL",qty:1,price:100}]};
 await data(demo.client.rpc("import_sales_history",{p_batch:"code-batch",p_sales:[row]}));
 assert.equal((await data(demo.client.from("sales"))).find(s=>s.invoice_number===row.invoice).ps_id,person.id);
});

test("Edge account creation stores PS codes, rejects duplicates before creating logins, and rolls back races",async()=>{
 const source=fs.readFileSync(path.join(__dirname,"supabase","functions","admin-create-user","index.ts"),"utf8");
 const frontend=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8"),loginContext=vm.createContext({});
 vm.runInContext(frontend.slice(frontend.indexOf("  function loginEmail("),frontend.indexOf("  async function invokeAdminFunction(")),loginContext);
 for(const scenario of ["success","blank","missing","string-flag","zeroes","duplicate","race","non-ps"]) {
  let handler;const writes=[],deletes=[];
  const api={auth:{getUser:async()=>({data:{user:{id:"admin"}}}),admin:{
   createUser:async input=>{writes.push({table:"auth.users",input});return {data:{user:{id:"new"}}};},
   deleteUser:async()=>{deletes.push("auth.users");return {error:null};},
  }},from:table=>{const filters={};return {
   select(){return this;},eq(k,v){filters[k]=v;return this;},
   maybeSingle:async()=>({data:filters.salesperson_code?(scenario==="duplicate"?{id:"existing"}:null):{id:"admin",dealer_id:"company",role:"admin",active:true},error:null}),
   insert:async input=>{writes.push({table,input});return {error:scenario==="race"&&table==="profiles"?{code:"23505",message:'duplicate profiles_dealer_salesperson_code'}:null};},
   delete(){return {eq:async()=>{deletes.push(table);return {error:null};}};},
  };}};
  vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import .+;\r?\n/gm,"")),{
   Deno:{env:{get:()=>undefined},serve:fn=>{handler=fn;}},createClient:()=>api,crypto:webcrypto,Request,Response,console,
  });
  const response=await handler(new Request("https://example.invalid/create",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({role:scenario==="non-ps"?"manager":"ps",full_name:"Fixture",login:"fixture",district_id:"district",branch_id:"branch",brand:"TCL",
    test_account:scenario==="blank"?true:scenario==="string-flag"?"true":false,
    salesperson_code:["blank","missing","string-flag"].includes(scenario)?" ":scenario==="zeroes"?"000123456":" 000aB "})}));
  const result=await response.json();
  if(["success","blank","zeroes"].includes(scenario)) {
   assert.equal(response.status,200,JSON.stringify(result));
   const code=scenario==="blank"?null:scenario==="zeroes"?"000123456":"000aB";
   assert.equal(writes.find(w=>w.table==="profiles").input.salesperson_code,code);
   assert.equal(writes.find(w=>w.table==="profiles").input.login_id,code||"fixture");
   assert.equal(writes.find(w=>w.table==="auth.users").input.user_metadata.test_account,scenario==="blank");
   const email=writes.find(w=>w.table==="auth.users").input.email;
   assert.equal(loginContext.loginEmail(code||"fixture"),email,"Typing the displayed username must resolve to the created auth login.");
   assert.equal(email,scenario==="blank"?"fixture@login.branchline.app":scenario==="zeroes"?"6300123456@login.branchline.app":"000ab@login.branchline.app");
  } else {
   assert.equal(response.status,400);
   if(scenario==="race")assert.ok(deletes.includes("auth.users")&&deletes.includes("profiles"));
   else assert.equal(writes.length,0);
  }
 }
});

test("new PS codes are required except explicit test accounts; existing usernames and sales survive disabling/restoring",async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const demo=Demo.create({storage,catalog:Demo.sampleCatalog(),today:"2026-11-03"}),branch=demo.profile.branch_id;
 demo.setRole("admin");
 const data=async q=>{const r=await q;assert.equal(r.error,null,r.error?.message);return r.data;};
 const body={role:"ps",full_name:"No Code",login:"separate.login",brand:"TCL",branch_id:branch};
 for(const flag of [undefined,false,"true"]) {
  const result=await demo.client.functions.invoke("admin-create-user",{body:{...body,test_account:flag}});
  assert.match(result.error.message,/Salesperson Code is required/);
 }
 await data(demo.client.functions.invoke("admin-create-user",{body:{...body,test_account:true}}));
 const person=(await data(demo.client.from("profiles"))).find(p=>p.login_id===body.login);
 assert.equal(person.test_account,true);
 const before=JSON.stringify(await data(demo.client.from("sales")));
 await data(demo.client.rpc("admin_set_user_status",{p_user_id:person.id,p_active:false}));
 assert.equal((await data(demo.client.from("profiles"))).find(p=>p.id===person.id).active,false);
 await data(demo.client.rpc("admin_set_user_status",{p_user_id:person.id,p_active:true}));
 const restored=(await data(demo.client.from("profiles"))).find(p=>p.id===person.id);
 assert.equal(restored.active,true);assert.equal(restored.login_id,body.login);
 assert.equal(JSON.stringify(await data(demo.client.from("sales"))),before);
});

test("People page defaults to active staff and offers a separate restorable disabled list",()=>{
 const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8");
 const people=[{id:"a",full_name:"Active Fixture",role:"ps",active:true,assigned_brand:"TCL"},{id:"d",full_name:"Disabled Fixture",role:"ps",active:false,assigned_brand:"TCL"}];
 let output="",filters="";
 const context=vm.createContext({
  ui:{},liveData:{profiles:people,branches:[],districts:[],managerLinks:[],inventoryAssignments:[]},
  roleLabels:{ps:"PS"},roleRank:{ps:1},districtName:()=>"-",branchName:()=>"-",searchQuery:()=>"",matches:()=>true,
  natural:(a,b)=>a.localeCompare(b),escapeHTML:String,pageHeading:()=>"",pushMessagesPanel:()=>"",
  filterBar:args=>{filters=args.actions;return "";},panel:(title,desc,body)=>title+body,
  tableBlock:(key,heads,rows,render)=>rows.map(render).join(""),
  mountPage:(a,b,c,render)=>{output=render();},
 });
 vm.runInContext(source.slice(source.indexOf("  function renderPeoplePage()"),source.indexOf("  function companyHolidayDates()")),context);
 context.renderPeoplePage();
 assert.match(output,/Staff profiles/);assert.match(output,/Active Fixture/);assert.doesNotMatch(output,/Disabled Fixture/);
 assert.match(filters,/Disabled accounts \(1\)/);
 context.ui.peopleDisabled=true;context.renderPeoplePage();
 assert.match(output,/Disabled accounts/);assert.match(output,/Disabled Fixture/);assert.match(output,/>Restore</);
 assert.doesNotMatch(output,/Active Fixture|Danger zone/);assert.match(filters,/Active accounts/);
});
