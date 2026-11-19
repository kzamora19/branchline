(function (root) {
  "use strict";
// Read-only management attention signals derived from visible branch totals.
// These are NOT push notifications, scheduled tasks or sales forecasts.
function managerAttention({ rows = [], expectedByBranch = {}, unassignedCount = 0, brandRows = [], expectedBrandPace = null, stockAlerts = [], missingCodesCount = 0, declines = [], maxItems = 6 }) {
  const notices = [];
  for (const row of rows) {
    const name = String(row.branch?.name || row.branch || "Branch");
    const target = Number(row.target), actual = Number(row.actual);
    if (!Number.isFinite(actual) || !Number.isFinite(target)) continue;
    if (target <= 0) {
      if (actual > 0) notices.push({ id: "target:" + row.branch?.id, level: "info",
        title: name + " has recorded sales without a target",
        detail: "Set a branch target to enable meaningful progress comparisons." });
      continue;
    }
    const expected = Number(expectedByBranch[row.branch?.id]);
    if (!Number.isFinite(expected) || expected <= 0) continue;
    const progress = actual / target;
    const gap = expected - progress;
    if (gap + 1e-9 < 0.08) continue; // Include thresholds exactly at 8 percentage points despite floating-point rounding.
    notices.push({
      id: "pace:" + row.branch?.id, level: gap >= 0.2 ? "high" : "medium",
      title: name + " is behind sales pace",
      detail: "Recorded progress: " + (progress * 100).toFixed(1) + "% · Expected: "
        + (expected * 100).toFixed(1) + "%. Review branch performance and remaining selling days.",
      gap,
    });
  }
  if (Number(unassignedCount) > 0) notices.push({
    id: "attribution", level: "medium",
    title: Number(unassignedCount) + " sale(s) have no assigned Product Specialist",
    detail: "Review recorded sales attribution before using individual awards or rankings.",
  });
  const expected = Number(expectedBrandPace);
  if (Number.isFinite(expected) && expected > 0) {
    for (const brand of brandRows) {
      const target = Number(brand.target), actual = Number(brand.actual);
      if (!(target > 0) || !Number.isFinite(actual)) continue;
      const gap = expected - actual / target;
      if (gap < 0.15) continue;
      notices.push({ id: "brand:" + brand.brand, level: gap >= .25 ? "high" : "medium",
        title: String(brand.brand || "Brand") + " is behind its target pace",
        detail: "Recorded: " + (actual / target * 100).toFixed(1) + "% · Expected: "
          + (expected * 100).toFixed(1) + "%. Review sell-out and available stock by brand.",
        gap });
    }
  }
  for (const low of stockAlerts) {
    if (!low || !(Number(low.count) > 0)) continue;
    notices.push({ id: "stock:" + low.branch, level: "high",
      title: String(low.branch || "Branch") + ": " + Number(low.count) + " actively sold product(s) at 0–1 unit",
      detail: "Review replenishment and model availability before further selling." });
  }
  if (Number(missingCodesCount) > 0) notices.push({
    id: "missing-codes", level: "medium",
    title: Number(missingCodesCount) + " recorded sale(s) missing salesperson codes",
    detail: "Review import mappings and sales identity before using PS attribution.",
  });
  for (const decline of declines) {
    if (!decline || !(Number(decline.previous) > 0)
        || Number(decline.current) >= Number(decline.previous) * .7) continue;
    notices.push({
      id: "decline:" + decline.branch, level: "medium",
      title: String(decline.branch || "Branch") + " sales declined week over week",
      detail: "Last 7 completed days: " + Number(decline.current / decline.previous * 100).toFixed(1)
        + "% of the previous 7 days. Compare selling days and foot traffic before acting.",
    });
  }
  const level = { high: 0, medium: 1, info: 2 };
  return notices.sort((a, b) => level[a.level] - level[b.level]
    || (b.gap || 0) - (a.gap || 0) || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, Math.min(20, Number(maxItems) || 0)));
}

  root.BranchlineManagerAttention = { managerAttention };
  if (typeof module !== "undefined" && module.exports) module.exports = { managerAttention };
})(typeof window !== "undefined" ? window : globalThis);
