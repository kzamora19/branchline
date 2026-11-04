"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const A=require("./analytics.js");
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
const weekend={starts_on:"2026-11-01",ends_on:"2026-11-30",weekdays:[0,6]};
test("one weekend series occurs on all Saturdays/Sundays only, with inclusive boundaries and legacy daily ranges",()=>{
  const dates=Array.from({length:30},(_,i)=>`2026-11-${String(i+1).padStart(2,"0")}`);
  assert.deepEqual(dates.filter(date=>A.calendarOccursOn(weekend,date)),[
    "2026-11-01","2026-11-07","2026-11-08","2026-11-14","2026-11-15","2026-11-21","2026-11-22","2026-11-28","2026-11-29"]);
  assert.equal(A.calendarOccursOn(weekend,"2026-10-31"),false);
  assert.equal(A.calendarOccursBetween(weekend,"2026-11-02","2026-11-06"),false);
  assert.equal(A.calendarOccursBetween(weekend,"2026-11-02","2026-11-07"),true);
  assert.equal(A.calendarOccursBetween({...weekend,weekdays:[5],starts_on:"2026-11-30",ends_on:"2026-12-10"},"2026-11-01","2026-11-30"),false);
  assert.equal(A.calendarOccursOn({...weekend,weekdays:[]},"2026-11-02"),true);
  assert.equal(A.calendarOccursOn({starts_on:"2026-11-01",ends_on:"2026-11-30"},"2026-11-02"),true);
});
test("recurring closures reduce selling exposure only on selected weekdays, not the whole range",()=>{
  const rules=A.makeRules("all",[],[[weekend]]);
  assert.equal(A.countSellingDays("2026-11-01","2026-11-30",rules),21);
  const row=A.inventoryForecast({products:[{branch_id:"one",barcode:"01",category:"TV",quantity:0}],
    facts:[{branchId:"one",barcode:"01",date:"2026-10-01",quantity:30}],branchIds:new Set(["one"]),
    from:"2026-10-01",to:"2026-10-31",today:"2026-11-04",closures:[{...weekend,branch_ids:[]}]}).products[0];
  assert.equal(row.sellingDays,21);assert.equal(row.forecast,21);assert.equal(row.reorder,21);
});
test("memo links preserve case, open safely in a new tab and never render executable URLs",()=>{
  const c=vm.createContext({URL,escapeHTML:value=>String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;")});
  vm.runInContext(source.slice(source.indexOf("  function calendarScheduleLabel("),source.indexOf("  function openCalendarEvent(")),c);
  for(const url of ["https://example.com/PromoCase.pdf?Key=AbC","http://example.com/memo","https://drive.google.com/file/d/example/view"]){
    c.link={url,label:'Memo <one> "details"'};
    assert.equal(vm.runInContext("validCalendarMemoURL(link.url)",c),true);
    const html=vm.runInContext("calendarMemoLinks({memo_links:[link]})",c);
    assert.ok(html.includes(url));assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.match(html,/Memo &lt;one>/);
  }
  for(const url of ["javascript:alert(1)","data:text/html,test","https://user:pass@example.com/x","https://example.com/bad path","https://example.com\\evil"]){
    c.link={url,label:"Invalid"};
    assert.equal(vm.runInContext("validCalendarMemoURL(link.url)",c),false);
    const html=vm.runInContext("calendarMemoLinks({memo_links:[link]})",c);
    assert.doesNotMatch(html,/<a /);assert.match(html,/role="alert"/);
  }
});
