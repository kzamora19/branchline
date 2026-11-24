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
    await page.locator('[data-live-page="apps"]').waitFor({state:"visible",timeout:25000});
    const rail=page.locator("#connected-shell > .bl-app-rail");
    assert.equal(await rail.evaluate(el=>getComputedStyle(el).flexDirection),"row","R6 desktop app bar is horizontal");
    assert.equal(await rail.locator(".bl-rail-link").count(),4);
    assert.ok((await rail.boundingBox()).width>=1000,"R6 header spans workspace");
    await page.locator('[data-live-page="apps"]').click();
    await page.getByRole("heading",{name:"Branchline Applications"}).waitFor();
    assert.equal(await page.locator(".branchline-app-card").count(), 4);
    assert.deepEqual(await page.locator(".branchline-app-card h2").allTextContents(), [
      "Sales Tracker", "Price Tag Generator", "MegaFrame Studio", "MegaFlyer Studio"
    ]);
    const urls = await page.locator(".branchline-app-action a").evaluateAll(anchors =>
      anchors.map(a=>({
        href:a.href, target:a.target, rel:a.rel, referrerPolicy:a.referrerPolicy
      }))
    );
    assert.equal(urls.length, 3);
    for (const link of urls) {
      assert.equal(link.target, "_blank");
      assert.ok(link.rel.includes("noopener") && link.rel.includes("noreferrer"));
      assert.equal(link.referrerPolicy, "no-referrer");
      assert.equal(new URL(link.href).protocol, "https:");
    }
    await page.locator("#branchline-app-sales").click();
    assert.ok(await page.locator('[data-live-page="overview"].active').count());
    await page.setViewportSize({width:390,height:800});
    assert.equal(await rail.isVisible(),false,"Mobile has no desktop app shortcut rail");
    assert.equal(await page.locator("#connected-shell .bl-mobile-brand").isVisible(),true);
    await page.locator("#connected-menu").click();
    await page.locator('[data-live-page="apps"]').click();
    await page.locator(".branchline-app-card").first().waitFor();
    const grid = await page.locator(".branchline-app-grid").evaluate(el =>
      getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    assert.equal(grid,1,"The application hub uses one column on mobile.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2),true,
      "No horizontal overflow on mobile");
    assert.deepEqual(failures,[],"Runtime errors: "+failures.join("; "));
    console.log("PASS: demo navigation, four app cards, secure links and mobile layout.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
