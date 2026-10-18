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

// Remove display grouping while an amount is being edited. Keep the caret
// before the decimal part so typing another digit extends the whole amount.
window.prepareCurrencyInput = function prepareCurrencyInput(input) {
  const value = String(input.value ?? "").replace(/,/g, "");
  input.value = value;
  const caret = value.indexOf(".") === -1 ? value.length : value.indexOf(".");
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(caret, caret);
};

if (typeof document !== "undefined") {
  document.addEventListener("focusin", event => {
    const input = event.target;
    if (input?.tagName === "INPUT"
      && ["price", "srp"].includes(input.name)
      && input.closest(".sale-row, .sale-line")) {
      window.prepareCurrencyInput(input);
    }
  });
}

