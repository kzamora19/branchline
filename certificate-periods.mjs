// Pure reporting-window definition. Rankings must always be recalculated for
// the selected certificate period rather than relabeling a dashboard ranking.
export function certificatePeriodRange(kind, selectedValue, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) ||
      new Date(today + "T12:00:00Z").toISOString().slice(0, 10) !== today) {
    throw new Error("A valid issue date is required.");
  }
  if (!["monthly", "annual"].includes(kind)) {
    throw new Error("Select a monthly or annual certificate.");
  }
  const value = String(selectedValue ?? "");
  const valid = kind === "monthly" ? /^\d{4}-(0[1-9]|1[0-2])$/.test(value) : /^(19|20|21)\d{2}$/.test(value);
  if (!valid) throw new Error("Select a valid calendar month or year.");
  const year = Number(value.slice(0, 4));
  const month = kind === "monthly" ? Number(value.slice(5, 7)) : 12;
  const from = kind === "monthly" ? value + "-01" : value + "-01-01";
  const finalDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (from > today) throw new Error("Certificates cannot be issued for a future period.");
  const through = finalDay < today ? finalDay : today;
  const current = through < finalDay;
  const base = kind === "monthly"
    ? new Date(value + "-01T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) + " • Monthly Performance"
    : "Year " + value + " • Annual Performance";
  return {
    kind,
    from,
    through,
    label: current ? base + " (through " + through + ")" : base,
    fileKey: kind === "monthly" ? "monthly-" + value : "annual-" + value,
    partial: current,
  };
}
