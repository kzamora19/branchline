import { barcode } from "./core.mjs";
import { allocatePromotion } from "./promotion-allocation.mjs";

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// This prepares a preview only; authorization, stock checks and persistence belong to the server transaction.
export function prepareBundleSale(offer, catalog, soldOn, totalCents) {
  if (!offer || typeof offer !== "object" || typeof offer.barcode !== "string" || !barcode(offer.barcode)) {
    throw new Error("Choose a promotion with a barcode.");
  }
  if (offer.mappingReviewed !== true) throw new Error("A manager must review the bundle product mapping first.");
  if (!Array.isArray(offer.components) || !offer.components.length) throw new Error("The bundle has no reviewed product components.");
  if (!Array.isArray(catalog)) throw new Error("The branch product catalog is unavailable.");
  if (!validDate(soldOn)) throw new Error("Enter a valid sale date.");
  for (const date of [offer.validFrom, offer.validTo]) {
    if (date != null && date !== "" && !validDate(date)) throw new Error("The promotion has an invalid date.");
  }
  if (offer.validFrom && offer.validTo && offer.validFrom > offer.validTo) throw new Error("The promotion end date precedes its start date.");
  if (offer.validFrom && soldOn < offer.validFrom || offer.validTo && soldOn > offer.validTo) {
    throw new Error("The promotion is not active on the sale date.");
  }
  const warnings = [];
  if (!offer.validFrom || !offer.validTo) warnings.push("The promotion period is incomplete; confirm its validity.");
  if (offer.priceConflict === true) warnings.push("The source contains conflicting promotion prices; confirm the bundle price.");
  if (typeof offer.priceConflict !== "boolean") throw new Error("Promotion price-conflict review status is required.");
  const products = new Map();
  for (const item of catalog) {
    if (!item || typeof item.barcode !== "string" || !barcode(item.barcode)) continue;
    const code = barcode(item.barcode);
    if (products.has(code)) throw new Error(`The branch catalog contains duplicate barcode ${code}.`);
    products.set(code, item);
  }
  const components = offer.components.map(component => {
    if (!component || typeof component.barcode !== "string") throw new Error("A bundle component has no product barcode.");
    const code = barcode(component.barcode);
    const product = products.get(code);
    if (!product || product.active !== true) throw new Error(`Bundle product ${code || "(blank)"} is not active in the branch catalog.`);
    return { ...component, barcode: code, srpCents: product.srpCents };
  });
  return {
    promotionBarcode: barcode(offer.barcode),
    totalCents,
    warnings,
    components: allocatePromotion(totalCents, components),
  };
}

export function validateWholeBundleReturn(bundleLines, selections) {
  if (!Array.isArray(bundleLines) || !bundleLines.length || !Array.isArray(selections)) {
    throw new Error("Bundle return details are unavailable.");
  }
  const ids = new Set();
  for (const line of bundleLines) {
    if (!line || typeof line.id !== "string" || !line.id || ids.has(line.id) ||
      !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
      !Number.isSafeInteger(line.remaining) || line.remaining < 0 || line.remaining > line.quantity) {
      throw new Error("Bundle return details are invalid.");
    }
    ids.add(line.id);
  }
  const chosen = new Map();
  for (const selection of selections) {
    if (!selection || typeof selection.line_id !== "string" || chosen.has(selection.line_id)) {
      throw new Error("A return line cannot be selected more than once.");
    }
    chosen.set(selection.line_id, selection.quantity);
  }
  const selected = bundleLines.filter(line => chosen.has(line.id));
  if (!selected.length) return;
  if (bundleLines.some(line => line.remaining !== line.quantity ||
    chosen.get(line.id) !== line.quantity)) {
    throw new Error("Return every item in the complete bundle together.");
  }
}
