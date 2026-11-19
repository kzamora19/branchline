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
    liveData: { profiles: [], branches: [] }, currentProfile: null,
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
  assert.match(button, /aria-haspopup="menu" aria-expanded="false"/);
  assert.match(button, /class="export-glyph" aria-hidden="true"/);
  assert.doesNotMatch(button, />Export</);
  const chart = vm.runInContext('chartExport(\'Brand "A"\', [["Brand", "Value"], ["<private>", 20]])', ctx);
  assert.match(chart, /data-chart-download="Brand &quot;A&quot;"/);
  assert.match(chart, /&lt;private&gt;/);
  assert.match(chart, /aria-label="Download Brand &quot;A&quot;"/);
  assert.doesNotMatch(chart, /Excel/);
  assert.doesNotMatch(chart, /<private>/);
  assert.equal((source.match(/>Export<\/button>/g) || []).length, 0);
  assert.match(source, /exportButton\("data-export-all", "Export all tables"\)/);
});

test("wide PDF tables use 13 x 8.5-inch landscape pages, wrap all headings and fit all columns", async () => {
  let definition, filename;
  const ctx = context({
    currentProfile: { id: "owner", role: "manager" }, client: {},
    downloadFile: name => { filename = name; },
  });
  ctx.fakePdf = { createPdf(doc) {
    definition = doc;
    return { getBlob: callback => callback({ type: "application/pdf" }) };
  } };
  vm.runInContext("pdfLibrary = fakePdf", ctx);
  ctx.testSheets = [{ name: "Brands", rows: [
    ["Branch", "Brand", "Available units", "Priced stock (SRP)", "Completed sell-out (SRP)",
      "Monthly sell-out (SRP)", "3-month target (SRP)", "MOH"],
    ["Santiago", "KYOWA", 7, 21148, 643, 64.3, "192.89999999999998", "328.857142857"],
  ] }];
  await vm.runInContext('downloadReportPdf(testSheets, "brands-report")', ctx);
  assert.equal(definition.pageSize.width, 936);
  assert.equal(definition.pageSize.height, 612);
  assert.equal(definition.pageOrientation, "landscape");
  const grid = definition.content.find(block => block.table).table;
  assert.equal(grid.widths.length, 8);
  const printable = 936 - definition.pageMargins[0] - definition.pageMargins[2];
  assert.ok(grid.widths.reduce((sum, n) => sum + n, 0) + 8 * 6 <= printable);
  assert.ok(grid.body[0].every(cell => cell.noWrap === false));
  assert.equal(grid.body[1][6].text, "192.90");
  assert.equal(grid.body[1][7].text, "328.86");
  assert.equal(filename, "brands-report.pdf");
});

test("Brands PDF centers all highlighted metric headers and row values, not Brand/Branch/Status", async () => {
  let doc;
  const ctx = context({
    currentProfile: { id: "owner", role: "manager" }, client: {}, downloadFile() {},
  });
  ctx.fakePdf = { createPdf(def) {
    doc = def;
    return { getBlob: callback => callback({ type: "application/pdf" }) };
  } };
  vm.runInContext("pdfLibrary = fakePdf", ctx);
  const headers = [
    "Branch", "Brand", "Available units", "Priced stock (SRP)",
    "Completed sell-out (SRP)", "Monthly sell-out (SRP)", "3-month target (SRP)",
    "MOH", "Status", "Stock units missing SRP", "Sell-out units missing SRP",
    "Unmatched sell-out units",
  ];
  ctx.brandTable = [{ name: "Brands", rows: [
    headers, ["Santiago", "ASAHI", 61, 140970, 32725, 3272.5, 9817.5, 43.08, "Over 3 months", 0, 0, 0],
  ] }];
  await vm.runInContext('downloadReportPdf(brandTable, "brands")', ctx);
  const table = doc.content.find(block => block.table).table;
  for (let col = 0; col < headers.length; col++) {
    const expected = [2, 3, 4, 5, 6, 7, 9, 10, 11].includes(col) ? "center" : "left";
    assert.equal(table.body[0][col].alignment, expected, headers[col] + " heading");
    assert.equal(table.body[1][col].alignment, expected, headers[col] + " value");
  }
  assert.equal(doc.pageSize.width, 936);
  assert.ok(table.body[0].every(cell => cell.noWrap === false));
  assert.equal(table.body[0].length, table.body[1].length);
});

test("PDF limits fractions to two decimals without modifying identifiers or spreadsheet values", () => {
  const ctx = context();
  for (const [source, header, expected] of [
    ["4724.924999999998", "Target (SRP)", "4,724.92"],
    ["149.4820%", "Progress", "149.48%"],
    ["₱1,234.5678", "Total sales", "₱1,234.57"],
    ["001.12345", "Sales code", "001.12345"],
    ["2026-11-18", "Date", "2026-11-18"],
    ["₱955,365.00", "Sales", "₱955,365.00"],
  ]) {
    ctx.sourceValue = source;
    ctx.fieldHeading = header;
    assert.equal(vm.runInContext("pdfReportCellText(sourceValue, fieldHeading)", ctx), expected);
  }
});

test("dense PDF exports preserve all columns by using fitted A3 landscape", async () => {
  let definition;
  const ctx = context({ currentProfile: { id: "one" }, client: {}, downloadFile() {} });
  ctx.fakePdf = { createPdf(doc) {
    definition = doc;
    return { getBlob: cb => cb({ type: "application/pdf" }) };
  } };
  vm.runInContext("pdfLibrary = fakePdf", ctx);
  ctx.denseSheets = [{ name: "Sales detail", rows: [
    Array.from({ length: 20 }, (_, i) => "Metric " + i),
    Array.from({ length: 20 }, (_, i) => i + 0.1234567),
  ] }];
  await vm.runInContext('downloadReportPdf(denseSheets, "sales-detail")', ctx);
  assert.equal(definition.pageSize, "A3");
  assert.equal(definition.pageOrientation, "landscape");
  const table = definition.content.find(block => block.table).table;
  assert.equal(table.widths.length, 20);
  assert.ok(table.widths.reduce((sum, width) => sum + width, 0) + 20 * 4 <= 1190.55 - 56);
  assert.equal(table.body[1][2].text, "2.12");
});

test("table, PDF and Excel exports keep only their explicitly meaningful columns", () => {
  const worksheets = [];
  const ctx = context({
    window: { XLSX: { utils: {
      book_new: () => ({}), aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (_book, sheet, name) => worksheets.push({ name, rows: sheet.rows }),
    }, writeFile: () => {} } },
  });
  const summaries = [
    ["Comparison basis", ["Sales comparison basis", "Value"]],
    ["Brand performance", ["Brand", "Sales", "Target", "Progress"]],
    ["Sales by payment mode", ["Label", "Amount", "Share (%)"]],
    ["Payment mix", ["Payment mode", "Transactions", "Sales", "Actual mix", "Status"]],
    ["Accessible branch performance", ["Branch", "District", "Sales", "Target", "Progress"]],
    ["Delivery Guarranty", ["PS name", "Qty of sales with DG", "Total amount"]],
    ["Daily sales", ["Date", "Day", "No. of sales", "Total sales"]],
    ["Product Specialist ranking", ["Rank", "Product Specialist", "Brand", "Branch", "Total sales"]],
  ];
  ctx.sheets = [...summaries.map(([name, headers]) => ({ name, rows: [headers, headers.map(() => "")] })),
    { name: "Sales", rows: [["Date", "Invoice", "Sales code", "PS name"], ["2026-11-17", "INV-1", "00193", "Sample PS"]] }];
  vm.runInContext('exportWorkbook(sheets, "report", true)', ctx);
  summaries.forEach(([name, headers]) => {
    const result = worksheets.find(sheet => sheet.name === name);
    assert.ok(result, name);
    assert.deepEqual([...result.rows[0]], headers);
    assert.equal(result.rows[1].length, headers.length);
  });
  assert.deepEqual([...worksheets.find(sheet => sheet.name === "Sales").rows[0]], ["Date", "Invoice", "Sales code", "PS name"]);
  assert.equal(worksheets.find(sheet => sheet.name === "Sales").rows[1][2], "00193");
  assert.deepEqual([...worksheets.find(sheet => sheet.name === "Worksheet index").rows[0]], ["Worksheet", "Full report name"]);
});

test("Sales and Brand Log downloads keep one PS name at the end and aligned row values", () => {
  const fixture = allFixture("manager");
  vm.runInContext(section("  function exportSales(", "  // Pop-up with one Product Specialist's sales"), fixture.ctx);
  vm.runInContext('addTo = (map, key, value) => map.set(key, (map.get(key) || 0) + value); branchDistrictName = () => "District 1";', fixture.ctx);
  vm.runInContext("exportSales()", fixture.ctx);
  const detail = fixture.ctx.output.sheets.find(sheet => sheet.name === "Sales").rows;
  const headers = [...detail[0]];
  assert.equal(headers.filter(label => label === "PS name").length, 1);
  assert.ok(!headers.includes("Product Specialist"));
  assert.deepEqual(headers.slice(-2), ["Sales code", "PS name"]);
  assert.equal(detail[1].length, headers.length);
  assert.equal(detail[1][headers.indexOf("Brand")], "TCL");
  const brand = vm.runInContext('brandLogExportSheet([{ sold_on: "2026-11-17", invoice_number: "A-1", ps_name: "Fictional PS", brand: "TCL", quantity: 1, serial_numbers: [] }])', fixture.ctx);
  assert.deepEqual([...brand.rows[0]].slice(-2), ["Sales code", "PS name"]);
  assert.equal(brand.rows[0].filter(label => label === "Product Specialist").length, 0);
  assert.equal(brand.rows[1].length, brand.rows[0].length);
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
    assert.equal(name, "export_brand_branch_sales_v2");
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
    linesForSale: (() => { const lines = [{ barcode: "1", brand: "TCL", quantity: 1, selling_price: 123, srp: 200 }]; return () => lines; })(),
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
    brandPerformancePanel: () => {
      savedTables.brands = { title: "Brand performance", headers: ["Brand"], items: ["TCL"], rowHtml: () => "" };
    },
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
  assert.ok(fixture.ctx.output.sheets.some(sheet => sheet.name.endsWith("Brand performance")));
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
    assert.deepEqual([...saleRows[0]].slice(-2), ["Sales code", "PS name"]);
    assert.ok(!saleRows[0].includes("PS"), "early duplicate PS column must be removed");
    assert.ok(saleRows.slice(1).every(row => row.length === saleRows[0].length));
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
      assert.ok(!brandSheet.rows[0].includes("Product Specialist"), "duplicate Brand Log PS column");
      assert.deepEqual([...brandSheet.rows[0]].slice(-2), ["Sales code", "PS name"]);
      assert.ok(brandSheet.rows.slice(1).every(row => row.length === brandSheet.rows[0].length));
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
