(() => {
  "use strict";

  const config = window.BRANCHLINE_SUPABASE_CONFIG;
  const authScreen = document.querySelector("#auth-screen");
  const authMessage = document.querySelector("#auth-message");
  const configWarning = document.querySelector("#auth-config-warning");
  const demoApp = document.querySelector("#demo-app");
  const connectedShell = document.querySelector("#connected-shell");
  const connectedContent = document.querySelector("#connected-content");
  const connectedNav = document.querySelector("#connected-nav");
  const connectedSidebar = document.querySelector(".connected-sidebar");
  const loginForm = document.querySelector("#login-form");
  const roleLabels = {
    ps: "Product Specialist",
    manager: "Branch Manager",
    district_manager: "District Manager",
    admin: "Administrator",
  };
  const roleRank = { admin: 0, district_manager: 1, manager: 2, ps: 3 };
  const pageLabels = {
    overview: "Overview",
    sales: "Sales",
    targets: "Targets",
    products: "Products",
    users: "People & access",
  };
  const rolePages = {
    ps: ["overview", "sales"],
    manager: ["overview", "sales", "targets", "products"],
    district_manager: ["overview", "sales", "targets", "products"],
    admin: ["overview", "sales", "targets", "products", "users"],
  };
  const PAGE_SIZE = 10;
  const PERCENT_DECIMALS = 4;
  const PIE_COLORS = ["#355ee8", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#64748b"];

  let client = null;
  let currentSession = null;
  let currentProfile = null;
  let liveData = null;
  let activePage = "overview";
  let loadSequence = 0;
  let resultsView = null;
  const ui = { period: "month", month: "", district: "", branch: "", date: "", search: "", rankBrand: "", rankCategory: "", rankSub: "", pages: {} };

  function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle("error", isError);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function formatMoney(value) {
    const amount = Number(value);
    return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  const parseCurrency = window.parseCurrency;
  const formatCurrencyInput = window.formatCurrencyInput;

  function localISODate(date = new Date()) {
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function currentMonth() {
    return localISODate().slice(0, 7);
  }

  function monthLabel(month) {
    return new Date(`${month}-01T12:00:00`).toLocaleDateString("en", { month: "long", year: "numeric" });
  }

  function natural(a, b) {
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
  }

  function percent(actual, target, decimals = PERCENT_DECIMALS) {
    return target > 0 ? `${((actual / target) * 100).toFixed(decimals)}%` : "—";
  }

  function rolePageAllowed(page) {
    return (rolePages[currentProfile?.role] || []).includes(page);
  }

  function connectedUserLabel() {
    return currentProfile?.full_name || currentSession?.user?.email || "Signed-in user";
  }

  function resetUi() {
    ui.period = "month";
    ui.month = "";
    ui.district = "";
    ui.branch = "";
    ui.date = "";
    ui.search = "";
    ui.pages = {};
  }

  function setWorkspaceMode(mode) {
    authScreen.hidden = true;
    connectedShell.hidden = mode !== "connected";
    demoApp.hidden = mode !== "demo";
  }

  function clearWorkspace() {
    loadSequence += 1;
    currentSession = null;
    currentProfile = null;
    liveData = null;
    resultsView = null;
    activePage = "overview";
    resetUi();
    connectedSidebar.classList.remove("open");
    connectedShell.hidden = true;
    demoApp.hidden = true;
    authScreen.hidden = false;
    setAuthMessage("");
    loginForm.reset();
    loginForm.elements.password.type = "password";
  }

  function showProfileError(message) {
    currentProfile = null;
    liveData = null;
    resultsView = null;
    connectedShell.hidden = true;
    authScreen.hidden = false;
    setAuthMessage(message, true);
  }

  function checkResult(result, description) {
    if (result.error) {
      throw new Error(`${description}: ${result.error.message}`);
    }
    return result.data;
  }

  // PostgREST caps each response at 1000 rows, so read larger tables page by page.
  async function fetchAll(table, columns, orders, refine) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let query = client.from(table).select(columns);
      if (refine) query = refine(query);
      orders.forEach(([column, ascending]) => { query = query.order(column, { ascending }); });
      const { data, error } = await query.range(from, from + 999);
      if (error) return { data: null, error };
      rows.push(...data);
      if (data.length < 1000) return { data: rows, error: null };
    }
  }

  // Standard letter casing for typed names: only plain all-caps or all-lowercase words are changed,
  // so model codes (HFSWD-1900BL, 128GB) and mixed-case names (iPhone) are left alone.
  function titleCase(text) {
    if (text == null) return text;
    return String(text).trim().replace(/\s+/g, " ").split(" ").map(word => {
      if (/\d/.test(word)) return word;
      if (word !== word.toUpperCase() && word !== word.toLowerCase()) return word;
      return word.toLowerCase().replace(/(^|[-'/(])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
    }).join(" ");
  }

  // Numeric barcodes are always 8 digits (32690 -> 00032690); other codes are kept as typed.
  function normBarcode(text) {
    const value = String(text ?? "").trim();
    return /^\d{1,7}$/.test(value) ? value.padStart(8, "0") : value;
  }

  const PAYMENT_FALLBACK = ["Cash", "Debit Card", "Credit Card", "Cheque", "Online Payment / Bank Transfer", "Home Credit", "Flexi Deals"];
  const CATEGORY_SEEDS = { Aircon: ["Commercial", "Floor Mounted", "Split Type", "Window Type", "Portable"] };

  async function loadLiveWorkspace(session) {
    const sequence = ++loadSequence;
    currentSession = session;
    setWorkspaceMode("connected");
    connectedContent.innerHTML = '<div class="app-loader" role="status" aria-label="Loading"><svg viewBox="0 0 512 512" width="84" height="84" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#355ee8"/><g fill="#fff"><rect class="ldr-bar b1" x="124" y="267" width="56" height="133" rx="20"/><rect class="ldr-bar b2" x="228" y="164" width="56" height="236" rx="20"/><rect class="ldr-bar b3" x="332" y="306" width="56" height="94" rx="20"/></g></svg><span>Loading…</span></div>';

    try {
      const profile = checkResult(await client
        .from("profiles")
        .select("id,dealer_id,district_id,branch_id,role,assigned_brand,full_name,active")
        .eq("id", session.user.id)
        .maybeSingle(), "Unable to load your account");

      if (!profile) {
        throw new Error("Your login has no Branchline profile yet. Ask an administrator to assign your role and district.");
      }
      if (!Object.hasOwn(roleLabels, profile.role)) {
        throw new Error("Your account has an unsupported role. Contact your administrator.");
      }
      if (!profile.active) {
        throw new Error("Your Branchline account is disabled. Contact your administrator.");
      }

      currentProfile = { ...profile, full_name: titleCase(profile.full_name), assigned_brand: titleCase(profile.assigned_brand) };
      const isPsUser = profile.role === "ps";
      // Every branch holds an identical copy of the catalog, so one branch's copy is enough (keeps the app fast).
      let catalogBranch = profile.branch_id;
      if (!catalogBranch) {
        const probe = await client.from("products").select("branch_id").eq("active", true).limit(1);
        catalogBranch = probe.data?.[0]?.branch_id || null;
      }
      const [branches, districts, targets, sales, products, profiles, brandTargets, saleLines, managerLinks, brandSales, paymentModes] = await Promise.all([
        fetchAll("branches", "id,name,district_id", [["name", true], ["id", true]]),
        fetchAll("districts", "id,name", [["name", true], ["id", true]]),
        fetchAll("monthly_targets", "id,branch_id,month,amount", [["month", false], ["id", true]]),
        fetchAll("sales",         "id,branch_id,ps_id,customer_name,invoice_number,sold_on,payment_mode,created_at,updated_at", [["sold_on", false], ["id", true]]),
                fetchAll("products", "id,branch_id,barcode,model_description,brand,category,sub_category,active,srp", [["model_description", true], ["id", true]], query => (catalogBranch ? query.eq("branch_id", catalogBranch) : query).eq("active", true)),
        fetchAll("profiles", "id,full_name,role,branch_id,district_id,assigned_brand,active,login_id,email", [["id", true]]),
        fetchAll("brand_targets", "id,branch_id,month,brand,amount", [["month", false], ["id", true]]),
        fetchAll("sale_lines",         "id,sale_id,barcode,model_description,brand,category,sub_category,srp,selling_price,quantity", [["id", true]]),
        fetchAll("manager_branches", "manager_id,branch_id", [["manager_id", true], ["branch_id", true]]),
        isPsUser ? client.rpc("brand_branch_sales") : Promise.resolve({ data: [], error: null }),
                fetchAll("payment_modes", "id,name,position", [["position", true], ["name", true]]),
              ]);

      const visibleBranches = checkResult(branches, "Unable to load accessible branches").map(item => ({ ...item, name: titleCase(item.name) }));
      const visibleDistricts = checkResult(districts, "Unable to load accessible districts").map(item => ({ ...item, name: titleCase(item.name) }));
      const visibleTargets = checkResult(targets, "Unable to load accessible targets");
      const visibleSales = checkResult(sales, "Unable to load accessible sales").map(item => ({ ...item, customer_name: titleCase(item.customer_name) }));
      const visibleProducts = checkResult(products, "Unable to load the product catalog")
        .map(item => ({ ...item, brand: titleCase(item.brand), model_description: titleCase(item.model_description), category: titleCase(item.category) || "", sub_category: titleCase(item.sub_category) || "" }));
      const visibleProfiles = checkResult(profiles, "Unable to load accessible staff profiles")
        .map(item => ({ ...item, full_name: titleCase(item.full_name), assigned_brand: titleCase(item.assigned_brand) }));
      if (brandTargets.error) console.warn("Brand targets are unavailable.", brandTargets.error);

      const lines = checkResult(saleLines, "Unable to load sale details")
        .map(item => ({ ...item, brand: titleCase(item.brand), model_description: titleCase(item.model_description), category: titleCase(item.category) || "", sub_category: titleCase(item.sub_category) || "" }));
      if (managerLinks.error) console.warn("Manager branches are unavailable.", managerLinks.error);
      if (brandSales.error) console.warn("Brand sales are unavailable.", brandSales.error);

      if (sequence !== loadSequence || !currentSession) return;

      const linesBySale = new Map();
      lines.forEach(line => {
        if (!linesBySale.has(line.sale_id)) linesBySale.set(line.sale_id, []);
        linesBySale.get(line.sale_id).push(line);
      });

      liveData = {
        branches: visibleBranches,
        districts: visibleDistricts,
        targets: visibleTargets,
        brandTargets: brandTargets.error ? [] : brandTargets.data.map(item => ({ ...item, brand: titleCase(item.brand) })),
        sales: visibleSales,
        saleLines: lines,
        linesBySale,
        products: visibleProducts,
        profiles: visibleProfiles,
        managerLinks: managerLinks.error ? [] : managerLinks.data,
        paymentModes: paymentModes.error || !paymentModes.data.length
          ? PAYMENT_FALLBACK.map((name, index) => ({ id: "", name, position: index + 1 }))
          : paymentModes.data,
        brandSales: brandSales.error ? [] : (brandSales.data || []).map(item => ({
          ...item,
          brand: titleCase(item.brand),
          model_description: titleCase(item.model_description),
          ps_name: titleCase(item.ps_name),
        })),
      };

      document.querySelector("#connected-user-name").textContent = connectedUserLabel();
      const ownDistrict = visibleDistricts.find(item => item.id === profile.district_id)?.name;
      const roleDetail = profile.role === "ps"
        ? `${roleLabels[profile.role]}${profile.assigned_brand ? ` · ${profile.assigned_brand}` : ""}`
        : profile.role === "manager" && visibleBranches.length
          ? `${roleLabels[profile.role]} · ${visibleBranches.map(item => item.name).join(", ")}`
          : profile.role === "district_manager" && ownDistrict
            ? `${roleLabels[profile.role]} · ${ownDistrict}`
            : roleLabels[profile.role];
      document.querySelector("#connected-user-role").textContent = roleDetail;
      if (!ui.month) ui.month = currentMonth();
      activePage = rolePageAllowed(activePage) ? activePage : "overview";
      renderConnected();
    } catch (error) {
      if (sequence !== loadSequence) return;
      console.error("Unable to load the authenticated Branchline workspace.", error);
      showProfileError(error.message || "Unable to load your workspace. Try again or contact your administrator.");
    }
  }

  function branchName(branchId) {
    return liveData?.branches.find(branch => branch.id === branchId)?.name || "Unavailable branch";
  }

  function districtName(districtId) {
    return liveData?.districts.find(district => district.id === districtId)?.name || "—";
  }

  function branchDistrictName(branchId) {
    return districtName(liveData.branches.find(branch => branch.id === branchId)?.district_id);
  }

  function linesForSale(saleId) {
    return liveData.linesBySale.get(saleId) || [];
  }

  function saleTotal(sale) {
    return linesForSale(sale.id).reduce((total, line) =>
      total + Number(line.selling_price) * Number(line.quantity), 0);
  }

  function periodDay() {
    return ui.date || localISODate();
  }

  // Month used to anchor targets and year-to-date totals for the selected period.
  function anchorMonth() {
    return ui.period === "day" ? periodDay().slice(0, 7) : ui.month;
  }

  function inPeriod(dateText) {
    const text = String(dateText ?? "");
    if (ui.period === "day") return text.slice(0, 10) === periodDay();
    if (ui.period === "year") return text.slice(0, 4) === ui.month.slice(0, 4) && text.slice(0, 7) <= ui.month;
    return text.slice(0, 7) === ui.month;
  }

  // Charts and totals for a single day show the month so far, up to and including that day.
  function inStatus(dateText) {
    if (ui.period !== "day") return inPeriod(dateText);
    const text = String(dateText ?? "").slice(0, 10);
    const day = periodDay();
    return text.slice(0, 7) === day.slice(0, 7) && text <= day;
  }

  function statusLabel() {
    if (ui.period !== "day") return periodLabel();
    const day = periodDay();
    const month = new Date(`${day}T12:00:00`).toLocaleDateString("en", { month: "long", year: "numeric" });
    const [monthName, year] = month.split(" ");
    return `${monthName} 1–${Number(day.slice(8, 10))}, ${year}`;
  }

  function targetInPeriod(monthText) {
    const text = String(monthText ?? "").slice(0, 7);
    const anchor = anchorMonth();
    if (ui.period === "year") return text.slice(0, 4) === anchor.slice(0, 4) && text <= anchor;
    return text === anchor;
  }

  function periodLabel() {
    if (ui.period === "day") {
      return new Date(`${periodDay()}T12:00:00`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
    }
    if (ui.period === "year") return `Year to date ${ui.month.slice(0, 4)} (through ${monthLabel(ui.month).split(" ")[0]})`;
    return monthLabel(ui.month);
  }

  function addTo(map, key, amount) {
    map.set(key, (map.get(key) || 0) + amount);
  }

  function visibleSales() {
    return liveData.sales.filter(sale => currentProfile.role !== "ps" || sale.ps_id === currentProfile.id);
  }

  function scopeBranchIds() {
    return new Set(liveData.branches
      .filter(branch => (!ui.district || branch.district_id === ui.district) && (!ui.branch || branch.id === ui.branch))
      .map(branch => branch.id));
  }

  function availableMonths() {
    const months = new Set([currentMonth(), ui.month].filter(Boolean));
    liveData.sales.forEach(sale => sale.sold_on && months.add(sale.sold_on.slice(0, 7)));
    liveData.targets.forEach(target => months.add(target.month.slice(0, 7)));
    return [...months].sort().reverse();
  }

  function branchRows() {
    const ids = scopeBranchIds();
    const month = anchorMonth();
    const year = month.slice(0, 4);
    const actual = new Map();
    const ytd = new Map();
    liveData.sales.forEach(sale => {
      if (!ids.has(sale.branch_id)) return;
      const saleMonth = sale.sold_on.slice(0, 7);
      const total = saleTotal(sale);
      if (inStatus(sale.sold_on)) addTo(actual, sale.branch_id, total);
      if (saleMonth.slice(0, 4) === year && saleMonth <= month) addTo(ytd, sale.branch_id, total);
    });
    const target = new Map();
    const ytdTarget = new Map();
    liveData.targets.forEach(row => {
      if (!ids.has(row.branch_id)) return;
      const rowMonth = row.month.slice(0, 7);
      if (targetInPeriod(row.month)) addTo(target, row.branch_id, Number(row.amount));
      if (rowMonth.slice(0, 4) === year && rowMonth <= month) addTo(ytdTarget, row.branch_id, Number(row.amount));
    });
    return liveData.branches.filter(branch => ids.has(branch.id)).map(branch => ({
      branch,
      district: districtName(branch.district_id),
      actual: actual.get(branch.id) || 0,
      target: target.get(branch.id) || 0,
      ytd: ytd.get(branch.id) || 0,
      ytdTarget: ytdTarget.get(branch.id) || 0,
    })).sort((a, b) => natural(a.district, b.district) || natural(a.branch.name, b.branch.name));
  }

  function brandRows() {
    const ids = scopeBranchIds();
    const actual = new Map();
    const target = new Map();
    const categories = new Map();
    const subs = new Map();
    const remember = (map, brand, value) => {
      if (!value) return;
      if (!map.has(brand)) map.set(brand, new Set());
      map.get(brand).add(value);
    };
    liveData.sales.forEach(sale => {
      if (!ids.has(sale.branch_id) || !inStatus(sale.sold_on)) return;
      linesForSale(sale.id).forEach(line => {
        const brand = (line.brand || "Unbranded").trim();
        addTo(actual, brand, Number(line.selling_price) * Number(line.quantity));
        remember(categories, brand, line.category);
        remember(subs, brand, line.sub_category);
      });
    });
    liveData.brandTargets.forEach(row => {
      if (ids.has(row.branch_id) && targetInPeriod(row.month)) addTo(target, row.brand.trim(), Number(row.amount));
    });
    const list = brand => [...(categories.get(brand) || [])].sort(natural).join(", ") || "—";
    const subList = brand => [...(subs.get(brand) || [])].sort(natural).join(", ") || "—";
    return [...new Set([...actual.keys(), ...target.keys()])]
      .map(brand => ({ brand, category: list(brand), subCategory: subList(brand), actual: actual.get(brand) || 0, target: target.get(brand) || 0 }))
      .sort((a, b) => b.actual - a.actual || natural(a.brand, b.brand));
  }

  function brandTable(brands, emptyText) {
    if (currentProfile.role === "ps") {
      const sum = brands.reduce((total, row) => total + row.actual, 0);
      return tableBlock(
        "brands",
        ["Brand", "%"],
        brands.filter(row => row.actual > 0),
        row => `<tr><td><strong>${escapeHTML(row.brand)}</strong></td><td>${percent(row.actual, sum, 2)}</td></tr>`,
        emptyText,
      );
    }
    return tableBlock(
      "brands",
      ["Brand", "Category", "Sub-category", "Sales", "Target", "Progress"],
      brands,
      row => `<tr class="rank-row" data-brand-detail="${escapeHTML(row.brand)}" tabindex="0"><td><strong>${escapeHTML(row.brand)}</strong></td><td>${escapeHTML(row.category)}</td><td>${escapeHTML(row.subCategory)}</td><td>${formatMoney(row.actual)}</td><td>${formatMoney(row.target)}</td><td>${percent(row.actual, row.target)}</td></tr>`,
      emptyText,
    );
  }

  const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort(natural);

  // Sales lines of one Product Specialist. A transferred PS starts over: only the current branch counts.
  function psSaleLines(psId) {
    const owner = liveData.profiles.find(item => item.id === psId);
    const result = [];
    liveData.sales.forEach(sale => {
      if (sale.ps_id !== psId || !inPeriod(sale.sold_on)) return;
      if (owner?.branch_id && owner.branch_id !== sale.branch_id) return;
      linesForSale(sale.id).forEach(line => result.push({ sale, line }));
    });
    return result;
  }

  const lineMatches = (line, filters) =>
    (!filters.brand || (line.brand || "").trim() === filters.brand)
    && (!filters.category || line.category === filters.category)
    && (!filters.sub || line.sub_category === filters.sub);

  function psRankingRows() {
    const ids = scopeBranchIds();
    const filters = { brand: ui.rankBrand, category: ui.rankCategory, sub: ui.rankSub };
    const filtered = Boolean(filters.brand || filters.category || filters.sub);
    const totals = new Map();
    liveData.sales.forEach(sale => {
      const owner = liveData.profiles.find(item => item.id === sale.ps_id);
      // A transferred PS starts over: only sales in their current branch count.
      if (owner?.branch_id && owner.branch_id !== sale.branch_id) return;
      if (!ids.has(sale.branch_id) || !inPeriod(sale.sold_on)) return;
      linesForSale(sale.id).forEach(line => {
        if (lineMatches(line, filters)) addTo(totals, sale.ps_id, Number(line.selling_price) * Number(line.quantity));
      });
    });
    if (!filtered) {
      liveData.profiles.forEach(profile => {
        if (profile.role === "ps" && profile.active && ids.has(profile.branch_id) && !totals.has(profile.id)) totals.set(profile.id, 0);
      });
    }
    return [...totals].map(([id, total]) => {
      const profile = liveData.profiles.find(item => item.id === id);
      return {
        id,
        name: profile?.full_name || "Staff member",
        brand: profile?.assigned_brand || "—",
        branch: profile?.branch_id ? branchName(profile.branch_id) : "—",
        total,
      };
    }).sort((a, b) => b.total - a.total || natural(a.name, b.name))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function rankFilterSelect(key, label, options, selected) {
    return `<label class="field"><span>${escapeHTML(label)}</span><select data-filter="${key}"><option value="">All</option>${options.map(option =>
      `<option value="${escapeHTML(option)}" ${selected === option ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select></label>`;
  }

  function psRankingPanel() {
    if (currentProfile.role === "ps") return "";
    const lines = liveData.saleLines;
    const brands = uniqueSorted(lines.map(line => (line.brand || "").trim()));
    const categories = uniqueSorted(lines.map(line => line.category));
    const subs = uniqueSorted(lines.filter(line => !ui.rankCategory || line.category === ui.rankCategory).map(line => line.sub_category));
    const filters = `<div class="rank-filters">${rankFilterSelect("rankBrand", "Brand", brands, ui.rankBrand)}${rankFilterSelect("rankCategory", "Category", categories, ui.rankCategory)}${rankFilterSelect("rankSub", "Sub-category", subs, ui.rankSub)}</div>`;
    const active = [ui.rankBrand, ui.rankCategory, ui.rankSub].filter(Boolean).join(" › ");
    return panel(
      "Product Specialist ranking",
      `${periodLabel()} · ${active ? `sales of ${active}` : "overall sales regardless of brand"}, highest first. Click a name to see their sales.`,
      filters + tableBlock(
        "psrank",
        ["Rank", "Product Specialist", "Brand", "Branch", "Total sales"],
        psRankingRows(),
        row => `<tr class="rank-row" data-ps-detail="${escapeHTML(row.id)}" tabindex="0"><td><strong>#${row.rank}</strong></td><td><strong>${escapeHTML(row.name)}</strong></td><td>${escapeHTML(row.brand)}</td><td>${escapeHTML(row.branch)}</td><td>${formatMoney(row.total)}</td></tr>`,
        "No Product Specialists match this selection.",
      ),
    );
  }

  function matches(query, ...fields) {
    return !query || fields.join(" ").toLowerCase().includes(query);
  }

  function searchQuery() {
    return ui.search.trim().toLowerCase();
  }

  function pieChart(title, subtitle, entries, options = {}) {
    const showLegend = options.legend !== false;
    const showAmounts = options.amounts !== false;
    const data = entries.filter(entry => entry.value > 0);
    if (!entries.some(entry => entry.color)) data.sort((a, b) => b.value - a.value);
    const shown = data.slice(0, 6);
    const rest = data.slice(6).reduce((total, entry) => total + entry.value, 0);
    if (rest > 0) shown.push({ label: "Others", value: rest });
    const total = shown.reduce((sum, entry) => sum + entry.value, 0);
    const heading = `<div class="connected-panel-heading"><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div>`;
    if (!total) {
      return `<section class="connected-panel pie-card">${heading}<div class="empty-state">No sales recorded for this selection.</div></section>`;
    }

    shown.forEach(entry => {
      if (!entry.percentText) entry.percentText = `${((entry.value / total) * 100).toFixed(PERCENT_DECIMALS)}%`;
    });

    let angle = -Math.PI / 2;
    const slices = shown.map((entry, index) => {
      const fraction = entry.value / total;
      const color = entry.color || PIE_COLORS[index % PIE_COLORS.length];
      const start = angle;
      angle += fraction * Math.PI * 2;
      const mid = (start + angle) / 2;
      const tip = entry.muted ? "" : ` class="pie-slice" data-tip="${escapeHTML(`${entry.label}|${showAmounts ? formatMoney(entry.value) : ""}|${entry.percentText}`)}"`;
      const shape = fraction > 0.9999
        ? `<circle r="1" fill="${color}"${tip}></circle>`
        : `<path${tip} d="M0 0 L${Math.cos(start).toFixed(4)} ${Math.sin(start).toFixed(4)} A1 1 0 ${fraction > 0.5 ? 1 : 0} 1 ${Math.cos(angle).toFixed(4)} ${Math.sin(angle).toFixed(4)} Z" fill="${color}" stroke="#fff" stroke-width="0.02"></path>`;
      const cx = (Math.cos(mid) * 0.62).toFixed(3);
      const cy = Math.sin(mid) * 0.62;
      const pctText = entry.labelText || `${(fraction * 100).toFixed(2)}%`;
      let label = "";
      if (!entry.muted && options.names && fraction >= 0.12) {
        label = `<text x="${cx}" y="${(cy - 0.06).toFixed(3)}" text-anchor="middle" dominant-baseline="middle" class="pie-label pie-label-name">${escapeHTML(String(entry.label).slice(0, 10))}</text>`
          + `<text x="${cx}" y="${(cy + 0.07).toFixed(3)}" text-anchor="middle" dominant-baseline="middle" class="pie-label">${pctText}</text>`;
      } else if (!entry.muted && fraction >= 0.07) {
        label = `<text x="${cx}" y="${cy.toFixed(3)}" text-anchor="middle" dominant-baseline="middle" class="pie-label">${pctText}</text>`;
      }
      return { shape, label, color, entry, fraction };
    });
    const legend = showLegend ? `<ul class="pie-legend">${slices.filter(slice => !slice.entry.muted).map(slice =>
      `<li><i style="background:${slice.color}"></i><span>${escapeHTML(slice.entry.label)}</span><strong>${showAmounts ? `${formatMoney(slice.entry.value)} · ` : ""}${slice.entry.percentText || `${(slice.fraction * 100).toFixed(2)}%`}</strong></li>`
    ).join("")}</ul>` : "";
    const description = shown.filter(entry => !entry.muted).map(entry => showAmounts ? `${entry.label} ${formatMoney(entry.value)}` : `${entry.label} ${entry.percentText}`).join("; ");
    return `<section class="connected-panel pie-card">${heading}
      <div class="pie-body${showLegend ? "" : " pie-body-solo"}"><svg viewBox="-1.03 -1.03 2.06 2.06" role="img" aria-label="${escapeHTML(`${title}: ${description}`)}">${slices.map(slice => slice.shape).join("")}${slices.map(slice => slice.label).join("")}</svg>
      ${legend}</div></section>`;
  }

  function progressChart(actual, target, subtitle, options = {}) {
    const title = options.title || "Target progress";
    if (!(target > 0)) {
      return `<section class="connected-panel pie-card"><div class="connected-panel-heading"><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div><div class="empty-state">${escapeHTML(options.emptyText || "No target is set for this selection.")}</div></section>`;
    }
    const showAmounts = options.amounts !== false;
    return pieChart(
      title,
      showAmounts ? `Target ${formatMoney(target)} · ${subtitle}` : subtitle,
      [
        { label: options.currentLabel || "Current sales", value: Math.min(actual, target), color: "#16a34a", percentText: percent(actual, target), labelText: percent(actual, target, 2) },
        { label: "Remaining", value: Math.max(target - actual, 0), color: "#e2e8f0", muted: true },
      ],
      options,
    );
  }

  // Product Specialists see brand shares as percentages only, never amounts.
  function brandPie(title, subtitle, entries) {
    return currentProfile.role === "ps"
      ? pieChart(title, subtitle, entries, { legend: false, amounts: false, names: true })
      : pieChart(title, subtitle, entries);
  }

  const tableStore = {};

  function tableBlock(key, headers, items, rowHtml, emptyText, pageSize = PAGE_SIZE) {
    tableStore[key] = { headers, items, rowHtml };
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(1, ui.pages[key] || 1), pages);
    ui.pages[key] = page;
    const slice = items.slice((page - 1) * pageSize, page * pageSize);
    const body = slice.length
      ? slice.map(rowHtml).join("")
      : `<tr><td colspan="${headers.length}"><div class="empty-state">${escapeHTML(emptyText)}</div></td></tr>`;
    const from = slice.length ? (page - 1) * pageSize + 1 : 0;
    const to = slice.length ? from + slice.length - 1 : 0;
    return `<div class="connected-table-wrap" data-table-key="${key}"><table class="connected-table"><thead><tr>${headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="connected-pager"><span>${from}–${to} of ${items.length}</span>
        <div><button class="button button-outline" type="button" data-pager="${key}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${page} of ${pages}</span><button class="button button-outline" type="button" data-pager="${key}" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next</button></div></div>`;
  }

  function panel(title, detail, content, action = "") {
    const key = /data-table-key="([^"]+)"/.exec(content)?.[1];
    if (key && key !== "sales" && (currentProfile.role !== "ps" || key === "brandlog")) {
      if (tableStore[key]) tableStore[key].title = title;
      action = `${action}<button class="button button-outline button-small" type="button" data-export-table="${key}">Export</button>`;
    }
    return `<section class="connected-panel"><div class="connected-panel-heading panel-heading-row"><div><h2>${escapeHTML(title)}</h2>${detail ? `<p>${escapeHTML(detail)}</p>` : ""}</div>${action}</div>${content}</section>`;
  }

  function filterBar(options) {
    const controls = [];
    if (options.district && liveData.districts.length > 1) {
      const districts = [...liveData.districts].sort((a, b) => natural(a.name, b.name));
      controls.push(`<label class="field"><span>District</span><select data-filter="district"><option value="">All districts</option>${districts.map(district =>
        `<option value="${escapeHTML(district.id)}" ${ui.district === district.id ? "selected" : ""}>${escapeHTML(district.name)}</option>`).join("")}</select></label>`);
    }
    if (options.branch) {
      const branches = liveData.branches
        .filter(branch => !ui.district || branch.district_id === ui.district)
        .sort((a, b) => natural(a.name, b.name));
      if (branches.length > 1) {
        controls.push(`<label class="field"><span>Branch</span><select data-filter="branch"><option value="">All branches</option>${branches.map(branch =>
          `<option value="${escapeHTML(branch.id)}" ${ui.branch === branch.id ? "selected" : ""}>${escapeHTML(branch.name)}</option>`).join("")}</select></label>`);
      }
    }
    if (options.period) {
      const periods = [["year", "Year to date (YTD)"], ["month", "Month to date (MTD)"], ["day", "Day (calendar)"]];
      controls.push(`<label class="field"><span>Period</span><select data-filter="period">${periods.map(([value, label]) =>
        `<option value="${value}" ${ui.period === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`);
      if (ui.period === "day") {
        controls.push(`<label class="field"><span>Day</span><input type="date" data-filter="date" value="${escapeHTML(periodDay())}" required></label>`);
      } else {
        controls.push(`<label class="field"><span>${ui.period === "year" ? "Through month" : "Month"}</span><select data-filter="month">${availableMonths().map(month =>
          `<option value="${month}" ${ui.month === month ? "selected" : ""}>${escapeHTML(monthLabel(month))}</option>`).join("")}</select></label>`);
      }
    }
    if (options.search) {
      controls.push(`<label class="field field-search"><span>Search</span><input type="search" data-filter="search" placeholder="${escapeHTML(options.search)}" value="${escapeHTML(ui.search)}" autocomplete="off"></label>`);
    }
    if (options.actions) {
      controls.push(`<div class="filter-actions">${options.actions}</div>`);
    }
    return controls.length ? `<div class="connected-filters" role="group" aria-label="Filters">${controls.join("")}</div>` : "";
  }

  function pageHeading(title, detail) {
    return `<div class="connected-heading"><span class="eyebrow">${escapeHTML(roleLabels[currentProfile.role]).toUpperCase()}</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(detail)}</p></div>`;
  }

  function mountPage(heading, beforeFilters, filters, results) {
    connectedContent.innerHTML = `${heading}${beforeFilters}${filters}<div id="live-results"></div>`;
    resultsView = results;
    refreshResults();
  }

  function refreshResults() {
    const container = document.querySelector("#live-results");
    if (container && resultsView) container.innerHTML = resultsView();
  }

  function renderConnected() {
    if (!currentProfile || !liveData) return;
    const pages = rolePages[currentProfile.role] || [];
    connectedNav.innerHTML = pages.map(page =>
      `<button type="button" class="connected-nav-link ${activePage === page ? "active" : ""}" data-live-page="${page}">${escapeHTML(pageLabels[page])}</button>`
    ).join("");

    if (activePage === "sales") renderSalesPage();
    else if (activePage === "targets") renderTargetsPage();
    else if (activePage === "products") renderProductsPage();
    else if (activePage === "users") renderPeoplePage();
    else renderOverview();
  }

  function renderOverview() {
    mountPage(
      pageHeading("Overview", `Live data for ${monthLabel(ui.month)}. Access is enforced by Supabase.`),
      "",
      filterBar({ district: true, branch: true, period: true }),
      () => {
        const month = anchorMonth();
        const label = statusLabel();
        const rows = branchRows();
        const brands = brandRows();
        const totalSales = rows.reduce((total, row) => total + row.actual, 0);
        const totalTarget = rows.reduce((total, row) => total + row.target, 0);
        const totalYtd = rows.reduce((total, row) => total + row.ytd, 0);
        const totalYtdTarget = rows.reduce((total, row) => total + row.ytdTarget, 0);
        const periodTargetLabel = ui.period === "year" ? "Year-to-date target" : "Monthly target";
        const charts = [progressChart(totalSales, totalTarget, label)];
        if (rows.length > 1) {
          charts.push(pieChart("Sales by branch", label, rows.map(row => ({ label: row.branch.name, value: row.actual }))));
        }
        charts.push(brandPie("Sales by brand", label, brands.map(row => ({ label: row.brand, value: row.actual }))));
        return `<div class="connected-metrics">
            <article class="connected-metric"><span>Branches in view</span><strong>${rows.length}</strong></article>
            <article class="connected-metric"><span>Sales · ${escapeHTML(label)}</span><strong>${formatMoney(totalSales)}</strong></article>
            <article class="connected-metric"><span>${periodTargetLabel}</span><strong>${formatMoney(totalTarget)}</strong></article>
            <article class="connected-metric"><span>Year-to-date sales</span><strong>${formatMoney(totalYtd)}</strong><small>YTD target ${formatMoney(totalYtdTarget)} · ${percent(totalYtd, totalYtdTarget)}</small></article>
          </div>
          <div class="connected-charts">${charts.join("")}</div>
          ${currentProfile.role === "ps" ? "" : panel("Accessible branch performance", "Ordered by district, then branch.", tableBlock(
            "branches",
            ["Branch", "District", "Sales", "Target", "Progress", "YTD sales"],
            rows,
            row => `<tr><td><strong>${escapeHTML(row.branch.name)}</strong></td><td>${escapeHTML(row.district)}</td><td>${formatMoney(row.actual)}</td><td>${formatMoney(row.target)}</td><td>${percent(row.actual, row.target)}</td><td>${formatMoney(row.ytd)}</td></tr>`,
            "No branches match this selection.",
            5,
          ))}
          ${panel("Brand performance", "Highest sales first.", brandTable(brands, "No brand sales for this selection."))}
          ${psRankingPanel()}`;
      },
    );
  }

  function renderSalesPage() {
    const isPs = currentProfile.role === "ps";
    mountPage(
      pageHeading("Sales", isPs ? "Your sales for branches you are assigned to." : "Sales visible to your role and assigned branches."),
      "",
      filterBar({
        district: true,
        branch: true,
        period: true,
        actions: isPs ? '<button class="button button-primary" type="button" data-open="sale">+ Record sale</button>' : "",
      }),
      () => {
        const ids = scopeBranchIds();
        const query = searchQuery();
        const sales = visibleSales()
          .filter(sale => ids.has(sale.branch_id) && inPeriod(sale.sold_on))
          .map(sale => ({
            sale,
            branch: branchName(sale.branch_id),
            person: isPs ? "You" : liveData.profiles.find(profile => profile.id === sale.ps_id)?.full_name || "Staff member",
            products: linesForSale(sale.id).map(line => `${line.model_description} × ${line.quantity}`).join(", "),
            total: saleTotal(sale),
          }))
          .filter(row => matches(query, row.sale.invoice_number, row.sale.customer_name, row.products, row.person, row.branch))
          .sort((a, b) => natural(a.branch, b.branch) || String(b.sale.created_at).localeCompare(String(a.sale.created_at)));
        const total = sales.reduce((sum, row) => sum + row.total, 0);
        const scope = statusLabel();
        const rows = branchRows();
        const charts = [progressChart(
          rows.reduce((sum, row) => sum + row.actual, 0),
          rows.reduce((sum, row) => sum + row.target, 0),
          scope,
          isPs ? { title: "My sales vs branch target", currentLabel: "My sales" } : {},
        )];
        if (isPs) charts.push(brandProgressChart(scope));
        if (rows.length > 1) {
          charts.push(pieChart("Sales by branch", scope, rows.map(row => ({ label: row.branch.name, value: row.actual }))));
        }
        charts.push(brandPie("Sales by brand", isPs ? `${scope} · my sales` : scope, brandRows().map(row => ({ label: row.brand, value: row.actual }))));
        const tools = `<div class="table-tools"><label class="table-search"><span class="visually-hidden">Search sales log</span><input type="search" data-filter="search" placeholder="Search invoice, customer, product, staff" value="${escapeHTML(ui.search)}" autocomplete="off"></label><button class="button button-outline" type="button" data-export="sales">Export</button></div>`;
        return `<div class="connected-charts">${charts.join("")}</div>
          ${panel(isPs ? "My sales log" : "Sales log", `${sales.length} sale${sales.length === 1 ? "" : "s"} · ${formatMoney(total)} · ${ui.period === "day" ? "this day only · " : ""}ordered by branch, then newest first.`, tableBlock(
            "sales",
            ["Invoice", "Customer", "Products", "Payment", "Product Specialist", "Branch", "Sale date", "Recorded", "Total", ...(isPs ? [""] : [])],
            sales,
            row => `<tr><td><strong>${escapeHTML(row.sale.invoice_number)}</strong></td><td>${escapeHTML(row.sale.customer_name)}</td><td>${escapeHTML(row.products || "—")}</td><td>${escapeHTML(row.sale.payment_mode || "—")}</td><td>${escapeHTML(row.person)}</td><td>${escapeHTML(row.branch)}</td><td>${escapeHTML(row.sale.sold_on)}</td><td>${escapeHTML(new Date(row.sale.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }))}</td><td><strong>${formatMoney(row.total)}</strong></td>${isPs ? `<td><button class="button button-outline button-small" type="button" data-edit-sale="${escapeHTML(row.sale.id)}">Edit</button></td>` : ""}</tr>`,
            "No sales match these filters.",
          ), tools)}${isPs ? brandLogPanel() : ""}`;
      },
    );
  }

  function brandProgressChart(scope) {
    const brand = String(currentProfile.assigned_brand || "").trim();
    const actual = liveData.brandSales
      .filter(row => inStatus(row.sold_on))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const target = liveData.brandTargets
      .filter(row => row.branch_id === currentProfile.branch_id
        && row.brand.trim().toLowerCase() === brand.toLowerCase()
        && targetInPeriod(row.month))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return progressChart(actual, target, scope, {
      title: `${brand || "Brand"} progress · whole branch`,
      currentLabel: "Brand sales",
      amounts: false,
      emptyText: `No ${brand || "brand"} target is set for this branch and period yet. Your BM or DM can set one under Targets → + Set target. It compares the whole branch's ${brand || "brand"} sales with that target.`,
    });
  }

  function brandLogPanel() {
    const brand = currentProfile.assigned_brand || "your brand";
    const rows = liveData.brandSales
      .filter(row => inPeriod(row.sold_on))
      .sort((a, b) => String(b.sold_on).localeCompare(String(a.sold_on)) || natural(a.ps_name, b.ps_name));
    return panel(`${brand} sales log · branch-wide`, `${rows.length} line${rows.length === 1 ? "" : "s"} sold by everyone in your branch for your brand, newest first.`, tableBlock(
      "brandlog",
      ["Sale date", "Invoice", "Product Specialist", "Product", "Qty"],
      rows,
      row => `<tr><td>${escapeHTML(row.sold_on)}</td><td><strong>${escapeHTML(row.invoice_number)}</strong></td><td>${escapeHTML(row.ps_name)}</td><td>${escapeHTML(row.model_description)}</td><td>${escapeHTML(row.quantity)}</td></tr>`,
      "No sales of your brand match this period.",
    ));
  }

  function saleProducts() {
    if (saleProductsCache.source !== liveData.products) {
      const seen = new Set();
      saleProductsCache = {
        source: liveData.products,
        list: liveData.products
          .filter(product => !seen.has(product.barcode) && seen.add(product.barcode))
          .sort((a, b) => natural(a.brand, b.brand) || natural(a.model_description, b.model_description)),
      };
    }
    return saleProductsCache.list;
  }
  let saleProductsCache = { source: null, list: [] };

  // Suggest only the best few matches instead of putting thousands of options in the page.
  function productSuggestions(text) {
    const words = String(text || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const item of saleProducts()) {
      const haystack = `${item.brand} ${item.model_description} ${item.barcode}`.toLowerCase();
      if (words.every(word => haystack.includes(word))) {
        out.push(item);
        if (out.length >= 30) break;
      }
    }
    return out;
  }

  const productLabel = product => `${product.brand} · ${product.model_description} · ${product.barcode}`;

  function saleLineRow(line = {}) {
    const product = line.barcode
      ? saleProducts().find(item => item.barcode === line.barcode) || { brand: line.brand, model_description: line.model_description, barcode: line.barcode }
      : null;
    const total = Number(line.selling_price || 0) * Number(line.quantity || 0);
    return `<div class="sale-row" data-srp-for="${escapeHTML(product?.barcode || "")}">
      <label class="field sale-product"><span>Product (type a model, brand or barcode)</span><input name="product" list="sale-products" autocomplete="off" placeholder="Start typing…" required value="${product ? escapeHTML(productLabel(product)) : ""}"></label>
      <label class="field"><span>Barcode</span><input name="code" readonly tabindex="-1" value="${escapeHTML(product?.barcode || "")}"></label>
      <label class="field"><span>SRP (₱)</span><input name="srp" type="number" min="0" step="0.01" value="${line.srp ?? ""}"></label>
      <label class="field"><span>Price (₱)</span><input name="price" type="number" min="0" step="0.01" required value="${line.selling_price ?? ""}"></label>
      <label class="field"><span>Qty</span><input name="quantity" type="number" min="1" step="1" required value="${line.quantity ?? 1}"></label>
      <label class="field"><span>Total</span><input name="linetotal" readonly tabindex="-1" value="${total ? formatMoney(total) : ""}"></label>
      <button class="dlg-remove" type="button" data-remove-line aria-label="Remove product line">×</button>
    </div>`;
  }

  function paymentSelectHTML(current) {
    const names = liveData.paymentModes.map(mode => mode.name);
    if (current && !names.some(name => name.toLowerCase() === current.toLowerCase())) names.push(current);
    const match = names.find(name => name.toLowerCase() === String(current || "").toLowerCase()) || "";
    return `<select name="payment" required><option value="">Select…</option>${names.map(name =>
      `<option value="${escapeHTML(name)}" ${name === match ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}</select>`;
  }

  // Records a new sale, or corrects an existing one when `sale` is given.
  function openSaleModal(sale) {
    const lines = sale ? linesForSale(sale.id) : [{}];
    const catalog = saleProducts();
    const resolve = text => {
      const value = String(text || "").trim().toLowerCase();
      return catalog.find(item => productLabel(item).toLowerCase() === value)
        || catalog.find(item => item.barcode.toLowerCase() === normBarcode(value).toLowerCase())
        || null;
    };
    openModal({
      title: sale ? `Edit sale · ${sale.invoice_number}` : "Record a sale",
      intro: sale ? "Corrections are saved with the previous values kept in the edit history." : "",
      submitLabel: sale ? "Save changes" : "Save sale",
      wide: true,
      body: `<div class="dlg-grid">
          ${fieldHTML("Customer", "customer", `<input name="customer" autocomplete="off" required value="${escapeHTML(sale?.customer_name || "")}">`)}
          ${fieldHTML("Invoice number", "invoice", `<input name="invoice" autocomplete="off" required value="${escapeHTML(sale?.invoice_number || "")}">`)}
          ${fieldHTML("Date", "date", `<input name="date" type="date" required value="${escapeHTML(sale?.sold_on || localISODate())}">`)}
          ${fieldHTML("Mode of payment", "payment", paymentSelectHTML(sale?.payment_mode))}
        </div>
        <datalist id="sale-products"></datalist>
        <div id="sale-rows">${lines.map(saleLineRow).join("")}</div>
        <div class="sale-footer"><button class="button button-outline button-small" type="button" data-add-line>+ Add product line</button><strong>Sale total: <span id="sale-total">${formatMoney(lines.reduce((sum, line) => sum + Number(line.selling_price || 0) * Number(line.quantity || 0), 0))}</span></strong></div>`,
      onReady: form => {
        const enableCurrencyInput = row => {
          ["price", "srp"].forEach(name => {
            const input = row.querySelector(`[name="${name}"]`);
            input.type = "text";
            input.inputMode = "decimal";
            input.value = formatCurrencyInput(input.value);
          });
        };
        form.querySelectorAll(".sale-row").forEach(enableCurrencyInput);
        const recalc = () => {
          let grand = 0;
          form.querySelectorAll(".sale-row").forEach(row => {
            const product = resolve(row.querySelector('[name="product"]').value);
            row.querySelector('[name="code"]').value = product ? product.barcode : "";
            // Fill the SRP when a different product is picked; the PS can then still change it.
            const picked = product ? product.barcode : "";
            if (row.dataset.srpFor !== picked) {
              row.dataset.srpFor = picked;
              row.querySelector('[name="srp"]').value = product && product.srp != null ? formatCurrencyInput(product.srp) : "";
            }
            const price = parseCurrency(row.querySelector('[name="price"]').value);
            const total = price === null ? 0 : price * Number(row.querySelector('[name="quantity"]').value || 0);
            row.querySelector('[name="linetotal"]').value = price !== null && total ? formatMoney(total) : "";
            grand += total;
          });
          form.querySelector("#sale-total").textContent = formatMoney(grand);
        };
        form.addEventListener("input", event => {
          if (event.target.name === "product") {
            form.querySelector("#sale-products").innerHTML = productSuggestions(event.target.value)
              .map(item => `<option value="${escapeHTML(productLabel(item))}"></option>`).join("");
          }
          recalc();
        });
        form.addEventListener("focusout", event => {
          if (event.target.name === "price" || event.target.name === "srp") {
            event.target.value = formatCurrencyInput(event.target.value);
          }
        });
        form.addEventListener("click", event => {
          if (event.target.closest("[data-add-line]")) {
            form.querySelector("#sale-rows").insertAdjacentHTML("beforeend", saleLineRow());
            enableCurrencyInput(form.querySelector(".sale-row:last-child"));
          }
          const remove = event.target.closest("[data-remove-line]");
          if (remove && form.querySelectorAll(".sale-row").length > 1) {
            remove.closest(".sale-row").remove();
            recalc();
          }
        });
      },
      onSubmit: async form => {
        const rows = [...form.querySelectorAll(".sale-row")].map(row => {
          const product = resolve(row.querySelector('[name="product"]').value);
          if (!product) throw new Error("Pick each product from the suggestions (or type its exact barcode).");
          const srpInput = row.querySelector('[name="srp"]').value.trim();
          const srp = srpInput === "" ? null : parseCurrency(srpInput);
          if (srpInput !== "" && (srp === null || srp < 0)) throw new Error("Enter a valid non-negative SRP or leave it blank.");
          return {
            barcode: product.barcode,
            srp,
            selling_price: parseCurrency(row.querySelector('[name="price"]').value),
            quantity: Number(row.querySelector('[name="quantity"]').value),
          };
        });
        if (rows.some(line => line.selling_price === null || line.selling_price < 0 || !Number.isInteger(line.quantity) || line.quantity < 1)) {
          throw new Error("Enter a valid non-negative price and a whole-number quantity for each product.");
        }
        mustRpc(await client.rpc("save_ps_sale", {
          p_customer_name: titleCase(form.elements.customer.value),
          p_invoice_number: form.elements.invoice.value.trim(),
          p_sold_on: form.elements.date.value,
          p_lines: rows,
          p_sale_id: sale ? sale.id : null,
          p_payment_mode: form.elements.payment.value,
        }));
        activePage = "sales";
        await refreshData();
      },
    });
  }

  function renderTargetsPage() {
    mountPage(
      pageHeading("Targets", "Branch and brand targets for your scope. Use Set target to add or change them."),
      "",
      filterBar({
        district: true,
        branch: true,
        period: true,
        search: "Search branch",
        actions: '<button class="button button-primary" type="button" data-open="target">+ Set target</button>',
      }),
      () => {
        const ids = scopeBranchIds();
        const query = searchQuery();
        const actualByBranchMonth = new Map();
        liveData.sales.forEach(sale => addTo(actualByBranchMonth, `${sale.branch_id}|${sale.sold_on.slice(0, 7)}`, saleTotal(sale)));
        const targets = liveData.targets
          .filter(target => ids.has(target.branch_id) && targetInPeriod(target.month) && matches(query, branchName(target.branch_id)))
          .map(target => ({
            target,
            branch: branchName(target.branch_id),
            district: branchDistrictName(target.branch_id),
            month: target.month.slice(0, 7),
            amount: Number(target.amount),
            actual: actualByBranchMonth.get(`${target.branch_id}|${target.month.slice(0, 7)}`) || 0,
          }))
          .sort((a, b) => natural(a.district, b.district) || natural(a.branch, b.branch) || b.month.localeCompare(a.month));
        const brands = brandRows();
        const scope = statusLabel();
        return `${panel("Monthly branch targets", "Ordered by district, then branch.", tableBlock(
          "targets",
          ["District", "Branch", "Month", "Target", "Actual sales", "Progress", ""],
          targets,
          row => `<tr><td>${escapeHTML(row.district)}</td><td><strong>${escapeHTML(row.branch)}</strong></td><td>${escapeHTML(monthLabel(row.month))}</td><td>${formatMoney(row.amount)}</td><td>${formatMoney(row.actual)}</td><td>${percent(row.actual, row.amount)}</td><td><button class="button button-outline button-small" type="button" data-edit-target="${escapeHTML(row.target.id)}">Edit</button></td></tr>`,
          "No targets match these filters.",
        ))}
        <div class="connected-charts">${pieChart("Sales by brand", scope, brands.map(row => ({ label: row.brand, value: row.actual })))}</div>
        ${panel("Brand performance", `${scope} · highest sales first.`, brandTable(brands, "No brand sales or targets for this selection."))}
        ${psRankingPanel()}`;
      },
    );
  }

  function renderProductsPage() {
    mountPage(
      pageHeading("Products", "Shared product catalog used by all branches."),
      "",
      filterBar({
        search: "Brand, description or barcode",
        actions: [
          '<button class="button button-primary" type="button" data-open="product">+ Add product</button>',
          currentProfile.role === "admin" ? '<button class="button button-outline" type="button" data-open="import">Import Excel / CSV</button>' : "",
          currentProfile.role === "admin" ? '<button class="button button-outline" type="button" data-open="payments">Payment modes</button>' : "",
        ].join(""),
      }),
      () => {
        const query = searchQuery();
        const seen = new Set();
        const products = liveData.products
          .filter(product => {
            const key = product.barcode.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .filter(product => matches(query, product.brand, product.category, product.sub_category, product.model_description, product.barcode))
          .sort((a, b) => natural(a.brand, b.brand) || natural(a.model_description, b.model_description));
        return panel("Product catalog", "Alphabetical by brand, then description.", tableBlock(
          "products",
          ["Brand", "Category", "Sub-category", "Description", "Barcode", "SRP", ""],
          products,
                    product => `<tr><td><strong>${escapeHTML(product.brand)}</strong></td><td>${escapeHTML(product.category || "—")}</td><td>${escapeHTML(product.sub_category || "—")}</td><td>${escapeHTML(product.model_description)}</td><td>${escapeHTML(product.barcode)}</td><td>${product.srp == null ? "—" : formatMoney(product.srp)}</td><td class="manage-cell"><button class="button button-outline button-small" type="button" data-edit-product="${escapeHTML(product.barcode)}">Edit</button></td></tr>`,
          "No products match your search.",
        ));
      },
    );
  }

  function renderPeoplePage() {
    mountPage(
      pageHeading("People & access", "Create districts and branches first, then add users. A user's role, district, branch and brand decide what they can see."),
      "",
      filterBar({
        district: true,
        search: "Name, role, brand, district or branch",
        actions: [
          '<button class="button button-primary" type="button" data-open="user">+ Add user</button>',
          '<button class="button button-outline" type="button" data-open="district">+ District</button>',
          '<button class="button button-outline" type="button" data-open="branch">+ Branch</button>',
        ].join(""),
      }),
      () => {
        const query = searchQuery();
        const people = liveData.profiles
          .filter(profile => !ui.district || profile.district_id === ui.district)
          .map(profile => ({
            profile,
            role: roleLabels[profile.role] || profile.role,
            district: districtName(profile.district_id),
            branch: profile.branch_id
              ? branchName(profile.branch_id)
              : profile.role === "manager"
                ? liveData.managerLinks.filter(link => link.manager_id === profile.id).map(link => branchName(link.branch_id)).join(", ") || "—"
                : "—",
            brand: profile.role === "ps" ? profile.assigned_brand || "—" : "—",
          }))
          .filter(row => matches(query, row.profile.full_name, row.role, row.brand, row.district, row.branch))
          .sort((a, b) => (roleRank[a.profile.role] ?? 9) - (roleRank[b.profile.role] ?? 9)
            || (a.profile.role === "ps" ? natural(a.brand, b.brand) : natural(a.district, b.district))
            || natural(a.profile.full_name, b.profile.full_name));
        const branchRows = liveData.branches
          .filter(branch => !ui.district || branch.district_id === ui.district)
          .map(branch => ({ id: branch.id, district: districtName(branch.district_id), branch: branch.name }))
          .filter(row => matches(query, row.district, row.branch))
          .sort((a, b) => natural(a.district, b.district) || natural(a.branch, b.branch));
        const geoButtons = (kind, id) => `<button class="button button-outline button-small" type="button" data-geo="edit-${kind}" data-id="${escapeHTML(id)}">Update</button> <button class="button button-outline button-small" type="button" data-geo="delete-${kind}" data-id="${escapeHTML(id)}">Delete</button>`;
        const districtRows = liveData.districts
          .filter(item => !ui.district || item.id === ui.district)
          .map(item => ({ id: item.id, district: item.name, branches: liveData.branches.filter(branch => branch.district_id === item.id).length }))
          .filter(row => matches(query, row.district))
          .sort((a, b) => natural(a.district, b.district));
        const districtsPanel = panel("Districts", `${districtRows.length} district${districtRows.length === 1 ? "" : "s"}.`, tableBlock(
          "districtlist",
          ["District", "Branches", ""],
          districtRows,
          row => `<tr><td><strong>${escapeHTML(row.district)}</strong></td><td>${row.branches}</td><td class="manage-cell">${geoButtons("district", row.id)}</td></tr>`,
          "No districts yet. Use + District to create one.",
          5,
        ));
        const branchesPanel = panel("Branches", `${branchRows.length} branch${branchRows.length === 1 ? "" : "es"}, grouped by district.`, tableBlock(
          "branchlist",
          ["District", "Branch", ""],
          branchRows,
          row => `<tr><td>${escapeHTML(row.district)}</td><td><strong>${escapeHTML(row.branch)}</strong></td><td class="manage-cell">${geoButtons("branch", row.id)}</td></tr>`,
          "No branches yet. Use + Branch to create one.",
        ));
        return districtsPanel + branchesPanel + panel("Staff profiles", "Highest role first; Product Specialists are grouped by brand.", tableBlock(
          "people",
          ["Name", "Role", "Brand", "District", "Branch", "Status", ""],
          people,
          row => {
            const p = row.profile;
            const buttons = p.role === "admin"
              ? `<button class="button button-outline button-small" type="button" data-person="edit" data-id="${escapeHTML(p.id)}">Update</button>`
              : `<button class="button button-outline button-small" type="button" data-person="edit" data-id="${escapeHTML(p.id)}">Update</button> <button class="button button-outline button-small" type="button" data-person="transfer" data-id="${escapeHTML(p.id)}">Transfer</button> <button class="button button-outline button-small" type="button" data-person="toggle" data-id="${escapeHTML(p.id)}">${p.active ? "Disable" : "Enable"}</button> <button class="button button-outline button-small" type="button" data-person="delete" data-id="${escapeHTML(p.id)}">Delete</button>`;
            return `<tr><td><strong>${escapeHTML(p.full_name)}</strong></td><td>${escapeHTML(row.role)}</td><td>${escapeHTML(row.brand)}</td><td>${escapeHTML(row.district)}</td><td>${escapeHTML(row.branch)}</td><td>${p.active ? "Active" : "Disabled"}</td><td class="manage-cell">${buttons}</td></tr>`;
          },
          "No staff profiles match these filters.",
        )) + `<section class="panel danger-zone"><h2>Danger zone</h2><p>Permanently delete all districts, branches, staff logins, products, sales, targets and history. Administrator accounts and payment modes are kept. This cannot be undone.</p><button class="button button-danger" type="button" data-open="wipe">Delete all data</button></section>`;
      },
    );
  }

  function openWipeModal() {
    openModal({
      title: "Delete all data",
      intro: "This permanently deletes every district, branch, staff login, product, sale, target and notification. Only Administrator accounts and payment modes are kept. There is no undo.",
      submitLabel: "Delete everything",
      body: fieldHTML("Type DELETE EVERYTHING to confirm", "confirm", '<input name="confirm" required autocomplete="off">'),
      onSubmit: async form => {
        if (form.elements.confirm.value.trim() !== "DELETE EVERYTHING") throw new Error("Type DELETE EVERYTHING exactly to confirm.");
        mustRpc(await client.rpc("wipe_all_data", { p_confirm: "DELETE EVERYTHING" }));
        await refreshData();
      },
    });
  }

  // ---------- Modal helper ----------
  let modalRoot = null;

  function closeModal() {
    modalRoot?.remove();
    modalRoot = null;
  }

  function fieldHTML(label, name, control) {
    return `<label class="field"><span>${escapeHTML(label)}</span>${control}</label>`;
  }

  function selectHTML(name, options, selected = "", extra = "") {
    return `<select name="${name}" ${extra}>${options.map(([value, text]) =>
      `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(text)}</option>`).join("")}</select>`;
  }

  // onSubmit(form) may return HTML to show as a result view; returning nothing closes the modal.
  function openModal({ title, intro = "", body, submitLabel = "Save", wide = false, onSubmit, onReady }) {
    closeModal();
    modalRoot = document.createElement("div");
    modalRoot.className = "dlg-backdrop";
    modalRoot.innerHTML = `<div class="dlg${wide ? " dlg-wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <div class="dlg-head"><h2>${escapeHTML(title)}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div>
      <form class="dlg-form" novalidate>
        ${intro ? `<p class="dlg-intro">${escapeHTML(intro)}</p>` : ""}
        <div class="dlg-body">${body}</div>
        <p class="dlg-error" role="alert" hidden></p>
        <div class="dlg-actions"><button class="button button-outline" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit">${escapeHTML(submitLabel)}</button></div>
      </form></div>`;
    document.body.appendChild(modalRoot);
    const root = modalRoot;
    const form = root.querySelector("form");
    const error = root.querySelector(".dlg-error");
    root.addEventListener("pointerdown", event => {
      if (event.target === root || event.target.closest("[data-modal-close]")) closeModal();
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      error.hidden = true;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      submit.disabled = true;
      try {
        const result = await onSubmit(form);
        if (result) {
          root.querySelector(".dlg").innerHTML = `<div class="dlg-head"><h2>${escapeHTML(title)}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div><div class="dlg-form">${result}<div class="dlg-actions"><button class="button button-primary" type="button" data-modal-close>Done</button></div></div>`;
        } else {
          closeModal();
        }
      } catch (caught) {
        console.error(title, caught);
        error.textContent = friendlyError(caught);
        error.hidden = false;
        submit.disabled = false;
      }
    });
    onReady?.(form);
    form.querySelector("input,select")?.focus();
  }

  function friendlyError(error) {
    const text = String(error?.message || error || "Something went wrong.");
    if (/Could not find the function|schema cache|PGRST202/i.test(text)) {
      return "This feature needs a one-time backend setup that has not been applied yet (admin_tools migration).";
    }
    if (/Failed to send a request to the Edge Function|FunctionsFetchError|not found/i.test(text)) {
      return "The create-user service is not deployed yet (Edge Function admin-create-user).";
    }
    return text;
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalRoot) closeModal();
  });

  async function refreshData() {
    if (currentSession) await loadLiveWorkspace(currentSession);
  }

  function mustRpc(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  function knownBrands() {
    return [...new Set(liveData.products.map(product => product.brand.trim()).filter(Boolean))].sort(natural);
  }

  function knownCategories() {
    const map = new Map(Object.entries(CATEGORY_SEEDS).map(([category, subs]) => [category, new Set(subs)]));
    liveData.products.forEach(product => {
      if (!product.category) return;
      if (!map.has(product.category)) map.set(product.category, new Set());
      if (product.sub_category) map.get(product.category).add(product.sub_category);
    });
    return map;
  }

  // ---------- Products ----------
  function openProductModal(existing) {
    const categories = knownCategories();
    const subOptions = category => [...(categories.get(titleCase(category)) || [])].sort(natural)
      .map(sub => `<option value="${escapeHTML(sub)}"></option>`).join("");
    openModal({
      title: existing ? "Edit product" : "Add product",
      intro: existing ? "Changes apply to the shared catalog for every branch. Past sales keep the model name they were recorded with." : "Adds the product to the shared catalog for every branch.",
      submitLabel: existing ? "Save changes" : "Add product",
      body: `${fieldHTML("Brand", "brand", `<input name="brand" list="brand-options" required autocomplete="off" value="${escapeHTML(existing?.brand || "")}">`)}
        <datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>
        ${fieldHTML("Category (e.g. Aircon)", "category", `<input name="category" list="category-options" required autocomplete="off" value="${escapeHTML(existing?.category || "")}">`)}
        <datalist id="category-options">${[...categories.keys()].sort(natural).map(category => `<option value="${escapeHTML(category)}"></option>`).join("")}</datalist>
        ${fieldHTML("Sub-category (e.g. Split Type)", "subcategory", `<input name="subcategory" list="sub-options" autocomplete="off" value="${escapeHTML(existing?.sub_category || "")}">`)}
        <datalist id="sub-options">${subOptions(existing?.category)}</datalist>
        ${fieldHTML("Model description", "description", `<input name="description" required autocomplete="off" value="${escapeHTML(existing?.model_description || "")}">`)}
        ${fieldHTML("Barcode (numbers are padded to 8 digits)", "barcode", `<input name="barcode" required autocomplete="off" value="${escapeHTML(existing?.barcode || "")}">`)}
        ${fieldHTML("SRP (₱, suggested retail price)", "srp", `<input name="srp" type="number" min="0" step="0.01" value="${existing?.srp ?? ""}">`)}`,
      onReady: form => {
        form.elements.category.addEventListener("input", () => {
          form.querySelector("#sub-options").innerHTML = subOptions(form.elements.category.value);
        });
      },
      onSubmit: async form => {
        const values = {
          p_brand: titleCase(form.elements.brand.value),
          p_description: titleCase(form.elements.description.value),
          p_barcode: normBarcode(form.elements.barcode.value),
          p_category: titleCase(form.elements.category.value),
          p_sub_category: titleCase(form.elements.subcategory.value) || null,
          p_srp: form.elements.srp.value === "" ? null : Number(form.elements.srp.value),
        };
        if (existing) mustRpc(await client.rpc("update_product", { p_old_barcode: existing.barcode, ...values }));
        else mustRpc(await client.rpc("add_product", values));
        await refreshData();
      },
    });
  }

  function normalizeHeader(text) {
    return String(text ?? "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  async function readSpreadsheet(file) {
    if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
    if (!window.XLSX) throw new Error("The Excel reader could not load. Save the file as CSV and try again.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  }

  function productsFromRows(rows) {
    const headerIndex = rows.findIndex(row => row.some(cell => normalizeHeader(cell) === "barcode"));
    if (headerIndex < 0) throw new Error("Could not find a header row with Brand, Description and Barcode columns.");
    const header = rows[headerIndex].map(normalizeHeader);
    const find = (...names) => header.findIndex(name => names.includes(name));
    const brandAt = find("brand");
    const descAt = find("description", "modeldescription", "model", "product");
    const codeAt = find("barcode");
    const categoryAt = find("category");
    const subAt = find("subcategory");
    const srpAt = find("srp", "suggestedretailprice", "price");
    if (brandAt < 0 || descAt < 0 || codeAt < 0) throw new Error("Columns needed: Brand, Description (or Model Description) and Barcode.");
    const items = [];
    let skipped = 0;
    rows.slice(headerIndex + 1).forEach(row => {
      if (row.every(cell => !String(cell ?? "").trim())) return;
      const item = {
        brand: titleCase(String(row[brandAt] ?? "")),
        description: titleCase(String(row[descAt] ?? "")),
        barcode: normBarcode(row[codeAt]),
        category: categoryAt >= 0 ? titleCase(String(row[categoryAt] ?? "")) : "",
        sub_category: subAt >= 0 ? titleCase(String(row[subAt] ?? "")) : "",
        srp: srpAt >= 0 && Number.isFinite(parseFloat(String(row[srpAt] ?? "").replace(/[^0-9.]/g, ""))) ? parseFloat(String(row[srpAt]).replace(/[^0-9.]/g, "")) : null,
      };
      if (item.brand && item.description && item.barcode) items.push(item);
      else skipped += 1;
    });
    return { items, skipped };
  }

  function downloadFile(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csvText(rows) {
    return rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }

  function downloadTemplate() {
    downloadFile("products-template.csv", new Blob([csvText([["Brand", "Category", "Sub-category", "Description", "Barcode", "SRP"], ["Sample Brand", "Aircon", "Split Type", "Sample Model 1.0HP", "00012345", "24999.00"]])], { type: "text/csv" }));
  }

  function openImportModal() {
    let parsed = null;
    openModal({
      title: "Import products",
      intro: "Admin only. Upload .xlsx, .xls or .csv with columns Brand, Category, Sub-category (both optional), Description and Barcode. Existing barcodes are updated; new ones are added to every branch.",
      submitLabel: "Import",
      body: `<input name="file" type="file" accept=".xlsx,.xls,.csv" required>
        <p class="dlg-preview" id="import-preview">No file chosen.</p>
        <button class="button button-outline button-small" type="button" id="import-template">Download template</button>`,
      onReady: form => {
        form.querySelector("#import-template").addEventListener("click", downloadTemplate);
        form.elements.file.addEventListener("change", async () => {
          const preview = form.querySelector("#import-preview");
          parsed = null;
          const file = form.elements.file.files[0];
          if (!file) return;
          try {
            parsed = productsFromRows(await readSpreadsheet(file));
            preview.textContent = `${parsed.items.length} valid product${parsed.items.length === 1 ? "" : "s"}${parsed.skipped ? `, ${parsed.skipped} row(s) skipped (missing a field)` : ""}.`;
          } catch (error) {
            preview.textContent = error.message;
          }
        });
      },
      onSubmit: async () => {
        if (!parsed || !parsed.items.length) throw new Error("Choose a file with at least one valid product.");
        let imported = 0;
        for (let start = 0; start < parsed.items.length; start += 1000) {
          const part = mustRpc(await client.rpc("import_products", { p_items: parsed.items.slice(start, start + 1000) }));
          imported += Number(part.products) || 0;
        }
        const result = { products: imported };
        await refreshData();
        return `<p>Imported <strong>${escapeHTML(result.products)}</strong> product(s) into every branch.</p>`;
      },
    });
  }

  // ---------- Targets ----------
  function openTargetModal(existing) {
    const branches = [...liveData.branches].sort((a, b) => natural(a.name, b.name));
    const month = existing ? existing.month.slice(0, 7) : ui.month || currentMonth();
    openModal({
      title: existing ? "Edit target" : "Set target",
      intro: "Targets apply to the branches you manage.",
      submitLabel: "Save target",
      body: `${fieldHTML("Type", "type", selectHTML("type", [["branch", "Branch target (all brands)"], ["brand", "Brand target"]], "branch", existing ? "disabled" : ""))}
        ${fieldHTML("Branch", "branch", selectHTML("branch", [...(branches.length > 1 && !existing ? [["all", `All my branches (${branches.length})`]] : []), ...branches.map(branch => [branch.id, branch.name])], existing ? existing.branch_id : branches.length > 1 ? "all" : branches[0]?.id, existing ? "disabled" : ""))}
        <div id="brand-field" hidden>${fieldHTML("Brand", "brand", `<input name="brand" list="brand-options" autocomplete="off"><datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>`)}</div>
        ${fieldHTML("Month", "month", `<input name="month" type="month" value="${month}" required>`)}
        ${fieldHTML("Target amount (₱)", "amount", `<input name="amount" type="number" min="0" step="0.01" value="${existing ? Number(existing.amount) : ""}" required>`)}`,
      onReady: form => {
        const sync = () => { form.querySelector("#brand-field").hidden = form.elements.type.value !== "brand"; };
        form.elements.type.addEventListener("change", sync);
        sync();
      },
      onSubmit: async form => {
        const type = form.elements.type.value;
        const brand = titleCase(form.elements.brand.value);
        if (type === "brand" && !brand) throw new Error("Enter the brand for this target.");
        const amount = Number(form.elements.amount.value);
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid target amount.");
        const selected = form.elements.branch.value;
        const ids = selected === "all" ? branches.map(branch => branch.id) : [selected];
        const monthDate = `${form.elements.month.value}-01`;
        const records = ids.map(id => ({
          dealer_id: currentProfile.dealer_id,
          branch_id: id,
          month: monthDate,
          amount,
          created_by: currentProfile.id,
          ...(type === "brand" ? { brand } : {}),
        }));
        const result = await client
          .from(type === "brand" ? "brand_targets" : "monthly_targets")
          .upsert(records, { onConflict: type === "brand" ? "branch_id,month,brand" : "branch_id,month" });
        if (result.error) throw result.error;
        await refreshData();
      },
    });
  }

  // ---------- People: districts, branches, users ----------
  function openDistrictModal() {
    openModal({
      title: "Add district",
      submitLabel: "Create district",
      body: fieldHTML("District name", "name", '<input name="name" required autocomplete="off">'),
      onSubmit: async form => {
        mustRpc(await client.rpc("create_district", { p_name: titleCase(form.elements.name.value) }));
        await refreshData();
      },
    });
  }

  function openBranchModal() {
    if (!liveData.districts.length) {
      openModal({ title: "Add branch", body: "<p>Create a district first.</p>", submitLabel: "OK", onSubmit: async () => {} });
      return;
    }
    openModal({
      title: "Add branch",
      intro: "The new branch starts with the shared product catalog.",
      submitLabel: "Create branch",
      body: `${fieldHTML("District", "district", selectHTML("district", liveData.districts.map(item => [item.id, item.name]), ui.district))}
        ${fieldHTML("Branch name", "name", '<input name="name" required autocomplete="off">')}`,
      onSubmit: async form => {
        mustRpc(await client.rpc("create_branch", { p_district_id: form.elements.district.value, p_name: titleCase(form.elements.name.value) }));
        await refreshData();
      },
    });
  }

  function openGeoEditModal(kind, id) {
    if (kind === "district") {
      const item = liveData.districts.find(entry => entry.id === id);
      if (!item) return;
      openModal({
        title: "Update district",
        submitLabel: "Save changes",
        body: fieldHTML("District name", "name", `<input name="name" required autocomplete="off" value="${escapeHTML(item.name)}">`),
        onSubmit: async form => {
          mustRpc(await client.rpc("update_district", { p_id: id, p_name: titleCase(form.elements.name.value) }));
          await refreshData();
        },
      });
      return;
    }
    const item = liveData.branches.find(entry => entry.id === id);
    if (!item) return;
    openModal({
      title: "Update branch",
      intro: "Moving a branch to another district also moves its staff.",
      submitLabel: "Save changes",
      body: `${fieldHTML("District", "district", selectHTML("district", liveData.districts.map(entry => [entry.id, entry.name]), item.district_id))}
        ${fieldHTML("Branch name", "name", `<input name="name" required autocomplete="off" value="${escapeHTML(item.name)}">`)}`,
      onSubmit: async form => {
        mustRpc(await client.rpc("update_branch", { p_id: id, p_district_id: form.elements.district.value, p_name: titleCase(form.elements.name.value) }));
        await refreshData();
      },
    });
  }

  function openGeoDeleteModal(kind, id) {
    const item = (kind === "district" ? liveData.districts : liveData.branches).find(entry => entry.id === id);
    if (!item) return;
    openModal({
      title: `Delete ${kind}`,
      intro: `Delete ${kind} "${item.name}"? This cannot be undone. A ${kind} that still has ${kind === "district" ? "branches or users" : "users or sales"} cannot be deleted.`,
      submitLabel: "Delete",
      body: "",
      onSubmit: async () => {
        mustRpc(await client.rpc(kind === "district" ? "delete_district" : "delete_branch", { p_id: id }));
        await refreshData();
      },
    });
  }

  function openUserModal() {
    if (!liveData.districts.length) {
      openModal({ title: "Add user", body: "<p>Create a district (and a branch for BM / PS users) before adding users.</p>", submitLabel: "OK", onSubmit: async () => {} });
      return;
    }
    openModal({
      title: "Add user",
      intro: "A temporary password is generated and shown once. The user can change it after signing in.",
      submitLabel: "Create user",
      body: `${fieldHTML("Role", "role", selectHTML("role", [["ps", "Product Specialist (PS)"], ["manager", "Branch Manager (BM)"], ["district_manager", "District Manager (DM)"]], "ps"))}
        ${fieldHTML("Full name", "name", '<input name="name" required autocomplete="off">')}
        ${fieldHTML("Login ID (username or mobile number)", "email", '<input name="email" autocomplete="off" autocapitalize="none">')}
        ${fieldHTML("Email (to send the invite, optional)", "contact", '<input name="contact" type="email" autocomplete="off" autocapitalize="none">')}
        ${fieldHTML("District", "district", selectHTML("district", liveData.districts.map(item => [item.id, item.name]), ui.district))}
        <div id="branch-field">${fieldHTML("Branch", "branch", '<select name="branch"></select>')}</div>
        <div id="user-brand-field">${fieldHTML("Brand (for brand monitoring)", "brand", `<input name="brand" list="brand-options" autocomplete="off"><datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>`)}</div>`,
      onReady: form => {
        const sync = () => {
          const role = form.elements.role.value;
          const branches = liveData.branches.filter(branch => branch.district_id === form.elements.district.value);
          form.elements.branch.innerHTML = branches.length
            ? branches.map(branch => `<option value="${escapeHTML(branch.id)}">${escapeHTML(branch.name)}</option>`).join("")
            : '<option value="">No branches in this district</option>';
          form.querySelector("#branch-field").hidden = role === "district_manager";
          form.querySelector("#user-brand-field").hidden = role !== "ps";
        };
        form.elements.role.addEventListener("change", sync);
        form.elements.district.addEventListener("change", sync);
        sync();
      },
      onSubmit: async form => {
        const role = form.elements.role.value;
        const contactEmail = form.elements.contact.value.trim().toLowerCase();
        const loginId = form.elements.email.value.trim() || contactEmail;
        if (!loginId) throw new Error("Enter a login ID (username or mobile number) or an email address.");
        const body = {
          role,
          full_name: titleCase(form.elements.name.value),
          login: loginId,
          email: contactEmail,
          app_url: location.origin + location.pathname,
          district_id: form.elements.district.value,
        };
        if (role !== "district_manager") {
          if (!form.elements.branch.value) throw new Error("Create a branch in this district first.");
          body.branch_id = form.elements.branch.value;
        }
        if (role === "ps") {
          body.brand = titleCase(form.elements.brand.value);
          if (!body.brand) throw new Error("Enter the brand this Product Specialist represents.");
        }
        const { data, error } = await client.functions.invoke("admin-create-user", { body });
        if (error) {
          let detail = error.message;
          try { detail = (await error.context.json()).error || detail; } catch { /* keep message */ }
          throw new Error(detail);
        }
        if (data?.error) throw new Error(data.error);
        await refreshData();
        const mailNote = !contactEmail ? "No email was entered, so no invite was sent."
          : data.email_status === "sent" ? `An invite email was sent to ${contactEmail}.`
          : data.email_status === "not_configured" ? `No invite email was sent because the email service is not connected yet. Share the details below with the user yourself.`
          : `The invite email could not be sent (${data.email_status}). Share the details below yourself.`;
        return `<p><strong>${escapeHTML(body.full_name)}</strong> was created.</p>
          <p>Login ID: <strong>${escapeHTML(body.login)}</strong><br>Temporary password: <code class="temp-password">${escapeHTML(data.temporary_password)}</code></p>
          <p class="dlg-intro">${escapeHTML(mailNote)} Copy the password now; it will not be shown again.</p>`;
      },
    });
  }

  // Keep identical to loginEmail() in the admin-create-user Edge Function.
  function loginEmail(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (value.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : "";
    if (/^\+?[\d\s-]{7,20}$/.test(value)) {
      let digits = value.replace(/\D/g, "");
      if (digits.startsWith("0")) digits = `63${digits.slice(1)}`;
      return digits.length >= 7 && digits.length <= 15 ? `${digits}@login.branchline.app` : "";
    }
    return /^[a-z0-9._-]{3,40}$/.test(value) ? `${value}@login.branchline.app` : "";
  }

  async function invokeAdminFunction(body) {
    const { data, error } = await client.functions.invoke("admin-create-user", { body });
    if (error) {
      let detail = error.message;
      try { detail = (await error.context.json()).error || detail; } catch { /* keep message */ }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function openPersonAction(kind, person) {
    const role = person.role;
    if (kind === "delete") {
      openModal({
        title: `Delete ${person.full_name}`,
        intro: "This permanently removes the account and their login. It only works for users with no recorded sales, targets or edits; otherwise use Disable. This cannot be undone.",
        body: "",
        submitLabel: "Delete user",
        onSubmit: async () => {
          await invokeAdminFunction({ action: "delete_user", user_id: person.id });
          await refreshData();
        },
      });
      return;
    }
    if (kind === "toggle") {
      const disabling = person.active;
      openModal({
        title: `${disabling ? "Disable" : "Enable"} ${person.full_name}`,
        intro: disabling
          ? "They will no longer be able to see or enter anything. Their records are kept and you can enable them again."
          : "They will be able to sign in again with their current role and branch.",
        body: "",
        submitLabel: disabling ? "Disable account" : "Enable account",
        onSubmit: async () => {
          mustRpc(await client.rpc("admin_set_user_status", { p_user_id: person.id, p_active: !disabling }));
          await refreshData();
        },
      });
      return;
    }
    if (kind === "transfer") {
      const currentBranch = role === "ps" ? person.branch_id : liveData.managerLinks.find(link => link.manager_id === person.id)?.branch_id;
      const policy = {
        ps: "Their past sales stay with the old branch. In the new branch they start from zero and cannot see earlier records.",
        manager: "Takes effect immediately: they lose access to the old branch and manage the new one. The old branch's history stays with the branch and the assignment is recorded.",
        district_manager: "Takes effect immediately: they lose the old district and cover the new one.",
      }[role];
      openModal({
        title: `Transfer ${person.full_name}`,
        intro: policy,
        submitLabel: "Transfer",
        body: `${fieldHTML("New district", "district", selectHTML("district", liveData.districts.map(item => [item.id, item.name]), person.district_id))}
          <div id="transfer-branch">${fieldHTML("New branch", "branch", '<select name="branch"></select>')}</div>`,
        onReady: form => {
          const sync = () => {
            const branches = liveData.branches.filter(branch => branch.district_id === form.elements.district.value);
            form.elements.branch.innerHTML = branches.map(branch =>
              `<option value="${escapeHTML(branch.id)}" ${branch.id === currentBranch ? "selected" : ""}>${escapeHTML(branch.name)}</option>`).join("")
              || '<option value="">No branches in this district</option>';
            form.querySelector("#transfer-branch").hidden = role === "district_manager";
          };
          form.elements.district.addEventListener("change", sync);
          sync();
        },
        onSubmit: async form => {
          mustRpc(await client.rpc("admin_transfer_user", {
            p_user_id: person.id,
            p_district_id: form.elements.district.value,
            p_branch_id: role === "district_manager" ? null : form.elements.branch.value || null,
          }));
          await refreshData();
        },
      });
      return;
    }
    const isPs = role === "ps";
    openModal({
      title: `Update ${person.full_name}`,
      intro: `${roleLabels[role] || role}. Use Transfer to change district or branch.`,
      submitLabel: "Update",
      body: `${fieldHTML("Full name", "name", `<input name="name" required autocomplete="off" value="${escapeHTML(person.full_name)}">`)}
        ${`${fieldHTML("Login ID (username, mobile number or email)", "login", `<input name="login" autocomplete="off" value="${escapeHTML(person.login_id || "")}" placeholder="${person.login_id ? "" : "Email on file; enter a new login ID to change"}">`)}
        ${fieldHTML("Contact email (for invites)", "contact", `<input name="contact" type="email" autocomplete="off" value="${escapeHTML(person.email || "")}">`)}`}
        ${isPs ? fieldHTML("Brand", "brand", `<input name="brand" required list="edit-brands" autocomplete="off" value="${escapeHTML(person.assigned_brand || "")}"><datalist id="edit-brands">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>`) : ""}
        ${role === "admin" ? "" : '<label class="check-row"><input type="checkbox" name="reset"> <span>Reset password (a new temporary password is shown once)</span></label>'}`,
      onSubmit: async form => {
        mustRpc(await client.rpc("admin_update_profile", {
          p_user_id: person.id,
          p_full_name: form.elements.name.value.trim(),
          p_role: role,
          p_district_id: person.district_id,
          p_branch_id: isPs ? person.branch_id : null,
          p_assigned_brand: isPs ? form.elements.brand.value.trim() : null,
        }));
        {
          const login = form.elements.login.value.trim();
          const contact = form.elements.contact.value.trim();
          if (login !== (person.login_id || "") || contact !== (person.email || "")) {
            await invokeAdminFunction({ action: "update_contact", user_id: person.id, login, contact_email: contact });
          }
        }
        let result = "";
        if (form.elements.reset?.checked) {
          const data = await invokeAdminFunction({ action: "reset_password", user_id: person.id });
          result = `<p>New temporary password for <strong>${escapeHTML(form.elements.name.value.trim())}</strong>:<br><code class="temp-password">${escapeHTML(data.temporary_password)}</code></p><p class="dlg-intro">Copy it now; it will not be shown again.</p>`;
        }
        await refreshData();
        return result;
      },
    });
  }

  function openPasswordModal() {
    openModal({
      title: "Change password",
      submitLabel: "Update password",
      body: `${fieldHTML("New password", "password", '<input name="password" type="password" minlength="8" required autocomplete="new-password">')}
        ${fieldHTML("Confirm password", "confirm", '<input name="confirm" type="password" minlength="8" required autocomplete="new-password">')}`,
      onSubmit: async form => {
        if (form.elements.password.value !== form.elements.confirm.value) throw new Error("The passwords do not match.");
        const { error } = await client.auth.updateUser({ password: form.elements.password.value });
        if (error) throw error;
        return "<p>Your password was updated.</p>";
      },
    });
  }

  // ---------- Export ----------
  function exportWorkbook(sheets, fileName) {
    if (window.XLSX) {
      const book = window.XLSX.utils.book_new();
      sheets.forEach(sheet => {
        const worksheet = window.XLSX.utils.aoa_to_sheet(sheet.rows);
        worksheet["!cols"] = sheet.rows[0].map((_, index) => ({
          wch: Math.min(40, Math.max(10, ...sheet.rows.slice(0, 200).map(row => String(row[index] ?? "").length))),
        }));
        window.XLSX.utils.book_append_sheet(book, worksheet, sheet.name.slice(0, 31));
      });
      window.XLSX.writeFile(book, `${fileName}.xlsx`);
    } else {
      // Offline fallback: one CSV per sheet.
      sheets.forEach(sheet => downloadFile(`${fileName} - ${sheet.name}.csv`, new Blob([csvText(sheet.rows)], { type: "text/csv" })));
    }
  }

  function psNameOf(psId) {
    return liveData.profiles.find(profile => profile.id === psId)?.full_name || (psId === currentProfile.id ? currentProfile.full_name : "—");
  }

  function exportSales() {
    const stamp = localISODate();
    const sales = visibleSales();
    const detail = [["Sale date", "Invoice", "Customer", "District", "Branch", "Product Specialist", "Brand", "Category", "Sub-category", "Product", "Barcode", "Qty", "SRP", "Unit price", "Amount", "Mode of payment"]];
    const byBranch = new Map();
    const byBrand = new Map();
    sales.forEach(sale => {
      linesForSale(sale.id).forEach(line => {
        const amount = Number(line.selling_price) * Number(line.quantity);
        detail.push([sale.sold_on, sale.invoice_number, sale.customer_name, branchDistrictName(sale.branch_id), branchName(sale.branch_id), psNameOf(sale.ps_id), line.brand, line.category || "", line.sub_category || "", line.model_description, line.barcode, Number(line.quantity), line.srp == null ? "" : Number(line.srp), Number(line.selling_price), amount, sale.payment_mode || ""]);
        addTo(byBranch, branchName(sale.branch_id), amount);
        addTo(byBrand, (line.brand || "Unbranded").trim(), amount);
      });
    });
    const sheets = [{ name: currentProfile.role === "ps" ? "My sales" : "Sales", rows: detail }];
    if (currentProfile.role === "ps") {
      sheets.push({
        name: "Brand branch-wide",
        rows: [["Sale date", "Invoice", "Product Specialist", "Brand", "Product", "Qty"],
          ...liveData.brandSales.map(row => [row.sold_on, row.invoice_number, row.ps_name, row.brand, row.model_description, Number(row.quantity)])],
      });
    } else {
      sheets.push({ name: "By branch", rows: [["Branch", "Sales"], ...[...byBranch].sort((a, b) => b[1] - a[1])] });
      sheets.push({ name: "By brand", rows: [["Brand", "Sales"], ...[...byBrand].sort((a, b) => b[1] - a[1])] });
    }
    exportWorkbook(sheets, `branchline-sales-${stamp}`);
  }

  // Pop-up with one Product Specialist's sales (every brand), filterable and sortable by brand, category and sub-category.
  function openPsDetailModal(psId) {
    const person = liveData.profiles.find(item => item.id === psId);
    if (!person) return;
    openBreakdownModal({
      title: `${person.full_name} · sales`,
      intro: `${person.assigned_brand || "—"} · ${person.branch_id ? branchName(person.branch_id) : "—"} · ${periodLabel()}. Every brand this Product Specialist sold in the branch. Sort the columns to see which brand, category or sub-category sold most.`,
      all: psSaleLines(psId),
      state: { brand: ui.rankBrand, category: ui.rankCategory, sub: ui.rankSub },
      fileBase: `branchline-${person.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sales`,
      sheet: "PS sales",
      showBrand: true,
    });
  }

  // Pop-up with one brand's sales in the current view, broken down by category and sub-category.
  function openBrandDetailModal(brand) {
    const ids = scopeBranchIds();
    const all = [];
    liveData.sales.forEach(sale => {
      if (!ids.has(sale.branch_id) || !inStatus(sale.sold_on)) return;
      linesForSale(sale.id).forEach(line => {
        if ((line.brand || "Unbranded").trim() === brand) all.push({ sale, line });
      });
    });
    openBreakdownModal({
      title: `${brand} · sales`,
      intro: `${periodLabel()} · current branch and district selection. Sort the columns to see which category or sub-category sold most.`,
      all,
      state: { brand: "", category: "", sub: "" },
      fileBase: `branchline-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sales`,
      sheet: "Brand sales",
      showBrand: false,
    });
  }

  function openBreakdownModal({ title, intro, all, state, fileBase, sheet, showBrand }) {
    state.group = "all";
    state.sortKey = "amount";
    state.sortDir = "desc";
    closeModal();
    modalRoot = document.createElement("div");
    modalRoot.className = "dlg-backdrop";
    const root = modalRoot;
    root.innerHTML = `<div class="dlg dlg-xwide" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <div class="dlg-head"><h2>${escapeHTML(title)}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div>
      <div class="dlg-form"><div id="ps-detail"></div>
      <div class="dlg-actions"><button class="button button-outline" type="button" id="ps-detail-export">Export</button><button class="button button-primary" type="button" data-modal-close>Close</button></div></div></div>`;
    document.body.appendChild(root);
    const rows = () => all.filter(({ line }) => lineMatches(line, state));
    const sortHead = (key, label) => `<th aria-sort="${state.sortKey === key ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}"><button class="sort-btn" type="button" data-sort="${key}">${label}<span class="sort-arrow">${state.sortKey === key ? (state.sortDir === "asc" ? "▲" : "▼") : ""}</span></button></th>`;
    const breakdown = list => {
      const keys = { brand: showBrand && ["all", "brand"].includes(state.group), category: ["all", "category"].includes(state.group), sub: ["all", "sub"].includes(state.group) };
      const totals = new Map();
      list.forEach(({ line }) => {
        const parts = [keys.brand ? (line.brand || "").trim() || "—" : "", keys.category ? line.category || "—" : "", keys.sub ? line.sub_category || "—" : ""];
        const id = parts.join("\u0001");
        const entry = totals.get(id) || { brand: parts[0], category: parts[1], sub: parts[2], amount: 0, qty: 0 };
        entry.amount += Number(line.selling_price) * Number(line.quantity);
        entry.qty += Number(line.quantity);
        totals.set(id, entry);
      });
      const entries = [...totals.values()];
      const sum = entries.reduce((total, entry) => total + entry.amount, 0);
      const dir = state.sortDir === "asc" ? 1 : -1;
      entries.sort((a, b) => {
        const diff = typeof a[state.sortKey] === "number" ? a[state.sortKey] - b[state.sortKey] : natural(a[state.sortKey], b[state.sortKey]);
        return diff * dir || b.amount - a.amount;
      });
      const columns = [keys.brand && ["brand", "Brand"], keys.category && ["category", "Category"], keys.sub && ["sub", "Sub-category"]].filter(Boolean);
      const body = entries.map(entry => `<tr>${columns.map(([key]) => `<td>${key === "brand" ? `<strong>${escapeHTML(entry[key])}</strong>` : escapeHTML(entry[key])}</td>`).join("")}<td>${entry.qty}</td><td>${formatMoney(entry.amount)}</td><td>${percent(entry.amount, sum, 2)}</td></tr>`).join("");
      return `<table class="connected-table"><thead><tr>${columns.map(([key, label]) => sortHead(key, label)).join("")}${sortHead("qty", "Qty")}${sortHead("amount", "Sales")}<th>Share</th></tr></thead><tbody>${body || `<tr><td colspan="${columns.length + 3}">No sales.</td></tr>`}</tbody></table>`;
    };
    const groupOptions = [["all", showBrand ? "Brand, category and sub-category" : "Category and sub-category"], ...(showBrand ? [["brand", "Brand only"]] : []), ["category", "Category only"], ["sub", "Sub-category only"]];
    const render = () => {
      const list = rows();
      const total = list.reduce((sum, { line }) => sum + Number(line.selling_price) * Number(line.quantity), 0);
      const brands = uniqueSorted(all.map(({ line }) => (line.brand || "").trim()));
      const categories = uniqueSorted(all.map(({ line }) => line.category));
      const subs = uniqueSorted(all.filter(({ line }) => !state.category || line.category === state.category).map(({ line }) => line.sub_category));
      const lineRows = list.slice().sort((a, b) => String(b.sale.sold_on).localeCompare(String(a.sale.sold_on)))
        .map(({ sale, line }) => `<tr><td>${escapeHTML(sale.sold_on)}</td><td><strong>${escapeHTML(sale.invoice_number)}</strong></td><td>${escapeHTML(line.brand)}</td><td>${escapeHTML(line.category || "—")}</td><td>${escapeHTML(line.sub_category || "—")}</td><td>${escapeHTML(line.model_description)}</td><td>${escapeHTML(line.quantity)}</td><td>${formatMoney(Number(line.selling_price) * Number(line.quantity))}</td></tr>`).join("");
      root.querySelector("#ps-detail").innerHTML = `<p class="dlg-intro">${escapeHTML(intro)}</p>
        <div class="rank-filters">${showBrand ? rankFilterSelect("brand", "Brand", brands, state.brand) : ""}${rankFilterSelect("category", "Category", categories, state.category)}${rankFilterSelect("sub", "Sub-category", subs, state.sub)}
        <label class="field"><span>Group by</span><select data-group>${groupOptions.map(([value, label]) => `<option value="${value}" ${state.group === value ? "selected" : ""}>${escapeHTML(label)}</option>`).join("")}</select></label></div>
        <p class="ps-total"><span>${list.length} line${list.length === 1 ? "" : "s"}</span> <strong>${formatMoney(total)}</strong></p>
        <div class="connected-table-wrap ps-sum">${breakdown(list)}</div>
        <div class="connected-table-wrap ps-lines"><table class="connected-table"><thead><tr><th>Date</th><th>Invoice</th><th>Brand</th><th>Category</th><th>Sub-category</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${lineRows || '<tr><td colspan="8">No sales match these filters.</td></tr>'}</tbody></table></div>`;
    };
    root.addEventListener("pointerdown", event => {
      if (event.target === root || event.target.closest("[data-modal-close]")) closeModal();
    });
    root.addEventListener("click", event => {
      const key = event.target.closest("[data-sort]")?.dataset.sort;
      if (!key) return;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDir = ["brand", "category", "sub"].includes(key) ? "asc" : "desc";
      }
      render();
    });
    root.addEventListener("input", event => {
      if (event.target.closest("[data-group]")) {
        state.group = event.target.value;
        if (!["brand", "category", "sub"].includes(state.sortKey) || (state.group !== "all" && state.group !== state.sortKey)) {
          state.sortKey = "amount";
          state.sortDir = "desc";
        }
        render();
        return;
      }
      const key = event.target.closest("[data-filter]")?.dataset.filter;
      if (!key) return;
      state[key] = event.target.value;
      if (key === "category") state.sub = "";
      render();
    });
    root.querySelector("#ps-detail-export").addEventListener("click", () => {
      const header = ["Sale date", "Invoice", "Customer", "Brand", "Category", "Sub-category", "Product",       "Barcode", "Qty", "SRP", "Unit price", "Amount", "Mode of payment"];
            const data = rows().map(({ sale, line }) => [sale.sold_on, sale.invoice_number, sale.customer_name, line.brand, line.category || "", line.sub_category || "", line.model_description, line.barcode, Number(line.quantity), line.srp == null ? "" : Number(line.srp), Number(line.selling_price), Number(line.selling_price) * Number(line.quantity), sale.payment_mode || ""]);
      exportWorkbook([{ name: sheet, rows: [header, ...data] }], `${fileBase}-${localISODate()}`);
    });
    render();
  }

  // Admin: maintain the list of payment modes shown in the sale form.
  function openPaymentModesModal() {
    const modes = liveData.paymentModes;
    openModal({
      title: "Payment modes",
      intro: "These are the choices in the sale form's Mode of payment. Removing a mode does not change past sales.",
      submitLabel: "Add mode",
      body: `<ul class="mode-list">${modes.map(mode => `<li><span>${escapeHTML(mode.name)}</span>${mode.id ? `<button class="dlg-remove" type="button" data-del-mode="${escapeHTML(mode.id)}" aria-label="Remove ${escapeHTML(mode.name)}">×</button>` : ""}</li>`).join("")}</ul>
        ${fieldHTML("New payment mode", "mode", '<input name="mode" autocomplete="off" required placeholder="e.g. GCash">')}`,
      onReady: form => {
        form.addEventListener("click", async event => {
          const id = event.target.closest("[data-del-mode]")?.dataset.delMode;
          if (!id) return;
          try {
            mustRpc(await client.rpc("delete_payment_mode", { p_id: id }));
            await refreshData();
            openPaymentModesModal();
          } catch (error) {
            const box = form.querySelector(".dlg-error");
            box.textContent = friendlyError(error);
            box.hidden = false;
          }
        });
      },
      onSubmit: async form => {
        mustRpc(await client.rpc("add_payment_mode", { p_name: titleCase(form.elements.mode.value) }));
        await refreshData();
        setTimeout(openPaymentModesModal, 0);
      },
    });
  }

  connectedContent.addEventListener("click", event => {
    const open = event.target.closest("[data-open]")?.dataset.open;
    if (open === "product") openProductModal();
    else if (open === "payments") openPaymentModesModal();
    else if (open === "import") openImportModal();
    else if (open === "target") openTargetModal();
    else if (open === "district") openDistrictModal();
    else if (open === "branch") openBranchModal();
    else if (open === "user") openUserModal();
    else if (open === "wipe") openWipeModal();
    const geo = event.target.closest("[data-geo]");
    if (geo) {
      const [action, kind] = geo.dataset.geo.split("-");
      if (action === "edit") openGeoEditModal(kind, geo.dataset.id);
      else openGeoDeleteModal(kind, geo.dataset.id);
    }
    const edit = event.target.closest("[data-edit-target]");
    if (edit) {
      const target = liveData.targets.find(item => item.id === edit.dataset.editTarget);
      if (target) openTargetModal(target);
    }
    if (event.target.closest("[data-export]")) {
      try { exportSales(); } catch (error) { console.error("Export failed.", error); }
    }
    const exportKey = event.target.closest("[data-export-table]")?.dataset.exportTable;
    if (exportKey) {
      try { exportTable(exportKey); } catch (error) { console.error("Export failed.", error); }
    }
    if (open === "sale") openSaleModal();
    const editProduct = event.target.closest("[data-edit-product]");
    if (editProduct) {
      const product = liveData.products.find(item => item.barcode === editProduct.dataset.editProduct);
      if (product) openProductModal(product);
    }
    const editSale = event.target.closest("[data-edit-sale]");
    if (editSale) {
      const sale = liveData.sales.find(item => item.id === editSale.dataset.editSale);
      if (sale) openSaleModal(sale);
    }
    const peopleAction = event.target.closest("[data-person]");
    if (peopleAction) {
      const person = liveData.profiles.find(item => item.id === peopleAction.dataset.id);
      if (person) openPersonAction(peopleAction.dataset.person, person);
    }
  });

  // Exports every row of a table (all pages), not just the visible page.
  function exportTable(key) {
    const table = tableStore[key];
    if (!table) return;
    const keep = table.headers.map(header => header !== "");
    const doc = new DOMParser().parseFromString(`<table><tbody>${table.items.map(table.rowHtml).join("")}</tbody></table>`, "text/html");
    const rows = [...doc.querySelectorAll("tr")].map(tr =>
      [...tr.children].filter((_, index) => keep[index]).map(cell => cell.textContent.trim()));
    const title = table.title || key;
    exportWorkbook([{ name: title.replace(/[\\/?*[\]:]/g, " "), rows: [table.headers.filter(Boolean), ...rows] }],
      `branchline-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${localISODate()}`);
  }

  document.querySelector("#change-password").addEventListener("click", openPasswordModal);
  document.querySelector("#show-password").addEventListener("change", event => {
    loginForm.elements.password.type = event.target.checked ? "text" : "password";
  });

  connectedNav.addEventListener("click", event => {
    const button = event.target.closest("[data-live-page]");
    if (!button) return;
    activePage = button.dataset.livePage;
    ui.district = "";
    ui.branch = "";
    ui.date = "";
    ui.search = "";
    ui.pages = {};
    connectedSidebar.classList.remove("open");
    window.scrollTo(0, 0);
    renderConnected();
  });

  const pieTip = document.createElement("div");
  pieTip.className = "pie-tip";
  pieTip.hidden = true;
  document.body.appendChild(pieTip);
  let pieHoldTimer = 0;

  function showPieTip(slice, x, y) {
    const [label, money, pct] = slice.dataset.tip.split("|");
    pieTip.innerHTML = `<strong>${escapeHTML(label)}</strong><span>${money ? `${escapeHTML(money)} · ` : ""}${escapeHTML(pct)}</span>`;
    pieTip.hidden = false;
    const width = pieTip.offsetWidth;
    pieTip.style.left = `${Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8))}px`;
    pieTip.style.top = `${Math.max(8, y - pieTip.offsetHeight - 14)}px`;
  }

  function hidePieTip() {
    clearTimeout(pieHoldTimer);
    pieTip.hidden = true;
  }

  connectedContent.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    const slice = event.target.closest(".pie-slice");
    if (slice) showPieTip(slice, event.clientX, event.clientY);
    else hidePieTip();
  });
  connectedContent.addEventListener("pointerleave", hidePieTip);
  connectedContent.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    const slice = event.target.closest(".pie-slice");
    if (!slice) return hidePieTip();
    const { clientX, clientY } = event;
    clearTimeout(pieHoldTimer);
    pieHoldTimer = setTimeout(() => showPieTip(slice, clientX, clientY), 400);
  });
  ["pointerup", "pointercancel"].forEach(name =>
    connectedContent.addEventListener(name, event => {
      if (event.pointerType === "mouse") return;
      clearTimeout(pieHoldTimer);
      setTimeout(hidePieTip, 1500);
    }));
  connectedContent.addEventListener("contextmenu", event => {
    if (event.target.closest(".pie-slice")) event.preventDefault();
  });
  window.addEventListener("scroll", hidePieTip, { passive: true });

  connectedContent.addEventListener("input", event => {
    const control = event.target.closest("[data-filter]");
    if (!control || !resultsView) return;
    const key = control.dataset.filter;
    ui[key] = control.value;
    ui.pages = {};
    if (key === "rankCategory") ui.rankSub = "";
    if (key === "district") {
      ui.branch = "";
      renderConnected();
    } else if (key === "period") {
      renderConnected();
    } else {
      const caret = control.selectionStart;
      refreshResults();
      if (key === "search") {
        const field = document.querySelector('#live-results [data-filter="search"]');
        if (field) {
          field.focus();
          field.setSelectionRange(caret, caret);
        }
      }
    }
  });

  connectedContent.addEventListener("click", event => {
    const detailRow = event.target.closest("[data-ps-detail]");
    if (detailRow) openPsDetailModal(detailRow.dataset.psDetail);
    const brandRow = event.target.closest("[data-brand-detail]");
    if (brandRow) openBrandDetailModal(brandRow.dataset.brandDetail);
    const pagerButton = event.target.closest("[data-pager]");
    if (pagerButton && !pagerButton.disabled) {
      ui.pages[pagerButton.dataset.pager] = Number(pagerButton.dataset.page);
      refreshResults();
    }
  });

  connectedContent.addEventListener("keydown", event => {
    const detailRow = event.target.closest?.("[data-ps-detail]");
    const brandRow = event.target.closest?.("[data-brand-detail]");
    if (brandRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openBrandDetailModal(brandRow.dataset.brandDetail);
    }
    if (detailRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openPsDetailModal(detailRow.dataset.psDetail);
    }
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = loginForm.querySelector('[type="submit"]');
    submit.disabled = true;
    setAuthMessage("Signing in…");
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail(loginForm.elements.email.value) || loginForm.elements.email.value.trim(),
        password: loginForm.elements.password.value,
      });
      if (error) throw error;
      await loadLiveWorkspace(data.session);
    } catch (error) {
      console.error("Branchline sign-in failed.", error);
      setAuthMessage(error.message || "Unable to sign in. Check your email and password.", true);
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#sign-out").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error("Branchline sign-out failed.", error);
      connectedContent.insertAdjacentHTML("afterbegin", `<p class="connected-error">${escapeHTML(error.message)}</p>`);
      return;
    }
    clearWorkspace();
  });

  document.querySelector("#enter-demo").addEventListener("click", () => {
    authScreen.hidden = true;
    connectedShell.hidden = true;
    demoApp.hidden = false;
  });

  document.querySelector("#connected-menu").addEventListener("click", () => {
    connectedSidebar.classList.toggle("open");
  });

  document.querySelector(".connected-main").addEventListener("click", event => {
    if (connectedSidebar.classList.contains("open") && !event.target.closest("#connected-menu")) {
      connectedSidebar.classList.remove("open");
    }
  });

  if (window.supabase?.createClient && config?.url && config?.publishableKey) {
    client = window.supabase.createClient(config.url, config.publishableKey);
    configWarning.hidden = true;
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearWorkspace();
      } else if (session && session.user.id !== currentSession?.user?.id) {
        window.setTimeout(() => loadLiveWorkspace(session), 0);
      }
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Unable to restore the Branchline session.", error);
        setAuthMessage("Unable to restore your sign-in. Try signing in again.", true);
        return;
      }
      if (data.session) loadLiveWorkspace(data.session);
    }).catch(error => {
      console.error("Unable to check the Branchline session.", error);
      setAuthMessage("Unable to connect to Supabase. Check your connection and try again.", true);
    });
  } else {
    document.querySelector("#login-form").querySelectorAll("input,button").forEach(control => { control.disabled = true; });
    configWarning.hidden = false;
    configWarning.textContent = window.supabase?.createClient
      ? "Supabase is not configured yet. Add the project's public publishable key to supabase-config.js. Never use a secret/service-role key here."
      : "The Supabase client could not load. Connect to the internet, reload the app, or use the sample demo.";
    setAuthMessage("Live sign-in is not configured yet.", true);
  }

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("Unable to register the Branchline service worker.", error);
    }));
  }
})();
