const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Demo = require("./demo-data.js");

const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
function section(start, end) {
  const index = source.indexOf(start);
  return source.slice(index, source.indexOf(end, index));
}
function context(extra = {}) {
  const result = vm.createContext({
    ui: { salesBasis: "price" },
    escapeHTML: value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    ...extra,
  });
  vm.runInContext(section("  function salesBasisNote(", "  function filterBar("), result);
  vm.runInContext(section("  function exportButton(", "  function psNameOf("), result);
  return result;
}

test("export controls are accessible icon-only buttons and chart data is safely encoded", () => {
  const ctx = context();
  const button = vm.runInContext('exportButton(\'data-export-table="sales"\', "Download sales")', ctx);
  assert.match(button, /title="Download sales" aria-label="Download sales"/);
  assert.match(button, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(button, />Export</);
  const chart = vm.runInContext('chartExport(\'Brand "A"\', [["Brand", "Value"], ["<private>", 20]])', ctx);
  assert.match(chart, /data-chart-download="Brand &quot;A&quot;"/);
  assert.match(chart, /&lt;private&gt;/);
  assert.match(chart, /as PNG image/);
  assert.doesNotMatch(chart, /Excel/);
  assert.doesNotMatch(chart, /<private>/);
  assert.equal((source.match(/>Export<\/button>/g) || []).length, 0);
  assert.match(source, /data-export-all>Export All<\/button>/);
});

test("workbook worksheet labels are valid, case-insensitively unique and <=31 characters", () => {
  const books = [];
  const ctx = context({
    window: { XLSX: { utils: {
      book_new: () => ({ names: [] }), aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (book, sheet, name) => { book.names.push(name); },
    }, writeFile: (book, filename) => books.push({ book, filename }) } },
  });
  ctx.sheets = ["A".repeat(60), "a".repeat(60), "A".repeat(60), "Bad:/?*[]name", "''"].map(name => ({ name, rows: [["Header"], [1]] }));
  vm.runInContext('exportWorkbook(sheets, "all")', ctx);
  const names = books[0].book.names;
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, 5);
  assert.ok(names.every(name => name.length > 0 && name.length <= 31 && !/[\\/?*[\]:]/.test(name)));
  assert.equal(books[0].filename, "all.xlsx");
});

test("Export All worksheet index keeps complete report names after truncation and deduplication", () => {
  const worksheets = [];
  const ctx = context({
    window: { XLSX: { utils: {
      book_new: () => ({}), aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (book, sheet, name) => worksheets.push({ name, rows: sheet.rows }),
    }, writeFile: () => {} } },
  });
  const labels = ["Worksheet index", "2026-10 " + "Detailed report ".repeat(4), "2026-10 " + "Detailed report ".repeat(4)];
  ctx.sheets = labels.map(name => ({ name, rows: [["Header"]] }));
  vm.runInContext('exportWorkbook(sheets, "all", true)', ctx);
  assert.equal(new Set(worksheets.map(sheet => sheet.name.toLowerCase())).size, 4);
  const index = worksheets.find(sheet => sheet.name === "Worksheet index");
  assert.deepEqual(Array.from(index.rows.slice(1), row => row[1]), labels);
  assert.deepEqual(Array.from(index.rows.slice(1), row => row[0]), worksheets.slice(0, -1).map(sheet => sheet.name));
});

test("chart PNG generation does not download data after an account switch and releases its image URL", async () => {
  const profile = { id: "own" };
  const revoked = [];
  const ctx = context({
    currentProfile: profile, client: {}, localISODate: () => "2026-10-21", Blob,
    URL: { createObjectURL: () => "blob:chart", revokeObjectURL: url => revoked.push(url) },
    Image: class { async decode() { profile.id = "other"; } },
    document: { createElement: () => ({
      getContext: () => ({ fillRect() {}, drawImage() {} }),
      toBlob: callback => callback(new Blob(["image"])),
    }) },
  });
  ctx.button = {
    dataset: { chartDownload: "Target progress", chartRows: '[["Metric","Value"],["Sales",100]]' },
    closest: () => ({ querySelector: () => null, querySelectorAll: () => [] }),
  };
  vm.runInContext('exportWorkbook = () => { throw new Error("Must not download"); };', ctx);
  await assert.rejects(vm.runInContext("downloadChart(button)", ctx), /account changed/);
  assert.deepEqual(revoked, ["blob:chart"]);
});

test("chart icon downloads exactly one PNG with pie labels, complete legends and notes, without Excel", async () => {
  const downloads = [];
  let imageSvg;
  const original = {
    classList: { contains: () => false },
    querySelectorAll: () => [],
    cloneNode: () => ({
      setAttribute() {}, querySelectorAll: () => [], style: {},
    }),
  };
  const card = {
    querySelector: selector => selector.includes("svg") ? original : { textContent: "October 2026" },
    querySelectorAll: selector => selector === ".pie-legend li" ? [{
      querySelector: tag => tag === "span" ? { textContent: "Sold by other PS" }
        : tag === "strong" ? { textContent: "20.00% · amount hidden" } : {},
    }] : [{ textContent: "Branch-wide amounts are hidden." }],
  };
  const ctx = context({
    currentProfile: { id: "own" }, client: {}, localISODate: () => "2026-10-21", Blob,
    URL: { createObjectURL: blob => { imageSvg = blob; return "blob:chart"; }, revokeObjectURL() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "", backgroundColor: "rgb(22, 163, 74)" }),
    XMLSerializer: class { serializeToString() { return '<svg><text>80.00%</text></svg>'; } },
    Image: class { async decode() {} },
    document: { createElement: () => ({
      getContext: () => ({ fillRect() {}, drawImage() {} }),
      toBlob: callback => callback(new Blob(["PNG"], { type: "image/png" })),
    }) },
    downloadFile: (filename, blob) => downloads.push({ filename, blob }),
  });
  ctx.button = { dataset: { chartDownload: "Brand contribution" }, closest: () => card };
  vm.runInContext('exportWorkbook = () => { throw new Error("Chart must not download Excel"); };', ctx);
  await vm.runInContext("downloadChart(button)", ctx);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "branchline-brand-contribution-2026-10-21.png");
  assert.equal(downloads[0].blob.type, "image/png");
  const svg = await imageSvg.text();
  for (const text of ["Brand contribution", "October 2026", "80.00%", "Sold by other PS", "20.00% · amount hidden", "Branch-wide amounts are hidden."]) {
    assert.ok(svg.includes(text), `Missing image label: ${text}`);
  }
});

test("complete brand log loading reads beyond legacy limits and fails explicitly on setup, query or account changes", async () => {
  const pages = [];
  const records = Array.from({ length: 3501 }, (_, index) => ({
    line_id: String(index), sold_on: index < 3500 ? "2025-01-01" : "2026-11-03",
  }));
  const exportClient = { rpc(name) {
    assert.equal(name, "export_brand_branch_sales");
    return { order(column) {
      assert.equal(column, "line_id");
      return { range(from, to) { pages.push([from, to]); return Promise.resolve({ data: records.slice(from, to + 1), error: null }); } };
    } };
  } };
  const ctx = context({ client: exportClient, currentProfile: { id: "own" } });
  ctx.exportClient = exportClient;
  const rows = await vm.runInContext('fetchExportBrandLog(exportClient, "own")', ctx);
  assert.equal(rows.length, 3501);
  assert.equal(rows.filter(row => row.sold_on.startsWith("2026-11")).length, 1);
  assert.deepEqual(pages, [[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
  assert.match(source, /isPsUser \? fetchExportBrandLog\(client, profile.id\)\.then/);
  assert.doesNotMatch(source, /client.rpc\("brand_branch_sales"\)/);
  const errorClient = { rpc: () => ({ order: () => ({ range: () => Promise.resolve({ error: { code: "PGRST202" } }) }) }) };
  ctx.client = ctx.exportClient = errorClient;
  await assert.rejects(vm.runInContext('fetchExportBrandLog(exportClient, "own")', ctx), /database update/);
  const queryClient = { rpc: () => ({ order: () => ({ range: () => Promise.resolve({ error: { message: "Timed out", code: "57014" } }) }) }) };
  ctx.client = ctx.exportClient = queryClient;
  await assert.rejects(vm.runInContext('fetchExportBrandLog(exportClient, "own")', ctx), /Timed out/);
  ctx.client = ctx.exportClient = exportClient;
  ctx.currentProfile.id = "different";
  await assert.rejects(vm.runInContext('fetchExportBrandLog(exportClient, "own")', ctx), /account changed/);
});

test("brand log reports load failures rather than showing a misleading empty period", () => {
  const ctx = context({
    currentProfile: { assigned_brand: "TCL" },
    liveData: { brandSales: [], brandSalesError: "Database <timeout>" },
    panel: (title, subtitle, body) => `${title}|${subtitle}|${body}`,
  });
  vm.runInContext(section("  function brandLogPanel()", "  function inventoryStockFor("), ctx);
  const html = vm.runInContext("brandLogPanel()", ctx);
  assert.match(html, /Sales details could not be loaded/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Database &lt;timeout&gt;/);
  assert.match(html, /chart is loaded separately/);
  assert.doesNotMatch(html, /No sales of your brand/);
});

test("demo full brand export has stable line IDs, no amount fields, and enforces role checks", async () => {
  const storage = new Map();
  const demo = Demo.create({
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    catalog: Demo.sampleCatalog(), today: "2026-10-21",
  });
  const result = await demo.client.rpc("export_brand_branch_sales").order("line_id");
  assert.equal(result.error, null);
  assert.ok(result.data.length > 0);
  assert.equal(new Set(result.data.map(row => row.line_id)).size, result.data.length);
  assert.ok(result.data.every(row => row.branch_id === "branch-0" && row.brand === "TCL"));
  assert.ok(result.data.every(row => !["amount", "selling_price", "srp", "customer_name"].some(key => key in row)));
  const first = await demo.client.rpc("export_brand_branch_sales").order("line_id").range(0, 0);
  assert.deepEqual(first.data, result.data.slice(0, 1));
  demo.setRole("manager");
  await assert.rejects(Promise.resolve(demo.client.rpc("export_brand_branch_sales")), /not available/);
});

function allFixture(role, fail = false, salesBasis = "price") {
  const ui = { salesBasis, month: "2026-10", period: "day", branch: "only-one", district: "hidden", search: "no-match", dsBranch: "only-one", pages: { sales: 3 }, sort: { sales: { col: 0 } }, colf: { traffic: { 0: "x" } } };
  const data = {
    branches: [{ id: "b1", name: "One", district_id: "d1" }, { id: "b2", name: "Two", district_id: "d1" }],
    districts: [{ id: "d1", name: "District 1" }, { id: "d2", name: "Out of scope" }],
    sales: [{ id: "own", ps_id: "own", branch_id: "b1", sold_on: "2026-09-01" }, { id: "peer", ps_id: "peer", branch_id: "b1", sold_on: "2026-10-02" }, { id: "other-branch", ps_id: "peer", branch_id: "b2", sold_on: "2026-10-03" }],
    testSales: [], testPsIds: new Set(), targets: [{ branch_id: "b1", month: "2026-08-01", amount: 1000 }],
    brandTargets: [], paymentTargets: [], products: [{ brand: "TCL", barcode: "1", srp: 900 }],
    dailyHistory: [], importBatches: [], branchWalkins: [], psWalkins: [{ branch_id: "b1", ps_id: "own", counted_on: "2026-09-01", clients_assisted: 4 }, { branch_id: "b1", ps_id: "peer", counted_on: "2026-09-01", clients_assisted: 999 }],
    holidays: [], paymentModes: [{ name: "Cash", position: 1 }], profiles: [{ id: "own", email: "own@example.test" }],
    managerLinks: [], pushMessages: [], pushSchedules: [], brandSales: [{ invoice_number: "old capped log" }],
  };
  const savedTables = { old: { headers: ["Old"], items: [], rowHtml: () => "" } };
  const savedWalkContext = { monthStart: "2026-10-01" };
  const ctx = context({
    window: { XLSX: {}, BranchlineAnalytics: require("./analytics.js"), BranchlineDailyHistory: require("./daily-history.js") }, client: {}, currentProfile: { id: "own", role, full_name: "Fictional User" },
    roleLabels: { [role]: role }, liveData: data, ui, structuredClone, tableStore: savedTables, salesLogExport: new Set(["own"]), walkInDailyCtx: savedWalkContext,
    currentMonth: () => "2026-10", localISODate: () => "2026-10-21", branchName: id => id, psNameOf: id => id,
    serialsFor: () => [], isTestSale: () => false, fulfillmentLabel: () => "Not specified", deliveryExport: () => ({ name: "Delivery Guarranty", rows: [["PS", "Amount"]] }),
    visibleSales: () => data.sales.filter(sale => role !== "ps" || sale.ps_id === "own"),
    linesForSale: () => [{ barcode: "1", brand: "TCL", quantity: 1, selling_price: 123, srp: 200 }],
    collectingExports: false, document: { createElement: () => ({ content: { querySelectorAll: () => [] } }) },
    renderOverview: () => {
      assert.equal(ui.branch, "");
      assert.equal(ui.search, "");
      assert.equal(ui.dsBranch, "");
      assert.equal(ui.salesBasis, salesBasis);
      savedTables.report = { title: "Report", headers: ["Month"], items: [ui.month], rowHtml: () => "" };
      return "";
    },
    renderSalesPage: () => {},
    renderAnalyticsPage: () => { if (fail) throw new Error("Report failed"); },
    renderTargetsPage: () => {},
    branchPerformancePanel: () => {},
  });
  vm.runInContext('tableToSheet = (table,name) => ({ name, rows:[table.headers,...table.items.map(item=>[item])] }); exportWorkbook = (sheets,filename) => { output = {sheets,filename}; }; fetchExportBrandLog = async () => [{line_id:"l",branch_id:"b1",invoice_number:"BRAND",sold_on:"2026-01-01",brand:"TCL",quantity:1}];', ctx);
  const original = structuredClone(ui);
  return { ctx, data, ui, original, savedTables, savedWalkContext };
}

test("Export All keeps actual prices and adds selected comparison amounts while preserving the report basis", async () => {
  const fixture = allFixture("ps", false, "srp");
  await vm.runInContext("exportAllTables()", fixture.ctx);
  const rows = fixture.ctx.output.sheets.find(sheet => sheet.name === "My sales").rows;
  assert.equal(rows[1][rows[0].indexOf("Amount")], 123);
  assert.equal(rows[1][rows[0].indexOf("Comparison amount")], 200);
  assert.deepEqual(fixture.ui, fixture.original);
});

test("SRP workbook exports include explicit mixed-basis information", () => {
  const sheets = [];
  const ctx = context({
    ui: { salesBasis: "srp" }, currentProfile: { role: "ps" },
    window: { XLSX: { utils: {
      book_new: () => ({}), aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (_book, sheet, name) => sheets.push({ name, rows: sheet.rows }),
    }, writeFile: () => {} } },
  });
  vm.runInContext('exportWorkbook([{name:"Report",rows:[["Sales"],[300]]}], "test")', ctx);
  assert.equal(sheets[0].name, "Comparison basis");
  assert.match(sheets[0].rows[0][1], /mixed basis.*selling price/);
  assert.equal(sheets[1].rows[1][0], 300);
});

test("Export All ignores display filters, labels sheets by month, respects PS/account restrictions and restores state", async () => {
  for (const role of ["ps", "manager", "district_manager", "admin"]) {
    const fixture = allFixture(role);
    await vm.runInContext("exportAllTables()", fixture.ctx);
    const output = fixture.ctx.output;
    const sheets = Array.from(output.sheets);
    const saleRows = sheets.find(sheet => sheet.name === (role === "ps" ? "My sales" : "Sales")).rows;
    assert.equal(saleRows.length, role === "ps" ? 2 : 4);
    assert.ok(sheets.some(sheet => sheet.name.startsWith("2026-08 ")));
    assert.ok(sheets.some(sheet => sheet.name.startsWith("2026-09 ")));
    assert.ok(sheets.some(sheet => sheet.name.startsWith("2026-10 ")));
    assert.equal(sheets.some(sheet => sheet.name === "Products"), role !== "ps");
    assert.equal(sheets.some(sheet => sheet.name === "People and access"), role === "admin");
    assert.equal(sheets.find(sheet => sheet.name === "Clients assisted").rows.length, role === "ps" ? 2 : 3);
    if (role === "ps") {
      const brandSheet = sheets.find(sheet => sheet.name === "Brand branch-wide");
      assert.equal(brandSheet.rows[1][1], "BRAND");
      assert.ok(!brandSheet.rows[0].some(header => /amount|price|srp/i.test(header)));
      assert.ok(sheets.some(sheet => sheet.name.startsWith("2026-01 ")));
    }
    assert.deepEqual(fixture.ui, fixture.original);
    assert.deepEqual(Object.keys(fixture.savedTables), ["old"]);
    assert.equal(fixture.ctx.walkInDailyCtx, fixture.savedWalkContext);
    assert.equal(fixture.ctx.collectingExports, false);
    assert.equal(fixture.data.brandSales[0].invoice_number, "old capped log");
  }
});

test("Export All restores state after report errors and rejects missing Excel or incomplete loads", async () => {
  const fixture = allFixture("ps", true);
  await assert.rejects(vm.runInContext("exportAllTables()", fixture.ctx), /Report failed/);
  assert.deepEqual(fixture.ui, fixture.original);
  assert.deepEqual(Object.keys(fixture.savedTables), ["old"]);
  assert.equal(fixture.ctx.collectingExports, false);
  assert.equal(fixture.data.brandSales[0].invoice_number, "old capped log");
  fixture.ctx.window.XLSX = null;
  await assert.rejects(vm.runInContext("exportAllTables()", fixture.ctx), /Excel export is unavailable/);
  fixture.ctx.window.XLSX = {};
  fixture.data.exportWarnings = ["Serial numbers"];
  await assert.rejects(vm.runInContext("exportAllTables()", fixture.ctx), /Serial numbers/);
});
