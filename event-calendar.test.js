"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const A=require("./analytics.js");
const PGlite=process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
const closure=(from,to,branch_ids=[])=>({starts_on:from,ends_on:to,branch_ids});
function forecast(options={}) {
  return A.inventoryForecast({products:[{branch_id:"one",barcode:"01",category:"TV",quantity:3}],
    facts:[{branchId:"one",barcode:"01",category:"TV",date:"2026-10-01",quantity:30}],
    branchIds:new Set(["one"]),from:"2026-10-01",to:"2026-10-31",today:"2026-11-04",...options}).products[0];
}

test("company and branch closures are inclusive, overlapping/legacy dates deduplicate and forecast is rounded once",()=>{
  assert.equal(forecast().forecast,30);
  const row=forecast({closures:[closure("2026-11-01","2026-11-10"),closure("2026-11-05","2026-11-15",["one"])],holidays:["2026-11-01"]});
  assert.equal(row.sellingDays,15);
  assert.equal(row.calendarFactor,0.5);
  assert.equal(row.forecast,15);
  assert.equal(row.reorder,12);
  assert.equal(forecast({closures:[closure("2026-11-01","2026-11-30",["other"])]}).forecast,30);
  const full=forecast({closures:[closure("2026-11-01","2026-11-30")]});
  assert.equal(full.forecast,0);assert.equal(full.reorder,0);assert.equal(full.remainingSellingDays,0);
});

test("historical closed days are not mistaken for zero-demand selling exposure",()=>{
  const row=forecast({closures:[closure("2026-10-17","2026-10-31")]});
  assert.equal(row.historyMonths,16/31);
  assert.equal(row.forecast,59);
  assert.equal(forecast({closures:[closure("2026-10-17","2026-10-31")],from:"0001-01-01"}).forecast,59);
  const closedHistory=forecast({closures:[closure("2026-10-01","2026-10-31")]});
  assert.equal(closedHistory.forecast,null);
  assert.equal(closedHistory.stockAlert,"Forecast unavailable");
  assert.equal(forecast({closures:[closure("2026-11-04","2026-11-30")]}).remainingDemand,0);
  const past={targetMonth:"2026-11",today:"2026-12-01"};
  assert.equal(forecast({...past,closures:[closure("2027-01-01","2027-01-02",["other"])]}).remainingDemand,
    forecast(past).remainingDemand);
});

test("one approved combined event percentage and climate multiply before rounding, fulfillment and stock",()=>{
  const row=forecast({closures:[closure("2026-11-01","2026-11-15")],
    adjustments:[{branch_id:"one",category:"tv",percent:20,reason:"Verified climate reviewer estimate"}],
    eventAdjustments:[{branch_id:"one",category:"tv",percent:10,reason:"Combined event reviewer estimate"}]});
  assert.equal(row.baselineForecast,15);assert.equal(row.forecast,20);assert.equal(row.reorder,17);
  assert.equal(row.eventPercent,10);
  assert.equal(forecast({eventAdjustments:[{branch_id:"other",category:"tv",percent:100}]}).forecast,30);
  assert.throws(()=>forecast({eventAdjustments:[{branch_id:"one",category:"tv",percent:NaN}]}),/invalid approved adjustment/);
});

test("sales pace uses average open branch-days; closed branches do not close other stores",()=>{
  const rules=A.makeRules("all",["2026-11-01"],[[closure("2026-11-01","2026-11-10")],[]]);
  assert.equal(A.countSellingDays("2026-11-01","2026-11-30",rules),24.5);
  assert.equal(A.countSellingDays("2026-11-02","2026-11-02",rules),0.5);
  const series=A.cumulativeSeries({month:"2026-11",refDate:"2026-11-01",daily:{"2026-11-01":0},rules,rate:100});
  assert.equal(series.forecast[1].value,50);
});

test("event approvals fail closed after edits, cancellation, wrong branch/month or missing events",()=>{
  const event={id:"e",branch_ids:["one"],starts_on:"2026-11-01",ends_on:"2026-11-30",updated_at:"2026-10-01",closed:false};
  const approval={id:"a",event_ids:["e"],branch_id:"one",month:"2026-11-01",approved_at:"2026-10-02",approved_by:"manager",revoked_at:null};
  const context=vm.createContext({liveData:{calendar:{events:[event],adjustments:[approval]}},window:{BranchlineAnalytics:A}});
  vm.runInContext(source.slice(source.indexOf("  function activeEventAdjustments("),source.indexOf("\n  function eventCalendarPanel(")),context);
  const eligible=()=>vm.runInContext('activeEventAdjustments("2026-11")',context);
  assert.equal(eligible().length,1);
  for(const change of [{closed:true},{cancelled_at:"2026-10-02"},{updated_at:"2026-10-03"},{branch_ids:["other"]},{starts_on:"2026-12-01"}]){
    context.liveData.calendar.events=[{...event,...change}];assert.equal(eligible().length,0);
  }
  context.liveData.calendar.events=[];assert.equal(eligible().length,0);
});

test("event RPCs enforce scope, immutable approvals, snapshots and invalidation", {skip:!PGlite},async()=>{
  const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
  const actor=async n=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("set role authenticated");};
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;
      create table dealers(id uuid primary key);create table profiles(id uuid primary key,role text,active boolean,dealer_id uuid);
      create table branches(id uuid primary key,dealer_id uuid);create table products(branch_id uuid,category text,active boolean);
      insert into dealers values('${id(100)}'),('${id(101)}');
      insert into profiles values('${id(1)}','admin',true,'${id(100)}'),('${id(2)}','manager',true,'${id(100)}'),('${id(3)}','district_manager',true,'${id(100)}'),('${id(4)}','ps',true,'${id(100)}'),('${id(5)}','admin',false,'${id(100)}');
      insert into branches values('${id(10)}','${id(100)}'),('${id(11)}','${id(100)}'),('${id(12)}','${id(101)}');
      insert into products values('${id(10)}','TV',true);
      create function is_dealer_member(d uuid) returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and dealer_id=d)$$;
      create function can_access_branch(b uuid) returns boolean language sql stable security definer as $$select exists(select 1 from branches x join profiles p on p.dealer_id=x.dealer_id where x.id=b and p.id=auth.uid() and p.active and (p.role='admin' or x.id='${id(10)}'))$$;
      create function can_manage_branch(b uuid) returns boolean language sql stable security definer as $$select can_access_branch(b) and exists(select 1 from profiles where id=auth.uid() and role in ('admin','manager','district_manager'))$$;`);
    await db.exec(fs.readFileSync(path.join(__dirname,"supabase","migrations","20261207000000_event_calendar.sql"),"utf8"));
    const dates=(await db.query("select date_trunc('month',now() at time zone 'Asia/Manila')::date::text as month")).rows[0];
    const save=(branches,event=null,title="Fixture sale",closed=false)=>db.query("select save_calendar_event($1,$2,$3,'promotion',$4::date,$4::date,$5,'Fixture evidence') as id",[event,branches,title,dates.month,closed]);
    const approve=(events,branch=10,pct=20)=>db.query("select approve_event_adjustment($1,$2,'TV',$3::date,$4,'Combined local event estimate justified') as id",[id(branch),events,dates.month,pct]);
    await actor(2);await assert.rejects(save([]),/management access/);await assert.rejects(save([id(11)]),/management access/);
    const own=(await save([id(10)])).rows[0].id;
    await actor(1);const company=(await save([])).rows[0].id;
    const foreignScope=(await save([id(11)])).rows[0].id;
    await assert.rejects(save([id(12)]),/management access/);
    await actor(2);await assert.rejects(save([id(10)],company),/outside your management scope/);
    assert.equal((await db.query("select count(*)::int n from calendar_events")).rows[0].n,2);
    await assert.rejects(approve([foreignScope]),/Every selected event/);
    await assert.rejects(approve([own],11),/access is required/);
    await assert.rejects(approve([own],10,Infinity),/finite percentage/);
    await approve([own,company]);await approve([company]);
    assert.equal((await db.query("select count(*)::int n from forecast_event_adjustments")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int n from forecast_event_adjustments where revoked_at is null")).rows[0].n,1);
    await assert.rejects(db.exec("update forecast_event_adjustments set percent=100"),/permission denied/);
    await actor(1);await save([],company,"Changed sale title");
    const audit=(await db.query("select event_snapshot,revoked_at from forecast_event_adjustments")).rows;
    assert.ok(audit.every(row=>row.revoked_at));
    assert.ok(audit.every(row=>row.event_snapshot.some(e=>e.title==="Fixture sale")));
    await approve([own]);await db.query("select cancel_calendar_event($1)",[own]);
    assert.equal((await db.query("select count(*)::int n from forecast_event_adjustments where revoked_at is null")).rows[0].n,0);
    await assert.rejects(approve([own]),/Every selected event/);
    const closed=(await save([id(10)],null,"Closed store",true)).rows[0].id;
    await assert.rejects(approve([closed]),/Every selected event/);
    await actor(3);await save([]);
    await actor(4);await assert.rejects(save([id(10)]),/management access/);await assert.rejects(approve([company]),/access is required/);
    await actor(5);assert.equal((await db.query("select count(*)::int n from calendar_events")).rows[0].n,0);
    await db.exec("reset role;set role anon");await assert.rejects(db.exec("select * from calendar_events"),/permission denied/);
    await assert.rejects(save([]),/permission denied/);
  }finally{await db.close();}
});
