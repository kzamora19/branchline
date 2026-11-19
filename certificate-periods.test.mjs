import test from "node:test";
import assert from "node:assert/strict";
import { certificatePeriodRange } from "./certificate-periods.mjs";

test("monthly certificate uses selected month and does not relabel another ranking", () => {
  const complete = certificatePeriodRange("monthly","2026-10","2026-11-19");
  assert.deepEqual([complete.from,complete.through,complete.partial],["2026-10-01","2026-10-31",false]);
  assert.match(complete.label,/October 2026.*Monthly Performance/);
  const current=certificatePeriodRange("monthly","2026-11","2026-11-19");
  assert.deepEqual([current.from,current.through],["2026-11-01","2026-11-19"]);
  assert.match(current.label,/through 2026-11-19/);
});

test("annual certificate uses Jan-Dec, marking current year as partial",()=>{
  const full=certificatePeriodRange("annual","2025","2026-11-19");
  assert.deepEqual([full.from,full.through,full.partial],["2025-01-01","2025-12-31",false]);
  assert.match(full.label,/Annual Performance/);
  const ytd=certificatePeriodRange("annual","2026","2026-11-19");
  assert.deepEqual([ytd.from,ytd.through,ytd.partial],["2026-01-01","2026-11-19",true]);
});

test("future and malformed months/years are rejected",()=>{
  for(const [kind,period] of [["monthly","2026-12"],["annual","2027"],["monthly","2026-00"],["annual","20/6"],["weekly","2026-11"]]){
    assert.throws(()=>certificatePeriodRange(kind,period,"2026-11-19"));
  }
  assert.throws(()=>certificatePeriodRange("monthly","2026-11","2026-11-32"));
});
