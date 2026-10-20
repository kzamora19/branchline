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
    analytics: "Analytics",
    targets: "Targets",
    products: "Products",
    users: "People & access",
  };
  const rolePages = {
    ps: ["overview", "sales", "analytics"],
    manager: ["overview", "sales", "analytics", "targets", "products"],
    district_manager: ["overview", "sales", "analytics", "targets", "products"],
    admin: ["overview", "sales", "analytics", "targets", "products", "users"],
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
  const ui = { period: "month", month: "", district: "", branch: "", date: "", search: "", rankBrand: "", rankCategory: "", rankSub: "",   anDim: "brand", anBasis: "all", brandSort: "sales", logBranch: "", logFrom: "", logTo: "", rankBranch: "", brandBranch: "", bpMix: "", bpYear: "", dsMonth: "", dsYear: "", pages: {}, sort: {}, colf: {} };
  const productSelection = new Set();
  let productsFiltered = [];
  let salesLogExport = null;
  let walkInDailyCtx = null;
  let pacePopupShown = false;

  // A test account (name or login starting with "Test", e.g. Test_ps) is never counted as a Product Specialist and its sales never count.
  const isTestProfile = profile => /^\s*test([^a-z]|$)/i.test(profile?.full_name || "") || /^\s*test([^a-z]|$)/i.test(profile?.login_id || "");
  function isTestSale(sale, testPsIds) {
    const test = value => /^\s*test(?![a-z])/i.test(String(value || ""));
    return test(sale.customer_name) || test(sale.invoice_number) || Boolean(testPsIds?.has(sale.ps_id));
  }
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
    ui.logBranch = "";
    ui.logFrom = "";
    ui.logTo = "";
    ui.pages = {};
    ui.sort = {};
    productSelection.clear();
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
    pacePopupShown = false;
    document.querySelector(".edge-glow")?.remove();
    connectedSidebar.classList.remove("open");
    connectedShell.hidden = true;
    demoApp.hidden = true;
    authScreen.hidden = false;
    setAuthMessage("");
    loginForm.reset();
    loginForm.elements.password.type = "password";
    applyRememberedLogin();
  }

  // "Remember me": the session lives in localStorage (kept across restarts) or, when unticked, sessionStorage (ends with the tab or app).
  const REMEMBER_KEY = "branchline-remember";
  const LAST_LOGIN_KEY = "branchline-last-login";
  const rememberMe = () => localStorage.getItem(REMEMBER_KEY) !== "0";
  const authStorage = {
    getItem: key => sessionStorage.getItem(key) ?? localStorage.getItem(key),
    setItem: (key, value) => {
      const keep = rememberMe() ? localStorage : sessionStorage;
      const drop = rememberMe() ? sessionStorage : localStorage;
      keep.setItem(key, value);
      drop.removeItem(key);
    },
    removeItem: key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    },
  };

  function applyRememberedLogin() {
    const box = document.querySelector("#remember-me");
    if (!box) return;
    box.checked = rememberMe();
    const last = localStorage.getItem(LAST_LOGIN_KEY);
    if (box.checked && last && loginForm.elements.email) loginForm.elements.email.value = last;
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
      const psDashboardMonth = ui.period === "day"
        ? periodDay().slice(0, 7)
        : ui.month || currentMonth();
      // Every branch holds an identical copy of the catalog, so one branch's copy is enough (keeps the app fast).
      let catalogBranch = profile.branch_id;
      if (!catalogBranch) {
        const probe = await client.from("products").select("branch_id").eq("active", true).limit(1);
        catalogBranch = probe.data?.[0]?.branch_id || null;
      }
      const [branches, districts, targets, sales, products, profiles, brandTargets, saleLines, managerLinks, brandSales, paymentModes, psDashboard, holidays, psWalkins, branchWalkins, pushMessages, paymentTargets, importBatches, dailyHistory, saleSerials] = await Promise.all([
        fetchAll("branches", "id,name,district_id", [["name", true], ["id", true]]),
        fetchAll("districts", "id,name", [["name", true], ["id", true]]),
        fetchAll("monthly_targets", "id,branch_id,month,amount", [["month", false], ["id", true]]),
        fetchAll("sales",         "id,branch_id,ps_id,ps_name,customer_name,invoice_number,sold_on,payment_mode,city,barangay,created_at,updated_at", [["sold_on", false], ["id", true]]),
                fetchAll("products", "id,branch_id,barcode,model_description,brand,category,sub_category,active,srp", [["model_description", true], ["id", true]], query => (catalogBranch ? query.eq("branch_id", catalogBranch) : query).eq("active", true)),
        fetchAll("profiles", "id,full_name,role,branch_id,district_id,assigned_brand,active,login_id,email", [["id", true]]),
        fetchAll("brand_targets", "id,branch_id,month,brand,amount", [["month", false], ["id", true]]),
        fetchAll("sale_lines",         "id,sale_id,barcode,model_description,brand,category,sub_category,srp,selling_price,quantity", [["id", true]]),
        fetchAll("manager_branches", "manager_id,branch_id", [["manager_id", true], ["branch_id", true]]),
        isPsUser ? client.rpc("brand_branch_sales") : Promise.resolve({ data: [], error: null }),
                fetchAll("payment_modes", "id,name,position", [["position", true], ["name", true]]),
        isPsUser
          ? client.rpc("get_ps_dashboard", { p_month: `${psDashboardMonth}-01` })
          : Promise.resolve({ data: [], error: null }),
        fetchAll("company_holidays", "holiday_date,label", [["holiday_date", true]]),
        fetchAll("ps_walkins", "branch_id,ps_id,counted_on,clients_assisted", [["counted_on", false], ["ps_id", true]]),
        fetchAll("branch_walkins", "branch_id,counted_on,visitors", [["counted_on", false], ["branch_id", true]]),
        fetchAll("push_messages", "id,status,message,created_at", [["created_at", true], ["id", true]]),
        fetchAll("payment_mode_targets", "id,branch_id,month,mode,share_pct,amount", [["month", false], ["id", true]]),
        isPsUser ? Promise.resolve({ data: [], error: null }) : fetchAll("sales_import_batches", "id,label,source_file,created_at,sales_count,lines_count,amount,date_from,date_to,kind", [["created_at", false], ["id", true]]),
        isPsUser ? Promise.resolve({ data: [], error: null }) : fetchAll("branch_daily_history", "branch_id,day,sales,transactions,walkins,remarks", [["day", false], ["branch_id", true]]),
                fetchAll("sale_serials", "sale_id,barcode,position,serial", [["sale_id", true], ["position", true]]),
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
      if (psDashboard.error) console.warn("The personal target summary is unavailable.", psDashboard.error);

      const lines = checkResult(saleLines, "Unable to load sale details")
        .map(item => ({ ...item, brand: titleCase(item.brand), model_description: titleCase(item.model_description), category: titleCase(item.category) || "", sub_category: titleCase(item.sub_category) || "" }));
      if (managerLinks.error) console.warn("Manager branches are unavailable.", managerLinks.error);
      if (brandSales.error) console.warn("Brand sales are unavailable.", brandSales.error);

      if (sequence !== loadSequence || !currentSession) return;

      const testPsIds = new Set(visibleProfiles.filter(isTestProfile).map(item => item.id));
      const testSaleIds = new Set(visibleSales.filter(item => isTestSale(item, testPsIds)).map(item => item.id));
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
        sales: visibleSales.filter(item => !testSaleIds.has(item.id)),
        testSales: visibleSales.filter(item => testSaleIds.has(item.id)),
        testPsIds,
        saleLines: lines.filter(line => !testSaleIds.has(line.sale_id)),
        linesBySale,
        serialsBySale: (saleSerials.error ? [] : saleSerials.data).reduce((map, row) => {
          if (!map.has(row.sale_id)) map.set(row.sale_id, []);
          map.get(row.sale_id).push(row);
          return map;
        }, new Map()),
        products: visibleProducts,
        profiles: visibleProfiles,
        managerLinks: managerLinks.error ? [] : managerLinks.data,
        paymentModes: paymentModes.error || !paymentModes.data.length
          ? PAYMENT_FALLBACK.map((name, index) => ({ id: "", name, position: index + 1 }))
          : paymentModes.data,
        brandSales: brandSales.error ? [] : (brandSales.data || []).map(item => ({
          ...item,
          brand: titleCase(item.brand),
          category: titleCase(item.category || ""),
          sub_category: titleCase(item.sub_category || ""),
          model_description: titleCase(item.model_description),
          ps_name: titleCase(item.ps_name),
        })),
        psDashboard: isPsUser && !psDashboard.error ? psDashboard.data?.[0] || null : null,
        holidays: holidays.error ? [] : holidays.data.map(item => ({ date: String(item.holiday_date).slice(0, 10), label: item.label || "" })),
        psWalkins: psWalkins.error ? [] : psWalkins.data,
        branchWalkins: branchWalkins.error ? [] : branchWalkins.data,
        pushMessages: pushMessages.error ? [] : pushMessages.data,
        paymentTargets: paymentTargets.error ? [] : paymentTargets.data.map(item => ({ ...item, month: String(item.month).slice(0, 10), share_pct: item.share_pct === null ? null : Number(item.share_pct), amount: item.amount === null ? null : Number(item.amount) })),
        importBatches: importBatches.error ? [] : importBatches.data,
        dailyHistory: dailyHistory.error ? [] : dailyHistory.data.map(row => ({ ...row, day: String(row.day).slice(0, 10), sales: Number(row.sales), transactions: Number(row.transactions) })),
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
      refreshPushButton(profile.role === "ps");
      if (!ui.month) ui.month = currentMonth();
      activePage = rolePageAllowed(activePage) ? activePage : "overview";
      renderConnected();
      if (profile.role === "ps") {
        showPacePopup();
        autoRegisterPush();
      }
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

  // An assignment can list several brands separated by "/" (e.g. "Fujidenzo / Whirlpool"), and each one can be limited
  // to a category with "Brand - Scope" (e.g. "Carrier / Condura - Aircon").
  function psBrandParts(assigned) {
    return String(assigned || "").split("/").map(part => part.trim()).filter(Boolean).map(full => {
      const at = full.indexOf("-");
      const isBrand = liveData.products.some(product => product.brand.trim().toLowerCase() === full.toLowerCase());
      return at < 0 || isBrand ? { full, base: full, scope: "" } : { full, base: full.slice(0, at).trim(), scope: full.slice(at + 1).trim() };
    });
  }

  function scopeBranchIds() {
    return new Set(liveData.branches
      .filter(branch => (!ui.district || branch.district_id === ui.district) && (!ui.branch || branch.id === ui.branch))
      .map(branch => branch.id));
  }

  // District managers and above can narrow individual tables to one branch.
  const canPickBranch = () => ["admin", "district_manager"].includes(currentProfile.role);

  function panelBranchSelect(key, ids, className = "field an-inline") {
    const branches = liveData.branches.filter(branch => ids.has(branch.id)).sort((a, b) => natural(a.name, b.name));
    if (!canPickBranch() || branches.length < 2) return "";
    return `<label class="${className}"><span class="${className.includes("an-inline") ? "visually-hidden" : ""}">Branch</span><select data-filter="${key}"><option value="">All branches</option>${branches.map(branch =>
      `<option value="${escapeHTML(branch.id)}" ${ui[key] === branch.id ? "selected" : ""}>${escapeHTML(branch.name)}</option>`).join("")}</select></label>`;
  }

  function panelIds(key, ids) {
    return canPickBranch() && ui[key] && ids.has(ui[key]) ? new Set([ui[key]]) : ids;
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

  function personalTargetProgress() {
    const branchId = currentProfile.branch_id;
    const activePsCount = Number(liveData.psDashboard?.ps_count) || 0;
    const branchTarget = liveData.targets
      .filter(row => row.branch_id === branchId && targetInPeriod(row.month))
      .reduce((total, row) => total + Number(row.amount), 0);
    const target = activePsCount ? branchTarget / activePsCount : 0;
    const actual = liveData.sales
      .filter(sale => sale.ps_id === currentProfile.id
        && sale.branch_id === branchId
        && inStatus(sale.sold_on))
      .reduce((total, sale) => total + saleTotal(sale), 0);
    return { actual, target, branchTarget, activePsCount };
  }

  function psTargetCharts(scope) {
    const personal = personalTargetProgress();
    const count = personal.activePsCount;
    return [
      progressChart(personal.actual, personal.branchTarget, scope, {
        title: "My sales vs store target",
        currentLabel: "My sales",
        emptyText: "No branch target is set for this period yet.",
      }),
      progressChart(personal.actual, personal.target, `${scope} · store target ÷ ${count} PS${count === 1 ? "" : "s"} in the branch`, {
        title: "My sales vs my share of the store target",
        currentLabel: "My sales",
        emptyText: count ? "No branch target is set for this period yet." : "The Product Specialist count is unavailable, so your share cannot be calculated.",
      }),
    ];
  }

  function brandRows(scope) {
    const ids = scope || scopeBranchIds();
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
      .sort((a, b) => {
        const progress = row => (row.target > 0 ? row.actual / row.target : -1);
        if (ui.brandSort === "target") return b.target - a.target || natural(a.brand, b.brand);
        if (ui.brandSort === "progress") return progress(b) - progress(a) || natural(a.brand, b.brand);
        if (ui.brandSort === "brand") return natural(a.brand, b.brand);
        return b.actual - a.actual || natural(a.brand, b.brand);
      });
  }

  // Header sorting drives the order; the branch dropdown (district managers and above) replaces the old "Rank by" box.
  function brandPanelControl() {
    return currentProfile.role === "ps" ? "" : panelBranchSelect("brandBranch", scopeBranchIds());
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
      ["Brand", "Sales", "Target", "Progress"],
      brands,
      row => `<tr class="rank-row" data-brand-detail="${escapeHTML(row.brand)}" tabindex="0"><td><strong>${escapeHTML(row.brand)}</strong></td><td>${formatMoney(row.actual)}</td><td>${formatMoney(row.target)}</td><td>${percent(row.actual, row.target)}</td></tr>`,
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

  function psRankingRows(scope) {
    const ids = scope || scopeBranchIds();
    const filters = { brand: ui.rankBrand, category: ui.rankCategory, sub: ui.rankSub };
    const filtered = Boolean(filters.brand || filters.category || filters.sub);
    const totals = new Map();
    liveData.sales.forEach(sale => {
      if (!sale.ps_id) return;
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
        if (profile.role === "ps" && profile.active && !isTestProfile(profile) && ids.has(profile.branch_id) && !totals.has(profile.id)) totals.set(profile.id, 0);
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
    const branchPick = panelBranchSelect("rankBranch", scopeBranchIds(), "field");
    const filters = `<div class="rank-filters">${rankFilterSelect("rankBrand", "Brand", brands, ui.rankBrand)}${rankFilterSelect("rankCategory", "Category", categories, ui.rankCategory)}${rankFilterSelect("rankSub", "Sub-category", subs, ui.rankSub)}${branchPick}</div>`;
    const active = [ui.rankBrand, ui.rankCategory, ui.rankSub].filter(Boolean).join(" › ");
    return panel(
      "Product Specialist ranking",
      `${periodLabel()} · ${active ? `sales of ${active}` : "overall sales regardless of brand"}, highest first. Click a name to see their sales.`,
      filters + tableBlock(
        "psrank",
        ["Rank", "Product Specialist", "Brand", "Branch", "Total sales"],
        psRankingRows(panelIds("rankBranch", scopeBranchIds())),
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
      const glowClass = entry.glow ? ` pie-glow pie-glow-${entry.glow}` : "";
      const tip = entry.muted ? "" : ` class="pie-slice${glowClass}" data-tip="${escapeHTML(`${entry.label}|${showAmounts ? formatMoney(entry.value) : ""}|${entry.percentText}`)}"`;
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

  // Share of the target that should be reached by today: 1 for finished months, 0 for future ones,
  // and the share of selling days elapsed for the current month. Year-to-date weights each month by its own target.
  function paceFraction(scopeIds) {
    const A = window.BranchlineAnalytics;
    const today = localISODate();
    const rules = A.makeRules(ui.anBasis, companyHolidayDates());
    const monthFraction = month => {
      if (month < today.slice(0, 7)) return 1;
      if (month > today.slice(0, 7)) return 0;
      const refDate = ui.period === "day" && periodDay() < today ? periodDay() : today;
      const fraction = A.expectedFraction({ month, refDate, rules, partialDay: refDate === today });
      return fraction ?? 1;
    };
    if (ui.period !== "year") return monthFraction(anchorMonth());
    let weighted = 0;
    let total = 0;
    liveData.targets.forEach(row => {
      if ((scopeIds && !scopeIds.has(row.branch_id)) || !targetInPeriod(row.month)) return;
      const amount = Number(row.amount);
      total += amount;
      weighted += amount * monthFraction(row.month.slice(0, 7));
    });
    return total > 0 ? weighted / total : monthFraction(anchorMonth());
  }

  // Red = behind pace, green = on pace, blue = target reached or exceeded.
  function paceStatus(actual, target) {
    if (actual >= target) return { key: "exceeded", color: "#355ee8", label: "Target reached" };
    const expected = paceFraction();
    if (actual >= target * expected) return { key: "on", color: "#16a34a", label: "On pace" };
    return { key: "behind", color: "#dc2626", label: "Behind pace" };
  }

  function progressChart(actual, target, subtitle, options = {}) {
    const title = options.title || "Target progress";
    if (!(target > 0)) {
      return `<section class="connected-panel pie-card"><div class="connected-panel-heading"><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div><div class="empty-state">${escapeHTML(options.emptyText || "No target is set for this selection.")}</div></section>`;
    }
    const showAmounts = options.amounts !== false;
    const status = paceStatus(actual, target);
    const expected = paceFraction();
    const paceText = `${status.label}${status.key === "exceeded" ? "" : ` (expected ${(expected * 100).toFixed(1)}% by now)`}`;
    return pieChart(
      title,
      `${showAmounts ? `Target ${formatMoney(target)} · ${subtitle}` : subtitle} · ${paceText}`,
      [
        { label: options.currentLabel || "Current sales", value: Math.min(actual, target), color: status.color, glow: { behind: "red", on: "green", exceeded: "blue" }[status.key], percentText: percent(actual, target), labelText: percent(actual, target, 2) },
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
  const SELECT_HEADER = "__select__";
  const isDataHeader = header => header !== "" && header !== SELECT_HEADER;

  // Sorts rows by the text of one column (numbers, money and percentages compare numerically; a data-sort attribute overrides the text).
  function sortedItems(items, rowHtml, sort) {
    const doc = new DOMParser().parseFromString(`<table><tbody>${items.map(rowHtml).join("")}</tbody></table>`, "text/html");
    const keys = [...doc.querySelectorAll("tbody > tr")].map(tr => {
      const cell = tr.children[sort.col];
      const text = (cell?.dataset.sort ?? cell?.textContent ?? "").trim();
      const number = /\d/.test(text) ? Number(text.replace(/[₱,%#+\s]/g, "")) : NaN;
      return { text, number: Number.isNaN(number) ? null : number, empty: !text || text === "—" };
    });
    const direction = sort.dir === "desc" ? -1 : 1;
    return items
      .map((item, index) => ({ item, index, key: keys[index] }))
      .sort((a, b) => {
        if (a.key.empty !== b.key.empty) return a.key.empty ? 1 : -1;
        let result;
        if (a.key.number !== null && b.key.number !== null) result = a.key.number - b.key.number;
        else result = natural(a.key.text, b.key.text);
        return (result * direction) || a.index - b.index;
      })
      .map(entry => entry.item);
  }

  function tableBlock(key, headers, items, rowHtml, emptyText, pageSize = PAGE_SIZE) {
    const sort = ui.sort[key];
    if (sort && isDataHeader(headers[sort.col] ?? "")) items = sortedItems(items, rowHtml, sort);
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
    const head = headers.map((header, col) => {
      if (header === SELECT_HEADER) return `<th class="select-cell"><input type="checkbox" data-product-select-all ${productsFiltered.length && productSelection.size === productsFiltered.length ? "checked" : ""} aria-label="Select all products"></th>`;
      if (!isDataHeader(header)) return "<th></th>";
      const active = sort?.col === col ? sort.dir : "";
      return `<th aria-sort="${active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}"><button class="sort-btn" type="button" data-sort-table="${key}" data-sort-col="${col}">${escapeHTML(header)}<span class="sort-arrow">${active === "asc" ? "▲" : active === "desc" ? "▼" : ""}</span></button></th>`;
    }).join("");
    return `<div class="connected-table-wrap" data-table-key="${key}"><table class="connected-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="connected-pager"><span>${from}–${to} of ${items.length}</span>
        <div><button class="button button-outline" type="button" data-pager="${key}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${page} of ${pages}</span><button class="button button-outline" type="button" data-pager="${key}" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next</button></div></div>`;
  }

  // Like tableBlock, but without paging or auto-export: for small tables that have their own Export button or total row.
  function sortableTable(key, headers, items, rowHtml, footerHtml = "") {
    const sort = ui.sort[key];
    const shown = sort ? sortedItems(items, rowHtml, sort) : items;
    const head = headers.map((header, col) => {
      const active = sort?.col === col ? sort.dir : "";
      return `<th aria-sort="${active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}"><button class="sort-btn" type="button" data-sort-table="${key}" data-sort-col="${col}">${escapeHTML(header)}<span class="sort-arrow">${active === "asc" ? "▲" : active === "desc" ? "▼" : ""}</span></button></th>`;
    }).join("");
    return `<div class="connected-table-wrap"><table class="connected-table"><thead><tr>${head}</tr></thead><tbody>${shown.map(rowHtml).join("")}${footerHtml}</tbody></table></div>`;
  }

  // Exports a table that is not built with tableBlock; returns the Export button for the panel header.
  function manualExport(key, title, headers, items, rowHtml) {
    tableStore[key] = { headers, items, rowHtml, title };
    return `<button class="button button-outline button-small" type="button" data-export-table="${key}">Export</button>`;
  }

  // A table with a filter box (or dropdown) under every heading. cols[i].get(row) is the text to filter on.
  function columnFilterTable(key, head, rows, rowHtml, cols) {
    const state = ui.colf[key] || (ui.colf[key] = {});
    const kept = rows.filter(row => cols.every((col, index) => {
      const wanted = state[index];
      if (!wanted) return true;
      const value = String(col.get(row) ?? "");
      return col.select ? value === wanted : value.toLowerCase().includes(wanted.toLowerCase());
    }));
    const controls = cols.map((col, index) => {
      const wanted = state[index] || "";
      if (col.select) {
        const values = [...new Set(rows.map(row => String(col.get(row) ?? "")))];
        return `<th><select data-colfilter="${key}|${index}" aria-label="Filter ${escapeHTML(head[index])}"><option value="">All</option>${values.map(value =>
          `<option value="${escapeHTML(value)}" ${value === wanted ? "selected" : ""}>${escapeHTML(value)}</option>`).join("")}</select></th>`;
      }
      return `<th><input type="search" data-colfilter="${key}|${index}" value="${escapeHTML(wanted)}" placeholder="Filter" autocomplete="off" aria-label="Filter ${escapeHTML(head[index])}"></th>`;
    }).join("");
    const body = kept.length ? kept.map(rowHtml).join("") : `<tr><td colspan="${head.length}"><div class="empty-state">No rows match these filters.</div></td></tr>`;
    return {
      kept,
      active: Object.values(state).some(Boolean),
      html: `<div class="connected-table-wrap" data-filter-table="${key}"><table class="connected-table"><thead><tr>${head.map(item => `<th>${escapeHTML(item)}</th>`).join("")}</tr><tr class="col-filter-row">${controls}</tr></thead><tbody>${body}</tbody></table></div>`,
    };
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
    else if (activePage === "analytics") renderAnalyticsPage();
    else if (activePage === "targets") renderTargetsPage();
    else if (activePage === "products") renderProductsPage();
    else if (activePage === "users") renderPeoplePage();
    else renderOverview();
  }

  // Imported daily totals only fill days with no live sales. Managers and above only.
  function withHistoryFacts(facts, ids, isPs) {
    const history = isPs ? [] : liveData.dailyHistory || [];
    return history.length ? [...facts, ...window.BranchlineDailyHistory.historyFacts(history, facts, ids)] : facts;
  }

  function storeCountsFor(ids, isPs) {
    if (isPs) return [];
    const real = liveData.branchWalkins.filter(row => ids.has(row.branch_id));
    const history = (liveData.dailyHistory || []).filter(row => ids.has(row.branch_id));
    return history.length ? [...real, ...window.BranchlineDailyHistory.historyWalkins(history, real)] : real;
  }

  function analyticsFacts(ids) {
    const sales = currentProfile.role === "ps" ? visibleSales() : liveData.sales;
    const facts = [];
    sales.forEach(sale => {
      if (!ids.has(sale.branch_id)) return;
      linesForSale(sale.id).forEach(line => {
        facts.push({
          date: sale.sold_on.slice(0, 10),
          saleId: sale.id,
          branchId: sale.branch_id,
          psId: sale.ps_id,
          psName: sale.ps_name || "",
          brand: (line.brand || "").trim() || "Unbranded",
          category: (line.category || "").trim(),
          subCategory: (line.sub_category || "").trim(),
          product: (line.model_description || "").trim() || "Unnamed product",
          amount: Number(line.selling_price) * Number(line.quantity),
          srpAmount: line.srp != null && Number(line.srp) > 0 && Number(line.selling_price) > 0 ? Number(line.srp) * Number(line.quantity) : 0,
          soldAmount: line.srp != null && Number(line.srp) > 0 && Number(line.selling_price) > 0 ? Number(line.selling_price) * Number(line.quantity) : 0,
        });
      });
    });
    return facts;
  }

  function analyticsChart(series, target, days) {
    const width = 640;
    const height = 220;
    const pad = { left: 56, right: 12, top: 12, bottom: 24 };
    const last = series.forecast.at(-1)?.value ?? 0;
    const max = Math.max(target || 0, last, series.actual.at(-1)?.value || 0, 1);
    const x = day => pad.left + ((day - 1) / Math.max(days - 1, 1)) * (width - pad.left - pad.right);
    const y = value => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
    const path = points => points.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
    const targetLine = target > 0
      ? `<line class="an-target" x1="${pad.left}" x2="${width - pad.right}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/><text class="an-axis" x="${width - pad.right}" y="${(y(target) - 4).toFixed(1)}" text-anchor="end">Target ${escapeHTML(formatMoney(target))}</text>`
      : "";
    const ticks = [0, 0.5, 1].map(fraction => `<text class="an-axis" x="${pad.left - 6}" y="${(y(max * fraction) + 4).toFixed(1)}" text-anchor="end">${escapeHTML(formatMoney(max * fraction).replace(/\.\d+$/, ""))}</text>`).join("");
    const dayTicks = [1, Math.ceil(days / 2), days].map(day => `<text class="an-axis" x="${x(day).toFixed(1)}" y="${height - 6}" text-anchor="middle">${day}</text>`).join("");
    return `<svg class="an-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative sales this month: actual, forecast and target">
      <line class="an-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}"/>
      ${ticks}${dayTicks}${targetLine}
      ${series.forecast.length > 1 ? `<path class="an-forecast" d="${path(series.forecast)}"/>` : ""}
      ${series.actual.length ? `<path class="an-actual" d="${path(series.actual)}"/>` : ""}
    </svg>
    <div class="an-legend"><span class="an-key an-key-actual">Actual</span><span class="an-key an-key-forecast">Forecast (projection, not actual)</span>${target > 0 ? '<span class="an-key an-key-target">Target</span>' : ""}</div>`;
  }

  function growthCell(value) {
    if (value === null) return '<span class="an-muted">n/a</span>';
    const sign = value > 0 ? "+" : "";
    return `<span class="${value < 0 ? "an-down" : "an-up"}">${sign}${(value * 100).toFixed(1)}%</span>`;
  }

  // ---------- Payment mix ----------
  function canSetPaymentTargets() {
    return ["admin", "district_manager", "manager"].includes(currentProfile.role);
  }

  // Period filters for the analytics tables: MTD, YTD or a single day picked on a calendar.
  function resolvePeriod(key, month, through) {
    const A = window.BranchlineAnalytics;
    const mode = ["mtd", "ytd", "day"].includes(ui[key]) ? ui[key] : "mtd";
    const throughMonth = through.slice(0, 7);
    const throughYear = through.slice(0, 4);
    if (mode === "ytd") {
      const picked = /^\d{4}$/.test(ui[`${key}Y`]) ? ui[`${key}Y`] : throughYear;
      const year = Number(picked);
      const custom = picked !== throughYear;
      const to = custom ? `${year}-12-31` : through;
      return { mode, custom, from: `${year}-01-01`, to, prevFrom: `${year - 1}-01-01`, prevTo: custom ? `${year - 1}-12-31` : A.sameDayPriorYear(through), name: "Year to date", note: "same period last year", label: custom ? `Full year ${year}` : `Year to date ${year}` };
    }
    if (mode === "day") {
      const day = ui[`${key}Date`] || through;
      return { mode, from: day, to: day, prevFrom: A.addDays(day, -1), prevTo: A.addDays(day, -1), name: "Day", note: "the previous day", label: new Date(`${day}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" }) };
    }
    const pickedYear = /^\d{4}$/.test(ui[`${key}Y`]) ? ui[`${key}Y`] : throughYear;
    const pickedMonth = /^(0[1-9]|1[0-2])$/.test(ui[`${key}M`]) ? ui[`${key}M`] : throughMonth.slice(5, 7);
    const ym = `${pickedYear}-${pickedMonth}`;
    if (ym !== throughMonth) {
      const before = A.shiftMonth(ym, -1);
      return { mode, custom: true, from: A.monthStart(ym), to: A.monthEnd(ym), prevFrom: A.monthStart(before), prevTo: A.monthEnd(before), name: "Month", note: "the previous month", label: monthLabel(ym) };
    }
    return { mode, custom: false, from: A.monthStart(month), to: through, prevFrom: A.monthStart(A.shiftMonth(month, -1)), prevTo: A.sameDayPriorMonth(through), name: "Month to date", note: "the same days last month", label: `${monthLabel(month)} to date` };
  }

  function periodControl(key, through) {
    const mode = ["mtd", "ytd", "day"].includes(ui[key]) ? ui[key] : "mtd";
    const options = [["mtd", "Month to date"], ["ytd", "Year to date"], ["day", "Daily (calendar)"]];
    const years = new Set([through.slice(0, 4), String(Number(through.slice(0, 4)) - 1)]);
    [...liveData.sales.map(sale => sale.sold_on), ...liveData.targets.map(row => row.month), ...(liveData.dailyHistory || []).map(row => row.day)]
      .forEach(date => date && years.add(String(date).slice(0, 4)));
    const year = /^\d{4}$/.test(ui[`${key}Y`]) ? ui[`${key}Y`] : through.slice(0, 4);
    const monthValue = /^(0[1-9]|1[0-2])$/.test(ui[`${key}M`]) ? ui[`${key}M`] : through.slice(5, 7);
    const monthSelect = `<label class="field an-inline an-narrow"><span class="visually-hidden">Month</span><select data-filter="${key}M">${Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, "0");
      return `<option value="${value}" ${value === monthValue ? "selected" : ""}>${new Date(2000, index, 1).toLocaleString("en-PH", { month: "long" })}</option>`;
    }).join("")}</select></label>`;
    const yearSelect = `<label class="field an-inline an-narrow"><span class="visually-hidden">Year</span><select data-filter="${key}Y">${[...years].filter(value => value >= "2000").sort().reverse().map(value =>
      `<option value="${value}" ${value === year ? "selected" : ""}>${value}</option>`).join("")}</select></label>`;
    return `<label class="field an-inline"><span class="visually-hidden">Period</span><select data-filter="${key}">${options.map(([value, text]) =>
      `<option value="${value}" ${mode === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>${mode === "day"
      ? `<label class="field an-inline"><span class="visually-hidden">Date</span><input type="date" data-filter="${key}Date" value="${escapeHTML(ui[`${key}Date`] || through)}"></label>`
      : mode === "ytd" ? yearSelect : `${monthSelect}${yearSelect}`}`;
  }

  // Branch target for a period: whole-month targets for every month it touches; a single day gets its share of the month.
  function periodTarget(branchId, period) {
    const A = window.BranchlineAnalytics;
    const fromMonth = period.from.slice(0, 7);
    const toMonth = period.to.slice(0, 7);
    const total = liveData.targets
      .filter(row => row.branch_id === branchId && row.month.slice(0, 7) >= fromMonth && row.month.slice(0, 7) <= toMonth)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return period.mode === "day" ? total / Number(A.monthEnd(toMonth).slice(8, 10)) : total;
  }

  function computePaymentMix(month, ids, through, period) {
    const A = window.BranchlineAnalytics;
    const isPs = currentProfile.role === "ps";
    const p = period || { mode: "mtd", from: A.monthStart(month), to: through || A.monthEnd(month) };
    const all = isPs ? visibleSales() : liveData.sales;
    const within = (from, to) => all
      .filter(sale => ids.has(sale.branch_id) && sale.sold_on.slice(0, 10) >= from && sale.sold_on.slice(0, 10) <= to)
      .map(sale => ({ mode: sale.payment_mode, amount: saleTotal(sale) }));
    const modes = liveData.paymentModes.map(item => item.name);
    const fromMonth = p.from.slice(0, 7);
    const toMonth = p.to.slice(0, 7);
    const scale = p.mode === "day" ? 1 / Number(A.monthEnd(toMonth).slice(8, 10)) : 1;
    // Targets are keyed by branch and month so a year-to-date view sums each month's own target.
    const branchTargets = new Map();
    liveData.targets.filter(row => ids.has(row.branch_id) && row.month.slice(0, 7) >= fromMonth && row.month.slice(0, 7) <= toMonth)
      .forEach(row => addTo(branchTargets, `${row.branch_id}|${row.month.slice(0, 7)}`, Number(row.amount) * scale));
    // Targets are branch-level, so a PS only sees their own mix without a target comparison.
    const targets = isPs ? [] : liveData.paymentTargets
      .filter(row => ids.has(row.branch_id) && row.month.slice(0, 7) >= fromMonth && row.month.slice(0, 7) <= toMonth)
      .map(row => ({ ...row, branch_id: `${row.branch_id}|${row.month.slice(0, 7)}`, amount: row.amount === null ? null : row.amount * scale }));
    const mix = A.paymentMix({ sales: within(p.from, p.to), modes, targets, branchTargets });
    const lastYear = A.paymentMix({ sales: within(A.sameDayPriorYear(p.from), A.sameDayPriorYear(p.to)), modes });
    mix.rows.forEach(row => {
      const match = lastYear.rows.find(item => item.mode === row.mode);
      row.lySales = match ? match.sales : 0;
      row.lyShare = match ? match.share : null;
    });
    mix.lyTotal = lastYear.total;
    mix.range = { from: p.from, to: p.to, lyFrom: A.sameDayPriorYear(p.from), lyTo: A.sameDayPriorYear(p.to) };
    return mix;
  }

  const MIX_STATUS = { above: "Above target", below: "Below target", on: "On target", none: "No target" };

  function paymentMixPanels(month, mix, label, controls = "") {
    const hasTarget = mix.hasTargets;
    const head = ["Payment mode", "Transactions", "Sales", "Actual mix", "Last year", "Last year mix", "Target mix", "Target (₱)", "Achievement", "Status"];
    const pct = value => (value === null || value === undefined ? "n/a" : `${value.toFixed(1)}%`);
    const rowHtml = row => `<tr><td><strong>${escapeHTML(row.mode)}</strong></td><td>${row.transactions}</td><td>${formatMoney(row.sales)}</td><td>${pct(row.share)}</td><td>${formatMoney(row.lySales || 0)}</td><td>${pct(row.lyShare)}</td><td>${row.targetPct === null ? "—" : row.targetPct.toFixed(1) + "%"}</td><td>${row.targetAmount === null ? "—" : formatMoney(row.targetAmount)}</td><td>${row.achievement === null ? "—" : (row.achievement * 100).toFixed(1) + "%"}</td><td><span class="${row.status === "none" ? "an-muted" : "mix-" + row.status}">${MIX_STATUS[row.status]}</span></td></tr>`;
    const totalRow = `<tr class="total-row"><td><strong>Total</strong></td><td>${mix.totalTransactions}</td><td>${formatMoney(mix.total)}</td><td>${mix.total ? "100%" : "n/a"}</td><td>${formatMoney(mix.lyTotal || 0)}</td><td>${mix.lyTotal ? "100%" : "n/a"}</td><td colspan="4"></td></tr>`;
    const table = mix.rows.length
      ? sortableTable("mix", head, mix.rows, rowHtml, totalRow)
      : '<div class="empty-state">No sales or targets for this period.</div>';
    const exportButton = manualExport("mix-table", `Payment mix ${label}`, head, mix.rows, rowHtml);
    const editButton = canSetPaymentTargets() ? `<button class="button button-primary button-small" type="button" data-open="payment-targets">Set mix targets</button>` : "";
    const lyLabel = mix.range ? `Same period last year (${mix.range.lyFrom} to ${mix.range.lyTo})` : "Same period last year";
    const pies = [
      pieChart("Sales by payment mode", label, mix.rows.map(row => ({ label: row.mode, value: row.sales }))),
      pieChart("Sales by payment mode · last year", lyLabel, mix.rows.map(row => ({ label: row.mode, value: row.lySales || 0 }))),
    ];
    if (hasTarget) {
      const targetEntries = mix.rows.filter(row => row.targetPct !== null).map(row => ({ label: row.mode, value: row.targetPct }));
      pies.push(pieChart("Target payment mix", `${label} · share of sales`, targetEntries, { amounts: false }));
    }
    return `<div class="connected-charts">${pies.join("")}</div>${panel("Payment mix: this year vs last year vs target", `${label}. Status compares each mode's share of sales with its target share (±2 points counts as on target). Last year only has data for sales that were recorded with a payment mode.`, table, `<div class="mix-tools"><div class="mix-tools-left">${editButton}</div><div class="mix-tools-right">${controls}${exportButton}</div></div>`)}`;
  }

  function openPaymentTargetsModal() {
    const branches = [...liveData.branches].sort((a, b) => natural(a.name, b.name));
    const modes = liveData.paymentModes.map(item => item.name);
    const startBranch = branches.find(branch => branch.id === ui.branch)?.id || branches[0]?.id;
    const month = ui.month || currentMonth();
    const rowsHtml = modes.map((name, index) => `<tr><td>${escapeHTML(name)}</td><td><input name="pct_${index}" type="number" min="0" max="100" step="0.01" placeholder="%"></td><td><input name="amt_${index}" type="number" min="0" step="0.01" placeholder="₱"></td></tr>`).join("");
    openModal({
      title: "Payment mix targets",
      intro: "Set a share target (%), a peso target, or both for each payment mode. Targets are per branch and per month; a new month starts empty until you set it (or copy last month).",
      submitLabel: "Save targets",
      wide: true,
      body: `${fieldHTML("Branch", "branch", selectHTML("branch", [...(branches.length > 1 ? [["all", `All my branches (${branches.length})`]] : []), ...branches.map(branch => [branch.id, branch.name])], startBranch))}
        ${fieldHTML("Month", "month", `<input name="month" type="month" value="${month}" required>`)}
        <div class="connected-table-wrap"><table class="connected-table pm-table"><thead><tr><th>Payment mode</th><th>Share target (%)</th><th>Peso target (₱)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <p class="an-note" id="pm-note"></p>
        <button class="button button-outline button-small" type="button" id="pm-copy">Copy last month's targets</button>`,
      onReady: form => {
        const note = form.querySelector("#pm-note");
        const fill = (monthValue, silent) => {
          const branchId = form.elements.branch.value;
          modes.forEach((name, index) => { form.elements[`pct_${index}`].value = ""; form.elements[`amt_${index}`].value = ""; });
          if (branchId === "all") { if (!silent) note.textContent = "Applies to every listed branch. Blank rows are left unchanged."; return 0; }
          const found = liveData.paymentTargets.filter(row => row.branch_id === branchId && row.month.slice(0, 7) === monthValue);
          found.forEach(row => {
            const index = modes.indexOf(row.mode);
            if (index < 0) return;
            form.elements[`pct_${index}`].value = row.share_pct ?? "";
            form.elements[`amt_${index}`].value = row.amount ?? "";
          });
          if (!silent) note.textContent = found.length ? "" : "No targets set for this branch and month yet. Blank rows are cleared on save.";
          return found.length;
        };
        const reload = () => fill(form.elements.month.value);
        form.elements.branch.addEventListener("change", reload);
        form.elements.month.addEventListener("change", reload);
        form.querySelector("#pm-copy").addEventListener("click", () => {
          const previousMonth = window.BranchlineAnalytics.shiftMonth(form.elements.month.value, -1);
          const copied = fill(previousMonth, true);
          note.textContent = copied ? `Copied ${copied} target(s) from ${monthLabel(previousMonth)}. Review and save.` : `No targets found for ${monthLabel(previousMonth)}.`;
        });
        reload();
      },
      onSubmit: async form => {
        const read = name => {
          const raw = form.elements[name].value.trim();
          return raw === "" ? null : Number(raw);
        };
        const entries = modes.map((name, index) => ({ name, pct: read(`pct_${index}`), amt: read(`amt_${index}`) }));
        entries.forEach(entry => {
          if (entry.pct !== null && (!Number.isFinite(entry.pct) || entry.pct < 0 || entry.pct > 100)) throw new Error(`${entry.name}: the share must be between 0 and 100.`);
          if (entry.amt !== null && (!Number.isFinite(entry.amt) || entry.amt < 0)) throw new Error(`${entry.name}: enter a valid peso amount.`);
        });
        const shareTotal = entries.reduce((sum, entry) => sum + (entry.pct || 0), 0);
        if (shareTotal > 100.01) throw new Error(`The share targets add up to ${shareTotal.toFixed(2)}%. They must not exceed 100%.`);
        const selected = form.elements.branch.value;
        const ids = selected === "all" ? branches.map(branch => branch.id) : [selected];
        const monthDate = `${form.elements.month.value}-01`;
        const stamp = new Date().toISOString();
        const upserts = [];
        ids.forEach(id => entries.forEach(entry => {
          if (entry.pct === null && entry.amt === null) return;
          upserts.push({ dealer_id: currentProfile.dealer_id, branch_id: id, month: monthDate, mode: entry.name, share_pct: entry.pct, amount: entry.amt, created_by: currentProfile.id, updated_at: stamp });
        }));
        if (upserts.length) {
          const saved = await client.from("payment_mode_targets").upsert(upserts, { onConflict: "branch_id,month,mode" });
          if (saved.error) throw saved.error;
        }
        const blank = entries.filter(entry => entry.pct === null && entry.amt === null).map(entry => entry.name);
        if (selected !== "all" && blank.length) {
          const removed = await client.from("payment_mode_targets").delete().eq("branch_id", selected).eq("month", monthDate).in("mode", blank);
          if (removed.error) throw removed.error;
        }
        await refreshData();
      },
    });
  }

  // ---------- Traffic, transactions and conversion comparison ----------
  function trafficStats(A, ctx, from, to) {
    const inRange = ctx.sales.filter(sale => sale.date >= from && sale.date <= to);
    const total = inRange.reduce((sum, sale) => sum + sale.amount, 0);
    const walk = A.walkInSummary({ from, to, storeCounts: ctx.storeCounts, psCounts: ctx.psCounts, transactions: inRange.map(sale => ({ id: sale.id, branchId: sale.branchId, date: sale.date })) });
    return { sales: total, transactions: inRange.length, avgTicket: A.average(total, inRange.length), visitors: walk.visitors, covered: walk.coveredDays, conversion: walk.conversion, matched: walk.transactions };
  }

  function trafficContext(facts, ids, isPs) {
    const bySale = new Map();
    facts.forEach(fact => {
      const entry = bySale.get(fact.saleId) || { id: fact.saleId, branchId: fact.branchId, date: fact.date, amount: 0 };
      entry.amount += fact.amount;
      bySale.set(fact.saleId, entry);
    });
    return {
      sales: [...bySale.values()],
      storeCounts: storeCountsFor(ids, isPs),
      psCounts: liveData.psWalkins.filter(row => ids.has(row.branch_id) && (!isPs || row.ps_id === currentProfile.id)),
    };
  }

  function trafficPanels(A, ctx, month, through, yearCtx = ctx, yearBranchControl = "") {
    const monthStart = A.monthStart(month);
    const weekFrom = A.weekStart(through);
    const yearStart = `${month.slice(0, 4)}-01-01`;
    const periods = [
      ["Day", through, through, A.addDays(through, -1), A.addDays(through, -1), "vs previous day"],
      ["Week to date", weekFrom, through, A.addDays(weekFrom, -7), A.addDays(through, -7), "vs same days last week"],
      ["Month to date", monthStart, through, A.monthStart(A.shiftMonth(month, -1)), A.sameDayPriorMonth(through), "vs same days last month"],
      ["Year to date", yearStart, through, `${Number(month.slice(0, 4)) - 1}-01-01`, A.sameDayPriorYear(through), "vs same period last year"],
    ].map(([name, from, to, pFrom, pTo, note]) => ({ name, note, cur: trafficStats(A, ctx, from, to), prev: trafficStats(A, ctx, pFrom, pTo) }));
    const rate = value => (value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`);
    const points = (cur, prev) => {
      if (cur === null || prev === null) return '<span class="an-muted">n/a</span>';
      const diff = (cur - prev) * 100;
      return `<span class="${diff < 0 ? "an-down" : "an-up"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts</span>`;
    };
    const perDay = (stat, key) => (stat.covered > 0 ? stat[key] / stat.covered : null);
    const rows = [];
    periods.forEach(p => {
      rows.push(["Sales", p, formatMoney(p.cur.sales), formatMoney(p.prev.sales), growthCell(A.growth(p.cur.sales, p.prev.sales))]);
      rows.push(["Transactions", p, String(p.cur.transactions), String(p.prev.transactions), growthCell(A.growth(p.cur.transactions, p.prev.transactions))]);
      rows.push(["Average sale", p, p.cur.avgTicket === null ? "n/a" : formatMoney(p.cur.avgTicket), p.prev.avgTicket === null ? "n/a" : formatMoney(p.prev.avgTicket), growthCell(A.growth(p.cur.avgTicket, p.prev.avgTicket))]);
      rows.push(["Walk-ins", p, p.cur.covered ? `${p.cur.visitors} (${p.cur.covered} day${p.cur.covered === 1 ? "" : "s"})` : "No data", p.prev.covered ? `${p.prev.visitors} (${p.prev.covered} day${p.prev.covered === 1 ? "" : "s"})` : "No data", growthCell(A.growth(perDay(p.cur, "visitors"), perDay(p.prev, "visitors")))]);
      rows.push(["Conversion", p, rate(p.cur.conversion), rate(p.prev.conversion), points(p.cur.conversion, p.prev.conversion)]);
    });
    const order = ["Sales", "Transactions", "Average sale", "Walk-ins", "Conversion"];
    rows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    const head = ["Metric", "Period", "Current", "Prior", "Change"];
    const rowHtml = ([metric, p, current, prior, change]) => `<tr><td><strong>${escapeHTML(metric)}</strong></td><td>${escapeHTML(p.name)}<br><small class="an-muted">${escapeHTML(p.note)}</small></td><td>${current}</td><td>${prior}</td><td>${change}</td></tr>`;
    const plain = html => String(html).replace(/<[^>]+>/g, "");
    const filtered = columnFilterTable("traffic-compare", head, rows, rowHtml, [
      { get: row => row[0], select: true },
      { get: row => row[1].name, select: true },
      { get: row => plain(row[2]) },
      { get: row => plain(row[3]) },
      { get: row => plain(row[4]) },
    ]);
    const compare = panel("Transactions, walk-ins and conversion: day, week, month, year", "Walk-in change is per counted day so days without a count never distort it. Conversion only uses counted days. Use the boxes under each heading to filter.", filtered.html, `${filtered.active ? '<button class="button button-outline button-small" type="button" data-colfilter-clear="traffic-compare">Clear filters</button>' : ""}${manualExport("traffic-compare", "Traffic comparison", head, filtered.kept, rowHtml)}`);

    const years = new Set([Number(month.slice(0, 4))]);
    ctx.sales.forEach(sale => years.add(Number(sale.date.slice(0, 4))));
    ctx.storeCounts.forEach(row => years.add(Number(String(row.counted_on).slice(0, 4))));
    const yearList = [...years].filter(value => value >= 2000).sort((a, b) => b - a);
    const year = yearList.includes(Number(ui.yrYear)) ? Number(ui.yrYear) : Number(month.slice(0, 4));
    const throughYear = Number(through.slice(0, 4));
    const trendRows = [];
    if (year <= throughYear) {
      for (let m = 1; m <= 12; m += 1) {
        const ym = `${year}-${String(m).padStart(2, "0")}`;
        if (year === throughYear && ym > through.slice(0, 7)) break;
        const lyYm = `${year - 1}-${String(m).padStart(2, "0")}`;
        const partial = year === throughYear && ym === through.slice(0, 7);
        trendRows.push({
          month: ym,
          stat: trafficStats(A, yearCtx, A.monthStart(ym), partial ? through : A.monthEnd(ym)),
          ly: trafficStats(A, yearCtx, A.monthStart(lyYm), partial ? A.sameDayPriorYear(through) : A.monthEnd(lyYm)),
        });
      }
    }
    const yearTotal = trendRows.length ? {
      stat: trafficStats(A, yearCtx, `${year}-01-01`, year === throughYear ? through : `${year}-12-31`),
      ly: trafficStats(A, yearCtx, `${year - 1}-01-01`, year === throughYear ? A.sameDayPriorYear(through) : `${year - 1}-12-31`),
    } : null;
    const trendHead = ["Month", "Sales", "Last year sales", "Sales change", "Transactions", "Last year transactions", "Average sale", "Last year average", "Walk-ins", "Last year walk-ins", "Conversion", "Last year conversion"];
    const money = value => (value === null ? "n/a" : formatMoney(value));
    const visitors = stat => (stat.covered ? stat.visitors : "—");
    const trendCells = (stat, ly) => `<td>${formatMoney(stat.sales)}</td><td>${formatMoney(ly.sales)}</td><td>${growthCell(A.growth(stat.sales, ly.sales))}</td><td>${stat.transactions}</td><td>${ly.transactions}</td><td>${money(stat.avgTicket)}</td><td>${money(ly.avgTicket)}</td><td>${visitors(stat)}</td><td>${visitors(ly)}</td><td>${rate(stat.conversion)}</td><td>${rate(ly.conversion)}</td>`;
    const trendRowHtml = row => `<tr><td>${escapeHTML(monthLabel(row.month))}</td>${trendCells(row.stat, row.ly)}</tr>`;
    const trendTable = trendRows.length
      ? `<div class="connected-table-wrap"><table class="connected-table"><thead><tr>${trendHead.map(item => `<th>${item}</th>`).join("")}</tr></thead><tbody>${trendRows.map(trendRowHtml).join("")}<tr class="total-row"><td><strong>${year === throughYear ? "Year to date" : "Full year"}</strong></td>${trendCells(yearTotal.stat, yearTotal.ly)}</tr></tbody></table></div>`
      : '<div class="empty-state">No data for this year yet.</div>';
    const yearSelect = `<label class="field an-inline"><span class="visually-hidden">Year</span><select data-filter="yrYear">${yearList.map(value =>
      `<option value="${value}" ${value === year ? "selected" : ""}>${value}</option>`).join("")}</select></label>`;
    const trend = panel(`Yearly comparison: ${year} vs ${year - 1}`, "Month by month against the same month last year. Walk-ins show only for months that have counts.", trendTable, `${yearSelect}${yearBranchControl}${manualExport("traffic-monthly", `Yearly comparison ${year}`, trendHead, trendRows, trendRowHtml)}`);
    return { compare, trend, periods };
  }

  // ---------- Diagnosis and action plan ----------
  function insightsPanel(insights) {
    if (!insights.length) return panel("Diagnosis and action plan", "", '<div class="empty-state">Nothing to flag right now. Add targets and daily walk-in counts for deeper analysis.</div>');
    const LEVEL = { high: "High priority", medium: "Needs attention", low: "Watch", good: "Going well" };
    const list = items => (items.length ? `<ul>${items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : "");
    const cards = insights.map(item => `<article class="insight insight-${item.level}">
      <header><span class="insight-level">${LEVEL[item.level]}</span><span class="insight-area">${escapeHTML(item.area)}</span></header>
      <h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.finding)}</p>
      ${item.causes.length ? `<h4>Possible causes</h4>${list(item.causes)}` : ""}
      ${item.effects.length ? `<h4>Possible effects</h4>${list(item.effects)}` : ""}
      ${item.plans.length ? `<h4>Action plan</h4>${list(item.plans)}` : ""}
    </article>`).join("");
    const head = ["Priority", "Area", "Finding", "Possible causes", "Possible effects", "Action plan"];
    const rowHtml = item => `<tr><td>${escapeHTML(LEVEL[item.level])}</td><td>${escapeHTML(item.area)}</td><td>${escapeHTML(`${item.title}. ${item.finding}`)}</td><td>${escapeHTML(item.causes.join(" "))}</td><td>${escapeHTML(item.effects.join(" "))}</td><td>${escapeHTML(item.plans.join(" "))}</td></tr>`;
    return panel("Diagnosis and action plan", "Generated from your numbers. Causes are likely explanations to check on the floor, not proven facts.", `<div class="insight-grid">${cards}</div>`, manualExport("insights", "Diagnosis and action plan", head, insights, rowHtml));
  }

  function renderAnalyticsPage() {
    const A = window.BranchlineAnalytics;
    const isPs = currentProfile.role === "ps";
    const monthSelect = `<label class="field"><span>Month</span><select data-filter="month">${availableMonths().map(month =>
      `<option value="${month}" ${ui.month === month ? "selected" : ""}>${escapeHTML(monthLabel(month))}</option>`).join("")}</select></label>`;
    const basisSelect = `<label class="field"><span>Forecast selling days</span><select data-filter="anBasis">${Object.entries(A.RULES).map(([value, rule]) =>
      `<option value="${value}" ${ui.anBasis === value ? "selected" : ""}>${escapeHTML(rule.label)}</option>`).join("")}</select></label>`;
    const canEditHolidays = ["admin", "district_manager"].includes(currentProfile.role);
    const walkInButton = isPs
      ? '<button class="button button-outline" type="button" data-open="walkin-ps">Log clients assisted</button>'
      : '<button class="button button-outline" type="button" data-open="walkin-store">Record store visitors</button>';
    const filters = `${filterBar({ district: true, branch: true })}<div class="connected-filters" role="group" aria-label="Analytics options">${monthSelect}${basisSelect}<div class="filter-actions">${walkInButton}</div></div>`;

    mountPage(
      pageHeading("Analytics", "Actual results and forecasts for the selected month. Forecasts are projections and are always labelled."),
      "",
      filters,
      () => {
        const ids = scopeBranchIds();
        const month = ui.month;
        const today = localISODate();
        const monthStart = A.monthStart(month);
        const monthEnd = A.monthEnd(month);
        const isCurrent = month === today.slice(0, 7);
        const refDate = isCurrent ? today : (month < today.slice(0, 7) ? monthEnd : null);
        const holidayDates = companyHolidayDates();
        const rules = A.makeRules(ui.anBasis, holidayDates);
        const facts = analyticsFacts(ids);
        const allFacts = withHistoryFacts(facts, ids, isPs);
        const daily = A.dailyTotals(allFacts);
        const warning = "";

        const psProfiles = liveData.profiles.filter(profile => profile.role === "ps" && profile.active && !isTestProfile(profile) && ids.has(profile.branch_id));
        const psCountByBranch = new Map();
        psProfiles.forEach(profile => addTo(psCountByBranch, profile.branch_id, 1));
        const branchTargets = new Map();
        liveData.targets.forEach(row => {
          if (ids.has(row.branch_id) && row.month.slice(0, 7) === month) addTo(branchTargets, row.branch_id, Number(row.amount));
        });
        let target;
        let targetNote;
        if (isPs) {
          const count = Number(liveData.psDashboard?.ps_count) || 0;
          const store = branchTargets.get(currentProfile.branch_id) || 0;
          target = count ? store / count : 0;
          targetNote = `Your share: store target ${formatMoney(store)} ÷ ${count} PS${count === 1 ? "" : "s"}`;
        } else {
          target = [...branchTargets.values()].reduce((sum, value) => sum + value, 0);
          targetNote = `${branchTargets.size} branch target${branchTargets.size === 1 ? "" : "s"} for ${monthLabel(month)}`;
        }

        if (!refDate) {
          return `${warning}<div class="empty-state">${escapeHTML(monthLabel(month))} has not started yet, so there are no actual results or forecast to show.</div>`;
        }

        const through = refDate > monthEnd ? monthEnd : refDate;
        const actual = A.sumDaily(daily, monthStart, through);
        const forecast = A.forecastMonth({ month, refDate, daily, rules, partialDay: isCurrent });
        const pace = A.requiredPace({ target, actual, paceDays: forecast.paceDays });
        const transactions = new Set(allFacts.filter(f => f.date >= monthStart && f.date <= through).map(f => f.saleId)).size;
        const series = A.cumulativeSeries({ month, refDate, daily, rules, rate: forecast.status === "projected" ? forecast.rate : null });

        const forecastText = forecast.status === "projected" || forecast.status === "final"
          ? formatMoney(forecast.value) : "Not enough data";
        const forecastSmall = forecast.status === "projected"
          ? `Projection · ${percent(forecast.value, target)} of target · avg ${formatMoney(forecast.rate)} per selling day`
          : forecast.status === "final" ? "Month complete: this is the actual result"
            : `Needs at least 5 finished selling days (${forecast.elapsedDays} so far)`;
        const gapText = target <= 0 ? "No target" : pace.met ? "Target reached" : formatMoney(pace.gap);
        const gapSmall = target <= 0 ? "Set a target to see the gap"
          : pace.met ? `Over target by ${formatMoney(actual - target)}`
            : pace.perDay != null ? `${formatMoney(pace.perDay)} needed per remaining selling day (${forecast.paceDays})` : "No selling days remain";
        const sharePerPs = isPs || !psProfiles.length ? null : actual / psProfiles.length;
        const walk = A.walkInSummary({
          from: monthStart,
          to: through,
          storeCounts: storeCountsFor(ids, isPs),
          psCounts: liveData.psWalkins.filter(row => ids.has(row.branch_id) && (!isPs || row.ps_id === currentProfile.id)),
          transactions: [...new Map(allFacts.filter(f => f.date >= monthStart && f.date <= through).map(f => [f.saleId, { id: f.saleId, branchId: f.branchId, date: f.date }])).values()],
        });
        walkInDailyCtx = { ids, isPs, monthStart, through };
        const walkSource = walk.coveredDays === 0 ? "No counts recorded yet"
          : isPs ? `${walk.coveredDays} day(s) logged`
            : `${walk.storeDays} day(s) from store counts, ${walk.psDays} from PS counts`;

        const cards = `<div class="connected-metrics">
          <article class="connected-metric"><span>Actual sales · ${escapeHTML(monthLabel(month))}${isCurrent ? " (to date)" : ""}</span><strong>${formatMoney(actual)}</strong><small>${escapeHTML(targetNote)}</small></article>
          <article class="connected-metric"><span>Target achievement</span><strong>${target > 0 ? percent(actual, target) : "No target"}</strong><small>Target ${target > 0 ? formatMoney(target) : "not set"}</small></article>
          <article class="connected-metric"><span>Remaining gap</span><strong>${gapText}</strong><small>${escapeHTML(gapSmall)}</small></article>
          <article class="connected-metric an-forecast-card"><span>${forecast.status === "final" ? "Month-end result" : `Forecast month-end <em class="an-badge">Forecast</em>`}</span><strong>${forecastText}</strong><small>${escapeHTML(forecastSmall)}</small></article>
          <article class="connected-metric"><span>Transactions</span><strong>${transactions}</strong><small>Average value ${transactions ? formatMoney(A.average(actual, transactions)) : "n/a"}</small><button class="button button-outline button-small wk-daily-btn" type="button" data-open="transactions-daily">View daily</button></article>
          ${isPs ? "" : `<article class="connected-metric"><span>Sales per PS</span><strong>${sharePerPs === null ? "n/a" : formatMoney(sharePerPs)}</strong><small>${psProfiles.length} active PS${psProfiles.length === 1 ? "" : "s"} in view</small></article>`}
          <article class="connected-metric"><span>${isPs ? "Clients assisted" : "Walk-in traffic"}</span><strong>${walk.coveredDays ? walk.visitors : "No data"}</strong><small>${escapeHTML(walkSource)}</small><button class="button button-outline button-small wk-daily-btn" type="button" data-open="walkin-daily">View daily</button></article>
          <article class="connected-metric"><span>Conversion rate</span><strong>${walk.conversion === null ? "n/a" : `${(walk.conversion * 100).toFixed(1)}%`}</strong><small>${walk.conversion === null ? "Needs recorded walk-in counts" : `${walk.transactions} sale${walk.transactions === 1 ? "" : "s"} ÷ ${walk.visitors} on counted days`}</small></article>
        </div>`;

        const sum = (from, to) => A.sumDaily(daily, from, to);
        const weekFrom = A.weekStart(through);
        const comparisons = [
          ["Day", `${through}${isCurrent ? " (today, still in progress)" : ""}`, sum(through, through), sum(A.addDays(through, -1), A.addDays(through, -1)), "vs previous day"],
          ["Week to date", `${weekFrom} – ${through}`, sum(weekFrom, through), sum(A.addDays(weekFrom, -7), A.addDays(through, -7)), "vs same days last week"],
          ["Month to date", `${monthStart} – ${through}`, sum(monthStart, through), sum(A.monthStart(A.shiftMonth(month, -1)), A.sameDayPriorMonth(through)), "vs same days last month"],
          ["Year to date", `${month.slice(0, 4)}-01-01 – ${through}`, sum(`${month.slice(0, 4)}-01-01`, through), sum(`${Number(month.slice(0, 4)) - 1}-01-01`, A.sameDayPriorYear(through)), "vs same period last year"],
        ];
        const comparisonTable = `<div class="connected-table-wrap"><table class="connected-table"><thead><tr><th>Period</th><th>Dates</th><th>Actual</th><th>Prior</th><th>Growth</th></tr></thead><tbody>${comparisons.map(([name, dates, current, prior, note]) =>
          `<tr><td>${escapeHTML(name)}<br><small class="an-muted">${escapeHTML(note)}</small></td><td>${escapeHTML(dates)}</td><td>${formatMoney(current)}</td><td>${formatMoney(prior)}</td><td>${growthCell(A.growth(current, prior))}</td></tr>`).join("")}</tbody></table></div>`;

        const chartPanel = panel("Cumulative sales vs target", `${A.RULES[ui.anBasis].label}${holidayDates.length ? `, ${holidayDates.length} store-closed date(s) excluded` : ""}. Solid = actual, dashed = forecast.`,
          `<div class="an-chart-wrap">${analyticsChart(series, target, series.days)}</div>`);

        const current = { from: monthStart, to: through };
        const previous = { from: A.monthStart(A.shiftMonth(month, -1)), to: A.sameDayPriorMonth(through) };
        const dims = [["brand", "Brand"], ["product", "Product"]];
        if (!isPs) dims.push(["ps", "Product Specialist"]);
        if (!isPs && ids.size > 1) dims.push(["branch", "Branch"]);
        if (!isPs && new Set([...ids].map(id => liveData.branches.find(b => b.id === id)?.district_id)).size > 1) dims.push(["district", "District"]);
        const dim = dims.some(([value]) => value === ui.anDim) ? ui.anDim : "brand";
        const keyOf = {
          brand: f => f.brand,
          product: f => f.product,
          ps: f => liveData.profiles.find(p => p.id === f.psId)?.full_name || titleCase(f.psName || "") || "Staff member",
          branch: f => branchName(f.branchId),
          district: f => branchDistrictName(f.branchId),
        }[dim];
        const trendP = resolvePeriod("pdTrend", month, through);
        const trend = A.groupTrend(facts, keyOf, { from: trendP.from, to: trendP.to }, { from: trendP.prevFrom, to: trendP.prevTo });
        const dimLabel = dims.find(([value]) => value === dim)[1];
        const metaOf = new Map();
        facts.forEach(f => { if (!metaOf.has(keyOf(f))) metaOf.set(keyOf(f), f); });
        const withProduct = dim === "product";
        const trendHead = [...(withProduct ? ["Brand", "Category", "Sub-category"] : []), dimLabel, trendP.name, "Prior period", "Growth", "Share"];
        const trendPanel = panel(`Trend by ${dimLabel.toLowerCase()}`, `${trendP.label} vs ${trendP.note}.`,
          tableBlock("an-trend", trendHead, trend,
            row => {
              const meta = metaOf.get(row.key) || {};
              const link = dim === "ps" && meta.psId ? ` class="rank-row" data-ps-detail="${escapeHTML(meta.psId)}" tabindex="0"`
                : dim === "brand" ? ` class="rank-row" data-brand-detail="${escapeHTML(row.key)}" tabindex="0"` : "";
              const lead = withProduct ? `<td>${escapeHTML(meta.brand || "—")}</td><td>${escapeHTML(meta.category || "—")}</td><td>${escapeHTML(meta.subCategory || "—")}</td>` : "";
              return `<tr${link}>${lead}<td>${escapeHTML(row.key)}</td><td>${formatMoney(row.current)}</td><td>${formatMoney(row.previous)}</td><td>${growthCell(row.growth)}</td><td>${row.share === null ? "n/a" : (row.share * 100).toFixed(1) + "%"}</td></tr>`;
            },
            "No sales in this period."),
          `${periodControl("pdTrend", through)}<label class="field an-inline"><span class="visually-hidden">Group by</span><select data-filter="anDim">${dims.map(([value, label]) =>
            `<option value="${value}" ${dim === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`);

        let psPanel = "";
        let psEntries = [];
        if (!isPs) {
          const entries = psProfiles.map(profile => {
            const count = psCountByBranch.get(profile.branch_id) || 0;
            const share = count ? (branchTargets.get(profile.branch_id) || 0) / count : 0;
            const own = facts.filter(f => f.psId === profile.id && f.branchId === profile.branch_id && f.date >= monthStart && f.date <= through)
              .reduce((total, f) => total + f.amount, 0);
            return { id: profile.id, name: profile.full_name || "Staff member", branch: branchName(profile.branch_id), actual: own, target: share };
          });
          psEntries = entries.map(entry => ({ ...entry, achievement: A.achievement(entry.actual, entry.target) }));
          const expectedMtd = A.expectedFraction({ month, refDate, rules, partialDay: isCurrent });
          const entriesFor = p => (p.mode === "mtd" && !p.custom ? entries : psProfiles.map(profile => {
            const count = psCountByBranch.get(profile.branch_id) || 0;
            const own = facts.filter(f => f.psId === profile.id && f.branchId === profile.branch_id && f.date >= p.from && f.date <= p.to)
              .reduce((total, f) => total + f.amount, 0);
            return { id: profile.id, name: profile.full_name || "Staff member", branch: branchName(profile.branch_id), actual: own, target: count ? periodTarget(profile.branch_id, p) / count : 0 };
          }));
          const topP = resolvePeriod("pdTop", month, through);
          const attnP = resolvePeriod("pdAttn", month, through);
          const row = expected => entry => {
            const behind = expected !== null && entry.achievement < expected;
            const pace = expected === null ? '<span class="an-muted">—</span>' : behind ? '<span class="an-down">Behind pace</span>' : '<span class="an-up">On pace</span>';
            return `<tr class="rank-row" data-ps-detail="${escapeHTML(entry.id)}" tabindex="0"><td>${escapeHTML(entry.name)}<br><small class="an-muted">${escapeHTML(entry.branch)}</small></td><td>${formatMoney(entry.actual)}</td><td>${formatMoney(entry.target)}</td><td>${(entry.achievement * 100).toFixed(1)}%</td><td>${pace}</td></tr>`;
          };
          const headNames = ["Product Specialist", "Actual", "Individual target", "Achievement", "Pace"];
          const table = (list, expected, key) => list.length
            ? sortableTable(`sort-${key}`, headNames, list, row(expected))
            : '<div class="empty-state">Not enough Product Specialists with a target to rank.</div>';
          const exportHead = ["Product Specialist", "Branch", "Actual", "Individual target", "Achievement", "Pace"];
          const exportRow = expected => entry => {
            const behind = expected !== null && entry.achievement < expected;
            return `<tr><td>${escapeHTML(entry.name)}</td><td>${escapeHTML(entry.branch)}</td><td>${formatMoney(entry.actual)}</td><td>${formatMoney(entry.target)}</td><td>${(entry.achievement * 100).toFixed(1)}%</td><td>${expected === null ? "—" : behind ? "Behind pace" : "On pace"}</td></tr>`;
          };
          const rankPanel = (title, p, key, pick, detail) => {
            const list = entriesFor(p);
            const result = A.topAndBottom(list, 3);
            const expected = p.mode === "mtd" && !p.custom ? expectedMtd : null;
            const skipped = list.length - result.ranked;
            const notes = `${expected === null ? "" : ` Expected progress by now: ${(expected * 100).toFixed(1)}% of the month's selling days.`}${skipped ? ` ${skipped} PS${skipped === 1 ? "" : "s"} without a branch target are not ranked.` : ""}`;
            const shown = pick(result);
            return panel(title, `${p.label}. ${detail}${notes}${p.mode === "day" ? " Daily target = monthly target ÷ days in the month." : ""}`, table(shown, expected, key), `${periodControl(key, through)}${manualExport(`an-${title.toLowerCase().replace(/\W+/g, "-")}`, title, exportHead, shown, exportRow(expected))}`);
          };
          psPanel = `${rankPanel("Top performers", topP, "pdTop", result => result.top, "Individual target = branch target ÷ active PSs in the branch.")}
            ${rankPanel("Needs attention", attnP, "pdAttn", result => result.bottom, "Lowest target achievement.")}`;
        }

        const trafficCtx = trafficContext(allFacts, ids, isPs);
        const yearIds = panelIds("bpYear", ids);
        const yearCtx = yearIds === ids ? trafficCtx : trafficContext(allFacts.filter(f => yearIds.has(f.branchId)), yearIds, isPs);
        const traffic = trafficPanels(A, trafficCtx, month, through, yearCtx, panelBranchSelect("bpYear", ids));
        const mtdPeriod = traffic.periods.find(item => item.name === "Month to date");
        const mix = computePaymentMix(month, ids, through);
        const mixP = resolvePeriod("pdMix", month, through);
        const mixIds = panelIds("bpMix", ids);
        const mixView = mixP.mode === "mtd" && !mixP.custom && mixIds === ids ? mix : computePaymentMix(month, mixIds, through, mixP);
        const mixBranch = mixIds === ids ? "" : ` · ${branchName([...mixIds][0])}`;
        const mixLabel = `${mixP.mode === "mtd" && !mixP.custom ? `${monthLabel(month)}${isCurrent ? " (to date)" : ""}` : mixP.label}${mixBranch}`;
        const brandTrend = A.groupTrend(facts, f => f.brand, current, previous);
        const priceFacts = facts.filter(f => f.date >= monthStart && f.date <= through);
        const insights = A.buildInsights({
          fmt: formatMoney,
          target, achievement: A.achievement(actual, target), expected: A.expectedFraction({ month, refDate, rules, partialDay: isCurrent }),
          forecast, pace, elapsedDays: Number(through.slice(8, 10)),
          mtd: { sales: mtdPeriod.cur.sales, priorSales: mtdPeriod.prev.sales },
          traffic: {
            visitors: mtdPeriod.cur.visitors, priorVisitors: mtdPeriod.prev.visitors,
            coveredDays: mtdPeriod.cur.covered, priorCoveredDays: mtdPeriod.prev.covered,
            transactions: mtdPeriod.cur.matched, priorTransactions: mtdPeriod.prev.matched,
            conversion: mtdPeriod.cur.conversion, priorConversion: mtdPeriod.prev.conversion,
            avgTicket: mtdPeriod.cur.avgTicket, priorAvgTicket: mtdPeriod.prev.avgTicket,
          },
          brands: brandTrend, priorBrandTotal: brandTrend.reduce((sum, row) => sum + row.previous, 0),
          ps: psEntries,
          paymentMix: mix,
          pricing: { sold: priceFacts.reduce((sum, f) => sum + f.soldAmount, 0), srpBasis: priceFacts.reduce((sum, f) => sum + f.srpAmount, 0) },
        });

        const missing = `<p class="an-note">Walk-in traffic and conversion use only days with a recorded count. A store count entered by a manager overrides the sum of PS counts. Nothing is estimated.</p>`;
        const holidayRows = liveData.holidays.map(item => `<tr><td>${escapeHTML(item.date)}</td><td>${escapeHTML(item.label || "")}</td>${canEditHolidays ? `<td><button class="button button-outline" type="button" data-holiday-delete="${escapeHTML(item.date)}">Delete</button></td>` : ""}</tr>`).join("");
        const holidayTable = liveData.holidays.length
          ? `<div class="connected-table-wrap"><table class="connected-table"><thead><tr><th>Date</th><th>Label</th>${canEditHolidays ? "<th></th>" : ""}</tr></thead><tbody>${holidayRows}</tbody></table></div>`
          : '<p class="an-note">No store-closed dates set.</p>';
        const holidayPanel = panel("Store-closed dates", canEditHolidays ? "Company-wide. These dates are skipped in forecasts." : "Company-wide. Managed by district managers and admins.",
          `${canEditHolidays ? '<p><button class="button" type="button" data-open="holiday">Add date</button></p>' : ""}${holidayTable}`);
        return `${warning}${cards}${insightsPanel(insights)}${chartPanel}${panel("Period comparison", "Growth compares like-for-like elapsed days.", comparisonTable, manualExport("an-compare", "Period comparison", ["Period", "Comparison", "Dates", "Actual", "Prior", "Growth"], comparisons,
          ([name, dates, current, prior, note]) => { const g = A.growth(current, prior); return `<tr><td>${escapeHTML(name)}</td><td>${escapeHTML(note)}</td><td>${escapeHTML(dates)}</td><td>${formatMoney(current)}</td><td>${formatMoney(prior)}</td><td>${g === null ? "n/a" : (g * 100).toFixed(1) + "%"}</td></tr>`; }))}${traffic.compare}${traffic.trend}${paymentMixPanels(month, mixView, mixLabel, `${panelBranchSelect("bpMix", ids)}${periodControl("pdMix", through)}`)}${trendPanel}${psPanel}${holidayPanel}${missing}`;
      },
    );
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
        const isPs = currentProfile.role === "ps";
        const charts = isPs ? psTargetCharts(label) : [progressChart(totalSales, totalTarget, label)];
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
          ${panel("Brand performance", "Click a heading to sort. Click a row to see its products.", brandTable(brandRows(panelIds("brandBranch", scopeBranchIds())), "No brand sales for this selection."), brandPanelControl())}
          ${psRankingPanel()}`;
      },
    );
  }

  function serialsFor(saleId, barcode) {
    return (liveData.serialsBySale.get(saleId) || []).filter(row => !barcode || row.barcode === barcode).map(row => row.serial);
  }

  function addressOf(sale) {
    return [sale.barangay, sale.city].filter(Boolean).join(", ");
  }

  function renderSalesPage() {
    const isPs = currentProfile.role === "ps";
    const canEditSales = isPs || currentProfile.role === "manager";
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
        const logRange = !isPs && Boolean(ui.logFrom || ui.logTo);
        const logSource = [...visibleSales(), ...liveData.testSales.filter(sale => !isPs || sale.ps_id === currentProfile.id)];
        const sales = logSource
          .filter(sale => ids.has(sale.branch_id)
            && (isPs || !ui.logBranch || sale.branch_id === ui.logBranch)
            && (logRange ? (!ui.logFrom || sale.sold_on >= ui.logFrom) && (!ui.logTo || sale.sold_on <= ui.logTo) : inPeriod(sale.sold_on)))
          .map(sale => ({
            sale,
            isTest: isTestSale(sale, liveData.testPsIds),
            branch: branchName(sale.branch_id),
            person: isPs ? "You" : liveData.profiles.find(profile => profile.id === sale.ps_id)?.full_name || titleCase(sale.ps_name || "") || "Staff member",
            lines: linesForSale(sale.id),
            products: linesForSale(sale.id).map(line => `${line.brand} ${line.category} ${line.sub_category} ${line.model_description}`).join(", "),
            qty: linesForSale(sale.id).reduce((sum, line) => sum + Number(line.quantity || 0), 0),
            serials: serialsFor(sale.id),
            total: saleTotal(sale),
          }))
          .filter(row => matches(query, row.sale.invoice_number, row.sale.customer_name, row.products, row.person, row.branch, addressOf(row.sale), row.serials.join(" ")))
          .sort((a, b) => String(b.sale.sold_on).localeCompare(String(a.sale.sold_on)) || String(b.sale.created_at).localeCompare(String(a.sale.created_at)));
        const total = sales.filter(row => !row.isTest).reduce((sum, row) => sum + row.total, 0);
        const testCount = sales.filter(row => row.isTest).length;
        const isAdmin = currentProfile.role === "admin";
        const scope = statusLabel();
        const rows = branchRows();
        const charts = isPs
          ? psTargetCharts(scope)
          : [progressChart(rows.reduce((sum, row) => sum + row.actual, 0), rows.reduce((sum, row) => sum + row.target, 0), scope)];
        if (isPs) charts.push(brandProgressChart(scope));
        if (rows.length > 1) {
          charts.push(pieChart("Sales by branch", scope, rows.map(row => ({ label: row.branch.name, value: row.actual }))));
        }
        charts.push(brandPie("Sales by brand", isPs ? `${scope} · my sales` : scope, brandRows().map(row => ({ label: row.brand, value: row.actual }))));
        salesLogExport = new Set(sales.map(row => row.sale.id));
        const logBranches = liveData.branches.filter(branch => ids.has(branch.id)).sort((a, b) => natural(a.name, b.name));
        const logFilters = isPs ? "" : `${logBranches.length > 1 ? `<label class="field log-filter"><span>Branch</span><select data-filter="logBranch"><option value="">All branches</option>${logBranches.map(branch =>
          `<option value="${escapeHTML(branch.id)}" ${branch.id === ui.logBranch ? "selected" : ""}>${escapeHTML(branch.name)}</option>`).join("")}</select></label>` : ""}<label class="field log-filter"><span>From</span><input type="date" data-filter="logFrom" value="${escapeHTML(ui.logFrom)}"></label><label class="field log-filter"><span>To</span><input type="date" data-filter="logTo" value="${escapeHTML(ui.logTo)}"></label>${ui.logBranch || logRange ? '<button class="button button-outline" type="button" data-log-clear>Clear</button>' : ""}`;
        const tools = `<div class="table-tools log-tools">${logFilters}<label class="field log-filter log-search"><span>Search</span><input type="search" data-filter="search" placeholder="Invoice, customer, product, staff" value="${escapeHTML(ui.search)}" autocomplete="off"></label><button class="button button-outline" type="button" data-export="sales">Export</button></div>`;
        const rangeNote = logRange ? `${ui.logFrom || "start"} to ${ui.logTo || "today"} · ` : ui.period === "day" ? "this day only · " : "";

        // Totals above the log: one card per branch for district managers and above, one card otherwise.
        const todayISO = localISODate();
        const dayFocus = ui.period === "day" ? periodDay() : todayISO;
        const cardFrom = logRange ? ui.logFrom || "0000-01-01" : dayFocus;
        const cardTo = logRange ? ui.logTo || "9999-12-31" : dayFocus;
        const cardWhen = logRange ? `${ui.logFrom || "start"} to ${ui.logTo || "today"}` : dayFocus === todayISO ? `today, ${dayFocus}` : dayFocus;
        const cardIds = !isPs && ui.logBranch && ids.has(ui.logBranch) ? new Set([ui.logBranch]) : ids;
        const allSaleFacts = withHistoryFacts(analyticsFacts(ids), ids, isPs);
        const totalOf = (facts) => ({ total: facts.reduce((sum, f) => sum + f.amount, 0), count: new Set(facts.map(f => f.saleId)).size });
        const cardFacts = allSaleFacts.filter(f => f.date >= cardFrom && f.date <= cardTo && cardIds.has(f.branchId));
        const cardList = canPickBranch()
          ? [...cardIds].map(id => ({ name: branchName(id), ...totalOf(cardFacts.filter(f => f.branchId === id)) })).sort((a, b) => natural(a.name, b.name))
          : [{ name: isPs ? "My total sales" : "Total sales", ...totalOf(cardFacts) }];
        const totalsCards = `<div class="connected-metrics log-totals">${cardList.map(card =>
          `<article class="connected-metric"><span>${escapeHTML(card.name)} · ${escapeHTML(cardWhen)}</span><strong>${formatMoney(card.total)}</strong><small>${card.count} sale${card.count === 1 ? "" : "s"}${logRange ? "" : " · pick From and To to total a date range"}</small></article>`).join("")}</div>`;

        // Daily summary: totals only, for any month and year.
        const years = new Set([todayISO.slice(0, 4), (ui.month || currentMonth()).slice(0, 4)]);
        allSaleFacts.forEach(f => years.add(f.date.slice(0, 4)));
        const yearList = [...years].sort().reverse();
        const dsYear = yearList.includes(ui.dsYear) ? ui.dsYear : (ui.month || currentMonth()).slice(0, 4);
        const dsMonth = /^(0[1-9]|1[0-2])$/.test(ui.dsMonth) ? ui.dsMonth : (ui.month || currentMonth()).slice(5, 7);
        const dsPrefix = `${dsYear}-${dsMonth}`;
        const monthFacts = allSaleFacts.filter(f => f.date.startsWith(dsPrefix));
        const dayRows = [];
        for (let day = new Date(Number(dsYear), Number(dsMonth), 0).getDate(); day >= 1; day -= 1) {
          const date = `${dsPrefix}-${String(day).padStart(2, "0")}`;
          if (date > todayISO) continue;
          dayRows.push({ date, weekday: new Date(`${date}T00:00:00`).getDay(), ...totalOf(monthFacts.filter(f => f.date === date)) });
        }
        const monthTotal = totalOf(monthFacts);
        const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const monthOptions = Array.from({ length: 12 }, (_, index) => {
          const value = String(index + 1).padStart(2, "0");
          return `<option value="${value}" ${value === dsMonth ? "selected" : ""}>${new Date(2000, index, 1).toLocaleString("en-PH", { month: "long" })}</option>`;
        }).join("");
        const dailyControls = `<label class="field an-inline"><span class="visually-hidden">Month</span><select data-filter="dsMonth">${monthOptions}</select></label><label class="field an-inline"><span class="visually-hidden">Year</span><select data-filter="dsYear">${yearList.map(value =>
          `<option value="${value}" ${value === dsYear ? "selected" : ""}>${value}</option>`).join("")}</select></label>`;
        const dailySummary = panel("Daily sales summary", `${monthLabel(dsPrefix)} · ${formatMoney(monthTotal.total)} · ${monthTotal.count} sale${monthTotal.count === 1 ? "" : "s"} · totals only, newest day first. Click a heading to sort.`, tableBlock(
          "dailysum",
          ["Date", "Day", "No. of sales", "Total sales"],
          dayRows,
          row => `<tr><td><strong>${escapeHTML(row.date)}</strong></td><td data-sort="${row.weekday}">${WEEKDAYS[row.weekday]}</td><td>${row.count}</td><td>${formatMoney(row.total)}</td></tr>`,
          "No days to show for this month yet.",
          31,
        ), dailyControls);
        return `<div class="connected-charts">${charts.join("")}</div>
          ${panel(isPs ? "My sales log" : "Sales log", `${sales.length - testCount} sale${sales.length - testCount === 1 ? "" : "s"} · ${formatMoney(total)} ·           ${rangeNote}${testCount ? `${testCount} TEST (not counted) · ` : ""}ordered by sale date, newest first. Click a column heading to sort.`, totalsCards + tableBlock(
            "sales",
                      ["Invoice", "Customer", "Products", "Serial numbers", "Qty", "Payment", "Product Specialist", "Branch", "Sale date", "Recorded", "Total", ...(canEditSales || isAdmin ? [""] : [])],
            sales,
                      row => `<tr${row.isTest ? ' class="test-row"' : ""}><td><strong>${escapeHTML(row.sale.invoice_number)}</strong>${row.isTest ? ' <span class="test-badge">TEST – not counted</span>' : ""}</td><td>${escapeHTML(row.sale.customer_name)}${row.sale.city || row.sale.barangay ? `<br><small>${escapeHTML([row.sale.barangay, row.sale.city].filter(Boolean).join(", "))}</small>` : ""}</td><td>${row.lines.length ? row.lines.map(productLineHTML).join("") : "—"}</td><td>${row.serials.length ? row.serials.map(serial => `<div>${escapeHTML(serial)}</div>`).join("") : "—"}</td><td>${row.qty}</td><td>${escapeHTML(row.sale.payment_mode || "—")}</td><td>${escapeHTML(row.person)}</td><td>${escapeHTML(row.branch)}</td><td>${escapeHTML(row.sale.sold_on)}</td><td data-sort="${escapeHTML(row.sale.created_at)}">${escapeHTML(new Date(row.sale.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }))}</td><td><strong>${formatMoney(row.total)}</strong></td>${canEditSales ? `<td><button class="button button-outline button-small" type="button" data-edit-sale="${escapeHTML(row.sale.id)}">Edit</button></td>` : isAdmin ? `<td><button class="button button-outline button-small button-danger" type="button" data-delete-sale="${escapeHTML(row.sale.id)}">Delete</button></td>` : ""}</tr>`,
            "No sales match these filters.",
          ), tools)}${dailySummary}${isPs ? brandLogPanel() : ""}`;
      },
    );
  }

  // One product line: brand · category · sub-category, then the description and quantity.
  function productLineHTML(line) {
    const meta = [line.brand, line.category, line.sub_category].filter(Boolean).map(escapeHTML).join(" · ");
    return `<div class="product-line"><span class="pl-meta">${meta}</span>${escapeHTML(line.model_description)} × ${escapeHTML(line.quantity)}</div>`;
  }

  function brandProgressChart(scope) {
    const brand = String(currentProfile.assigned_brand || "").trim();
    const targetFor = name => liveData.brandTargets
      .filter(row => row.branch_id === currentProfile.branch_id
        && row.brand.trim().toLowerCase() === name.toLowerCase()
        && targetInPeriod(row.month))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const actual = liveData.brandSales
      .filter(row => inStatus(row.sold_on))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const target = psBrandParts(brand).reduce((sum, part) => sum + (targetFor(part.full) || (part.base !== part.full ? targetFor(part.base) : 0)), 0);
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
      ["Sale date", "Invoice", "Product Specialist", "Brand", "Category", "Sub-category", "Product", "Qty"],
      rows,
      row => `<tr><td>${escapeHTML(row.sold_on)}</td><td><strong>${escapeHTML(row.invoice_number)}</strong></td><td>${escapeHTML(row.ps_name)}</td><td>${escapeHTML(row.brand)}</td><td>${escapeHTML(row.category || "—")}</td><td>${escapeHTML(row.sub_category || "—")}</td><td>${escapeHTML(row.model_description)}</td><td>${escapeHTML(row.quantity)}</td></tr>`,
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

  const isIndoorSplit = product => /split/i.test(`${product.sub_category || ""} ${product.model_description || ""}`)
    && !/outdoor/i.test(product.model_description || "");

  // Finds the outdoor unit that goes with a split-type indoor unit: same brand, "Outdoor" in the description, most similar model text.
  function findOutdoorPartner(indoor, catalog) {
    const tokens = text => new Set(String(text || "").toLowerCase().replace(/\b(indoor|outdoor)\b/g, " ").split(/[^a-z0-9]+/).filter(Boolean));
    const base = tokens(indoor.model_description);
    let best = null;
    for (const item of catalog) {
      if (item.brand !== indoor.brand || !/outdoor/i.test(item.model_description || "")) continue;
      const other = tokens(item.model_description);
      const shared = [...base].filter(token => other.has(token)).length;
      const score = shared / Math.max(new Set([...base, ...other]).size, 1);
      const gap = Math.abs((Number(item.barcode) || 0) - (Number(indoor.barcode) || 0));
      if (score >= 0.6 && (!best || score > best.score || (score === best.score && gap < best.gap))) best = { item, score, gap };
    }
    if (best) return best.item;
    const next = String(Number(indoor.barcode) + 1).padStart(indoor.barcode.length, "0");
    return /^\d+$/.test(indoor.barcode) ? catalog.find(item => item.barcode === next && /outdoor/i.test(item.model_description || "")) || null : null;
  }

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

  // Philippine cities/towns and barangays come from the free public PSGC API (loaded on demand, cached on this device).
  const PSGC_URL = "https://psgc.gitlab.io/api/";
  let psgcPlaces = null;
  const psgcBarangays = new Map();

  async function loadPlaces() {
    if (psgcPlaces) return psgcPlaces;
    try {
      const cached = JSON.parse(localStorage.getItem("branchline-psgc-v1") || "null");
      if (Array.isArray(cached) && cached.length) return (psgcPlaces = cached);
    } catch { /* ignore a bad cache */ }
    const [cities, provinces] = await Promise.all([
      fetch(`${PSGC_URL}cities-municipalities/`).then(response => response.json()),
      fetch(`${PSGC_URL}provinces/`).then(response => response.json()),
    ]);
    const provinceName = new Map(provinces.map(item => [item.code, item.name]));
    psgcPlaces = cities.map(item => {
      const name = String(item.name).replace(/^City of (.+)$/i, "$1 City");
      const province = provinceName.get(item.provinceCode) || (item.regionCode === "130000000" ? "Metro Manila" : "");
      return [item.code, province ? `${name}, ${province}` : name];
    });
    try { localStorage.setItem("branchline-psgc-v1", JSON.stringify(psgcPlaces)); } catch { /* storage full */ }
    return psgcPlaces;
  }

  async function loadBarangays(code) {
    if (psgcBarangays.has(code)) return psgcBarangays.get(code);
    const list = await fetch(`${PSGC_URL}cities-municipalities/${code}/barangays/`).then(response => response.json());
    const names = list.map(item => item.name).sort(natural);
    psgcBarangays.set(code, names);
    return names;
  }

  // Barcode reading: the browser's built-in detector when it has one (Android, Mac), otherwise the ZXing library
  // (loaded on first use) so it also works on Windows desktop. Label text is read with Tesseract OCR as a last resort.
  const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const scriptLoads = new Map();

  function loadScript(src) {
    if (!scriptLoads.has(src)) {
      scriptLoads.set(src, new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = resolve;
        el.onerror = () => {
          scriptLoads.delete(src);
          reject(new Error("The reader could not be downloaded. Check the internet connection."));
        };
        document.head.appendChild(el);
      }));
    }
    return scriptLoads.get(src);
  }

  let nativeDetector = null;

  function decodeWithZXing(canvas) {
    const Z = window.ZXing;
    const hints = new Map([[Z.DecodeHintType.TRY_HARDER, true]]);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
    for (const binarizer of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
      try {
        return reader.decode(new Z.BinaryBitmap(new binarizer(source))).getText().trim();
      } catch { /* not found with this method */ }
    }
    return "";
  }

  async function decodeCanvas(canvas) {
    if ("BarcodeDetector" in window) {
      try {
        nativeDetector = nativeDetector || new BarcodeDetector();
        const found = await nativeDetector.detect(canvas);
        const value = found.map(item => String(item.rawValue || "").trim()).find(Boolean);
        if (value) return value;
      } catch { /* fall through to ZXing */ }
    }
    await loadScript(ZXING_URL);
    return decodeWithZXing(canvas);
  }

  // Possible serial numbers in OCR text: anything after "S/N" or "Serial", then other long letter-and-digit tokens.
  function serialCandidates(text) {
    const upper = String(text || "").toUpperCase();
    const out = [];
    const add = value => {
      const clean = String(value).replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
      if (clean.length >= 6 && /\d/.test(clean) && /^[A-Z0-9-]+$/.test(clean) && !out.includes(clean)) out.push(clean);
    };
    for (const match of upper.matchAll(/(?:S\s*\/?\s*N|SERIAL(?:\s*(?:NO\.?|NUMBER|#))?)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/g)) add(match[1]);
    upper.split(/[\s,;|]+/).forEach(add);
    return out.slice(0, 5);
  }

  async function readLabelText(canvas) {
    await loadScript(TESSERACT_URL);
    const { data } = await Tesseract.recognize(canvas, "eng");
    return serialCandidates(data.text);
  }

  async function canvasFromFile(file, longest = 2000) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      bitmap.close?.();
    }
  }

  // Opens the camera with an aiming frame. Resolves { value, fromText } or null when cancelled.
  // Only the area inside the frame is analysed, at the camera's full resolution.
  function scanWithCamera(host) {
    return new Promise((resolve, reject) => {
      const GUIDE = { x: 0.08, y: 0.33, w: 0.84, h: 0.34 };
      const box = document.createElement("div");
      box.className = "serial-pop serial-scan";
      box.innerHTML = `<div class="serial-card">
        <p class="dlg-intro">Fit the barcode inside the frame. Hold the phone 10–20 cm away and keep it steady.</p>
        <div class="scan-view"><video playsinline muted></video>
          <div class="scan-guide"><i></i><i></i><i></i><i></i><span></span></div></div>
        <p class="scan-status" role="status">Starting the camera…</p>
        <div class="scan-tools" hidden><label>Zoom <input type="range" data-scan-zoom></label><button class="button button-outline button-small" type="button" data-scan-torch hidden>Light</button></div>
        <div class="dlg-actions"><button class="button button-outline" type="button" data-scan-text>Can’t scan? Read label text</button><button class="button button-outline" type="button" data-scan-cancel>Cancel</button></div>
      </div>`;
      host.appendChild(box);
      const video = box.querySelector("video");
      const view = box.querySelector(".scan-view");
      const status = box.querySelector(".scan-status");
      let stream = null;
      let timer = null;
      let closed = false;
      const finish = value => {
        closed = true;
        clearInterval(timer);
        stream?.getTracks().forEach(track => track.stop());
        box.remove();
        resolve(value);
      };
      // Cuts the part of the video frame that sits under the on-screen frame (the video is cropped to fill the view).
      const grab = pad => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cw = view.clientWidth;
        const ch = view.clientHeight;
        if (!vw || !cw) return null;
        const scale = Math.max(cw / vw, ch / vh);
        const ox = (vw * scale - cw) / 2;
        const oy = (vh * scale - ch) / 2;
        const sx = Math.max(0, ((GUIDE.x - pad) * cw + ox) / scale);
        const sy = Math.max(0, ((GUIDE.y - pad) * ch + oy) / scale);
        const sw = Math.min(vw - sx, ((GUIDE.w + 2 * pad) * cw) / scale);
        const sh = Math.min(vh - sy, ((GUIDE.h + 2 * pad) * ch) / scale);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        return canvas;
      };
      box.querySelector("[data-scan-cancel]").addEventListener("click", () => finish(null));
      box.querySelector("[data-scan-text]").addEventListener("click", async event => {
        const button = event.currentTarget;
        const canvas = grab(0.08);
        if (!canvas) return;
        button.disabled = true;
        status.textContent = "Reading the label… this can take a few seconds the first time.";
        try {
          const barcode = await decodeCanvas(canvas).catch(() => "");
          if (barcode) return finish({ value: barcode });
          const found = await readLabelText(canvas);
          if (found.length) return finish({ value: found[0], fromText: true, others: found.slice(1) });
          status.textContent = "No serial number could be read. Move closer, add light, and try again.";
        } catch (caught) {
          status.textContent = caught.message;
        }
        button.disabled = false;
      });
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(async media => {
        if (closed) return media.getTracks().forEach(track => track.stop());
        stream = media;
        video.srcObject = media;
        await video.play();
        status.textContent = "Looking for a barcode…";
        const track = media.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        const tools = box.querySelector(".scan-tools");
        const zoom = box.querySelector("[data-scan-zoom]");
        if (caps.zoom) {
          tools.hidden = false;
          zoom.min = caps.zoom.min;
          zoom.max = caps.zoom.max;
          zoom.step = caps.zoom.step || 0.1;
          zoom.value = caps.zoom.min;
          zoom.addEventListener("input", () => track.applyConstraints({ advanced: [{ zoom: Number(zoom.value) }] }).catch(() => {}));
        } else {
          zoom.closest("label").hidden = true;
        }
        if (caps.torch) {
          tools.hidden = false;
          const torch = box.querySelector("[data-scan-torch]");
          torch.hidden = false;
          let on = false;
          torch.addEventListener("click", () => {
            on = !on;
            track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
          });
        }
        loadScript(ZXING_URL).catch(() => {});
        let busy = false;
        timer = setInterval(async () => {
          if (busy || closed || video.readyState < 2) return;
          busy = true;
          try {
            const canvas = grab(0);
            const value = canvas && ("BarcodeDetector" in window || window.ZXing) ? await decodeCanvas(canvas) : "";
            if (value && !closed) finish({ value });
          } catch { /* keep trying */ }
          busy = false;
        }, 250);
      }).catch(caught => {
        box.remove();
        reject(new Error(caught?.name === "NotAllowedError" ? "Camera permission was denied." : "The camera could not be opened."));
      });
    });
  }

  // Pop-up listing one entry box per unit of every product in the sale. `groups` = [{ barcode, label, qty }].
  function openSerialPopup(host, groups, serials, onDone) {
    const pop = document.createElement("div");
    pop.className = "serial-pop";
    pop.innerHTML = `<div class="serial-card" role="dialog" aria-modal="true" aria-label="Serial numbers">
      <div class="dlg-head"><h2>Serial numbers</h2><button class="dlg-close" type="button" data-serial-cancel aria-label="Close">×</button></div>
      <div class="serial-body">
        <p class="dlg-intro">Optional. Type each serial number, scan its barcode with the camera, or upload a photo of the label. Leave blank any unit without one.</p>
        ${groups.map(group => `<section class="serial-group" data-barcode="${escapeHTML(group.barcode)}">
          <h3>${escapeHTML(group.label)} <small>${escapeHTML(group.barcode)} · qty ${group.qty}</small></h3>
          <div class="serial-grid">${Array.from({ length: group.qty }, (_, index) => `<div class="serial-item">
            <input data-serial placeholder="Unit ${index + 1}" autocomplete="off" value="${escapeHTML((serials.get(group.barcode) || [])[index] || "")}">
            <button class="button button-outline button-small" type="button" data-serial-scan>Scan</button>
            <button class="button button-outline button-small" type="button" data-serial-photo>Photo</button>
          </div>`).join("")}</div>
        </section>`).join("")}
        <input type="file" accept="image/*" hidden data-serial-file>
      </div>
      <p class="dlg-error" role="alert" hidden></p>
      <div class="dlg-actions"><button class="button button-outline" type="button" data-serial-cancel>Cancel</button><button class="button button-primary" type="button" data-serial-save>Save serial numbers</button></div>
    </div>`;
    host.appendChild(pop);
    const error = pop.querySelector(".dlg-error");
    const fileInput = pop.querySelector("[data-serial-file]");
    let target = null;
    const say = text => { error.textContent = text; error.hidden = !text; };
    const close = () => pop.remove();
    pop.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    });
    pop.addEventListener("click", async event => {
      if (event.target === pop || event.target.closest("[data-serial-cancel]")) return close();
      const input = event.target.closest(".serial-item")?.querySelector("[data-serial]");
      if (event.target.closest("[data-serial-scan]")) {
        say("");
        try {
          const result = await scanWithCamera(pop);
          if (result) {
            input.value = result.value;
            say(result.fromText ? `Read from the label text: ${result.value}. Please check it against the label.${result.others.length ? ` Other possibilities: ${result.others.join(", ")}.` : ""}` : "");
          }
        } catch (caught) {
          say(caught.message);
        }
      }
      if (event.target.closest("[data-serial-photo]")) {
        say("");
        target = input;
        fileInput.value = "";
        fileInput.click();
      }
      if (event.target.closest("[data-serial-save]")) {
        const result = new Map();
        const seen = new Set();
        for (const section of pop.querySelectorAll(".serial-group")) {
          const values = [...section.querySelectorAll("[data-serial]")].map(box => box.value.trim());
          for (const value of values.filter(Boolean)) {
            const key = value.toLowerCase();
            if (seen.has(key)) return say(`The serial number "${value}" is entered more than once.`);
            seen.add(key);
          }
          result.set(section.dataset.barcode, values);
        }
        onDone(result);
        close();
      }
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || !target) return;
      say("Reading the photo…");
      try {
        const canvas = await canvasFromFile(file);
        let value = await decodeCanvas(canvas).catch(() => "");
        if (!value) value = await decodeCanvas(await canvasFromFile(file, 1100)).catch(() => "");
        if (value) {
          target.value = value;
          return say("");
        }
        say("No barcode found. Reading the label text… this can take a few seconds the first time.");
        const found = await readLabelText(canvas);
        if (!found.length) return say("Nothing readable was found in that photo. Retake it closer and in focus, or type the serial number.");
        target.value = found[0];
        say(`Read from the label text: ${found[0]}. Please check it against the label.${found.length > 1 ? ` Other possibilities: ${found.slice(1).join(", ")}.` : ""}`);
      } catch (caught) {
        say(caught?.message || "That photo could not be read. Type the serial number instead.");
      }
    });
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
        <div class="dlg-grid">
          ${fieldHTML("City / town (optional)", "city", `<input name="city" list="sale-cities" autocomplete="off" placeholder="e.g. Santiago City" value="${escapeHTML(sale?.city || "")}">`)}
          ${fieldHTML("Barangay (optional)", "barangay", `<input name="barangay" list="sale-barangays" autocomplete="off" placeholder="Pick a city first" value="${escapeHTML(sale?.barangay || "")}">`)}
        </div>
        <datalist id="sale-cities"></datalist>
        <datalist id="sale-barangays"></datalist>
        <datalist id="sale-products"></datalist>
        <div id="sale-rows">${lines.map(saleLineRow).join("")}</div>
        <div class="sale-footer"><span class="sale-footer-actions"><button class="button button-outline button-small" type="button" data-add-line>+ Add product line</button> <button class="button button-outline button-small" type="button" data-add-serials>+ Add serial number <span id="serial-count"></span></button></span><strong>Sale total: <span id="sale-total">${formatMoney(lines.reduce((sum, line) => sum + Number(line.selling_price || 0) * Number(line.quantity || 0), 0))}</span></strong></div>`,
      onReady: form => {
        const serials = new Map();
        (sale ? liveData.serialsBySale.get(sale.id) || [] : []).forEach(row => {
          if (!serials.has(row.barcode)) serials.set(row.barcode, []);
          serials.get(row.barcode).push(row.serial);
        });
        const saleGroups = () => {
          const groups = new Map();
          form.querySelectorAll(".sale-row").forEach(row => {
            const product = resolve(row.querySelector('[name="product"]').value);
            const qty = Number(row.querySelector('[name="quantity"]').value);
            if (!product || !Number.isInteger(qty) || qty < 1) return;
            const group = groups.get(product.barcode) || { barcode: product.barcode, label: `${product.brand} · ${product.model_description}`, qty: 0 };
            group.qty += qty;
            groups.set(product.barcode, group);
          });
          return [...groups.values()];
        };
        const showSerialCount = () => {
          const known = new Set(saleGroups().map(group => group.barcode));
          const count = [...serials].filter(([code]) => known.has(code)).reduce((sum, [, list]) => sum + list.filter(Boolean).length, 0);
          form.querySelector("#serial-count").textContent = count ? `(${count})` : "";
        };
        showSerialCount();
        let places = [];
        let placeCode = "";
        const cityBox = form.elements.city;
        const brgyBox = form.elements.barangay;
        const fillBarangays = async () => {
          const match = places.find(([, label]) => label.toLowerCase() === cityBox.value.trim().toLowerCase());
          if (!match || match[0] === placeCode) return;
          placeCode = match[0];
          try {
            const names = await loadBarangays(match[0]);
            form.querySelector("#sale-barangays").innerHTML = names.map(name => `<option value="${escapeHTML(name)}"></option>`).join("");
            brgyBox.placeholder = "Start typing a barangay";
          } catch { /* barangay can still be typed */ }
        };
        loadPlaces().then(list => { places = list; return fillBarangays(); }).catch(() => {
          cityBox.placeholder = "Type the city or town";
        });
        cityBox.addEventListener("input", () => {
          const query = cityBox.value.trim().toLowerCase();
          form.querySelector("#sale-cities").innerHTML = query.length < 2 ? "" : places
            .filter(([, label]) => label.toLowerCase().includes(query)).slice(0, 30)
            .map(([, label]) => `<option value="${escapeHTML(label)}"></option>`).join("");
          fillBarangays();
        });
        cityBox.addEventListener("change", fillBarangays);
        form.querySelector("[data-add-serials]").addEventListener("click", () => {
          const groups = saleGroups();
          const error = form.closest(".dlg-backdrop").querySelector(".dlg-error");
          if (!groups.length) {
            error.textContent = "Add the products and quantities first, then add their serial numbers.";
            error.hidden = false;
            return;
          }
          error.hidden = true;
          openSerialPopup(form.closest(".dlg-backdrop"), groups, serials, result => {
            result.forEach((list, code) => serials.set(code, list));
            showSerialCount();
          });
        });
        form.serialPayload = () => saleGroups().flatMap(group =>
          (serials.get(group.barcode) || []).slice(0, group.qty).filter(Boolean).map(serial => ({ barcode: group.barcode, serial })));
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
        let linkSeq = 0;
        const syncOutdoor = row => {
          const typed = row.querySelector('[name="product"]');
          const product = resolve(typed.value);
          const linked = row.dataset.outdoorRow ? form.querySelector(`[data-outdoor-of="${row.dataset.outdoorRow}"]`) : null;
          if (linked && (!product || row.dataset.outdoorFor !== product.barcode)) {
            linked.remove();
            delete row.dataset.outdoorRow;
            delete row.dataset.outdoorFor;
          }
          if (!product || row.dataset.outdoorOf || row.dataset.outdoorFor === product.barcode || !isIndoorSplit(product)) return;
          const partner = findOutdoorPartner(product, catalog);
          row.dataset.outdoorFor = product.barcode;
          if (!partner || [...form.querySelectorAll('[name="code"]')].some(input => input.value === partner.barcode)) return;
          const id = String(++linkSeq);
          row.dataset.outdoorRow = id;
          row.insertAdjacentHTML("afterend", saleLineRow({ barcode: partner.barcode, selling_price: 0, srp: partner.srp, quantity: row.querySelector('[name="quantity"]').value || 1 }));
          const added = row.nextElementSibling;
          added.dataset.outdoorOf = id;
          enableCurrencyInput(added);
        };
        form.addEventListener("input", event => {
          if (event.target.name === "product") {
            form.querySelector("#sale-products").innerHTML = productSuggestions(event.target.value)
              .map(item => `<option value="${escapeHTML(productLabel(item))}"></option>`).join("");
            syncOutdoor(event.target.closest(".sale-row"));
          }
          if (event.target.name === "quantity") {
            const row = event.target.closest(".sale-row");
            const linked = row.dataset.outdoorRow ? form.querySelector(`[data-outdoor-of="${row.dataset.outdoorRow}"] [name="quantity"]`) : null;
            if (linked) linked.value = event.target.value;
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
          if (remove && form.querySelectorAll(".sale-row").length > (remove.closest(".sale-row").dataset.outdoorRow ? 2 : 1)) {
            const row = remove.closest(".sale-row");
            if (row.dataset.outdoorRow) form.querySelector(`[data-outdoor-of="${row.dataset.outdoorRow}"]`)?.remove();
            row.remove();
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
        const saleId = mustRpc(await client.rpc("save_ps_sale", {
          p_customer_name: titleCase(form.elements.customer.value),
          p_invoice_number: form.elements.invoice.value.trim(),
          p_sold_on: form.elements.date.value,
          p_lines: rows,
          p_sale_id: sale ? sale.id : null,
          p_payment_mode: form.elements.payment.value,
        }));
        const city = form.elements.city.value.trim();
        const barangay = form.elements.barangay.value.trim();
        const serialList = form.serialPayload();
        let extrasProblem = "";
        // The sale itself is already saved; the optional address/serial numbers are stored separately.
        if (city || barangay || serialList.length || sale?.city || sale?.barangay || liveData.serialsBySale.has(sale?.id)) {
          const extras = await client.rpc("save_sale_extras", { p_sale_id: saleId || sale?.id, p_city: city, p_barangay: barangay, p_serials: serialList });
          if (extras.error) extrasProblem = friendlyError(extras.error);
        }
        activePage = "sales";
        await refreshData();
        if (extrasProblem) {
          return `<p class="dlg-error">The sale was saved, but the address / serial numbers were not: ${escapeHTML(extrasProblem)}</p><p>Open the sale with Edit to add them again.</p>`;
        }
      },
    });
  }

  function renderTargetsPage() {
    mountPage(
      pageHeading("Targets", "Branch and brand targets for your scope. Use Set target to add or change them. Payment mix results are under Analytics."),
      "",
      filterBar({
        district: true,
        branch: true,
        period: true,
        search: "Search branch",
        actions: `${canSetPaymentTargets() ? '<button class="button button-outline" type="button" data-open="payment-targets">Set mix targets</button>' : ""}<button class="button button-outline" type="button" data-open="targets-bulk">+ Add multiple targets</button><button class="button button-primary" type="button" data-open="target">+ Set target</button>`,
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
        const branchTotals = branchRows();
        const progress = currentProfile.role === "ps" ? ""
          : progressChart(branchTotals.reduce((sum, row) => sum + row.actual, 0), branchTotals.reduce((sum, row) => sum + row.target, 0), scope);
        return `${panel("Monthly branch targets", "Ordered by district, then branch.", tableBlock(
          "targets",
          ["District", "Branch", "Month", "Target", "Actual sales", "Progress", ""],
          targets,
          row => `<tr><td>${escapeHTML(row.district)}</td><td><strong>${escapeHTML(row.branch)}</strong></td><td>${escapeHTML(monthLabel(row.month))}</td><td>${formatMoney(row.amount)}</td><td>${formatMoney(row.actual)}</td><td>${percent(row.actual, row.amount)}</td><td><button class="button button-outline button-small" type="button" data-edit-target="${escapeHTML(row.target.id)}">Edit</button></td></tr>`,
          "No targets match these filters.",
        ))}
        <div class="connected-charts">${progress}${pieChart("Sales by brand", scope, brands.map(row => ({ label: row.brand, value: row.actual })))}</div>
        ${panel("Brand performance", `${scope} · click a heading to sort.`, brandTable(brandRows(panelIds("brandBranch", scopeBranchIds())), "No brand sales or targets for this selection."), brandPanelControl())}
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
          currentProfile.role === "admin" ? '<button class="button button-outline" type="button" data-open="sync-categories">Update sales categories</button>' : "",
          currentProfile.role === "admin" ? '<button class="button button-outline" type="button" data-open="sales-history">Import sales history</button><button class="button button-outline" type="button" data-open="daily-history">Import daily monitoring</button>' : "",
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
        productsFiltered = products.map(product => product.barcode.trim().toLowerCase());
        const visibleKeys = new Set(productsFiltered);
        [...productSelection].forEach(key => { if (!visibleKeys.has(key)) productSelection.delete(key); });
        const isAdminUser = currentProfile.role === "admin";
        const picked = productSelection.size;
        const deleteButton = isAdminUser
          ? `<button class="button button-outline button-small danger" type="button" data-delete-products ${picked ? "" : "disabled"}>Delete selected${picked ? ` (${picked})` : ""}</button>`
          : "";
        return panel("Product catalog", `Alphabetical by brand, then description. Click a heading to sort.${isAdminUser ? ` ${picked} of ${products.length} selected.` : ""}`, tableBlock(
          "products",
          [...(isAdminUser ? [SELECT_HEADER] : []), "Brand", "Category", "Sub-category", "Description", "Barcode", "SRP", ""],
          products,
          product => `<tr>${isAdminUser ? `<td class="select-cell"><input type="checkbox" data-product-select="${escapeHTML(product.barcode.trim().toLowerCase())}" ${productSelection.has(product.barcode.trim().toLowerCase()) ? "checked" : ""} aria-label="Select ${escapeHTML(product.model_description)}"></td>` : ""}<td><strong>${escapeHTML(product.brand)}</strong></td><td>${escapeHTML(product.category || "—")}</td><td>${escapeHTML(product.sub_category || "—")}</td><td>${escapeHTML(product.model_description)}</td><td>${escapeHTML(product.barcode)}</td><td>${product.srp == null ? "—" : formatMoney(product.srp)}</td><td class="manage-cell"><button class="button button-outline button-small" type="button" data-edit-product="${escapeHTML(product.barcode)}">Edit</button></td></tr>`,
          "No products match your search.",
        ), deleteButton);
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
          '<button class="button button-outline" type="button" data-open="users-bulk">+ Add multiple users</button>',
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
        )) + pushMessagesPanel() + `<section class="panel danger-zone"><h2>Danger zone</h2><p>Permanently delete all districts, branches, staff logins, products, sales, targets and history. Administrator accounts and payment modes are kept. This cannot be undone.</p><button class="button button-danger" type="button" data-open="wipe">Delete all data</button></section>`;
      },
    );
  }

  function companyHolidayDates() {
    return (liveData.holidays || []).map(item => item.date);
  }

  const PACE_STATUS_LABELS = { behind: "Behind the pace", on: "On track", exceeded: "More than target" };

  function pushMessagesPanel() {
    if (currentProfile.role !== "admin") return "";
    const groups = Object.entries(PACE_STATUS_LABELS).map(([status, label]) => {
      const items = (liveData.pushMessages || []).filter(item => item.status === status);
      const list = items.length
        ? `<ul class="push-list">${items.map(item => `<li><span>${escapeHTML(item.message)}</span><button class="button button-outline button-small" type="button" data-push-delete="${escapeHTML(item.id)}">Delete</button></li>`).join("")}</ul>`
        : '<p class="an-note">No messages yet. A built-in default is used until you add one.</p>';
      return `<div class="push-group"><div class="push-group-head"><h3>${escapeHTML(label)}</h3><button class="button button-outline button-small" type="button" data-open="push-message" data-status="${status}">+ Add message</button></div>${list}</div>`;
    }).join("");
    return panel("Alert messages", "Sent daily as a push notification and shown after a PS signs in.     When several messages exist for a status, one is picked at random.", `<div class="push-groups">${groups}</div>${PLACEHOLDER_LEGEND}`);
  }

  const PLACEHOLDER_LEGEND = `<dl class="push-legend">
    <dt>{name}</dt><dd>The Product Specialist's first name. Example: <em>Maria</em></dd>
    <dt>{sold}</dt><dd>Their own sales so far this month (before today). Example: <em>₱1,250,000.00</em></dd>
    <dt>{expected}</dt><dd>How much they should have sold by now to stay on pace (their share × the share of selling days passed). Example: <em>₱1,800,000.00</em></dd>
    <dt>{share}</dt><dd>Their individual monthly target: the branch target ÷ number of PS in the branch. Example: <em>₱4,000,000.00</em></dd>
  </dl>
  <p class="an-note">Each placeholder is replaced with that person's own figures when the alert is sent, so every PS sees their own name and numbers.</p>`;

  function openPushMessageModal(status) {
    openModal({
      title: `Add message · ${PACE_STATUS_LABELS[status]}`,
      intro: "Placeholders are filled in automatically for each Product Specialist.",
      submitLabel: "Add message",
      body: fieldHTML("Message", "message", '<textarea name="message" rows="3" maxlength="240" required></textarea>') + PLACEHOLDER_LEGEND,
      onSubmit: async form => {
        mustRpc(await client.rpc("save_push_message", { p_status: status, p_message: form.elements.message.value.trim() }));
        await refreshData();
      },
    });
  }

  function openDeleteProductsModal() {
    const barcodes = [...productSelection];
    const everything = barcodes.length === productsFiltered.length;
    const needsTyping = barcodes.length >= 50;
    openModal({
      title: "Delete products",
      intro: `Permanently delete ${barcodes.length} selected product${barcodes.length === 1 ? "" : "s"}${everything ? " (everything in the current list)" : ""}? They are removed from every branch. Past sales keep their own product details, and a snapshot is kept.`,
      submitLabel: `Delete ${barcodes.length}`,
      body: needsTyping ? fieldHTML("Type DELETE to confirm", "confirm", '<input name="confirm" autocomplete="off" required pattern="DELETE">') : "",
      onSubmit: async () => {
        for (let i = 0; i < barcodes.length; i += 2000) {
          mustRpc(await client.rpc("delete_products", { p_barcodes: barcodes.slice(i, i + 2000) }));
        }
        productSelection.clear();
        await refreshData();
      },
    });
  }

  function openSyncCategoriesModal() {
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const ranges = {
      all: ["Entire history", null, null],
      month: ["This month", iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))],
      last: ["Last month", iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))],
      quarter: ["Last 3 months", iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))],
      year: ["This year", `${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`],
      custom: ["Custom dates", null, null],
    };
    openModal({
      title: "Update sales categories",
      intro: "Copies each product's current category and sub-category from the Products list onto recorded sales (matched by barcode). Amounts, prices, SRP and quantities are never changed.",
      submitLabel: "Update sales",
      body: `
        ${fieldHTML("Which sales", "range", `<select name="range">${Object.entries(ranges).map(([key, value]) => `<option value="${key}">${value[0]}</option>`).join("")}</select>`)}
        <div class="field-row" id="sync-custom" hidden>
          ${fieldHTML("From", "from", '<input name="from" type="date">')}
          ${fieldHTML("To", "to", '<input name="to" type="date">')}
        </div>
        ${fieldHTML("Which lines", "mode", '<select name="mode"><option value="missing">Only lines with no category yet</option><option value="all">Every line (replace existing categories)</option></select>')}`,
      onReady: form => {
        const toggle = () => { form.querySelector("#sync-custom").hidden = form.elements.range.value !== "custom"; };
        form.elements.range.addEventListener("change", toggle);
        toggle();
      },
      onSubmit: async form => {
        const choice = form.elements.range.value;
        let from = ranges[choice][1];
        let to = ranges[choice][2];
        if (choice === "custom") {
          from = form.elements.from.value || null;
          to = form.elements.to.value || null;
          if (!from && !to) throw new Error("Pick a start date, an end date, or both.");
        }
        const result = mustRpc(await client.rpc("sync_sale_categories", { p_from: from, p_to: to, p_overwrite: form.elements.mode.value === "all" }));
        await refreshData();
        return `<p>Checked <strong>${escapeHTML(result.lines_checked)}</strong> sale line(s) and updated <strong>${escapeHTML(result.lines_updated)}</strong>.</p>`;
      },
    });
  }

  async function readHistoryRows(file) {
    if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
    if (!window.XLSX) throw new Error("The Excel reader could not load. Save the file as CSV and try again.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  }

  const HISTORY_BRANCH_HINTS = { CAU: "cauayan", ILA: "ilagan", STG: "santiago", TUG: "tuguegarao" };

  function openSalesHistoryModal() {
    const batches = [...(liveData.importBatches || [])].filter(batch => batch.kind !== "daily").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const branches = [...liveData.branches].sort((a, b) => natural(a.name, b.name));
    let parsed = null;
    let fileName = "";
    let batchId = null;
    const batchList = batches.length
      ? `<p class="dlg-intro"><strong>Previous imports</strong></p><ul class="push-list">${batches.map(batch => `<li><span>${escapeHTML(batch.label)} — ${escapeHTML(batch.sales_count)} sales, ${escapeHTML(batch.lines_count)} items, ${formatMoney(Number(batch.amount))} (${escapeHTML(batch.date_from || "")} to ${escapeHTML(batch.date_to || "")})</span><button class="button button-outline button-small" type="button" data-history-remove="${escapeHTML(batch.id)}">Remove</button></li>`).join("")}</ul>`
      : "";
    openModal({
      title: "Import sales history",
      intro: "Admin only. Upload the company sales database (.xlsx or .csv, one row per item sold). Everything is tagged as one import, so you can remove the whole import later. Dates that Excel scrambled are repaired automatically.",
      submitLabel: "Import",
      wide: true,
      body: `${batchList}
        ${fieldHTML("Sales database file", "file", '<input name="file" type="file" accept=".xlsx,.xls,.csv" required>')}
        ${fieldHTML("Name for this import", "label", '<input name="label" maxlength="80" placeholder="e.g. Jan–Jun 2026 sales">')}
        <div id="history-preview" class="dlg-preview">No file chosen.</div>
        <div id="history-map"></div>
        <p class="dlg-preview" id="history-progress" hidden></p>`,
      onReady: form => {
        form.querySelectorAll("[data-history-remove]").forEach(button => button.addEventListener("click", () => {
          const batch = batches.find(item => item.id === button.dataset.historyRemove);
          if (batch) openRemoveHistoryModal(batch);
        }));
        form.elements.file.addEventListener("change", async () => {
          const preview = form.querySelector("#history-preview");
          const map = form.querySelector("#history-map");
          parsed = null;
          batchId = null;
          map.innerHTML = "";
          const file = form.elements.file.files[0];
          if (!file) return;
          fileName = file.name;
          if (!form.elements.label.value) form.elements.label.value = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
          preview.textContent = "Reading the file… large files can take up to a minute.";
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            parsed = window.BranchlineSalesHistory.parseSalesHistory(await readHistoryRows(file));
            const { stats } = parsed;
            const months = Object.keys(stats.byMonth).sort().map(month => `<li>${escapeHTML(month)}: ${formatMoney(stats.byMonth[month].amount)} (${stats.byMonth[month].lines} items)</li>`).join("");
            preview.innerHTML = `<strong>${stats.sales}</strong> sales, <strong>${stats.lines}</strong> items, net <strong>${formatMoney(stats.amount)}</strong>, ${escapeHTML(stats.from)} to ${escapeHTML(stats.to)}.<br>${stats.datesFixed} scrambled date(s) repaired${stats.returns ? `, ${stats.returns} return line(s) included as negatives` : ""}${stats.skipped ? `, ${stats.skipped} unusable row(s) skipped` : ""}.<ul>${months}</ul>`;
            map.innerHTML = Object.keys(stats.byDivision).sort().map(division => {
              const hint = HISTORY_BRANCH_HINTS[division];
              const guess = branches.find(branch => hint && branch.name.toLowerCase().includes(hint));
              const options = [["", "Skip this branch"], ...branches.map(branch => [branch.id, branch.name])];
              const entry = stats.byDivision[division];
              return fieldHTML(`${division} → ${entry.sales} sales, ${formatMoney(entry.amount)}`, `div-${division}`, selectHTML(`div-${division}`, options, guess ? guess.id : ""));
            }).join("");
          } catch (error) {
            parsed = null;
            preview.textContent = error.message;
          }
        });
      },
      onSubmit: async form => {
        if (!parsed || !parsed.sales.length) throw new Error("Choose a valid sales database file first.");
        const branchFor = {};
        Object.keys(parsed.stats.byDivision).forEach(division => { branchFor[division] = form.elements[`div-${division}`]?.value || ""; });
        const sales = parsed.sales.filter(sale => branchFor[sale.division]).map(sale => ({ ...sale, branch_id: branchFor[sale.division] }));
        if (!sales.length) throw new Error("Match at least one branch code to a branch.");
        if (!window.confirm(`Import ${sales.length} sales into the live data? You can remove the whole import afterwards.`)) throw new Error("Import cancelled.");
        batchId ||= crypto.randomUUID();
        const label = form.elements.label.value.trim() || fileName || "Sales history";
        const progress = form.querySelector("#history-progress");
        progress.hidden = false;
        const totals = { sales: 0, lines: 0, skipped_existing: 0, matched_ps: 0 };
        const chunks = window.BranchlineSalesHistory.chunkSales(sales, 200);
        for (let index = 0; index < chunks.length; index += 1) {
          progress.textContent = `Importing… ${Math.min(index * 200, sales.length)} of ${sales.length} sales`;
          const part = mustRpc(await client.rpc("import_sales_history", {
            p_batch: batchId, p_label: label, p_file: fileName,
            p_sales: chunks[index].map(sale => ({ branch_id: sale.branch_id, invoice: sale.invoice, sold_on: sale.sold_on, customer: sale.customer, ps_name: sale.ps_name, payment_mode: sale.payment_mode, lines: sale.lines })),
          }));
          Object.keys(totals).forEach(key => { totals[key] += Number(part[key]) || 0; });
        }
        await refreshData();
        return `<p>Imported <strong>${totals.sales}</strong> sales (${totals.lines} items). ${totals.matched_ps} were matched to a Product Specialist account; the rest keep the salesperson's name only.${totals.skipped_existing ? ` ${totals.skipped_existing} invoice(s) already existed and were left alone.` : ""}</p>`;
      },
    });
  }

  function openRemoveHistoryModal(batch) {
    const daily = batch.kind === "daily";
    openModal({
      title: daily ? "Remove imported daily totals" : "Remove imported sales",
      intro: daily
        ? `Permanently remove "${batch.label}" — ${batch.sales_count} day(s) of totals and walk-ins. Live sales and counts are not affected.`
        : `Permanently remove "${batch.label}" — ${batch.sales_count} sales and ${batch.lines_count} items (${formatMoney(Number(batch.amount))}). Sales entered by your team are not affected.`,
      submitLabel: "Remove import",
      body: "",
      onSubmit: async () => {
        const result = mustRpc(await client.rpc("delete_sales_import", { p_batch: batch.id }));
        await refreshData();
        return daily ? `<p>Removed ${escapeHTML(result.days)} day(s) of totals.</p>` : `<p>Removed ${escapeHTML(result.sales)} sale(s) and ${escapeHTML(result.lines)} item(s).</p>`;
      },
    });
  }

  function openDailyHistoryModal() {
    const A = window.BranchlineDailyHistory;
    const batches = (liveData.importBatches || []).filter(batch => batch.kind === "daily").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const branches = [...liveData.branches].sort((a, b) => natural(a.name, b.name));
    const santiago = branches.find(branch => branch.name.toLowerCase().includes("santiago"));
    const prevMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
    const defaultCutoff = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(prevMonthEnd.getDate()).padStart(2, "0")}`;
    let book = null;
    let fileName = "";
    let batchId = null;
    const batchList = batches.length
      ? `<p class="dlg-intro"><strong>Previous imports</strong></p><ul class="push-list">${batches.map(batch => `<li><span>${escapeHTML(batch.label)} — ${escapeHTML(batch.sales_count)} day(s) (${escapeHTML(batch.date_from || "")} to ${escapeHTML(batch.date_to || "")})</span><button class="button button-outline button-small" type="button" data-history-remove="${escapeHTML(batch.id)}">Remove</button></li>`).join("")}</ul>`
      : "";
    openModal({
      title: "Import daily monitoring file",
      intro: "Admin only. Upload a monthly 'Daily Sales Monitoring' workbook (one sheet per month). It brings in daily sales, invoice counts and walk-ins for this year and last year. Days that already have live sales or counts are never overwritten. You can remove the whole import later.",
      submitLabel: "Import",
      wide: true,
      body: `${batchList}
        ${fieldHTML("Monitoring workbook", "file", '<input name="file" type="file" accept=".xlsx,.xls" required>')}
        ${fieldHTML("Branch", "branch", selectHTML("branch", branches.map(branch => [branch.id, branch.name]), santiago ? santiago.id : ""))}
        ${fieldHTML("Year of the 'this year' columns", "year", `<input name="year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required>`)}
        ${fieldHTML("Import this year's days up to", "cutoff", `<input name="cutoff" type="date" value="${defaultCutoff}" required>`)}
        <div id="history-preview" class="dlg-preview">No file chosen.</div>
        <p class="dlg-preview" id="history-progress" hidden></p>`,
      onReady: form => {
        const preview = form.querySelector("#history-preview");
        let parsed = null;
        const reparse = () => {
          parsed = null;
          if (!book) return;
          try {
            parsed = A.parseMonitoring(book, { year: Number(form.elements.year.value), cutoff: form.elements.cutoff.value });
            const months = parsed.months.sort((a, b) => a.month - b.month).map(item => `<li>${A.MONTHS[item.month - 1]}: this year ${formatMoney(item.ty.sales)} (${item.ty.transactions} inv., ${item.ty.walkins} walk-ins) · last year ${formatMoney(item.ly.sales)} (${item.ly.transactions} inv., ${item.ly.walkins} walk-ins)</li>`).join("");
            preview.innerHTML = `<strong>${parsed.rows.length}</strong> day(s) ready.${parsed.warnings.length ? `<br>${parsed.warnings.map(escapeHTML).join("<br>")}` : ""}<ul>${months}</ul>`;
          } catch (error) {
            preview.textContent = error.message;
          }
        };
        form.querySelectorAll("[data-history-remove]").forEach(button => button.addEventListener("click", () => {
          const batch = batches.find(item => item.id === button.dataset.historyRemove);
          if (batch) openRemoveHistoryModal(batch);
        }));
        form.elements.year.addEventListener("change", reparse);
        form.elements.cutoff.addEventListener("change", reparse);
        form.elements.file.addEventListener("change", async () => {
          book = null;
          batchId = null;
          const file = form.elements.file.files[0];
          if (!file) return;
          fileName = file.name;
          const guess = file.name.match(/20\d\d/);
          if (guess) form.elements.year.value = guess[0];
          preview.textContent = "Reading the file…";
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
            book = {};
            workbook.SheetNames.forEach(name => {
              book[name] = window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
            });
            reparse();
          } catch (error) {
            preview.textContent = error.message;
          }
        });
        form.reparse = () => parsed;
      },
      onSubmit: async form => {
        const parsed = form.reparse && form.reparse();
        if (!parsed || !parsed.rows.length) throw new Error("Choose a valid monitoring workbook first.");
        const branch = form.elements.branch.value;
        if (!branch) throw new Error("Choose a branch.");
        if (!window.confirm(`Import ${parsed.rows.length} day(s) into the live data? Days with live sales or counts are left alone. You can remove the import afterwards.`)) throw new Error("Import cancelled.");
        batchId ||= crypto.randomUUID();
        const label = `${fileName.replace(/\.[^.]+$/, "").slice(0, 70) || "Daily monitoring"}`;
        const progress = form.querySelector("#history-progress");
        progress.hidden = false;
        const totals = { days: 0, skipped_existing: 0 };
        for (let index = 0; index < parsed.rows.length; index += 400) {
          progress.textContent = `Importing… ${index} of ${parsed.rows.length} days`;
          const part = mustRpc(await client.rpc("import_daily_history", {
            p_batch: batchId, p_label: label, p_file: fileName, p_branch: branch,
            p_rows: parsed.rows.slice(index, index + 400),
          }));
          Object.keys(totals).forEach(key => { totals[key] += Number(part[key]) || 0; });
        }
        await refreshData();
        return `<p>Imported <strong>${totals.days}</strong> day(s).${totals.skipped_existing ? ` ${totals.skipped_existing} day(s) already existed and were left alone.` : ""}</p>`;
      },
    });
  }

  function openDeleteSaleModal(sale) {
    openModal({
      title: "Delete transaction",
      intro: `Permanently delete invoice ${sale.invoice_number} (${sale.customer_name}) and all of its items? A snapshot is kept in the deletion record, but the sale is removed from every total.`,
      submitLabel: "Delete transaction",
      body: "",
      onSubmit: async () => {
        mustRpc(await client.rpc("admin_delete_sale", { p_sale_id: sale.id }));
        await refreshData();
      },
    });
  }

  function openHolidayModal() {
    openModal({
      title: "Add store-closed date",
      intro: "Applies company-wide. The date is skipped when counting selling days in forecasts.",
      submitLabel: "Add date",
      body: fieldHTML("Date", "date", '<input name="date" type="date" required>') + fieldHTML("Label (optional)", "label", '<input name="label" maxlength="80" placeholder="e.g. Christmas Day">'),
      onSubmit: async form => {
        mustRpc(await client.rpc("save_company_holiday", { p_date: form.elements.date.value, p_label: form.elements.label.value.trim() || null }));
        await refreshData();
      },
    });
  }

  function openWalkInModal(kind) {
    const today = localISODate();
    const isStore = kind === "store";
    const branches = liveData.branches.filter(branch => scopeBranchIds().has(branch.id));
    const branchField = isStore
      ? fieldHTML("Branch", "branch", selectHTML("branch", branches.map(branch => [branch.id, branch.name]), branches[0]?.id || "")) : "";
    openModal({
      title: isStore ? "Record store visitors" : "Log clients assisted",
      intro: isStore
        ? "Total visitors for the whole store. This overrides the sum of PS counts for that day. Leave the count blank to clear it."
        : "How many clients you assisted that day, whether or not they bought. Saving again replaces your count for that date.",
      submitLabel: "Save",
      body: branchField + fieldHTML("Date", "date", `<input name="date" type="date" max="${today}" value="${today}" required>`)
        + fieldHTML(isStore ? "Visitors" : "Clients assisted", "count", `<input name="count" type="number" min="0" step="1" ${isStore ? "" : "required"}>`),
      onSubmit: async form => {
        const raw = form.elements.count.value.trim();
        if (isStore) {
          mustRpc(await client.rpc("save_branch_walkins", { p_branch_id: form.elements.branch.value, p_date: form.elements.date.value, p_count: raw === "" ? null : Number(raw) }));
        } else {
          mustRpc(await client.rpc("save_ps_walkins", { p_date: form.elements.date.value, p_count: Number(raw) }));
        }
        await refreshData();
      },
    });
  }

  function openWalkInDailyModal() {
    const A = window.BranchlineAnalytics;
    const ctx = walkInDailyCtx;
    if (!ctx) return;
    const { ids, isPs, monthStart, through } = ctx;
    const storeCounts = storeCountsFor(ids, isPs);
    const psCounts = liveData.psWalkins.filter(row => ids.has(row.branch_id) && (!isPs || row.ps_id === currentProfile.id));
    const transactions = [...new Map(withHistoryFacts(analyticsFacts(ids), ids, isPs).map(f => [f.saleId, { id: f.saleId, branchId: f.branchId, date: f.date }])).values()];
    const summarize = (from, to) => A.walkInSummary({ from, to, storeCounts, psCounts, transactions });
    const label = isPs ? "Clients assisted" : "Walk-in traffic";
    const total = summarize(monthStart, through);
    const priorFrom = A.sameDayPriorYear(monthStart);
    const priorTo = A.sameDayPriorYear(through);
    const priorTotal = summarize(priorFrom, priorTo);
    const rate = summary => (summary.conversion === null ? "n/a" : `${(summary.conversion * 100).toFixed(1)}%`);
    const value = summary => (summary.coveredDays ? summary.visitors : "—");
    const change = (now, before) => {
      if (!now.coveredDays || !before.coveredDays) return '<span class="an-muted">n/a</span>';
      const diff = now.visitors - before.visitors;
      const pct = before.visitors ? ` (${diff > 0 ? "+" : ""}${((diff / before.visitors) * 100).toFixed(1)}%)` : "";
      return `<span class="${diff < 0 ? "an-down" : "an-up"}">${diff > 0 ? "+" : ""}${diff}${pct}</span>`;
    };
    const days = [];
    for (let day = monthStart; day <= through; day = A.addDays(day, 1)) days.push(day);
    const body = days.map(day => {
      const now = summarize(day, day);
      const before = summarize(A.sameDayPriorYear(day), A.sameDayPriorYear(day));
      return `<tr><td>${escapeHTML(day)}</td><td>${value(now)}</td><td>${escapeHTML(A.sameDayPriorYear(day))}</td><td>${value(before)}</td><td>${change(now, before)}</td></tr>`;
    }).reverse().join("");
    closeModal();
    modalRoot = document.createElement("div");
    modalRoot.className = "dlg-backdrop";
    const root = modalRoot;
    root.innerHTML = `<div class="dlg dlg-xwide" role="dialog" aria-modal="true" aria-label="${escapeHTML(label)} by day">
      <div class="dlg-head"><h2>${escapeHTML(label)} · ${escapeHTML(monthStart)} to ${escapeHTML(through)}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div>
      <div class="dlg-form">
        <div class="connected-metrics wk-totals">
          <article class="connected-metric"><span>This year (month to date)</span><strong>${value(total)}</strong><small>${total.coveredDays} day(s) counted · conversion ${rate(total)}</small></article>
          <article class="connected-metric"><span>Same days last year</span><strong>${value(priorTotal)}</strong><small>${priorTotal.coveredDays} day(s) counted · conversion ${rate(priorTotal)}</small></article>
          <article class="connected-metric"><span>Change</span><strong>${change(total, priorTotal)}</strong><small>Only days with a recorded count are included</small></article>
        </div>
        <div class="ps-lines"><table class="connected-table"><thead><tr><th>Date</th><th>This year</th><th>Last year date</th><th>Last year</th><th>Change</th></tr></thead><tbody>${body}</tbody></table></div>
        <div class="dlg-actions"><button class="button button-primary" type="button" data-modal-close>Close</button></div>
      </div></div>`;
    document.body.appendChild(root);
    root.addEventListener("pointerdown", event => {
      if (event.target === root || event.target.closest("[data-modal-close]")) closeModal();
    });
  }

  function openTransactionsDailyModal() {
    const A = window.BranchlineAnalytics;
    const ctx = walkInDailyCtx;
    if (!ctx) return;
    const { ids, isPs, monthStart, through } = ctx;
    const perDay = new Map();
    withHistoryFacts(analyticsFacts(ids), ids, isPs).forEach(f => {
      if (!perDay.has(f.date)) perDay.set(f.date, new Set());
      perDay.get(f.date).add(f.saleId);
    });
    const count = (from, to) => {
      let total = 0;
      perDay.forEach((set, date) => { if (date >= from && date <= to) total += set.size; });
      return total;
    };
    const total = count(monthStart, through);
    const priorTotal = count(A.sameDayPriorYear(monthStart), A.sameDayPriorYear(through));
    const change = (now, before) => {
      const diff = now - before;
      const pct = before ? ` (${diff > 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%)` : "";
      return `<span class="${diff < 0 ? "an-down" : "an-up"}">${diff > 0 ? "+" : ""}${diff}${pct}</span>`;
    };
    const days = [];
    for (let day = monthStart; day <= through; day = A.addDays(day, 1)) days.push(day);
    const body = days.map(day => {
      const prior = A.sameDayPriorYear(day);
      const now = perDay.get(day)?.size || 0;
      const before = perDay.get(prior)?.size || 0;
      return `<tr><td>${escapeHTML(day)}</td><td>${now}</td><td>${escapeHTML(prior)}</td><td>${before}</td><td>${change(now, before)}</td></tr>`;
    }).reverse().join("");
    closeModal();
    modalRoot = document.createElement("div");
    modalRoot.className = "dlg-backdrop";
    const root = modalRoot;
    root.innerHTML = `<div class="dlg dlg-xwide" role="dialog" aria-modal="true" aria-label="Transactions by day">
      <div class="dlg-head"><h2>Transactions · ${escapeHTML(monthStart)} to ${escapeHTML(through)}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div>
      <div class="dlg-form">
        <div class="connected-metrics wk-totals">
          <article class="connected-metric"><span>This year (month to date)</span><strong>${total}</strong><small>TEST transactions are not counted</small></article>
          <article class="connected-metric"><span>Same days last year</span><strong>${priorTotal}</strong><small>${escapeHTML(A.sameDayPriorYear(monthStart))} to ${escapeHTML(A.sameDayPriorYear(through))}</small></article>
          <article class="connected-metric"><span>Change</span><strong>${change(total, priorTotal)}</strong><small>Versus the same days last year</small></article>
        </div>
        <div class="ps-lines"><table class="connected-table"><thead><tr><th>Date</th><th>This year</th><th>Last year date</th><th>Last year</th><th>Change</th></tr></thead><tbody>${body}</tbody></table></div>
        <div class="dlg-actions"><button class="button button-primary" type="button" data-modal-close>Close</button></div>
      </div></div>`;
    document.body.appendChild(root);
    root.addEventListener("pointerdown", event => {
      if (event.target === root || event.target.closest("[data-modal-close]")) closeModal();
    });
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

  function openBulkTargetsModal() {
    const branches = [...liveData.branches].sort((a, b) => natural(a.name, b.name));
    if (!branches.length) {
      openModal({ title: "Add multiple targets", body: "<p>There are no branches in your scope yet.</p>", submitLabel: "OK", onSubmit: async () => {} });
      return;
    }
    const month = ui.month || currentMonth();
    const options = [["", "Select branch"], ...(branches.length > 1 ? [["all", `All my branches (${branches.length})`]] : []), ...branches.map(branch => [branch.id, branch.name])];
    const rowHTML = index => `${selectHTML(`t${index}_branch`, options, "", `aria-label="Branch, row ${index + 1}"`)}<input name="t${index}_brand" list="brand-options" placeholder="Brand" aria-label="Brand, row ${index + 1}" autocomplete="off"><input name="t${index}_amount" type="number" min="0" step="0.01" placeholder="Target amount (₱)" aria-label="Target amount, row ${index + 1}">`;
    openModal({
      title: "Add multiple targets",
      intro: "Fill one row per target. Blank rows are ignored. A target that already exists for the same branch, month and brand is replaced.",
      submitLabel: "Save targets",
      wide: true,
      body: `${fieldHTML("Type", "type", selectHTML("type", [["branch", "Branch targets (all brands)"], ["brand", "Brand targets"]], "branch"))}
        ${fieldHTML("Month", "month", `<input name="month" type="month" value="${month}" required>`)}
        <div class="bulk-users-head"><strong>Targets</strong><button class="button button-outline button-small" type="button" id="bulk-add-rows">+ Add more rows</button></div>
        <datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>
        <div class="bulk-grid bulk-grid-3">
          <span class="bulk-label">Branch</span><span class="bulk-label">Brand (brand targets only)</span><span class="bulk-label">Target amount (₱)</span>
          <span id="bulk-rows" style="display:contents">${[0, 1, 2, 3, 4].map(rowHTML).join("")}</span>
        </div>`,
      onReady: form => {
        let count = 5;
        const sync = () => {
          const isBrand = form.elements.type.value === "brand";
          form.querySelectorAll('[name$="_brand"]').forEach(input => { input.disabled = !isBrand; });
        };
        form.elements.type.addEventListener("change", sync);
        form.querySelector("#bulk-add-rows").addEventListener("click", () => {
          const holder = document.createElement("span");
          holder.style.display = "contents";
          holder.innerHTML = [0, 1, 2, 3, 4].map(offset => rowHTML(count + offset)).join("");
          form.querySelector("#bulk-rows").appendChild(holder);
          count += 5;
          sync();
          holder.querySelector("select")?.focus();
        });
        form.bulkCount = () => count;
        sync();
      },
      onSubmit: async form => {
        const isBrand = form.elements.type.value === "brand";
        const monthDate = `${form.elements.month.value}-01`;
        const records = new Map();
        for (let index = 0; index < form.bulkCount(); index += 1) {
          const branchValue = form.elements[`t${index}_branch`]?.value || "";
          const brand = isBrand ? titleCase((form.elements[`t${index}_brand`]?.value || "").trim()) : "";
          const amountText = (form.elements[`t${index}_amount`]?.value || "").trim();
          if (!branchValue && !brand && !amountText) continue;
          if (!branchValue) throw new Error(`Row ${index + 1}: choose a branch.`);
          if (isBrand && !brand) throw new Error(`Row ${index + 1}: enter the brand.`);
          const amount = Number(amountText);
          if (!amountText || !Number.isFinite(amount) || amount < 0) throw new Error(`Row ${index + 1}: enter a valid target amount.`);
          (branchValue === "all" ? branches.map(branch => branch.id) : [branchValue]).forEach(id => {
            records.set(isBrand ? `${id}|${brand.toLowerCase()}` : id, {
              dealer_id: currentProfile.dealer_id, branch_id: id, month: monthDate, amount, created_by: currentProfile.id, ...(isBrand ? { brand } : {}),
            });
          });
        }
        if (!records.size) throw new Error("Enter at least one target.");
        const result = await client
          .from(isBrand ? "brand_targets" : "monthly_targets")
          .upsert([...records.values()], { onConflict: isBrand ? "branch_id,month,brand" : "branch_id,month" });
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
        <div id="user-brand-field">${fieldHTML("Brand (for brand monitoring)", "brand", `<input name="brand" list="brand-options" autocomplete="off" placeholder="e.g. Lg, Lg - Aircon, or Midea / Toshiba"><datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>`)}</div>`,
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

  function openBulkUsersModal() {
    if (!liveData.districts.length) {
      openModal({ title: "Add multiple users", body: "<p>Create a district and a branch before adding users.</p>", submitLabel: "OK", onSubmit: async () => {} });
      return;
    }
    const rowHTML = index => ["Full name", "Login ID", "Email (optional)", "Brand"].map((label, col) =>
      `<input name="u${index}_${col}" placeholder="${label}" aria-label="${label}, user ${index + 1}" autocomplete="off"${col === 3 ? ' list="brand-options"' : ""}${col === 1 || col === 2 ? ' autocapitalize="none"' : ""}>`).join("");
    openModal({
      title: "Add multiple users",
      intro: "Fill one row per person. Everyone gets the same role, district and branch. Blank rows are ignored. Brand is for Product Specialists and is required for them.",
      submitLabel: "Create users",
      wide: true,
      body: `${fieldHTML("Role", "role", selectHTML("role", [["ps", "Product Specialist (PS)"], ["manager", "Branch Manager (BM)"], ["district_manager", "District Manager (DM)"]], "ps"))}
        ${fieldHTML("District", "district", selectHTML("district", liveData.districts.map(item => [item.id, item.name]), ui.district))}
        <div id="branch-field">${fieldHTML("Branch", "branch", '<select name="branch"></select>')}</div>
        <div class="bulk-users-head"><strong>Users</strong><button class="button button-outline button-small" type="button" id="bulk-add-rows">+ Add more users</button></div>
        <datalist id="brand-options">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>
        <div class="bulk-grid" id="bulk-grid">
          <span class="bulk-label">Full name</span><span class="bulk-label">Login ID</span><span class="bulk-label">Email (optional)</span><span class="bulk-label">Brand</span>
          <span id="bulk-rows" style="display:contents">${[0, 1, 2, 3, 4].map(rowHTML).join("")}</span>
        </div>
        <p class="dlg-preview" id="bulk-progress" hidden></p>`,
      onReady: form => {
        let count = 5;
        const sync = () => {
          const role = form.elements.role.value;
          const branches = liveData.branches.filter(branch => branch.district_id === form.elements.district.value);
          form.elements.branch.innerHTML = branches.length
            ? branches.map(branch => `<option value="${escapeHTML(branch.id)}">${escapeHTML(branch.name)}</option>`).join("")
            : '<option value="">No branches in this district</option>';
          form.querySelector("#branch-field").hidden = role === "district_manager";
          form.querySelectorAll('[name$="_3"]').forEach(input => { input.disabled = role !== "ps"; });
        };
        form.elements.role.addEventListener("change", sync);
        form.elements.district.addEventListener("change", sync);
        form.querySelector("#bulk-add-rows").addEventListener("click", () => {
          const holder = document.createElement("span");
          holder.style.display = "contents";
          holder.innerHTML = [0, 1, 2, 3, 4].map(offset => rowHTML(count + offset)).join("");
          form.querySelector("#bulk-rows").appendChild(holder);
          count += 5;
          sync();
          holder.querySelector("input")?.focus();
        });
        form.bulkCount = () => count;
        sync();
      },
      onSubmit: async form => {
        const role = form.elements.role.value;
        const rows = [];
        for (let index = 0; index < form.bulkCount(); index += 1) {
          const value = col => (form.elements[`u${index}_${col}`]?.value || "").trim();
          const entry = { name: value(0), login: value(1), email: value(2), brand: value(3), line: index + 1 };
          if (entry.name || entry.login || entry.email || entry.brand) rows.push(entry);
        }
        if (!rows.length) throw new Error("Enter at least one user.");
        if (rows.length > 40) throw new Error("Add up to 40 users at a time.");
        if (role !== "district_manager" && !form.elements.branch.value) throw new Error("Create a branch in this district first.");
        const progress = form.querySelector("#bulk-progress");
        progress.hidden = false;
        const results = [];
        for (let index = 0; index < rows.length; index += 1) {
          const entry = rows[index];
          progress.textContent = `Creating ${index + 1} of ${rows.length}…`;
          try {
            const contactEmail = entry.email.toLowerCase();
            const loginId = entry.login || contactEmail;
            if (!entry.name) throw new Error("Missing full name.");
            if (!loginId) throw new Error("Missing login ID or email.");
            const body = { role, full_name: titleCase(entry.name), login: loginId, email: contactEmail, app_url: location.origin + location.pathname, district_id: form.elements.district.value };
            if (role !== "district_manager") body.branch_id = form.elements.branch.value;
            if (role === "ps") {
              body.brand = titleCase(entry.brand);
              if (!body.brand) throw new Error("Missing brand.");
            }
            const data = await invokeAdminFunction(body);
            results.push({ name: body.full_name, login: loginId, password: data.temporary_password, error: "" });
          } catch (error) {
            results.push({ name: entry.name || `Row ${entry.line}`, login: entry.login, password: "", error: error.message });
          }
        }
        await refreshData();
        const made = results.filter(item => !item.error);
        const csv = ["Name,Login ID,Temporary password", ...made.map(item => [item.name, item.login, item.password].map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\r\n");
        const link = made.length ? `<p><a class="button button-outline button-small" download="new-users.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Download list (CSV)</a></p>` : "";
        return `<p><strong>${made.length}</strong> of ${results.length} user(s) created. Copy or download the passwords now; they will not be shown again.</p>${link}
          <div class="connected-table-wrap"><table class="connected-table"><thead><tr><th>Name</th><th>Login ID</th><th>Temporary password</th><th>Result</th></tr></thead><tbody>${results.map(item => `<tr><td>${escapeHTML(item.name)}</td><td>${escapeHTML(item.login)}</td><td>${item.error ? "—" : `<code class="temp-password">${escapeHTML(item.password)}</code>`}</td><td>${item.error ? `<span class="an-down">${escapeHTML(item.error)}</span>` : "Created"}</td></tr>`).join("")}</tbody></table></div>`;
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
        ${isPs ? fieldHTML("Brand", "brand", `<input name="brand" required list="edit-brands" autocomplete="off" placeholder="e.g. Lg, Lg - Aircon, or Midea / Toshiba" value="${escapeHTML(person.assigned_brand || "")}"><datalist id="edit-brands">${knownBrands().map(brand => `<option value="${escapeHTML(brand)}"></option>`).join("")}</datalist>`) : ""}
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

  function psNameOf(psId, fallbackName = "") {
    return liveData.profiles.find(profile => profile.id === psId)?.full_name || (psId && psId === currentProfile.id ? currentProfile.full_name : titleCase(fallbackName || "") || "—");
  }

  function exportSales() {
    const stamp = localISODate();
    const sales = visibleSales().filter(sale => !salesLogExport || salesLogExport.has(sale.id));
    const detail = [["Sale date", "Invoice", "Customer", "District", "Branch", "Product Specialist", "Brand", "Category", "Sub-category", "Product", "Barcode", "Qty", "SRP", "Unit price", "Amount", "Mode of payment", "City / town", "Barangay", "Serial numbers"]];
    const byBranch = new Map();
    const byBrand = new Map();
    sales.forEach(sale => {
      linesForSale(sale.id).forEach(line => {
        const amount = Number(line.selling_price) * Number(line.quantity);
        detail.push([sale.sold_on, sale.invoice_number, sale.customer_name, branchDistrictName(sale.branch_id), branchName(sale.branch_id), psNameOf(sale.ps_id, sale.ps_name), line.brand, line.category || "", line.sub_category || "", line.model_description, line.barcode, Number(line.quantity), line.srp == null ? "" : Number(line.srp), Number(line.selling_price), amount, sale.payment_mode || "", sale.city || "", sale.barangay || "", serialsFor(sale.id, line.barcode).join(", ")]);
        addTo(byBranch, branchName(sale.branch_id), amount);
        addTo(byBrand, (line.brand || "Unbranded").trim(), amount);
      });
    });
    const sheets = [{ name: currentProfile.role === "ps" ? "My sales" : "Sales", rows: detail }];
    if (currentProfile.role === "ps") {
      sheets.push({
        name: "Brand branch-wide",
        rows: [["Sale date", "Invoice", "Product Specialist",         "Brand", "Category", "Sub-category", "Product", "Qty"],
                  ...liveData.brandSales.map(row => [row.sold_on, row.invoice_number, row.ps_name, row.brand, row.category, row.sub_category, row.model_description, Number(row.quantity)])],
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
      const header = ["Sale date", "Invoice", "Customer", "Brand", "Category", "Sub-category", "Product",             "Barcode", "Qty", "SRP", "Unit price", "Amount", "Mode of payment", "City / town", "Barangay", "Serial numbers"];
                  const data = rows().map(({ sale, line }) => [sale.sold_on, sale.invoice_number, sale.customer_name, line.brand, line.category || "", line.sub_category || "", line.model_description, line.barcode, Number(line.quantity), line.srp == null ? "" : Number(line.srp), Number(line.selling_price), Number(line.selling_price) * Number(line.quantity), sale.payment_mode || "", sale.city || "", sale.barangay || "", serialsFor(sale.id, line.barcode).join(", ")]);
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
    else if (open === "payment-targets") openPaymentTargetsModal();
    else if (open === "sync-categories") openSyncCategoriesModal();
    else if (open === "sales-history") openSalesHistoryModal();
    else if (open === "daily-history") openDailyHistoryModal();
    else if (open === "target") openTargetModal();
    else if (open === "targets-bulk") openBulkTargetsModal();
    else if (open === "district") openDistrictModal();
    else if (open === "branch") openBranchModal();
    else if (open === "user") openUserModal();
    else if (open === "users-bulk") openBulkUsersModal();
    else if (open === "wipe") openWipeModal();
    else if (open === "holiday") openHolidayModal();
    else if (open === "walkin-ps") openWalkInModal("ps");
    else if (open === "walkin-store") openWalkInModal("store");
    else if (open === "walkin-daily") openWalkInDailyModal();
    else if (open === "transactions-daily") openTransactionsDailyModal();
    else if (open === "push-message") openPushMessageModal(event.target.closest("[data-open]").dataset.status);
    const pushDelete = event.target.closest("[data-push-delete]");
    if (pushDelete) {
      pushDelete.disabled = true;
      client.rpc("delete_push_message", { p_id: pushDelete.dataset.pushDelete })
        .then(result => { mustRpc(result); return refreshData(); })
        .catch(error => { pushDelete.disabled = false; alert(error.message || "Could not delete the message."); });
    }
    const holidayDelete = event.target.closest("[data-holiday-delete]");
    if (holidayDelete) {
      holidayDelete.disabled = true;
      client.rpc("delete_company_holiday", { p_date: holidayDelete.dataset.holidayDelete })
        .then(result => { mustRpc(result); return refreshData(); })
        .catch(error => { holidayDelete.disabled = false; alert(error.message || "Could not delete the date."); });
    }
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
    if (event.target.closest("[data-log-clear]")) {
      ui.logBranch = "";
      ui.logFrom = "";
      ui.logTo = "";
      ui.pages = {};
      refreshResults();
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
      const sale = [...liveData.sales, ...liveData.testSales].find(item => item.id === editSale.dataset.editSale);
      if (sale) openSaleModal(sale);
    }
    const deleteSale = event.target.closest("[data-delete-sale]");
    if (deleteSale && currentProfile.role === "admin") {
      const sale = [...liveData.sales, ...liveData.testSales].find(item => item.id === deleteSale.dataset.deleteSale);
      if (sale) openDeleteSaleModal(sale);
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
    const keep = table.headers.map(isDataHeader);
    const doc = new DOMParser().parseFromString(`<table><tbody>${table.items.map(table.rowHtml).join("")}</tbody></table>`, "text/html");
    const rows = [...doc.querySelectorAll("tr")].map(tr =>
      [...tr.children].filter((_, index) => keep[index]).map(cell => cell.textContent.trim()));
    const title = table.title || key;
    exportWorkbook([{ name: title.replace(/[\\/?*[\]:]/g, " "), rows: [table.headers.filter(isDataHeader), ...rows] }],
      `branchline-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${localISODate()}`);
  }

  // ---------- Push notifications (behind-pace alerts for PSs) ----------
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushButton = () => document.querySelector("#push-toggle");

  function vapidKeyBytes(key) {
    const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
  }

  async function currentPushSubscription() {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function refreshPushButton(isPs) {
    const button = pushButton();
    if (!button) return;
    if (!isPs || !config.vapidPublicKey) { button.hidden = true; return; }
    button.hidden = false;
    if (!pushSupported) {
      button.disabled = true;
      button.textContent = "Notifications not supported here";
      return;
    }
    if (Notification.permission === "denied") {
      button.disabled = true;
      button.textContent = "Notifications blocked in browser";
      return;
    }
    button.disabled = false;
    const subscription = await currentPushSubscription().catch(() => null);
    button.textContent = subscription ? "Turn off pace alerts" : "Turn on pace alerts";
    button.dataset.on = subscription ? "1" : "";
  }

  const pushOptOutKey = () => `branchline-push-off-${currentProfile?.id || ""}`;

  async function saveCurrentPushSubscription(registration) {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(config.vapidPublicKey),
      });
    }
    const json = subscription.toJSON();
    mustRpc(await client.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth }));
  }

  // Once the phone/browser has granted permission, every app open silently (re)registers this device for the signed-in PS.
  async function autoRegisterPush() {
    if (!pushSupported || !config.vapidPublicKey || currentProfile?.role !== "ps") return;
    if (Notification.permission !== "granted" || localStorage.getItem(pushOptOutKey())) return;
    try {
      await saveCurrentPushSubscription(await navigator.serviceWorker.ready);
    } catch (error) {
      console.warn("Could not register this device for alerts.", error);
    }
    refreshPushButton(true);
  }

  async function enablePush() {
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications were not allowed. You can allow them in your browser or phone settings for this site.");
    localStorage.removeItem(pushOptOutKey());
    await saveCurrentPushSubscription(await navigator.serviceWorker.ready);
  }

  async function togglePush() {
    const button = pushButton();
    button.disabled = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        mustRpc(await client.rpc("delete_push_subscription", { p_endpoint: existing.endpoint }));
        await existing.unsubscribe();
        localStorage.setItem(pushOptOutKey(), "1");
      } else {
        await enablePush();
      }
    } catch (error) {
      alert(error.message || "Could not change notification settings.");
    }
    await refreshPushButton(currentProfile?.role === "ps");
  }

  // ---------- Pace pop-up shown after sign-in ----------
  const PACE_DEFAULTS = {
    behind: "{name}, you are behind pace: {sold} sold vs {expected} expected by today. You can still catch up!",
    on: "{name}, you are on track: {sold} sold vs {expected} expected by today. Keep it up!",
    exceeded: "{name}, target reached! {sold} sold against your {share} share. Outstanding work!",
  };
  const PACE_TITLES = { behind: "You're behind pace", on: "You're on track", exceeded: "Target reached!" };

  function paceMessage(status, vars) {
    const pool = (liveData.pushMessages || []).filter(item => item.status === status);
    const raw = pool.length ? pool[Math.floor(Math.random() * pool.length)].message : PACE_DEFAULTS[status];
    return String(raw).split("{name}").join(vars.name).split("{sold}").join(vars.sold).split("{expected}").join(vars.expected).split("{share}").join(vars.share);
  }

  function flashScreenEdges(color) {
    document.querySelector(".edge-glow")?.remove();
    const glow = document.createElement("div");
    glow.className = "edge-glow";
    glow.style.setProperty("--glow", color);
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);
    window.setTimeout(() => glow.remove(), 5000);
  }

  function showPacePopup() {
    if (currentProfile?.role !== "ps" || pacePopupShown) return;
    const { actual, target } = personalTargetProgress();
    if (!(target > 0)) return;
    pacePopupShown = true;
    const status = paceStatus(actual, target);
    const expected = target * paceFraction();
    const text = paceMessage(status.key, {
      name: String(currentProfile.full_name || "").split(" ")[0] || "there",
      sold: formatMoney(actual),
      expected: formatMoney(expected),
      share: formatMoney(target),
    });
    const canAsk = pushSupported && config.vapidPublicKey && Notification.permission === "default";
    closeModal();
    modalRoot = document.createElement("div");
    modalRoot.className = "dlg-backdrop";
    const root = modalRoot;
    root.innerHTML = `<div class="dlg pace-popup pace-${status.key}" style="--glow:${status.color}" role="dialog" aria-modal="true" aria-label="Pace update">
      <div class="dlg-head"><h2>${escapeHTML(PACE_TITLES[status.key])}</h2><button class="dlg-close" type="button" aria-label="Close" data-modal-close>×</button></div>
      <div class="dlg-form">
        <p class="pace-text">${escapeHTML(text)}</p>
        <div class="pace-numbers"><div><span>Sold (MTD)</span><strong>${escapeHTML(formatMoney(actual))}</strong></div><div><span>Expected by now</span><strong>${escapeHTML(formatMoney(expected))}</strong></div><div><span>Your target share</span><strong>${escapeHTML(formatMoney(target))}</strong></div></div>
        <p class="dlg-error" role="alert" hidden></p>
        <div class="dlg-actions">${canAsk ? '<button class="button button-outline" type="button" data-pace-enable>Turn on alerts</button>' : ""}<button class="button button-primary" type="button" data-modal-close>Got it</button></div>
      </div></div>`;
    document.body.appendChild(root);
    root.addEventListener("pointerdown", event => {
      if (event.target === root || event.target.closest("[data-modal-close]")) closeModal();
    });
    root.querySelector("[data-pace-enable]")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await enablePush();
        button.textContent = "Alerts on ✓";
        refreshPushButton(true);
      } catch (error) {
        const box = root.querySelector(".dlg-error");
        box.textContent = error.message || "Could not turn on alerts.";
        box.hidden = false;
        button.disabled = false;
      }
    });
    flashScreenEdges(status.color);
  }

  document.querySelector("#push-toggle")?.addEventListener("click", togglePush);
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
    const box = event.target.closest?.("[data-colfilter]");
    if (!box || !resultsView) return;
    const [key, col] = box.dataset.colfilter.split("|");
    (ui.colf[key] ||= {})[Number(col)] = box.value;
    const caret = box.selectionStart;
    const isText = box.tagName === "INPUT";
    refreshResults();
    if (isText) {
      const field = document.querySelector(`[data-colfilter="${key}|${col}"]`);
      if (field) {
        field.focus();
        field.setSelectionRange(caret, caret);
      }
    }
  });

  connectedContent.addEventListener("click", event => {
    const clear = event.target.closest?.("[data-colfilter-clear]");
    if (!clear || !resultsView) return;
    ui.colf[clear.dataset.colfilterClear] = {};
    refreshResults();
  });

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
    const sortButton = event.target.closest("[data-sort-table]");
    if (sortButton) {
      const { sortTable: tableKey, sortCol } = sortButton.dataset;
      const current = ui.sort[tableKey];
      const col = Number(sortCol);
      ui.sort[tableKey] = current?.col === col ? { col, dir: current.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" };
      ui.pages[tableKey] = 1;
      refreshResults();
      return;
    }
    if (event.target.closest("[data-delete-products]") && currentProfile.role === "admin" && productSelection.size) {
      openDeleteProductsModal();
      return;
    }
    if (pagerButton && !pagerButton.disabled) {
      ui.pages[pagerButton.dataset.pager] = Number(pagerButton.dataset.page);
      refreshResults();
    }
  });

  connectedContent.addEventListener("change", event => {
    if (currentProfile?.role !== "admin") return;
    const row = event.target.closest?.("[data-product-select]");
    if (row) {
      if (row.checked) productSelection.add(row.dataset.productSelect);
      else productSelection.delete(row.dataset.productSelect);
      refreshResults();
    } else if (event.target.matches?.("[data-product-select-all]")) {
      productSelection.clear();
      if (event.target.checked) productsFiltered.forEach(key => productSelection.add(key));
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
    const remember = document.querySelector("#remember-me")?.checked !== false;
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail(loginForm.elements.email.value) || loginForm.elements.email.value.trim(),
        password: loginForm.elements.password.value,
      });
      if (error) throw error;
      if (remember) localStorage.setItem(LAST_LOGIN_KEY, loginForm.elements.email.value.trim());
      else localStorage.removeItem(LAST_LOGIN_KEY);
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
    client = window.supabase.createClient(config.url, config.publishableKey, { auth: { storage: authStorage } });
    applyRememberedLogin();
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
