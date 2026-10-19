/* Pure calculation helpers for the Analytics page. No DOM, no network: unit-tested in analytics.test.js.
   Dates are ISO "YYYY-MM-DD" strings handled in UTC so results never depend on the viewer's time zone. */
(function (root) {
  "use strict";

  const DAY_MS = 86400000;
  const pad = number => String(number).padStart(2, "0");
  const toMs = iso => {
    const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const fromMs = ms => {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };

  const RULES = {
    all: { label: "Every day", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    weekdays: { label: "Weekdays (Monday to Thursday)", weekdays: [1, 2, 3, 4] },
    weekends: { label: "Weekends (Friday to Sunday)", weekdays: [5, 6, 0] },
  };

  function addDays(iso, days) {
    return fromMs(toMs(iso) + days * DAY_MS);
  }

  function weekday(iso) {
    return new Date(toMs(iso)).getUTCDay();
  }

  function daysInMonth(month) {
    const [year, number] = month.split("-").map(Number);
    return new Date(Date.UTC(year, number, 0)).getUTCDate();
  }

  const monthStart = month => `${month}-01`;
  const monthEnd = month => `${month}-${pad(daysInMonth(month))}`;

  function shiftMonth(month, delta) {
    const [year, number] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, number - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  }

  // Monday is the first day of the week.
  function weekStart(iso) {
    const day = weekday(iso);
    return addDays(iso, -(day === 0 ? 6 : day - 1));
  }

  // The same day of the previous month, clamped (Mar 31 -> Feb 28/29).
  function sameDayPriorMonth(iso) {
    const prior = shiftMonth(iso.slice(0, 7), -1);
    return `${prior}-${pad(Math.min(Number(iso.slice(8, 10)), daysInMonth(prior)))}`;
  }

  // The same calendar day of the previous year, clamped (Feb 29 -> Feb 28).
  function sameDayPriorYear(iso) {
    const year = Number(iso.slice(0, 4)) - 1;
    const month = `${year}-${iso.slice(5, 7)}`;
    return `${month}-${pad(Math.min(Number(iso.slice(8, 10)), daysInMonth(month)))}`;
  }

  // null means "no comparison possible" (nothing to compare against), never 0% or infinity.
  function growth(current, previous) {
    const now = Number(current);
    const before = Number(previous);
    if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
    return (now - before) / before;
  }

  function sumDaily(daily, from, to) {
    let total = 0;
    for (const date of Object.keys(daily)) {
      if (date >= from && date <= to) total += daily[date];
    }
    return total;
  }

  function dailyTotals(rows) {
    const daily = {};
    rows.forEach(row => {
      const date = String(row.date).slice(0, 10);
      daily[date] = (daily[date] || 0) + Number(row.amount || 0);
    });
    return daily;
  }

  // Accepts comma, space or newline separated dates; reports entries that are not real calendar dates.
  function parseHolidays(text) {
    const dates = [];
    const invalid = [];
    String(text || "").split(/[\s,;]+/).filter(Boolean).forEach(token => {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(token) && fromMs(toMs(token)) === token;
      if (valid) {
        if (!dates.includes(token)) dates.push(token);
      } else {
        invalid.push(token);
      }
    });
    return { dates, invalid };
  }

  function makeRules(basis, holidayDates) {
    const preset = RULES[basis] || RULES.all;
    return { weekdays: preset.weekdays, holidays: holidayDates || [] };
  }

  function isSellingDay(iso, rules) {
    return rules.weekdays.includes(weekday(iso)) && !rules.holidays.includes(iso);
  }

  function countSellingDays(from, to, rules) {
    if (!from || !to || to < from) return 0;
    let count = 0;
    for (let ms = toMs(from); ms <= toMs(to); ms += DAY_MS) {
      if (isSellingDay(fromMs(ms), rules)) count += 1;
    }
    return count;
  }

  /* Pace-based projection: average daily sales on the selling days that have finished,
     applied to the selling days still to come. Today's partial sales count as actual but today
     is not used to compute the rate. The result is a forecast and is always labelled as one. */
  function forecastMonth({ month, refDate, daily, rules, partialDay = false, minDays = 5 }) {
    const start = monthStart(month);
    const end = monthEnd(month);
    const totalDays = countSellingDays(start, end, rules);
    if (!refDate || refDate < start) {
      return { status: "not-started", value: null, rate: null, totalDays, elapsedDays: 0, remainingDays: totalDays, paceDays: totalDays };
    }
    const actual = sumDaily(daily, start, refDate > end ? end : refDate);
    if (refDate >= end) {
      return { status: "final", value: actual, rate: totalDays ? actual / totalDays : 0, totalDays, elapsedDays: totalDays, remainingDays: 0, paceDays: 0 };
    }
    const rateThrough = partialDay ? addDays(refDate, -1) : refDate;
    const elapsedDays = countSellingDays(start, rateThrough, rules);
    const remainingDays = countSellingDays(addDays(refDate, 1), end, rules);
    const paceDays = remainingDays + (partialDay && isSellingDay(refDate, rules) ? 1 : 0);
    if (!totalDays || elapsedDays < minDays) {
      return { status: "insufficient", value: null, rate: null, totalDays, elapsedDays, remainingDays, paceDays };
    }
    const rate = sumDaily(daily, start, rateThrough) / elapsedDays;
    return { status: "projected", value: actual + rate * remainingDays, rate, totalDays, elapsedDays, remainingDays, paceDays };
  }

  function requiredPace({ target, actual, paceDays }) {
    const goal = Number(target) || 0;
    if (goal <= 0) return { gap: null, perDay: null, met: false };
    const gap = Math.max(goal - actual, 0);
    return { gap, perDay: paceDays > 0 ? gap / paceDays : null, met: actual >= goal };
  }

  // Share of the month's selling days that should be done by now (used to flag "behind pace").
  function expectedFraction({ month, refDate, rules, partialDay = false }) {
    const total = countSellingDays(monthStart(month), monthEnd(month), rules);
    if (!refDate || !total) return null;
    const through = refDate >= monthEnd(month) ? monthEnd(month) : partialDay ? addDays(refDate, -1) : refDate;
    return countSellingDays(monthStart(month), through, rules) / total;
  }

  // Running totals for the chart: solid actuals up to refDate, then a separate forecast path.
  function cumulativeSeries({ month, refDate, daily, rules, rate }) {
    const start = monthStart(month);
    const days = daysInMonth(month);
    const actual = [];
    const forecast = [];
    let running = 0;
    for (let day = 1; day <= days; day += 1) {
      const date = `${month}-${pad(day)}`;
      if (refDate && date <= refDate) {
        running += daily[date] || 0;
        actual.push({ day, value: running });
        if (date === refDate) forecast.push({ day, value: running });
      } else if (refDate && rate != null) {
        if (isSellingDay(date, rules)) running += rate;
        forecast.push({ day, value: running });
      }
    }
    return { actual, forecast, days, start };
  }

  function groupTrend(rows, keyOf, current, previous) {
    const groups = new Map();
    rows.forEach(row => {
      const date = String(row.date).slice(0, 10);
      const inCurrent = date >= current.from && date <= current.to;
      const inPrevious = date >= previous.from && date <= previous.to;
      if (!inCurrent && !inPrevious) return;
      const key = keyOf(row);
      if (!groups.has(key)) groups.set(key, { key, current: 0, previous: 0 });
      const group = groups.get(key);
      if (inCurrent) group.current += Number(row.amount || 0);
      if (inPrevious) group.previous += Number(row.amount || 0);
    });
    const list = [...groups.values()];
    const total = list.reduce((sum, item) => sum + item.current, 0);
    return list
      .map(item => ({ ...item, growth: growth(item.current, item.previous), share: total > 0 ? item.current / total : null }))
      .sort((a, b) => b.current - a.current || String(a.key).localeCompare(String(b.key)));
  }

  function achievement(actual, target) {
    return Number(target) > 0 ? actual / target : null;
  }

  // Best and weakest performers by target achievement; people without a target are left out, never ranked as 0%.
  function topAndBottom(entries, count = 3) {
    const ranked = entries
      .map(entry => ({ ...entry, achievement: achievement(entry.actual, entry.target) }))
      .filter(entry => entry.achievement !== null)
      .sort((a, b) => b.achievement - a.achievement || String(a.name).localeCompare(String(b.name)));
    const topCount = Math.min(count, Math.ceil(ranked.length / 2));
    const bottomCount = Math.min(count, Math.floor(ranked.length / 2));
    return {
      top: ranked.slice(0, topCount),
      bottom: ranked.slice(ranked.length - bottomCount).reverse(),
      ranked: ranked.length,
    };
  }

  const average = (total, count) => (count > 0 ? total / count : null);

  /* Walk-in traffic per branch per day. A whole-store count entered by a manager wins over the sum of the
     PS counts for that day; if none exists, the PS counts are summed. Conversion only uses days that have a
     count, so days with no data never dilute the rate. */
  function walkInSummary({ from, to, storeCounts = [], psCounts = [], transactions = [] }) {
    const inRange = date => date >= from && date <= to;
    const days = new Map();
    const slot = (branchId, date) => {
      const key = `${branchId}|${date}`;
      if (!days.has(key)) days.set(key, { branchId, date, store: null, ps: null });
      return days.get(key);
    };
    storeCounts.forEach(row => {
      const date = String(row.counted_on).slice(0, 10);
      if (inRange(date)) slot(row.branch_id, date).store = Number(row.visitors);
    });
    psCounts.forEach(row => {
      const date = String(row.counted_on).slice(0, 10);
      if (inRange(date)) {
        const entry = slot(row.branch_id, date);
        entry.ps = (entry.ps || 0) + Number(row.clients_assisted);
      }
    });
    let visitors = 0;
    let storeDays = 0;
    let psDays = 0;
    const counted = new Set();
    days.forEach((entry, key) => {
      if (entry.store !== null) { visitors += entry.store; storeDays += 1; counted.add(key); }
      else if (entry.ps !== null) { visitors += entry.ps; psDays += 1; counted.add(key); }
    });
    const matched = new Set(transactions
      .filter(item => counted.has(`${item.branchId}|${item.date}`))
      .map(item => item.id));
    const sales = matched.size;
    return {
      visitors,
      transactions: sales,
      conversion: visitors > 0 ? sales / visitors : null,
      storeDays,
      psDays,
      coveredDays: counted.size,
    };
  }

  const api = {
    RULES, addDays, weekday, daysInMonth, monthStart, monthEnd, shiftMonth, weekStart,
    sameDayPriorMonth, sameDayPriorYear, growth, sumDaily, dailyTotals, parseHolidays, makeRules,
    isSellingDay, countSellingDays, forecastMonth, requiredPace, expectedFraction, cumulativeSeries,
    groupTrend, achievement, topAndBottom, average, walkInSummary,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineAnalytics = api;
})(typeof window !== "undefined" ? window : globalThis);
