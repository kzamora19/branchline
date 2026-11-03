(function (root) {
  "use strict";
  function validate(method, amount, allowUnspecified = false) {
    if (!["delivery", "pickup"].includes(method) && !(allowUnspecified && !method)) throw new Error("Choose Delivery or Pick up.");
    if (method === "delivery" && amount === null) throw new Error("Enter a Delivery Guarranty amount. Use 0.00 for free delivery.");
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001)) {
      throw new Error("Delivery Guarranty must be zero or a positive amount with at most two decimal places.");
    }
    if (amount !== null && method !== "delivery") throw new Error("Delivery Guarranty is available for Delivery sales only.");
  }
  function availability(stock, eligibleUnits, quantity, previousQuantity = 0) {
    if (!stock) return { blocked: false, warning: "Inventory is not initialized. Availability cannot be verified." };
    const enough = stock.serialized ? eligibleUnits.length >= quantity : Number(stock.quantity) + previousQuantity >= quantity;
    if (!enough) return { blocked: true, warning: "This item is not available in the requested quantity. Choose another item or reduce the quantity." };
    return { blocked: false, warning: stock.serialized && Number(stock.quantity) === 0
      ? "This item is not available in current inventory. A previously imported unused serial can still be recorded for a late sale." : "" };
  }
  function monitoring(sales, fees, profiles) {
    const bySale = new Map(fees.map(row => [row.sale_id, Number(row.amount)]));
    const people = new Map(profiles.map(row => [row.id, row.full_name]));
    const groups = new Map();
    for (const sale of sales) {
      if (!bySale.has(sale.id)) continue;
      const key = sale.ps_id || `unassigned:${sale.branch_id}:${sale.ps_name || ""}`;
      const group = groups.get(key) || { key, name: people.get(sale.ps_id) || sale.ps_name || "Unassigned", quantity: 0, amount: 0, sales: [] };
      group.quantity++;
      group.amount += bySale.get(sale.id);
      group.sales.push({ ...sale, dg_amount: bySale.get(sale.id) });
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const api = { validate, availability, monitoring };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BranchlineDelivery = api;
})(typeof window !== "undefined" ? window : globalThis);
