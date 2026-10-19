"use strict";

// Reads the store "Daily Sales Monitoring" workbook (one sheet per month, one row per day) and merges the
// resulting daily history into analytics without ever double counting live data.
(function (root) {
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const norm = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9#]/g, "");
  const pad = value => String(value).padStart(2, "0");
  const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toNumber = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // sheets: { "January": rows[][] , ... } (rows from sheet_to_json header:1).
  // year = the year of the "this year" columns. cutoff = last date (YYYY-MM-DD) of this year to import.
  function parseMonitoring(sheets, { year, cutoff }) {
    const rows = [];
    const months = [];
    const warnings = [];
    Object.keys(sheets).forEach(name => {
      const monthIndex = MONTHS.indexOf(String(name).trim().toLowerCase());
      if (monthIndex < 0) return;
      const month = monthIndex + 1;
      const data = sheets[name];
      const headerAt = data.findIndex(row => row.some(cell => norm(cell) === "ftty") && row.some(cell => norm(cell) === "ftly"));
      if (headerAt < 0) { warnings.push(`${name}: header row not found, sheet skipped.`); return; }
      const header = data[headerAt].map(norm);
      const find = (...names) => header.findIndex(item => names.includes(item));
      const col = {
        tyWalk: find("ftty"), lyWalk: find("ftly"), tyInv: find("#ofinvty"), lyInv: find("#ofinvly"),
        tySales: find("totalty"), lySales: find("totally"), tyRem: find("remarksthisyear"), lyRem: find("remarkslastyear"),
      };
      const missing = Object.entries(col).filter(([key, index]) => index < 0 && !/Rem$/.test(key)).map(([key]) => key);
      if (missing.length) { warnings.push(`${name}: missing columns (${missing.join(", ")}), sheet skipped.`); return; }

      const summary = { month, ty: { sales: 0, transactions: 0, walkins: 0, days: 0 }, ly: { sales: 0, transactions: 0, walkins: 0, days: 0 } };
      for (let at = headerAt + 1; at < data.length; at += 1) {
        if (/^total/i.test(String(data[at][0] ?? "").trim())) break;
        const day = Number(data[at][0]);
        if (!Number.isInteger(day) || day < 1 || day > 31) { if (day > 31) break; continue; }
        const row = data[at];
        [["ty", year, col.tyWalk, col.tyInv, col.tySales, col.tyRem], ["ly", year - 1, col.lyWalk, col.lyInv, col.lySales, col.lyRem]].forEach(([which, y, walkAt, invAt, salesAt, remAt]) => {
          if (day > daysIn(y, month)) return;
          const date = `${y}-${pad(month)}-${pad(day)}`;
          if (which === "ty" && date > cutoff) return;
          const sales = Math.max(toNumber(row[salesAt]), 0);
          const transactions = Math.max(Math.round(toNumber(row[invAt])), 0);
          const walkins = Math.max(Math.round(toNumber(row[walkAt])), 0);
          const remarks = remAt >= 0 ? String(row[remAt] ?? "").replace(/\s+/g, " ").trim() : "";
          if (!sales && !transactions && !walkins && !remarks) return;
          rows.push({ day: date, sales, transactions, walkins: walkins > 0 ? walkins : null, remarks });
          const bucket = summary[which];
          bucket.sales += sales; bucket.transactions += transactions; bucket.walkins += walkins; bucket.days += 1;
        });
      }
      months.push(summary);
    });
    rows.sort((a, b) => a.day.localeCompare(b.day));
    return { rows, months, warnings };
  }

  // Synthetic sales for days where the branch has no live sales. One per transaction so counts stay right.
  // history: [{ branch_id, day, sales, transactions }]; liveFacts: facts with { branchId, date }.
  function historyFacts(history, liveFacts, ids) {
    const covered = new Set(liveFacts.map(fact => `${fact.branchId}|${fact.date}`));
    const facts = [];
    history.forEach(row => {
      const date = String(row.day).slice(0, 10);
      if (!ids.has(row.branch_id) || covered.has(`${row.branch_id}|${date}`)) return;
      const sales = Number(row.sales) || 0;
      const count = Math.max(Number(row.transactions) || 0, sales > 0 ? 1 : 0);
      for (let index = 0; index < count; index += 1) {
        facts.push({
          date, saleId: `history|${row.branch_id}|${date}|${index}`, branchId: row.branch_id, psId: null, psName: "",
          brand: "", category: "", subCategory: "", product: "", amount: sales / count, srpAmount: 0, soldAmount: 0, summary: true,
        });
      }
    });
    return facts;
  }

  // Store walk-in counts from history, only for days with no real store count.
  function historyWalkins(history, storeCounts) {
    const have = new Set(storeCounts.map(row => `${row.branch_id}|${String(row.counted_on).slice(0, 10)}`));
    return history
      .filter(row => row.walkins !== null && row.walkins !== undefined && Number(row.walkins) > 0)
      .map(row => ({ branch_id: row.branch_id, counted_on: String(row.day).slice(0, 10), visitors: Number(row.walkins), history: true }))
      .filter(row => !have.has(`${row.branch_id}|${row.counted_on}`));
  }

  const api = { parseMonitoring, historyFacts, historyWalkins, MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineDailyHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
