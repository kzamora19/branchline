/* Pure, read-only management calculations. This module does not save sales or
 * targets and never sends data to PTG. Loaded after analytics.js. */
(function (root) {
  "use strict";

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const iso = value => String(value || "").slice(0, 10);
  const shift = (date, days) => {
    const time = Date.parse(date + "T00:00:00Z");
    return Number.isFinite(time) ? new Date(time + days * 86400000).toISOString().slice(0, 10) : "";
  };
  const eligibleFact = (fact, ps) => fact.psId === ps.id && fact.branchId === ps.branch_id;
  const uniq = rows => new Set(rows.map(row => row.saleId).filter(Boolean)).size;

  function psCards({ profiles = [], facts = [], assisted = [], targetsByBranch = {},
    from, through, expectedFraction = null, remainingDays = 0 }) {
    const active = profiles.filter(ps => ps?.id && ps?.branch_id && ps.active !== false);
    const counts = new Map();
    active.forEach(ps => counts.set(ps.branch_id, (counts.get(ps.branch_id) || 0) + 1));
    const recentFrom = shift(through, -6), priorFrom = shift(through, -13), priorTo = shift(through, -7);
    return active.map(ps => {
      const own = facts.filter(fact => eligibleFact(fact, ps) && fact.date >= from && fact.date <= through);
      const sales = own.reduce((sum, row) => sum + number(row.amount), 0);
      const transactions = uniq(own);
      const target = number(targetsByBranch[ps.branch_id]) / (counts.get(ps.branch_id) || 1);
      const achievement = target > 0 ? sales / target : null;
      const records = assisted.filter(row => row.ps_id === ps.id && row.branch_id === ps.branch_id
        && iso(row.counted_on) >= from && iso(row.counted_on) <= through);
      const countedDays = new Set(records.map(row => iso(row.counted_on)));
      const clientsAssisted = records.reduce((sum, row) => sum + Math.max(0, Math.trunc(number(row.clients_assisted))), 0);
      const matchedTransactions = uniq(own.filter(row => countedDays.has(row.date)));
      const recent = facts.filter(f => eligibleFact(f, ps) && f.date >= recentFrom && f.date <= through)
        .reduce((sum, row) => sum + number(row.amount), 0);
      const prior = facts.filter(f => eligibleFact(f, ps) && f.date >= priorFrom && f.date <= priorTo)
        .reduce((sum, row) => sum + number(row.amount), 0);
      return {
        id: ps.id, name: ps.full_name || "Staff member", branchId: ps.branch_id,
        sales, target, achievement, transactions, averageTransaction: transactions ? sales / transactions : null,
        clientsAssisted: records.length ? clientsAssisted : null,
        countedDays: countedDays.size,
        conversion: clientsAssisted > 0 ? matchedTransactions / clientsAssisted : null,
        recent7: recent, prior7: prior, recentChange: prior > 0 ? (recent - prior) / prior : null,
        dailyRequired: target > 0 && remainingDays > 0 ? Math.max(0, target - sales) / remainingDays : null,
        pace: target > 0 && expectedFraction !== null
          ? (achievement >= expectedFraction ? "ON_PACE" : "BEHIND") : "UNKNOWN",
      };
    }).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  }

  function actionableAlerts({ cards = [], brands = [], stock = [], sales = [],
    expectedFraction = null, today = "", minGap = 0.15 } = {}) {
    const alerts = [];
    const add = (code, level, title, message) => {
      if (!alerts.some(item => item.code === code)) alerts.push({ code, level, title, message });
    };
    for (const card of cards) {
      if (card.target > 0 && expectedFraction !== null && expectedFraction >= 0.15
        && card.achievement !== null && card.achievement < Math.max(0, expectedFraction - minGap)) {
        add("PS_PACE:" + card.id, "warning", "PS below expected pace",
          card.name + ": " + (card.achievement * 100).toFixed(1) + "% achieved vs " + (expectedFraction * 100).toFixed(1) +
          "% of selling days elapsed. Review daily sales and support opportunities.");
      }
    }
    for (const brand of brands) {
      const goal = number(brand.target), actual = number(brand.actual);
      if (goal > 0 && expectedFraction !== null && expectedFraction >= 0.2 && actual / goal < Math.max(0, expectedFraction - 0.25)) {
        add("BRAND_PACE:" + String(brand.branchId || "") + ":" + brand.name,
          "warning", "Brand significantly behind target",
          brand.name + ": " + (actual / goal * 100).toFixed(1) + "% vs expected " +
          (expectedFraction * 100).toFixed(1) + "%. Review stock, displays and selling activity.");
      }
    }
    for (const item of stock) {
      const quantity = Number(item.quantity);
      if (item.barcode && item.quantity !== null && item.quantity !== undefined &&
        Number.isFinite(quantity) && quantity <= 0) {
        add("STOCK:" + (item.branch_id || "") + ":" + item.barcode, "warning", "No available stock",
          "Barcode " + item.barcode + " has zero available stock in the selected branch. Verify replenishment.");
      }
    }
    const uncoded = sales.filter(item => item && !String(item.salesperson_code || "").trim());
    if (uncoded.length) {
      add("MISSING_SALES_CODES", "warning", "Missing Sales codes",
        uncoded.length + " recorded transaction(s) lack a Sales code. Review import or PS attribution.");
    }
    // These are on-screen advisory notices; no push messages are created or scheduled.
    return alerts.slice(0, 12);
  }

  function productSnapshot({ catalog = [], stock = [], facts = [], branchIds = new Set(), today }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("A date-only snapshot timestamp is required.");
    const from30 = shift(today, -29), from90 = shift(today, -89);
    const byKey = new Map();
    for (const row of catalog) {
      const barcode = String(row.barcode || "").trim();
      if (!barcode || !branchIds.has(row.branch_id)) continue;
      const key = row.branch_id + "\u0000" + barcode;
      if (!byKey.has(key)) byKey.set(key, {
        source: "BRANCHLINE_SNAPSHOT_V1", branch_id: row.branch_id,
        barcode, model: row.model_description || "", brand: row.brand || "",
        available_units: null, last_sale_date: "", units_30d: 0, units_90d: 0, exported_at: today,
      });
    }
    for (const row of stock) {
      const key = row.branch_id + "\u0000" + String(row.barcode || "").trim();
      const target = byKey.get(key);
      if (!target) continue;
      const quantity = Number(row.quantity);
      target.available_units = row.quantity === null || row.quantity === undefined || !Number.isFinite(quantity)
        ? null : quantity;
    }
    for (const fact of facts) {
      const key = fact.branchId + "\u0000" + String(fact.barcode || "").trim();
      const target = byKey.get(key);
      const date = iso(fact.date);
      if (!target || !date || date > today) continue;
      if (date > target.last_sale_date) target.last_sale_date = date;
      const qty = number(fact.quantity);
      if (date >= from30) target.units_30d += qty;
      if (date >= from90) target.units_90d += qty;
    }
    return [...byKey.values()].sort((a, b) =>
      a.branch_id.localeCompare(b.branch_id) || a.barcode.localeCompare(b.barcode));
  }

  const api = { psCards, actionableAlerts, productSnapshot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineManagement = api;
})(typeof window !== "undefined" ? window : globalThis);
