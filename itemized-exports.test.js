"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./analytics.js");
const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

function fixture() {
  const sale = { id: "s", branch_id: "b", ps_id: "ps", ps_name: "Imported Name", salesperson_code: "001937", invoice_number: "INV", customer_name: "Fixture", sold_on: "2026-11-02" };
  const lines = [
    { id: "a", sale_id: "s", barcode: "0001", brand: "TCL", model_description: "First", quantity: 2, selling_price: 100, srp: 150 },
    { id: "b", sale_id: "s", barcode: "0001", brand: "TCL", model_description: "Second", quantity: 2, selling_price: 200, srp: 250 },
    { id: "c", sale_id: "s", barcode: "0002", brand: "LG", model_description: "No serial", quantity: 3, selling_price: 50, srp: null },
  ];
  const serials = ["S-001", "S-002", "S-003"];
  const sheets = [];
  const ctx = vm.createContext({
    liveData: { profiles: [{ id: "ps", role: "ps", full_name: "Linked PS", salesperson_code: "CHANGED", branch_id: "b" }],
      branches: [{ id: "b", name: "One" }], sales: [sale], brandSales: [] },
    currentProfile: { id: "ps", role: "ps" }, ui: { salesBasis: "price" }, salesLogExport: new Set(["s"]),
    window: { BranchlineAnalytics: A, XLSX: { utils: {
      book_new: () => ({}), aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (_book, sheet, name) => sheets.push({ name, rows: sheet.rows }),
    }, writeFile: () => {} } },
    linesForSale: () => lines, serialsFor: (_id, barcode) => barcode === "0001" ? serials : [],
    visibleSales: () => [sale], branchName: () => "One", branchDistrictName: () => "District",
    localISODate: () => "2026-11-04", fulfillmentLabel: () => "Pickup",
    addTo: (map, key, amount) => map.set(key, (map.get(key) || 0) + amount),
    salesBasisNote: () => "SRP", Blob, csvText: rows => JSON.stringify(rows), downloadFile: (_name, blob) => sheets.push({ blob }),
  });
  vm.runInContext(section("  function exportPsIdentity(", "  async function fetchExportBrandLog("), ctx);
  vm.runInContext(section("  function psNameOf(", "  // Pop-up with one Product Specialist"), ctx);
  return { ctx, sale, lines, serials, sheets };
}

test("itemization allocates each serial once across repeated barcodes and preserves unnumbered quantity", () => {
  const { ctx, sale, lines } = fixture();
  ctx.entries = lines.map(line => ({ sale, line }));
  const units = vm.runInContext("itemizedSaleLines(entries)", ctx);
  assert.deepEqual(Array.from(units, row => [row.line.id, row.serial, row.line.quantity]), [
    ["a", "S-001", 1], ["a", "S-002", 1], ["b", "S-003", 1], ["b", "", 1], ["c", "", 3],
  ]);
  assert.equal(units.reduce((sum, row) => sum + row.line.quantity, 0), 7);
  assert.equal(units.reduce((sum, row) => sum + A.salesLineAmount(row.line, "price"), 0), 750);
  ctx.entries = [{ sale, line: lines[1] }];
  assert.deepEqual(Array.from(vm.runInContext("itemizedSaleLines(entries)", ctx), row => row.serial), ["S-003", ""]);
  assert.equal(lines[0].quantity, 2);
});

test("sales download repeats transaction fields, exports serials separately, and reconciles price/SRP totals", () => {
  for (const [basis, total] of [["price", 750], ["srp", 950]]) {
    const { ctx, sheets } = fixture();
    ctx.ui.salesBasis = basis;
    vm.runInContext("exportSales()", ctx);
    const rows = sheets.find(sheet => sheet.name === "My sales").rows;
    const at = label => rows[0].indexOf(label);
    assert.equal(rows.length, 6);
    assert.equal(rows.slice(1).reduce((sum, row) => sum + row[at("Amount")], 0), total);
    assert.deepEqual(Array.from(rows.slice(1), row => row[at("Serial numbers")]), ["S-001", "S-002", "S-003", "", ""]);
    assert.ok(rows.slice(1).every(row => row[at("Invoice")] === "INV" && row[at("Sales code")] === "001937" && row[at("PS name")] === "Linked PS"));
    assert.equal(rows.slice(1).reduce((sum, row) => sum + row[at("Qty")], 0), 7);
    assert.ok(sheets.every(sheet => sheet.rows[0].includes("Sales code") && sheet.rows[0].includes("PS name")));
  }
});

test("all worksheet and CSV exports include identity columns; unattributed rows remain blank", async () => {
  const { ctx, sheets } = fixture();
  ctx.input = [
    { name: "Summary", rows: [["Branch", "Total"], ["One", 500]] },
    { name: "Clients", rows: [["PS ID", "Clients assisted"], ["ps", 10]] },
    { name: "People", rows: [["Name", "Role", "Salesperson Code"], ["Linked PS", "ps", "001937"]] },
  ];
  vm.runInContext('exportWorkbook(input, "fixture", true)', ctx);
  for (const sheet of sheets) assert.ok(sheet.rows[0].includes("PS name") && sheet.rows[0].some(label => /^(Sales code|Salesperson Code)$/.test(label)));
  assert.deepEqual(Array.from(sheets.find(sheet => sheet.name === "Summary").rows[1]).slice(-2), ["", ""]);
  assert.deepEqual(Array.from(sheets.find(sheet => sheet.name === "Clients").rows[1]).slice(-2), ["CHANGED", "Linked PS"]);
  ctx.window.XLSX = null;
  vm.runInContext('exportWorkbook([input[0]], "fixture")', ctx);
  const csv = JSON.parse(await sheets.at(-1).blob.text());
  assert.deepEqual(csv[0].slice(-2), ["Sales code", "PS name"]);
  assert.deepEqual(csv[1].slice(-2), ["", ""]);
});

test("multiple invoices are exported once each rather than multiplying all detail rows", () => {
  const { ctx, sale, sheets } = fixture();
  ctx.currentProfile.role = "manager";
  ctx.visibleSales = () => [sale, { ...sale, id: "second", invoice_number: "SECOND" }];
  ctx.salesLogExport = null;
  ctx.deliveryExport = () => ({ name: "Delivery", rows: [["Total"], [0]] });
  vm.runInContext("exportSales()", ctx);
  const rows = sheets.find(sheet => sheet.name === "Sales").rows;
  assert.equal(rows.length, 11);
  assert.equal(rows.slice(1).filter(row => row[1] === "INV").length, 5);
  assert.equal(rows.slice(1).filter(row => row[1] === "SECOND").length, 5);
});

test("imported codes and unresolved names are retained; ambiguous names never borrow another PS code", () => {
  const { ctx } = fixture();
  ctx.record = { ps_id: null, ps_name: "Unlinked Imported PS", salesperson_code: "0008", branch_id: "b" };
  assert.deepEqual(Array.from(vm.runInContext("exportPsIdentity(record)", ctx)), ["0008", "Unlinked Imported PS"]);
  ctx.liveData.profiles.push({ id: "duplicate", full_name: "Linked PS", role: "ps", salesperson_code: "OTHER", branch_id: "b" });
  ctx.record = { ps_name: "Linked PS", branch_id: "b" };
  assert.deepEqual(Array.from(vm.runInContext("exportPsIdentity(record)", ctx)), ["", "Linked PS"]);
});

test("brand-log sheets itemize serials and identity but never export peer prices or customer details", () => {
  const { ctx } = fixture();
  ctx.rows = [{ invoice_number: "PEER", ps_name: "Peer", salesperson_code: "0007", barcode: "0003",
    quantity: 3, serial_numbers: ["A", "B"], selling_price: 999, customer_name: "Hidden" }];
  const result = vm.runInContext("brandLogExportSheet(rows)", ctx);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(Array.from(result.rows.slice(1), row => row[9]), ["A", "B", ""]);
  assert.ok(result.rows.slice(1).every(row => row[7] === 1 && row[10] === "0007" && row[11] === "Peer"));
  assert.doesNotMatch(JSON.stringify(result), /999|Hidden|selling_price|customer_name/);
});

test("legacy excess or unavailable serials export blank without losing quantities", () => {
  const { ctx, lines, serials, sale } = fixture();
  ctx.entries = [{ sale, line: lines[0] }];
  serials.push("4", "5");
  assert.deepEqual(Array.from(vm.runInContext("itemizedSaleLines(entries)", ctx),row=>[row.serial,row.line.quantity]),[["",2]]);
  ctx.liveData.exportWarnings = ["Serial numbers"];
  assert.deepEqual(Array.from(vm.runInContext("itemizedSaleLines(entries)", ctx),row=>[row.serial,row.line.quantity]),[["",2]]);
  lines[0].quantity=0;
  assert.throws(() => vm.runInContext("itemizedSaleLines(entries)", ctx), /product quantity is invalid/);
  ctx.liveData.brandSalesError = "Brand log unavailable";
  assert.throws(() => vm.runInContext("exportSales()", ctx), /Brand log unavailable/);
});

test("historical returns retain signed quantities and amounts with blank or recorded serials", () => {
  const {ctx,lines,sale,serials}=fixture();
  lines[0].quantity=-2;lines[1].quantity=-2;
  ctx.entries=lines.slice(0,2).map(line=>({sale,line}));
  let rows=vm.runInContext("itemizedSaleLines(entries)",ctx);
  assert.deepEqual(Array.from(rows,row=>[row.serial,row.line.quantity]),[["S-001",-1],["S-002",-1],["S-003",-1],["",-1]]);
  assert.equal(rows.reduce((sum,row)=>sum+A.salesLineAmount(row.line,"price"),0),-600);
  serials.length=0;
  rows=vm.runInContext("itemizedSaleLines(entries)",ctx);
  assert.deepEqual(Array.from(rows,row=>[row.serial,row.line.quantity]),[["",-2],["",-2]]);
  ctx.rows=[{invoice_number:"00025392",quantity:-1,serial_numbers:[]}];
  const sheet=vm.runInContext("brandLogExportSheet(rows)",ctx);
  assert.equal(sheet.rows[1][7],-1);assert.equal(sheet.rows[1][9],"");
  ctx.rows[0].serial_numbers=["OLD","EXCESS"];
  const excess=vm.runInContext("brandLogExportSheet(rows)",ctx);
  assert.equal(excess.rows.length,2);assert.equal(excess.rows[1][7],-1);assert.equal(excess.rows[1][9],"");
});

test("invoice 00025392-style return downloads with blank serial and negative 17330 total",()=>{
  const {ctx,lines,sale,serials,sheets}=fixture();
  sale.invoice_number="00025392";
  lines.splice(1);
  Object.assign(lines[0],{barcode:"00058076",quantity:-1,selling_price:17330,srp:17330});
  serials.length=0;
  ctx.currentProfile.role="manager";
  ctx.deliveryExport=()=>({name:"Delivery",rows:[["Total"],[0]]});
  vm.runInContext("exportSales()",ctx);
  const rows=sheets.find(sheet=>sheet.name==="Sales").rows;
  const at=label=>rows[0].indexOf(label);
  assert.equal(rows.length,2);
  assert.equal(rows[1][at("Invoice")],"00025392");
  assert.equal(rows[1][at("Serial numbers")],"");
  assert.equal(rows[1][at("Qty")],-1);
  assert.equal(rows[1][at("Amount")],-17330);
});
