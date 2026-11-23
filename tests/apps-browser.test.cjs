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
    await page.locator('[data-live-page="apps"]').click();
    await page.getByRole("heading",{name:"Branchline Applications"}).waitFor();
    const unifiedRail = page.locator(".connected-shell .bl-app-rail");
    const workspaceSidebar = page.locator(".connected-shell .connected-sidebar");
    await unifiedRail.waitFor({ state: "visible" });
    assert.equal(await unifiedRail.locator(".bl-rail-link").count(), 4, "Desktop four-app rail is persistent.");
    assert.equal(await workspaceSidebar.isVisible(), true, "The active application's workspace sidebar remains present.");
    const railBox = await unifiedRail.boundingBox();
    const menuBox = await workspaceSidebar.boundingBox();
    assert.ok(railBox && menuBox && railBox.x + railBox.width <= menuBox.x + 2,
      "The app rail must sit beside, not replace or overlap, the workspace menu.");
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
    const appSwitcher = page.locator(".connected-shell .bl-app-switcher");
    assert.equal(await appSwitcher.isVisible(), true, "A separate mobile App Menu icon is visible.");
    await appSwitcher.click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(), true);
    assert.equal(await page.locator("#bl-app-drawer-connected .bl-drawer-link").count(),4);
    await page.locator("#connected-menu").click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(), false,
      "Opening the workspace menu closes the application drawer.");
    assert.equal(await page.locator(".connected-sidebar.open").count(),1);
    await appSwitcher.click();
    assert.equal(await page.locator(".connected-sidebar.open").count(),0,
      "Opening the app list closes the workspace menu.");
    await appSwitcher.click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(), false);

    await page.locator("#connected-menu").click();
    await page.locator('[data-live-page="apps"]').click();
    await page.locator(".branchline-app-card").first().waitFor();
    const grid = await page.locator(".branchline-app-grid").evaluate(el =>
      getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    assert.equal(grid,1,"The application hub uses one column on mobile.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2),true,
      "No horizontal overflow on mobile");
    // Verify the stand-alone app chooser and its mobile drawer, not just Sales Tracker.
    const chooser = await browser.newPage({ viewport: { width: 390, height: 844 } });
    chooser.on("pageerror", e => failures.push(e.message));
    await chooser.goto("http://127.0.0.1:4173/apps/", { waitUntil: "domcontentloaded" });
    assert.equal(await chooser.locator(".cards .card").count(), 4);
    const appearance = await chooser.locator(".cards .card").evaluateAll(cards =>
      cards.map(card => {
        const s = getComputedStyle(card);
        return {background:s.backgroundColor,border:s.borderStyle,width:s.borderTopWidth};
      })
    );
    for (const card of appearance) {
      assert.equal(card.background, "rgba(0, 0, 0, 0)", "No solid tile background");
      assert.equal(card.border, "solid", "Tile is outlined");
      assert.equal(card.width, "1px", "Thin tile border");
    }
    const sourceLinks = await chooser.locator(".cards a.card").evaluateAll(links => links.map(a=>a.href));
    await chooser.locator("#mobileAppMenu").click();
    assert.equal(await chooser.locator("#mobileAppDrawer").isVisible(), true);
    assert.equal(await chooser.locator(".drawer-app").count(), 4);
    assert.deepEqual(await chooser.locator(".drawer-app").evaluateAll(links => links.map(a=>a.href)), sourceLinks,
      "Drawer preserves the original app destinations");
    await chooser.keyboard.press("Escape");
    assert.equal(await chooser.locator("#mobileAppDrawer").isVisible(), false);
    await chooser.locator("#mobileAppMenu").click();
    await chooser.locator("#mobileAppMenu").click();
    assert.equal(await chooser.locator("#mobileAppDrawer").isVisible(), false);
    await chooser.setViewportSize({width:1366,height:800});
    assert.equal(await chooser.locator(".bl-launcher-rail .bl-app-rail").isVisible(), true,
      "The launcher must retain its desktop app sidebar.");
    assert.equal(await chooser.locator(".bl-launcher-rail .bl-rail-link").count(), 4);
    assert.equal(await chooser.locator("#mobileAppMenu").isVisible(), false);
    assert.equal(await chooser.locator(".cards .card").count(), 4);
    await chooser.close();
    assert.deepEqual(failures,[],"Runtime errors: "+failures.join("; "));
    console.log("PASS: demo navigation, secure app links, outlined launcher cards and mobile drawer.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
