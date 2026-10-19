(() => {
  "use strict";

  const STORAGE_KEY = "branchline-prototype-v1";
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const defaultDistrict = "District 5";
  const legacyBranchNames = {
    "Cebu City": "Santiago City",
    "Mandaue": "Cauayan City",
    "Lapu-Lapu": "Ilagan City",
  };
  const initialState = {
    role: "ps",
    branchFilter: "all",
    month: currentMonth,
    chartWeek: today,
    appEnabled: true,
    users: [
      { id: "ps-jamie", name: "Jamie Lee", initials: "JL", role: "ps", branch: "Santiago City", brand: "Samsung", active: true },
      { id: "ps-miguel", name: "Miguel Santos", initials: "MS", role: "ps", branch: "Santiago City", brand: "Apple", active: true },
      { id: "ps-ana", name: "Ana Reyes", initials: "AR", role: "ps", branch: "Santiago City", brand: "Xiaomi", active: true },
      { id: "ps-chris", name: "Chris Lim", initials: "CL", role: "ps", branch: "Santiago City", brand: "OPPO", active: true },
      { id: "mgr-lara", name: "Lara Cruz", initials: "LC", role: "manager", branch: "Santiago City", active: true },
      { id: "mgr-daniel", name: "Daniel Tan", initials: "DT", role: "manager", branch: "Cauayan City", active: true },
      { id: "dm-sam", name: "Sam Villanueva", initials: "SV", role: "district_manager", branch: null, district: defaultDistrict, active: true },
      { id: "admin", name: "Morgan Admin", initials: "MA", role: "admin", branch: null, active: true },
      { id: "ps-paolo", name: "Paolo Garcia", initials: "PG", role: "ps", branch: "Cauayan City", brand: "Samsung", active: true },
      { id: "ps-nina", name: "Nina Flores", initials: "NF", role: "ps", branch: "Cauayan City", brand: "Apple", active: true },
      { id: "ps-joel", name: "Joel Ramos", initials: "JR", role: "ps", branch: "Ilagan City", brand: "Xiaomi", active: true },
      { id: "mgr-sam", name: "Sam Villanueva", initials: "SV", role: "manager", branch: "Ilagan City", active: true },
    ],
    branches: [
      { name: "Santiago City", district: defaultDistrict, target: 8000000 },
      { name: "Cauayan City", district: defaultDistrict, target: 5600000 },
      { name: "Ilagan City", district: defaultDistrict, target: 4200000 },
      { name: "Tuguegarao City", district: defaultDistrict, target: 0 },
    ],
    brandTargets: [
      { brand: "Samsung", target: 2800000, branch: "Santiago City" },
      { brand: "Apple", target: 2100000, branch: "Santiago City" },
      { brand: "Xiaomi", target: 1250000, branch: "Santiago City" },
      { brand: "Samsung", target: 1900000, branch: "Cauayan City" },
      { brand: "Apple", target: 1450000, branch: "Cauayan City" },
      { brand: "Samsung", target: 1500000, branch: "Ilagan City" },
      { brand: "Xiaomi", target: 900000, branch: "Cauayan City" },
      { brand: "Apple", target: 1800000, branch: "Ilagan City" },
      { brand: "Xiaomi", target: 900000, branch: "Ilagan City" },
      { brand: "OPPO", target: 450000, branch: "Santiago City" },
      { brand: "vivo", target: 450000, branch: "Santiago City" },
      { brand: "OPPO", target: 350000, branch: "Cauayan City" },
      { brand: "vivo", target: 300000, branch: "Ilagan City" },
    ],
    products: [
      { barcode: "4800888123456", model: "Galaxy A56 5G 256GB", brand: "Samsung" },
      { barcode: "4800888123457", model: "Galaxy S25 Ultra 512GB", brand: "Samsung" },
      { barcode: "0195949038912", model: "iPhone 16 Pro 256GB", brand: "Apple" },
      { barcode: "0195949038929", model: "iPhone 16 128GB", brand: "Apple" },
      { barcode: "6941812790014", model: "Redmi Note 14 Pro 5G", brand: "Xiaomi" },
      { barcode: "6941812790021", model: "Xiaomi 14T 256GB", brand: "Xiaomi" },
      { barcode: "8806095482102", model: "Galaxy Buds3 Pro", brand: "Samsung" },
      { barcode: "0195949038943", model: "Apple Watch Series 10", brand: "Apple" },
      { barcode: "4800888123458", model: "Galaxy Tab S10 256GB", brand: "Samsung" },
      { barcode: "0195949038950", model: "AirPods 4", brand: "Apple" },
      { barcode: "6941812790038", model: "Redmi Pad Pro 5G", brand: "Xiaomi" },
      { barcode: "8806095482103", model: "Galaxy Watch7 44mm", brand: "Samsung" },
      { barcode: "4894947001234", model: "OPPO Reno13 5G", brand: "OPPO" },
      { barcode: "6941399098765", model: "vivo V50 5G", brand: "vivo" },
    ],
    sales: [
      { id: "sale-1", owner: "ps-jamie", branch: "Santiago City", customer: "Carlo Mendoza", invoice: "SI-2026-1041", date: today, lines: [{ barcode: "4800888123456", price: 24990, quantity: 1 }, { barcode: "8806095482102", price: 11990, quantity: 1 }], editedAt: null },
      { id: "sale-2", owner: "ps-miguel", branch: "Santiago City", customer: "Patricia Lim", invoice: "SI-2026-1040", date: today, lines: [{ barcode: "0195949038912", price: 74990, quantity: 1 }], editedAt: null },
      { id: "sale-3", owner: "ps-ana", branch: "Santiago City", customer: "Rafael Cruz", invoice: "SI-2026-1036", date: today, lines: [{ barcode: "6941812790014", price: 15990, quantity: 2 }], editedAt: null },
      { id: "sale-4", owner: "ps-chris", branch: "Santiago City", customer: "Mia Tan", invoice: "SI-2026-1034", date: today, lines: [{ barcode: "0195949038929", price: 54990, quantity: 1 }], editedAt: null },
      { id: "sale-5", owner: "ps-jamie", branch: "Santiago City", customer: "Anton Yap", invoice: "SI-2026-0998", date: `${currentMonth}-05`, lines: [{ barcode: "0195949038943", price: 28990, quantity: 1 }], editedAt: null },
      { id: "sale-6", owner: "ps-miguel", branch: "Santiago City", customer: "Liza Ong", invoice: "SI-2026-0990", date: `${currentMonth}-04`, lines: [{ barcode: "4800888123457", price: 82990, quantity: 1 }], editedAt: null },
      { id: "sale-7", owner: "ps-ana", branch: "Santiago City", customer: "Noel Dizon", invoice: "SI-2026-0981", date: `${currentMonth}-03`, lines: [{ barcode: "6941812790021", price: 24990, quantity: 1 }], editedAt: null },
      { id: "sale-8", owner: "ps-paolo", branch: "Cauayan City", customer: "Jessa Pineda", invoice: "SI-2026-1043", date: today, lines: [{ barcode: "4800888123456", price: 24990, quantity: 1 }], editedAt: null },
      { id: "sale-9", owner: "ps-nina", branch: "Cauayan City", customer: "Dino Abad", invoice: "SI-2026-1039", date: today, lines: [{ barcode: "0195949038912", price: 74990, quantity: 1 }], editedAt: null },
      { id: "sale-10", owner: "ps-joel", branch: "Ilagan City", customer: "Ria Cabahug", invoice: "SI-2026-1042", date: today, lines: [{ barcode: "6941812790014", price: 15990, quantity: 1 }], editedAt: null },
    ],
    history: [],
    notifications: [{ text: "Welcome to your sales workspace", time: "Just now" }],
  };

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const fresh = structuredClone(initialState);
        const assignedAt = new Date().toISOString();
        fresh.managerAssignments = fresh.users.filter(user => user.role === "manager" && user.branch).map(user => ({
          managerId: user.id, branch: user.branch, startedAt: assignedAt, endedAt: null, assignedBy: null,
        }));
        fresh.users.forEach(user => {
          if (user.role === "district_manager") user.district = defaultDistrict;
          else if (user.branch) user.district = fresh.branches.find(branch => branch.name === user.branch)?.district || defaultDistrict;
        });
        return fresh;
      }
      const parsed = JSON.parse(stored);
      const merged = { ...structuredClone(initialState), ...parsed };
      const defaultUsers = new Map(initialState.users.map(user => [user.id, user]));
      merged.users = (parsed.users || initialState.users).map(user => ({ ...defaultUsers.get(user.id), ...user }));
      if (!Array.isArray(merged.managerAssignments)) {
        const now = new Date().toISOString();
        merged.managerAssignments = merged.users.filter(user => user.role === "manager" && user.branch).map(user => ({
          managerId: user.id,
          branch: user.branch,
          startedAt: now,
          endedAt: null,
          assignedBy: null,
        }));
      }
      merged.branches = merged.branches.map(branch => ({
        ...branch,
        name: legacyBranchNames[branch.name] || branch.name,
        district: branch.district || defaultDistrict,
      }));
      if (!merged.branches.some(branch => branch.name === "Tuguegarao City")) {
        merged.branches.push({ name: "Tuguegarao City", district: defaultDistrict, target: 0 });
      }
      merged.users.forEach(user => {
        if (user.branch) user.branch = legacyBranchNames[user.branch] || user.branch;
        if (user.role === "district_manager") user.district ||= defaultDistrict;
        else if (user.branch) user.district = merged.branches.find(branch => branch.name === user.branch)?.district || defaultDistrict;
        else user.district = null;
      });
      merged.sales.forEach(sale => { sale.branch = legacyBranchNames[sale.branch] || sale.branch; });
      merged.brandTargets.forEach(target => { target.branch = legacyBranchNames[target.branch] || target.branch; });
      merged.managerAssignments.forEach(assignment => { assignment.branch = legacyBranchNames[assignment.branch] || assignment.branch; });
      (merged.managerBranches || []).forEach(assignment => { assignment.branch = legacyBranchNames[assignment.branch] || assignment.branch; });
      if (Array.isArray(merged.branchFilter)) {
        merged.branchFilter = merged.branchFilter.map(branch => legacyBranchNames[branch] || branch);
      } else if (merged.branchFilter !== "all") {
        merged.branchFilter = legacyBranchNames[merged.branchFilter] || merged.branchFilter;
      }
      if (!merged.chartWeek) merged.chartWeek = today;
      return merged;
    } catch (error) {
      console.error("Unable to load prototype data from this browser.", error);
      return structuredClone(initialState);
    }
  }

  let state = loadState();
  let editingSaleId = null;
  let editingProductBarcode = null;
  let editingBrandTargetIndex = null;
  let productPage = 1;
  let brandTargetPage = 1;
  let branchTargetPage = 1;
  let salesLogPage = 1;
  const rankedTablePages = {};
  let targetSearchTerm = "";
  let accountBranchFilter = "all";
  let accountPage = 1;
  const branchTargetDrafts = {};
  let dailySalesDate = today;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const roleSelect = $("#role-select");

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Unable to save prototype data in this browser.", error);
      showToast("This browser could not save the latest change.");
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function money(value) {
    const amount = Number(value);
    return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function sumSale(sale) {
    return sale.lines.reduce((total, line) => total + Number(line.price) * Number(line.quantity), 0);
  }

  const parseCurrency = window.parseCurrency;
  const formatCurrencyInput = window.formatCurrencyInput;

  function salesForMonth(month = state.month) {
    return state.sales.filter(sale => sale.date.slice(0, 7) === month);
  }

  function currentUser() {
    if (state.role === "admin") return state.users.find(user => user.role === "admin");
    if (state.role === "district_manager") return state.users.find(user => user.role === "district_manager" && user.active);
    if (state.role === "manager") return state.users.find(user => user.role === "manager" && user.active);
    return state.users.find(user => user.id === "ps-jamie");
  }

  function districts() {
    return [...new Set(state.branches.map(branch => branch.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function managerCanEditSale(sale, manager = currentUser()) {
    const createdAt = Date.parse(sale.createdAt || "");
    if (!manager || manager.role !== "manager" || !Number.isFinite(createdAt) || manager.branch !== sale.branch) return false;
    return state.managerAssignments.some(assignment =>
      assignment.managerId === manager.id
      && assignment.branch === sale.branch
      && Date.parse(assignment.startedAt) <= createdAt
      && (!assignment.endedAt || createdAt < Date.parse(assignment.endedAt)));
  }

  function assignManagerToBranch(manager, branch) {
    const now = new Date().toISOString();
    state.managerAssignments ||= [];
    state.managerAssignments.filter(assignment => assignment.managerId === manager.id && !assignment.endedAt)
      .forEach(assignment => { assignment.endedAt = now; });
    manager.branch = branch;
    if (manager.role === "manager" && branch) {
      state.managerAssignments.push({ managerId: manager.id, branch, startedAt: now, endedAt: null, assignedBy: currentUser()?.id || null });
    }
  }

  function setManagerActive(manager, active) {
    if (manager.active === active) return;
    const now = new Date().toISOString();
    if (!active) {
      (state.managerAssignments || []).filter(assignment => assignment.managerId === manager.id && !assignment.endedAt)
        .forEach(assignment => { assignment.endedAt = now; });
    }
    manager.active = active;
    if (active && manager.role === "manager" && manager.branch) {
      state.managerAssignments ||= [];
      state.managerAssignments.push({ managerId: manager.id, branch: manager.branch, startedAt: now, endedAt: null, assignedBy: currentUser()?.id || null });
    }
  }

  function currentBranch() {
    return currentUser()?.branch || "Santiago City";
  }

  function activePSCount(branchName) {
    return state.users.filter(user => user.role === "ps" && user.branch === branchName && user.active).length;
  }

  function selectedBranches() {
    if (state.role === "admin" || state.role === "district_manager") {
      const available = state.role === "district_manager"
        ? state.branches.filter(branch => branch.district === currentUser()?.district)
        : state.branches;
      if (state.branchFilter === "all") return available.map(branch => branch.name);
      const selected = Array.isArray(state.branchFilter) ? state.branchFilter : [state.branchFilter];
      return available.map(branch => branch.name).filter(name => selected.includes(name));
    }
    return state.role === "manager" ? [currentBranch()] : [currentBranch()];
  }

  function salesInBranches(sales = salesForMonth()) {
    const allowed = selectedBranches();
    return sales.filter(sale => allowed.includes(sale.branch));
  }

  function salesTotal(sales) {
    return sales.reduce((total, sale) => total + sumSale(sale), 0);
  }

  function psTarget(branchName) {
    const branch = state.branches.find(item => item.name === branchName);
    if (!branch) return 0;
    const count = activePSCount(branchName);
    return count ? Math.ceil((branch.target / count) / 50000) * 50000 : 0;
  }

  function userName(userId) {
    return state.users.find(user => user.id === userId)?.name || "Former PS";
  }

  function product(barcode) {
    return state.products.find(item => item.barcode === barcode);
  }

  function lineName(line) {
    return product(line.barcode)?.model || `Unknown product · ${line.barcode}`;
  }

  function rankForUser(userId, branchName, sales = salesForMonth()) {
    const totals = state.users.filter(user => user.role === "ps" && user.branch === branchName && user.active).map(user => ({
      id: user.id,
      total: salesTotal(sales.filter(sale => sale.owner === user.id && sale.branch === branchName)),
    })).sort((a, b) => b.total - a.total);
    const index = totals.findIndex(item => item.id === userId);
    return { rank: index + 1, count: totals.length, totals };
  }

  function percentage(amount, target) {
    return target ? amount / target * 100 : 0;
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function weekStart(dateValue) {
    const date = new Date(`${dateValue}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
  }

  function chartWeekBounds(month, selectedDate) {
    const monthStart = new Date(`${month}-01T12:00:00`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);
    const chosen = new Date(`${selectedDate}T12:00:00`);
    const anchor = chosen < monthStart ? monthStart : chosen > monthEnd ? monthEnd : chosen;
    const monday = weekStart(isoDate(anchor));
    const start = monday < monthStart ? monthStart : monday;
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const end = sunday > monthEnd ? monthEnd : sunday;
    return { start, end, monthStart, monthEnd };
  }

  function shiftChartWeek(amount) {
    const { start, monthStart, monthEnd } = chartWeekBounds(state.month, state.chartWeek || today);
    const next = new Date(start);
    next.setDate(next.getDate() + amount * 7);
    state.chartWeek = isoDate(next < monthStart ? monthStart : next > monthEnd ? monthEnd : next);
    saveState();
    render();
  }

  function monthLabel(month = state.month) {
    return new Date(`${month}-01T12:00:00`).toLocaleDateString("en", { month: "long", year: "numeric" });
  }

  function setRole(role) {
    state.role = role;
    state.branchFilter = "all";
    $("#breadcrumb-current").dataset.page = "overview";
    window.history.replaceState(null, "", "#overview");
    saveState();
    render();
  }

  function render() {
    const user = currentUser();
    if (!user) return;
    roleSelect.value = state.role;
    $("#profile-name").textContent = user.name;
    $("#profile-role").textContent = state.role === "ps" ? `Product Specialist · ${user.brand || "Brand not assigned"}` : state.role === "manager" ? `Branch Manager · ${user.branch}` : state.role === "district_manager" ? "District Manager" : "Administrator";
    $("#profile-avatar").textContent = user.initials;
    $("#profile-avatar").className = `avatar ${state.role}`;
    renderNav();
    if (!state.appEnabled && state.role !== "admin") {
      $("#breadcrumb-current").textContent = "Workspace paused";
      $("#main-nav").innerHTML = "";
      $("#page-content").innerHTML = `<div class="page-heading"><div><span class="eyebrow">WORKSPACE STATUS</span><h1>This workspace is paused.</h1><p>Staff access has been disabled by the administrator. Contact your administrator for assistance.</p></div></div>`;
      return;
    }
    const page = $("#breadcrumb-current").dataset.page || "overview";
    if (state.role === "ps") {
      if (page === "sales") renderPSSales();
      else if (page === "ranking") renderPSRanking();
      else renderPS();
    } else if (state.role === "manager") renderManager(page);
    else if (state.role === "district_manager") renderAdmin(page, true);
    else renderAdmin(page);
    if (page === "overview" && state.role !== "ps") appendManagementPanels();
  }

  function renderNav() {
    const entries = state.role === "ps"
      ? [["overview", "◫", "My performance"], ["sales", "↗", "My sales"], ["ranking", "♙", "Team ranking"]]
      : state.role === "manager"
        ? [["overview", "◫", "Branch overview"], ["sales", "↗", "Sales log"], ["targets", "◎", "Targets"], ["products", "▦", "Products"]]
        : state.role === "district_manager"
          ? [["overview", "◫", "All branches"], ["sales", "↗", "Sales log"], ["targets", "◎", "Targets"], ["products", "▦", "Products"]]
          : [["overview", "◫", "All branches"], ["sales", "↗", "Sales log"], ["targets", "◎", "Targets"], ["products", "▦", "Products"], ["users", "♙", "People & access"]];
    const active = $("#breadcrumb-current").dataset.page || "overview";
    $("#main-nav").innerHTML = entries.map(([key, icon, label]) => `<a class="nav-link ${active === key ? "active" : ""}" href="#${key}" data-page="${key}"><span class="nav-icon">${icon}</span><span>${label}</span>${key === "sales" ? '<span class="nav-badge">New</span>' : ""}</a>`).join("");
  }

  function heading(title, subtitle, action = "") {
    return `<div class="page-heading"><div><span class="eyebrow">${state.role === "ps" ? "PRODUCT SPECIALIST" : state.role === "manager" ? `BRANCH · ${escapeHTML(currentBranch()).toUpperCase()}` : state.role === "district_manager" ? "DISTRICT MANAGER" : "ADMINISTRATOR"}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }

  function periodBar() {
    return `<div class="period-bar"><span class="period-label">Performance period <strong>${monthLabel()}</strong></span><input class="period-select" id="month-select" type="month" value="${escapeHTML(state.month)}" aria-label="Performance month"></div>`;
  }

  function metricCard(title, value, icon, foot, footClass = "trend-neutral") {
    return `<article class="metric-card"><div class="metric-top"><span>${title}</span><span class="metric-symbol">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span class="${footClass}">${foot}</span></div></article>`;
  }

  function targetPanel(title, subtitle, rows, note = "") {
    const rowHTML = rows.map(row => `<div class="target-row"><div class="target-meta"><strong>${escapeHTML(row.label)}</strong><span>${money(row.actual, true)} of ${money(row.target, true)} · ${row.percent.toFixed(1)}%</span></div><div class="progress-track"><div class="progress-value ${row.tone || ""}" style="width:${Math.min(row.percent, 100)}%"></div></div></div>`).join("");
    return `<section class="panel"><div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div></div>${rowHTML}${note ? `<div class="target-note">${note}</div>` : ""}</section>`;
  }

  function personalTargetChart(actual, target, subtitle, branchTarget, activeCount) {
    const ratio = target > 0 ? Math.max(0, Math.min(actual / target, 1)) : 0;
    const completion = percentage(actual, target);
    const endAngle = -Math.PI / 2 + ratio * Math.PI * 2;
    const slice = ratio >= 0.9999
      ? '<circle r="0.96" fill="#16a34a"></circle>'
      : ratio > 0
        ? `<path d="M0 0 L0 -0.96 A0.96 0.96 0 ${ratio > 0.5 ? 1 : 0} 1 ${(Math.cos(endAngle) * 0.96).toFixed(4)} ${(Math.sin(endAngle) * 0.96).toFixed(4)} Z" fill="#16a34a"></path>`
        : "";
    const formula = `Branch goal ${money(branchTarget)} ÷ ${activeCount} active PS${activeCount === 1 ? "" : "s"}, rounded up to the next ₱50,000.`;
    if (!(target > 0)) {
      return `<section class="panel personal-target-card"><div class="panel-heading"><div><h2>My sales vs personal target</h2><p>${escapeHTML(subtitle)}</p></div></div><div class="empty-state">No branch target is set for this period yet.</div><div class="target-note">${escapeHTML(formula)}</div></section>`;
    }
    const remaining = Math.max(target - actual, 0);
    const label = `${completion.toFixed(1)}% achieved`;
    return `<section class="panel personal-target-card"><div class="panel-heading"><div><h2>My sales vs personal target</h2><p>${escapeHTML(subtitle)}</p></div></div><div class="personal-target-visual"><svg class="personal-target-pie" viewBox="-1.03 -1.03 2.06 2.06" role="img" aria-label="${escapeHTML(`Personal target progress: ${money(actual)} sales of ${money(target)}, ${label}.`)}"><circle r="0.96" fill="#e9edf3"></circle>${slice}</svg><div class="personal-target-details"><strong>${label}</strong><div class="personal-target-legend"><div><i class="actual"></i><span>Your sales</span><strong>${money(actual)}</strong></div><div><i class="remaining"></i><span>Remaining</span><strong>${money(remaining)}</strong></div></div><p>Personal target: ${money(target)}</p></div></div><div class="target-note">${escapeHTML(formula)}</div></section>`;
  }

  function chartPanel(sales, branchList, targetAmount) {
    if (targetAmount === undefined) {
      targetAmount = branchList.reduce((total, name) => total + (state.branches.find(branch => branch.name === name)?.target || 0), 0);
    }
    const { start, end, monthStart, monthEnd } = chartWeekBounds(state.month, state.chartWeek || today);
    const dayCount = Math.round((end - start) / 86400000) + 1;
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
    const weekSales = state.sales.filter(sale => branchList.includes(sale.branch) && (state.role !== "ps" || sale.owner === currentUser().id));
    const firstOfMonth = new Date(`${state.month}-01T12:00:00`);
    const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();
    const byDay = days.map(date => {
      const iso = isoDate(date);
      const actual = salesTotal(weekSales.filter(sale => sale.date === iso));
      return { date, actual, target: targetAmount / daysInMonth };
    });
    const weekTotal = byDay.reduce((total, item) => total + item.actual, 0);
    const maximum = Math.max(1, targetAmount / daysInMonth, ...byDay.map(item => item.actual));
    const labelScale = money(maximum);
    const bars = byDay.map(item => {
      const dayLabel = item.date.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
      return `<div class="chart-column"><div class="chart-bar current" tabindex="0" role="img" data-tooltip="${dayLabel}: ${money(item.actual)} sales" title="${dayLabel}: ${money(item.actual)} sales" aria-label="${dayLabel}: ${money(item.actual)} sales" style="height:${Math.max(item.actual ? 3 : 0, item.actual / maximum * 100)}%"></div><div class="chart-bar target" tabindex="0" role="img" data-tooltip="${dayLabel}: ${money(item.target)} target" title="${dayLabel}: ${money(item.target)} target" aria-label="${dayLabel}: ${money(item.target)} target" style="height:${item.target / maximum * 100}%"></div><span class="chart-day">${item.date.toLocaleDateString("en", { weekday: "short" })}</span></div>`;
    }).join("");
    const weekLabel = `${start.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`;
    const startValue = isoDate(start);
    return `<section class="panel"><div class="panel-heading"><div><h2>Sales activity</h2><p>Daily sales compared with daily target · ${escapeHTML(branchList.join(", "))}</p></div><span class="badge badge-blue">${escapeHTML(weekLabel)}</span></div><div class="chart-summary"><strong>${money(weekTotal)}</strong><span>WEEK TOTAL</span></div><div class="chart-caption">Each day shows paired sales and target bars. Hover over or press a bar to see its amount.</div><div class="chart-wrap"><div class="chart-grid"><span><small>${labelScale}</small></span><span></span><span><small>₱0.00</small></span></div><div class="chart-bars">${bars}</div></div><div class="chart-legend"><span class="legend-item"><i class="legend-dot current"></i>Daily sales</span><span class="legend-item"><i class="legend-dot target"></i>Daily target</span></div><div class="chart-week-control"><button class="button button-outline" id="chart-week-prev" type="button" aria-label="Previous week" ${start <= monthStart ? "disabled" : ""}>‹</button><label for="chart-week-picker">Choose week <input class="period-select" id="chart-week-picker" type="date" min="${isoDate(monthStart)}" max="${isoDate(monthEnd)}" value="${startValue}" aria-label="Choose a date in the current month"></label><button class="button button-outline" id="chart-week-next" type="button" aria-label="Next week" ${end >= monthEnd ? "disabled" : ""}>›</button></div></section>`;
  }

  function rankingRows(sales, branchName, selectedUserId = null, anonymous = true) {
    const ranked = state.users.filter(user => user.role === "ps" && user.branch === branchName && user.active).map(user => ({
      user,
      total: salesTotal(sales.filter(sale => sale.owner === user.id && sale.branch === branchName)),
    })).sort((a, b) => b.total - a.total);
    return ranked.map((item, index) => {
      const own = item.user.id === selectedUserId;
      const visibleName = anonymous && !own ? `PS ${String.fromCharCode(65 + index)}` : item.user.name;
      const visibleTotal = anonymous && !own ? "••••••" : money(item.total);
      return `<tr class="${own ? "own-row" : ""}"><td><span class="rank-pill">${index + 1}</span></td><td><div class="person-cell"><span class="tiny-avatar">${anonymous && !own ? "PS" : item.user.initials}</span><strong>${escapeHTML(visibleName)}${own ? " <span class='badge badge-blue'>YOU</span>" : ""}</strong></div></td><td><strong>${visibleTotal}</strong></td><td><span class="positive">${psTarget(branchName) ? (item.total / psTarget(branchName) * 100).toFixed(1) : "0.0"}%</span></td><td>${index === 0 ? '<span class="badge badge-green"><i class="badge-dot"></i>Leading</span>' : '<span class="badge badge-gray">On track</span>'}</td></tr>`;
    }).join("");
  }

  function salesRows(sales, ownerId = null, canEdit = false, namesVisible = true) {
    const sorted = [...sales].sort((a, b) => b.date.localeCompare(a.date));
    if (!sorted.length) return `<tr><td colspan="7"><div class="empty-state">No sales found for this period.</div></td></tr>`;
    return sorted.map(sale => {
      const owner = state.users.find(item => item.id === sale.owner);
      const productSummary = sale.lines.map(line => lineName(line)).join(", ");
      const isEditable = typeof canEdit === "function" ? canEdit(sale) : canEdit && sale.owner === ownerId;
      return `<tr><td><strong>${escapeHTML(sale.invoice)}</strong>${sale.editedAt ? '<div class="muted-subtext">Edited</div>' : ""}</td><td>${escapeHTML(sale.customer)}</td><td title="${escapeHTML(productSummary)}">${escapeHTML(sale.lines.length > 1 ? `${lineName(sale.lines[0])} +${sale.lines.length - 1} more` : productSummary)}</td><td>${namesVisible ? escapeHTML(owner?.name || "Former PS") : "PS"}</td><td>${escapeHTML(sale.branch)}</td><td>${new Date(`${sale.date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</td><td><strong>${money(sumSale(sale))}</strong>${isEditable ? `<div class="user-actions"><button class="mini-button edit-sale" data-sale="${escapeHTML(sale.id)}">Edit</button></div>` : ""}</td></tr>`;
    }).join("");
  }

  function pageSlice(items, page, pageSize) {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(1, page), pageCount);
    return { rows: items.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageCount };
  }

  function bindPageButtons(container, onPage) {
    const controls = $(container);
    if (!controls) return;
    $$(".mini-button[data-page]", controls).forEach(button => button.addEventListener("click", () => onPage(Number(button.dataset.page))));
  }

  function filteredSales(sales, searchTerm = "", date = "") {
    const term = searchTerm.trim().toLocaleLowerCase();
    return sales.filter(sale => {
      if (date && sale.date !== date) return false;
      const products = sale.lines.map(line => lineName(line)).join(" ");
      return !term || `${sale.invoice} ${sale.customer} ${userName(sale.owner)} ${sale.branch} ${products}`.toLocaleLowerCase().includes(term);
    });
  }

  function enhanceRankedTable(title, items, renderRow, pageSize = 5) {
    const headingNode = $$("#page-content .section-row h2").find(node => node.textContent === title);
    const tableSection = headingNode?.closest(".section-row")?.nextElementSibling;
    const tbody = $("tbody", tableSection);
    if (!tbody) return;
    const paginationId = `pagination-${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const paint = page => {
      const sliced = pageSlice(items, page, pageSize);
      rankedTablePages[title] = sliced.page;
      tbody.innerHTML = sliced.rows.length ? sliced.rows.map((item, index) => renderRow(item, (sliced.page - 1) * pageSize + index)).join("") : `<tr><td colspan="${$("thead tr", tableSection).children.length}"><div class="empty-state">No records found.</div></td></tr>`;
      let controls = $(`#${paginationId}`);
      if (!controls) {
        tableSection.insertAdjacentHTML("afterend", paginationControls(paginationId, sliced.page, sliced.pageCount, items.length));
        controls = $(`#${paginationId}`);
      } else controls.outerHTML = paginationControls(paginationId, sliced.page, sliced.pageCount, items.length);
      bindPageButtons(`#${paginationId}`, paint);
    };
    paint(rankedTablePages[title] || 1);
  }

  function enhanceSalesTable(title, sourceSales, options = {}) {
    const headingNode = $$("#page-content .section-row h2").find(node => node.textContent === title);
    const tableSection = headingNode?.closest(".section-row")?.nextElementSibling;
    const tbody = $("tbody", tableSection);
    if (!tbody) return;
    const searchId = options.searchId || "table-search";
    const dateId = options.dateId || "daily-sales-date";
    const controlsId = options.controlsId || "sales-table-pagination";
    if (options.dateFilter && !dailySalesDate.startsWith(`${state.month}-`)) dailySalesDate = `${state.month}-01`;
    const filterMarkup = `${options.dateFilter ? `<label class="date-search">Day <input class="period-select" id="${dateId}" type="date" min="${escapeHTML(`${state.month}-01`)}" max="${escapeHTML(`${state.month}-${String(new Date(Number(state.month.slice(0, 4)), Number(state.month.slice(5, 7)), 0).getDate()).padStart(2, "0")}`)}" value="${escapeHTML(dailySalesDate)}"></label>` : ""}<input class="search-field" id="${searchId}" placeholder="Search invoice, customer, product, PS, or branch" aria-label="Search sales log">`;
    headingNode.closest(".section-row").insertAdjacentHTML("beforeend", filterMarkup);
    const paint = (page = 1) => {
      const term = $(`#${searchId}`).value;
      const date = options.dateFilter ? $(`#${dateId}`).value : "";
      const filtered = filteredSales(sourceSales, term, date);
      salesLogPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
      const sliced = pageSlice(filtered, salesLogPage, 10);
      tbody.innerHTML = salesRows(sliced.rows, null, options.canEdit || false, true);
      let controls = $(`#${controlsId}`);
      if (!controls) {
        tableSection.insertAdjacentHTML("afterend", paginationControls(controlsId, sliced.page, sliced.pageCount, filtered.length));
        controls = $(`#${controlsId}`);
      } else controls.outerHTML = paginationControls(controlsId, sliced.page, sliced.pageCount, filtered.length);
      bindPageButtons(`#${controlsId}`, paint);
    };
    $(`#${searchId}`).addEventListener("input", () => paint(1));
    if (options.dateFilter) $(`#${dateId}`).addEventListener("change", event => {
      dailySalesDate = event.target.value;
      paint(1);
    });
    paint(1);
  }

  function ownTargetRows(userId, branchName, sales) {
    const ownSales = sales.filter(sale => sale.owner === userId);
    const amount = salesTotal(ownSales);
    const personal = psTarget(branchName);
    const branch = state.branches.find(item => item.name === branchName);
    const branchSales = salesInBranches(sales).filter(sale => sale.branch === branchName);
    const branchActual = salesTotal(branchSales);
    const user = state.users.find(item => item.id === userId);
    const brand = user?.brand;
    const brandTarget = brand ? state.brandTargets.find(item => item.branch === branchName && item.brand === brand) : null;
    const brandActual = brand ? branchSales.reduce((total, sale) => total + sale.lines.filter(line => product(line.barcode)?.brand === brand).reduce((sum, line) => sum + line.price * line.quantity, 0), 0) : 0;
    return {
      personal: { label: "Your personal target", actual: amount, target: personal, percent: percentage(amount, personal) },
      branch: { label: "Branch target · shared", actual: branchActual, target: branch?.target || 0, percent: percentage(branchActual, branch?.target || 0), tone: "green" },
      brand: brand ? { label: `${brand} target · branch-wide`, actual: brandActual, target: brandTarget?.target || 0, percent: percentage(brandActual, brandTarget?.target || 0), tone: "green" } : null,
    };
  }

  function renderPS() {
    const user = currentUser();
    const sales = salesForMonth();
    const ownSales = sales.filter(sale => sale.owner === user.id);
    const amount = salesTotal(ownSales);
    const target = psTarget(user.branch);
    const ranking = rankForUser(user.id, user.branch, sales);
    const targets = ownTargetRows(user.id, user.branch, sales);
    const totalTeam = salesTotal(sales.filter(sale => sale.branch === user.branch));
    const share = totalTeam ? amount / totalTeam * 100 : 0;
    const monthSales = ownSales;
    const action = `<button class="button button-primary" id="new-sale"><span>＋</span> <span class="button-long">Record a sale</span><span class="button-short">Sale</span></button>`;
    $("#breadcrumb-current").textContent = "My performance";
    $("#breadcrumb-current").dataset.page = "overview";
    const branchTarget = state.branches.find(branch => branch.name === user.branch)?.target || 0;
    const activeCount = activePSCount(user.branch);
    $("#page-content").innerHTML = `${heading("Your sales, in view.", "A clear picture of your month so far.", action)}${periodBar()}<div class="metric-grid">${metricCard("Your MTD sales", money(amount, true), "↗", `${ownSales.length} invoice${ownSales.length === 1 ? "" : "s"} recorded`, "trend-up")}${metricCard("Personal target", money(target, true), "◎", `${percentage(amount, target).toFixed(1)}% achieved`, "trend-neutral")}${metricCard("Team ranking", `#${ranking.rank || "–"} <span style="font-size:12px;color:var(--muted);font-weight:500">/ ${ranking.count}</span>`, "♙", "Compared with your branch", "trend-neutral")}${metricCard("Share of team sales", `${share.toFixed(1)}%`, "◉", `Branch MTD · ${money(totalTeam, true)}`, "trend-neutral")}</div><div class="content-grid">${personalTargetChart(amount, target, monthLabel(), branchTarget, activeCount)}${targetPanel("Branch and brand progress", "Shared goals across your branch.", [targets.branch, ...(targets.brand ? [targets.brand] : [])], `Brand progress includes all sales of ${escapeHTML(user.brand || "your assigned brand")} across your branch.`)}</div>${chartPanel(monthSales, [user.branch], target)}<div class="section-row"><h2>Your recent sales</h2><a class="text-link nav-shortcut" href="#sales" data-page="sales">View all sales →</a></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Products</th><th>Branch</th><th>Date</th><th>Amount</th></tr></thead><tbody>${ownSales.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map(sale => `<tr><td><strong>${escapeHTML(sale.invoice)}</strong>${sale.editedAt ? '<div class="muted-subtext">Edited</div>' : ""}</td><td>${escapeHTML(sale.customer)}</td><td>${escapeHTML(sale.lines.length > 1 ? `${lineName(sale.lines[0])} +${sale.lines.length - 1} more` : lineName(sale.lines[0]))}</td><td>${escapeHTML(sale.branch)}</td><td>${new Date(`${sale.date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</td><td><strong>${money(sumSale(sale))}</strong><div class="user-actions"><button class="mini-button edit-sale" data-sale="${escapeHTML(sale.id)}">Edit</button></div></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">Your sales will appear here.</div></td></tr>`}</tbody></table></div></section>`;
    bindCommon();
    $("#new-sale").addEventListener("click", () => openSaleModal());
    $$(".edit-sale").forEach(button => button.addEventListener("click", () => openSaleModal(button.dataset.sale)));
  }

  function managerTargetRows(branchName, sales) {
    const branch = state.branches.find(item => item.name === branchName);
    const branchSales = sales.filter(sale => sale.branch === branchName);
    const brandRows = state.brandTargets.filter(target => target.branch === branchName).map(target => {
      const actual = branchSales.reduce((total, sale) => total + sale.lines.filter(line => product(line.barcode)?.brand === target.brand).reduce((sum, line) => sum + line.price * line.quantity, 0), 0);
      return { label: target.brand, actual, target: target.target, percent: percentage(actual, target.target), tone: "green" };
    });
    return [{ label: "Branch target", actual: salesTotal(branchSales), target: branch.target, percent: percentage(salesTotal(branchSales), branch.target) }, ...brandRows];
  }

  function renderManager(page = "overview") {
    const branchName = currentBranch();
    const branchSales = salesForMonth().filter(sale => sale.branch === branchName);
    const amount = salesTotal(branchSales);
    const psUsers = state.users.filter(user => user.role === "ps" && user.branch === branchName && user.active);
    const top = psUsers.map(user => ({ user, total: salesTotal(branchSales.filter(sale => sale.owner === user.id)) })).sort((a, b) => b.total - a.total)[0];
    const branch = state.branches.find(item => item.name === branchName);
    const allowedPages = ["overview", "sales", "targets", "products"];
    if (!allowedPages.includes(page)) page = "overview";
    $("#breadcrumb-current").dataset.page = page;
    if (page === "targets") {
      renderTargetsTable([branchName], salesForMonth(), false, true);
      return;
    }
    if (page === "products") {
      renderProductsCatalog(false);
      return;
    }

    if (page === "overview") {
      $("#breadcrumb-current").textContent = "Branch overview";
      $("#page-content").innerHTML = `${heading("Branch overview", "Monitor team performance and target progress.")}${periodBar()}<div class="metric-grid">${metricCard("Branch MTD sales", money(amount, true), "↗", `${branchSales.length} invoices this month`, "trend-up")}${metricCard("Branch target", money(branch?.target || 0, true), "◎", `${percentage(amount, branch?.target || 0).toFixed(1)}% achieved`, "trend-neutral")}${metricCard("Active PSs", String(psUsers.length), "♙", `Personal target · ${money(psTarget(branchName), true)} each`, "trend-neutral")}${metricCard("Leading specialist", top ? money(top.total, true) : "—", "★", top?.user.name || "No sales yet", "trend-up")}</div><div class="content-grid">${chartPanel(branchSales, [branchName], branch?.target || 0)}${targetPanel("Target progress", "Branch and brand performance", managerTargetRows(branchName, salesForMonth()))}</div><div class="section-row"><h2>Product Specialist performance</h2><span class="badge badge-gray">MANAGER VIEW · ${escapeHTML(branchName.toUpperCase())}</span></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Product specialist</th><th>MTD sales</th><th>Personal target</th><th>Achievement</th><th>Invoices</th></tr></thead><tbody>${psUsers.map(user => ({ user, total: salesTotal(branchSales.filter(sale => sale.owner === user.id)), invoices: branchSales.filter(sale => sale.owner === user.id).length })).sort((a, b) => b.total - a.total).map((item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><div class="person-cell"><span class="tiny-avatar">${item.user.initials}</span><strong>${escapeHTML(item.user.name)}</strong></div></td><td><strong>${money(item.total)}</strong></td><td>${money(psTarget(branchName))}</td><td><span class="positive">${(item.total / Math.max(1, psTarget(branchName)) * 100).toFixed(1)}%</span></td><td>${item.invoices}</td></tr>`).join("")}</tbody></table></div></section>`;
    } else if (page === "sales") {
      $("#breadcrumb-current").textContent = "Sales log";
      $("#page-content").innerHTML = `${heading("Branch sales log", "Review transactions recorded by your branch team.")}${periodBar()}<div class="catalog-stats"><div class="catalog-stat"><span>Transactions</span><strong>${branchSales.length}</strong></div><div class="catalog-stat"><span>Branch sales total</span><strong>${money(amount, true)}</strong></div><div class="catalog-stat"><span>Branch</span><strong>${escapeHTML(branchName)}</strong></div></div><div class="section-row"><h2>Branch transactions</h2><span class="badge badge-gray">MANAGER VIEW</span></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Products</th><th>PS</th><th>Branch</th><th>Date</th><th>Amount</th></tr></thead><tbody id="sales-table-body">${salesRows(branchSales, null, false, true)}</tbody></table></div></section>`;
    } else if (page === "targets") {
      $("#breadcrumb-current").textContent = "Targets";
      const branchBrands = state.brandTargets.map((item, index) => ({ ...item, index })).filter(item => item.branch === branchName);
      $("#page-content").innerHTML = `${heading("Branch targets", "Manage this branch's monthly goals.")}${periodBar()}<div class="page-note"><strong>Personal target:</strong> The branch target is divided by ${activePSCount(branchName)} active PSs and rounded up to the next ₱50,000. Each PS's personal target is calculated automatically.</div><div class="section-row"><h2>Branch target</h2><span class="badge badge-blue">${monthLabel()}</span></div><div class="target-list"><article class="target-editor" data-branch="${escapeHTML(branchName)}"><div class="target-editor-head"><div><h3>${escapeHTML(branchName)}</h3><p>${activePSCount(branchName)} active PSs · calculated per-PS goal ${money(psTarget(branchName), true)}</p></div><span class="badge badge-gray">YOUR BRANCH</span></div><label class="field"><span>Monthly branch target (₱)</span><input class="branch-target-input" type="number" min="0" step="100000" value="${branch?.target || 0}"></label></article></div><div class="section-row"><h2>Brand targets</h2><button class="button button-subtle" id="add-brand-target">＋ Add brand target</button></div><div class="target-list">${branchBrands.map(item => `<article class="target-editor" data-index="${item.index}"><div class="target-editor-head"><div><h3>${escapeHTML(item.brand)}</h3><p>${escapeHTML(branchName)} · all branch sales of this brand</p></div><button class="mini-button danger remove-brand-target" data-index="${item.index}">Remove</button></div><div class="form-grid" style="margin-top:15px"><label class="field"><span>Branch</span><select class="brand-target-branch" disabled><option value="${escapeHTML(branchName)}">${escapeHTML(branchName)}</option></select></label><label class="field"><span>Brand</span><input class="brand-target-name" value="${escapeHTML(item.brand)}"></label><label class="field"><span>Monthly target (₱)</span><input class="brand-target-value" type="number" min="0" step="10000" value="${item.target}"></label></div></article>`).join("") || '<div class="empty-state">No brand targets for this branch yet.</div>'}</div><div class="form-footer" style="justify-content:end;border:0"><button class="button button-primary" id="save-targets">Save target changes <span>→</span></button></div>`;
    } else {
      $("#breadcrumb-current").textContent = "Products";
      $("#page-content").innerHTML = `${heading("Product catalog", "Maintain barcode lookups used by your branch.", `<div class="filter-row"><button class="button button-outline" id="import-products">Import CSV</button><input id="product-file" type="file" accept=".csv,text/csv" hidden><button class="button button-primary" id="add-product">＋ Add product</button></div>`)}<div class="catalog-stats"><div class="catalog-stat"><span>Catalog products</span><strong>${state.products.length}</strong></div><div class="catalog-stat"><span>Brands</span><strong>${new Set(state.products.map(item => item.brand)).size}</strong></div><div class="catalog-stat"><span>Import format</span><strong>CSV</strong></div></div><div class="section-row"><h2>All products</h2><input class="search-field" id="product-search" placeholder="Search barcode or model" aria-label="Search products"></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Barcode</th><th>Model description</th><th>Brand</th><th>Actions</th></tr></thead><tbody id="product-table-body">${productRows()}</tbody></table></div></section><div class="page-note"><strong>CSV columns:</strong> barcode, model, brand.</div>`;
    }

    bindCommon();
    if (page === "overview") {
      const rankings = psUsers.map(user => ({ user, total: salesTotal(branchSales.filter(sale => sale.owner === user.id)), invoices: branchSales.filter(sale => sale.owner === user.id).length })).sort((a, b) => b.total - a.total);
      enhanceRankedTable("Product Specialist performance", rankings, (item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><div class="person-cell"><span class="tiny-avatar">${escapeHTML(item.user.initials)}</span><strong>${escapeHTML(item.user.name)}</strong></div></td><td><strong>${money(item.total)}</strong></td><td>${money(psTarget(branchName))}</td><td><span class="positive">${(item.total / Math.max(1, psTarget(branchName)) * 100).toFixed(1)}%</span></td><td>${item.invoices}</td></tr>`);
    }
    if (page === "sales") {
      enhanceSalesTable("Branch transactions", branchSales, { dateFilter: true, searchId: "branch-sales-search", dateId: "branch-sales-date", controlsId: "branch-sales-pagination", canEdit: sale => managerCanEditSale(sale) });
      bindManagerSalesEdits();
    }
    if (page === "targets") bindTargetsPage();
    if (page === "products") bindProductsPage();
  }

  function branchFilter() {
    const selected = state.branchFilter === "all"
      ? []
      : Array.isArray(state.branchFilter) ? state.branchFilter : [state.branchFilter];
    const label = !selected.length ? "All branches" : selected.length === 1 ? selected[0] : `${selected.length} branches selected`;
    const available = state.role === "district_manager"
      ? state.branches.filter(branch => branch.district === currentUser()?.district)
      : state.branches;
    return `<details class="branch-multiselect" id="branch-filter"><summary>${escapeHTML(label)}</summary><div class="branch-options"><label><input type="checkbox" value="all" ${!selected.length ? "checked" : ""}> All branches</label>${available.map(branch => `<label><input type="checkbox" value="${escapeHTML(branch.name)}" ${selected.includes(branch.name) ? "checked" : ""}> ${escapeHTML(branch.name)}</label>`).join("")}</div></details>`;
  }

  function brandTargetTable(targets, sales) {
    const page = pageSlice(targets, brandTargetPage, 10);
    brandTargetPage = page.page;
    const pageItems = page.rows;
    const rows = pageItems.map(item => {
      const actual = sales.reduce((total, sale) => total + (sale.branch === item.branch
        ? sale.lines.filter(line => product(line.barcode)?.brand === item.brand).reduce((sum, line) => sum + line.price * line.quantity, 0)
        : 0), 0);
      return `<tr><td>${escapeHTML(item.branch)}</td><td><strong>${escapeHTML(item.brand)}</strong></td><td>${money(actual)}</td><td>${money(item.target)}</td><td><span class="positive">${percentage(actual, item.target).toFixed(1)}%</span></td><td><button class="mini-button edit-brand-target" data-index="${item.index}">Edit</button></td></tr>`;
    }).join("") || `<tr><td colspan="6"><div class="empty-state">No brand targets yet. Use Add brand target to create one.</div></td></tr>`;
    return `<section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Branch</th><th>Brand</th><th>MTD sales</th><th>Monthly target</th><th>Achievement</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></section>${paginationControls("brand-target-pagination", brandTargetPage, page.pageCount, targets.length)}`;
  }

  function paginationControls(id, page, pageCount, total) {
    if (pageCount <= 1) return `<div class="pagination-note" id="${id}">${total} total</div>`;
    return `<div class="pagination" id="${id}"><span>${total} total · Page ${page} of ${pageCount}</span><div><button class="mini-button" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="mini-button" data-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>Next</button></div></div>`;
  }

  function renderProductsCatalog(canImport) {
    $("#breadcrumb-current").textContent = "Products";
    const importAction = canImport ? `<button class="button button-outline" id="import-products">Import CSV</button><input id="product-file" type="file" accept=".csv,text/csv" hidden>` : "";
    $("#page-content").innerHTML = `${heading("Product catalog", "Maintain barcode, description, and brand lookups used when PSs enter a sale.", `<div class="filter-row">${importAction}<button class="button button-primary" id="add-product">＋ Add product</button></div>`)}<div class="catalog-stats"><div class="catalog-stat"><span>Catalog products</span><strong>${state.products.length}</strong></div><div class="catalog-stat"><span>Brands</span><strong>${new Set(state.products.map(item => item.brand)).size}</strong></div>${canImport ? '<div class="catalog-stat"><span>Bulk import</span><strong>Admin only</strong></div>' : ""}</div><div class="section-row"><h2>All products</h2><input class="search-field" id="product-search" placeholder="Search barcode or description" aria-label="Search products"></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Barcode</th><th>Description</th><th>Brand</th><th>Actions</th></tr></thead><tbody id="product-table-body"></tbody></table></div></section><div id="product-pagination"></div>${canImport ? '<div class="page-note"><strong>CSV columns:</strong> barcode, model, brand. Bulk product import is restricted to the administrator.</div>' : ""}`;
    bindCommon();
    bindProductsPage(canImport);
  }

  function updateProductsTable(items = state.products) {
    const pageCount = Math.max(1, Math.ceil(items.length / 10));
    productPage = Math.min(productPage, pageCount);
    $("#product-table-body").innerHTML = productRows(items, productPage);
    $("#product-pagination").innerHTML = paginationControls("product-page-controls", productPage, pageCount, items.length);
    bindProductActions();
    const controls = $("#product-page-controls");
    if (controls) $$(".mini-button[data-page]", controls).forEach(button => button.addEventListener("click", () => {
      productPage = Number(button.dataset.page);
      updateProductsTable(items);
    }));
  }

  function branchTargetTable(branches) {
    const branchTargets = state.branches.filter(branch => branches.includes(branch.name)).sort((a, b) => a.name.localeCompare(b.name));
    const page = pageSlice(branchTargets, branchTargetPage, 10);
    branchTargetPage = page.page;
    const rows = page.rows.map(branch => `<tr data-branch="${escapeHTML(branch.name)}"><td><strong>${escapeHTML(branch.name)}</strong></td><td>${activePSCount(branch.name)}</td><td>${money(psTarget(branch.name))}</td><td><input class="branch-target-input" type="number" min="0" step="0.01" aria-label="Monthly store target for ${escapeHTML(branch.name)}" value="${escapeHTML(String(branchTargetDrafts[branch.name] ?? branch.target))}"></td></tr>`).join("") || '<tr><td colspan="4"><div class="empty-state">No branches found.</div></td></tr>';
    return `<section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Branch</th><th>Active PSs</th><th>Calculated PS target</th><th>Monthly store target (₱)</th></tr></thead><tbody id="branch-target-table-body">${rows}</tbody></table></div></section>${paginationControls("branch-target-pagination", branchTargetPage, page.pageCount, branchTargets.length)}`;
  }

  function renderTargetsTable(branches, sales, districtView = false, branchManagerView = false) {
    $("#breadcrumb-current").textContent = "Targets";
    const targetItems = state.brandTargets.map((item, index) => ({ ...item, index }))
      .filter(item => branches.includes(item.branch) && `${item.branch} ${item.brand}`.toLocaleLowerCase().includes(targetSearchTerm));
    branchTargetPage = Math.min(branchTargetPage, Math.max(1, Math.ceil(branches.length / 10)));
    const branchTargetMarkup = branchManagerView
      ? `<div class="target-list">${state.branches.filter(branch => branches.includes(branch.name)).map(branch => `<article class="target-editor" data-branch="${escapeHTML(branch.name)}"><div class="target-editor-head"><div><h3>${escapeHTML(branch.name)}</h3><p>${activePSCount(branch.name)} active PSs · per-PS goal ${money(psTarget(branch.name), true)}</p></div><span class="badge badge-gray">YOUR BRANCH</span></div><label class="field"><span>Monthly store target (₱)</span><input class="branch-target-input" type="number" min="0" step="0.01" value="${escapeHTML(String(branchTargetDrafts[branch.name] ?? branch.target))}"></label></article>`).join("")}</div>`
      : branchTargetTable(branches);
    $("#page-content").innerHTML = `${heading(districtView ? "District targets" : "Monthly targets", districtView ? "Set each store's monthly target across all branches." : "Monitor store target progress and manage brand targets.")}${periodBar()}<div class="page-note"><strong>PS target calculation:</strong> Each specialist's personal target is their branch target divided by the branch's active PS count, rounded up to the next ₱50,000.${districtView ? " District Managers can update the monthly store target for every branch below." : ""}</div><div class="section-row"><h2>Branch targets</h2><div class="section-actions">${state.role === "admin" ? '<button class="button button-subtle" id="add-branch">＋ Add branch</button>' : ""}<span class="badge badge-blue">${monthLabel()}</span></div></div>${branchTargetMarkup}<div class="section-row"><h2>Brand targets</h2><div class="filter-row"><input class="search-field" id="brand-target-search" placeholder="Search branch or brand" aria-label="Search brand targets" value="${escapeHTML(targetSearchTerm)}"><button class="button button-subtle" id="add-brand-target">＋ Add brand target</button></div></div>${brandTargetTable(targetItems, sales)}<div class="form-footer" style="justify-content:end;border:0"><button class="button button-primary" id="save-branch-targets">Save branch targets <span>→</span></button></div>`;
    bindCommon();
    $("#add-branch")?.addEventListener("click", openBranchModal);
    $$(".branch-target-input").forEach(input => input.addEventListener("input", () => {
      const row = input.closest("tr");
      const card = input.closest(".target-editor[data-branch]");
      const name = row?.dataset.branch || card?.dataset.branch;
      if (name) branchTargetDrafts[name] = input.value;
    }));
    if (!branchManagerView) bindPageButtons("#branch-target-pagination", page => {
      branchTargetPage = page;
      renderTargetsTable(branches, sales, districtView, branchManagerView);
    });
    $("#add-brand-target").addEventListener("click", () => openBrandTargetModal());
    $("#brand-target-search").addEventListener("input", event => {
      targetSearchTerm = event.target.value.trim().toLocaleLowerCase();
      brandTargetPage = 1;
      renderTargetsTable(branches, sales, districtView, branchManagerView);
      $("#brand-target-search").focus();
      $("#brand-target-search").setSelectionRange(targetSearchTerm.length, targetSearchTerm.length);
    });
    $$(".edit-brand-target").forEach(button => button.addEventListener("click", () => openBrandTargetModal(Number(button.dataset.index))));
    bindPageButtons("#brand-target-pagination", page => {
      brandTargetPage = page;
      renderTargetsTable(branches, sales, districtView, branchManagerView);
    });
    $("#save-branch-targets").addEventListener("click", () => {
      $$(".branch-target-input").forEach(input => {
        const row = input.closest("tr");
        const card = input.closest(".target-editor[data-branch]");
        const name = row?.dataset.branch || card?.dataset.branch;
        if (name) branchTargetDrafts[name] = input.value;
      });
      state.branches.filter(item => branches.includes(item.name)).forEach(branch => {
        const value = Number(branchTargetDrafts[branch.name] ?? branch.target);
        if (branch && Number.isFinite(value) && value >= 0) branch.target = value;
      });
      Object.keys(branchTargetDrafts).forEach(name => delete branchTargetDrafts[name]);
      saveState();
      render();
      showToast("Branch targets saved.");
    });
  }

  function openBrandTargetModal(index = null) {
    editingBrandTargetIndex = Number.isInteger(index) ? index : null;
    const form = $("#brand-target-form");
    const existing = editingBrandTargetIndex === null ? null : state.brandTargets[editingBrandTargetIndex];
    const availableBranches = state.role === "district_manager"
      ? state.branches.filter(branch => branch.district === currentUser()?.district)
      : state.branches;
    form.elements.branch.innerHTML = availableBranches.map(branch => `<option value="${escapeHTML(branch.name)}">${escapeHTML(branch.name)}</option>`).join("");
    if (state.role === "manager") form.elements.branch.value = currentBranch();
    form.elements.branch.disabled = state.role === "manager";
    form.elements.brand.value = existing?.brand || "";
    form.elements.target.value = existing ? existing.target : "";
    $("#brand-target-modal-title").textContent = existing ? "Edit brand target" : "Add brand target";
    $("#brand-target-modal-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeBrandTargetModal() {
    $("#brand-target-modal-backdrop").hidden = true;
    document.body.style.overflow = "";
    editingBrandTargetIndex = null;
  }

  function openBranchModal() {
    if (state.role !== "admin") {
      showToast("Only the administrator can add a branch.");
      return;
    }
    const form = $("#branch-form");
    form.reset();
    form.elements.target.value = "0";
    form.elements.district.innerHTML = districts().map(district => `<option value="${escapeHTML(district)}">${escapeHTML(district)}</option>`).join("");
    form.elements.district.value = currentUser()?.district || districts()[0] || defaultDistrict;
    $("#branch-modal-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    form.elements.name.focus();
  }

  function closeBranchModal() {
    $("#branch-modal-backdrop").hidden = true;
    document.body.style.overflow = "";
  }

  function bindProductModal() {
    const backdrop = $("#product-modal-backdrop");
    const form = $("#product-form");
    form.addEventListener("submit", event => {
      event.preventDefault();
      const record = {
        barcode: form.elements.barcode.value.trim(),
        model: form.elements.model.value.trim(),
        brand: form.elements.brand.value.trim(),
      };
      if (!record.barcode || !record.model || !record.brand) return;
      const duplicate = state.products.find(item => item.barcode === record.barcode && item.barcode !== editingProductBarcode);
      if (duplicate) {
        showToast("Barcode already exists.", "Use a unique barcode or edit the existing product.");
        return;
      }
      state.products = state.products.filter(item => item.barcode !== editingProductBarcode);
      state.products.push(record);
      state.history.push({ type: editingProductBarcode ? "product-edit" : "product-add", at: new Date().toISOString(), details: record });
      const changedBarcode = editingProductBarcode && editingProductBarcode !== record.barcode;
      backdrop.hidden = true;
      document.body.style.overflow = "";
      editingProductBarcode = null;
      saveState();
      render();
      showToast("Product saved.", changedBarcode ? "Existing sales retain their original barcode snapshot." : "");
    });
    $(".close-product-modal").addEventListener("click", closeProductModal);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) closeProductModal(); });
    $(".close-brand-target-modal").addEventListener("click", closeBrandTargetModal);
    $("#brand-target-modal-backdrop").addEventListener("click", event => { if (event.target.id === "brand-target-modal-backdrop") closeBrandTargetModal(); });
    $("#brand-target-form").addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const branch = form.elements.branch.value;
      const brand = form.elements.brand.value.trim();
      const target = Number(form.elements.target.value);
      if (!branch || !brand || !Number.isFinite(target) || target < 0) {
        showToast("Enter a branch, brand, and valid non-negative target.");
        return;
      }
      const duplicate = state.brandTargets.some((item, index) => index !== editingBrandTargetIndex && item.branch === branch && item.brand.toLocaleLowerCase() === brand.toLocaleLowerCase());
      if (duplicate) {
        showToast("A target for that brand and branch already exists.");
        return;
      }
      const record = { branch, brand, target };
      if (editingBrandTargetIndex === null) state.brandTargets.push(record);
      else state.brandTargets[editingBrandTargetIndex] = record;
      saveState();
      closeBrandTargetModal();
      render();
      showToast("Brand target saved.");
    });
    const branchBackdrop = $("#branch-modal-backdrop");
    $("#branch-form").addEventListener("submit", event => {
      event.preventDefault();
      if (state.role !== "admin") {
        showToast("Only the administrator can add a branch.");
        closeBranchModal();
        return;
      }
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const target = Number(form.elements.target.value);
      if (!name || !Number.isFinite(target) || target < 0) {
        showToast("Enter a branch name and a valid non-negative monthly target.");
        return;
      }
      if (state.branches.some(branch => branch.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        showToast("That branch already exists.");
        return;
      }
      const district = form.elements.district.value;
      if (!districts().includes(district)) {
        showToast("Choose a district from the existing district list.");
        return;
      }
      state.branches.push({ name, district, target });
      state.history.push({ type: "branch-add", at: new Date().toISOString(), branch: name });
      saveState();
      closeBranchModal();
      render();
      showToast("Branch added.", `District Managers assigned to ${district} now have access to it.`);
    });
    $(".close-branch-modal").addEventListener("click", closeBranchModal);
    branchBackdrop.addEventListener("click", event => { if (event.target === branchBackdrop) closeBranchModal(); });
  }

  function closeProductModal() {
    $("#product-modal-backdrop").hidden = true;
    document.body.style.overflow = "";
    editingProductBarcode = null;
  }

  function renderAdmin(page = $("#breadcrumb-current").dataset.page || "overview", districtView = false) {
    const branches = selectedBranches();
    const sales = salesInBranches();
    const amount = salesTotal(sales);
    const target = state.branches.filter(branch => branches.includes(branch.name)).reduce((sum, branch) => sum + branch.target, 0);
    const visibleBranches = new Set(branches);
    const activeUsers = state.users.filter(user => user.active && (
      state.role === "admin"
      || visibleBranches.has(user.branch)
      || (user.role === "district_manager" && user.district === currentUser()?.district)
    ));
    if (page === "targets") {
      const targetBranches = branches;
      const targetSales = state.sales.filter(sale => targetBranches.includes(sale.branch));
      renderTargetsTable(targetBranches, targetSales, districtView);
      return;
    }
    if (page === "products") {
      renderProductsCatalog(state.role === "admin");
      return;
    }
    if (page === "overview") {
      $("#breadcrumb-current").textContent = "All branches";
      const districtBranchCount = state.branches.filter(branch => !districtView || branch.district === currentUser()?.district).length;
      $("#page-content").innerHTML = `${heading(districtView ? "District performance at a glance." : "All branches, at a glance.", "Compare store and brand performance across your dealer network.", `<div class="filter-row">${branchFilter()}</div>`)}${periodBar()}<div class="metric-grid">${metricCard("Combined MTD sales", money(amount, true), "↗", `${sales.length} invoices across ${branches.length} branch${branches.length === 1 ? "" : "es"}`, "trend-up")}${metricCard("Combined target", money(target, true), "◎", `${percentage(amount, target).toFixed(1)}% achieved`, "trend-neutral")}${metricCard("Active branches", String(branches.length), "▦", `${districtBranchCount} total branches`, "trend-neutral")}${metricCard("Active users", String(activeUsers.length), "♙", `${state.users.filter(user => user.role === "ps" && user.active && visibleBranches.has(user.branch)).length} Product Specialists`, "trend-neutral")}</div><div class="branch-grid">${state.branches.filter(branch => branches.includes(branch.name)).map(branch => { const branchAmount = salesTotal(sales.filter(sale => sale.branch === branch.name)); return `<article class="branch-card"><div class="branch-card-top"><div><h3>${escapeHTML(branch.name)}</h3><small>${state.users.filter(user => user.role === "ps" && user.branch === branch.name && user.active).length} active Product Specialists</small></div><span class="badge badge-blue">${percentage(branchAmount, branch.target).toFixed(0)}%</span></div><div class="branch-value">${money(branchAmount, true)} <span>of ${money(branch.target, true)}</span></div><div class="progress-track"><div class="progress-value" style="width:${percentage(branchAmount, branch.target)}%"></div></div><div class="branch-progress-text"><span>Month-to-date</span><strong>${money(branch.target - branchAmount, true)} to target</strong></div></article>`; }).join("")}</div><div class="content-grid">${chartPanel(sales, branches, target)}${targetPanel("Target performance", `Store and brand performance across ${branches.length === 1 ? escapeHTML(branches[0]) : "selected branches"}`, brandRowsForBranches(branches, sales))}</div><div class="section-row"><h2>Sales across selected branches</h2><a href="#sales" class="text-link nav-shortcut" data-page="sales">View sales log →</a></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Products</th><th>Product specialist</th><th>Branch</th><th>Date</th><th>Amount</th></tr></thead><tbody>${salesRows(sales, null, false, true)}</tbody></table></div></section>`;
    } else if (page === "sales") {
      $("#breadcrumb-current").textContent = "Sales log";
      $("#page-content").innerHTML = `${heading("Sales log", "Browse recorded transactions across your branches.", `<div class="filter-row">${branchFilter()}</div>`)}${periodBar()}<div class="catalog-stats"><div class="catalog-stat"><span>Transactions</span><strong>${sales.length}</strong></div><div class="catalog-stat"><span>Sales total</span><strong>${money(amount, true)}</strong></div><div class="catalog-stat"><span>Branches</span><strong>${branches.length}</strong></div></div><div class="section-row"><h2>All transactions</h2></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Products</th><th>PS</th><th>Branch</th><th>Date</th><th>Amount</th></tr></thead><tbody id="sales-table-body">${salesRows(sales, null, false, true)}</tbody></table></div></section>`;
    } else if (page === "targets") {
      $("#breadcrumb-current").textContent = "Targets";
      $("#page-content").innerHTML = `${heading("Monthly targets", "Set branch and brand goals for each location.")}${periodBar()}<div class="page-note"><strong>PS target calculation:</strong> Each specialist's personal target is their branch target divided by the branch's active PS count, rounded up to the next ₱50,000. This value is calculated automatically.</div><div class="section-row"><h2>Branch targets</h2><span class="badge badge-blue">${monthLabel()}</span></div><div class="target-list">${state.branches.map(branch => `<article class="target-editor" data-branch="${escapeHTML(branch.name)}"><div class="target-editor-head"><div><h3>${escapeHTML(branch.name)}</h3><p>${activePSCount(branch.name)} active PSs · calculated per-PS goal ${money(psTarget(branch.name), true)}</p></div><span class="badge badge-gray">BRANCH</span></div><label class="field"><span>Monthly branch target (₱)</span><input class="branch-target-input" type="number" min="0" step="100000" value="${branch.target}"></label></article>`).join("")}</div><div class="section-row"><h2>Brand targets</h2><button class="button button-subtle" id="add-brand-target">＋ Add brand target</button></div><div class="target-list">${state.brandTargets.map((item, index) => `<article class="target-editor" data-index="${index}"><div class="target-editor-head"><div><h3>${escapeHTML(item.brand)}</h3><p>${escapeHTML(item.branch)} · all PS sales of this brand</p></div><button class="mini-button danger remove-brand-target" data-index="${index}">Remove</button></div><div class="form-grid" style="margin-top:15px"><label class="field"><span>Branch</span><select class="brand-target-branch">${state.branches.map(branch => `<option value="${escapeHTML(branch.name)}" ${branch.name === item.branch ? "selected" : ""}>${escapeHTML(branch.name)}</option>`).join("")}</select></label><label class="field"><span>Brand</span><input class="brand-target-name" value="${escapeHTML(item.brand)}"></label><label class="field"><span>Monthly target (₱)</span><input class="brand-target-value" type="number" min="0" step="10000" value="${item.target}"></label></div></article>`).join("")}</div><div class="form-footer" style="justify-content:end;border:0"><button class="button button-primary" id="save-targets">Save target changes <span>→</span></button></div>`;
    } else if (page === "products") {
      $("#breadcrumb-current").textContent = "Products";
      $("#page-content").innerHTML = `${heading("Product catalog", "Manage barcode lookups used when PSs enter a sale.", `<div class="filter-row"><button class="button button-outline" id="import-products">Import CSV</button><input id="product-file" type="file" accept=".csv,text/csv" hidden><button class="button button-primary" id="add-product">＋ Add product</button></div>`)}<div class="catalog-stats"><div class="catalog-stat"><span>Catalog products</span><strong>${state.products.length}</strong></div><div class="catalog-stat"><span>Brands</span><strong>${new Set(state.products.map(item => item.brand)).size}</strong></div><div class="catalog-stat"><span>Import format</span><strong>CSV</strong></div></div><div class="section-row"><h2>All products</h2><input class="search-field" id="product-search" placeholder="Search barcode or model" aria-label="Search products"></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Barcode</th><th>Model description</th><th>Brand</th><th>Actions</th></tr></thead><tbody id="product-table-body">${productRows()}</tbody></table></div></section><div class="page-note"><strong>CSV columns:</strong> barcode, model, brand. Importing a barcode that already exists updates its model and brand; new barcodes are added.</div>`;
    } else if (page === "users") {
      $("#breadcrumb-current").textContent = "People & access";
      $("#page-content").innerHTML = `${heading("People & access", "Manage accounts and branch assignments.", `<button class="button button-primary" id="add-user">＋ Add user</button>`)}<div class="catalog-stats"><div class="catalog-stat"><span>Active accounts</span><strong>${activeUsers.length}</strong></div><div class="catalog-stat"><span>Branch managers</span><strong>${state.users.filter(user => user.role === "manager" && user.active).length}</strong></div><div class="catalog-stat"><span>District managers</span><strong>${state.users.filter(user => user.role === "district_manager" && user.active).length}</strong></div><div class="catalog-stat"><span>Product Specialists</span><strong>${state.users.filter(user => user.role === "ps" && user.active).length}</strong></div></div><div class="section-row"><h2>All accounts</h2><div class="filter-row"><label class="account-filter-label" for="account-branch-filter">Branch</label><select class="filter-select" id="account-branch-filter" aria-label="Filter accounts by branch"><option value="all">All branches</option>${state.branches.map(branch => `<option value="${escapeHTML(branch.name)}">${escapeHTML(branch.name)}</option>`).join("")}</select><span class="badge badge-gray">ADMIN ONLY</span></div></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>District / branch</th><th>Status</th><th>Actions</th></tr></thead><tbody id="accounts-table-body"></tbody></table></div></section><div id="accounts-pagination"></div><section class="panel workspace-control"><div><span class="eyebrow">DEALER WORKSPACE</span><h2>${state.appEnabled ? "Staff access is enabled" : "Staff access is paused"}</h2><p>Pause access when retiring this workspace. Historical sample data stays in place.</p></div><button class="button ${state.appEnabled ? "button-outline" : "button-primary"}" id="toggle-workspace">${state.appEnabled ? "Pause staff access" : "Re-enable staff access"}</button></section><div class="page-note"><strong>Prototype note:</strong> Account and workspace controls affect this browser's sample data only. No real accounts or access permissions are created.</div>`;
    }
    bindCommon();
    bindAdminPage(page);
    if (page === "overview") enhanceSalesTable("Sales across selected branches", sales, { searchId: "overview-sales-search", controlsId: "overview-sales-pagination" });
    if (page === "sales") enhanceSalesTable("All transactions", sales, { dateFilter: true, searchId: "admin-sales-search", dateId: "admin-sales-date", controlsId: "admin-sales-pagination" });
  }

  function brandRowsForBranches(branches, sales) {
    const brands = [...new Set(state.brandTargets.filter(item => branches.includes(item.branch)).map(item => item.brand))];
    const branchTarget = branches.reduce((total, name) => total + (state.branches.find(branch => branch.name === name)?.target || 0), 0);
    const rows = [{
      label: "Store target",
      actual: salesTotal(sales),
      target: branchTarget,
      percent: percentage(salesTotal(sales), branchTarget),
    }];
    return rows.concat(brands.map(brand => {
      const targets = state.brandTargets.filter(item => item.brand === brand && branches.includes(item.branch));
      const actual = sales.reduce((total, sale) => total + sale.lines.filter(line => product(line.barcode)?.brand === brand).reduce((sum, line) => sum + line.price * line.quantity, 0), 0);
      const targetValue = targets.reduce((total, item) => total + item.target, 0);
      return { label: brand, actual, target: targetValue, percent: percentage(actual, targetValue), tone: "green" };
    }));
  }

  function appendManagementPanels() {
    const branches = state.role === "manager" ? [currentBranch()] : selectedBranches();
    const branchTarget = branches.reduce((total, name) => total + (state.branches.find(branch => branch.name === name)?.target || 0), 0);
    const monthlySales = state.sales.filter(sale => sale.date.slice(0, 7) === state.month && branches.includes(sale.branch));
    const brands = [...new Set(state.products.map(item => item.brand))].map(brand => {
      const amount = monthlySales.reduce((total, sale) => total + sale.lines.filter(line => product(line.barcode)?.brand === brand).reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0), 0);
      return { brand, amount, percent: percentage(amount, branchTarget) };
    }).sort((a, b) => b.amount - a.amount || a.brand.localeCompare(b.brand));
    const brandRows = brands.map((item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><strong>${escapeHTML(item.brand)}</strong></td><td><strong>${money(item.amount)}</strong></td><td>${item.percent.toFixed(2)}%</td></tr>`).join("") || '<tr><td colspan="4"><div class="empty-state">No brand sales found for this period.</div></td></tr>';
    const year = Number(state.month.slice(0, 4));
    const monthCount = Number(state.month.slice(5, 7));
    const ytdSales = state.sales.filter(sale => Number(sale.date.slice(0, 4)) === year && Number(sale.date.slice(5, 7)) <= monthCount && branches.includes(sale.branch));
    const ytdAmount = salesTotal(ytdSales);
    const ytdTarget = branchTarget * monthCount;
    const ytdBrands = [...new Set(state.products.map(item => item.brand))].map(brand => {
      const amount = ytdSales.reduce((total, sale) => total + sale.lines.filter(line => product(line.barcode)?.brand === brand).reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0), 0);
      return { brand, amount, percent: percentage(amount, ytdTarget) };
    }).sort((a, b) => b.amount - a.amount || a.brand.localeCompare(b.brand));
    const monthlyRows = Array.from({ length: monthCount }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const amount = salesTotal(ytdSales.filter(sale => sale.date.slice(0, 7) === month));
      return `<tr><td>${new Date(`${month}-01T12:00:00`).toLocaleDateString("en", { month: "long" })}</td><td>${money(amount)}</td><td>${money(branchTarget)}</td><td>${percentage(amount, branchTarget).toFixed(1)}%</td></tr>`;
    }).join("");
    $("#page-content").insertAdjacentHTML("beforeend", `<div class="section-row"><h2>Brand performance leaderboard</h2><span class="badge badge-blue">${escapeHTML(monthLabel().toUpperCase())}</span></div><section class="panel table-panel"><div class="panel-heading"><div><h2>Brand sales against store target</h2><p>${escapeHTML(branches.length === 1 ? branches[0] : `${branches.length} selected branches`)} · percentage is each brand's sales divided by the combined store target</p></div></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Brand</th><th>Sales amount</th><th>% of store target</th></tr></thead><tbody>${brandRows}</tbody></table></div></section><div class="section-row"><h2>Year-to-date sales monitoring</h2><span class="badge badge-gray">${year} · JAN–${new Date(`${state.month}-01T12:00:00`).toLocaleDateString("en", { month: "short" }).toUpperCase()}</span></div><div class="metric-grid three-column">${metricCard("YTD sales", money(ytdAmount, true), "↗", `${ytdSales.length} invoices recorded`, "trend-up")}${metricCard("YTD target", money(ytdTarget, true), "◎", `${monthCount} months included`, "trend-neutral")}${metricCard("YTD achievement", `${percentage(ytdAmount, ytdTarget).toFixed(1)}%`, "◉", `${escapeHTML(branches.length === 1 ? branches[0] : "Selected branches")}`, "trend-neutral")}</div><div class="section-row"><h2>YTD brand performance</h2><span class="badge badge-gray">${year} · vs. YTD store target</span></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Brand</th><th>YTD sales amount</th><th>% of YTD store target</th></tr></thead><tbody>${ytdBrands.map((item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><strong>${escapeHTML(item.brand)}</strong></td><td><strong>${money(item.amount)}</strong></td><td>${item.percent.toFixed(2)}%</td></tr>`).join("")}</tbody></table></div></section><section class="panel table-panel"><div class="panel-heading"><div><h2>Monthly performance</h2><p>Monthly actual sales compared with the current monthly store target.</p></div></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>Sales amount</th><th>Store target</th><th>Achievement</th></tr></thead><tbody>${monthlyRows}</tbody><tfoot><tr><th>Year to date</th><th>${money(ytdAmount)}</th><th>${money(ytdTarget)}</th><th>${percentage(ytdAmount, ytdTarget).toFixed(1)}%</th></tr></tfoot></table></div><div class="page-note">YTD targets use the current monthly branch targets for each month shown; this prototype does not keep historical target changes.</div></section>`);
    enhanceRankedTable("Brand performance leaderboard", brands, (item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><strong>${escapeHTML(item.brand)}</strong></td><td><strong>${money(item.amount)}</strong></td><td>${item.percent.toFixed(2)}%</td></tr>`);
    enhanceRankedTable("YTD brand performance", ytdBrands, (item, index) => `<tr><td><span class="rank-pill">${index + 1}</span></td><td><strong>${escapeHTML(item.brand)}</strong></td><td><strong>${money(item.amount)}</strong></td><td>${item.percent.toFixed(2)}%</td></tr>`);
  }

  function productRows(items = state.products, page = 1) {
    const pageItems = items.slice((page - 1) * 10, page * 10);
    return pageItems.map(item => `<tr><td><strong>${escapeHTML(item.barcode)}</strong></td><td>${escapeHTML(item.model)}</td><td><span class="badge badge-gray">${escapeHTML(item.brand)}</span></td><td><div class="user-actions"><button class="mini-button edit-product" data-barcode="${escapeHTML(item.barcode)}">Edit</button><button class="mini-button danger delete-product" data-barcode="${escapeHTML(item.barcode)}">Delete</button></div></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty-state">No products found.</div></td></tr>`;
  }

  function bindCommon() {
    $$(".nav-link,.nav-shortcut").forEach(link => link.addEventListener("click", event => {
      event.preventDefault();
      $("#sidebar").classList.remove("open");
      const page = link.dataset.page;
      $("#breadcrumb-current").dataset.page = page;
      window.history.replaceState(null, "", `#${page}`);
      if (state.role === "ps") {
        if (page === "sales") renderPSSales();
        else if (page === "ranking") renderPSRanking();
        else renderPS();
      } else render();
    }));
    const month = $("#month-select");
    if (month) month.addEventListener("change", () => { state.month = month.value || currentMonth; saveState(); render(); });
    const weekPicker = $("#chart-week-picker");
    if (weekPicker) weekPicker.addEventListener("change", () => {
      if (!weekPicker.value) return;
      state.chartWeek = weekPicker.value;
      saveState();
      render();
    });
    $("#chart-week-prev")?.addEventListener("click", () => shiftChartWeek(-1));
    $("#chart-week-next")?.addEventListener("click", () => shiftChartWeek(1));
  }

  function renderPSSales() {
    const user = currentUser();
    const ownSales = salesForMonth().filter(sale => sale.owner === user.id);
    $("#breadcrumb-current").textContent = "My sales";
    $("#breadcrumb-current").dataset.page = "sales";
    $("#page-content").innerHTML = `${heading("Your sales log", "Review and correct sales you recorded.", `<button class="button button-primary" id="new-sale">＋ <span class="button-long">Record a sale</span><span class="button-short">Sale</span></button>`)}${periodBar()}<div class="catalog-stats"><div class="catalog-stat"><span>Invoices</span><strong>${ownSales.length}</strong></div><div class="catalog-stat"><span>Sales total</span><strong>${money(salesTotal(ownSales), true)}</strong></div><div class="catalog-stat"><span>Last entry</span><strong>${ownSales.length ? new Date(`${ownSales[0].date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}</strong></div></div><div class="page-note"><strong>Edit policy:</strong> You can edit your own entries. Changes are recorded in the edit history. Managers can review branch records but cannot change your entries in this prototype.</div><div class="section-row"><h2>Recorded transactions</h2><span class="badge badge-gray">YOUR ENTRIES ONLY</span></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Products</th><th>Branch</th><th>Date</th><th>Amount</th></tr></thead><tbody>${ownSales.length ? ownSales.map(sale => `<tr><td><strong>${escapeHTML(sale.invoice)}</strong>${sale.editedAt ? '<div class="muted-subtext">Edited</div>' : ""}</td><td>${escapeHTML(sale.customer)}</td><td>${escapeHTML(sale.lines.length > 1 ? `${lineName(sale.lines[0])} +${sale.lines.length - 1} more` : lineName(sale.lines[0]))}</td><td>${escapeHTML(sale.branch)}</td><td>${new Date(`${sale.date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</td><td><strong>${money(sumSale(sale))}</strong><div class="user-actions"><button class="mini-button edit-sale" data-sale="${escapeHTML(sale.id)}">Edit</button></div></td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">No sales recorded for this month yet.</div></td></tr>`}</tbody></table></div></section>`;
    bindCommon();
    $("#new-sale").addEventListener("click", () => openSaleModal());
    $$(".edit-sale").forEach(button => button.addEventListener("click", () => openSaleModal(button.dataset.sale)));
  }

  function renderPSRanking() {
    const user = currentUser();
    const sales = salesForMonth();
    const rank = rankForUser(user.id, user.branch, sales);
    $("#breadcrumb-current").textContent = "Team ranking";
    $("#breadcrumb-current").dataset.page = "ranking";
    $("#page-content").innerHTML = `${heading("Your team ranking", "See where you stand in your branch this month.")}${periodBar()}<div class="metric-grid">${metricCard("Your position", `#${rank.rank} <span style="font-size:12px;color:var(--muted);font-weight:500">/ ${rank.count}</span>`, "♙", user.branch, "trend-neutral")}${metricCard("Your MTD sales", money(salesTotal(sales.filter(sale => sale.owner === user.id)), true), "↗", `${sales.filter(sale => sale.owner === user.id).length} invoices`, "trend-up")}${metricCard("Team MTD sales", money(salesTotal(sales.filter(sale => sale.branch === user.branch)), true), "◉", user.branch, "trend-neutral")}${metricCard("Your team share", `${(salesTotal(sales.filter(sale => sale.owner === user.id)) / Math.max(1, salesTotal(sales.filter(sale => sale.branch === user.branch))) * 100).toFixed(1)}%`, "◎", "Share of branch sales", "trend-neutral")}</div><div class="section-row"><h2>Branch leaderboard</h2><span class="badge badge-blue">ANONYMOUS VIEW</span></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Specialist</th><th>MTD sales</th><th>Target progress</th><th>Status</th></tr></thead><tbody>${rankingRows(sales, user.branch, user.id, true)}</tbody></table></div></section><div class="ranking-note"><span>ⓘ</span> Other specialists' identities and exact sales are private. Your own details remain visible to you.</div>`;
    bindCommon();
    const ranked = state.users.filter(item => item.role === "ps" && item.branch === user.branch && item.active)
      .map(person => ({ user: person, total: salesTotal(sales.filter(sale => sale.owner === person.id && sale.branch === user.branch)) }))
      .sort((a, b) => b.total - a.total);
    enhanceRankedTable("Branch leaderboard", ranked, (item, index) => {
      const own = item.user.id === user.id;
      const visibleName = own ? item.user.name : `PS ${String.fromCharCode(65 + index)}`;
      const visibleTotal = own ? money(item.total) : "••••••";
      return `<tr class="${own ? "own-row" : ""}"><td><span class="rank-pill">${index + 1}</span></td><td><div class="person-cell"><span class="tiny-avatar">${own ? escapeHTML(item.user.initials) : "PS"}</span><strong>${escapeHTML(visibleName)}${own ? " <span class='badge badge-blue'>YOU</span>" : ""}</strong></div></td><td><strong>${visibleTotal}</strong></td><td><span class="positive">${psTarget(user.branch) ? (item.total / psTarget(user.branch) * 100).toFixed(1) : "0.0"}%</span></td><td>${index === 0 ? '<span class="badge badge-green"><i class="badge-dot"></i>Leading</span>' : '<span class="badge badge-gray">On track</span>'}</td></tr>`;
    });
  }

  function openSaleModal(saleId = null) {
    const user = currentUser();
    const existing = saleId ? state.sales.find(sale => sale.id === saleId) : null;
    const canEditExisting = existing && (state.role === "manager"
      ? managerCanEditSale(existing, user)
      : existing.owner === user?.id);
    if (saleId && !canEditExisting) {
      showToast(state.role === "manager" ? "This sale is view-only for your assignment period." : "You can only edit a sale you recorded.");
      return;
    }
    editingSaleId = existing?.id || null;
    $("#modal-title").textContent = existing ? "Correct sale entry" : "Record a sale";
    $("#modal-eyebrow").textContent = existing ? state.role === "manager" ? "BRANCH SALE CORRECTION" : "CORRECT YOUR ENTRY" : "SALES ENTRY";
    $("#sale-form-note").textContent = existing ? `Changes are recorded in edit history · ${user?.name || "Manager"}` : "Sales are attributed to your account";
    const form = $("#sale-form");
    form.elements.customer.value = existing?.customer || "";
    form.elements.invoice.value = existing?.invoice || "";
    form.elements.date.value = existing?.date || today;
    $("#sale-lines").innerHTML = "";
    (existing?.lines || [{ barcode: "", price: "", quantity: 1 }]).forEach(line => addSaleLine(line));
    $("#modal-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    $("#sale-lines input[name='barcode']").focus();
  }

  function bindManagerSalesEdits() {
    $$(".edit-sale").forEach(button => button.addEventListener("click", () => openSaleModal(button.dataset.sale)));
  }

  function closeSaleModal() {
    $("#modal-backdrop").hidden = true;
    document.body.style.overflow = "";
    editingSaleId = null;
  }

  function addSaleLine(line = { barcode: "", price: "", quantity: 1 }) {
    const wrapper = document.createElement("div");
    wrapper.className = "sale-line";
    wrapper.innerHTML = `<label class="field"><span>Barcode</span><input name="barcode" inputmode="numeric" value="${escapeHTML(line.barcode)}" placeholder="Scan or type" required></label><label class="field"><span>Model description</span><input name="model" value="${escapeHTML(product(line.barcode)?.model || "")}" placeholder="Auto-filled from catalog" readonly></label><label class="field"><span>Selling price</span><input name="price" type="number" min="0" step="0.01" value="${line.price === "" ? "" : Number(line.price)}" placeholder="₱ 0.00" required></label><label class="field"><span>Qty</span><input name="quantity" type="number" min="1" step="1" value="${Number(line.quantity) || 1}" required></label><button type="button" class="remove-line" aria-label="Remove product line">×</button><div class="line-total"></div>`;
    const barcodeInput = $("[name='barcode']", wrapper);
    const modelInput = $("[name='model']", wrapper);
    const priceInput = $("[name='price']", wrapper);
    const quantityInput = $("[name='quantity']", wrapper);
    const totalNode = $(".line-total", wrapper);
    priceInput.type = "text";
    priceInput.inputMode = "decimal";
    priceInput.value = formatCurrencyInput(priceInput.value);
    const updateLine = () => {
      const found = product(barcodeInput.value.trim());
      modelInput.value = found?.model || (barcodeInput.value.trim() ? "Barcode not found in catalog" : "");
      const price = parseCurrency(priceInput.value);
      totalNode.textContent = price !== null && quantityInput.value ? `Line total ${money(price * Number(quantityInput.value))}` : "";
    };
    barcodeInput.addEventListener("input", updateLine);
    priceInput.addEventListener("input", updateLine);
    priceInput.addEventListener("blur", () => { priceInput.value = formatCurrencyInput(priceInput.value); });
    quantityInput.addEventListener("input", updateLine);
    $(".remove-line", wrapper).addEventListener("click", () => {
      if ($$(".sale-line").length > 1) wrapper.remove();
      else showToast("A sale needs at least one product line.");
    });
    $("#sale-lines").append(wrapper);
    updateLine();
  }

  function showToast(message, detail = "") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `${escapeHTML(message)}${detail ? `<small>${escapeHTML(detail)}</small>` : ""}`;
    $("#toast-region").append(toast);
    window.setTimeout(() => toast.remove(), 3900);
  }

  function bindAdminPage(page) {
    const branchMenu = $("#branch-filter");
    if (branchMenu) {
      $$(".branch-options input", branchMenu).forEach(input => input.addEventListener("change", () => {
        if (input.value === "all" && input.checked) state.branchFilter = "all";
        else {
          const selected = $$(".branch-options input:not([value='all']):checked", branchMenu).map(item => item.value);
          state.branchFilter = selected.length ? selected : "all";
        }
        saveState();
        render();
        const refreshedBranchMenu = $("#branch-filter");
        if (refreshedBranchMenu) refreshedBranchMenu.open = true;
      }));
      const selected = state.branchFilter === "all"
        ? []
        : Array.isArray(state.branchFilter) ? state.branchFilter : [state.branchFilter];
      $$(".branch-options input", branchMenu).forEach(input => {
        input.checked = input.value === "all" ? !selected.length : selected.includes(input.value);
      });
    }
    if (page === "sales") {
      return;
    }
    if (page === "products") bindProductsPage();
    if (page === "targets") bindTargetsPage();
    if (page === "users") bindUsersPage();
  }

  function bindProductsPage(canImport) {
    const search = $("#product-search");
    search.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase();
      productPage = 1;
      updateProductsTable(state.products.filter(item => `${item.barcode} ${item.model} ${item.brand}`.toLocaleLowerCase().includes(term)));
    });
    $("#add-product").addEventListener("click", () => editProduct());
    if (canImport) {
      $("#import-products").addEventListener("click", () => $("#product-file").click());
      $("#product-file").addEventListener("change", importProducts);
    }
    updateProductsTable();
  }

  function bindProductActions() {
    $$(".edit-product").forEach(button => button.addEventListener("click", () => editProduct(button.dataset.barcode)));
    $$(".delete-product").forEach(button => button.addEventListener("click", () => {
      const item = product(button.dataset.barcode);
      if (!item || !window.confirm(`Remove ${item.model} from the catalog? Existing sale entries will be kept.`)) return;
      state.products = state.products.filter(productItem => productItem.barcode !== item.barcode);
      saveState(); render();
      showToast("Product removed from catalog.");
    }));
  }

  function editProduct(barcode = null) {
    const existing = barcode ? product(barcode) : null;
    editingProductBarcode = existing?.barcode || null;
    const form = $("#product-form");
    form.elements.barcode.value = existing?.barcode || "";
    form.elements.model.value = existing?.model || "";
    form.elements.brand.value = existing?.brand || "";
    $("#product-modal-title").textContent = existing ? "Edit product" : "Add product";
    $("#product-modal-note").textContent = existing ? "Update the product catalog details." : "Add a product lookup for sales entry.";
    $("#product-modal-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    form.elements.barcode.focus();
  }

  async function importProducts(event) {
    if (state.role !== "admin") {
      showToast("Product import is restricted to the administrator.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("The CSV needs a header and at least one product row.");
      const headers = rows[0].map(value => value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase());
      const required = ["barcode", "model", "brand"];
      if (required.some(header => !headers.includes(header))) throw new Error("CSV headers must include barcode, model, and brand.");
      const indexes = Object.fromEntries(required.map(header => [header, headers.indexOf(header)]));
      const imported = rows.slice(1).filter(row => row.some(value => value.trim())).map(row => ({
        barcode: (row[indexes.barcode] || "").trim(),
        model: (row[indexes.model] || "").trim(),
        brand: (row[indexes.brand] || "").trim(),
      }));
      if (imported.some(item => !item.barcode || !item.model || !item.brand)) throw new Error("Every product row must include a barcode, model, and brand.");
      for (const item of imported) {
        state.products = state.products.filter(existing => existing.barcode !== item.barcode);
        state.products.push(item);
      }
      state.history.push({ type: "product-import", at: new Date().toISOString(), count: imported.length });
      saveState(); render();
      showToast(`${imported.length} product${imported.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      console.error("Product import failed.", error);
      showToast("Import failed", error.message);
    } finally {
      event.target.value = "";
    }
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(value); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = "";
      } else value += char;
    }
    if (quoted) throw new Error("The CSV contains an unmatched quote.");
    if (value.length || row.length) { row.push(value); rows.push(row); }
    return rows;
  }

  function bindTargetsPage() {
    $("#add-brand-target").addEventListener("click", () => {
      const brand = window.prompt("Brand name:");
      if (!brand?.trim()) return;
      const availableBranches = state.role === "district_manager"
        ? state.branches.filter(item => item.district === currentUser()?.district)
        : state.branches;
      const branch = state.role === "manager"
        ? currentBranch()
        : window.prompt(`Branch name (${availableBranches.map(item => item.name).join(", ")}):`, availableBranches[0]?.name);
      if (!branch || !availableBranches.some(item => item.name === branch)) { showToast("Choose a branch from your available branch list."); return; }
      if (state.brandTargets.some(item => item.brand.toLocaleLowerCase() === brand.trim().toLocaleLowerCase() && item.branch === branch)) { showToast("A target for that brand and branch already exists."); return; }
      state.brandTargets.push({ brand: brand.trim(), branch, target: 0 });
      saveState(); render();
      showToast("Brand target added.", "Enter a monthly amount, then save.");
    });
    $$(".remove-brand-target").forEach(button => button.addEventListener("click", () => {
      state.brandTargets.splice(Number(button.dataset.index), 1);
      saveState(); render(); showToast("Brand target removed.");
    }));
    $("#save-targets").addEventListener("click", () => {
      $$(".target-editor[data-branch]").forEach(card => {
        const branch = state.branches.find(item => item.name === card.dataset.branch);
        const value = Number($(".branch-target-input", card).value);
        if (branch && Number.isFinite(value) && value >= 0) branch.target = value;
      });
      $$(".target-editor[data-index]").forEach(card => {
        const index = Number(card.dataset.index);
        const target = state.brandTargets[index];
        if (!target) return;
        const branchSelect = $(".brand-target-branch", card);
        const branch = branchSelect?.value || target.branch;
        if (state.role === "manager" && branch !== currentBranch()) return;
        target.branch = branch;
        target.brand = $(".brand-target-name", card).value.trim();
        target.target = Math.max(0, Number($(".brand-target-value", card).value) || 0);
      });
      saveState(); render();
      showToast("Targets saved.");
    });
  }

  function updateUsersTable(page = accountPage) {
    const priority = { admin: 0, district_manager: 1, manager: 2, ps: 3 };
    const branchUsers = state.users.filter(user => accountBranchFilter === "all"
      || !user.branch && user.role !== "ps"
      || user.branch === accountBranchFilter);
    const filtered = [...branchUsers].sort((a, b) => (priority[a.role] ?? 4) - (priority[b.role] ?? 4)
        || (a.role === "ps" && b.role === "ps" ? (a.branch || "").localeCompare(b.branch || "") : (a.branch || "").localeCompare(b.branch || ""))
        || a.name.localeCompare(b.name));
    const activeUsers = branchUsers.filter(user => user.active);
    const counts = $$(".catalog-stats .catalog-stat strong");
    [activeUsers.length, activeUsers.filter(user => user.role === "manager").length, activeUsers.filter(user => user.role === "district_manager").length, activeUsers.filter(user => user.role === "ps").length]
      .forEach((count, index) => { if (counts[index]) counts[index].textContent = String(count); });
    const pageData = pageSlice(filtered, page, 10);
    accountPage = pageData.page;
    const roleNames = { ps: "Product Specialist", manager: "Branch Manager", district_manager: "District Manager", admin: "Administrator" };
    const rows = pageData.rows.map(user => {
      const location = user.branch
        ? `${user.branch} · ${user.district || state.branches.find(branch => branch.name === user.branch)?.district || "District not set"}`
        : user.district || "All branches";
      return `<tr><td><div class="user-cell"><span class="tiny-avatar">${escapeHTML(user.initials)}</span><strong>${escapeHTML(user.name)}</strong></div>${assignmentHistoryMarkup(user)}</td><td>${roleNames[user.role] || "User"}</td><td>${escapeHTML(location)}</td><td><span class="badge ${user.active ? "badge-green" : "badge-gray"}"><i class="badge-dot"></i>${user.active ? "Active" : "Disabled"}</span></td><td><div class="user-actions"><button class="mini-button edit-user" data-user="${escapeHTML(user.id)}">Edit</button>${user.role !== "admin" ? `<button class="mini-button toggle-user" data-user="${escapeHTML(user.id)}">${user.active ? "Disable" : "Enable"}</button><button class="mini-button danger remove-user" data-user="${escapeHTML(user.id)}">Remove</button>` : "—"}</div></td></tr>`;
    }).join("") || '<tr><td colspan="5"><div class="empty-state">No accounts found for this branch.</div></td></tr>';
    $("#accounts-table-body").innerHTML = rows;
    $("#accounts-pagination").innerHTML = paginationControls("accounts-page-controls", accountPage, pageData.pageCount, filtered.length);
    bindPageButtons("#accounts-page-controls", nextPage => updateUsersTable(nextPage));
    bindUserActions();
  }

  function assignmentHistoryMarkup(user) {
    const assignments = (state.managerAssignments || []).filter(item => item.managerId === user.id)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    if (!assignments.length) return "";
    const dates = assignments.map(item => `<li><strong>${escapeHTML(item.branch)}</strong> · ${new Date(item.startedAt).toLocaleString()} – ${item.endedAt ? new Date(item.endedAt).toLocaleString() : "Current"}${item.assignedBy ? ` · assigned by ${escapeHTML(state.users.find(person => person.id === item.assignedBy)?.name || "Former Admin")}` : ""}</li>`).join("");
    return `<details class="assignment-history"><summary>Branch assignment history</summary><ul>${dates}</ul></details>`;
  }

  function bindUserActions() {
    $$(".edit-user").forEach(button => button.addEventListener("click", () => openAccountModal(button.dataset.user)));
    $$(".toggle-user").forEach(button => button.addEventListener("click", () => {
      const user = state.users.find(item => item.id === button.dataset.user);
      if (!user) return;
      setManagerActive(user, !user.active);
      saveState(); render(); showToast(`${user.name} ${user.active ? "enabled" : "disabled"}.`);
    }));
    $$(".remove-user").forEach(button => button.addEventListener("click", () => {
      const user = state.users.find(item => item.id === button.dataset.user);
      if (!user || !window.confirm(`Remove ${user.name}'s account? Historical sales will remain attributed to this account.`)) return;
      setManagerActive(user, false);
      user.removed = true;
      saveState(); render(); showToast("Account removed from the active roster.", "Historical sales are preserved.");
    }));
  }

  function openAccountModal(userId = null) {
    const user = userId ? state.users.find(item => item.id === userId) : null;
    if (userId && !user) return;
    const form = $("#account-form");
    form.reset();
    form.elements.userId.value = user?.id || "";
    form.elements.name.value = user?.name || "";
    form.elements.role.value = user?.role || "ps";
    form.elements.role.querySelector("option[value='admin']").disabled = !user;
    const availableBranches = state.role === "district_manager"
      ? state.branches.filter(branch => branch.district === currentUser()?.district)
      : state.branches;
    form.elements.brand.innerHTML = `<option value="">No assigned brand</option>${[...new Set(state.products.map(item => item.brand))].map(brand => `<option value="${escapeHTML(brand)}">${escapeHTML(brand)}</option>`).join("")}`;
    form.elements.district.innerHTML = districts().map(district => `<option value="${escapeHTML(district)}">${escapeHTML(district)}</option>`).join("");
    if (user?.district || user?.branch) {
      form.elements.district.value = user.district || state.branches.find(branch => branch.name === user.branch)?.district || defaultDistrict;
    } else if (districts().length) {
      form.elements.district.value = districts()[0];
    }
    populateAccountBranches(form.elements.district.value, user?.branch, availableBranches);
    if (user?.brand) form.elements.brand.value = user.brand;
    $("#account-modal-title").textContent = user ? `Edit ${user.name}` : "Add user";
    $("#account-form-note").textContent = user?.role === "manager"
      ? "A branch transfer takes effect when saved; branch records remain in place."
      : user?.role === "district_manager"
        ? "District access includes all branches assigned to the selected district."
        : "Choose a role to see its required account details.";
    updateAccountFields();
    $("#account-modal-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    form.elements.name.focus();
  }

  function updateAccountFields() {
    const role = $("#account-form").elements.role.value;
    $(".account-branch-field").hidden = !["ps", "manager"].includes(role);
    $(".account-district-field").hidden = !["ps", "manager", "district_manager"].includes(role);
    $(".account-brand-field").hidden = role !== "ps";
    $("#account-form").elements.brand.disabled = role !== "ps";
    if (role !== "ps") $("#account-form").elements.brand.value = "";
    else if (!$("#account-form").elements.brand.value) $("#account-form").elements.brand.value = $("#account-form").elements.brand.options[1]?.value || "";
    $("#account-form").elements.branch.required = ["ps", "manager"].includes(role);
    $("#account-form").elements.district.required = ["ps", "manager", "district_manager"].includes(role);
    $("#account-form").elements.brand.required = role === "ps";
  }

  function populateAccountBranches(district, selectedBranch = null, availableBranches = state.branches) {
    const branchSelect = $("#account-form").elements.branch;
    const branches = availableBranches.filter(branch => branch.district === district);
    branchSelect.innerHTML = branches.map(branch => `<option value="${escapeHTML(branch.name)}">${escapeHTML(branch.name)}</option>`).join("");
    if (selectedBranch && branches.some(branch => branch.name === selectedBranch)) branchSelect.value = selectedBranch;
  }

  function closeAccountModal() {
    $("#account-modal-backdrop").hidden = true;
    document.body.style.overflow = "";
  }

  $("#account-form").elements.role.addEventListener("change", () => {
    updateAccountFields();
    const selectedDistrict = $("#account-form").elements.district.value || districts()[0];
    if (selectedDistrict && !$("#account-form").elements.district.value) $("#account-form").elements.district.value = selectedDistrict;
    const managerBranches = state.role === "district_manager"
      ? state.branches.filter(branch => branch.district === currentUser()?.district)
      : state.branches;
    populateAccountBranches(selectedDistrict, null, managerBranches);
  });
  $("#account-form").elements.district.addEventListener("change", event => {
    const managerBranches = state.role === "district_manager"
      ? state.branches.filter(branch => branch.district === currentUser()?.district)
      : state.branches;
    populateAccountBranches(event.target.value, null, managerBranches);
  });
  $("#account-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    let user = state.users.find(item => item.id === form.elements.userId.value);
    const isNewUser = !user;
    const name = form.elements.name.value.trim();
    const role = form.elements.role.value;
    const branch = ["ps", "manager"].includes(role) ? form.elements.branch.value : null;
    const district = ["ps", "manager", "district_manager"].includes(role) ? form.elements.district.value : null;
    const brand = role === "ps" ? form.elements.brand.value : null;
    if (!name || !["ps", "manager", "district_manager", "admin"].includes(role)
      || (["ps", "manager"].includes(role) && !state.branches.some(item => item.name === branch))
      || (["ps", "manager", "district_manager"].includes(role) && !districts().includes(district))
      || (["ps", "manager"].includes(role) && state.branches.find(item => item.name === branch)?.district !== district)
      || (role === "ps" && !state.products.some(item => item.brand === brand))) {
      showToast("Check the account details.", "Choose a valid role and complete the fields required for it.");
      return;
    }
    if (user && user.id === currentUser()?.id && user.role === "admin" && role !== "admin") {
      showToast("You cannot remove your own administrator role.");
      return;
    }

    const oldRole = user?.role;
    const oldBranch = user?.branch;
    if (!user) {
      user = { id: `user-${Date.now()}`, active: true };
      state.users.push(user);
    }
    user.name = name;
    user.initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase();
    user.role = role;
    user.brand = brand;
    user.district = district;
    if (oldRole === "manager" && role !== "manager") {
      const endedAt = new Date().toISOString();
      (state.managerAssignments || []).filter(item => item.managerId === user.id && !item.endedAt)
        .forEach(item => { item.endedAt = endedAt; });
      state.managerBranches = (state.managerBranches || []).filter(item => item.managerId !== user.id);
      user.branch = null;
    } else if (role === "manager" && (oldRole !== "manager" || oldBranch !== branch)) {
      assignManagerToBranch(user, branch);
    } else {
      user.branch = branch;
    }
    saveState();
    closeAccountModal();
    render();
    showToast(isNewUser ? "Account added." : "Account updated.", "This prototype stores sample accounts in this browser only.");
  });
  $(".close-account-modal").addEventListener("click", closeAccountModal);
  $("#account-modal-backdrop").addEventListener("click", event => {
    if (event.target.id === "account-modal-backdrop") closeAccountModal();
  });

  function bindUsersPage() {
    const branchFilter = $("#account-branch-filter");
    branchFilter.value = accountBranchFilter;
    branchFilter.addEventListener("change", () => {
      accountBranchFilter = branchFilter.value;
      accountPage = 1;
      updateUsersTable();
    });
    updateUsersTable();
    $("#add-user").addEventListener("click", () => openAccountModal());
    $("#toggle-workspace").addEventListener("click", () => {
      const nextEnabled = !state.appEnabled;
      const confirmed = window.confirm(nextEnabled
        ? "Re-enable staff access to this prototype workspace?"
        : "Pause staff access to this prototype workspace?");
      if (!confirmed) return;
      state.appEnabled = nextEnabled;
      saveState();
      render();
      showToast(nextEnabled ? "Staff access re-enabled." : "Staff access paused.", "This control affects prototype views in this browser only.");
    });
  }

  $("#sale-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const customer = form.elements.customer.value.trim();
    const invoice = form.elements.invoice.value.trim();
    const date = form.elements.date.value;
    const lines = $$(".sale-line").map(line => ({
      barcode: $("[name='barcode']", line).value.trim(),
      price: parseCurrency($("[name='price']", line).value),
      quantity: Number($("[name='quantity']", line).value),
    }));
    if (!lines.length || lines.some(line => !line.barcode || !product(line.barcode) || !Number.isFinite(line.price) || line.price < 0 || !Number.isInteger(line.quantity) || line.quantity < 1)) {
      showToast("Check each product line.", "Choose a catalog barcode, enter a valid price, and use a whole-number quantity.");
      return;
    }
    const user = currentUser();
    const duplicate = state.sales.some(sale => sale.invoice.toLocaleLowerCase() === invoice.toLocaleLowerCase() && sale.id !== editingSaleId);
    if (duplicate) { showToast("Invoice number already exists.", "Use a unique invoice number for each sale."); return; }
    if (editingSaleId) {
      const sale = state.sales.find(item => item.id === editingSaleId);
      const canEditExisting = sale && (state.role === "manager"
        ? managerCanEditSale(sale, user)
        : sale.owner === user.id);
      if (!canEditExisting) {
        showToast(state.role === "manager" ? "This sale is view-only for your assignment period." : "You can only edit a sale you recorded.");
        return;
      }
      state.history.push({ type: "sale-edit", at: new Date().toISOString(), saleId: sale.id, before: JSON.parse(JSON.stringify(sale)), editor: user.id });
      sale.customer = customer;
      sale.invoice = invoice;
      sale.date = date;
      sale.lines = lines;
      sale.editedAt = new Date().toISOString();
      saveState(); closeSaleModal(); render();
      showToast("Sale entry updated.", "The previous values are kept in the edit history.");
    } else {
      const sale = { id: `sale-${Date.now()}`, owner: user.id, branch: user.branch, customer, invoice, date, createdAt: new Date().toISOString(), lines, editedAt: null };
      state.sales.unshift(sale);
      state.notifications.unshift({ text: `New sale recorded · ${invoice}`, time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), saleId: sale.id });
      saveState(); closeSaleModal(); render();
      showToast("Sale recorded.", "This prototype simulates a notification for you and your manager.");
    }
  });

  $("#role-select").addEventListener("change", event => setRole(event.target.value));
  bindProductModal();
  $("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  document.addEventListener("pointerdown", event => {
    const sidebar = $("#sidebar");
    if (sidebar.classList.contains("open") && !sidebar.contains(event.target) && !$("#mobile-menu").contains(event.target)) {
      sidebar.classList.remove("open");
    }
  });
  $("#notification-button").addEventListener("click", () => {
    const latest = state.notifications[0];
    showToast(latest?.text || "You're all caught up.", latest?.time || "No new notifications");
  });
  $("#profile-button").addEventListener("click", () => showToast("Signed in as preview user.", "Use “Preview as” to explore each interface."));
  $("#modal-backdrop").addEventListener("click", event => { if (event.target.id === "modal-backdrop") closeSaleModal(); });
  $(".close-modal").addEventListener("click", closeSaleModal);
  $("#add-line").addEventListener("click", () => addSaleLine());
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!$("#modal-backdrop").hidden) closeSaleModal();
    if (!$("#product-modal-backdrop").hidden) closeProductModal();
    if (!$("#brand-target-modal-backdrop").hidden) closeBrandTargetModal();
    if (!$("#branch-modal-backdrop").hidden) closeBranchModal();
  });

  function allowedPagesForRole(role) {
    return role === "ps"
      ? ["overview", "sales", "ranking"]
      : role === "manager"
        ? ["overview", "sales", "targets", "products"]
        : role === "district_manager"
          ? ["overview", "sales", "targets", "products"]
        : ["overview", "sales", "targets", "products", "users"];
  }

  window.addEventListener("hashchange", () => {
    const requested = window.location.hash.slice(1);
    const allowed = allowedPagesForRole(state.role);
    const page = allowed.includes(requested) ? requested : "overview";
    if (page !== requested) window.history.replaceState(null, "", `#${page}`);
    $("#breadcrumb-current").dataset.page = page;
    if (state.role === "ps" && page === "sales") renderPSSales();
    else if (state.role === "ps" && page === "ranking") renderPSRanking();
    else render();
    $("#sidebar").classList.remove("open");
  });

  const requestedPage = window.location.hash.slice(1);
  const initialPage = allowedPagesForRole(state.role).includes(requestedPage) ? requestedPage : "overview";
  if (requestedPage !== initialPage) window.history.replaceState(null, "", `#${initialPage}`);
  $("#breadcrumb-current").dataset.page = initialPage;
  render();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("Unable to register the offline app shell.", error);
      showToast("Offline app setup failed", "The prototype still works while this page is open.");
    });
  }
})();
