// Read-only aggregated management reporting. Never include customer identifiers.
const utcDay = value => {
  const d = new Date(String(value || "") + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
};
const iso = d => d.toISOString().slice(0, 10);
const monthEnd = month => iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)));

export function managementRange(kind, { month, day, today }) {
  if (!["daily", "weekly", "monthly", "ytd"].includes(kind)) throw new Error("Unsupported report period.");
  const baseMonth = /^\d{4}-\d{2}$/.test(month || "") ? month : String(today).slice(0, 7);
  const endMonth = monthEnd(baseMonth);
  let anchor = day && day.slice(0, 7) === baseMonth ? day : baseMonth <= String(today).slice(0, 7)
    ? (baseMonth === String(today).slice(0, 7) && today < endMonth ? today : endMonth) : baseMonth + "-01";
  if (!utcDay(anchor)) throw new Error("Invalid report date.");
  if (kind === "daily") return { kind, from: anchor, to: anchor, label: "Daily · " + anchor };
  if (kind === "weekly") {
    const d = utcDay(anchor), weekday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - weekday);
    const from = iso(d);
    d.setUTCDate(d.getUTCDate() + 6);
    const to = iso(d);
    return { kind, from, to, label: "Weekly · " + from + " to " + to };
  }
  const from = kind === "monthly" ? baseMonth + "-01" : baseMonth.slice(0, 4) + "-01-01";
  return { kind, from, to: anchor, label: (kind === "monthly" ? "Monthly" : "Year to date") + " · " + from + " to " + anchor };
}

function sortedRows(groups, headings) {
  return [headings, ...[...groups.values()]
    .sort((a, b) => b.amount - a.amount || String(a.label).localeCompare(String(b.label)))
    .map(item => [item.label, item.transactions.size, item.amount])];
}

export function buildManagementReport({
  kind, month, day, today, branches = [], profiles = [], sales = [],
  branchIds, isTestSale, linesForSale, amountForLine, basis = "Selling-price basis",
}) {
  const range = managementRange(kind, { month, day, today });
  const ids = branchIds instanceof Set ? branchIds : new Set(branches.map(row => row.id));
  const names = new Map(branches.map(branch => [branch.id, branch.name]));
  const people = new Map(profiles.map(profile => [profile.id, profile]));
  const byBranch = new Map(), byBrand = new Map(), byPs = new Map(), byDate = new Map();
  const update = (map, key, label, amount, transactionId) => {
    if (!map.has(key)) map.set(key, { label, amount: 0, transactions: new Set() });
    const row = map.get(key); row.amount += amount; row.transactions.add(transactionId);
  };
  let transactions = 0, net = 0;
  for (const sale of sales) {
    const date = String(sale.sold_on || "").slice(0, 10);
    if (date < range.from || date > range.to || !ids.has(sale.branch_id) || isTestSale(sale)) continue;
    const lines = linesForSale(sale.id) || [];
    const total = lines.reduce((sum, line) => {
      const value = Number(amountForLine(line));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    transactions += 1; net += total;
    const branchName = names.get(sale.branch_id) || "Unavailable branch";
    update(byBranch, sale.branch_id, branchName, total, sale.id);
    update(byDate, date, date, total, sale.id);
    for (const line of lines) {
      const value = Number(amountForLine(line));
      update(byBrand, String(line.brand || "Unbranded").trim() || "Unbranded",
        String(line.brand || "Unbranded").trim() || "Unbranded", Number.isFinite(value) ? value : 0, sale.id);
    }
    const ps = people.get(sale.ps_id);
    if (ps?.role === "ps" && ps.active !== false && ps.branch_id === sale.branch_id
        && !/^\s*test([^a-z]|$)/i.test(ps.full_name || "") && !/^\s*test([^a-z]|$)/i.test(ps.login_id || "")) {
      update(byPs, ps.id, String(ps.full_name || "Staff member") + " · " + branchName, total, sale.id);
    }
  }
  const scopeNames = branches.filter(branch => ids.has(branch.id)).map(branch => branch.name).sort();
  const scopeLabel = scopeNames.length === 1 ? scopeNames[0] : scopeNames.length + " authorized branches";
  const formatCurrency = value => Number(value.toFixed(2));
  const round = sheet => ({ ...sheet, rows: sheet.rows.map((row, i) =>
    i === 0 ? row : row.map((v, j) => typeof v === "number" && j === row.length - 1 ? formatCurrency(v) : v)) });
  const sheets = [
    { name: "Report information", rows: [
      ["Field", "Value"], ["Report", range.label], ["Branch scope", scopeLabel],
      ["Sales basis", basis], ["Generated", today], ["Source", "Recorded sales visible to this account; test records excluded"],
      ["Notice", "Daily, weekly and monthly summaries do not estimate missing transactions."],
    ] },
    { name: "KPI summary", rows: [
      ["Metric", "Value"], ["Net sales", formatCurrency(net)], ["Transactions", transactions],
      ["Average ticket", transactions ? formatCurrency(net / transactions) : 0],
      ["PS with recorded sales", byPs.size],
    ] },
    round({ name: "By branch", rows: sortedRows(byBranch, ["Branch", "Transactions", "Net sales"]) }),
    round({ name: "By brand", rows: sortedRows(byBrand, ["Brand", "Transactions", "Net sales"]) }),
    round({ name: "By PS", rows: sortedRows(byPs, ["Product Specialist and branch", "Transactions", "Net sales"]) }),
    round({ name: "Daily totals", rows: [...sortedRows(byDate, ["Date", "Transactions", "Net sales"]).slice(0, 1),
      ...[...byDate.values()].sort((a, b) => a.label.localeCompare(b.label)).map(row =>
        [row.label, row.transactions.size, formatCurrency(row.amount)])] }),
  ];
  return { range, transactions, net: formatCurrency(net), sheets };
}
