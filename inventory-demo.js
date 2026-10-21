(function (root) {
  "use strict";
  const I = typeof module !== "undefined" && module.exports ? require("./inventory.js") : root.BranchlineInventory;
  const roles = ["inventory_controller", "stock_custodian"];
  const tablesList = ["inventory_branch_users", "inventory_snapshots", "inventory_stock", "inventory_serials", "inventory_transfers", "inventory_transfer_batches", "inventory_transfer_notifications", "inventory_events", "inventory_sale_allocations", "inventory_reminder_days"];
  const serialKey = value => String(value).trim().toLowerCase();
  function reserved(t, branch, barcode, serial, exclude) {
    return t.inventory_sale_allocations.some(row => row.branch_id === branch && row.barcode === barcode && row.sale_id !== exclude &&
      t.inventory_stock.some(stock => stock.branch_id === branch && stock.barcode === barcode && stock.snapshot_id === row.snapshot_id) &&
      row.serials.some(unit => serialKey(unit.serial) === serialKey(serial)) && !row.base_serials.some(unit => serialKey(unit.serial) === serialKey(serial)));
  }
  function initialize(tables, today, uid) {
    const fresh = !tables.inventory_stock;
    tablesList.forEach(table => { tables[table] ||= []; });
    const codes = { cauayan: "CAU", ilagan: "ILA", santiago: "STG", tuguegarao: "TUG" };
    for (const branch of tables.branches) {
      branch.code ||= codes[branch.name.replace(/\s*\(Demo\)$/i, "").trim().toLowerCase()] || null;
      branch.transfer_sequence ||= 0;
      const transfers = tables.inventory_transfers.filter(item => item.from_branch === branch.id)
        .sort((a,b) => a.dispatched_at.localeCompare(b.dispatched_at) || a.id.localeCompare(b.id));
      if (branch.code) for (const transfer of transfers) {
        if (!transfer.reference) {
          transfer.transfer_number = ++branch.transfer_sequence;
          transfer.reference = `${branch.code}-${String(transfer.transfer_number).padStart(6, "0")}`;
        }
        branch.transfer_sequence = Math.max(branch.transfer_sequence,transfer.transfer_number || 0);
      }
    }
    for (const role of roles) {
      if (!tables.profiles.some(person => person.role === role)) {
        const person = { id: `demo-${role}`, dealer_id: "demo-dealer", role, full_name: role === "inventory_controller" ? "Demo Inventory Controller" : "Demo Stock Custodian", active: true, branch_id: null, district_id: null };
        tables.profiles.push(person);
        tables.branches.slice(0, 2).forEach(branch => tables.inventory_branch_users.push({ user_id: person.id, branch_id: branch.id }));
      }
    }
    if (!fresh) return;
    for (const branch of tables.branches) {
      const snapshot = { id: uid(), branch_id: branch.id, imported_by: "demo-admin", imported_at: new Date().toISOString(), reported_at: `${today}T00:00:00+08:00`, files: "Illustrative demo inventory", products: 0, quantity: 0 };
      tables.inventory_snapshots.push(snapshot);
      tables.products.filter(product => product.branch_id === branch.id).forEach((product, index) => {
        const serialized = index % 2 === 0, quantity = index % 5 === 4 ? 0 : 8;
        tables.inventory_stock.push({ branch_id: branch.id, barcode: product.barcode, quantity, serialized, snapshot_id: snapshot.id });
        if (serialized) for (let n = 0; n < quantity; n++) tables.inventory_serials.push({
          branch_id: branch.id, barcode: product.barcode, serial: `DEMO-${product.barcode}-${branch.id}-${n + 1}`,
          received_on: new Date(Date.parse(`${today}T00:00:00Z`) - (n % 2 ? 120 : 20) * 86400000).toISOString().slice(0, 10), status: "available",
        });
        snapshot.products++; snapshot.quantity += quantity;
      });
    }
  }
  function execute(name, p, env) {
    const { tables: t, actor, branchIds, uid, now, today } = env;
    const ids = branchIds();
    const requireBranch = branch => {
      if (actor.role === "ps" || !ids.includes(branch)) throw new Error("Inventory changes require authorized branch access.");
    };
    const stockFor = (branch, barcode) => t.inventory_stock.find(row => row.branch_id === branch && row.barcode === barcode);
    const unitFor = (branch, barcode, serial) => t.inventory_serials.find(row => row.branch_id === branch && row.barcode === barcode && serialKey(row.serial) === serialKey(serial));
    const event = (branch, kind, barcode, quantity, note) => t.inventory_events.push({ id: uid(), branch_id: branch, actor_id: actor.id, kind, barcode, quantity, note, created_at: now() });
    if (name === "inventory_catalog") return t.products.filter(item => item.active && ids.includes(item.branch_id)).map(item => ({
      branch_id: item.branch_id, barcode: item.barcode, model_description: item.model_description, brand: item.brand,
      category: item.category, sub_category: item.sub_category, missing_srp: !roles.includes(actor.role) && actor.role !== "ps" && (item.srp == null || Number(item.srp) === 0),
    }));
    if (name === "inventory_destinations") {
      if (actor.role === "ps") return [];
      return t.branches.map(branch => ({ id: branch.id, name: branch.name }));
    }
    if (name === "claim_inventory_reminder") {
      if (t.inventory_reminder_days.some(row => row.user_id === actor.id && row.day === today)) return false;
      t.inventory_reminder_days.push({ user_id: actor.id, day: today }); return true;
    }
    if (name === "assign_inventory_branches") {
      if (actor.role !== "admin") throw new Error("Only administrators can assign inventory branches.");
      const person = t.profiles.find(person => person.id === p.p_user && roles.includes(person.role));
      if (!person || !p.p_branches?.length || p.p_branches.some(id => !t.branches.some(branch => branch.id === id))) throw new Error("Choose valid inventory branches.");
      t.inventory_branch_users = t.inventory_branch_users.filter(row => row.user_id !== person.id).concat(p.p_branches.map(branch_id => ({ user_id: person.id, branch_id })));
      return null;
    }
    if (name === "classify_inventory_product") {
      if (actor.role !== "admin") throw new Error("Only an administrator can classify inventory products.");
      requireBranch(p.p_branch);
      const barcode = I.code(p.p_barcode), brand = String(p.p_brand || "").trim();
      const category = String(p.p_category || "").trim(), sub = String(p.p_sub_category || "").trim() || null;
      if (I.needsClassification({ brand, category })) throw new Error("A confirmed brand and category are required. Subcategory is optional.");
      if (!t.products.some(row => row.branch_id === p.p_branch && row.barcode === barcode && row.active)) throw new Error("This product was not found in the selected branch catalog.");
      t.products.filter(row => row.barcode === barcode && row.dealer_id === actor.dealer_id).forEach(row => Object.assign(row, { brand, category, sub_category: sub }));
      t.sale_lines.filter(row => row.barcode === barcode && t.sales.some(sale => sale.id === row.sale_id && sale.dealer_id === actor.dealer_id))
        .forEach(row => Object.assign(row, { brand, category, sub_category: sub }));
      event(p.p_branch, "classification", barcode, null, `Brand: ${brand}; Category: ${category}; Subcategory: ${sub || "(none)"}`);
      return null;
    }
    if (name === "import_inventory") {
      requireBranch(p.p_branch);
      if (!p.p_reported_at || !Number.isFinite(Date.parse(p.p_reported_at)) || Date.parse(p.p_reported_at) > Date.parse(now()) + 300000) throw new Error("A valid report date/time is required.");
      if (t.inventory_transfers.some(row => row.status === "transit" && [row.from_branch, row.to_branch].includes(p.p_branch))) throw new Error("Resolve in-transit transfers before importing a replacement snapshot.");
      if (!p.p_items?.length || new Set(p.p_items.map(item => I.code(item.barcode))).size !== p.p_items.length) throw new Error("Inventory items are missing or contain duplicate barcodes.");
      const snapshot = { id: uid(), branch_id: p.p_branch, imported_by: actor.id, imported_at: now(), reported_at: p.p_reported_at, files: p.p_files, products: p.p_items.length, quantity: 0 };
      t.inventory_snapshots.push(snapshot);
      t.inventory_stock.filter(row => row.branch_id === p.p_branch).forEach(row => { row.quantity = 0; row.snapshot_id = snapshot.id; });
      t.inventory_serials.filter(row => row.branch_id === p.p_branch).forEach(row => { row.status = "absent"; });
      for (const item of p.p_items) {
        const barcode = I.code(item.barcode);
        if (!barcode || !item.description || !Number.isInteger(item.quantity) || item.quantity < 0 || (item.serialized ? item.serials.length !== item.quantity : item.serials.length !== 0)) throw new Error("Invalid stock quantity or serial count.");
        const known = t.products.find(row => row.barcode === barcode);
        const incomingSrp = known?.srp == null && known && actor.role !== "admin" ? null :
          item.srp == null || String(item.srp).trim() === "" ? known ? 0 : null : Number(item.srp);
        if (incomingSrp !== null && (!Number.isFinite(incomingSrp) || incomingSrp < 0)) throw new Error("SRP must be a non-negative number.");
        const details = { barcode, model_description: item.description, brand: known?.brand || "Unclassified",
          category: actor.role === "admin" && String(item.category || "").trim() ? item.category.trim() : known?.category || "",
          sub_category: actor.role === "admin" && String(item.sub_category || "").trim() ? item.sub_category.trim() : known?.sub_category || "" };
        for (const branch of t.branches) {
          const product = t.products.find(row => row.branch_id === branch.id && row.barcode === barcode);
          if (product) Object.assign(product, details, { srp: incomingSrp, active: true });
          else t.products.push({ id: uid(), dealer_id: actor.dealer_id, branch_id: branch.id, ...details, srp: incomingSrp, active: true });
        }
        t.sale_lines.filter(line => line.barcode === barcode).forEach(line => Object.assign(line, details));
        const stock = stockFor(p.p_branch, barcode);
        const row = { branch_id: p.p_branch, barcode, quantity: item.quantity, serialized: item.serialized || item.quantity === 0 && Boolean(stock?.serialized), snapshot_id: snapshot.id };
        if (stock) Object.assign(stock, row); else t.inventory_stock.push(row);
        const seen = new Set();
        for (const serial of item.serials) {
          const key = serial.serial.trim().toLowerCase();
          if (!key || seen.has(key) || I.day(serial.received_on) > today) throw new Error("Invalid, duplicated or future-dated serial.");
          seen.add(key);
          const unit = unitFor(p.p_branch, barcode, serial.serial);
          if (unit) Object.assign(unit, serial, { status: "available" });
          else t.inventory_serials.push({ branch_id: p.p_branch, barcode, ...serial, status: "available" });
        }
        snapshot.quantity += item.quantity;
      }
      t.products.filter(row => row.branch_id === p.p_branch && row.active).forEach(product => {
        if (!stockFor(p.p_branch, product.barcode)) t.inventory_stock.push({ branch_id: p.p_branch, barcode: product.barcode, quantity: 0, serialized: false, snapshot_id: snapshot.id });
      });
      t.inventory_sale_allocations.filter(row => row.branch_id === p.p_branch).forEach(row => { row.snapshot_id = snapshot.id; row.base_quantity = row.quantity; row.base_serials = structuredClone(row.serials); });
      event(p.p_branch, "snapshot", "", null, p.p_files); return snapshot.id;
    }
    if (name === "adjust_inventory") {
      requireBranch(p.p_branch);
      const stock = stockFor(p.p_branch, p.p_barcode);
      if (!stock || !p.p_note?.trim() || !Number.isInteger(p.p_quantity) || p.p_quantity < 0) throw new Error("An initialized item, valid quantity and reason are required.");
      if (t.inventory_transfers.some(row => row.status === "transit" && row.barcode === p.p_barcode && [row.from_branch,row.to_branch].includes(p.p_branch))) throw new Error("Resolve pending item transfers first.");
      if (stock.serialized ? p.p_serials.length !== p.p_quantity : p.p_serials.length !== 0) throw new Error("Serial count must match serialized stock.");
      const seen = new Set();
      for (const unit of p.p_serials) {
        const key = unit.serial.trim().toLowerCase();
        if (!key || seen.has(key)) throw new Error("Duplicate or blank serial.");
        if (reserved(t,p.p_branch,p.p_barcode,unit.serial)) throw new Error("A recorded sale reserves this serial. Reconcile inventory first.");
        if (unit.received_on && I.day(unit.received_on) > today) throw new Error("Received date cannot be in the future.");
        seen.add(key);
      }
      t.inventory_serials.filter(row => row.branch_id === p.p_branch && row.barcode === p.p_barcode && row.status === "available").forEach(row => { row.status = "absent"; });
      for (const unit of p.p_serials) {
        const existing = unitFor(p.p_branch, p.p_barcode, unit.serial);
        if (existing?.status === "transit") throw new Error("A serial is in transit.");
        if (existing) Object.assign(existing, unit, { status: "available" });
        else t.inventory_serials.push({ branch_id: p.p_branch, barcode: p.p_barcode, ...unit, status: "available" });
      }
      event(p.p_branch, "adjustment", p.p_barcode, p.p_quantity - stock.quantity, p.p_note);
      stock.quantity = p.p_quantity; return null;
    }
    const reviewAllowed = (branch, source) => ids.includes(branch) &&
      (actor.role === "manager" || (!source && roles.includes(actor.role)));
    const notify = (batch, phase) => {
      const branch = phase === "approval" ? batch.from_branch : batch.to_branch;
      for (const person of t.profiles.filter(person => person.active &&
        (person.role === "manager" && t.manager_branches.some(link => link.manager_id === person.id && link.branch_id === branch) ||
        phase === "receipt" && roles.includes(person.role) && t.inventory_branch_users.some(link => link.user_id === person.id && link.branch_id === branch)))) {
        if (!t.inventory_transfer_notifications.some(row => row.batch_id === batch.id && row.user_id === person.id && row.phase === phase))
          t.inventory_transfer_notifications.push({id:uid(),batch_id:batch.id,user_id:person.id,phase,created_at:now(),push_sent_at:null});
      }
    };
    if (name === "submit_inventory_transfer") {
      requireBranch(p.p_from);
      if (!Array.isArray(p.p_items) || !p.p_items.length) throw new Error("Add at least one transfer item.");
      if (new Set(p.p_items.map(line => I.code(line.barcode))).size !== p.p_items.length) throw new Error("Each barcode must appear only once.");
      if (!t.manager_branches.some(link => link.branch_id === p.p_from &&
        t.profiles.some(person => person.id === link.manager_id && person.role === "manager" && person.active)))
        throw new Error("Assign an active source branch BM before submitting a transfer.");
      const source = t.branches.find(branch => branch.id === p.p_from), number = source.transfer_sequence + 1;
      const batch = {id:uid(),from_branch:p.p_from,to_branch:p.p_to,reference:`${source.code}-${String(number).padStart(6,"0")}`,
        transfer_number:number,requested_by:actor.id,requested_at:now(),status:"pending_approval",note:String(p.p_note || "").trim().toUpperCase()};
      t.inventory_transfer_batches.push(batch);
      for (const line of p.p_items) {
        const transferId = execute("dispatch_inventory", {p_from:p.p_from,p_to:p.p_to,p_barcode:I.code(line.barcode),
          p_quantity:line.quantity,p_serials:line.serials,p_note:batch.note},env);
        const transfer = t.inventory_transfers.find(row => row.id === transferId);
        Object.assign(transfer,{batch_id:batch.id,reference:batch.reference,transfer_number:null});
        const entry = t.inventory_events.find(row => row.note === transferId && row.kind === "dispatch");
        Object.assign(entry,{note:batch.id,kind:"transfer_reserved"});
      }
      source.transfer_sequence = number;
      notify(batch,"approval");
      return batch.id;
    }
    if (name === "review_inventory_transfer") {
      const batch = t.inventory_transfer_batches.find(row => row.id === p.p_batch), action = p.p_action;
      if (!batch || !["approve","reject_source","receive","reject_destination"].includes(action)) throw new Error("Transfer or action is invalid.");
      const source = ["approve","reject_source"].includes(action);
      if (!reviewAllowed(source ? batch.from_branch : batch.to_branch, source)) throw new Error("Only source BM or destination BM/IC/SC may review this transfer.");
      if (batch.status !== (source ? "pending_approval" : "transit")) throw new Error("Transfer is not awaiting this action or was already resolved.");
      if (action === "approve") {
        Object.assign(batch,{status:"transit",approved_by:actor.id,approved_at:now()});
        notify(batch,"receipt");
      } else {
        for (const line of t.inventory_transfers.filter(row => row.batch_id === batch.id))
          execute("resolve_inventory_transfer",{p_transfer:line.id,p_action:action === "receive" ? "receive" : "cancel"},{...env,reviewLine:true});
        Object.assign(batch,{status:action === "receive" ? "received" : action === "reject_source" ? "rejected_source" : "rejected_destination",
          resolved_by:actor.id,resolved_at:now()});
      }
      event(source ? batch.from_branch : batch.to_branch,action,null,null,batch.id);
      return null;
    }
    if (name === "dispatch_inventory") {
      requireBranch(p.p_from);
      if (p.p_from === p.p_to || !t.branches.some(branch => branch.id === p.p_to)) throw new Error("Choose a different company destination.");
      const stock = stockFor(p.p_from, p.p_barcode);
      if (!stock || !Number.isInteger(p.p_quantity) || p.p_quantity < 1 || stock.quantity < p.p_quantity) throw new Error("Insufficient source stock.");
      if (!Array.isArray(p.p_serials)) throw new Error("Serials must be an array.");
      if (new Set(p.p_serials.map(item => serialKey(item.serial))).size !== p.p_serials.length) throw new Error("Choose a different serial number for each unit.");
      if (stock.serialized ? p.p_serials.length !== p.p_quantity : p.p_serials.length !== 0) throw new Error("Select one serial per unit.");
      const serials = p.p_serials.map(item => {
        const unit = unitFor(p.p_from, p.p_barcode, item.serial);
        if (!unit || unit.status !== "available") throw new Error("Serial is not available for this barcode.");
        unit.status = "transit"; return { serial: unit.serial, received_on: unit.received_on };
      });
      const branch = t.branches.find(item => item.id === p.p_from);
      if (!branch.code) throw new Error("Ask Admin to set a branch code for the source branch before transferring stock.");
      const transferNumber = ++branch.transfer_sequence;
      const reference = `${branch.code}-${String(transferNumber).padStart(6, "0")}`;
      const transfer = { id: uid(), reference, transfer_number: transferNumber, from_branch: p.p_from, to_branch: p.p_to, barcode: p.p_barcode, quantity: p.p_quantity, serialized: stock.serialized, serials, status: "transit", dispatched_by: actor.id, dispatched_at: now(), note: p.p_note || "" };
      stock.quantity -= p.p_quantity; t.inventory_transfers.push(transfer);
      event(p.p_from, "dispatch", p.p_barcode, -p.p_quantity, transfer.id); return transfer.id;
    }
    if (name === "resolve_inventory_transfer") {
      const transfer = t.inventory_transfers.find(row => row.id === p.p_transfer);
      if (!transfer || transfer.status !== "transit" || !["receive","cancel"].includes(p.p_action)) throw new Error("Transfer is invalid or already resolved.");
      const branch = p.p_action === "receive" ? transfer.to_branch : transfer.from_branch;
      if (!env.reviewLine) {
        if (transfer.batch_id) throw new Error("Use the whole-transfer approval/receipt workflow.");
        if (!reviewAllowed(branch,p.p_action === "cancel")) throw new Error("Branch BM or authorized destination IC/SC access is required.");
      }
      let stock = stockFor(branch, transfer.barcode);
      if (stock && stock.quantity > 0 && stock.serialized !== transfer.serialized) throw new Error("Destination serialization does not match.");
      if (!stock) {
        let snapshot = t.inventory_snapshots.find(row => row.branch_id === branch);
        if (!snapshot) { snapshot = { id: uid(), branch_id: branch, imported_by: actor.id, imported_at: now(), reported_at: now(), files: "Transfer receiving baseline", products: 0, quantity: 0 }; t.inventory_snapshots.push(snapshot); }
        stock = { branch_id: branch, barcode: transfer.barcode, quantity: 0, serialized: transfer.serialized, snapshot_id: snapshot.id }; t.inventory_stock.push(stock);
      }
      for (const item of transfer.serials) {
        const unit = unitFor(branch, transfer.barcode, item.serial);
        if (p.p_action === "receive" && ["available","transit"].includes(unit?.status)) throw new Error("Destination already has this serial for this barcode.");
        if (p.p_action === "receive" && reserved(t,branch,transfer.barcode,item.serial)) throw new Error("Destination serial is reserved by a recorded sale.");
        if (unit) Object.assign(unit, item, { status: "available" });
        else t.inventory_serials.push({ branch_id: branch, barcode: transfer.barcode, ...item, status: "available" });
        if (p.p_action === "receive") unitFor(transfer.from_branch, transfer.barcode, item.serial).status = "absent";
      }
      const product = t.products.find(row => row.branch_id === transfer.from_branch && row.barcode === transfer.barcode);
      if (!t.products.some(row => row.branch_id === branch && row.barcode === transfer.barcode)) t.products.push({ ...product, id: uid(), branch_id: branch });
      stock.quantity += transfer.quantity; stock.serialized = transfer.serialized;
      transfer.status = p.p_action === "receive" ? "received" : "cancelled"; transfer.resolved_at = now(); transfer.resolved_by = actor.id;
      event(branch, p.p_action, transfer.barcode, transfer.quantity, transfer.id); return null;
    }
    throw new Error(`Unknown inventory action ${name}.`);
  }

  function applySale(t, sale, before, reconcile) {
    if (!t.inventory_stock.some(row => row.branch_id === sale.branch_id)) return;
    const stockFor = barcode => t.inventory_stock.find(row => row.branch_id === sale.branch_id && row.barcode === barcode);
    const unitFor = (barcode, serial) => t.inventory_serials.find(row => row.branch_id === sale.branch_id && row.barcode === barcode && row.serial === serial);
    const test = value => /^\s*test(?![a-z])/i.test(String(value || ""));
    const person = t.profiles.find(person => person.id === sale.ps_id);
    const isTest = test(sale.customer_name) || test(sale.invoice_number) || test(person?.full_name) || test(person?.login_id);
    const codes = new Set([...t.sale_lines.filter(line => line.sale_id === sale.id).map(line => line.barcode), ...t.inventory_sale_allocations.filter(row => row.sale_id === sale.id).map(row => row.barcode), ...before.map(row => row.barcode)]);
    for (const barcode of codes) {
      const stock = stockFor(barcode);
      const quantity = isTest ? 0 : t.sale_lines.filter(row => row.sale_id === sale.id && row.barcode === barcode).reduce((sum, row) => sum + row.quantity, 0);
      if (!stock) { if (quantity) throw new Error("This product has no initialized inventory."); continue; }
      const allocation = t.inventory_sale_allocations.find(row => row.sale_id === sale.id && row.barcode === barcode);
      const previous = before.find(row => row.barcode === barcode);
      const baseQty = allocation?.base_quantity ?? previous?.quantity ?? 0;
      const baseSerials = allocation?.base_serials ?? previous?.serials ?? [];
      const selected = quantity && stock.serialized ? t.sale_serials.filter(row => row.sale_id === sale.id && row.barcode === barcode).map(row => ({ serial: row.serial, received_on: unitFor(barcode, row.serial)?.received_on || null })) : [];
      if (quantity && !stock.serialized && t.sale_serials.some(row => row.sale_id === sale.id && row.barcode === barcode)) throw new Error("This product is not serialized; remove its serial selection.");
      if (stock.serialized && selected.length !== quantity || new Set(selected.map(row => row.serial)).size !== selected.length) throw new Error("Select one different available serial per unit.");
      const same = (a,b) => JSON.stringify(a.map(row => row.serial).sort()) === JSON.stringify(b.map(row => row.serial).sort());
      if (baseQty && !reconcile && (quantity !== (allocation?.quantity ?? baseQty) || !same(selected,allocation?.serials ?? baseSerials))) throw new Error("Confirm applying this correction to current inventory.");
      const has = (items, serial) => items.some(row => row.serial === serial);
      const current = stock.quantity + (allocation ? allocation.quantity - allocation.base_quantity : 0);
      for (const row of allocation?.serials || []) if (!has(baseSerials,row.serial)) {
        const unit = unitFor(barcode,row.serial); if (unit?.status === "sold") unit.status = "available";
      }
      for (const row of baseSerials) if (allocation && !has(allocation.serials,row.serial)) {
        const unit = unitFor(barcode,row.serial); if (unit?.status !== "available") throw new Error("Restored serial has moved. Resolve inventory first."); unit.status = "sold";
      }
      if (current - (quantity-baseQty) < 0) throw new Error("Insufficient available stock.");
      for (const row of selected) if (!has(baseSerials,row.serial)) {
        const unit = unitFor(barcode,row.serial); if (unit?.status !== "available") throw new Error("Serial is not available for this barcode."); unit.status = "sold";
      }
      for (const row of baseSerials) if (!has(selected,row.serial)) {
        const snapshot = t.inventory_snapshots.find(item => item.id === stock.snapshot_id);
        if (reserved(t,sale.branch_id,barcode,row.serial,sale.id) || t.inventory_transfers.some(transfer =>
          transfer.from_branch === sale.branch_id && transfer.barcode === barcode && ["transit","received"].includes(transfer.status) &&
          transfer.dispatched_at >= snapshot.imported_at && transfer.serials.some(unit => unit.serial === row.serial))) throw new Error("Cannot restore a serial belonging to a later sale or transfer.");
        const unit = unitFor(barcode,row.serial); if (["available","transit"].includes(unit?.status)) throw new Error("Serial already available or in transit.");
        if (unit) unit.status = "available"; else t.inventory_serials.push({ branch_id: sale.branch_id, barcode, ...row, status: "available" });
      }
      stock.quantity = current - (quantity-baseQty);
      const value = { sale_id: sale.id, branch_id: sale.branch_id, barcode, snapshot_id: stock.snapshot_id, quantity, base_quantity: baseQty, serials: selected, base_serials: baseSerials };
      if (allocation) Object.assign(allocation,value); else t.inventory_sale_allocations.push(value);
    }
  }
  function deleteSale(t, sale) {
    for (const allocation of t.inventory_sale_allocations.filter(row => row.sale_id === sale.id)) {
      const stock = t.inventory_stock.find(row => row.branch_id === allocation.branch_id && row.barcode === allocation.barcode);
      if (stock?.snapshot_id !== allocation.snapshot_id) continue;
      stock.quantity += allocation.quantity - allocation.base_quantity;
      if (stock.quantity < 0) throw new Error("Resolve stock discrepancy before deleting this sale.");
      const has = (list, serial) => list.some(row => row.serial === serial);
      for (const unit of t.inventory_serials.filter(row => row.branch_id === allocation.branch_id && row.barcode === allocation.barcode)) {
        if (has(allocation.serials,unit.serial) && !has(allocation.base_serials,unit.serial) && unit.status === "sold") unit.status = "available";
        if (has(allocation.base_serials,unit.serial) && !has(allocation.serials,unit.serial)) {
          if (unit.status !== "available") throw new Error("Restored serial has moved."); unit.status = "sold";
        }
      }
    }
    t.inventory_sale_allocations = t.inventory_sale_allocations.filter(row => row.sale_id !== sale.id);
  }
  const api = { initialize, execute, applySale, deleteSale, roles };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BranchlineInventoryDemo = api;
})(typeof window !== "undefined" ? window : globalThis);
