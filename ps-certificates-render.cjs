// Produces *actual* pdfmake PDFs using fictional awardees, then checks
// A4 landscape geometry, one page per person, and nonempty rendered files.
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

(async () => {
  const PdfPrinter = require("pdfmake");
  const { PDFDocument } = require("pdf-lib");
  const { certificateDocument } = await import("./ps-certificates.mjs");
  const fontDir = path.join(path.dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");
  const printer = new PdfPrinter({
    Roboto: {
      normal: path.join(fontDir, "Roboto-Regular.ttf"),
      bold: path.join(fontDir, "Roboto-Medium.ttf"),
      italics: path.join(fontDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(fontDir, "Roboto-MediumItalic.ttf"),
    },
  });
  const out = path.join(process.cwd(), "certificate-pdf-test-results");
  mkdirSync(out, { recursive: true });
  function render(definition) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const pdf = printer.createPdfKitDocument(definition);
      pdf.on("data", chunk => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
      pdf.end();
    });
  }
  const cases = [
    { count: 1, filename: "top-1-sample.pdf", long: false },
    { count: 10, filename: "top-10-sample.pdf", long: false },
    { count: 10, filename: "top-10-long-names.pdf", long: true },
  ];
  for (const fixture of cases) {
    const awardees = Array.from({ length: fixture.count }, (_, i) => ({
      id: "fictional-" + i, rank: i + 1,
      name: fixture.long
        ? "Fictional Product Specialist With An Exceptionally Long Full Name Number " + (i + 1) + " For Testing"
        : "Fictional Product Specialist " + (i + 1),
      branch: "Example Branch For Layout Review", brand: "Example",
      total: 125000 - 3000 * i,
    }));
    const options = {
      period: "November 1–30, 2026",
      scope: "Example Branch, Example District",
      filters: "All brands / All categories",
      issuedOn: "2026-11-18",
      basis: "Selling-price basis",
    };
    const definition = certificateDocument(awardees, options);
    const buffer = await render(definition);
    const parsed = await PDFDocument.load(buffer);
    assert.equal(parsed.getPageCount(), fixture.count,
      fixture.filename + " overflowed or omitted a certificate");
    for (const page of parsed.getPages()) {
      assert.ok(Math.abs(page.getWidth() - 841.89) < 1, "Page must be A4 landscape width");
      assert.ok(Math.abs(page.getHeight() - 595.28) < 1, "Page must be A4 landscape height");
    }
    assert.ok(buffer.length > 3000, "Generated PDF appears empty");
    writeFileSync(path.join(out, fixture.filename), buffer);
    console.log("PASS", fixture.filename, parsed.getPageCount(), "pages", buffer.length, "bytes");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
