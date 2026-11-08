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
            form.addEventListener("submit", event => event.preventDefault());
            options.onReady(form);
          },
        });
      });
      await page.locator('[name="branch"]').selectOption("branch");
      await page.locator('[name="file"]').setInputFiles({ name: "ordinary.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") });
      await page.locator("[data-read-pdf]").click();
      await page.waitForFunction(() => /3 candidate rows found/.test(document.querySelector("[data-pdf-status]").textContent));
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /2 ready to import; 1 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /Bundle or free-item terms/);
      await page.locator("[data-import-ready]").click();
      await page.waitForFunction(() => /Imported 1 promotion\(s\) before an error/.test(document.querySelector("[data-import-status]").textContent));
      assert.equal((await page.evaluate(() => window.calls)).length, 1);
      await page.locator("[data-prepare-import]").click();
      await page.waitForFunction(() => /1 ready to import; 2 need review/.test(document.querySelector("[data-import-status]").textContent));
      assert.match(await page.locator("[data-import-results]").innerText(), /already uses this barcode/);
      await page.close();
    }
  } finally { await browser.close(); }
});
