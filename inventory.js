(function (root) {
  "use strict";
  const code = value => {
    const text = String(value ?? "").trim();
    return /^\d{1,7}$/.test(text) ? text.padStart(8, "0") : text;
  };
  const text = value => String(value ?? "").trim();
  const day = value => {
    if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
    const date = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid received date: ${date || "(blank)"}.`);
    return date;
  };
  function ageDays(received, today) {
    return received ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day(received)}T00:00:00Z`)) / 86400000) : null;
  }
  function headers(rows, names) {
    const index = rows.findIndex(row => names.every(name => row.some(value => text(value).toLowerCase() === name)));
    if (index < 0) throw new Error(`Report columns missing: ${names.join(", ")}.`);
    const row = rows[index].map(value => text(value).toLowerCase());
    return { index, at: name => row.indexOf(name) };
  }
  function parseReports(stockRows, serialRows, catalog = [], today = new Date().toISOString().slice(0, 10)) {
    const h = headers(stockRows, ["item code", "item name", "total"]);
    const sh = headers(serialRows, ["item code", "item name", "loc code", "serial no", "tran date"]);
    const products = new Map(catalog.map(item => [code(item.barcode), item]));
    const items = new Map();
    let total = null;
    for (let rowIndex = h.index + 1; rowIndex < stockRows.length; rowIndex++) {
      const row = stockRows[rowIndex], barcode = code(row[h.at("item code")]);
      if (/^total qty/i.test(barcode)) { total = Number(row[h.at("total")]); continue; }
      if (!barcode && row.every(value => !text(value))) continue;
      if (!barcode || !text(row[h.at("item name")])) throw new Error(`Stock row ${rowIndex + 1}: barcode and item name are required.`);
      const raw = row[h.at("total")], quantity = Number(raw);
      if (text(raw) === "" || !Number.isSafeInteger(quantity) || quantity < 0) throw new Error(`Stock row ${rowIndex + 1}: invalid quantity.`);
      if (items.has(barcode)) throw new Error(`Stock row ${rowIndex + 1}: duplicate barcode ${barcode}.`);
      const known = products.get(barcode);
      items.set(barcode, {
        barcode, description: text(row[h.at("item name")]), brand: known?.brand || "",
        category: known?.category || "", sub_category: known?.sub_category || "",
        quantity, serialized: false, serials: [], isNew: !known,
      });
    }
    if (!items.size) throw new Error("The stock report contains no items.");
    const quantity = [...items.values()].reduce((sum, item) => sum + item.quantity, 0);
    if (total !== null && total !== quantity) throw new Error(`Stock total ${total} does not match parsed quantity ${quantity}.`);
    let currentCode = "", location = "";
    const seen = new Set(), shared = new Map();
    for (let index = sh.index + 1; index < serialRows.length; index++) {
      const row = serialRows[index];
      if (/^total$/i.test(text(row[sh.at("item code")]))) continue;
      if (text(row[sh.at("item code")])) currentCode = code(row[sh.at("item code")]);
      const serial = text(row[sh.at("serial no")]);
      if (!serial && row.every(value => !text(value))) continue;
      if (!serial) throw new Error(`Serial row ${index + 1}: missing serial.`);
      const item = items.get(currentCode);
      if (!item) throw new Error(`Serial row ${index + 1}: barcode ${currentCode} is absent from the stock report.`);
      const loc = text(row[sh.at("loc code")]);
      if (!loc || location && loc !== location) throw new Error("The serialized report must contain exactly one store location.");
      location = loc;
      const received = day(row[sh.at("tran date")]);
      if (received > today) throw new Error(`Serial row ${index + 1}: received date is in the future.`);
      const key = `${currentCode.toLowerCase()}\0${serial.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`Duplicate serial ${serial} within barcode ${currentCode}.`);
      seen.add(key);
      item.serialized = true;
      item.serials.push({ serial, received_on: received });
      const owners = shared.get(serial.toLowerCase()) || new Set();
      owners.add(currentCode); shared.set(serial.toLowerCase(), owners);
    }
    for (const item of items.values()) {
      if (item.serialized && item.quantity !== item.serials.length) throw new Error(`Barcode ${item.barcode}: stock quantity ${item.quantity} differs from its ${item.serials.length} serials.`);
    }
    const locationColumns = stockRows[h.index].filter(value => text(value) && !["item code", "item name", "total"].includes(text(value).toLowerCase()));
    if (locationColumns.length !== 1) throw new Error("Choose a quantity report for one branch only.");
    const normalizeLocation = value => text(value).toLowerCase().replace(/^[a-z0-9]+\s*-\s*/, "").replace(/\s+/g, " ");
    if (location && normalizeLocation(location) !== normalizeLocation(locationColumns[0])) throw new Error("The stock and serial reports refer to different branches.");
    return {
      items: [...items.values()], quantity, serialQuantity: seen.size, location: text(locationColumns[0]),
      newProducts: [...items.values()].filter(item => item.isNew).length,
      sharedSerials: [...shared].filter(([, owners]) => owners.size > 1).map(([serial, owners]) => ({ serial, barcodes: [...owners] })),
    };
  }
  function brandMatches(item, profile, profiles, catalog) {
    const norm = value => text(value).toLowerCase();
    const parts = assignment => text(assignment).split("/").filter(Boolean).map(part => {
      part = norm(part);
      const at = catalog.some(product => norm(product.brand) === part) ? -1 : part.indexOf("-");
      return { brand: at < 0 ? part : part.slice(0, at).trim(), scope: at < 0 ? "" : part.slice(at + 1).trim() };
    });
    const scopeMatches = scope => [item.category, item.sub_category, item.model_description || item.description].some(value => norm(value).includes(scope));
    return parts(profile.assigned_brand).some(part => norm(item.brand) === part.brand && (part.scope ? scopeMatches(part.scope)
      : !profiles.filter(person => person.role === "ps" && person.active && person.branch_id === profile.branch_id && person.id !== profile.id)
        .flatMap(person => parts(person.assigned_brand)).some(other => other.brand === part.brand && other.scope && scopeMatches(other.scope))));
  }
  const api = { code, day, ageDays, parseReports, brandMatches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BranchlineInventory = api;
})(typeof window !== "undefined" ? window : globalThis);
