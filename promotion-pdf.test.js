const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const modulePromise = import("./import-engine/promotion-pdf.mjs");

function fakePdf(pages) {
  const state = { destroyed: 0, cleaned: 0 };
  return {
    state,
    getDocument: options => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async number => ({
          getTextContent: async () => ({ items: pages[number - 1] }),
          cleanup: () => { state.cleaned++; },
        }),
      }),
      destroy: async () => { state.destroyed++; },
      bytes: options.data,
    }),
  };
}
const item = text => ({ str: text, transform: [1, 0, 0, 1, 10, 20], width: 15, height: 7, dir: "ltr", hasEOL: true });

test("PDF inspection retains source text and position without guessing prices or barcodes", async () => {
  const { inspectPromotionPdf } = await modulePromise;
  const pdf = fakePdf([[item("00065122"), item("BUY1 GET1")], []]);
  const result = await inspectPromotionPdf(pdf, new Uint8Array([1, 2]), "  offer.pdf  ");
  assert.equal(result.sourceName, "offer.pdf");
  assert.deepEqual(result.pages[0].items[0], {
    text: "00065122", transform: [1, 0, 0, 1, 10, 20], width: 15, height: 7, direction: "ltr", endOfLine: true,
  });
  assert.match(result.pages[1].warnings[0], /OCR/);
  assert.equal(pdf.state.cleaned, 2);
  assert.equal(pdf.state.destroyed, 1);
});

test("invalid inputs and malformed positions fail visibly and release resources", async () => {
  const { inspectPromotionPdf } = await modulePromise;
  await assert.rejects(inspectPromotionPdf(null, new Uint8Array([1]), "x.pdf"), /reader/);
  await assert.rejects(inspectPromotionPdf(fakePdf([]), new Uint8Array(), "x.pdf"), /nonempty/);
  await assert.rejects(inspectPromotionPdf(fakePdf([]), new Uint8Array([1]), ""), /source name/);
  const pdf = fakePdf([[{ ...item("bad"), transform: [1, 2] }]]);
  await assert.rejects(inspectPromotionPdf(pdf, new Uint8Array([1]), "x.pdf"), /position/);
  assert.equal(pdf.state.cleaned, 1);
  assert.equal(pdf.state.destroyed, 1);
  const empty = fakePdf([]);
  await assert.rejects(inspectPromotionPdf(empty, new Uint8Array([1]), "x.pdf"), /between 1 and 100/);
  assert.equal(empty.state.destroyed, 1);
});

test("candidate suggestions retain source evidence and flag duplicate barcodes without choosing a price", async () => {
  const { promotionPdfCandidates } = await modulePromise;
  const positioned = (text, x, y) => ({ text, transform: [1, 0, 0, 1, x, y] });
  const result = promotionPdfCandidates({ sourceName: "offer.pdf", pages: [{ number: 1, items: [
    positioned("00123456", 10, 100), positioned("Buy1 get1 fan", 60, 100), positioned("₱1,000.00", 200, 100),
    positioned("123456", 10, 90), positioned("Another term", 60, 90), positioned("₱1,200.00", 200, 90),
  ] }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].barcode, "00123456");
  assert.equal(result[0].description, "Buy1 get1 fan");
  assert.match(result[0].sourceExcerpt, /₱1,000.00/);
  assert.match(result[0].warnings[0], /more than once/);
  assert.equal("price" in result[0], false);
});

test("price suggestions use named columns and do not confuse installment prices with tag price", async () => {
  const { promotionPdfCandidates } = await modulePromise;
  const item = (text, x, y, width = 10) => ({ text, transform: [1, 0, 0, 1, x, y], width });
  const rows = promotionPdfCandidates({ sourceName: "offers.pdf", pages: [{ number: 1, items: [
    item("SRP", 200, 200, 20), item("TAG THIS", 300, 200, 40), item("12 MOS", 400, 200, 40),
    item("12345", 10, 180), item("FAN", 60, 180),
    item("1,000.00", 190, 180, 40), item("900.00", 300, 180, 40), item("1,100.00", 400, 180, 40),
    item("12346", 10, 160), item("FAN", 60, 160), item("1,200.00", 400, 160, 40),
  ] }] });
  assert.equal(rows[0].memoSrp, 1000);
  assert.equal(rows[0].tagPrice, 900);
  assert.equal(rows[1].tagPrice, null);
});

test("all supplied promotional PDFs contain selectable text", { skip: !process.env.BRANCHLINE_PDFJS }, async () => {
  const { inspectPromotionPdf, promotionPdfCandidates } = await modulePromise;
  const pdfjs = await import(pathToFileURL(process.env.BRANCHLINE_PDFJS));
  const directory = path.join(__dirname, "PROMOTIONS");
  const files = fs.readdirSync(directory).filter(name => /\.pdf$/i.test(name));
  assert.equal(files.length, 6);
  for (const name of files) {
    const result = await inspectPromotionPdf(pdfjs, new Uint8Array(fs.readFileSync(path.join(directory, name))), name);
    assert.ok(result.pages.length > 0, name);
    assert.ok(result.pages.every(page => page.items.length > 0), name);
    assert.ok(result.pages.flatMap(page => page.items).some(part => /\d{4,8}/.test(part.text)), name);
    const candidates = promotionPdfCandidates(result);
    assert.ok(candidates.length > 0, `${name}: no candidate product rows`);
    if (name.includes("FURNITURE")) {
      assert.equal(candidates[0].validFrom, "");
      assert.equal(candidates[0].validTo, "");
    } else {
      assert.equal(candidates[0].validTo, "2026-12-31", name);
      assert.equal(candidates[0].validFrom, name.includes("SMALL APPS") ? "2026-10-01" : "2026-09-01", name);
    }
    if (name.includes("Below 1k")) {
      const duplicates = candidates.filter(row => row.barcode === "57633");
      assert.equal(duplicates.length, 2);
      assert.ok(duplicates.every(row => row.warnings.some(warning => /more than once/.test(warning))));
    }
  }
});
