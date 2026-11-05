const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8");
const section = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

function fixture({ desktop = true, role = "ps", branch = "" } = {}) {
  let modal, hidden = 0;
  const opened = [], handlers = {};
  const sales = [
    { id:"own",ps_id:"self",branch_id:"one",sold_on:"2026-11-03",invoice_number:"SI-1",amount:100 },
    { id:"return",ps_id:"self",branch_id:"one",sold_on:"2026-11-03",invoice_number:"RET-1",amount:-40 },
    { id:"peer",ps_id:"peer",branch_id:"one",sold_on:"2026-11-03",invoice_number:"SI-2",amount:200 },
    { id:"remote",ps_id:"self",branch_id:"two",sold_on:"2026-11-03",invoice_number:"SI-3",amount:300 },
    { id:"outside",ps_id:"self",branch_id:"no-access",sold_on:"2026-11-03",invoice_number:"SI-4",amount:9000 },
    { id:"other-day",ps_id:"self",branch_id:"one",sold_on:"2026-11-02",invoice_number:"SI-5",amount:8000 },
    { id:"test",ps_id:"self",branch_id:"one",sold_on:"2026-11-03",invoice_number:"TEST",amount:7000,test:true },
  ];
  const context = vm.createContext({
    window:{ matchMedia:()=>({matches:desktop}) }, currentProfile:{id:"self",role}, ui:{salesBasis:"price",search:"unrelated",logFrom:"2026-10-01",logTo:"2026-10-31"},
    liveData:{testPsIds:new Set(),profiles:[{id:"self",full_name:"Original PS"}]},
    panelIds:(_key,ids)=>branch ? new Set([...ids].filter(id=>id===branch)) : ids,
    scopeBranchIds:()=>new Set(["one","two"]),
    visibleSales:()=>sales.filter(s=>role!=="ps"||s.ps_id==="self"),
    isTestSale:s=>!!s.test,branchName:id=>id,titleCase:String,escapeHTML:String,
    localISODate:()=>"2026-11-05",natural:(a,b)=>a.localeCompare(b),
    saleTotal:s=>s.amount,formatMoney:n=>`P${n}`,monthLabel:String,chartExport:()=>"",
    hidePieTip:()=>hidden++,openModal:options=>{modal=options;},
    openSaleDetails:id=>opened.push(id),console,alert:assert.fail,friendlyError:e=>e.message,
  });
  vm.runInContext(section("  function dailySalesChart(","  function growthCell("),context);
  vm.runInContext(section("  function saleSummaryRowHTML(","  // One product line"),context);
  return {context,opened,handlers,get modal(){return modal;},get hidden(){return hidden;},
    ready(){modal.onReady({closest:()=>({classList:{add:name=>assert.equal(name,"dlg-xwide")}}),addEventListener:(name,fn)=>{handlers[name]=fn;}});}};
}

test("daily bars expose desktop drilldown only for recorded dates and retain tooltip metadata",()=>{
  const f=fixture();
  const html=vm.runInContext('dailySalesChart([{date:"2026-11-03",total:60,count:2}],"2026-11","2026-11-05",true)',f.context);
  assert.equal((html.match(/data-daily-sales-date=/g)||[]).length,5);
  assert.equal((html.match(/aria-haspopup="dialog"/g)||[]).length,5);
  assert.equal((html.match(/data-tip=/g)||[]).length,30);
  assert.match(html,/data-daily-sales-date="2026-11-03"/);
  const mobile=fixture({desktop:false});
  assert.doesNotMatch(vm.runInContext('dailySalesChart([],"2026-11","2026-11-05")',mobile.context),/aria-haspopup/);
});

for(const role of ["ps","manager","district_manager","admin"]) {
  test(`${role} daily log uses exact date, authorized chart branches, signed totals and excludes TEST`,()=>{
    const f=fixture({role,branch:"one"});
    f.context.openDailySalesLog("2026-11-03");
    assert.match(f.modal.title,/2026-11-03/);
    for(const id of ["own","return"])assert.ok(f.modal.body.includes(`data-sale-details="${id}"`));
    for(const id of ["remote","outside","other-day","test"])assert.ok(!f.modal.body.includes(`data-sale-details="${id}"`));
    assert.equal(f.modal.body.includes('data-sale-details="peer"'),role!=="ps");
    assert.match(f.modal.intro,role==="ps"?/2 recorded transactions · P60/:/3 recorded transactions · P260/);
    assert.equal(f.hidden,1);
    f.ready();
    for(const type of ["click","keydown"]){
      let prevented=false;
      f.handlers[type]({type,key:"Enter",target:{closest:()=>({dataset:{saleDetails:"own"}})},preventDefault:()=>{prevented=true;}});
      assert.equal(prevented,true);
    }
    assert.deepEqual(f.opened,["own","own"]);
  });
}

test("mobile and future bars never open logs; empty historical dates explicitly show no invoices",()=>{
  const mobile=fixture({desktop:false});mobile.context.openDailySalesLog("2026-11-03");assert.equal(mobile.modal,undefined);
  const f=fixture();f.context.openDailySalesLog("2026-11-06");assert.equal(f.modal,undefined);
  f.context.openDailySalesLog("invalid");assert.equal(f.modal,undefined);
  f.context.openDailySalesLog("2026-10-03");
  assert.match(f.modal.body,/No individual sales transactions/);
  assert.match(f.modal.intro,/Summary-only historical amounts may differ/);
});
