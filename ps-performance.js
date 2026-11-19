(function (root) {
  "use strict";
// Read-only PS trends from recorded, already scoped sale-line totals.
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
  ? new Date(String(value) + "T12:00:00Z") : null;
const iso = value => value.toISOString().slice(0, 10);
const offset = (str, n) => {
  const d = day(str);
  if (!d || Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
function specialistTrend(daily, asOf) {
  if (!day(asOf)) return null;
  const amounts = daily instanceof Map ? daily : new Map(Object.entries(daily || {}));
  const series = Array.from({ length: 7 }, (_, i) => {
    const date = offset(asOf, i - 6);
    const value = Number(amounts.get(date) || 0);
    return { date, amount: Number.isFinite(value) ? value : 0 };
  });
  const current = series.reduce((sum, item) => sum + item.amount, 0);
  let previous = 0;
  for (let i = -13; i <= -7; i++) {
    const amount = Number(amounts.get(offset(asOf, i)) || 0);
    if (Number.isFinite(amount)) previous += amount;
  }
  const changePct = previous > 0 ? (current - previous) / previous * 100 : null;
  return { series, current, previous, changePct };
}
function timePace({ target, actual, paceFraction, remainingSellingDays }) {
  const goal = Number(target), sold = Number(actual), fraction = Number(paceFraction);
  if (!(goal > 0) || !Number.isFinite(sold) || !Number.isFinite(fraction)
      || fraction < 0 || fraction > 1) return null;
  const expectedByNow = goal * fraction;
  const requiredDaily = remainingSellingDays > 0 ? Math.max(0, goal - sold) / remainingSellingDays : null;
  return { goal, actual: sold, expectedByNow, behindBy: Math.max(0, expectedByNow - sold),
    onPace: sold >= expectedByNow, requiredDaily, achievedPct: sold / goal * 100 };
}

  const api = { specialistTrend, timePace };
  root.BranchlinePsPerformance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
