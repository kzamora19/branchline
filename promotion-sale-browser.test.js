"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const playwright = process.env.BRANCHLINE_PLAYWRIGHT ? require(process.env.BRANCHLINE_PLAYWRIGHT) : null;
const chrome = process.env.BRANCHLINE_CHROME;
const root = process.env.BRANCHLINE_TEST_ROOT || __dirname;

test("promotion sales show one price, actual products and stock protection on desktop and mobile", { skip: !playwright || !chrome }, async () => {
  const browser = await playwright.chromium.launch({ executablePath: chrome });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "branchline.test") return route.abort();
        const filename = path.resolve(root, "." + url.pathname.replace(/\/$/, "/index.html"));
        if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.fulfill({ status: 404 });
        const contentType = ({ ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css" })[path.extname(filename)] || "application/octet-stream";
        let body = fs.readFileSync(filename);
        if (path.basename(filename) === "auth-app.js") body = Buffer.from(body.toString().replace(
          'if (!sale && !demoStore && currentProfile?.role === "ps")',
          'if (!sale && currentProfile?.role === "ps")'
        ).replace("  function renderDemoControls() {", `
          window.promotionSaleTest = {
            capture: () => { window.promotionSaleCalls = []; client.rpc = async (name,args) => {
              window.promotionSaleCalls.push({name,args}); return {data:"fixture-sale",error:null};
            }; refreshData = async () => {}; },
            open: quantity => {
              const product = saleProducts().find(item => item.srp != null);
              const other = saleProducts().find(item => item.srp != null && item.barcode !== product?.barcode);
              if (!product || !other) throw new Error("No fixture products with SRP");
              liveData.inventoryStock = [{branch_id:currentProfile.branch_id,barcode:product.barcode,quantity,serialized:false},
                {branch_id:currentProfile.branch_id,barcode:other.barcode,quantity:10,serialized:false}];
              window.promotionOtherProduct = productLabel(other);
              liveData.inventoryError = null;
              openSaleModal(null,{id:"fixture",barcode:"00065122",description:"Buy five get one",source_name:"fixture.pdf",
                source_page:1,source_excerpt:"BUY5 GET1 fixture",valid_from:"2026-01-01",valid_to:"2026-12-31",price_conflict:false,
                components:[{barcode:product.barcode,quantity:5,free:false},{barcode:product.barcode,quantity:1,free:true}]});
              return product.barcode;
            },
            openRegular: (missingPrice = false, duplicate = false, secondBundle = false) => {
              const product = saleProducts().find(item => item.srp != null);
              const other = saleProducts().find(item => item.srp != null && item.barcode !== product?.barcode);
              liveData.inventoryStock = [{branch_id:currentProfile.branch_id,barcode:product.barcode,quantity:10,serialized:false},
                {branch_id:currentProfile.branch_id,barcode:other.barcode,quantity:10,serialized:false}];
              liveData.inventoryError = null;
              window.promotionOtherProduct = productLabel(other);
              fetchAllFrom = async () => ({error:null,data:[{id:"expired",barcode:"00065433",description:"Older offer",
                valid_from:"2020-01-01",valid_to:"2020-12-31",components:[]},{id:"fixture",barcode:"00065433",description:"Buy five get one",
                tag_price:missingPrice ? null : 99.50,memo_srp:120,source_name:"fixture.pdf",source_page:1,source_excerpt:"BUY5 GET1",
                valid_from:"2026-01-01",valid_to:"2026-12-31",price_conflict:false,
                components:[{barcode:product.barcode,quantity:5,free:false},{barcode:product.barcode,quantity:1,free:true}]}]});
              if (duplicate) {
                const original = fetchAllFrom;
                fetchAllFrom = async () => {
                  const result = await original();
                  return {...result,data:[...result.data,{...result.data[1],id:"fixture-other",tag_price:109.5,source_name:"other-offer.pdf"}]};
                };
              }
              if (secondBundle) {
                const original = fetchAllFrom;
                fetchAllFrom = async () => {
                  const result = await original();
                  return {...result,data:[...result.data,{...result.data[1],id:"fixture-second",barcode:"00065138",
                    description:"Second bundle",tag_price:1749,components:[{barcode:product.barcode,quantity:1,free:false},
                      {barcode:other.barcode,quantity:1,free:false}]}]};
                };
              }
              openSaleModal();
              return product.barcode;
            },
          };
          function renderDemoControls() {`));
        return route.fulfill({ status: 200, contentType, body });
      });
      await page.goto("https://branchline.test/");
      await page.getByRole("button", { name: "Explore the sample demo instead", exact: true }).click();
      await page.locator("#demo-role").waitFor({ timeout: 15000 });
      const previous = await page.locator("#demo-role").elementHandle();
      await page.locator("#demo-role").selectOption("ps");
      await page.waitForFunction(element => !element.isConnected, previous);
      const barcode = await page.evaluate(() => window.promotionSaleTest.open(5));
      let dialog = page.getByRole("dialog", { name: "Record a promotion sale" });
      assert.equal(await dialog.locator(".sale-row").count(), 1);
      assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "6");
      assert.equal(await dialog.locator('[name="code"]').inputValue(), barcode);
      assert.equal(await dialog.locator('[name="price"]').isVisible(), false);
      assert.equal(await dialog.locator('[name="quantity"]').evaluate(node => node.readOnly), true);
      assert.equal(await dialog.locator('[name="bundle_price"]').inputValue(), "");
      assert.equal(await dialog.locator('[name="bundle_price"]').evaluate(node => node.validity.valueMissing), true);
      assert.equal(await dialog.locator("#sale-total").textContent(), "Enter bundle price");
      assert.equal(await dialog.locator('[name="bundle_price"]').getAttribute("placeholder"), "Enter bundle selling price (PHP)");
      await dialog.locator('[name="bundle_price"]').fill("999");
      assert.match(await dialog.locator("#sale-total").textContent(), /999/);
      await dialog.locator("form").evaluate(form => form.requestSubmit());
      assert.equal(await page.getByRole("dialog", { name: "Item availability" }).count(), 1);
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => window.promotionSaleTest.open(6));
      dialog = page.getByRole("dialog", { name: "Record a promotion sale" });
      assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "6");
      await page.evaluate(() => window.promotionSaleTest.capture());
      await dialog.locator('[name="customer"]').fill("Test customer");
      await dialog.locator('[name="invoice"]').fill("TEST-PROMO");
      await dialog.locator('[name="city"]').fill("Santiago");
      await dialog.locator('[name="barangay"]').fill("Sample");
      await dialog.locator('[name="fulfillment"]').selectOption("pickup");
      const payment = await dialog.locator('[name="payment"] option').evaluateAll(options => options.find(option => option.value)?.value);
      assert.ok(payment);
      await dialog.locator('[name="payment"]').selectOption(payment);
      await dialog.locator('[name="bundle_price"]').fill("999");
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill(await page.evaluate(() => window.promotionOtherProduct));
      await dialog.locator(".sale-row").last().locator('[name="price"]').fill("50");
      assert.match(await dialog.locator("#sale-total").textContent(), /1,049/);
      await dialog.getByRole("button", { name: "Save sale" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const calls = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(calls[0].name, "save_promotion_sale");
      assert.equal(calls[0].args.p_promotion, "fixture");
      assert.equal(calls[0].args.p_bundle_total, 999);
      assert.equal(calls[0].args.p_regular_lines.length, 1);
      assert.equal(calls[0].args.p_regular_lines[0].selling_price, 50);
      await page.evaluate(() => window.promotionSaleTest.openRegular());
      dialog = page.getByRole("dialog", { name: "Record a sale", exact: true });
      await dialog.locator('[name="customer"]').fill("Keep customer");
      await dialog.locator('[name="product"]').fill("65433");
      await dialog.locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Keep customer");
      assert.equal(await dialog.locator('[name="bundle_price"]').inputValue(), "99.5");
      assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "6");
      assert.equal(await dialog.locator('[name="code"]').inputValue(), barcode);
      assert.equal(await dialog.locator('[name="srp"]').isVisible(), true);
      assert.equal(await dialog.locator('.sale-row [name="product"]').locator("xpath=../span").isVisible(), false);
      assert.equal(await dialog.locator("[data-promotion-header]").getByText("Included inventory products").count(), 0);
      assert.equal(await dialog.locator("[data-promotion-header]").getByText(/Memo SRP|Source:/).count(), 0);
      assert.equal(await dialog.locator('[name="bundle_price"]').getAttribute("aria-label"), "Bundle selling price (PHP)");
      assert.match(await dialog.locator("#sale-total").textContent(), /99.50/);
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill(await page.evaluate(() => window.promotionOtherProduct));
      await dialog.locator(".sale-row").last().locator('[name="price"]').fill("50");
      assert.match(await dialog.locator("#sale-total").textContent(), /149.50/);
      await dialog.locator("[data-remove-promotion]").click();
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Keep customer");
      assert.equal(await dialog.locator(".sale-row").count(), 1);
      assert.match(await dialog.locator("#sale-total").textContent(), /50/);
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill("65433");
      await dialog.locator(".sale-row").last().locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Keep customer");
      await page.evaluate(() => window.promotionSaleTest.capture());
      await dialog.locator('[name="invoice"]').fill("TEST-INLINE");
      await dialog.locator('[name="city"]').fill("Santiago");
      await dialog.locator('[name="barangay"]').fill("Sample");
      await dialog.locator('[name="fulfillment"]').selectOption("pickup");
      await dialog.locator('[name="payment"]').selectOption(payment);
      await dialog.getByRole("button", { name: "Save sale" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const inlineCalls = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(inlineCalls[0].name, "save_promotion_sale");
      assert.equal(inlineCalls[0].args.p_bundle_total, 99.5);
      assert.equal(inlineCalls[0].args.p_regular_lines.length, 1);
      assert.equal(inlineCalls[0].args.p_regular_lines[0].selling_price, 50);
      await page.evaluate(() => window.promotionSaleTest.openRegular(true));
      dialog = page.getByRole("dialog", { name: "Record a sale", exact: true });
      await dialog.locator('[name="product"]').fill("65433");
      await dialog.locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator("#sale-total").textContent(), "Enter bundle price");
      assert.match(await dialog.locator("[data-sale-promotion-status]").textContent(), /no saved selling price/i);
      await dialog.locator('[name="bundle_price"]').fill("3479");
      assert.match(await dialog.locator("#sale-total").textContent(), /3,479/);
      await page.evaluate(() => window.promotionSaleTest.openRegular(false, true));
      dialog = page.getByRole("dialog", { name: "Record a sale", exact: true });
      await dialog.locator('[name="product"]').fill("65433");
      await dialog.locator('[name="product"]').dispatchEvent("change");
      assert.equal(await dialog.locator("[data-promotion-header]").count(), 0);
      assert.equal(await dialog.locator('[name="product"]').evaluate(input => input.checkValidity()), false);
      assert.match(await dialog.locator("[data-sale-promotion-status]").textContent(), /Choose a specific promotion/);
      const choices = await dialog.locator("#sale-products option").evaluateAll(options => options.map(option => option.value));
      const chosen = choices.find(value => value.includes("other-offer.pdf"));
      assert.ok(chosen);
      await dialog.locator('[name="product"]').fill(chosen);
      await dialog.locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator('[name="bundle_price"]').inputValue(), "109.5");
      assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "6");
      await dialog.locator('[name="bundle_price"]').fill("105");
      assert.match(await dialog.locator("#sale-total").textContent(), /105/);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => window.promotionSaleTest.openRegular(false, false, true));
      dialog = page.getByRole("dialog", { name: "Record a sale", exact: true });
      const selectBundle = async code => {
        const input = dialog.locator(".sale-row").last().locator('[name="product"]');
        await input.fill(code);
        await input.dispatchEvent("change");
      };
      await selectBundle("65433");
      await dialog.locator("[data-add-line]").click();
      await selectBundle("65138");
      assert.equal(await dialog.locator("[data-promotion-header]").count(), 2);
      assert.match(await dialog.locator("[data-promotion-header]").last().textContent(), /Promotion barcode 00065138/i);
      assert.equal(await dialog.locator('.sale-row [name="code"]').evaluateAll(nodes => nodes.filter(node => node.value).length), 3);
      assert.equal(await dialog.locator('.sale-inventory-serials:visible').count(), 2);
      assert.match(await dialog.locator("#sale-total").textContent(), /1,848\.50/);
      await page.evaluate(() => window.promotionSaleTest.capture());
      await dialog.locator('[name="customer"]').fill("Test customer");
      await dialog.locator('[name="invoice"]').fill("TEST-TWO-BUNDLES");
      await dialog.locator('[name="city"]').fill("Santiago");
      await dialog.locator('[name="barangay"]').fill("Sample");
      await dialog.locator('[name="fulfillment"]').selectOption("pickup");
      await dialog.locator('[name="payment"]').selectOption(payment);
      await dialog.getByRole("button", { name: "Save sale" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const [multiCall] = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(multiCall.name, "save_promotion_sales");
      assert.deepEqual(multiCall.args.p_bundles.map(bundle => [bundle.promotion, bundle.bundle_total]), [["fixture", 99.5], ["fixture-second", 1749]]);
      assert.deepEqual(multiCall.args.p_regular_lines, []);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
