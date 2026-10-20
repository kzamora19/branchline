(function (root) {
  "use strict";
  const STATE_KEY = "branchline-demo-workspace-v1";
  const CATALOG_KEY = "branchline-demo-catalog-v1";
  const roles = ["ps", "manager", "district_manager", "admin"];
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => root.crypto.randomUUID();
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const now = () => new Date().toISOString();
  const norm = value => String(value || "").trim().toLowerCase();
  const testName = value => /^\s*test(?![a-z])/i.test(String(value || ""));
  const testProfile = person => testName(person.full_name) || testName(person.login_id);

  function catalogOnly(products) {
    const unique = new Map();
    for (const item of products) {
      const barcode = String(item.barcode || "").trim();
      const description = String(item.model_description || item.description || "").trim();
      const brand = String(item.brand || "").trim();
      if (!barcode || !description || !brand) throw new Error("Every demo product needs a barcode, description and brand.");
      const srp = item.srp == null || item.srp === "" ? null : Number(item.srp);
      if (srp !== null && (!Number.isFinite(srp) || srp < 0)) throw new Error("Demo product SRP must be non-negative.");
      unique.set(barcode, {
        barcode, model_description: description, brand,
        category: String(item.category || ""), sub_category: String(item.sub_category || ""), srp,
      });
    }
    return [...unique.values()];
  }

  function sampleCatalog() {
    return ["Tcl", "Lg", "Samsung", "Panasonic", "Midea", "Hanabishi"].flatMap((brand, index) => [
      { barcode: String(63000 + index * 10).padStart(8, "0"), brand, model_description: `${brand} demonstration television 43 inch`, category: "Television", sub_category: "Smart TV", srp: 22000 + index * 2000 },
      { barcode: String(63001 + index * 10).padStart(8, "0"), brand, model_description: `${brand} demonstration window aircon 1HP`, category: "Aircon", sub_category: "Window Type", srp: 18000 + index * 1000 },
    ]);
  }

  function seed(catalog) {
    const tables = Object.fromEntries([
      "branches", "districts", "profiles", "products", "monthly_targets", "brand_targets", "sales",
      "sale_lines", "sale_serials", "manager_branches", "payment_modes", "company_holidays",
      "ps_walkins", "branch_walkins", "push_messages", "push_alert_schedules",
      "payment_mode_targets", "sales_import_batches", "branch_daily_history", "sale_edit_history",
    ].map(key => [key, []]));
    const dealer = "demo-dealer";
    tables.districts = [{ id: "district-north", name: "North District" }, { id: "district-south", name: "South District" }];
    tables.branches = ["Santiago", "Cauayan", "Ilagan", "Tuguegarao"].map((name, i) => ({
      id: `branch-${i}`, name: `${name} (Demo)`, district_id: i < 2 ? "district-north" : "district-south",
    }));
    const brands = [...new Set(catalog.map(p => p.brand))];
    for (const [i, branch] of tables.branches.entries()) {
      brands.slice(0, 3).forEach((brand, j) => tables.profiles.push({
        id: `ps-${i}-${j}`, dealer_id: dealer, full_name: ["Maria Santos", "Paolo Reyes", "Ana Cruz"][j] + ` ${i + 1}`,
        role: "ps", branch_id: branch.id, district_id: branch.district_id, assigned_brand: brand,
        active: true, login_id: `demo_ps_${i}_${j}`, email: `ps-${i}-${j}@example.invalid`,
      }));
      tables.profiles.push({ id: `manager-${i}`, dealer_id: dealer, full_name: `Branch Manager ${i + 1}`, role: "manager",
        branch_id: branch.id, district_id: branch.district_id, active: true, login_id: `demo_bm_${i}`, email: `bm-${i}@example.invalid` });
      tables.manager_branches.push({ manager_id: `manager-${i}`, branch_id: branch.id });
    }
    tables.profiles.push(
      { id: "demo-dm", dealer_id: dealer, full_name: "District Manager", role: "district_manager", district_id: "district-north", branch_id: null, active: true },
      { id: "demo-admin", dealer_id: dealer, full_name: "Demo Administrator", role: "admin", branch_id: null, district_id: null, active: true },
    );
    tables.payment_modes = ["Cash", "Debit Card", "Credit Card", "Home Credit", "Online Payment / Bank Transfer"]
      .map((name, position) => ({ id: `mode-${position}`, name, position }));
    const today = new Date();
    for (const yearOffset of [-1, 0]) {
      for (let monthOffset = -2; monthOffset <= 0; monthOffset++) {
        const first = new Date(today.getFullYear() + yearOffset, today.getMonth() + monthOffset, 1);
        const month = iso(first).slice(0, 7);
        for (const [i, branch] of tables.branches.entries()) {
          tables.monthly_targets.push({ id: uid(), dealer_id: dealer, branch_id: branch.id, month: month + "-01", amount: 1200000 + i * 100000 });
          brands.slice(0, 3).forEach(brand => tables.brand_targets.push({ id: uid(), branch_id: branch.id, month: month + "-01", brand, amount: 400000 }));
          const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
          for (let day = 1; day <= days; day++) {
            const date = iso(new Date(first.getFullYear(), first.getMonth(), day));
            if (date > iso(today)) continue;
            tables.branch_walkins.push({ branch_id: branch.id, counted_on: date, visitors: 12 + (day + i) % 15 });
            for (let j = 0; j < 3; j++) {
              const person = tables.profiles.find(p => p.id === `ps-${i}-${j}`);
              if (!person) continue;
              tables.ps_walkins.push({ branch_id: branch.id, ps_id: person.id, counted_on: date, clients_assisted: 4 + (day + j) % 5 });
              if ((day + i + j) % 3 === 0) continue;
              const product = catalog[(day + j * 2) % catalog.length];
              const sale = { id: uid(), branch_id: branch.id, dealer_id: dealer, ps_id: person.id, ps_name: person.full_name,
                customer_name: ["Sample Customer One", "Sample Customer Two", "Walk-in Customer"][day % 3],
                invoice_number: `DEMO-${month}-${i}-${j}-${day}`, sold_on: date, payment_mode: tables.payment_modes[day % 5].name,
                city: "Santiago City, Isabela", barangay: "Baluarte", created_at: `${date}T04:00:00Z`, updated_at: `${date}T04:00:00Z` };
              tables.sales.push(sale);
              tables.sale_lines.push({ ...product, id: uid(), sale_id: sale.id, quantity: 1 + day % 2,
                selling_price: Math.round((product.srp || 15000) * (0.85 + j * 0.03)) });
            }
          }
        }
      }
    }
    tables.products = tables.branches.flatMap(branch => catalog.map(product => ({
      ...product, id: uid(), dealer_id: dealer, branch_id: branch.id, active: true,
    })));
    tables.push_alert_schedules = ["10:00", "13:00", "16:00"].map(send_at => ({ id: uid(), send_at, active: true, created_at: now() }));
    return tables;
  }

  class Query {
    constructor(run) { this.run = run; this.filters = []; this.orders = []; this.start = 0; this.end = Infinity; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    order(key, options = {}) { this.orders.push([key, options.ascending !== false]); return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    limit(count) { this.end = this.start + count - 1; return this; }
    maybeSingle() { this.single = true; return this; }
    upsert(rows, options) { this.write = { kind: "upsert", rows, keys: options.onConflict.split(",") }; return this; }
    delete() { this.write = { kind: "delete" }; return this; }
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        const result = this.run(this);
        if (!Array.isArray(result.data)) return result;
        let data = result.data.filter(row => this.filters.every(filter => filter(row)));
        data.sort((a, b) => {
          for (const [key, ascending] of this.orders) {
            const order = String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { numeric: true });
            if (order) return ascending ? order : -order;
          }
          return 0;
        });
        data = data.slice(this.start, this.end + 1);
        return { data: copy(this.single ? data[0] || null : data), error: null };
      }).then(resolve, reject);
    }
  }

  function create({ storage, catalog, catalogLabel = "Illustrative sample products", catalogStamp = "samples" }) {
    const clean = catalogOnly(catalog);
    if (!clean.length) throw new Error("The demo catalog is empty.");
    let tables;
    let savedLabel = catalogLabel;
    const saved = storage.getItem(STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version !== 1 || !parsed.tables || !parsed.tables.profiles?.length ||
          Object.values(parsed.tables).some(rows => !Array.isArray(rows))) throw new Error("Demo data is invalid. Reset the demo to start again.");
      tables = parsed.tables;
      savedLabel = parsed.catalogLabel;
      if (catalogStamp !== (parsed.catalogStamp || "samples")) {
        tables.products = tables.branches.flatMap(branch => clean.map(product => ({
          ...product, id: uid(), dealer_id: "demo-dealer", branch_id: branch.id, active: true,
        })));
        savedLabel = catalogLabel;
      }
    } else tables = seed(clean);
    let actor = tables.profiles.find(p => p.role === "ps" && p.active) || tables.profiles.find(p => p.role === "admin" && p.active);
    if (!actor) throw new Error("No active demo account. Reset the demo to restore sample accounts.");
    const persist = () => storage.setItem(STATE_KEY, JSON.stringify({ version: 1, tables, catalogLabel: savedLabel, catalogStamp }));
    const branchIds = () => tables.branches.filter(b => actor.role === "admin" ||
      actor.role === "district_manager" && b.district_id === actor.district_id ||
      actor.role === "ps" && b.id === actor.branch_id ||
      actor.role === "manager" && tables.manager_branches.some(link => link.manager_id === actor.id && link.branch_id === b.id)).map(b => b.id);
    const requireRole = (...allowed) => { if (!allowed.includes(actor.role)) throw new Error("This action is not available to this demo role."); };
    const requireBranch = id => { if (!branchIds().includes(id)) throw new Error("This branch is outside the selected demo role's scope."); };
    const visibleSales = () => tables.sales.filter(s => branchIds().includes(s.branch_id) && (actor.role !== "ps" || s.ps_id === actor.id));
    function visible(table) {
      if (!Object.hasOwn(tables, table)) throw new Error(`The demo does not support table "${table}".`);
      const ids = branchIds();
      if (table === "profiles") return tables.profiles.filter(p => actor.role === "admin" || p.id === actor.id ||
        actor.role !== "ps" && (ids.includes(p.branch_id) || p.district_id === actor.district_id && p.role === "district_manager"));
      if (table === "branches") return tables.branches.filter(b => ids.includes(b.id));
      if (table === "districts") return tables.districts.filter(d => actor.role === "admin" || tables.branches.some(b => ids.includes(b.id) && b.district_id === d.id));
      if (table === "sales") return visibleSales();
      if (["sale_lines", "sale_serials", "sale_edit_history"].includes(table)) {
        const sales = new Set(visibleSales().map(s => s.id));
        return tables[table].filter(row => sales.has(row.sale_id));
      }
      if (table === "manager_branches") return tables[table].filter(row => ids.includes(row.branch_id));
      return tables[table].filter(row => (!row.branch_id || ids.includes(row.branch_id)) &&
        (table !== "ps_walkins" || actor.role !== "ps" || row.ps_id === actor.id));
    }
    const insert = (table, row) => { tables[table].push({ id: uid(), ...row }); return tables[table].at(-1); };
    function upsert(table, rows, keys) {
      for (const row of rows) {
        const found = tables[table].find(item => keys.every(key => item[key] === row[key]));
        if (found) Object.assign(found, row);
        else insert(table, row);
      }
    }
    const removeSale = id => {
      tables.sales = tables.sales.filter(s => s.id !== id);
      for (const table of ["sale_lines", "sale_serials", "sale_edit_history"]) tables[table] = tables[table].filter(row => row.sale_id !== id);
    };
    function brandMatches(line) {
      const parts = assignment => String(assignment || "").split("/").map(part => {
        const text = norm(part);
        const known = tables.products.some(p => norm(p.brand) === text);
        const at = known ? -1 : text.indexOf("-");
        return { brand: at < 0 ? text : text.slice(0, at).trim(), scope: at < 0 ? "" : text.slice(at + 1).trim() };
      });
      const inScope = scope => norm(`${line.category} ${line.sub_category} ${line.model_description}`).includes(scope);
      return parts(actor.assigned_brand).some(part => part.brand === norm(line.brand) &&
        (part.scope ? inScope(part.scope) : !tables.profiles.filter(p => p.id !== actor.id && p.active && p.role === "ps" && p.branch_id === actor.branch_id)
          .flatMap(p => parts(p.assigned_brand)).some(other => other.brand === part.brand && other.scope && inScope(other.scope))));
    }
    function brandLines() {
      return tables.sales.filter(s => s.branch_id === actor.branch_id && !testName(s.customer_name) && !testName(s.invoice_number) &&
        !tables.profiles.some(person => person.id === s.ps_id && testProfile(person))).flatMap(sale =>
        tables.sale_lines.filter(l => l.sale_id === sale.id && brandMatches(l)).map(line => ({ sale, line })));
    }
    function rpc(name, p) {
      if (name === "brand_branch_sales") {
        requireRole("ps");
        return brandLines().map(({ sale, line }) => ({
          ...line, ...sale, amount: line.selling_price * line.quantity,
        }));
      }
      if (name === "brand_sales_contribution") {
        requireRole("ps");
        const days = new Map();
        for (const { sale, line } of brandLines()) {
          const day = days.get(sale.sold_on) || { sold_on: sale.sold_on, own_price: 0, branch_price: 0, own_srp: 0, branch_srp: 0, missing_srp: 0 };
          day.branch_price += line.selling_price * line.quantity;
          if (sale.ps_id === actor.id) day.own_price += line.selling_price * line.quantity;
          if (line.srp == null) day.missing_srp += line.quantity;
          else {
            day.branch_srp += line.srp * line.quantity;
            if (sale.ps_id === actor.id) day.own_srp += line.srp * line.quantity;
          }
          days.set(sale.sold_on, day);
        }
        return [...days.values()];
      }
      if (name === "get_ps_dashboard") {
        requireRole("ps");
        const month = p.p_month.slice(0, 7);
        const people = tables.profiles.filter(row => row.role === "ps" && row.active && !testProfile(row) && row.branch_id === actor.branch_id);
        const totals = people.map(person => ({
          id: person.id, total: tables.sales.filter(s => s.ps_id === person.id && s.branch_id === actor.branch_id && s.sold_on.startsWith(month) && !testName(s.customer_name) && !testName(s.invoice_number))
            .reduce((sum, s) => sum + tables.sale_lines.filter(l => l.sale_id === s.id).reduce((n, l) => n + l.selling_price * l.quantity, 0), 0),
        })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
        const target = tables.monthly_targets.find(t => t.branch_id === actor.branch_id && t.month.startsWith(month))?.amount || 0;
        const own = totals.find(row => row.id === actor.id)?.total || 0;
        const total = totals.reduce((sum, row) => sum + row.total, 0);
        return [{ own_sales: own, branch_sales: total, branch_target: target, personal_target: people.length ? Math.ceil(target / people.length / 50000) * 50000 : 0,
          ps_rank: totals.findIndex(row => row.id === actor.id) + 1, ps_count: people.length, team_share: total ? own / total * 100 : 0 }];
      }
      if (name === "save_ps_sale") {
        requireRole("ps", "manager");
        if (!p.p_lines?.length) throw new Error("At least one product line is required.");
        if (!p.p_customer_name?.trim() || !p.p_invoice_number?.trim() || !p.p_sold_on || !p.p_payment_mode) throw new Error("Customer, invoice, date and payment mode are required.");
        let sale = p.p_sale_id && visibleSales().find(s => s.id === p.p_sale_id);
        if (p.p_sale_id && !sale) throw new Error("This demo sale is not editable.");
        if (!sale) { requireRole("ps"); sale = insert("sales", { dealer_id: actor.dealer_id, branch_id: actor.branch_id, ps_id: actor.id, ps_name: actor.full_name, created_at: now() }); }
        if (tables.sales.some(s => s.id !== sale.id && s.branch_id === sale.branch_id && s.invoice_number === p.p_invoice_number)) throw new Error("This invoice number already exists.");
        const lines = p.p_lines.map(line => {
          if (!(line.selling_price >= 0) || !Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("Enter a valid price and quantity.");
          const product = tables.products.find(product => product.branch_id === sale.branch_id && product.barcode === line.barcode);
          if (!product) throw new Error("Product not found in the demo catalog.");
          return { ...product, ...line, id: uid(), sale_id: sale.id };
        });
        if (p.p_sale_id) insert("sale_edit_history", { sale_id: sale.id, previous_values: copy(sale) });
        Object.assign(sale, { customer_name: p.p_customer_name, invoice_number: p.p_invoice_number, sold_on: p.p_sold_on, payment_mode: p.p_payment_mode, updated_at: now() });
        tables.sale_lines = tables.sale_lines.filter(l => l.sale_id !== sale.id).concat(lines);
        return sale.id;
      }
      if (name === "save_sale_extras") {
        requireRole("ps", "manager");
        const sale = visibleSales().find(s => s.id === p.p_sale_id);
        if (!sale) throw new Error("Sale not found.");
        Object.assign(sale, { city: p.p_city, barangay: p.p_barangay });
        tables.sale_serials = tables.sale_serials.filter(s => s.sale_id !== sale.id);
        const positions = new Map();
        p.p_serials.forEach(serial => {
          const position = positions.get(serial.barcode) || 0;
          const quantity = tables.sale_lines.filter(line => line.sale_id === sale.id && line.barcode === serial.barcode).reduce((sum, line) => sum + line.quantity, 0);
          if (position >= quantity) throw new Error("Too many serial numbers for this product.");
          insert("sale_serials", { ...serial, position, sale_id: sale.id });
          positions.set(serial.barcode, position + 1);
        });
        return null;
      }
      if (name === "save_ps_walkins" || name === "save_branch_walkins") {
        const store = name === "save_branch_walkins";
        if (store) { requireRole("manager", "district_manager", "admin"); requireBranch(p.p_branch_id); }
        else requireRole("ps");
        const table = store ? "branch_walkins" : "ps_walkins";
        const row = { branch_id: store ? p.p_branch_id : actor.branch_id, counted_on: p.p_date, ...(store ? { visitors: p.p_count } : { ps_id: actor.id, clients_assisted: p.p_count }) };
        if (p.p_count === null) tables[table] = tables[table].filter(r => r.branch_id !== row.branch_id || r.counted_on !== row.counted_on);
        else upsert(table, [row], store ? ["branch_id", "counted_on"] : ["branch_id", "ps_id", "counted_on"]);
        return null;
      }
      if (["add_product", "update_product", "import_products", "delete_products"].includes(name)) {
        requireRole(...(name.includes("import") || name.includes("delete") ? ["admin"] : ["manager", "district_manager", "admin"]));
        if (name === "delete_products") {
          tables.products = tables.products.filter(row => !p.p_barcodes.some(code => norm(code) === norm(row.barcode)));
          return null;
        }
        const items = name === "import_products" ? p.p_items : [{
          barcode: p.p_barcode, description: p.p_description, brand: p.p_brand, category: p.p_category, sub_category: p.p_sub_category, srp: p.p_srp,
        }];
        const products = catalogOnly(items);
        if (name === "add_product" && tables.products.some(row => row.barcode === p.p_barcode)) throw new Error("This barcode already exists.");
        if (name === "update_product") tables.products = tables.products.filter(row => row.barcode !== p.p_old_barcode);
        for (const branch of tables.branches) upsert("products", products.map(product => ({ ...product, branch_id: branch.id, active: true })), ["branch_id", "barcode"]);
        return { products: products.length };
      }
      if (name === "sync_sale_categories") {
        requireRole("admin");
        let checked = 0, updated = 0;
        for (const line of tables.sale_lines) {
          const sale = tables.sales.find(s => s.id === line.sale_id);
          if ((p.p_from && sale.sold_on < p.p_from) || (p.p_to && sale.sold_on > p.p_to)) continue;
          checked++;
          const product = tables.products.find(row => row.barcode === line.barcode);
          if (product && (p.p_overwrite || !line.category)) { line.category = product.category; line.sub_category = product.sub_category; updated++; }
        }
        return { lines_checked: checked, lines_updated: updated };
      }
      if (name === "import_sales_history" || name === "import_daily_history") {
        requireRole("admin");
        const daily = name === "import_daily_history";
        let batch = tables.sales_import_batches.find(row => row.id === p.p_batch);
        if (!batch) batch = insert("sales_import_batches", {
          id: p.p_batch, label: p.p_label, source_file: p.p_file, created_at: now(),
          kind: daily ? "daily" : "sales", sales_count: 0, lines_count: 0, amount: 0,
        });
        const result = { sales: 0, lines: 0, days: 0, skipped_existing: 0, matched_ps: 0 };
        if (daily) {
          requireBranch(p.p_branch);
          for (const row of p.p_rows) {
            if (tables.branch_daily_history.some(item => item.branch_id === p.p_branch && item.day === row.day) ||
                tables.sales.some(sale => sale.branch_id === p.p_branch && sale.sold_on === row.day) ||
                tables.branch_walkins.some(count => count.branch_id === p.p_branch && count.counted_on === row.day)) { result.skipped_existing++; continue; }
            insert("branch_daily_history", { ...row, branch_id: p.p_branch, batch_id: batch.id });
            batch.amount += Number(row.sales || 0);
            result.days++;
          }
          batch.sales_count += result.days;
        } else {
          for (const row of p.p_sales) {
            requireBranch(row.branch_id);
            if (tables.sales.some(sale => sale.branch_id === row.branch_id && sale.invoice_number === row.invoice)) { result.skipped_existing++; continue; }
            const ps = tables.profiles.find(person => person.role === "ps" && person.branch_id === row.branch_id && norm(person.full_name) === norm(row.ps_name));
            const sale = insert("sales", { branch_id: row.branch_id, dealer_id: actor.dealer_id, ps_id: ps?.id || null, ps_name: row.ps_name,
              customer_name: row.customer, invoice_number: row.invoice, sold_on: row.sold_on, payment_mode: row.payment_mode,
              created_at: now(), updated_at: now(), import_batch_id: batch.id });
            for (const line of row.lines) {
              insert("sale_lines", { sale_id: sale.id, barcode: line.barcode, model_description: line.description, brand: line.brand,
                category: line.category, sub_category: line.sub_category, srp: line.srp, selling_price: line.price, quantity: line.qty });
              batch.amount += line.price * line.qty;
              result.lines++;
            }
            if (ps) result.matched_ps++;
            result.sales++;
          }
          batch.sales_count += result.sales;
          batch.lines_count += result.lines;
        }
        const dates = daily ? p.p_rows.map(row => row.day) : p.p_sales.map(row => row.sold_on);
        batch.date_from = [batch.date_from, ...dates].filter(Boolean).sort()[0];
        batch.date_to = [batch.date_to, ...dates].filter(Boolean).sort().at(-1);
        return result;
      }
      if (name === "delete_sales_import") {
        requireRole("admin");
        const sales = tables.sales.filter(s => s.import_batch_id === p.p_batch);
        const result = { sales: sales.length, lines: tables.sale_lines.filter(l => sales.some(s => s.id === l.sale_id)).length,
          days: tables.branch_daily_history.filter(row => row.batch_id === p.p_batch).length };
        sales.forEach(sale => removeSale(sale.id));
        tables.branch_daily_history = tables.branch_daily_history.filter(row => row.batch_id !== p.p_batch);
        tables.sales_import_batches = tables.sales_import_batches.filter(row => row.id !== p.p_batch);
        return result;
      }
      if (["save_push_message", "delete_push_message", "save_push_alert_schedule", "delete_push_alert_schedule", "save_company_holiday", "delete_company_holiday", "add_payment_mode", "delete_payment_mode"].includes(name)) {
        requireRole(...(name.includes("holiday") ? ["admin", "district_manager"] : ["admin"]));
        const table = name.includes("message") ? "push_messages" : name.includes("schedule") ? "push_alert_schedules" : name.includes("holiday") ? "company_holidays" : "payment_modes";
        if (name.startsWith("delete")) tables[table] = tables[table].filter(row => name.includes("holiday") ? row.holiday_date !== p.p_date : row.id !== p.p_id);
        else if (table === "push_messages") insert(table, { status: p.p_status, message: p.p_message, created_at: now() });
        else if (table === "push_alert_schedules") upsert(table, [{ id: p.p_id || uid(), send_at: p.p_send_at, active: p.p_active, created_at: now() }], p.p_id ? ["id"] : ["send_at"]);
        else if (table === "company_holidays") upsert(table, [{ holiday_date: p.p_date, label: p.p_label }], ["holiday_date"]);
        else insert(table, { name: p.p_name, position: tables.payment_modes.length });
        return null;
      }
      if (name === "admin_delete_sale") {
        requireRole("admin"); removeSale(p.p_sale_id); return null;
      }
      if (name === "wipe_all_data") {
        requireRole("admin");
        if (p.p_confirm !== "DELETE EVERYTHING") throw new Error("Confirmation is required.");
        for (const key of Object.keys(tables)) if (!["payment_modes", "profiles"].includes(key)) tables[key] = [];
        tables.profiles = tables.profiles.filter(p => p.role === "admin");
        return null;
      }
      if (name === "create_district" || name === "create_branch" || name === "update_district" || name === "update_branch" || name === "delete_district" || name === "delete_branch") {
        requireRole("admin");
        const table = name.endsWith("district") ? "districts" : "branches";
        if (name.startsWith("delete")) {
          if (table === "branches" && tables.sales.some(s => s.branch_id === p.p_id) ||
              table === "districts" && tables.branches.some(b => b.district_id === p.p_id)) throw new Error("This demo location still has records. Remove them first.");
          tables[table] = tables[table].filter(row => row.id !== p.p_id);
        } else {
          const row = { name: p.p_name, ...(table === "branches" ? { district_id: p.p_district_id } : {}) };
          if (name.startsWith("create")) {
            const added = insert(table, row);
            if (table === "branches") {
              const products = catalogOnly(tables.products);
              tables.products.push(...products.map(product => ({ ...product, id: uid(), branch_id: added.id, active: true })));
            }
          } else Object.assign(tables[table].find(row => row.id === p.p_id), row);
        }
        return null;
      }
      if (["admin_set_user_status", "admin_update_profile", "admin_transfer_user"].includes(name)) {
        requireRole("admin");
        const person = tables.profiles.find(row => row.id === p.p_user_id);
        if (!person) throw new Error("Demo user not found.");
        if (name === "admin_set_user_status") person.active = p.p_active;
        if (name === "admin_update_profile") Object.assign(person, { full_name: p.p_full_name, assigned_brand: p.p_assigned_brand });
        if (name === "admin_transfer_user") {
          Object.assign(person, { district_id: p.p_district_id, branch_id: p.p_branch_id });
          if (person.role === "manager") tables.manager_branches = tables.manager_branches.filter(row => row.manager_id !== person.id).concat([{ manager_id: person.id, branch_id: p.p_branch_id }]);
        }
        return null;
      }
      throw new Error(`"${name}" is not simulated in this demo. No live request was sent.`);
    }
    function transaction(action) {
      const before = copy(tables);
      try { const data = action(); persist(); return { data, error: null }; }
      catch (error) {
        tables = before;
        actor = tables.profiles.find(row => row.id === actor.id) || actor;
        return { data: null, error: { message: error.message } };
      }
    }
    const client = {
      from(table) {
        return new Query(query => {
          if (!query.write) return { data: visible(table), error: null };
          return transaction(() => {
            requireRole("manager", "district_manager", "admin");
            if (!["monthly_targets", "brand_targets", "payment_mode_targets"].includes(table)) throw new Error("Direct demo writes to this table are not supported.");
            if (query.write.kind === "upsert") {
              for (const row of query.write.rows) requireBranch(row.branch_id);
              upsert(table, query.write.rows, query.write.keys);
            } else {
              const allowed = new Set(visible(table));
              tables[table] = tables[table].filter(row => !(allowed.has(row) && query.filters.every(filter => filter(row))));
            }
            return null;
          });
        });
      },
      rpc(name, params = {}) {
        const read = ["brand_branch_sales", "brand_sales_contribution", "get_ps_dashboard"].includes(name);
        return new Query(() => read ? { data: rpc(name, params), error: null } : transaction(() => rpc(name, params)));
      },
      functions: { async invoke(name, { body }) {
        if (name !== "admin-create-user") return { data: null, error: { message: "Email and server services are disabled in demo mode." } };
        return transaction(() => {
          requireRole("admin");
          if (body.action) {
            const person = tables.profiles.find(p => p.id === body.user_id);
            if (!person) throw new Error("Demo user not found.");
            if (body.action === "reset_password") return { temporary_password: "DemoOnly-NotALogin" };
            if (body.action === "delete_user") {
              if (tables.sales.some(s => s.ps_id === person.id)) throw new Error("This user has sales. Disable instead.");
              tables.profiles = tables.profiles.filter(p => p.id !== person.id);
              tables.manager_branches = tables.manager_branches.filter(row => row.manager_id !== person.id);
            } else if (body.action === "update_contact") Object.assign(person, { login_id: body.login, email: body.contact_email });
            else throw new Error("This demo account action is not supported.");
          } else {
            if (tables.profiles.some(p => norm(p.login_id) === norm(body.login))) throw new Error("Demo login ID already exists.");
            const person = insert("profiles", { dealer_id: actor.dealer_id, role: body.role, full_name: body.full_name,
              district_id: body.district_id, branch_id: body.branch_id || null, assigned_brand: body.brand || null,
              active: true, login_id: body.login, email: body.email || null });
            if (person.role === "manager") tables.manager_branches.push({ manager_id: person.id, branch_id: person.branch_id });
          }
          return { temporary_password: "DemoOnly-NotALogin", email_status: "demo_only" };
        });
      } },
      auth: {
        async updateUser() { return { error: { message: "Demo accounts have no real passwords. No password was changed." } }; },
        async signOut() { return { error: null }; },
      },
    };
    return {
      client,
      get catalogLabel() { return savedLabel; },
      get profile() { return copy(actor); },
      get session() { return { user: { id: actor.id, email: "demo@example.invalid" } }; },
      setRole(role) {
        if (!roles.includes(role)) throw new Error("Unknown demo role.");
        const person = tables.profiles.find(p => p.role === role && p.active);
        if (!person) throw new Error("No active demo account for this role. Reset the demo to restore sample accounts.");
        actor = person;
      },
      reset() { storage.removeItem(STATE_KEY); },
    };
  }

  const api = { create, catalogOnly, sampleCatalog, STATE_KEY, CATALOG_KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BranchlineDemo = api;
})(typeof window !== "undefined" ? window : globalThis);
