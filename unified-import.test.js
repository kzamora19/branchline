const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sales = require("./sales-history.js");
const daily = require("./daily-history.js");
const Demo = require("./demo-data.js");
const engine = import("./unified-import.mjs");
const apis = { sales, daily, inventory: require("./inventory.js") };
const branches = [{ id: "one", name: "Santiago", code: "STG" }, { id: "two", name: "Tuguegarao", code: "TUG" }];
const options = overrides => ({ branches, operations: ["catalog"], today: "2026-11-02", asOf: "2026-11-02", ...overrides });
const catalogHeader = ["Barcode", "Description", "Brand", "Category", "Subcategory", "SRP"];
const salesHeader = ["divisioncode", "trantype", "trandate", "invoiceno", "salespersonname", "itemcode", "BRAND", "itemname", "SRP", "NET", "qty", "TOTAL NET", "salescategoryname", "acctname", "MAIN CATEG", "SUB CATEGORY", "salespersoncode"];
const saleRow = overrides => Object.assign(["STG", "SALES", "16/01/2026", "INV", "Source Name", "00000101", "TCL", "TCL TV", 100, 90, 1, 90, "WALK-IN SALES", "Customer", "TV", "LED", "003911"], overrides);
async function sheet(rows, name = "Data", file = "products.xlsx", config = {}, id = "0") {
  const { inspectWorkbook } = await engine;
  return inspectWorkbook({ SheetNames: [name], Sheets: { [name]: { rows } } }, file, id,
    { utils: { sheet_to_json: value => value.rows } }).map(item => ({ ...item, config: { ...item.config, ...config } }))[0];
}
async function prepare(sheets, config) { return (await engine).prepareImport(sheets, options(config), apis); }

test("one intake detects memo, kiosk, forecast, serials, wide inventory, sales and monthly monitoring", async () => {
  const fixtures = [
    [[["BRAND", "CATEGORY", "BARCODE", "MODEL", "SRP"], ["TCL", "TV", "101", "X", 100]], "memo.xlsx", "Data", "memo"],
    [[["BRAND", "CATEGORY", "BARCODE", "MODEL", "SRP"]], "MemoListKiosk.xlsx", "Data", "memo"],
    [[["Item Category", "Sub Category", "item Code", "Item Name", "SRP"]], "forecast.xlsx", "Data", "forecast"],
    [[["Item Code", "Item Name", "Loc Code", "serial No", "tran Date"]], "serials.xlsx", "Data", "serials"],
    [[["Item Code", "Item Name", "STG", "TUG", "Total"]], "stock.xlsx", "Data", "inventory"],
    [[salesHeader, saleRow()], "sales.xlsx", "Data", "reference"],
    [[["Date", "FT TY", "FT LY", "# of INV. TY", "# of INV. LY", "TOTAL TY", "TOTAL LY"]], "monitoring.xlsx", "January", "daily"],
  ];
  for (const [rows, file, name, role] of fixtures) assert.equal((await sheet(rows, name, file)).config.role, role);
});

test("barcode consolidation uses memo SRP, most complete description, and retains explicit zero", async () => {
  const forecast = await sheet([catalogHeader, ["101", "TCL TV COMPLETE MODEL X", "TCL", "TV", "LED", 100], ["102", "TCL OTHER", "TCL", "TV", "", 0]]);
  const memo = await sheet([["BRAND", "CATEGORY", "BARCODE", "MODEL", "SRP"], ["TCL", "TV", "00000101", "X", 120]], "Memo", "memo.xlsx",
    { validFrom: "2026-11-01", validTo: "2026-11-30", memoNumber: "PMP-001" }, "1");
  const result = await prepare([forecast, memo]);
  assert.equal(result.valid, true);
  assert.equal(result.catalog.length, 2);
  assert.equal(result.catalog[0].barcode, "00000101");
  assert.equal(result.catalog[0].srp, 120);
  assert.equal(result.catalog[0].description, "TCL TV COMPLETE MODEL X");
  assert.equal(result.catalog[1].srp, 0);
});

test("missing catalog SRP is null; conflicting SRP is blank and blocks writes", async () => {
  const blank = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", ""]]);
  const result = await prepare([blank]);
  assert.equal(result.catalog[0].srp, null);
  assert.equal(result.valid, true);
  const conflict = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", 10], ["101", "TCL TV", "TCL", "TV", "", 20]]);
  const invalid = await prepare([conflict]);
  assert.equal(invalid.catalog[0].srp, null);
  assert.equal(invalid.valid, false);
  const { createImportJobs } = await engine;
  assert.throws(() => createImportJobs(invalid, () => "uuid"), /blocking/);
});

test("every approved brand alias is canonical in import review and jobs without rewriting original evidence", async () => {
  const { BRAND_REFERENCE } = await import("./import-engine/brand-reference.mjs");
  const aliases=Object.entries(BRAND_REFERENCE.aliases).filter(([,value])=>typeof value==="string");
  const rows=[catalogHeader,...aliases.map(([alias,canonical],index)=>[String(101+index),`${canonical} Fixture`,alias,"CATEGORY","",index===0 ? 0 : ""])];
  const original=JSON.stringify(rows);
  const source=await sheet(rows);
  const result=await prepare([source]);
  assert.equal(result.valid,true);
  assert.deepEqual(result.catalog.map(row=>row.brand),aliases.map(([,canonical])=>canonical));
  assert.deepEqual(result.catalog.map(row=>row.srp),[0,...aliases.slice(1).map(()=>null)]);
  assert.equal(JSON.stringify(rows),original);
  assert.equal(JSON.stringify(source.rows),original);
  const { createImportJobs }=await engine;
  const job=createImportJobs(result,()=>"fixture").find(row=>row.rpc==="import_unified_products");
  assert.deepEqual(job.params.p_items.map(row=>row.brand),aliases.map(([,canonical])=>canonical));
});

test("shortened multiword brands require exact full-name evidence and never guess ambiguous names", async () => {
  const { BRAND_REFERENCE } = await import("./import-engine/brand-reference.mjs");
  for (const [alias,canonicals] of Object.entries(BRAND_REFERENCE.aliases).filter(([,value])=>Array.isArray(value))) {
    for (const canonical of canonicals) {
      for (const description of [canonical,`${canonical} Fixture`]) {
        const source=await sheet([catalogHeader,["101",description,alias,"CATEGORY","",0]]);
        const result=await prepare([source]);
        assert.equal(result.valid,true);
        assert.equal(result.catalog[0].brand,canonical);
        assert.equal(source.rows[1][2],alias);
      }
    }
    for (const description of ["Unidentified model",`${canonicals[0]}X unrelated`]) {
      const invalid=await prepare([await sheet([catalogHeader,["101",description,alias,"CATEGORY","",0]])]);
      assert.equal(invalid.valid,false);
      assert.ok(invalid.issues.some(row=>row.issue==="BRAND_AMBIGUOUS" && row.barcode==="00000101"));
      const { createImportJobs }=await engine;
      assert.throws(()=>createImportJobs(invalid,()=>"fixture"),/blocking/);
    }
  }
});

test("sales-only imports use approved brand rules without changing source cells or historical amounts", async () => {
  const { BRAND_REFERENCE } = await import("./import-engine/brand-reference.mjs");
  for (const [alias,value] of Object.entries(BRAND_REFERENCE.aliases)) {
    const canonical=Array.isArray(value) ? value[0] : value;
    const source=await sheet([salesHeader,saleRow({7:`${canonical} Fixture`,6:alias})],"Sales","sales.xlsx");
    const original=JSON.stringify(source.rows);
    const result=await prepare([source],{operations:["sales"],divisionMap:{STG:"one"}});
    assert.equal(result.valid,true);
    const line=result.sales[0].sales[0].lines[0];
    assert.equal(line.brand,canonical);
    assert.equal(line.srp,100);
    assert.equal(line.price,90);
    assert.equal(line.qty,1);
    assert.equal(JSON.stringify(source.rows),original);
    if (Array.isArray(value)) {
      const invalid=await prepare([await sheet([salesHeader,saleRow({6:alias,7:"Unidentified model"})],"Sales","sales.xlsx")],
        {operations:["sales"],divisionMap:{STG:"one"}});
      assert.equal(invalid.valid,false);
      assert.ok(invalid.issues.some(row=>/confirmed full brand/.test(row.message)));
    }
  }
});

test("unknown sheets are blocking until explicitly excluded, and saved extractor workbooks are rejected", async () => {
  const unknown = await sheet([["Odd layout"], ["some data"]], "Summary", "source.xlsx");
  const good = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", 100]], "Products", "source.xlsx", {}, "1");
  assert.equal((await prepare([unknown, good])).valid, false);
  unknown.config.role = "skip";
  assert.equal((await prepare([unknown, good])).valid, true);
  const { inspectWorkbook } = await engine;
  assert.throws(() => inspectWorkbook({ SheetNames: ["Import Manifest"] }, "saved.xlsx", "x", {}), /original sources/);
});

test("sales history retains codes and sale-line SRP while offering flagged last-resort catalog SRP", async () => {
  const history = await sheet([salesHeader, saleRow()], "Sales", "sales.xlsx");
  const result = await prepare([history], { operations: ["catalog", "sales"], divisionMap: { STG: "one" } });
  assert.equal(result.valid, true);
  assert.equal(result.catalog[0].srp, 100);
  assert.ok(result.issues.some(item => item.issue === "HISTORICAL_SRP_FALLBACK"));
  assert.equal(result.inventory.length, 0);
  assert.equal(result.sales[0].sales[0].lines[0].srp, 100);
  assert.equal(result.sales[0].sales[0].salespersoncode, "003911");
  assert.deepEqual(result.salespeople[0].names, ["Source Name"]);
  assert.equal(result.salespeople[0].salespersoncode, "003911");
  assert.equal((await prepare([history], { operations: ["sales"] })).valid, false);
});

test("catalog SRP uses memo then forecast then other current sources before historical sales, including zero", async () => {
  const history = await sheet([salesHeader, saleRow({ 8: 999 })], "Sales", "sales.xlsx", {}, "history");
  const current = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", 200]], "Products", "products.xlsx", {}, "current");
  const forecast = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", 300]], "Forecast", "forecast.xlsx",
    { role: "forecast", forecastYear: 2026 }, "forecast");
  const memo = await sheet([["BRAND", "CATEGORY", "BARCODE", "MODEL", "SRP"], ["TCL", "TV", "101", "TV", 0]],
    "Memo", "memo.xlsx", { validFrom: "2026-11-01", validTo: "2026-11-30", memoNumber: "TCL01-001" }, "memo");
  for (const [sources, expected] of [[[history], 999], [[history, current], 200],
    [[history, current, forecast], 300], [[history, current, forecast, memo], 0]]) {
    const result = await prepare(sources);
    assert.equal(result.valid, true);
    assert.equal(result.catalog[0].srp, expected);
    assert.equal(result.inventory.length, 0);
    assert.equal(result.issues.some(item => item.issue === "HISTORICAL_SRP_FALLBACK"), sources.length === 1);
  }
  memo.rows[1][4] = "";
  assert.equal((await prepare([memo, forecast, history])).catalog[0].srp, 300);
  memo.rows[1][4] = 500;
  memo.config.validFrom = "2026-12-01"; memo.config.validTo = "2026-12-31";
  assert.equal((await prepare([memo, forecast, history])).catalog[0].srp, 300);
});

test("disagreeing historical SRPs stay unresolved, and never override a known current price", async () => {
  const history = await sheet([salesHeader, saleRow(), saleRow({ 3: "OTHER", 8: 200 })], "Sales", "sales.xlsx");
  const conflict = await prepare([history]);
  assert.equal(conflict.valid, false);
  assert.equal(conflict.catalog[0].srp, null);
  assert.ok(conflict.issues.some(item => item.issue === "SRP_ORDER_UNRESOLVED"));
  const salesOnly = await prepare([history], { operations: ["sales"], divisionMap: { STG: "one" } });
  assert.equal(salesOnly.valid, true);
  assert.deepEqual(salesOnly.sales[0].sales.map(sale => sale.lines[0].srp), [100, 200]);
  const forecast = await sheet([catalogHeader, ["101", "TCL TV", "TCL", "TV", "", 0]], "Forecast", "forecast.xlsx",
    { role: "forecast", forecastYear: 2026 }, "1");
  const selected = await prepare([history, forecast]);
  assert.equal(selected.valid, true);
  assert.equal(selected.catalog[0].srp, 0);
});

test("the extraction engine still excludes historical SRP unless Branchline explicitly requests fallback", async () => {
  const { extractSheet } = await import("./import-engine/core.mjs");
  const history = await sheet([salesHeader, saleRow({ 8: 0 })], "Sales", "sales.xlsx");
  assert.equal(extractSheet(history, history.config).products[0].srp, null);
  const result = await prepare([history]);
  assert.equal(result.catalog[0].srp, 0);
  assert.equal(result.result.products[0].srp_basis, "HISTORICAL SALES");
  assert.ok(result.issues.some(item => item.issue === "HISTORICAL_SRP_FALLBACK"));
});

test("sales Excel dates default to the source date, legacy repair is explicit, and future dates block import", async () => {
  const serial = (Date.UTC(2026, 8, 12) - Date.UTC(1899, 11, 30)) / 86400000;
  const history = await sheet([salesHeader, saleRow({ 2: serial })], "Sales", "sales.xlsx");
  assert.equal(history.config.repairExcelDates, false);
  const config = { operations: ["sales"], divisionMap: { STG: "one" } };
  const result = await prepare([history], config);
  assert.equal(result.valid, true);
  assert.equal(result.sales[0].sales[0].sold_on, "2026-09-12");
  assert.equal(result.sales[0].dateFrom, "2026-09-12");
  assert.equal(result.sales[0].dateTo, "2026-09-12");
  assert.equal(result.sales[0].datesFixed, 0);
  assert.equal(result.sources[0].repair_excel_dates, false);
  history.config.repairExcelDates = true;
  const future = await prepare([history], config);
  assert.equal(future.valid, false);
  assert.ok(future.issues.some(item => /future sale date 2026-12-09/.test(item.message)));
  const legacy = await prepare([history], { ...config, today: "2026-12-31" });
  assert.equal(legacy.valid, true);
  assert.equal(legacy.sales[0].sales[0].sold_on, "2026-12-09");
  assert.equal(legacy.sources[0].repair_excel_dates, true);
  assert.deepEqual(result.sales[0].sales[0].lines, legacy.sales[0].sales[0].lines);
});

test("sales codes distinguish employees with the same name; ambiguous names are retained as a warning", async () => {
  const history = await sheet([salesHeader, saleRow(), saleRow({ 3: "INV2", 4: "Other Name" }), saleRow({ 3: "INV3", 16: "004000" })]);
  const result = await prepare([history], { operations: ["sales"], divisionMap: { STG: "one" } });
  assert.equal(result.valid, true);
  assert.equal(result.salespeople.length, 2);
  assert.equal(result.salespeople[0].names.length, 2);
  assert.ok(result.issues.some(item => item.issue === "SALESPERSON_NAMES"));
});

test("one salesperson code groups name variants on the same invoice without merging different people", async () => {
  const parsed = sales.parseSalesHistory([salesHeader, saleRow(), saleRow({ 4: "Alternate source name" }), saleRow({ 16: "004000" })]);
  assert.equal(parsed.sales.length, 2);
  assert.equal(parsed.sales[0].lines.length, 2);
  assert.deepEqual(parsed.sales[0].source_ps_names, ["Source Name", "Alternate source name"]);
  assert.equal(parsed.sales[0].salespersoncode, "003911");
  assert.equal(parsed.sales[1].salespersoncode, "004000");
});

test("invalid sales quantities/prices and overlapping invoices block the new route instead of rounding or skipping", async () => {
  for (const row of [saleRow({ 10: 1.5 }), saleRow({ 9: "bad" }), saleRow({ 2: "31/02/2026" }), saleRow({ 5: "" })]) {
    const result = await prepare([await sheet([salesHeader, row])], { operations: ["sales"], divisionMap: { STG: "one" } });
    assert.equal(result.valid, false);
  }
  const first = await sheet([salesHeader, saleRow()]);
  const second = await sheet([salesHeader, saleRow()], "Sales2", "other.xlsx", {}, "2");
  assert.equal((await prepare([first, second], { operations: ["sales"], divisionMap: { STG: "one" } })).valid, false);
});

test("Daily Monitoring stays branch/day keyed and requires year, cutoff and branch confirmation", async () => {
  const rows = [["Date", "FT TY", "FT LY", "# of INV. TY", "# of INV. LY", "TOTAL TY", "TOTAL LY"], [1, 2, 1, 1, 1, 90, 80], ["TOTAL"]];
  const source = await sheet(rows, "January", "2026-monitoring.xlsx", { branch: "one", cutoff: "2026-01-31" });
  const result = await prepare([source], { operations: ["daily"] });
  assert.equal(result.valid, true);
  assert.equal(result.daily[0].rows.length, 2);
  assert.equal(result.catalog.length, 0);
  source.config.cutoff = "2025-01-31";
  assert.equal((await prepare([source], { operations: ["daily"] })).valid, false);
  source.config.cutoff = "2026-01-31";
  assert.equal((await prepare([source, source], { operations: ["daily"] })).valid, false);
});

async function inventorySources() {
  const stamp = "2026-10-27T15:00:00+08:00";
  return [
    await sheet([["Item Code", "Item Name", "Santiago", "Tuguegarao", "Total"], ["101", "TCL TV", 1, 1, 2]],
      "Stock", "stock.xlsx", { complete: true, reportDate: stamp }, "0"),
    await sheet([["Item Code", "Item Name", "Loc Code", "serial No", "tran Date"],
      ["101", "TCL TV", "STG - Santiago", "SERIAL-A", "2026-01-01"],
      ["101", "TCL TV", "TUG - Tuguegarao", "SERIAL-B", "2026-01-02"]],
      "Serials", "serials.xlsx", { complete: true, reportDate: stamp }, "1"),
  ];
}
const inventoryOptions = { operations: ["inventory"], locationMap: { Santiago: "one", Tuguegarao: "two", "STG - Santiago": "one", "TUG - Tuguegarao": "two" } };

test("inventory location mapping cannot relabel Santiago reports as another branch",async()=>{
  const quantities=await sheet([["Item Code","Item Name","Santiago","Total"],["101","TCL TV",1,1]],"Stock","stock.xlsx",
    {complete:true,reportDate:"2026-11-02T08:00:00+08:00"});
  const units=await sheet([["Item Code","Item Name","Loc Code","serial No","tran Date"],
    ["101","TCL TV","STG - Santiago","SOURCE-SERIAL",46000]],"Serials","serials.xlsx",
    {complete:true,reportDate:"2026-11-02T08:00:00+08:00"},"1");
  const wrong=await prepare([quantities,units],{operations:["inventory"],locationMap:{Santiago:"two","STG - Santiago":"two"}});
  assert.equal(wrong.valid,false);
  assert.ok(wrong.issues.some(issue=>/does not match selected branch/.test(issue.message)));
  const correct=await prepare([quantities,units],inventoryOptions);
  assert.equal(correct.valid,true,JSON.stringify(correct.issues));
  assert.ok(correct.inventory[0].items.every(item=>item.source_location));
});
test("multi-location stock is split into explicitly mapped replacements without adding serial counts", async () => {
  const result = await prepare(await inventorySources(), inventoryOptions);
  assert.equal(result.valid, true, JSON.stringify(result.issues.filter(item => item.severity === "ERROR")));
  assert.equal(result.inventory.length, 2);
  for (const entry of result.inventory) {
    assert.equal(entry.items[0].quantity, 1);
    assert.equal(entry.items[0].serials.length, 1);
    assert.equal(entry.items[0].srp, null);
  }
});

test("inventory blocks missing mappings, partial coverage, missing received dates and inconsistent snapshot times", async () => {
  const inputs = await inventorySources();
  assert.equal((await prepare(inputs, { operations: ["inventory"] })).valid, false);
  inputs[0].config.complete = false;
  assert.equal((await prepare(inputs, inventoryOptions)).valid, false);
  inputs[0].config.complete = true;
  inputs[1].rows[1][4] = "";
  assert.equal((await prepare(inputs, inventoryOptions)).valid, false);
  inputs[1].rows[1][4] = "2026-01-01";
  inputs[1].config.reportDate = "2026-10-28T15:00:00+08:00";
  assert.equal((await prepare(inputs, inventoryOptions)).valid, false);
});

test("known serialized stock cannot be converted to nonserialized by an incomplete serial report", async () => {
  const inputs = await inventorySources();
  inputs[1].rows.splice(1, 1);
  const result = await prepare(inputs, { ...inventoryOptions, knownStock: [{ branch_id: "one", barcode: "00000101", serialized: true }] });
  assert.equal(result.valid, false);
});

test("new catalog items missing required database fields are flagged, not fabricated", async () => {
  const missing = await sheet([catalogHeader, ["101", "GENERIC MODEL", "", "", "", ""]]);
  assert.equal((await prepare([missing])).valid, false);
});

test("jobs preserve separate RPCs, stable batch IDs and sales-before-daily ordering", async () => {
  const { createImportJobs } = await engine;
  let id = 0;
  const jobs = createImportJobs({ valid: true, catalog: [{ barcode: "101", srp: null }],
    sales: [{ source: "sales", sales: [{ salespersoncode: "001" }] }],
    daily: [{ source: "daily", branch: "one", rows: [{}] }],
    inventory: [{ source: "stock", branch: "one", reportedAt: "date", items: [] }] }, () => String(++id));
  assert.deepEqual(jobs.map(job => job.rpc), ["import_unified_products", "import_unified_sales_history", "import_daily_history_with_payments", "import_unified_inventory"]);
  assert.equal(jobs[1].params.p_sales[0].salespersoncode, "001");
  assert.equal(jobs[0].params.p_items[0].srp, null);
  assert.throws(() => createImportJobs({ valid: false }, () => ""), /blocking/);
});

test("retry skips completed steps and retains the failed sales batch ID", async () => {
  const { executeImportJobs } = await engine;
  const jobs = [{ rpc: "import_unified_products", label: "catalog", status: "pending", params: {} },
    { rpc: "import_unified_sales_history", label: "sales", status: "pending", params: { p_batch: "stable" } }];
  const calls = [];
  await assert.rejects(executeImportJobs(jobs, async name => {
    calls.push(name);
    return name === "import_unified_products" ? { data: { products: 1 } } : { error: { code: "P0001", message: "Invalid branch" } };
  }), /Earlier completed steps remain saved/);
  assert.equal(jobs[0].status, "done");
  await executeImportJobs(jobs, async (name, params) => { calls.push(name); assert.equal(params.p_batch, "stable"); return { data: { sales: 1 } }; });
  assert.deepEqual(calls, ["import_unified_products", "import_unified_sales_history", "import_unified_sales_history"]);
});

test("lost inventory response blocks automatic replay; explicit SQL rollback can be retried", async () => {
  const { executeImportJobs } = await engine;
  const jobs = [{ rpc: "import_unified_inventory", label: "stock", status: "pending", params: {} }];
  await assert.rejects(executeImportJobs(jobs, async () => { throw new Error("Network lost"); }), /may have committed/);
  let called = false;
  await assert.rejects(executeImportJobs(jobs, async () => { called = true; }), /automatic retry is blocked/);
  assert.equal(called, false);
  jobs[0].status = "pending";
  await assert.rejects(executeImportJobs(jobs, async () => ({ error: { code: "57014", message: "timeout" } })), /timeout/);
  assert.equal(jobs[0].status, "pending");
  await executeImportJobs(jobs, async () => ({ data: "00000000-0000-0000-0000-000000000001" }));
  assert.equal(jobs[0].status, "done");
});

test("UI preflight refuses absent setup before consent or any import write", async () => {
  const source = fs.readFileSync(path.join(__dirname, "unified-import-ui.mjs"), "utf8");
  const start = source.indexOf("      form.unifiedSubmit = async () => {") + "      form.unifiedSubmit = async () => {".length;
  const end = source.indexOf("\n      };", start);
  const calls = [];
  const context = vm.createContext({
    reading: false, saving: false, preview: { valid: true, operations: ["catalog"] },
    form: { elements: { confirm: { checked: true } } },
    env: { checkPermission: () => calls.push("permission"), rpc: async name => {
      calls.push(name); return { error: { code: "PGRST202", message: "Missing setup" } };
    }, confirm: () => { calls.push("confirm"); return true; } },
  });
  vm.runInContext(`async function submit() {${source.slice(start, end)}}`, context);
  await assert.rejects(context.submit(), /No writes started/);
  assert.deepEqual(calls, ["permission", "unified_import_capabilities"]);
  assert.equal(context.saving, false);
  context.saving = true;
  await assert.rejects(context.submit(), /already running/);
  assert.equal(calls.length, 2);
});

test("UI preflight refuses stale review, withdrawn consent and changed permissions after awaiting setup", async () => {
  const source = fs.readFileSync(path.join(__dirname, "unified-import-ui.mjs"), "utf8");
  const start = source.indexOf("      form.unifiedSubmit = async () => {") + "      form.unifiedSubmit = async () => {".length;
  const end = source.indexOf("\n      };", start);
  for (const change of ["review", "consent", "permission"]) {
    let release, permissionChecks = 0, revoked = false;
    const calls = [];
    const context = vm.createContext({
      reading: false, saving: false, preview: { valid: true, operations: ["catalog"] },
      form: { elements: { confirm: { checked: true } } },
      env: {
        checkPermission: () => { permissionChecks++; if (revoked) throw new Error("Permission changed."); },
        rpc: name => { calls.push(name); return new Promise(resolve => { release = resolve; }); },
        confirm: () => { calls.push("confirm"); return true; },
      },
    });
    vm.runInContext(`async function submit() {${source.slice(start, end)}}`, context);
    const pending = context.submit();
    await assert.rejects(context.submit(), /already running/);
    if (change === "review") context.preview = null;
    if (change === "consent") context.form.elements.confirm.checked = false;
    if (change === "permission") revoked = true;
    release({ data: { version: 1 } });
    await assert.rejects(pending, change === "permission" ? /Permission changed/ : /Review settings changed/);
    assert.deepEqual(calls, ["unified_import_capabilities"]);
    assert.equal(permissionChecks, change === "permission" ? 2 : 1);
    assert.equal(context.saving, false);
  }
});

test("invalid RPC result shapes never mark jobs saved or replay uncertain inventory", async () => {
  const { executeImportJobs } = await engine;
  for (const rpc of ["import_unified_products", "import_unified_sales_history", "import_daily_history", "import_daily_history_with_payments", "import_unified_inventory"]) {
    for (const response of [null, { data: {} }, { data: "not-a-snapshot" }]) {
      const jobs = [{ rpc, label: "Fixture", params: {}, status: "pending" }];
      await assert.rejects(executeImportJobs(jobs, async () => response), /missing|invalid server result/);
      assert.equal(jobs[0].status, "uncertain");
      if (rpc === "import_unified_inventory") {
        await assert.rejects(executeImportJobs(jobs, async () => assert.fail("Uncertain inventory must not run again.")), /automatic retry is blocked/);
      }
    }
  }
});

test("review cannot publish a stale preview while files or settings change", async () => {
  const source = fs.readFileSync(path.join(__dirname, "unified-import-ui.mjs"), "utf8");
  const marker = 'form.querySelector("[data-unified-review]").addEventListener("click", async () => {';
  const start = source.indexOf(marker) + marker.length;
  const end = source.indexOf("\n      });", start);
  for (const change of ["file", "settings"]) {
    let release;
    const errors = [];
    const context = vm.createContext({
      reading: false, reviewing: false, locked: false, revision: 0, failures: new Map(),
      preview: null, status: { textContent: "" }, syncConfig: () => {},
      console: { error: (...args) => errors.push(args) },
      setTimeout: resolve => { release = resolve; },
      prepareImport: () => assert.fail("Changed input must not produce a preview."),
    });
    context.invalidate = () => { context.revision++; context.preview = null; };
    vm.runInContext(`async function review() {${source.slice(start, end)}}`, context);
    const pending = context.review();
    if (change === "file") context.reading = true;
    else context.revision++;
    release();
    await pending;
    assert.match(context.status.textContent, /Files or settings changed/);
    assert.equal(context.preview, null);
    assert.equal(context.reviewing, false);
    assert.equal(errors.length, 1);
  }
});

test("unified demo catalog preserves blank SRP, retains explicit zero and keeps new blanks pending", async () => {
  const storage = new Map();
  const demo = Demo.create({ storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, catalog: Demo.sampleCatalog() });
  demo.setRole("admin");
  const product = Demo.sampleCatalog()[0];
  const call = async (name, params) => {
    const response = await demo.client.rpc(name, params);
    assert.equal(response.error, null, response.error?.message);
    return response.data;
  };
  await call("import_unified_products", { p_items: [{ barcode: product.barcode, description: product.model_description, brand: product.brand, srp: null }] });
  let rows = (await demo.client.from("products")).data.filter(row => row.barcode === product.barcode);
  assert.ok(rows.every(row => row.srp === product.srp));
  await call("import_unified_products", { p_items: [{ barcode: product.barcode, description: product.model_description, brand: product.brand, srp: 0 }] });
  rows = (await demo.client.from("products")).data.filter(row => row.barcode === product.barcode);
  assert.ok(rows.every(row => row.srp === 0));
  await call("import_unified_products", { p_items: [{ barcode: "NEW", description: "TCL MODEL", brand: "TCL", srp: null }] });
  assert.ok((await demo.client.from("products")).data.filter(row => row.barcode === "NEW").every(row => row.srp === null));
});

test("demo execution persists unknown salesperson codes without a name guess and prevents daily double counting", async () => {
  const storage = new Map();
  const demo = Demo.create({ storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, catalog: Demo.sampleCatalog() });
  demo.setRole("admin");
  const person = (await demo.client.from("profiles")).data.find(row => row.role === "ps" && row.active);
  const product = Demo.sampleCatalog()[0];
  const params = { p_batch: "unified-sales", p_label: "Fixture", p_file: "sales.xlsx", p_sales: [{
    branch_id: person.branch_id, invoice: "UNIFIED-CODE", sold_on: "2001-01-16", ps_name: person.full_name,
    salespersoncode: "00009999", customer: "Fictional Customer", payment_mode: "Cash",
    lines: [{ barcode: product.barcode, description: product.model_description, brand: product.brand, price: 90, qty: 1, srp: 100 }],
  }] };
  let response = await demo.client.rpc("import_unified_sales_history", params);
  assert.equal(response.error, null);
  const sale = (await demo.client.from("sales")).data.find(row => row.invoice_number === "UNIFIED-CODE");
  assert.equal(sale.salesperson_code, "00009999");
  assert.equal(sale.ps_id, null);
  response = await demo.client.rpc("import_unified_sales_history", params);
  assert.equal(response.data.skipped_existing, 1);
  response = await demo.client.rpc("import_daily_history", { p_batch: "unified-daily", p_label: "Fixture", p_file: "daily.xlsx", p_branch: person.branch_id,
    p_rows: [{ day: "2001-01-16", sales: 90, transactions: 1, walkins: 1, remarks: "" }] });
  assert.equal(response.error, null);
  assert.equal(response.data.days, 0);
  assert.equal(response.data.skipped_existing, 1);
});

test("local SQL migration preserves legacy APIs and gates new APIs with role checks", () => {
  const sql = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261119000000_unified_import.sql"), "utf8");
  assert.match(sql, /srp=coalesce\(excluded.srp,public.products.srp\)/);
  assert.match(sql, /s.import_batch_id=p_batch/);
  assert.match(sql, /salesperson_code=btrim/);
  assert.match(sql, /role<>'admin'/);
  assert.match(sql, /Unsupported inventory function signature/);
  assert.doesNotMatch(sql, /create or replace function public\.import_products\(/);
});

test("deployment copies and offline cache include every new module", () => {
  for (const name of ["auth-app.js", "sales-history.js", "demo-data.js", "inventory-demo.js", "unified-import.mjs", "unified-import-ui.mjs", "import-engine\\core.mjs", "import-engine\\brand-reference.mjs", "sw.js"]) {
    assert.equal(fs.readFileSync(path.join(__dirname, name), "utf8"), fs.readFileSync(path.join(__dirname, "github-upload", name), "utf8"), name);
  }
  const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
  for (const name of ["unified-import.mjs", "unified-import-ui.mjs", "import-engine/core.mjs", "import-engine/brand-reference.mjs"]) assert.ok(sw.includes(`"./${name}"`), name);
});
