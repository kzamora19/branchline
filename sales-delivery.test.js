const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("./sales-delivery.js");
const Demo = require("./demo-data.js");

test("delivery fees validate without becoming product sales", () => {
  D.validate("delivery", 500);
  D.validate("pickup", null);
  D.validate(null, null, true);
  for (const [method, fee] of [["pickup", 10], [null, 10], ["", null], ["other", null], ["delivery", 0], ["delivery", -1], ["delivery", NaN], ["delivery", Infinity], ["delivery", 1.001]]) {
    assert.throws(() => D.validate(method, fee));
  }
});

test("availability blocks unavailable quantities but permits retained serials and unchanged edits", () => {
  assert.equal(D.availability({ quantity: 0, serialized: false }, [], 1).blocked, true);
  assert.equal(D.availability({ quantity: 0, serialized: true }, [], 1).blocked, true);
  assert.equal(D.availability({ quantity: 0, serialized: true }, [{ serial: "LATE" }], 1).blocked, false);
  assert.match(D.availability({ quantity: 0, serialized: true }, [{ serial: "LATE" }], 1).warning, /late sale/);
  assert.equal(D.availability({ quantity: 1, serialized: false }, [], 2).blocked, true);
  assert.equal(D.availability({ quantity: 0, serialized: false }, [], 2, 2).blocked, false);
  assert.equal(D.availability({ quantity: 2, serialized: false }, [], 2).warning, "");
  assert.match(D.availability(null, [], 1).warning, /cannot be verified/);
});

test("DG monitoring counts invoices once, sums fees only, and separates unassigned source names", () => {
  const sales = [
    { id: "a", ps_id: "one", customer_name: "Customer A" },
    { id: "b", ps_id: "one", customer_name: "Customer B" },
    { id: "c", ps_id: "two" },
    { id: "d", ps_id: null, branch_id: "branch", ps_name: "Source Name" },
  ];
  const groups = D.monitoring(sales, [{ sale_id: "a", amount: "150.00" }, { sale_id: "b", amount: 250 }, { sale_id: "d", amount: 100 }, { sale_id: "outside", amount: 99999 }],
    [{ id: "one", full_name: "PS One" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, "PS One");
  assert.equal(groups[0].quantity, 2);
  assert.equal(groups[0].amount, 400);
  assert.equal(groups[0].sales[0].dg_amount, 150);
});

test("demo records, edits and removes DG independently and keeps fees scoped to accessible sales", async () => {
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const demo = Demo.create({ storage, catalog: Demo.sampleCatalog(), today: "2026-11-03" });
  const data = async query => { const result = await query; assert.equal(result.error, null, result.error?.message); return result.data; };
  const branch = demo.profile.branch_id;
  demo.setRole("admin");
  await data(demo.client.rpc("import_inventory", { p_branch: branch, p_reported_at: new Date().toISOString(), p_files: "fictional",
    p_items: [{ barcode: "990099", description: "TCL TEST UNIT", brand: "TCL", category: "TV", quantity: 3, serialized: false, serials: [] }] }));
  await data(demo.client.rpc("classify_inventory_product", { p_branch: branch, p_barcode: "00990099", p_brand: "TCL", p_category: "TV" }));
  demo.setRole("ps");
  const params = { p_customer_name: "Customer", p_invoice_number: "DG-TEST", p_sold_on: "2026-11-03", p_payment_mode: "Cash",
    p_city: "City", p_barangay: "Barangay", p_lines: [{ barcode: "00990099", quantity: 1, selling_price: 100, srp: 100 }],
    p_serials: [], p_fulfillment_method: "delivery", p_dg_amount: 200 };
  const id = await data(demo.client.rpc("save_sale_with_delivery", params));
  assert.equal((await data(demo.client.from("sale_delivery_guaranties"))).find(row => row.sale_id === id).amount, 200);
  assert.equal((await data(demo.client.from("sale_lines"))).filter(row => row.sale_id === id).reduce((sum, row) => sum + row.quantity * row.selling_price, 0), 100);
  const invalid = await demo.client.rpc("save_sale_with_delivery", { ...params, p_sale_id: id, p_fulfillment_method: "pickup" });
  assert.match(invalid.error.message, /Delivery sales only/);
  await data(demo.client.rpc("save_sale_with_delivery", { ...params, p_sale_id: id, p_fulfillment_method: "pickup", p_dg_amount: null }));
  assert.equal((await data(demo.client.from("sale_delivery_guaranties"))).some(row => row.sale_id === id), false);
  assert.equal((await data(demo.client.from("sale_edit_history"))).find(row => row.sale_id === id).previous_values.delivery_guarranty_amount, 200);
  demo.setRole("inventory_controller");
  assert.equal((await data(demo.client.from("sale_delivery_guaranties"))).length, 0);
});

test("frontend exposes monitoring only to managers, and caches the shared module", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
  assert.match(source, /record-sale-floating/);
  assert.match(source, /function deliveryMonitoringPanel[\s\S]*?\["manager", "district_manager", "admin"\]/);
  assert.match(source, /data-delivery-person/);
  assert.match(source, /Available: \$\{stock.quantity\} · current inventory/);
  assert.match(source, /aria-label="Item availability"/);
  assert.match(source, /client.rpc\("save_sale_with_delivery"/);
  assert.match(fs.readFileSync(path.join(__dirname, "sw.js"), "utf8"), /"\.\/sales-delivery.js"/);
});
