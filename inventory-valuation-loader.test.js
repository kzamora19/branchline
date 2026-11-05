"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const A=require("./analytics.js");
const source=fs.readFileSync(path.join(__dirname,"auth-app.js"),"utf8").replace(/\r\n/g,"\n");
function harness(role="admin",fail=false) {
  const calls=[];
  const prices=Array.from({length:1001},(_,i)=>({branch_id:i<1000?"one":"two",barcode:i<1000?String(i).padStart(3,"0"):"001",srp:i<1000?100:250}));
  const catalog=[{branch_id:"one",barcode:"001",brand:"EUROTEK"},{branch_id:"two",barcode:"001",brand:"EUROTEK"},
    {branch_id:"two",barcode:"MISSING",brand:"EUROTEK"}];
  const stock=catalog.map(row=>({...row,quantity:row.barcode==="MISSING"?2:10}));
  const client={
    from(table){return query(table,table==="products"?prices:table==="inventory_stock"?stock:[]);},
    rpc(name){return query(name,name==="inventory_catalog"?catalog:[]);},
  };
  function query(table,rows) {
    const call={table};calls.push(call);
    return {select(columns){call.columns=columns;return this;},order(){return this;},
      eq(column,value){call.filter=[column,value];return this;},
      range(from,to){call.from=from;return Promise.resolve(fail&&table==="products"
        ?{data:null,error:{message:"Price query failed"}}:{data:rows.slice(from,to+1),error:null});}};
  }
  const context=vm.createContext({currentProfile:{role},managesInventory:()=>role!=="ps",
    checkResult:(result,label)=>{if(result.error)throw Error(`${label}: ${result.error.message}`);return result.data;}});
  vm.runInContext(source.slice(source.indexOf("  async function fetchPagedRows("),source.indexOf("  async function refreshInventoryData(")),context);
  return {calls,run:()=>context.loadInventoryData(client)};
}
test("live inventory catalog without SRP is enriched with paginated, exact branch/barcode product prices for sales roles",async()=>{
  for(const role of ["ps","manager","district_manager","admin"]){
    const h=harness(role),data=await h.run();
    assert.deepEqual(Array.from(data.inventoryCatalog,row=>row.srp),[100,250,null]);
    const queries=h.calls.filter(row=>row.table==="products");
    assert.ok(queries.some(row=>row.from===1000));
    assert.ok(queries.every(row=>row.columns==="branch_id,barcode,srp"&&row.filter[0]==="active"&&row.filter[1]===true));
    const summary=A.inventorySummary({catalog:data.inventoryCatalog,stock:data.inventoryStock,serials:[],facts:[],
      branchIds:new Set(["one","two"]),today:"2026-11-05",from:"2026-01-01",to:"2026-11-05"});
    const moh=A.inventoryMonthsOnHand({products:summary.products,facts:[],branchIds:new Set(["one","two"]),today:"2026-11-05"});
    const one=moh.brands.find(row=>row.branch_id==="one"),two=moh.brands.find(row=>row.branch_id==="two");
    assert.equal(one.stockUnits,10);assert.equal(one.stockValue,1000);assert.equal(one.selloutValue,0);
    assert.equal(two.stockUnits,12);assert.equal(two.stockValue,2500);assert.equal(two.missingStockSrpUnits,2);
    assert.equal(two.selloutValue,0);assert.equal(two.moh,null);
  }
});
test("inventory-only roles do not query or expose sales SRP prices",async()=>{
  for(const role of ["inventory_controller","stock_custodian"]){
    const h=harness(role),data=await h.run();
    assert.ok(h.calls.every(row=>row.table!=="products"));
    assert.ok(data.inventoryCatalog.every(row=>row.srp===null));
  }
});
test("failed price loading is explicitly rejected, never converted to zero prices",async()=>{
  await assert.rejects(harness("admin",true).run(),/Unable to load inventory SRP prices: Price query failed/);
});
