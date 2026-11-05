"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const A=require("./analytics.js"),I=require("./inventory.js");
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
const product=(barcode,quantity,srp,brand="TCL",branch_id="one")=>({barcode,quantity,srp,brand,branch_id,category:"TV",model_description:barcode});
function harness(role="manager"){
  const catalog=[product("A",40,1000),product("B",2,10000),product("LG",5,1000,"LG"),product("FOREIGN",999,1000,"TCL","foreign")];
  const facts=[{branchId:"one",barcode:"A",quantity:100,date:"2026-10-31",brand:"TCL"},
    {branchId:"one",barcode:"B",quantity:50,date:"2026-10-31",brand:"TCL"},
    {branchId:"one",barcode:"LG",quantity:10,date:"2026-10-31",brand:"LG"}];
  const c=vm.createContext({window:{BranchlineAnalytics:A,BranchlineInventory:I},liveData:{
    inventoryCatalog:catalog,inventoryStock:catalog,profiles:[],brandSales:facts.map(row=>({branch_id:row.branchId,barcode:row.barcode,quantity:row.quantity,sold_on:row.date,brand:row.brand}))},
    currentProfile:{role,assigned_brand:"TCL",branch_id:"one"},tableStore:{},branchName:String,formatMoney:value=>`P${value}`,
    escapeHTML:value=>String(value).replace(/[&<>"]/g,""),scopeBranchIds:()=>new Set(["one"]),analyticsFacts:()=>facts,
    localISODate:()=>"2026-11-05",openModal:options=>{c.modal=options;},exportWorkbook:(sheets,name)=>{c.exported={sheets,name};}});
  vm.runInContext(source.slice(source.indexOf("  function inventoryMohData("),source.indexOf("  function allTimeAnalyticsPanels(")),c);
  return c;
}
test("summary MOH is weighted total stock value divided by monthly sell-out, never averaged brand ratios",()=>{
  const c=harness(),ids=new Set(["one"]),data=c.inventoryMohData(ids,c.analyticsFacts(),"2026-11-05");
  assert.equal(data.total.stockUnits,47);
  assert.equal(data.total.stockValue,65000);
  assert.equal(data.total.selloutValue,610000);
  assert.equal(data.total.moh,65000/61000);
  const html=c.inventoryMohCard(ids,c.analyticsFacts(),"2026-11-05");
  assert.match(html,/data-open="inventory-moh"/);assert.match(html,/aria-haspopup="dialog"/);
  assert.doesNotMatch(html,/<table|FOREIGN/);
  assert.equal(c.tableStore["an-inventory-brand-moh"].items.length,2);
  assert.equal(typeof c.tableStore["an-inventory-brand-moh"].items[0][3],"number");
});
test("PS summary and brand/product drilldown retain assigned brand and authorized branch scope",()=>{
  const c=harness("ps"),data=c.inventoryMohData(new Set(["one"]),[],"2026-11-05");
  assert.equal(data.total.stockUnits,42);assert.equal(data.brands.length,1);
  c.openInventoryMoh(data);
  assert.match(c.modal.body,/data-moh-brand="0"/);assert.match(c.modal.body,/tabindex="0" role="button"/);
  assert.doesNotMatch(c.modal.body,/FOREIGN|>LG</);
  c.openInventoryMoh(data,0);
  assert.match(c.modal.body,/data-moh-back/);assert.match(c.modal.body,/>A</);assert.match(c.modal.body,/>B</);
  assert.doesNotMatch(c.modal.body,/FOREIGN|data-moh-brand/);
});
test("popup click handlers cover whole brand rows, keyboard, back, search and numeric export",()=>{
  const c=harness();c.openInventoryMoh();
  const listeners={},nodes={"[data-moh-search]":{addEventListener:(type,fn)=>{listeners.input=fn;}},
    "[data-moh-rows]":{innerHTML:""},"[data-moh-empty]":{hidden:true}};
  const form={querySelector:key=>nodes[key],addEventListener:(type,fn)=>{listeners[type]=fn;}};
  c.modal.onReady(form);
  listeners.input({target:{value:"TCL"}});
  assert.doesNotMatch(nodes["[data-moh-rows]"].innerHTML,/>LG</);
  listeners.click({target:{closest:key=>key==="[data-moh-export]"?{}:null}});
  assert.equal(c.exported.sheets[0].rows.length,2);
  assert.equal(c.exported.sheets[0].rows[1][2],42);
  assert.equal(c.exported.sheets[0].rows[1][3],60000);
  listeners.click({target:{closest:key=>key==="[data-moh-brand]"?{dataset:{mohBrand:"0"}}:null}});
  assert.match(c.modal.title,/TCL products/);
  c.modal.onReady(form);
  listeners.click({target:{closest:key=>key==="[data-moh-back]"?{}:null}});
  assert.equal(c.modal.title,"Months-on-Hand · Brands");
  c.modal.onReady(form);
  let prevented=false;
  listeners.keydown({key:"Enter",preventDefault:()=>{prevented=true;},target:{matches:()=>true,dataset:{mohBrand:"0"}}});
  assert.equal(prevented,true);assert.match(c.modal.title,/TCL products/);
  c.openInventoryMoh();c.modal.onReady(form);
  listeners.input({target:{value:"no-match"}});
  assert.equal(nodes["[data-moh-empty]"].hidden,false);
});
test("summary unavailable and missing-pricing states remain explicit; MOH over three retains red",()=>{
  const c=harness();c.liveData.inventoryStock=c.liveData.inventoryStock.map(row=>({...row,quantity:1000}));
  assert.match(c.inventoryMohCard(new Set(["one"]),c.analyticsFacts(),"2026-11-05"),/class="an-down"/);
  c.liveData.inventoryError="Stock load failed";
  assert.match(c.inventoryMohCard(new Set(["one"]),c.analyticsFacts(),"2026-11-05"),/Unavailable/);
  assert.match(c.inventoryMohCard(new Set(["one"]),c.analyticsFacts(),"2026-11-05"),/Stock load failed/);
});
test("card is wired into monthly and all-time metric grids, not the lower inventory table",()=>{
  assert.equal((source.match(/\$\{inventoryMohCard\(ids, facts, today\)\}/g)||[]).length,2);
  assert.match(source,/open === "inventory-moh"\) openInventoryMoh\(\)/);
  const panel=source.slice(source.indexOf("  function inventoryAnalyticsPanels("),source.indexOf("  function inventoryMohData("));
  assert.doesNotMatch(panel,/Brand Months-on-Hand|an-inventory-brand-moh/);
});
