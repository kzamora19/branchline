"use strict";

// Parses the company "sales database" export (one row per sold item) into sales ready for import.
// The export's trandate column is partly corrupted: dates stored as real Excel dates have day and month
// swapped (1 March shows up as 3 January), while text dates (dd/mm/yyyy) are correct.
(function (root) {
  const PAYMENT_MAP = {
    "walk-in sales": "Cash",
    "branch/affiliate sales": "Cash",
    "online/hotline": "Digital Payment",
    "deferred": "Flexi Deals",
    "credit card": "Credit Card",
    "home credit": "Home Credit",
    "institutional/corporate": "Corporate",
    "subcon/subdealer": "Subdealer",
  };

  const norm = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const pad = value => String(value).padStart(2, "0");
  const num = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const parsed = parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  function paymentMode(raw) {
    const key = text(raw).toLowerCase();
    if (PAYMENT_MAP[key]) return PAYMENT_MAP[key];
    return key ? key.replace(/\b[a-z]/g, letter => letter.toUpperCase()) : "";
  }

  // Returns { iso, fixed } or null. fixed = the day/month swap was undone.
  function resolveDate(value) {
    if (typeof value === "number" && value > 30000 && value < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      if (day <= 12) return { iso: `${year}-${pad(day)}-${pad(month)}`, fixed: true };
      return { iso: `${year}-${pad(month)}-${pad(day)}`, fixed: false };
    }
    const raw = text(value);
    let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
    if (match) return { iso: `${match[3]}-${pad(match[2])}-${pad(match[1])}`, fixed: false };
    match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (match) return { iso: `${match[1]}-${match[2]}-${match[3]}`, fixed: false };
    return null;
  }

  function parseSalesHistory(rows) {
    const headerIndex = rows.findIndex(row => row.some(cell => norm(cell) === "invoiceno") && row.some(cell => norm(cell) === "trandate"));
    if (headerIndex < 0) throw new Error("Could not find the header row (invoiceno, trandate, ...). Is this the sales database export?");
    const header = rows[headerIndex].map(norm);
    const at = (...names) => header.findIndex(name => names.includes(name));
    const col = {
      div: at("divisioncode"), type: at("trantype"), date: at("trandate"), invoice: at("invoiceno"),
      ps: at("salespersonname"), code: at("itemcode"), brand: at("brand"), name: at("itemname"),
      srp: at("srp"), net: at("net"), qty: at("qty"), total: at("totalnet"), pay: at("salescategoryname"),
      customer: at("acctname"), cat: at("maincateg"), sub: at("subcategory"),
    };
    const missing = Object.entries({ divisioncode: col.div, invoiceno: col.invoice, trandate: col.date, itemcode: col.code, BRAND: col.brand, itemname: col.name, NET: col.net, QTY: col.qty, salescategoryname: col.pay })
      .filter(([, index]) => index < 0).map(([name]) => name);
    if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}.`);

    const groups = new Map();
    const usedInvoices = new Map();
    const stats = { lines: 0, skipped: 0, datesFixed: 0, datesBad: 0, returns: 0, amount: 0, from: null, to: null, byDivision: {}, byMonth: {} };

    rows.slice(headerIndex + 1).forEach(row => {
      const division = text(row[col.div]).toUpperCase();
      const invoice = text(row[col.invoice]);
      const qtyRaw = num(row[col.qty]);
      const date = resolveDate(row[col.date]);
      if (!division || !invoice || !Number.isFinite(qtyRaw) || qtyRaw === 0) {
        if (row.some(cell => text(cell))) stats.skipped += 1;
        return;
      }
      if (!date) { stats.datesBad += 1; stats.skipped += 1; return; }
      if (date.fixed) stats.datesFixed += 1;

      const price = Math.abs(Number.isFinite(num(row[col.net])) ? num(row[col.net]) : 0);
      const totalNet = col.total >= 0 ? num(row[col.total]) : NaN;
      const negative = Number.isFinite(totalNet) && totalNet !== 0 ? totalNet < 0 : qtyRaw < 0;
      const quantity = Math.round(Math.abs(qtyRaw)) * (negative ? -1 : 1);
      if (!quantity) { stats.skipped += 1; return; }
      const srp = col.srp >= 0 && Number.isFinite(num(row[col.srp])) ? Math.abs(num(row[col.srp])) : null;
      const tranType = text(row[col.type]).toUpperCase();
      const payment = paymentMode(row[col.pay]);
      const customer = text(row[col.customer]) || "Walk-in customer";
      const psName = text(row[col.ps]);

      const key = [division, invoice, tranType, date.iso, psName, customer, payment].join("\u0001");
      let group = groups.get(key);
      if (!group) {
        const taken = usedInvoices.get(`${division}\u0001${invoice}`) || 0;
        usedInvoices.set(`${division}\u0001${invoice}`, taken + 1);
        let number = invoice;
        if (taken > 0) number = tranType === "SALESRET" ? `${invoice}-R${taken > 1 ? taken : ""}` : `${invoice}-${taken + 1}`;
        group = { division, invoice: number, sold_on: date.iso, customer, ps_name: psName, payment_mode: payment, tran_type: tranType, lines: [] };
        groups.set(key, group);
      }
      group.lines.push({
        barcode: text(row[col.code]),
        description: text(row[col.name]),
        brand: text(row[col.brand]),
        category: col.cat >= 0 ? text(row[col.cat]) : "",
        sub_category: col.sub >= 0 ? text(row[col.sub]) : "",
        price,
        qty: quantity,
        srp,
      });

      const amount = price * quantity;
      stats.lines += 1;
      stats.amount += amount;
      if (quantity < 0) stats.returns += 1;
      if (!stats.from || date.iso < stats.from) stats.from = date.iso;
      if (!stats.to || date.iso > stats.to) stats.to = date.iso;
      const entry = (stats.byDivision[division] ||= { sales: 0, lines: 0, amount: 0 });
      entry.lines += 1;
      entry.amount += amount;
      const month = date.iso.slice(0, 7);
      const monthEntry = (stats.byMonth[month] ||= { lines: 0, amount: 0 });
      monthEntry.lines += 1;
      monthEntry.amount += amount;
    });

    const sales = [...groups.values()];
    sales.forEach(sale => { stats.byDivision[sale.division].sales += 1; });
    stats.sales = sales.length;
    return { sales, stats };
  }

  function chunkSales(sales, size) {
    const chunks = [];
    for (let index = 0; index < sales.length; index += size) chunks.push(sales.slice(index, index + size));
    return chunks;
  }

  const api = { parseSalesHistory, resolveDate, paymentMode, chunkSales, PAYMENT_MAP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineSalesHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
