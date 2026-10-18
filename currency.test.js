const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "currency.js"), "utf8"), context);
const parseCurrency = context.window.parseCurrency;
const formatCurrencyInput = context.window.formatCurrencyInput;

test("parses plain and correctly grouped currency amounts", () => {
  assert.equal(parseCurrency("1234.50"), 1234.5);
  assert.equal(parseCurrency("1,234.50"), 1234.5);
});

test("rejects blank, invalid, malformed grouping, and currency-prefixed values", () => {
  for (const value of ["", "   ", "abc", "12,34.50", String.fromCharCode(0x20b1) + "1,234.50"]) {
    assert.equal(parseCurrency(value), null, JSON.stringify(value));
  }
});

test("calculates quantity times the parsed grouped unit price", () => {
  const unitPrice = parseCurrency("1,234.50");
  assert.equal(unitPrice * 2, 2469);
  assert.equal((unitPrice * 2).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "2,469.00");
});

test("formats price fields with grouping and two decimal places", () => {
  assert.equal(formatCurrencyInput("9000"), "9,000.00");
  assert.equal(formatCurrencyInput("1,234.50"), "1,234.50");
  assert.equal(formatCurrencyInput(""), "");
});

test("formats SRP values using the same currency display", () => {
  assert.equal(formatCurrencyInput("11085"), "11,085.00");
});
