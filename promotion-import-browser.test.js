"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const playwright = process.env.BRANCHLINE_PLAYWRIGHT ? require(process.env.BRANCHLINE_PLAYWRIGHT) : null;
const root = process.env.BRANCHLINE_TEST_ROOT || __dirname;

test("promotion import previews all rows, imports only clear matches, and reports partial failures", {
  skip: !playwright || !process.env.BRANCHLINE_CHROME,
}, async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.BRANCHLINE_CHROME });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname === "cdn.jsdelivr.net") {
          return route.fulfill({ contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: `
            export const GlobalWorkerOptions={};
            const part=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:10,height:10});
            export function getDocument(){return {promise:Promise.resolve({numPages:1,getPage:async()=>({
              getTextContent:async()=>({items:[
                part("TAG THIS",200,110),
                part("12345",10,100),part("FAN",60,100),part("100.00",200,100),
                part("12346",10,90),part("FAN",60,90),part("100.00",200,90),
                part("12347",10,80),part("BUY1 GET1 FAN",60,80),part("100.00",200,80)
              ]}),cleanup(){}})}),destroy:async()=>{}}}
          ` });
        }
        const file = path.join(root, url.pathname.replace(/^\//, ""));
        if (url.hostname !== "branchline.test" || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(file) });
      });

      await page.goto("https://branchline.test/promotion-review-ui.mjs");
      await page.evaluate(async () => {
        const { openPromotionReview } = await import("https://branchline.test/promotion-review-ui.mjs");
        window.calls = [];
        openPromotionReview({
          escapeHTML: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
          branches: [{ id: "branch", name: "Test" }],
          confirm: () => true,
          listProducts: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return ["12345", "12346", "12347"].map(barcode => ({ barcode, srp: 100 }));
          },
          listPromotions: async () => window.calls.map(call => ({ barcode: call.p_barcode })),
          findProducts: async () => [],
          rpc: async (name, args) => {
            if (args.p_barcode === "00012346") throw new Error("Test save failure");
            window.calls.push(args);
          },
          openModal: options => {
            document.body.innerHTML = `<form>${options.body}<button type="submit">Approve</button></form>`;
            const form = document.querySelector("form");
            form.addEventListener("submit", async event => {
              event.preventDefault();
              if (!form.checkValidity()) return;
              try { await options.onSubmit(form); } catch (error) { window.submitError = error.message; }
            });
            options.onReady(form);
          },
        });
      });
      await page.locator("[data-import-details] > summary").click();
      await page.locator('[name="branch"]').selectOption("branch");
      await page.locator('[name="file"]').setInputFiles({ name: "ordinary.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") });
      await page.locator("[data-read-pdf]").click();
      await page.waitForFunction(() => /3 candidate rows found in 1 file/.test(document.querySelector("[data-pdf-status]").textContent));
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /2 ready to import; 1 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /Bundle or free-item terms/);
      await page.locator("[data-import-ready]").click();
      await page.waitForFunction(() => /Imported 1 promotion\(s\) before an error/.test(document.querySelector("[data-import-status]").textContent));
      assert.equal((await page.evaluate(() => window.calls)).length, 1);
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /1 ready to import; 2 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /already uses this barcode/);
      await page.locator('[name="file"]').setInputFiles([
        { name: "one.pdf", mimeType: "application/pdf", buffer: Buffer.from("one") },
        { name: "two.pdf", mimeType: "application/pdf", buffer: Buffer.from("two") },
      ]);
      await page.locator("[data-read-pdf]").click();
      await page.waitForFunction(() => /6 candidate rows found in 2 file/.test(document.querySelector("[data-pdf-status]").textContent));
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /0 ready to import; 6 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /one\.pdf/);
      assert.match(await page.locator("[data-import-results]").innerText(), /two\.pdf/);
      await page.locator('[data-review-row="2"]').click();
      await page.locator('[data-product-code]').fill("12347");
      await page.locator('[name="price_conflict"]').selectOption("true");
      await page.locator('[name="confirm_review"]').check();
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await page.waitForFunction(() => window.calls.length === 2 || window.submitError);
      const manual = (await page.evaluate(() => window.calls))[1];
      assert.equal(manual.p_barcode, "12347");
      assert.equal(manual.p_source_name, "one.pdf");
      assert.equal(manual.p_tag_price, 100);
      assert.equal(manual.p_components[0].barcode, "12347");
      await page.evaluate(() => {
        window.XLSX = {
          read: () => ({ SheetNames: ["Offers"], Sheets: { Offers: {} } }),
          utils: { sheet_to_json: () => [
            ["Barcode", "Description", "SRP", "TAG THIS"],
            ["12345", "Fan", "100", "80"],
          ] },
        };
      });
      await page.locator('[name="file"]').setInputFiles([
        { name: "offer.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("xlsx") },
        { name: "offer.csv", mimeType: "text/csv", buffer: Buffer.from("csv") },
      ]);
      await page.locator("[data-read-pdf]").click();
      await page.waitForFunction(() => /2 candidate rows found in 2 file/.test(document.querySelector("[data-pdf-status]").textContent));
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /0 ready to import; 2 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /offer\.xlsx/);
      assert.match(await page.locator("[data-import-results]").innerText(), /offer\.csv/);
      assert.match(await page.locator("[data-import-results]").innerText(), /more than once/);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("company import checks every branch and replaces an existing offer only after confirmation", {
  skip: !playwright || !process.env.BRANCHLINE_CHROME,
}, async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.BRANCHLINE_CHROME });
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      const file = path.join(root, url.pathname.replace(/^\//, ""));
      if (url.hostname !== "branchline.test" || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(file) });
    });
    await page.goto("https://branchline.test/promotion-review-ui.mjs");
    await page.evaluate(async () => {
      window.XLSX = {
        read: () => ({ SheetNames: ["Offers"], Sheets: { Offers: {} } }),
        utils: { sheet_to_json: () => [["Barcode", "Description", "TAG THIS"], ["12345", "Fan", "90"]] },
      };
      const { openPromotionReview } = await import("https://branchline.test/promotion-review-ui.mjs");
      window.calls = []; window.confirmations = [];
      openPromotionReview({
        escapeHTML: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
        branches: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }],
        companyImport: true,
        confirm: message => { window.confirmations.push(message); return true; },
        listProducts: async branch => branch === "b" ? [] : [
          { barcode: "12345", srp: 100 },
          { barcode: "56682", brand: "CAMEL", model_description: "CAMEL E. KETTLE CK-2010S", srp: 710 },
          { barcode: "29070", brand: "CAMEL", model_description: "CAMEL FLAT IRON CFI1010 NON STICK", srp: 560 },
          { barcode: "36109", brand: "FREE", model_description: "FREE CAMEL FLAT IRON CFI-1010", srp: 0 },
        ],
        listPromotions: async branch => branch === "c" ? [
          { id: "old", barcode: "12345" }, ...(window.oldBundle ? [{ id: "old-bundle", barcode: "65433" }] : []),
        ] :
          window.calls.filter(call => call.args.p_branch === branch).map(call => ({ barcode: call.args.p_barcode })),
        findProducts: async () => [],
        rpc: async (name, args) => { window.calls.push({ name, args }); },
        openModal: options => {
          document.body.innerHTML = `<form>${options.body}<button type="submit">Approve</button></form>`;
          const form = document.querySelector("form");
          form.addEventListener("submit", async event => {
            event.preventDefault();
            if (!form.checkValidity()) return;
            try { await options.onSubmit(form); } catch (error) { window.submitError = error.message; }
          });
          options.onReady(form);
        },
      });
    });
    await page.locator("[data-import-details] > summary").click();
    await page.locator('[name="file"]').setInputFiles({ name: "offer.csv", mimeType: "text/csv", buffer: Buffer.from("csv") });
    await page.locator("[data-import-files]").click();
    await page.waitForFunction(() => /0 promotion\(s\) imported/.test(document.querySelector("[data-simple-status]").textContent));
    assert.equal((await page.evaluate(() => window.calls)).length, 0);
    assert.match(await page.locator("[data-import-results]").innerText(), /start and end dates are needed/);
    await page.locator("[data-read-pdf]").click();
    await page.waitForFunction(() => /1 candidate rows/.test(document.querySelector("[data-pdf-status]").textContent));
    await page.locator("[data-prepare-import]").click();
    await page.waitForFunction(() => /1 ready to import; 2 need review across 3 branches/.test(document.querySelector("[data-import-status]").textContent));
    await page.locator("[data-import-ready]").click();
    await page.waitForFunction(() => /Imported 1 promotion/.test(document.querySelector("[data-import-status]").textContent));
    assert.deepEqual((await page.evaluate(() => window.calls)).map(call => call.args.p_branch), ["a"]);
    assert.equal((await page.evaluate(() => window.confirmations)).length, 0);
    assert.match(await page.locator("[data-import-results]").innerText(), /Beta.*inventory barcode/s);
    assert.match(await page.locator("[data-import-results]").innerText(), /Gamma.*already uses this barcode/s);
    await page.locator('[data-review-row="2"]').click();
    assert.equal(await page.locator('[name="branch"]').inputValue(), "c");
    await page.locator('[data-product-code]').fill("12345");
    await page.locator('[name="price_conflict"]').selectOption("false");
    await page.locator('[name="confirm_review"]').check();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.waitForFunction(() => window.calls.length === 2 || window.submitError);
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls[1].name, "replace_priced_promotion");
    assert.equal(calls[1].args.p_old, "old");
    assert.equal(calls[1].args.p_branch, "c");
    assert.equal((await page.evaluate(() => window.confirmations)).length, 1);
    await page.evaluate(() => {
      window.oldBundle = true;
      window.XLSX.utils.sheet_to_json = () => [
        ["Barcode", "Description", "TAG THIS"], ["65433", "BUY5 GET1 CK-2010S CAMEL", "3479"],
      ];
    });
    await page.locator('[name="file"]').setInputFiles({ name: "bundle.csv", mimeType: "text/csv", buffer: Buffer.from("csv") });
    await page.locator("[data-read-pdf]").click();
    await page.waitForFunction(() => /1 candidate rows/.test(document.querySelector("[data-pdf-status]").textContent));
    await page.locator("[data-prepare-import]").click();
    await page.waitForFunction(() => /1 ready to import; 2 need review across 3 branches/.test(document.querySelector("[data-import-status]").textContent));
    assert.match(await page.locator("[data-import-results]").innerText(), /00056682 × 5 paid, 00056682 × 1 free/);
    await page.locator("[data-import-ready]").click();
    await page.waitForFunction(() => /Imported 1 promotion/.test(document.querySelector("[data-import-status]").textContent));
    const bundleCalls = (await page.evaluate(() => window.calls)).slice(2);
    assert.deepEqual(bundleCalls.map(call => call.args.p_branch), ["a"]);
    assert.equal(bundleCalls[0].args.p_tag_price, 3479);
    assert.deepEqual(bundleCalls[0].args.p_components, [
      { id: "paid", barcode: "00056682", quantity: 5, free: false },
      { id: "free", barcode: "00056682", quantity: 1, free: true },
    ]);
    await page.locator('[data-review-row="2"]').click();
    assert.equal(await page.locator('[name="branch"]').inputValue(), "c");
    assert.equal(await page.locator('[name="tag_price"]').inputValue(), "3479");
    assert.deepEqual(await page.locator("[data-product-quantity]").evaluateAll(inputs => inputs.map(input => input.value)), ["5", "1"]);
    assert.deepEqual(await page.locator("[data-product-free]").evaluateAll(inputs => inputs.map(input => input.value)), ["false", "true"]);
    await page.locator('[name="confirm_review"]').check();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.waitForFunction(() => window.calls.length === 4 || window.submitError);
    const replacement = (await page.evaluate(() => window.calls)).at(-1);
    assert.equal(replacement.name, "replace_priced_promotion");
    assert.equal(replacement.args.p_old, "old-bundle");
    assert.equal(replacement.args.p_tag_price, 3479);
    await page.evaluate(() => {
      window.XLSX.utils.sheet_to_json = () => [
        ["Barcode", "Description", "TAG THIS"], ["65425", "BUY5 GET1 CFI-1010 CAMEL", "2779"],
      ];
    });
    await page.locator('[name="file"]').setInputFiles({ name: "model.csv", mimeType: "text/csv", buffer: Buffer.from("csv") });
    await page.locator("[data-read-pdf]").click();
    await page.waitForFunction(() => /1 candidate rows/.test(document.querySelector("[data-pdf-status]").textContent));
    await page.locator("[data-prepare-import]").click();
    await page.waitForFunction(() => /2 ready to import; 1 need review across 3 branches/.test(document.querySelector("[data-import-status]").textContent));
    assert.match(await page.locator("[data-import-results]").innerText(), /00029070 × 5 paid, 00029070 × 1 free/);
    await page.locator("[data-import-ready]").click();
    await page.waitForFunction(() => /Imported 2 promotion/.test(document.querySelector("[data-import-status]").textContent));
    const modelCalls = (await page.evaluate(() => window.calls)).slice(-2);
    assert.deepEqual(modelCalls.map(call => call.args.p_branch), ["a", "c"]);
    assert.equal(modelCalls[0].args.p_barcode, "00065425");
    assert.deepEqual(modelCalls[0].args.p_components, [
      { id: "paid", barcode: "00029070", quantity: 5, free: false },
      { id: "free", barcode: "00029070", quantity: 1, free: true },
    ]);
    await page.evaluate(() => {
      window.XLSX.utils.sheet_to_json = () => [
        ["Barcode", "Description", "TAG THIS", "Start date", "End date"],
        ["99999", "CFI-1010 CAMEL", "500", "2026-11-01", "2026-11-30"],
      ];
    });
    await page.locator('[name="file"]').setInputFiles({ name: "dated.csv", mimeType: "text/csv", buffer: Buffer.from("csv") });
    await page.locator("[data-import-files]").click();
    await page.waitForFunction(() => /2 promotion\(s\) imported/.test(document.querySelector("[data-simple-status]").textContent));
    const simpleCalls = (await page.evaluate(() => window.calls)).slice(-2);
    assert.deepEqual(simpleCalls.map(call => call.args.p_branch), ["a", "c"]);
    assert.equal(simpleCalls[0].args.p_valid_from, "2026-11-01");
    assert.equal(simpleCalls[0].args.p_valid_to, "2026-11-30");
    assert.match(await page.locator("[data-simple-status]").innerText(), /1 row\(s\) need attention/);
    await page.evaluate(() => {
      window.XLSX.utils.sheet_to_json = () => [
        ["Barcode", "Description", "TAG THIS"], ["99998", "CFI-1010 CAMEL", "500"],
      ];
    });
    await page.locator('[name="file"]').setInputFiles({ name: "undated.csv", mimeType: "text/csv", buffer: Buffer.from("csv") });
    await page.locator('[name="batch_from"]').fill("2026-12-01");
    await page.locator('[name="batch_to"]').fill("2026-12-31");
    const previousCount = (await page.evaluate(() => window.calls)).length;
    await page.locator("[data-import-files]").click();
    await page.waitForFunction(count => window.calls.length === count + 2, previousCount);
    const datedCalls = (await page.evaluate(() => window.calls)).slice(-2);
    assert.equal(datedCalls[0].args.p_valid_from, "2026-12-01");
    assert.equal(datedCalls[0].args.p_valid_to, "2026-12-31");
    await page.close();
  } finally { await browser.close(); }
});
