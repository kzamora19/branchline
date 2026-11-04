"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"),"utf8").replace(/\r\n/g,"\n");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("official parser verifies issue date and status; never derives an uplift", async () => {
  const { parseEvidence } = await import("./supabase/functions/forecast-climate/evidence.mjs");
  const page = status => `<title>Climate Prediction Center: ENSO Diagnostic Discussion</title><p>8 October 2026</p><p>ENSO Alert System Status: <b>${status}</b></p><p>Synopsis: Synthetic test text.</p>`;
  const row = parseEvidence(page("El Ni&ntilde;o Advisory"),"2026-11-04");
  assert.equal(row.issued_on,"2026-10-08");
  assert.equal(row.phase,"El Nino");
  assert.equal(row.valid_until,"2026-11-22");
  assert.equal("percent" in row,false);
  assert.equal(parseEvidence(page("La Ni&ntilde;a Advisory"),"2026-11-04").phase,"La Nina");
  assert.equal(parseEvidence(page("El Nino Watch"),"2026-11-04").phase,"Watch");
  for (const html of ["<h1>Gateway error</h1>", page("Unknown"), page("El Nino Advisory").replace("8 October","31 February")]) {
    assert.throws(()=>parseEvidence(html,"2026-11-04"));
  }
  assert.throws(()=>parseEvidence(page("El Nino Advisory"),"2026-12-01"),/older than 45/);
  assert.throws(()=>parseEvidence(page("El Nino Advisory"),"2026-10-01"),/future-dated/);
});

test("unapproved, revoked, stale, wrong-month and wrong-location adjustments are not eligible", () => {
  const now = new Date().toISOString(), today=now.slice(0,10), month=today.slice(0,7);
  const context = {
    locations:[{branch_id:"one",verified_at:"2020-01-01T00:00:00Z"}],
    evidence:[{id:"e",issued_on:today,valid_until:today}],status:[{checked_at:now,error:null}],
    adjustments:[{id:"a",branch_id:"one",category:"Aircon",month:month+"-01",percent:25,reason:"Local evidence recorded",
      approved_by:"manager",approved_at:now,evidence_id:"e",revoked_at:null}],
  };
  const run = value => {
    const c=vm.createContext({liveData:{climate:value}});
    const start=source.indexOf("  function activeClimateAdjustments(");
    vm.runInContext(source.slice(start,source.indexOf("  function climateReviewPanel(",start)),c);
    return c.activeClimateAdjustments(today,month);
  };
  assert.equal(run(context).length,1);
  for(const override of [
    {error:"connection failed"}, {demo:true}, {locations:[]},
    {status:[{checked_at:"2000-01-01",error:null}]},{status:[{checked_at:now,error:"source failed"}]},
    {evidence:[{id:"e",issued_on:"2000-01-01",valid_until:"2000-02-01"}]},
    {adjustments:[{...context.adjustments[0],revoked_at:now}]},
    {adjustments:[{...context.adjustments[0],approved_by:null}]},
    {adjustments:[{...context.adjustments[0],month:"2000-01-01"}]},
    {locations:[{branch_id:"one",verified_at:"2999-01-01"}]},
  ]) assert.equal(run({...context,...override}).length,0);
});

test("approved percentage adjusts unrounded seasonal demand before sold units and stock; exact scope retained", () => {
  const options={products:[{branch_id:"one",barcode:"01",category:"Aircon",quantity:3}],
    facts:[{branchId:"one",barcode:"01",date:"2025-11-01",quantity:150},
      {branchId:"one",barcode:"01",date:"2026-11-02",quantity:4}],
    branchIds:new Set(["one"]),from:"2025-11-01",to:"2026-10-31",today:"2026-11-04"};
  const baseline=A.inventoryForecast(options).products[0];
  assert.equal(baseline.forecast,13); assert.equal(baseline.reorder,6);
  const adjustment={branch_id:"one",category:"aircon",percent:20,reason:"Verified local evidence and reviewer estimate"};
  const changed=A.inventoryForecast({...options,adjustments:[adjustment]}).products[0];
  assert.equal(changed.baselineForecast,13);
  assert.equal(changed.forecast,15); assert.equal(changed.remainingDemand,11); assert.equal(changed.reorder,8);
  assert.equal(changed.approvedPercent,20);
  const cancelled=A.inventoryForecast({...options,adjustments:[{...adjustment,percent:-100}],
    facts:[options.facts[0],{...options.facts[1],quantity:-2}]}).products[0];
  assert.equal(cancelled.forecast,0);
  assert.equal(cancelled.remainingDemand,0);
  assert.equal(cancelled.reorder,0);
  for(const other of [{...adjustment,branch_id:"two"},{...adjustment,category:"TV"}])
    assert.equal(A.inventoryForecast({...options,adjustments:[other]}).products[0].reorder,6);
  assert.throws(()=>A.inventoryForecast({...options,adjustments:[{...adjustment,percent:Infinity}]}),/invalid approved adjustment/);
});

test("climate tables and RPCs enforce assigned approval scope and immutable audit records", {skip:!PGlite}, async()=>{
  const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
  const actor = user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(user)]);
  const sqlDir=process.env.BRANCHLINE_MIGRATIONS||path.join(__dirname,"supabase","migrations");
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;
      create table profiles(id uuid primary key,role text,active boolean,dealer_id uuid);
      create table branches(id uuid primary key);
      create table products(branch_id uuid,category text,active boolean);
      create function can_access_branch(b uuid) returns boolean language sql stable security definer as $$select b='${id(10)}'::uuid and exists(select 1 from profiles where id=auth.uid() and active)$$;
      create function can_manage_branch(b uuid) returns boolean language sql stable security definer as $$select can_access_branch(b) and exists(select 1 from profiles where id=auth.uid() and active and role in ('admin','manager','district_manager'))$$;
      create function is_dealer_member(d uuid) returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and dealer_id=d)$$;
      insert into profiles values('${id(1)}','admin',true,'${id(100)}'),('${id(2)}','manager',true,'${id(100)}'),('${id(3)}','district_manager',true,'${id(100)}'),('${id(4)}','ps',true,'${id(100)}'),('${id(5)}','admin',false,'${id(100)}');
      insert into branches values('${id(10)}'),('${id(11)}');
      insert into products values('${id(10)}','Aircon',true);`);
    await db.exec(fs.readFileSync(path.join(sqlDir,"20261206000000_forecast_climate_review.sql"),"utf8"));
    await db.exec(`insert into forecast_climate_evidence(id,source_url,issued_on,phase,valid_until) values('${id(20)}','https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml',(now() at time zone 'Asia/Manila')::date,'El Nino',(now() at time zone 'Asia/Manila')::date+45);
      insert into forecast_monitor_status(id,checked_at) values(true,now());`);
    const location=()=>db.query("select save_forecast_location($1,'City','Province',14.5,121)",[id(10)]);
    const approve=branch=>db.query("select approve_forecast_adjustment($1,$2,'Aircon',date_trunc('month',(now() at time zone 'Asia/Manila'))::date,20,'Local evidence supports this reviewer estimate') as id",[id(branch),id(20)]);
    await actor(2); await db.exec("set role authenticated");
    await assert.rejects(location(),/Administrator/);
    await db.exec("reset role");await actor(1);await db.exec("set role authenticated");await location();
    await assert.rejects(db.query("insert into forecast_locations(branch_id) values($1)",[id(11)]),/permission denied/);
    for(const user of [1,2,3]){
      await db.exec("reset role");await actor(user);await db.exec("set role authenticated");
      await approve(10);await assert.rejects(approve(11),/access is required/);
    }
    const audit=await db.query("select approved_by,revoked_at from forecast_adjustments order by approved_at");
    assert.equal(audit.rows.length,3);assert.equal(audit.rows.filter(r=>!r.revoked_at).length,1);
    await db.exec("reset role");await actor(4);await db.exec("set role authenticated");
    await assert.rejects(approve(10),/access is required/);
    assert.equal((await db.query("select count(*)::int n from forecast_adjustments")).rows[0].n,3);
    await assert.rejects(db.query("update forecast_adjustments set percent=999"),/permission denied/);
    await db.exec("reset role");await actor(1);await db.exec("set role authenticated");await location();
    assert.equal((await db.query("select count(*)::int n from forecast_adjustments where revoked_at is null")).rows[0].n,0);
    await db.exec("reset role");await db.exec("update forecast_monitor_status set error='source failed'");
    await db.exec("set role authenticated");await assert.rejects(approve(10),/successful check/);
    await db.exec("reset role");await actor(5);await db.exec("set role authenticated");await assert.rejects(location(),/Administrator/);
    await db.exec("reset role");await db.exec("set role anon");
    await assert.rejects(db.query("select * from forecast_adjustments"),/permission denied/);
    await assert.rejects(approve(10),/permission denied/);
  }finally{await db.close();}
});
