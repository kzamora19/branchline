"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
function harness(fail) {
  const calls=[],errors=[];
  const client={from(table){
    calls.push(table);
    return {select(){return this;},order(){return this;},range(from){
      return Promise.resolve(fail===table ? {data:null,error:{message:"Fixture permission failure"}} :
        {data:from===0 ? [{id:table,branch_id:"branch",checked_at:"2026-11-04"}] : [],error:null});
    }};
  }};
  const context=vm.createContext({demoStore:null,client,console:{error:(...args)=>errors.push(args)}});
  for(const [start,end] of [
    ["  async function fetchPagedRows(","  async function fetchInventoryRpc("],
    ["  async function loadEventCalendar(","  function calendarClosures("],
    ["  async function loadClimateContext(","  function activeClimateAdjustments("],
  ]) {
    const a=source.indexOf(start),b=source.indexOf(end,a);
    assert.ok(a>=0 && b>a,start);
    vm.runInContext(source.slice(a,b),context);
  }
  return {context,calls,errors};
}
test("non-demo workspace loaders use an in-scope paginated client, not loadLiveWorkspace's local fetchAll",async()=>{
  const {context,calls,errors}=harness();
  const [calendar,climate]=await vm.runInContext("Promise.all([loadEventCalendar(client),loadClimateContext(client)])",context);
  assert.equal(calendar.events[0].id,"calendar_events");
  assert.equal(calendar.adjustments[0].id,"forecast_event_adjustments");
  assert.equal(climate.locations[0].id,"forecast_locations");
  assert.equal(climate.evidence[0].id,"forecast_climate_evidence");
  assert.equal(climate.adjustments[0].id,"forecast_adjustments");
  assert.equal(climate.status[0].id,"forecast_monitor_status");
  assert.equal(new Set(calls).size,6);
  assert.equal(errors.length,0);
  assert.match(source,/Promise\.all\(\[loadClimateContext\(client\), loadEventCalendar\(client\)\]\)/);
});
test("live query errors remain explicit and demo does not query live monitoring tables",async()=>{
  for(const [table,loader] of [["calendar_events","loadEventCalendar"],["forecast_monitor_status","loadClimateContext"]]) {
    const {context,errors}=harness(table);
    const result=await vm.runInContext(`${loader}()`,context);
    assert.match(result.error,/Fixture permission failure/);
    assert.equal(result.adjustments.length,0);assert.equal(errors.length,1);
  }
  const {context,calls}=harness();context.demoStore={};
  const results=await vm.runInContext("Promise.all([loadEventCalendar(),loadClimateContext()])",context);
  assert.ok(results.every(row=>row.demo));assert.equal(calls.length,0);
});
test("non-demo inventory-only workspace loads its scoped calendar and closure dates before rendering",async()=>{
  const {context,calls}=harness();
  const noop=()=>{},nodes={};
  Object.assign(context,{
    inventoryOnly:()=>true,sequence:1,loadSequence:1,currentSession:{},profile:{role:"stock_custodian"},
    currentProfile:{id:"custodian"},roleLabels:{stock_custodian:"Stock custodian"},
    fetchAll:async table=>({data:table==="company_holidays" ? [{holiday_date:"2026-11-04",label:"Closed"}] : [],error:null}),
    loadInventoryData:async()=>({inventoryLoaded:true}),checkResult:result=>result.data,
    loading:{update:noop,finish:async()=>{}},sanitizeAccountScope:noop,connectedUserLabel:()=>"Custodian",
    document:{querySelector:selector=>(nodes[selector] ||= {})},refreshPushButton:noop,
    activePage:"settings",rolePageAllowed:()=>true,location:{hash:""},ui:{},
    renderConnected:()=>{context.rendered=true;},autoRegisterPush:noop,passwordRecoveryPending:false,showInventoryReminder:async()=>{},
  });
  const begin=source.indexOf("      if (inventoryOnly()) {",source.indexOf("  async function loadLiveWorkspace("));
  const end=source.indexOf("      const isPsUser",begin);
  assert.ok(begin>=0 && end>begin);
  await vm.runInContext(`(async()=>{${source.slice(begin,end)}})()`,context);
  assert.equal(context.liveData.calendar.events[0].id,"calendar_events");
  assert.equal(context.liveData.calendar.adjustments[0].id,"forecast_event_adjustments");
  assert.equal(context.liveData.holidays[0].date,"2026-11-04");
  assert.equal(context.liveData.inventoryLoaded,true);assert.equal(context.rendered,true);
  assert.ok(calls.includes("calendar_events"));
});
