const test = require("node:test");
const assert = require("node:assert/strict");

test("PS daily trend compares two seven-day windows, zero-base trends remain undefined", async () => {
  const { specialistTrend } = require("./ps-performance.js");
  const days = {
    "2026-11-04": 500, "2026-11-05": 500,
    "2026-11-12": 400, "2026-11-14": 600, "2026-11-18": 1000,
  };
  const trend = specialistTrend(days, "2026-11-18");
  assert.equal(trend.previous, 1000);
  assert.equal(trend.current, 2000);
  assert.equal(trend.changePct, 100);
  assert.equal(trend.series.length, 7);
  assert.equal(trend.series[0].date, "2026-11-12");
  assert.equal(trend.series[6].date, "2026-11-18");
  assert.equal(specialistTrend({}, "2026-11-18").changePct, null);
});

test("PS target pace reports expected value and required selling-day goal without inventing missing targets", async () => {
  const { timePace } = require("./ps-performance.js");
  assert.deepEqual(timePace({ target: 100000, actual: 43000, paceFraction: .5, remainingSellingDays: 10 }),
    { goal: 100000, actual: 43000, expectedByNow: 50000, behindBy: 7000,
      onPace: false, requiredDaily: 5700, achievedPct: 43 });
  assert.equal(timePace({ target: 0, actual: 1000, paceFraction: .5, remainingSellingDays: 10 }), null);
  assert.equal(timePace({ target: null, actual: 0, paceFraction: .5, remainingSellingDays: 10 }), null);
  assert.equal(timePace({ target: 1000, actual: 2000, paceFraction: 1, remainingSellingDays: 0 }).requiredDaily, null);
});
