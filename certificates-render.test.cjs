/* Render real pdfmake PDFs in CI, then verify A4 dimensions, page counts,
 * expected recipient labels and absence of content spilling onto extra pages.
 * This intentionally uses the SAME certificateDocument exported by the app. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

function directory() {
  const out = process.env.CERT_RENDER_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "branchline-certs-"));
  fs.mkdirSync(out, { recursive: true });
  return out;
}
const output = directory();
function generate(pdfMake, doc, name) {
  return new Promise((resolve, reject) => {
    pdfMake.createPdf(doc).getBuffer(buffer => {
      try {
        const filename = path.join(output, name);
        fs.writeFileSync(filename, Buffer.from(buffer));
        resolve(filename);
      } catch (error) { reject(error); }
    });
  });
}
function setupPdfMake() {
  const pdfMake = require("pdfmake/build/pdfmake");
  const vfsFonts = require("pdfmake/build/vfs_fonts");
  pdfMake.vfs = vfsFonts.pdfMake?.vfs || vfsFonts;
  pdfMake.fonts = { Roboto: {
    normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf",
  } };
  return pdfMake;
}

test("real pdfmake generates correctly paginated one-person and ten-person A4 landscape certificates", async () => {
  const { certificateDocument } = await import("./ps-certificates.mjs");
  const { certificatePeriodRange } = await import("./certificate-periods.mjs");
  const pdfMake = setupPdfMake();
  const people = Array.from({ length: 10 }, (_, i) => ({
    id: "ps-" + (i + 1), name: i === 9
      ? "ALEXANDRA MARIE CHRISTINE DELOS SANTOS FERNANDEZ"
      : "TEST RECIPIENT " + String(i + 1).padStart(2, "0"),
    rank: i + 1,
    total: 1234567.89 + i * 320,
    branch: i % 2 ? "Tuguegarao" : "Santiago",
    brand: "Long Brand Assignment / Another Brand",
  }));
  const options = {
    period: "November 2026 — Month-to-date performance",
    scope: "Cauayan, Ilagan, Santiago, Tuguegarao",
    basis: "Selling price",
    filters: "All brands and categories",
    issuedOn: "2026-11-18",
    branchManagerName: "MARINA C. SANTOS",
    districtManagerName: "ELENA D. CRUZ",
  };
  const one = await generate(pdfMake, certificateDocument(people.slice(0, 1), options), "award-one.pdf");
  const annualOptions = {
    ...options,
    period: certificatePeriodRange("annual", "2025", "2026-11-19").label,
  };
  const annual = await generate(pdfMake, certificateDocument(people.slice(0, 1), annualOptions), "award-annual.pdf");
  const ten = await generate(pdfMake, certificateDocument(people, options), "awards-ten.pdf");
  const longRecipients = people.map((person, i) => i !== 9 ? person : {
    ...person,
    name: "ALEXANDRA MARIE CHRISTINE DELOS SANTOS FERNANDEZ MONTEVERDE DE LA CRUZ",
    branch: "Santiago Branch, Cagayan Valley Regional Sales Operations",
    brand: "Long Brand Name, Another Long Brand Name, and Retail Brand",
  });
  const long = await generate(pdfMake, certificateDocument(longRecipients, options), "awards-long-names.pdf");
  for (const [file, pages] of [[one, 1], [annual, 1], [ten, 10], [long, 10]]) {
    const metadata = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const count = Number(metadata.match(/^Pages:\s+(\d+)/m)?.[1]);
    const dimensions = metadata.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)/m);
    assert.equal(count, pages, "one award per PDF page, including long names");
    assert.ok(dimensions, "PDF page size available");
    const [width, height] = dimensions.slice(1).map(Number);
    assert.ok(width > 840 && width < 843 && height > 594 && height < 597,
      "A4 landscape page uses 841.9 x 595.3 points");
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    assert.equal((text.match(/CERTIFICATE OF RECOGNITION/g) || []).length, pages,
      "one centered certificate heading per page");
    assert.ok(text.includes("RANK #1"), "award rank is rendered");
    assert.ok(text.includes("MARINA C. SANTOS"), "BM name is in actual PDF text");
    assert.ok(text.includes("ELENA D. CRUZ"), "District Manager name is in actual PDF text");
    assert.ok(text.includes("This certificate is proudly presented to"), "approved introduction is present");
    assert.ok(!text.includes("Credited sales:"), "credited sales must remain omitted");
    assert.ok(!text.includes("Award scope:"), "award scope must remain omitted");
    assert.ok(text.includes("Issued: 2026-11-18"), "issued date is printed");
  }
  const annualText = execFileSync("pdftotext", [annual, "-"], { encoding: "utf8" });
  assert.ok(annualText.includes("Year 2025"), "Annual certificate prints the selected calendar year");
  assert.ok(annualText.includes("Annual Performance"), "Annual label appears in the PDF");
  const text = execFileSync("pdftotext", [ten, "-"], { encoding: "utf8" });
  assert.ok(text.includes("ALEXANDRA MARIE CHRISTINE"), "long name actually rendered");
  const longText = execFileSync("pdftotext", [long, "-"], { encoding: "utf8" });
  assert.ok(longText.includes("MONTEVERDE DE LA CRUZ"), "very long test name is not clipped or omitted");
  assert.ok(text.includes("RANK #10"), "final recipient appears");
  console.log("Verified real PDFs: " + one + " (1 page), " + ten + " (10 pages).");
});
