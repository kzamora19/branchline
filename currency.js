// Shared currency input parsing for the prototype and authenticated app.
window.parseCurrency = function parseCurrency(value) {
  const text = String(value ?? "").trim();
  if (!text || !/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const amount = Number(text.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
};

window.formatCurrencyInput = function formatCurrencyInput(value) {
  const amount = window.parseCurrency(value);
  return amount === null
    ? String(value ?? "")
    : amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
