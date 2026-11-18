const assert = require("node:assert/strict");
const { psCards, actionableAlerts, productSnapshot } = require("./management-insights.js");

const facts = [
  { psId: "p", branchId: "b", saleId: "s1", date: "2026-11-17", amount: 250, barcode: "00042", quantity: 1 },
  { psId: "p", branchId: "b", saleId: "s1", date: "2026-11-17", amount: 150, barcode: "00042", quantity: 2 },
  { psId: "p", branchId: "b", saleId: "s2", date: "2026-11-18", amount: 100, barcode: "00042", quantity: 1 },
  { psId: "other", branchId: "b", saleId: "s3", date: "2026-11-18", amount: 999, barcode: "00042", quantity: 9 },
];
const cards = psCards({
  profiles: [{ id: "p", branch_id: "b", full_name: "A", active: true }, { id: "other", branch_id: "b", full_name: "B", active: true }],
  facts,
  assisted: [{ ps_id: "p", branch_id: "b", counted_on: "2026-11-17", clients_assisted: 5 }],
  targetsByBranch: { b: 2000 },
  from: "2026-11-01", through: "2026-11-19", expectedFraction: 0.7, remainingDays: 10,
});
const a = cards.find(c => c.id === "p");
assert.equal(a.sales, 500);
assert.equal(a.target, 1000); // Equal share of branch goal, not a claimed individual saved target.
assert.equal(a.transactions, 2); // Duplicate line items do not double count.
assert.equal(a.averageTransaction, 250);
assert.equal(a.conversion, 0.2); // Only s1 on recorded assistance day / 5.
assert.equal(a.dailyRequired, 50);
assert.equal(a.pace, "BEHIND");
const noAssistance = psCards({profiles:[{id:"p",branch_id:"b"}],facts,
  from:"2026-11-01",through:"2026-11-19",remainingDays:0})[0];
assert.equal(noAssistance.conversion, null);
assert.equal(noAssistance.dailyRequired, null);
const alerts = actionableAlerts({
  cards, expectedFraction:0.7, today:"2026-11-19",
  stock:[{branch_id:"b",barcode:"00042",quantity:0}],
  sales:[{salesperson_code:""},{salesperson_code:"ABC"}]
});
assert.ok(alerts.some(x=>x.code==="PS_PACE:p"));
assert.ok(alerts.some(x=>x.code==="STOCK:b:00042"));
assert.ok(alerts.some(x=>x.code==="MISSING_SALES_CODES"));
const snapshot = productSnapshot({
  catalog:[{branch_id:"b",barcode:"00042",model_description:"Product",brand:"Brand"}],
  stock:[{branch_id:"b",barcode:"00042",quantity:7}],
  facts,branchIds:new Set(["b"]), today:"2026-11-19"
});
assert.equal(snapshot.length,1);
assert.equal(snapshot[0].barcode,"00042");
assert.equal(snapshot[0].units_30d,13); // Branch scope includes both Product Specialists.
assert.equal(snapshot[0].available_units,7);
console.log("PASS: management metrics, advisory alerts, stock snapshot");
