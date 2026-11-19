const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");

test("Top 10 certificates exclude inactive, test and zero-sale profiles; tie order is stable", async () => {
  const { topSpecialistAwardees } = await import("./ps-certificates.mjs");
  const profiles = Array.from({ length: 14 }, (_, i) => ({
    id: "p" + (i + 1), role: "ps", active: true, full_name: "PS " + String(i + 1).padStart(2, "0"),
    branch_id: "B", login_id: "user" + i,
  }));
  profiles[0].full_name = "Test_ps";
  profiles[1].active = false;
  profiles[2].role = "manager";
  const ranked = profiles.map((p, i) => ({ id: p.id, name: p.full_name, total: i === 3 ? 0 : 20000 - i * 500, branch: "Santiago", brand: "TCL" }));
  const eligible = topSpecialistAwardees(ranked, profiles);
  assert.equal(eligible.length, 10);
  assert.ok(!eligible.some(row => ["p1", "p2", "p3", "p4"].includes(row.id)));
  assert.deepEqual(eligible.map(row => row.rank), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.deepEqual(topSpecialistAwardees([], profiles), []);
  assert.equal(topSpecialistAwardees(ranked, profiles, 5).length, 5);
  const tied = topSpecialistAwardees([{ id: "p6", name: "Z", total: 40 }, { id: "p5", name: "A", total: 40 }], profiles);
  assert.equal(tied[0].id, "p5");
});

test("Certificate PDF is A4 landscape, one page per awarded PS, with blank signature lines", async () => {
  const { certificateDocument } = await import("./ps-certificates.mjs");
  const rows = [
    { id: "p1", rank: 1, name: "Sample Person A", branch: "Santiago", brand: "TCL", total: 10000 },
    { id: "p2", rank: 2, name: "Sample Person B", branch: "Cauayan", brand: "LG", total: 9500 },
  ];
  const doc = certificateDocument(rows, { period: "November 2026", issuedOn: "2026-11-18", branchManagerName: "Marina C. Santos", districtManagerName: "Javier D. Cruz" });
  assert.equal(doc.pageSize, "A4");
  assert.equal(doc.pageOrientation, "landscape");
  assert.equal(doc.content.length, 2);
  assert.equal(doc.content[1].pageBreak, "before");
  assert.ok(doc.content[0].stack.some(part => part.text === "Sample Person A"));
  assert.ok(doc.content[0].stack.some(part => String(part.text).includes("RANK #1")));
  assert.ok(doc.content[0].stack.some(part => part.text === "This certificate is proudly presented to"));
  assert.ok(doc.content[0].stack.some(part => String(part.text).includes("In grateful recognition of your outstanding sales performance")));
  assert.ok(!doc.content[0].stack.some(part => String(part.text).includes("Credited sales:")));
  assert.ok(!doc.content[0].stack.some(part => String(part.text).includes("Award scope:")));
  const signatureColumns = doc.content[0].stack.find(part => part.columns)?.columns;
  assert.ok(signatureColumns && signatureColumns.length === 2);
  assert.ok(signatureColumns.every(col => col.stack.some(x => String(x.text).includes("_____"))));
  assert.equal(signatureColumns[0].stack[1].text, "MARINA C. SANTOS");
  assert.equal(signatureColumns[1].stack[1].text, "JAVIER D. CRUZ");
  assert.ok(signatureColumns.every(col => col.stack.every(x => x.alignment === "center")));
  const unsigned = certificateDocument(rows, { period: "November 2026" });
  assert.equal(unsigned.content[0].stack.find(part => part.columns).columns[0].stack[1].text, " ");
  assert.equal(unsigned.content[0].stack.find(part => part.columns).columns[1].stack[1].text, " ");
  assert.equal(typeof doc.background, "function");
  const frame = doc.background(1, { width: 841.89, height: 595.28 });
  assert.match(frame.svg, /id="ribbon"/);
  assert.match(frame.svg, /id="pageInside"/);
  assert.match(frame.svg, /clip-path="url\(#pageInside\)"/);
  assert.match(frame.svg, /One continuous matched contour/);
  assert.doesNotMatch(frame.svg, /data:image/);
  assert.ok(!doc.content[0].stack.some(part => part.width === 842 && part.height === 595 && part.image),
    "No raster border overlay should cover the editable certificate");
  assert.equal(doc.pageMargins[0], 0);
  assert.match(doc.content[0].stack[0].image, /^data:image\/png;base64,/);
  assert.ok(!doc.content[0].stack.some(part => String(part.text).includes("BRANCHLINE  |  SALES TRACKER")));
  assert.throws(() => certificateDocument([]), /no eligible/i);
  assert.throws(() => certificateDocument(Array(11).fill(rows[0])), /top 10/i);
});

test("Top 10 ranking uses scoped, actual line sales and excludes test invoices and transferred history", () => {
  const start = app.indexOf("  function psAwardRankingRows(");
  const end = app.indexOf("  function psRankingPanel()", start);
  assert.ok(start >= 0 && end > start);
  const people = [
    { id: "good", role: "ps", active: true, full_name: "Person One", branch_id: "A", assigned_brand: "LG" },
    { id: "test", role: "ps", active: true, full_name: "Test_ps", branch_id: "A" },
  ];
  const sales = [
    { id: "a", ps_id: "good", branch_id: "A", sold_on: "2026-11-18", customer_name: "Normal", invoice_number: "123" },
    { id: "b", ps_id: "good", branch_id: "B", sold_on: "2026-11-18", customer_name: "Normal", invoice_number: "124" },
    { id: "c", ps_id: "test", branch_id: "A", sold_on: "2026-11-18", customer_name: "Normal", invoice_number: "125" },
    { id: "d", ps_id: "good", branch_id: "A", sold_on: "2026-11-18", customer_name: "Test customer", invoice_number: "Test-1" },
    { id: "e", ps_id: "good", branch_id: "A", sold_on: "2026-10-18", customer_name: "Normal", invoice_number: "126" },
  ];
  const ctx = vm.createContext({
    liveData: { profiles: people, sales, targets: [{ branch_id: "A", month: "2026-11", amount: 1000 }],
      branches: [{ id: "A", name: "Santiago" }],
      psWalkins: [
        { branch_id: "A", ps_id: "good", counted_on: "2026-11-18", clients_assisted: 10 },
        { branch_id: "B", ps_id: "good", counted_on: "2026-11-18", clients_assisted: 999 },
      ] },
    ui: { rankBrand: "", rankCategory: "", rankSub: "", salesBasis: "price", period: "month", month: "2026-11" },
    window: { BranchlineAnalytics: { salesLineAmount: line => line.value } },
    isTestProfile: profile => /^Test/i.test(profile.full_name),
    isTestSale: sale => /^Test/i.test(sale.customer_name) || /^Test/i.test(sale.invoice_number),
    linesForSale: id => [{ value: id === "a" ? 500 : 200, brand: "LG" }],
    lineMatches: () => true, addTo: (map, key, amount) => map.set(key, (map.get(key) || 0) + amount),
    branchName: () => "Santiago", natural: (a, b) => String(a).localeCompare(String(b)),
    localISODate: () => "2026-11-18",
    periodDay: () => "2026-11-18",
    inPeriod: date => date.startsWith("2026-11"),
    scopeBranchIds: () => new Set(["A"]),
  });
  vm.runInContext(app.slice(start, end), ctx);
  const ranked = vm.runInContext("psAwardRankingRows(new Set(['A']))", ctx);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].total, 500);
  assert.equal(ranked[0].transactions, 1);
  assert.equal(ranked[0].targetShare, 1000);
  assert.equal(ranked[0].progress, 50);
  assert.equal(ranked[0].assisted, 10);
  assert.equal(ranked[0].conversion, 10);
  vm.runInContext('ui.rankBrand = "LG"', ctx);
  const filtered = vm.runInContext("psAwardRankingRows(new Set(['A']))", ctx);
  assert.equal(filtered[0].conversion, null, "Brand-filtered ranking cannot claim whole-PS conversion");
  assert.ok(app.includes('data-award-top10'));
  assert.ok(app.includes('data-ps-certificate'));
  assert.ok(app.includes('!["manager", "district_manager", "admin"].includes(currentProfile?.role)'));
  assert.ok(app.includes('await loadPdfLibrary()'));
});

test("PS award controls are absent from PS role and never overwrite sales or targets", () => {
  assert.match(app, /function psRankingPanel\(\) \{\s*if \(currentProfile.role === "ps"\) return ""/);
  // Award calculation and certificate download must be read-only. The separate
  // protected individual-goal editor is intentionally permitted to write goals.
  assert.doesNotMatch(app.slice(app.indexOf("  function psAwardRankingRows("), app.indexOf("  function psAwardScopeLabel(", app.indexOf("  function psAwardRankingRows("))), /client\.(?:rpc|from)\(/);
});

test("certificate export UI provides distinct editable signatories and recalculated period controls", async () => {
  const start = app.indexOf("  function downloadTopPsCertificates(");
  const end = app.indexOf("  function psIndividualTargetPanel()", start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  assert.match(block, /name="branch_manager_name"/);
  assert.match(block, /name="district_manager_name"/);
  assert.match(block, /name="certificate_kind"/);
  assert.match(block, /name="certificate_month"/);
  assert.match(block, /name="certificate_year"/);
  assert.match(block, /certificatePeriodRange\(kind, value, today\)/);
  assert.match(block, /psAwardRankingRows\(scope, window\)/);
  assert.match(block, /branchManagerName:/);
  assert.match(block, /districtManagerName:/);
  assert.match(block, /currentProfile\?\.id !== profileId/);
  assert.doesNotMatch(block, /from\(["']sales["']\)\.(?:insert|update|delete)/);
});


test("Top 10 certificate button works from Targets as well as Overview", () => {
  const begin = app.indexOf("  function downloadTopPsCertificates(onlyId) {");
  const end = app.indexOf("  function psIndividualTargetPanel()", begin);
  assert.ok(begin >= 0 && end > begin);
  const flow = app.slice(begin, end);
  assert.match(flow, /\["overview", "targets"\]\.includes\(activePage\)/);
  assert.ok((flow.match(/\["overview", "targets"\]\.includes\(activePage\)/g) || []).length >= 3);
  assert.doesNotMatch(flow, /activePage !== "overview"/);
  assert.match(app, /data-award-top10/);
  assert.match(app, /downloadTopPsCertificates\(awardSingle\?\.dataset\.psCertificate \|\| null\)/);
});


test("awardee count is selectable from Top 1 through Top 10, with preview required before export", () => {
  const begin = app.indexOf("  function downloadTopPsCertificates(onlyId) {");
  const end = app.indexOf("  function psIndividualTargetPanel()", begin);
  const flow = app.slice(begin,end);
  assert.match(flow, /name="certificate_count"/);
  assert.match(flow, /length: 10/);
  assert.match(flow, /awardeeCount = onlyId \? 10 : Number\(form\.elements\.certificate_count\.value\)/);
  assert.match(flow, /topSpecialistAwardees\(ranking, liveData\.profiles, awardeeCount\)/);
  assert.match(flow, /submitLabel: "Preview certificates"/);
  assert.match(flow, /data-certificate-preview-frame/);
  assert.match(flow, /PDF preview/);
  assert.match(flow, /Download approved PDF/);
  assert.match(flow, /URL\.createObjectURL\(blob\)/);
  assert.match(flow, /prepared = \{ blob, name \}/);
  assert.match(flow, /downloadFile\(prepared\.name, prepared\.blob\)/);
  assert.doesNotMatch(flow, /downloadFile\(name, blob\)/);
  assert.match(app, /certificatePreviewUrl\) URL\.revokeObjectURL/);
});

test("approved certificate readability and whitespace adjustments are present", async () => {
  const { certificateDocument } = await import("./ps-certificates.mjs");
  const [person] = certificateDocument([
    { id: "ps1", rank: 1, name: "Vermont Jay Montalban", branch: "Santiago", brand: "TCL", total: 1000 },
  ], { branchManagerName: "  Kenneth Alvin C. Zamora  ", districtManagerName: "Kim Glenn Agustin" }).content;
  const name = person.stack.find(p => p.text === "Vermont Jay Montalban");
  assert.ok(name.bold);
  assert.ok(name.fontSize >= 34, "awardee name is enlarged");
  const branch = person.stack.find(p => String(p.text).startsWith("Branch: Santiago"));
  const signature = person.stack.find(p => Array.isArray(p.columns));
  assert.ok(branch.fontSize >= 12 && branch.bold, "branch and brand assignment is legible");
  assert.ok(signature.absolutePosition.y - branch.absolutePosition.y >= 80,
    "expanded space is maintained between branch assignment and signatures");
  assert.equal(signature.columns[0].stack[1].text, "KENNETH ALVIN C. ZAMORA");
  assert.equal(signature.columns[1].stack[1].text, "KIM GLENN AGUSTIN");
  assert.equal(signature.columns[0].stack[2].text, "Branch Manager");
  assert.equal(signature.columns[1].stack[2].text, "District Manager");
  assert.doesNotMatch(JSON.stringify(signature), /Authorized Signatory|Management Representative/);
});

test("certificate form uppercases both editable signatories before building the PDF", () => {
  const begin = app.indexOf("  function downloadTopPsCertificates(onlyId) {");
  const end = app.indexOf("  function psIndividualTargetPanel()", begin);
  const flow = app.slice(begin, end);
  for (const name of ["branch_manager_name", "district_manager_name"]) {
    assert.match(flow, new RegExp('name="' + name + '"'));
  }
  assert.match(flow, /field\.value\.toLocaleUpperCase\("en-PH"\)/);
  assert.match(flow, /branchManagerName:.*toLocaleUpperCase\("en-PH"\)/);
  assert.match(flow, /districtManagerName:.*toLocaleUpperCase\("en-PH"\)/);
});


test("recognition section gains exactly five points and branch assignment doubles", async () => {
  const { certificateDocument } = await import("./ps-certificates.mjs");
  const doc = certificateDocument([{ id: "ps1", rank: 1, name: "Vermont Jay Montalban", branch: "Santiago", brand: "TCL", total: 1000 }], {
    period: "November 2026 • Monthly Performance (through 2026-11-19)",
  });
  const stack = doc.content[0].stack;
  const lookup = prefix => stack.find(node => String(node.text || "").startsWith(prefix));
  assert.equal(lookup("EXCELLENCE IN SALES PERFORMANCE").fontSize, 16);
  assert.equal(lookup("CERTIFICATE OF RECOGNITION").fontSize, 32.5);
  assert.equal(lookup("This certificate is proudly presented to").fontSize, 18);
  assert.equal(lookup("Vermont Jay Montalban").fontSize, 40);
  assert.equal(lookup("RANK #1").fontSize, 19);
  assert.equal(lookup("In grateful recognition").fontSize, 16.3);
  assert.equal(lookup("November 2026").fontSize, 19.2);
  assert.equal(lookup("Branch: Santiago").fontSize, 24.8);
  assert.ok(lookup("Branch: Santiago").absolutePosition.y > lookup("November 2026").absolutePosition.y);
  const frame = doc.background(1, {width:842, height:595}).svg;
  assert.match(frame, /M 112 344 H 730 L 719 375 H 100 Z/, "ribbon widened to fit the larger period label");
  for(const personName of ["ALONG TEST NAME WITH MORE THAN THIRTY SIX CHARACTERS", "A VERY LONG NAME THAT HAS MORE THAN FIFTY TWO CHARACTERS TOTAL"]) {
    const candidate = certificateDocument([{id:"ps1", rank:1, name:personName, branch:"Santiago", brand:"TCL", total:1000}]).content[0].stack.find(n=>n.text===personName);
    assert.equal(candidate.fontSize, personName.length>52?26:31, "long-name font also gains five points");
  }
});

test("Top PS certificate print action is displayed only to branch managers and higher", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require("node:path").join(__dirname,"auth-app.js"),"utf8");
  const start = source.indexOf("  function psRankingPanel()");
  const end = source.indexOf("  function ", start + 15);
  const panel = source.slice(start,end);
  assert.match(panel, /const canPrintCertificates = !demoStore && \["manager", "district_manager", "admin"\]\.includes\(currentProfile\?\.role\)/);
  assert.match(panel, /const awardButton = !canPrintCertificates \? ""/);
  assert.match(source, /if \(!\["manager", "district_manager", "admin"\]\.includes\(currentProfile\?\.role\)/);
});
