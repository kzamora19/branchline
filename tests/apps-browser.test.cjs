const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const failures = [];
  page.on("pageerror", e => failures.push(e.message));
  try {
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    await page.locator("#enter-demo").click();
    const overview = page.locator('[data-live-page="overview"].active,[data-live-page="inventory"].active');
    await overview.waitFor({ state: "visible", timeout: 25000 });
    const rail = page.locator("#connected-shell > .bl-app-rail");
    assert.equal(await rail.locator(".bl-rail-link").count(), 4);
    assert.ok((await rail.boundingBox()).width >= 1000, "Desktop header spans the workspace");
    assert.equal(await page.locator('[data-live-page="apps"]').count(), 0);
    assert.equal(await rail.locator(".bl-r6-branchline-wordart").isVisible(),true,"Desktop workspace wordart remains visible");
    assert.equal(await page.locator("#connected-shell > .connected-sidebar > .branchline-module-label").isVisible(),true);
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await rail.isVisible(), false);
    assert.equal(await page.locator("#connected-shell .bl-mobile-brand").isVisible(), true);
    await page.locator("#connected-menu").click();
    const sidebar=page.locator("#connected-shell > .connected-sidebar");
    await sidebar.evaluate(el=>{if(!el.classList.contains("open"))throw Error("Mobile drawer did not open");});
    assert.equal(await sidebar.locator(":scope > .brand").evaluate(el=>getComputedStyle(el).display),"none","Mobile duplicate Branchline branding must be hidden");
    assert.equal(await sidebar.locator(":scope > .branchline-module-label").isVisible(),true,"Sales Tracker branding remains");
    assert.equal(await sidebar.locator(":scope > .branchline-module-label img").isVisible(),true);
    assert.equal(await sidebar.locator("#connected-nav").isVisible(),true);
    assert.equal(await sidebar.locator("#connected-user-name").isVisible(),true);
    assert.equal(await sidebar.locator("#sign-out").isVisible(),true);
    assert.equal(await page.locator("#connected-menu").isVisible(),true);
    await page.locator("#connected-menu").click();
    assert.equal(await sidebar.evaluate(el=>el.classList.contains("open")),false,"Hamburger still closes drawer");
    assert.equal(await page.locator('[data-live-page="apps"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2),true,
      "No horizontal overflow on mobile");
    assert.deepEqual(failures,[],"Runtime errors: "+failures.join("; "));
    console.log("PASS: Sales navigation omits the duplicate Applications page and preserves shortcuts.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
