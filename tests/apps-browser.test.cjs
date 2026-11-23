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
    assert.equal(await page.locator("#connected-shell .branchline-module-label").textContent(),"SALES TRACKER");
    assert.equal(await page.locator("#sidebar .branchline-module-label").textContent(),"SALES TRACKER");
    const unifiedRail = page.locator(".connected-shell .bl-app-rail");
    const workspaceSidebar = page.locator(".connected-shell .connected-sidebar");
    await unifiedRail.waitFor({state:"visible"});
    assert.equal(await unifiedRail.locator(".bl-rail-link").count(),4);
    const railBox = await unifiedRail.boundingBox();
    const menuBox = await workspaceSidebar.boundingBox();
    assert.ok(railBox && menuBox && railBox.x + railBox.width <= menuBox.x + 2,
      "Unified application rail must not overlap the existing workspace sidebar.");
    assert.equal(await page.locator("#connected-shell .brand-name").count(),1);
    assert.equal(await page.locator("#connected-shell .branchline-module-label").count(),1);

    await page.locator('[data-live-page="apps"]').waitFor({state:"visible",timeout:25000});
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
    assert.equal(urls[1].href, "https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=megaframe");
    assert.equal(urls[2].href, "https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=flyer");
    for (const link of urls) {
      assert.equal(link.target, "_blank");
      assert.ok(link.rel.includes("noopener") && link.rel.includes("noreferrer"));
      assert.equal(link.referrerPolicy, "no-referrer");
      assert.equal(new URL(link.href).protocol, "https:");
    }
    await page.locator("#branchline-app-sales").click();
    assert.ok(await page.locator('[data-live-page="overview"].active').count());

    // Simulate the installed PWA; same-origin modules stay in one Branchline window.
    // No external navigation occurs in this test, so PTG credentials are never handled.
    await page.evaluate(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query =>
        query === "(display-mode: standalone)" ? { matches: true } : originalMatchMedia(query);
      // CI serves on localhost; use same-origin synthetic destinations to exercise
      // the installed-window behavior without changing the production origin check.
      const catalog = window.BranchlineApplications.list;
      const localApps = catalog.map(app => {
        if (app.kind !== "external") return app;
        const destination = new URL(app.url);
        return Object.freeze({ ...app, url: window.location.origin + destination.pathname + destination.search });
      });
      window.BranchlineApplications = Object.freeze({ list: Object.freeze(localApps) });
    });
    await page.locator('[data-live-page="apps"]').click();
    const installedTargets = await page.locator(".branchline-app-action a").evaluateAll(anchors =>
      anchors.map(a => ({ target: a.target, referrerPolicy: a.referrerPolicy }))
    );
    assert.equal(installedTargets.length, 3);
    assert.ok(installedTargets.every(a => a.target === "_self" && a.referrerPolicy === "no-referrer"));
    await page.locator("#branchline-app-sales").click();

    await page.setViewportSize({width:390,height:800});
    const appSwitcher = page.locator(".connected-shell .bl-app-switcher");
    assert.equal(await appSwitcher.isVisible(),true);
    await appSwitcher.click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(),true);
    assert.equal(await page.locator("#bl-app-drawer-connected .bl-drawer-link").count(),4);
    await page.locator("#connected-menu").click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(),false);
    assert.equal(await page.locator(".connected-sidebar.open").count(),1);
    await appSwitcher.click();
    assert.equal(await page.locator(".connected-sidebar.open").count(),0);
    await appSwitcher.click();
    assert.equal(await page.locator("#bl-app-drawer-connected").isVisible(),false);
    assert.equal(await page.locator("#connected-shell .branchline-module-label").textContent(),"SALES TRACKER");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2),true,"Sidebar label must not create mobile overflow.");

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
    console.log("PASS: demo navigation, four app cards, secure links and mobile layout.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
