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

test("ranking table is expanded by default and can render collapsed without losing pagination/sorting markup", () => {
  const ui = { psRankingCollapsed: false };
  const shown = renderWith(ui).html;
  assert.match(shown, /data-toggle-ps-ranking/);
  assert.match(shown, /aria-expanded="true"/);
  assert.match(shown, /Collapse table/);
  assert.match(shown, /data-ps-ranking-body>/);
  ui.psRankingCollapsed = true;
  const hidden = renderWith(ui).html;
  assert.match(hidden, /aria-expanded="false"/);
  assert.match(hidden, /Expand table/);
  assert.match(hidden, /data-ps-ranking-body hidden/);
  assert.match(hidden, /data-table-key="psrank"/);
  assert.match(css, /\[data-ps-ranking-body\]\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("collapse button updates aria state and visibility without resetting filters or table page", () => {
  const first = source.indexOf('    const rankingToggle = event.target.closest("[data-toggle-ps-ranking]");');
  const last = source.indexOf('    const awardBatch = event.target.closest("[data-award-top10]");', first);
  assert.ok(first > 0 && last > first);
  const handler = vm.runInNewContext("(function(event,ui) {\n" + source.slice(first, last) + "\n})");
  const attrs = {};
  const body = { hidden: false };
  const button = {
    textContent: "Collapse table",
    closest: () => ({ querySelector: selector => selector === "[data-ps-ranking-body]" ? body : null }),
    setAttribute: (name, value) => { attrs[name] = value; },
  };
  const event = { target: { closest: selector => selector === "[data-toggle-ps-ranking]" ? button : null } };
  const ui = { psRankingCollapsed: false, pages: { psrank: 2 }, sort: { psrank: { col: 4, dir: "desc" } } };
  handler(event, ui);
  assert.equal(body.hidden, true);
  assert.equal(ui.psRankingCollapsed, true);
  assert.equal(button.textContent, "Expand table");
  assert.equal(attrs["aria-expanded"], "false");
  handler(event, ui);
  assert.equal(body.hidden, false);
  assert.equal(ui.psRankingCollapsed, false);
  assert.equal(attrs["aria-expanded"], "true");
  assert.equal(ui.pages.psrank, 2);
  assert.equal(ui.sort.psrank.col, 4);
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
