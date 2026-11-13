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
          'if (!demoStore && (sale || test || currentProfile?.role === "ps"))',
          'if (sale || test || currentProfile?.role === "ps")'
        ).replace('if (demoStore) return;\n        const detailClient', 'if (demoStore && !window.savedBundleFixture) return;\n        const detailClient')
          .replace('if (!demoStore) {\n        const result = await lookupClient.from("sale_promotion_groups")',
            'if (!demoStore || window.savedBundleFixture) {\n        const result = await lookupClient.from("sale_promotion_groups")')
          .replace("  function renderDemoControls() {", `
          const fetchFixtureData = fetchAllFrom;
          const refreshFixtureData = refreshData;
          let fixtureRpc;
          window.promotionSaleTest = {
            capture: () => { fixtureRpc ??= client.rpc; window.promotionSaleCalls = []; client.rpc = async (name,args) => {
              window.promotionSaleCalls.push({name,args}); return {data:"fixture-sale",error:null};
            }; refreshData = async () => {}; },
            reset: () => { fetchAllFrom = fetchFixtureData; refreshData = refreshFixtureData; client.rpc = fixtureRpc; fixtureRpc = undefined; },
            setTestStock: (quantity, branchId) => {
              liveData.inventoryStock = liveData.inventoryStock.map(row => row.barcode === "00801001" ? {...row,quantity} : row);
              return inventoryStockFor(branchId,"00801001")?.quantity;
            },
            setupAdmin: () => {
              const branch = liveData.branches.at(-1);
              const first = {branch_id:branch.id,barcode:"00801001",brand:"Example",model_description:"Sample Fan",srp:1000};
              const second = {branch_id:branch.id,barcode:"00801002",brand:"Example",model_description:"Sample Rice Cooker",srp:1100};
              liveData.inventoryStock = [{branch_id:branch.id,barcode:first.barcode,quantity:4,serialized:false},
                {branch_id:branch.id,barcode:second.barcode,quantity:7,serialized:false}];
              liveData.inventoryError = null;
              window.adminTestReads = [];
              fetchAllFrom = async (_client, table, _columns, _order, refine) => {
                const query = {eq(key,value) { if(key==="branch_id") window.adminTestReads.push([table,value]); return this; },is() { return this; }};
                refine(query);
                if (table==="products") return {data:[first,second],error:null};
                if (table==="reviewed_promotions") return {data:[{id:"admin-offer",barcode:"00801003",description:"Fan and rice cooker",
                  tag_price:1490,source_name:"fixture.pdf",source_page:1,valid_from:"2026-01-01",valid_to:"2026-12-31",
                  components:[{barcode:first.barcode,quantity:1,free:false},{barcode:second.barcode,quantity:1,free:false}]}],error:null};
                throw Error("Unexpected read: "+table);
              };
              return branch;
            },
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
            openRegular: (missingPrice = false, editing = false) => {
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
                components:[{barcode:product.barcode,quantity:5,free:false},{barcode:product.barcode,quantity:1,free:true}]},
                {id:"another",barcode:"00065138",description:"Two products in one bundle",
                tag_price:1749,source_name:"fixture.pdf",source_page:2,source_excerpt:"Mixed bundle",
                valid_from:"2026-01-01",valid_to:"2026-12-31",price_conflict:false,
                components:[{barcode:product.barcode,quantity:1,free:false},{barcode:other.barcode,quantity:1,free:false}]}]});
              const sale = editing ? {id:"edit-fixture",invoice_number:"19636",sold_on:"2026-11-11",
                customer_name:"Existing customer",payment_mode:"Cash",fulfillment_method:"pickup",
                city:"Santiago",barangay:"Sample",branch_id:currentProfile.branch_id} : undefined;
              if (sale) liveData.linesBySale.set(sale.id, [{barcode:other.barcode,quantity:1,srp:other.srp,selling_price:50}]);
              openSaleModal(sale);
              document.querySelector('form [name="date"]').value = "2026-11-11";
              return product.barcode;
            },
            openSavedBundle: () => {
              const regular = saleProducts().find(item => item.srp != null);
              const bundleProduct = saleProducts().find(item => item.srp != null && item.barcode !== regular.barcode);
              const branch = liveData.branches.find(item => item.id === regular.branch_id) || liveData.branches[0];
              const sale = {id:"saved-bundle-sale",invoice_number:"19636",sold_on:"2026-11-03",
                customer_name:"Existing customer",payment_mode:"Cash",fulfillment_method:"pickup",
                city:"Santiago",barangay:"Sample",branch_id:branch.id,ps_id:currentProfile.id,
                created_at:"2026-11-03T10:00:00Z",updated_at:"2026-11-13T02:09:35Z"};
              liveData.sales.push(sale);
              liveData.linesBySale.set(sale.id, [
                {id:"regular",barcode:regular.barcode,quantity:1,srp:regular.srp,selling_price:5916},
                {id:"paid",barcode:bundleProduct.barcode,quantity:5,srp:bundleProduct.srp,selling_price:695.80},
                {id:"free",barcode:bundleProduct.barcode,quantity:1,srp:bundleProduct.srp,selling_price:0}
              ]);
              liveData.inventoryError = null;
              liveData.inventoryStock = [regular,bundleProduct].map(product => ({branch_id:branch.id,barcode:product.barcode,quantity:10,serialized:false}));
              const from = client.from;
              window.savedBundleFixture = true;
              const rows = [{id:"saved-group",promotion_id:"fixture",barcode:"00065433",description:"Buy five get one",
                bundle_total:3479,source_snapshot:{valid_from:"2026-10-01",valid_to:"2026-12-31",tag_price:3479},
                sale_promotion_lines:[{line_id:"paid"},{line_id:"free"}]}];
              client.from = (table, ...args) => {
                if (table !== "sale_promotion_groups") return from.call(client, table, ...args);
                return {select() {return this;}, eq() {return this;}, order() {return this;},
                  then(fulfill,reject) {return Promise.resolve({data:rows,error:null}).then(fulfill,reject);}};
              };
              openSaleDetails(sale.id);
              return () => { client.from = from; window.savedBundleFixture = false; };
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
      assert.equal(await dialog.locator('[name="bundle_price"]').inputValue(), "");
      assert.match(await dialog.locator("[data-promotion-header]").textContent(), /Memo offer.*99.50/);
      assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "6");
      assert.equal(await dialog.locator('[name="code"]').inputValue(), barcode);
      assert.equal(await dialog.locator('[name="srp"]').isVisible(), true);
      assert.equal(await dialog.locator('.sale-row [name="product"]').locator("xpath=../span").isVisible(), false);
      assert.equal(await dialog.locator("[data-promotion-header]").getByText("Included inventory products").count(), 0);
      assert.equal(await dialog.locator("[data-promotion-header]").getByText(/Memo SRP|Source:/).count(), 0);
      assert.equal(await dialog.locator('[name="bundle_price"]').getAttribute("aria-label"), "Bundle selling price (PHP)");
      await dialog.locator('[name="bundle_price"]').fill("95");
      assert.match(await dialog.locator("#sale-total").textContent(), /95.00/);
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill(await page.evaluate(() => window.promotionOtherProduct));
      await dialog.locator(".sale-row").last().locator('[name="price"]').fill("50");
      assert.match(await dialog.locator("#sale-total").textContent(), /145.00/);
      await dialog.locator("[data-remove-promotion]").click();
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Keep customer");
      assert.equal(await dialog.locator(".sale-row").count(), 1);
      assert.match(await dialog.locator("#sale-total").textContent(), /50/);
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill("65433");
      await dialog.locator(".sale-row").last().locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Keep customer");
      await dialog.locator('[name="bundle_price"]').fill("95");
      await dialog.locator("[data-add-line]").click();
      await dialog.locator(".sale-row").last().locator('[name="product"]').fill("65138");
      await dialog.locator(".sale-row").last().locator('[name="product"]').dispatchEvent("change");
      await dialog.locator('[data-promotion-header="3"]').waitFor();
      assert.equal(await dialog.locator('[data-promotion-group="3"]').count(), 2);
      await dialog.locator('[data-promotion-header="3"] [name="bundle_price"]').fill("1749");
      await page.evaluate(() => window.promotionSaleTest.capture());
      await dialog.locator('[name="invoice"]').fill("TEST-INLINE");
      await dialog.locator('[name="city"]').fill("Santiago");
      await dialog.locator('[name="barangay"]').fill("Sample");
      await dialog.locator('[name="fulfillment"]').selectOption("pickup");
      await dialog.locator('[name="payment"]').selectOption(payment);
      await dialog.getByRole("button", { name: "Save sale" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const inlineCalls = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(inlineCalls[0].name, "save_promotion_sales");
      assert.deepEqual(inlineCalls[0].args.p_bundles.map(item => [item.promotion, item.bundle_total]), [["fixture", 95], ["another", 1749]]);
      assert.equal(inlineCalls[0].args.p_regular_lines.length, 1);
      assert.equal(inlineCalls[0].args.p_regular_lines[0].selling_price, 50);
      await page.evaluate(() => window.promotionSaleTest.openRegular(true));
      dialog = page.getByRole("dialog", { name: "Record a sale", exact: true });
      await dialog.locator('[name="product"]').fill("65433");
      await dialog.locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator("#sale-total").textContent(), "Enter bundle price");
      assert.match(await dialog.locator("[data-promotion-header]").textContent(), /Enter the amount charged/);
      await dialog.locator('[name="bundle_price"]').fill("3479");
      assert.match(await dialog.locator("#sale-total").textContent(), /3,479/);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => {
        window.promotionSaleTest.openRegular(false, true);
        window.promotionSaleTest.capture();
      });
      dialog = page.getByRole("dialog", { name: "Edit sale · 19636" });
      await dialog.locator("[data-add-line]").click();
      const editProduct = dialog.locator('.sale-row [name="product"]').last();
      await editProduct.fill("65433");
      await dialog.locator('#sale-products option[value*="Buy five get one"]').waitFor({ state: "attached" });
      await editProduct.press("Enter");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.equal(await dialog.locator('[name="invoice"]').inputValue(), "19636");
      assert.equal(await dialog.locator('[name="customer"]').inputValue(), "Existing customer");
      assert.equal(await dialog.locator('.sale-row [name="quantity"]').last().inputValue(), "6");
      await dialog.locator('[name="bundle_price"]').fill("3479");
      assert.match(await dialog.locator("#sale-total").textContent(), /3,529/);
      await dialog.locator('[name="reconcile"]').check();
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const [edited] = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(edited.name, "edit_sale_with_promotions");
      assert.equal(edited.args.p_sale_id, "edit-fixture");
      assert.equal(edited.args.p_reconcile, true);
      assert.deepEqual(edited.args.p_bundles, [{promotion:"fixture",bundle_total:3479,acknowledge_warnings:false}]);
      assert.equal(edited.args.p_regular_lines[0].selling_price, 50);
      await page.evaluate(() => window.promotionSaleTest.reset());
      await page.evaluate(() => { window.restoreSavedBundle = window.promotionSaleTest.openSavedBundle(); });
      let details = page.getByRole("dialog", { name: "Transaction · 19636" });
      await details.getByText(/Ask your manager to correct this transaction/).waitFor();
      assert.equal(await details.getByRole("button", { name: "Edit", exact: true }).isDisabled(), true);
      await details.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => window.restoreSavedBundle());
      const psRole = await page.locator("#demo-role").elementHandle();
      await page.locator("#demo-role").selectOption("admin");
      await page.waitForFunction(element => !element.isConnected, psRole);
      await page.evaluate(() => {
        window.restoreSavedBundle = window.promotionSaleTest.openSavedBundle();
        window.promotionSaleTest.capture();
      });
      details = page.getByRole("dialog", { name: "Transaction · 19636" });
      await details.getByRole("button", { name: "Edit", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit sale · 19636" });
      assert.equal(await dialog.locator('[name="bundle_price"]').inputValue(), "3479");
      assert.equal(await dialog.locator('.sale-row [name="quantity"]').last().inputValue(), "6");
      assert.match(await dialog.locator("#sale-total").textContent(), /9,395/);
      await dialog.locator('[name="bundle_price"]').fill("3500.01");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await page.waitForFunction(() => window.promotionSaleCalls.length > 0);
      const [corrected] = await page.evaluate(() => window.promotionSaleCalls);
      assert.equal(corrected.name, "update_bundle_sale");
      assert.equal(corrected.args.p_expected_updated_at, "2026-11-13T02:09:35Z");
      assert.equal(corrected.args.p_regular_lines.length, 1);
      assert.deepEqual(corrected.args.p_bundles, [{group_id:"saved-group",promotion:"fixture",bundle_total:3500.01,acknowledge_warnings:false}]);
      await page.evaluate(() => { window.restoreSavedBundle(); window.promotionSaleTest.reset(); });
      await page.locator('[data-live-page="sales"]').evaluate(button => button.click());
      await page.locator('[data-open="sale"]').waitFor();
      const branch = await page.evaluate(() => window.promotionSaleTest.setupAdmin());
      await page.locator('[data-open="sale"]').click();
      const branchPicker = page.getByRole("dialog",{name:"Choose a branch for the test sale"});
      await branchPicker.getByLabel("Branch").selectOption(branch.id);
      await branchPicker.getByRole("button",{name:"Continue"}).click();
      dialog = page.getByRole("dialog",{name:"Record a test sale"});
      await dialog.getByText(branch.name+" · Test only").waitFor();
      await dialog.locator('[name="date"]').fill("2026-11-12");
      await dialog.locator('[name="product"]').fill("801003");
      await dialog.locator('[name="product"]').dispatchEvent("change");
      await dialog.locator("[data-promotion-header]").waitFor();
      assert.deepEqual(await dialog.locator('[name="code"]').evaluateAll(inputs=>inputs.map(input=>input.value)),["00801001","00801002"]);
      assert.match(await dialog.locator(".sale-inventory-serials").first().textContent(), /Available: 4/);
      assert.match(await dialog.locator(".sale-inventory-serials").last().textContent(), /Available: 7/);
      await page.evaluate(() => window.promotionSaleTest.capture());
      await dialog.locator('[name="customer"]').fill("Test customer");
      await dialog.locator('[name="invoice"]').fill("TEST-ADMIN");
      await dialog.locator('[name="city"]').fill("Santiago");
      await dialog.locator('[name="barangay"]').fill("Sample");
      await dialog.locator('[name="fulfillment"]').selectOption("pickup");
      await dialog.locator('[name="payment"]').selectOption(payment);
      await dialog.locator('[name="bundle_price"]').fill("1490");
      assert.equal(await page.evaluate(id => window.promotionSaleTest.setTestStock(0,id),branch.id),0);
      await dialog.getByRole("button",{name:"Validate test sale"}).click();
      const stockWarning = page.getByRole("dialog",{name:"Item availability"});
      await stockWarning.getByText("Sample Fan").waitFor();
      await page.evaluate(() => window.promotionSaleTest.setTestStock(4));
      await stockWarning.getByRole("button",{name:"OK",exact:true}).click();
      await dialog.getByRole("button",{name:"Validate test sale"}).click();
      await dialog.getByRole("status").filter({hasText:/Test sale validated.*1,490/}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.promotionSaleCalls),[]);
      assert.deepEqual(await page.evaluate(() => window.adminTestReads),[["products",branch.id],["reviewed_promotions",branch.id]]);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
