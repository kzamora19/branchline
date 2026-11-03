"use strict";

// Reads the store "Daily Sales Monitoring" workbook (one sheet per month, one row per day) and merges the
// resulting daily history into analytics without ever double counting live data.
(function (root) {
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const norm = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9#]/g, "");
  const pad = value => String(value).padStart(2, "0");
  const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  const PAYMENT_CHANNELS = ["Store Operations", "Corporate", "Sub Dealer", "Non-Store", "Home Credit", "Credit Card", "Deferred", "Goldmine", "Techzone"];
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
      const channelColumns = Object.fromEntries(["ty", "ly"].map(which => [which,
        PAYMENT_CHANNELS.map(channel => ({ channel, index: find(norm(channel + which)) }))]));

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
          const record = { day: date, sales, transactions, walkins: walkins > 0 ? walkins : null, remarks };
          const channels = channelColumns[which];
          if (channels.every(item => item.index >= 0)) {
            const breakdown = Object.fromEntries(channels.map(item => [item.channel, Math.max(toNumber(row[item.index]), 0)]));
            const total = Object.values(breakdown).reduce((sum, amount) => sum + amount, 0);
            if (Math.abs(total - sales) < 0.01) record.payment_breakdown = breakdown;
            else warnings.push(`${date}: channel amounts do not match total sales; payment breakdown omitted.`);
          } else if (channels.some(item => item.index >= 0)) {
            warnings.push(`${date}: incomplete channel columns; payment breakdown omitted.`);
          }
          rows.push(record);
          const bucket = summary[which];
          bucket.sales += sales; bucket.transactions += transactions; bucket.walkins += walkins; bucket.days += 1;
        });
      }
      months.push(summary);
    });
    rows.sort((a, b) => a.day.localeCompare(b.day));
    return { rows, months, warnings };
  }

  // October's database is incomplete. Remove this exception only after its full import is confirmed.
  const SUMMARY_SALES_MONTHS = ["2026-10"];
  const monthKey = (branch, date) => `${branch}|${String(date).slice(0, 7)}`;

  function historyFacts(history, liveFacts, ids) {
    const databaseMonths = new Set(liveFacts.filter(row => ids.has(row.branchId) && !row.summary)
      .map(row => monthKey(row.branchId, row.date)));
    return history.filter(row => ids.has(row.branch_id) && (
      SUMMARY_SALES_MONTHS.includes(String(row.day).slice(0, 7)) ||
      (String(row.day).startsWith("2025-") && !databaseMonths.has(monthKey(row.branch_id, row.day)))))
      .map(row => {
        const date = String(row.day).slice(0, 10);
        return {
          date, saleId: `history|${row.branch_id}|${date}`, branchId: row.branch_id, psId: null, psName: "",
          brand: "", category: "", subCategory: "", product: "", amount: Number(row.sales) || 0, srpAmount: 0, soldAmount: 0, summary: true,
        };
      });
  }

  function reconcileSalesFacts(history, liveFacts, ids) {
    const summaries = historyFacts(history, liveFacts, ids);
    const replaced = new Set(summaries.map(row => monthKey(row.branchId, row.date)));
    return [...liveFacts.filter(row => ids.has(row.branchId) && !replaced.has(monthKey(row.branchId, row.date))), ...summaries];
  }

  // A monitoring month replaces invoice counts for that entire branch/month, never just missing days.
  function transactionFacts(history, liveFacts, ids) {
    const scoped = history.filter(row => ids.has(row.branch_id));
    const covered = new Set(scoped.map(row => monthKey(row.branch_id, row.day)));
    const invoices = new Map(liveFacts.filter(row => ids.has(row.branchId) && !row.summary && !covered.has(monthKey(row.branchId, row.date)))
      .map(row => [row.saleId, { id: row.saleId, saleId: row.saleId, branchId: row.branchId, date: row.date }]));
    const result = [...invoices.values()];
    for (const row of scoped) {
      const date = String(row.day).slice(0, 10);
      const count = Math.max(0, Math.trunc(Number(row.transactions) || 0));
      for (let index = 0; index < count; index += 1) {
        const id = `history|${row.branch_id}|${date}|${index}`;
        result.push({ id, saleId: id, branchId: row.branch_id, date, summary: true });
      }
    }
    return result;
  }

  // Store walk-in counts from history, only for days with no real store count.
  function historyWalkins(history, storeCounts) {
    const have = new Set(storeCounts.map(row => `${row.branch_id}|${String(row.counted_on).slice(0, 10)}`));
    return history
      .filter(row => row.walkins !== null && row.walkins !== undefined && Number(row.walkins) > 0)
      .map(row => ({ branch_id: row.branch_id, counted_on: String(row.day).slice(0, 10), visitors: Number(row.walkins), history: true }))
      .filter(row => !have.has(`${row.branch_id}|${row.counted_on}`));
  }

  const api = { parseMonitoring, historyFacts, reconcileSalesFacts, transactionFacts, historyWalkins, MONTHS, SUMMARY_SALES_MONTHS, PAYMENT_CHANNELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineDailyHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
