import { barcode } from "./core.mjs";

// Amounts are integer centavos; split quantities when rounding gives different unit values.
export function allocatePromotion(totalCents, components) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 999999999999) {
    throw new Error("Enter a valid non-negative bundle total in centavos.");
  }
  if (!Array.isArray(components) || !components.length) {
    throw new Error("A bundle must have at least one reviewed product component.");
  }
  const ids = new Set();
  const rows = components.map(component => {
    if (!component || typeof component.id !== "string" || !component.id.trim() || ids.has(component.id)) {
      throw new Error("Each bundle component must have a unique identifier.");
    }
    ids.add(component.id);
    if (typeof component.barcode !== "string" || !barcode(component.barcode)) {
      throw new Error("Each bundle component must have a product barcode.");
    }
    if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) {
      throw new Error("Bundle component quantities must be positive whole numbers.");
    }
    if (typeof component.free !== "boolean") {
      throw new Error("Each bundle component must be marked paid or free.");
    }
    if (!component.free && (!Number.isSafeInteger(component.srpCents) || component.srpCents < 0 || component.srpCents > 999999999999)) {
      throw new Error("Each paid bundle component needs a valid standard SRP in centavos.");
    }
    return {
      id: component.id,
      barcode: barcode(component.barcode),
      quantity: component.quantity,
      free: component.free,
      weight: component.free ? 0n : BigInt(component.srpCents),
    };
  });
  const weight = rows.reduce((sum, row) => sum + row.weight * BigInt(row.quantity), 0n);
  if (weight === 0n) throw new Error("A bundle needs at least one paid product with a positive SRP to allocate its total.");

  const total = BigInt(totalCents);
  for (const row of rows) {
    const numerator = total * row.weight;
    row.base = numerator / weight;
    row.remainder = numerator % weight;
    row.extra = 0;
  }
  let left = total - rows.reduce((sum, row) => sum + row.base * BigInt(row.quantity), 0n);
  const ranked = rows.filter(row => !row.free).sort((a, b) =>
    a.remainder === b.remainder ? (a.id < b.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    const extra = left < BigInt(row.quantity) ? left : BigInt(row.quantity);
    row.extra = Number(extra);
    left -= extra;
  }
  if (left !== 0n) throw new Error("Bundle allocation could not be balanced.");
  return rows.map(row => ({
    id: row.id,
    barcode: row.barcode,
    free: row.free,
    units: [
      ...(row.extra ? [{ quantity: row.extra, unitCents: Number(row.base + 1n) }] : []),
      ...(row.quantity > row.extra ? [{ quantity: row.quantity - row.extra, unitCents: Number(row.base) }] : []),
    ],
  }));
}
