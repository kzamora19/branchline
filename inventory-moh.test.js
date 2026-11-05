"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./analytics.js");

const product = (barcode = "001", quantity = 40, srp = 1000, brand = "TCL", branch_id = "one") =>
  ({ branch_id, barcode, quantity, srp, brand, category: "TV" });
const sale = (quantity = 100, date = "2026-10-31", barcode = "001", branchId = "one") =>
  ({ branchId, barcode, date, quantity });
const calculate = (options = {}) => A.inventoryMonthsOnHand({
  products: [product()], facts: [sale()], branchIds: new Set(["one"]), today: "2026-11-05", ...options,
});

test("Jan-Oct SRP sell-out 100000 gives monthly 10000, target 30000 and stock 40000 gives four MOH", () => {
  const result = calculate(), row = result.products[0], brand = result.brands[0];
  assert.equal(result.from, "2026-01-01");
  assert.equal(result.to, "2026-10-31");
  assert.equal(result.months, 10);
  for (const value of [row, brand]) {
    assert.equal(value.selloutValue, 100000);
    assert.equal(value.monthlySelloutValue, 10000);
    assert.equal(value.targetStockValue, 30000);
    assert.equal(value.stockValue, 40000);
    assert.equal(value.moh, 4);
    assert.equal(value.mohBad, true);
  }
});

test("MOH above three is bad without rounding; exactly three and below are not red", () => {
  for (const [stock, bad] of [[0,false],[29,false],[30,false],[31,true]]) {
    const row=calculate({products:[product("001",stock)]}).products[0];
    assert.equal(row.moh, stock / 10);
    assert.equal(row.mohBad,bad);
  }
  const row=calculate({products:[product("001",3001)],facts:[sale(10000)]}).products[0];
  assert.equal(row.moh,3.001);
  assert.equal(row.mohBad,true);
});

test("brand MOH divides summed SRP values, never averages item ratios or pools branches/brands", () => {
  const result=calculate({products:[product("001",40,1000),product("002",2,10000),
    product("003",1,1000,"LG"),product("001",5,1000,"TCL","two")],
    facts:[sale(100),sale(50,"2026-10-31","002"),sale(500,"2026-10-31","001","foreign")],
    branchIds:new Set(["one","two"])});
  const one=result.brands.find(row=>row.branch_id==="one"&&row.brand==="TCL");
  assert.equal(one.stockValue,60000);
  assert.equal(one.selloutValue,600000);
  assert.equal(one.monthlySelloutValue,60000);
  assert.equal(one.moh,1);
  assert.notEqual(one.moh,(4+0.4)/2);
  const two=result.brands.find(row=>row.branch_id==="two");
  assert.equal(two.stockValue,5000);
  assert.equal(two.selloutValue,0);
  assert.equal(two.mohStatus,"No sell-out");
  assert.equal(two.mohBad,true);
  assert.equal(result.brands.length,3);
});

test("completed-year valuation excludes November, prior years, future, summary and unauthorized sales; returns stay signed", () => {
  const row=calculate({facts:[sale(110),sale(-10,"2026-03-01"),sale(999,"2026-11-01"),
    sale(999,"2025-12-31"),sale(999,"2027-01-01"),sale(999,"2026-01-01","1"),
    sale(999,"2026-01-01","001","foreign"),{...sale(999),summary:true}]}).products[0];
  assert.equal(row.selloutValue,100000);
  assert.equal(row.moh,4);
  const negative=calculate({facts:[sale(-10)]}).products[0];
  assert.equal(negative.selloutValue,-10000);
  assert.equal(negative.monthlySelloutValue,0);
  assert.equal(negative.moh,null);
  assert.equal(negative.mohStatus,"No sell-out");
  assert.equal(negative.mohBad,true);
});

test("missing/invalid SRP cannot become zero brand value or a partial-success MOH", () => {
  for (const srp of [null,undefined,0,-1,NaN,Infinity]) {
    const result=calculate({products:[{...product(),srp}]});
    for (const row of [result.products[0],result.brands[0]]) {
      assert.equal(row.stockValue,null);
      assert.equal(row.selloutValue,null);
      assert.equal(row.moh,null);
      assert.match(row.mohStatus,/unavailable/);
    }
  }
  const partial=calculate({products:[product(),product("002",1,null)]}).brands[0];
  assert.equal(partial.stockValue,null);
  assert.equal(partial.moh,null);
  const unknown=calculate({products:[product("001",null)]}).brands[0];
  assert.equal(unknown.stockValue,null);
  assert.equal(unknown.selloutValue,100000);
  assert.equal(unknown.moh,null);
});

test("January, no sell-out, no stock and failed loads are explicit, not finite zero-MOH substitutes", () => {
  const january=calculate({today:"2027-01-05"}).brands[0];
  assert.equal(january.months,0);
  assert.equal(january.moh,null);
  assert.equal(january.mohStatus,"No completed months");
  const noSales=calculate({facts:[]}).brands[0];
  assert.equal(noSales.moh,null);
  assert.equal(noSales.mohStatus,"No sell-out");
  assert.equal(noSales.mohBad,true);
  const empty=calculate({facts:[],products:[product("001",0)]}).brands[0];
  assert.equal(empty.stockValue,0);
  assert.equal(empty.mohStatus,"No stock or sell-out");
  assert.equal(empty.mohBad,false);
  const failed=calculate({unavailable:true}).brands[0];
  assert.equal(failed.selloutValue,null);
  assert.equal(failed.moh,null);
  assert.equal(failed.mohStatus,"Sales unavailable");
  assert.throws(()=>calculate({facts:[sale(0.5)]}),/invalid unit quantity/);
  assert.throws(()=>calculate({products:[product("001",100,Number.MAX_VALUE)]}),/valuation exceeds/);
});

test("unmatched sold products make affected brand valuation unavailable instead of reporting a partial total", () => {
  const result=calculate({facts:[sale(),{...sale(5,"2026-03-01","MISSING"),brand:"TCL"}]});
  assert.equal(result.products[0].moh,4);
  assert.equal(result.brands[0].selloutValue,null);
  assert.equal(result.brands[0].moh,null);
  assert.equal(result.brands[0].mohStatus,"Unmatched product sales");
});

test("calendar/seasonal adjustments change the three-month target but never actual annual MOH", () => {
  const options={products:[product()],facts:[sale()],branchIds:new Set(["one"]),
    from:"0001-01-01",to:"2026-11-05",today:"2026-11-05"};
  const plain=A.inventoryForecast(options).products[0];
  const changed=A.inventoryForecast({...options,
    adjustments:[{branch_id:"one",category:"tv",percent:20}],
    eventAdjustments:[{branch_id:"one",category:"tv",percent:10}],
    closures:[{branch_ids:["one"],starts_on:"2026-11-01",ends_on:"2026-11-15"}]}).products[0];
  assert.equal(plain.historyMonths,10);
  assert.equal(plain.stockTarget,30);
  assert.equal(changed.stockTarget,20);
  assert.equal(changed.reorder,0);
  assert.equal(changed.moh,4);
  assert.equal(changed.targetStockValue,30000);
});
