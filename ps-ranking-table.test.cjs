const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const begin = source.indexOf("  function psRankingPanel() {");
const end = source.indexOf("\n  function matches(", begin);
assert.ok(begin >= 0 && end > begin, "ranking function exists");
const implementation = source.slice(begin, end);

function renderWith(ui) {
  const calls = {};
  const person = {
    id: "ps-1", rank: 1, name: "SAMPLE SPECIALIST",
    brand: "SAMPLE BRAND", branch: "SAMPLE BRANCH", total: 100,
  };
  const context = {
    currentProfile: { role: "admin" }, ui, demoStore: null,
    scopeBranchIds: () => new Set(["branch-1"]),
    psAwardRankingRows: ids => {
      calls.awardScope = ids;
      return [person];
    },
    psRankingRows: ids => {
      calls.rankScope = ids;
      return [person];
    },
    periodLabel: () => "November 2026",
    formatMoney: number => "PHP " + number,
    escapeHTML: text => String(text),
    tableBlock: (key, headings, rows, rowHTML) => {
      calls.table = { key, headings, rows };
      return '<div data-table-key="' + key + '"><table><tbody>'
        + rows.map(rowHTML).join("") + "</tbody></table></div>";
    },
    panel: (title, detail, body, action) => {
      calls.panel = { title, detail, body, action };
      return "<section class=\"connected-panel\"><h2>" + title + "</h2>"
        + action + body + "</section>";
    },
  };
  const html = vm.runInNewContext(implementation + "\npsRankingPanel();", context);
  return { html, calls };
}

test("the overview retains one ranking table, no top-performer cards or redundant filter controls", () => {
  const ui = { rankBrand: "OLD BRAND", rankCategory: "AIRCON", rankSub: "OLD SUB", rankBranch: "OLD BRANCH" };
  const { html, calls } = renderWith(ui);
  assert.equal(calls.table.key, "psrank");
  assert.deepEqual([...calls.table.headings], ["Rank", "Product Specialist", "Brand", "Branch", "Total sales"]);
  assert.equal(calls.table.rows.length, 1);
  assert.match(html, /SAMPLE SPECIALIST/);
  assert.match(html, /data-table-key="psrank"/);
  assert.doesNotMatch(html, /ps-award-grid|ps-award-card|TOP PERFORMER|rank-filters|data-filter="rank/);
  assert.equal(ui.rankBrand, "");
  assert.equal(ui.rankCategory, "");
  assert.equal(ui.rankSub, "");
  assert.equal(ui.rankBranch, "");
  assert.match(html, /Print Top 10 Certificates \(PDF\)/);
});

test("ranking relies on shared heading collapse without a duplicate button", () => {
  const { html, calls } = renderWith({});
  assert.match(html, /data-table-key="psrank"/);
  assert.match(html, /SAMPLE SPECIALIST/);
  assert.doesNotMatch(html, /data-toggle-ps-ranking|Collapse table|Expand table|data-ps-ranking-body/);
  assert.match(calls.panel.action, /Print Top 10 Certificates \(PDF\)/);
  assert.match(source, /BranchlineTableUI\?\.enhanceSections\(container, activePage\)/);
  const sectionUi = fs.readFileSync(path.join(__dirname, "table-ui.js"), "utf8");
  assert.match(sectionUi, /sectionPages = new Set\(\["overview"/);
  assert.match(sectionUi, /section-collapse-heading/);
  assert.match(sectionUi, /aria-expanded/);
  assert.match(css, /section-toggle\[aria-expanded="false"\]/);
  assert.doesNotMatch(source, /psRankingCollapsed|data-toggle-ps-ranking/);
});

test("single certificates remain accessible via row detail; batch certificate remains available", () => {
  const start = source.indexOf("  function openPsDetailModal(psId) {");
  const stop = source.indexOf("  // Pop-up with one brand's sales", start);
  const detail = source.slice(start, stop);
  assert.match(detail, /psAwardRankingRows\(scopeBranchIds\(\)\)/);
  assert.match(detail, /certificate.textContent = "Certificate PDF"/);
  assert.match(detail, /downloadTopPsCertificates\(psId\)/);
  assert.match(implementation, /data-award-top10/);
});
