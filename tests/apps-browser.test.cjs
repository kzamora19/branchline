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
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await rail.isVisible(), false);
    assert.equal(await page.locator("#connected-shell .bl-mobile-brand").isVisible(), true);
    await page.locator("#connected-menu").click();
    assert.equal(await page.locator('[data-live-page="apps"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2),true,
      "No horizontal overflow on mobile");
    assert.deepEqual(failures,[],"Runtime errors: "+failures.join("; "));
    console.log("PASS: Sales navigation omits the duplicate Applications page and preserves shortcuts.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
