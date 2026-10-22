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

  /* Payment-mix: actual share per payment mode against the managers' targets.
     Per branch a mode target may be a share (percent of that branch's monthly target) and/or a peso amount.
     A peso amount wins; otherwise the share is turned into pesos using the branch target. */
  const UNSPECIFIED = "Unspecified";
  function paymentMix({ sales = [], modes = [], targets = [], branchTargets = new Map(), tolerance = 2 }) {
    const rows = new Map();
    const slot = mode => {
      if (!rows.has(mode)) rows.set(mode, { mode, sales: 0, transactions: 0, peso: null, base: 0, pctSum: 0, pctN: 0, hasShare: false });
      return rows.get(mode);
    };
    modes.forEach(slot);
    let total = 0;
    let totalTransactions = 0;
    sales.forEach(sale => {
      const entry = slot(String(sale.mode || "").trim() || UNSPECIFIED);
      entry.sales += Number(sale.amount) || 0;
      entry.transactions += 1;
      total += Number(sale.amount) || 0;
      totalTransactions += 1;
    });
    targets.forEach(item => {
      const entry = slot(item.mode);
      const branchTarget = Number(branchTargets.get(item.branch_id)) || 0;
      const hasAmount = item.amount !== null && item.amount !== undefined && item.amount !== "";
      const hasShare = item.share_pct !== null && item.share_pct !== undefined && item.share_pct !== "";
      let peso = null;
      if (hasAmount) peso = Number(item.amount);
      else if (hasShare && branchTarget > 0) peso = (Number(item.share_pct) / 100) * branchTarget;
      if (peso !== null) entry.peso = (entry.peso || 0) + peso;
      if (branchTarget > 0) entry.base += branchTarget;
      if (hasShare) { entry.pctSum += Number(item.share_pct); entry.pctN += 1; entry.hasShare = true; }
    });
    const order = new Map(modes.map((mode, index) => [mode, index]));
    const list = [...rows.values()].map(entry => {
      let targetPct = null;
      if (entry.peso !== null && entry.base > 0) targetPct = (entry.peso / entry.base) * 100;
      else if (entry.pctN) targetPct = entry.pctSum / entry.pctN;
      const share = total > 0 ? (entry.sales / total) * 100 : null;
      let status = "none";
      if (targetPct !== null && share !== null) {
        const diff = share - targetPct;
        status = Math.abs(diff) <= tolerance ? "on" : diff > 0 ? "above" : "below";
      } else if (entry.peso !== null && entry.peso > 0) {
        const ratio = entry.sales / entry.peso;
        status = Math.abs(ratio - 1) <= tolerance / 100 ? "on" : ratio > 1 ? "above" : "below";
      }
      return {
        mode: entry.mode,
        sales: entry.sales,
        transactions: entry.transactions,
        share,
        targetPct,
        targetAmount: entry.peso,
        achievement: entry.peso > 0 ? entry.sales / entry.peso : null,
        status,
      };
    }).filter(entry => entry.sales > 0 || entry.transactions > 0 || entry.targetPct !== null || entry.targetAmount !== null)
      .sort((a, b) => (order.has(a.mode) ? order.get(a.mode) : 999) - (order.has(b.mode) ? order.get(b.mode) : 999) || b.sales - a.sales);
    return { rows: list, total, totalTransactions, hasTargets: list.some(entry => entry.targetPct !== null || entry.targetAmount !== null) };
  }

  /* Rule-based diagnosis. Every finding is derived from numbers passed in; causes are labelled as likely
     causes to verify on the floor, never as facts the data cannot prove. */
  function buildInsights(ctx) {
    const fmt = ctx.fmt || (value => String(Math.round(value)));
    const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
    const out = [];
    const add = item => out.push({ levelRank: { high: 0, medium: 1, low: 2, good: 3 }[item.level], ...item });
    const t = ctx.traffic || {};
    const perDay = (value, days) => (days > 0 ? value / days : null);
    const visitorsPerDay = perDay(t.visitors, t.coveredDays);
    const priorVisitorsPerDay = perDay(t.priorVisitors, t.priorCoveredDays);
    const trafficChange = growth(visitorsPerDay, priorVisitorsPerDay);
    const conversionDrop = t.conversion !== null && t.conversion !== undefined && t.priorConversion !== null && t.priorConversion !== undefined
      ? t.conversion - t.priorConversion : null;
    const ticketChange = growth(t.avgTicket, t.priorAvgTicket);
    const salesGrowth = ctx.mtd ? growth(ctx.mtd.sales, ctx.mtd.priorSales) : null;

    const drivers = [];
    if (trafficChange !== null && trafficChange <= -0.05) drivers.push({ key: "traffic", text: `walk-in traffic is down ${pct(-trafficChange)} per counted day (${Math.round(visitorsPerDay)} vs ${Math.round(priorVisitorsPerDay)})` });
    if (conversionDrop !== null && conversionDrop <= -0.01) drivers.push({ key: "conversion", text: `conversion fell ${(-conversionDrop * 100).toFixed(1)} points (${pct(t.conversion)} vs ${pct(t.priorConversion)})` });
    if (ticketChange !== null && ticketChange <= -0.05) drivers.push({ key: "ticket", text: `the average sale is down ${pct(-ticketChange)} (${fmt(t.avgTicket)} vs ${fmt(t.priorAvgTicket)})` });
    const dataGaps = [];
    if (!t.coveredDays) dataGaps.push("No walk-in counts are recorded this period, so traffic and conversion cannot be checked.");
    else if (ctx.elapsedDays && t.coveredDays < Math.ceil(ctx.elapsedDays * 0.5)) dataGaps.push(`Walk-ins are counted on only ${t.coveredDays} of ${ctx.elapsedDays} days, so conversion is a partial view.`);

    // 1. Target pace
    if (ctx.target > 0 && ctx.achievement !== null && ctx.expected !== null) {
      const gapPts = ctx.expected - ctx.achievement;
      const forecastShort = ctx.forecast && ctx.forecast.status === "projected" ? ctx.target - ctx.forecast.value : null;
      if (gapPts > 0.05) {
        const causes = drivers.length
          ? drivers.map(d => `Compared with the prior period, ${d.text}.`)
          : [t.coveredDays ? "Traffic, conversion and average sale are all steady against the prior period, so the shortfall looks like a volume or target-setting gap rather than one broken step." : "The cause cannot be pinned down without walk-in counts; sales volume is simply behind the target pace."];
        if (salesGrowth !== null && salesGrowth < 0) causes.push(`Month-to-date sales are ${pct(-salesGrowth)} below the same days last month.`);
        add({
          id: "pace", level: gapPts > 0.15 ? "high" : "medium", area: "Target pace",
          title: `Behind target pace by ${(gapPts * 100).toFixed(1)} points`,
          finding: `${pct(ctx.achievement)} of the ${fmt(ctx.target)} target is done, against ${pct(ctx.expected)} expected by now.`,
          causes: dataGaps.length ? [...causes, ...dataGaps] : causes,
          effects: [forecastShort !== null && forecastShort > 0 ? `At the current rate the month ends about ${fmt(forecastShort)} short of target (forecast ${fmt(ctx.forecast.value)}).` : "If the pace does not change, the target will be missed.", "Missing the target lowers the branch's share of the district result and the PS incentive base."],
          plans: [ctx.pace && ctx.pace.perDay != null ? `Aim for ${fmt(ctx.pace.perDay)} per remaining selling day to still reach target.` : "Review the remaining days with the branch manager.", ...planForDrivers(drivers), "Check the weekend (Fri–Sun) schedule: fully staff the brands that sell most."],
        });
      } else if (ctx.achievement >= ctx.expected) {
        add({ id: "pace-ok", level: "good", area: "Target pace", title: "On or ahead of target pace", finding: `${pct(ctx.achievement)} done against ${pct(ctx.expected)} expected.`, causes: [], effects: ["The target is on course if this rate holds."], plans: ["Protect the lead: keep stock of the top brands and avoid discount-driven sales that erode margin."] });
      }
    } else if (!(ctx.target > 0)) {
      add({ id: "no-target", level: "medium", area: "Data", title: "No target set for this selection", finding: "Pace, achievement and PS ranking cannot be judged without a target.", causes: ["The branch target for this month has not been entered."], effects: ["Underperformance goes unnoticed and PS targets show as zero."], plans: ["Ask the branch manager to set the monthly target in Targets."] });
    }

    // 2. Traffic and conversion health
    if (t.coveredDays && t.conversion !== null && t.conversion !== undefined && !drivers.some(d => d.key === "conversion")) {
      if (t.conversion < 0.15) {
        add({ id: "low-conv", level: "medium", area: "Conversion", title: `Low conversion (${pct(t.conversion)})`, finding: `${t.transactions} sale(s) from ${t.visitors} visitors on counted days.`,
          causes: ["Likely causes (verify on the floor): visitors browsing without a PS approach, stock or price not matching what visitors ask for, weak closing of financing/instalment offers.", ...dataGaps],
          effects: ["Most store traffic is leaving without buying, so more foot traffic alone will not lift sales."],
          plans: ["Ask every PS to greet and qualify each visitor and record the reason for no sale for one week.", "Run a short coaching round on closing and the financing options.", "Compare PS conversion to find who to learn from."] });
      }
    }
    drivers.forEach(driver => {
      if (driver.key === "traffic") add({ id: "traffic", level: trafficChange <= -0.15 ? "high" : "medium", area: "Traffic", title: "Walk-in traffic is falling", finding: `Traffic ${driver.text}.`, causes: ["Likely causes (verify): weaker promotions or advertising, fewer paydays/holidays in the period, competitor activity, mall or road disruption."], effects: ["Fewer visitors means fewer chances to sell; sales fall even if conversion holds."], plans: ["Plan a promotion or social post around the next payday weekend.", "Invite past customers and warm leads to visit.", "Check whether store-closed days or events reduced opening hours."] });
      if (driver.key === "conversion") add({ id: "conv-drop", level: "high", area: "Conversion", title: "Conversion is dropping", finding: `Conversion ${driver.text}.`, causes: ["Likely causes (verify): stock-outs on requested models, prices above competitors, PS absent or busy at peak hours, a change in staffing."], effects: ["Traffic is being wasted: the same visitors produce fewer sales."], plans: ["Review stock availability for the best-selling models.", "Ensure PS coverage at peak hours (weekends, paydays).", "Review recent price or promo changes."] });
      if (driver.key === "ticket") add({ id: "ticket", level: "medium", area: "Average sale", title: "Average sale value is shrinking", finding: `Customers are spending less per sale: ${driver.text}.`, causes: ["Likely causes (verify): more low-price items, heavier discounting, fewer big-ticket sales (aircon, TV, refrigerator)."], effects: ["Sales fall even when the number of transactions holds."], plans: ["Train PS on add-ons and step-up models.", "Feature big-ticket items with financing offers."] });
    });
    if (dataGaps.length && !out.some(item => item.id === "pace")) {
      add({ id: "walkin-gap", level: "low", area: "Data", title: "Walk-in counts are incomplete", finding: dataGaps[0], causes: ["Store visitors or PS clients assisted are not being logged every day."], effects: ["Conversion and traffic diagnosis are unreliable, so root causes are guesses."], plans: ["Make daily walk-in logging part of the opening/closing routine (store visitors by the manager, clients assisted by PS)."] });
    }

    // 3. Brands
    const brands = ctx.brands || [];
    const declining = brands.filter(b => b.growth !== null && b.growth <= -0.15 && b.previous > 0 && b.previous >= (ctx.priorBrandTotal || 0) * 0.05).slice(0, 3);
    declining.forEach(b => add({
      id: `brand-${b.key}`, level: b.growth <= -0.3 ? "high" : "medium", area: "Brand", title: `${b.key} is down ${pct(-b.growth, 0)}`,
      finding: `${fmt(b.current)} vs ${fmt(b.previous)} in the prior period.`,
      causes: ["Likely causes (verify): low stock or missing models, a competitor promo, the brand's PS absent or inactive, price changes, end of a campaign."],
      effects: [`The brand's lost sales (${fmt(b.previous - b.current)}) widen the gap to the branch target.`],
      plans: [`Confirm stock and display of ${b.key} models.`, `Ask the ${b.key} PS for the three top customer objections and act on them.`, "Consider a short brand promotion or bundle."],
    }));
    const top = brands[0];
    if (top && top.share !== null && top.share >= 0.5 && brands.length > 1) {
      add({ id: "concentration", level: "low", area: "Brand mix", title: `${top.key} carries ${pct(top.share, 0)} of sales`, finding: "Sales depend heavily on one brand.", causes: ["Other brands are under-performing or under-promoted."], effects: ["A stock-out or promo change from this brand would swing the whole branch result."], plans: ["Set growth targets for the next two brands and promote them on the floor."] });
    }

    // 4. Product specialists
    const ps = (ctx.ps || []).filter(entry => entry.achievement !== null);
    if (ps.length && ctx.expected !== null) {
      const behind = ps.filter(entry => entry.achievement < ctx.expected - 0.05);
      const zero = (ctx.ps || []).filter(entry => entry.actual <= 0);
      if (behind.length) {
        add({ id: "ps-behind", level: behind.length / ps.length > 0.5 ? "high" : "medium", area: "Product specialists", title: `${behind.length} of ${ps.length} PS are behind pace`,
          finding: `Lowest: ${behind.slice().sort((a, b) => a.achievement - b.achievement).slice(0, 3).map(entry => `${entry.name} (${pct(entry.achievement, 0)})`).join(", ")}.`,
          causes: ["Likely causes (verify): brand with seasonal or slow demand, low traffic at that PS's category, schedule/leave, or a target that is too high for the brand."],
          effects: ["The branch target rests on fewer people, raising the required pace for the rest."],
          plans: ["Hold a one-to-one with each lagging PS: agree a daily sales and client-contact goal.", "Pair lagging PS with a strong PS for floor coaching.", "Review whether the individual target fits the brand's potential."] });
      }
      if (zero.length) {
        add({ id: "ps-zero", level: "medium", area: "Product specialists", title: `${zero.length} PS with no sales this period`, finding: zero.slice(0, 5).map(entry => entry.name).join(", ") + ".", causes: ["Not yet recorded, on leave, new hires, or sales entered under another PS."], effects: ["Their share of the branch target is not being covered."], plans: ["Confirm each PS's status and that their sales are being recorded under their own name."] });
      }
    }

    // 5. Payment mix
    const mix = ctx.paymentMix;
    if (mix && mix.total > 0) {
      const off = mix.rows.filter(row => row.status === "below" || row.status === "above");
      if (mix.hasTargets && off.length) {
        const worst = off.slice().sort((a, b) => Math.abs((b.share || 0) - (b.targetPct || 0)) - Math.abs((a.share || 0) - (a.targetPct || 0)))[0];
        add({ id: "mix", level: "medium", area: "Payment mix", title: `${off.length} payment mode(s) off the target mix`,
          finding: off.slice(0, 4).map(row => `${row.mode}: ${row.share === null ? "n/a" : row.share.toFixed(1) + "%"} vs ${row.targetPct === null ? "peso target" : row.targetPct.toFixed(1) + "%"} target`).join("; ") + ".",
          causes: [`Likely causes (verify): customers choose the mode that is easiest to offer; ${worst.mode} is ${worst.status === "below" ? "not being pushed" : "over-used"} at the counter.`],
          effects: ["A skewed mix changes cash flow, financing cost and the commission mix."],
          plans: ["Brief PS on the target mix and the benefits of each mode.", "Promote the under-used mode (e.g. instalment plan, card promo) at the point of sale.", "Review mix again next week."] });
      }
      const unspecified = mix.rows.find(row => row.mode === UNSPECIFIED);
      if (unspecified && mix.total > 0 && unspecified.sales / mix.total > 0.1) {
        add({ id: "mix-blank", level: "low", area: "Data", title: "Many sales have no payment mode", finding: `${pct(unspecified.sales / mix.total, 0)} of sales value has no payment mode recorded.`, causes: ["Older entries made before payment modes existed, or the field is skipped."], effects: ["The payment-mix pie understates the real mix."], plans: ["Make the payment mode required when entering a sale and correct old entries."] });
      }
    }

    // 6. Pricing / discounting against SRP
    const pr = ctx.pricing;
    if (pr && pr.srpBasis > 0) {
      const ratio = pr.sold / pr.srpBasis;
      if (ratio < 0.92) {
        add({ id: "discount", level: ratio < 0.85 ? "high" : "medium", area: "Pricing", title: `Selling at ${pct(ratio)} of SRP on average`, finding: `Recorded prices are about ${pct(1 - ratio)} below SRP on lines that have an SRP.`,
          causes: ["Likely causes (verify): promotional pricing, negotiated discounts, or SRP outdated in the catalog."],
          effects: ["Sales volume may be held up by price cuts at the cost of margin."],
          plans: ["Set a discount ceiling by brand and require manager approval beyond it.", "Check the catalog SRPs are current."] });
      }
    }

    // 7. Growth highlights
    if (salesGrowth !== null && salesGrowth >= 0.1 && !out.some(item => item.id === "pace")) {
      add({ id: "growth", level: "good", area: "Growth", title: `Sales up ${pct(salesGrowth)} on last month`, finding: "Month-to-date sales are ahead of the same days last month.", causes: [], effects: ["Momentum improves the chance of reaching target."], plans: ["Identify which brand or PS drove the lift and repeat it."] });
    }
    return out.sort((a, b) => a.levelRank - b.levelRank);
  }

  function planForDrivers(drivers) {
    const plans = [];
    drivers.forEach(driver => {
      if (driver.key === "traffic") plans.push("Run a traffic builder: payday promo, social post, and call-outs to past customers.");
      if (driver.key === "conversion") plans.push("Improve conversion: PS approach every visitor, check stock of requested models, push financing offers.");
      if (driver.key === "ticket") plans.push("Lift the average sale: step-up models, bundles and add-ons.");
    });
    return plans;
  }

  function inventorySummary({ catalog, stock, serials, facts, branchIds, today, from, to }) {
    const key = row => `${row.branch_id}\0${row.barcode}`;
    const stocks = new Map(stock.map(row => [key(row), row]));
    const rows = new Map();
    for (const item of catalog) {
      if (!branchIds.has(item.branch_id)) continue;
      const tracked = stocks.get(key(item));
      rows.set(key(item), { ...item, quantity: tracked ? Number(tracked.quantity) : null,
        serialized: tracked ? tracked.serialized : null, sold: 0, sales: 0,
        current: 0, days30: 0, days60: 0, days90: 0, unknown: 0 });
    }
    for (const unit of serials) {
      const row = rows.get(key(unit));
      if (!row || unit.status !== "available") continue;
      const age = unit.received_on ? (toMs(today) - toMs(unit.received_on)) / DAY_MS : NaN;
      const band = !Number.isFinite(age) || age < 0 ? "unknown"
        : age < 30 ? "current" : age < 60 ? "days30" : age < 90 ? "days60" : "days90";
      row[band] += 1;
    }
    for (const fact of facts) {
      if (fact.date < from || fact.date > to || fact.summary) continue;
      const row = rows.get(`${fact.branchId}\0${fact.barcode}`);
      if (row) { row.sold += Number(fact.quantity) || 0; row.sales += fact.amount; }
    }
    const products = [...rows.values()];
    const total = field => products.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
    return { products, units: total("quantity"), tracked: products.filter(row => row.quantity !== null).length,
      uninitialized: products.filter(row => row.quantity === null).length,
      stockouts: products.filter(row => row.quantity === 0).length,
      unclassified: products.filter(row => !String(row.brand || "").trim() || String(row.brand).trim().toLowerCase() === "unclassified" || !String(row.category || "").trim()).length,
      current: total("current"), days30: total("days30"), days60: total("days60"), days90: total("days90"), unknown: total("unknown"),
      missingSrp: products.filter(row => row.missing_srp).length };
  }

  function salesSummary(facts, keyOf) {
    const groups = new Map();
    for (const fact of facts) {
      const key = keyOf(fact);
      if (!groups.has(key)) groups.set(key, { key, sales: 0, units: 0, unknownUnits: false, transactions: new Set() });
      const row = groups.get(key);
      row.sales += fact.amount;
      row.units += Number(fact.quantity) || 0;
      if (fact.summary) row.unknownUnits = true;
      row.transactions.add(fact.saleId);
    }
    return [...groups.values()].map(row => ({ ...row, transactions: row.transactions.size }))
      .sort((a, b) => b.sales - a.sales || a.key.localeCompare(b.key));
  }

  const api = {
    inventorySummary, salesSummary,
    paymentMix, buildInsights, UNSPECIFIED,
    RULES, addDays, weekday, daysInMonth, monthStart, monthEnd, shiftMonth, weekStart,
    sameDayPriorMonth, sameDayPriorYear, growth, sumDaily, dailyTotals, parseHolidays, makeRules,
    isSellingDay, countSellingDays, forecastMonth, requiredPace, expectedFraction, cumulativeSeries,
    groupTrend, achievement, topAndBottom, average, walkInSummary,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BranchlineAnalytics = api;
})(typeof window !== "undefined" ? window : globalThis);
