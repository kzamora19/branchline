"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
const A=require("./analytics.js");
function harness(role) {
  const context=vm.createContext({
    liveData:{branches:[{id:"one",name:"Branch One"}],holidays:[{date:"2026-11-01",label:"Company holiday"}],
      calendar:{events:[{id:"e",branch_ids:["one"],starts_on:"2026-11-02",ends_on:"2026-11-04",title:"Sale event",kind:"promotion",notes:"Popup only"},
        {id:"other",branch_ids:["other"],starts_on:"2026-11-02",ends_on:"2026-11-02",title:"Excluded other branch"}],adjustments:[]}},
    ui:{eventCalendarMonth:"2026-11"},currentProfile:{role},demoStore:null,
    window:{BranchlineAnalytics:A},localISODate:()=>"2026-11-04",
    escapeHTML:value=>String(value).replaceAll('"',"&quot;"),panel:(_title,_detail,body)=>body,
    canManageCalendarEvent:()=>role!=="ps",activeEventAdjustments:()=>[],openModal:options=>{context.modal=options;},
  });
  vm.runInContext(source.slice(source.indexOf("  function eventCalendarPanel("),source.indexOf("  async function refreshEventCalendar(")),context);
  vm.runInContext(source.slice(source.indexOf("  function calendarScheduleLabel("),source.indexOf("  function openCalendarEvent(")),context);
  return context;
}
test("calendar dates contain numbers only; event details and management move into a scoped date popup for every role",()=>{
  for(const role of ["ps","manager","district_manager","admin"]){
    const c=harness(role),html=vm.runInContext('eventCalendarPanel(new Set(["one"]))',c);
    assert.match(html,/class="event-calendar"/);assert.equal((html.match(/<th scope="col">/g)||[]).length,7);
    assert.match(html,/calendar-date-event calendar-date-closed/);
    assert.match(html,/data-event-date="2026-11-02"[^>]*>2<\/button>/);
    for(const text of ["Sale event","Popup only","No calendar events","No approved event","One combined event adjustment","Inclusive dates"])assert.ok(!html.includes(text),text);
    vm.runInContext('openCalendarDate("2026-11-02",["one"])',c);
    assert.match(c.modal.body,/Sale event/);assert.match(c.modal.body,/Popup only/);
    assert.doesNotMatch(c.modal.body,/Store open|Store closed| \/ <\/p>/);
    assert.doesNotMatch(c.modal.body,/Excluded other branch/);
    assert.equal(c.modal.body.includes('data-event-edit="e"'),role!=="ps");
    c.liveData.calendar.events[0].closed=true;
    vm.runInContext('openCalendarDate("2026-11-02",["one"])',c);
    assert.match(c.modal.body,/ \/ Store closed<\/p>/);
    vm.runInContext('openCalendarDate("2026-11-01",["one"])',c);
    assert.match(c.modal.body,/Company holiday/);assert.match(c.modal.body,/Store closed/);
  }
});
test("monitoring notice leaves Analytics while Settings retains monitoring management",()=>{
  assert.match(source,/const productTable = eventCalendarPanel\(ids\) \+ demandWarning/);
  assert.match(source,/eventCalendarPanel\(\) \+ climateReviewPanel\(\) \+ storeClosedDatesPanel\(\)/);
});
test("Edit, Cancel event and Revoke are delegated inside the date dialog, outside the page container",()=>{
  const c=harness("manager"),calls=[];
  c.openCalendarEvent=id=>calls.push(["edit",id]);
  c.openEventAction=(id,revoke=false)=>calls.push([revoke ? "revoke" : "cancel",id]);
  vm.runInContext('openCalendarDate("2026-11-02",["one"])',c);
  let click;
  c.modal.onReady({addEventListener:(name,handler)=>{assert.equal(name,"click");click=handler;}});
  for(const [attribute,key] of [["edit","eventEdit"],["cancel","eventCancel"],["revoke","eventRevoke"]]){
    click({target:{closest:selector=>selector===`[data-event-${attribute}]` ? {dataset:{[key]:"event-one"}} : null}});
  }
  assert.deepEqual(calls,[["edit","event-one"],["cancel","event-one"],["revoke","event-one"]]);
});
