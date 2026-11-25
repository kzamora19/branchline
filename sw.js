"use strict";

const CACHE_NAME = "branchline-shell-v200-web-2026112504-mobile-drawer";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./install.html",
  "./apps/",
  "./apps/index.html",
  "./styles.css",
  "./styles.css?v=r6-sales-ui-2026112416",
  "./apps/branchline-ui-stage.css",
  "./apps/dashboard-account.js?v=2026112416",
  "./apps/branchline-outlined-drawer.css",
  "./branchline-app-rail.css?v=r6-web-2026112416",
  "./branchline-app-rail.css?v=r6-mobile-drawer-2026112504",
  "./branchline-app-rail.js?v=r6-web-2026112416",
  "./icons/official/branchline.png",
  "./icons/r6/Approved.branchline.png",
  "./icons/r6/Approved.branchline-192.png",
  "./icons/r6/Approved.branchline-512.png",
  "./icons/r6/Approved.branchline.png?v=r6-install-20261124-11",
  "./icons/r6/Approved.ptg.png",
  "./icons/r6/Approved.sales.png",
  "./icons/r6/Approved.megaframe.png",
  "./icons/r6/Approved.megaflyer.png",
  "./icons/r6/FirstMegasaverHeader.png",
  "./icons/r6/BranchlineWordartFull.png",
  "./icons/official/four-apps.png",
  "./styles.css?v=ps-ranking-table-20261119",
  "./styles.css?v=apps-hub-20261119",
  "./styles.css?v=ps-assist-link-20261121",
  "./auth-app.js",
  "./ps-certificates.mjs",
  "./management-reports.mjs",
  "./management-charts.mjs",
  "./manager-attention.js",
  "./ps-performance.js",
  "./auth-app.js?v=ps-ranking-table-20261119",
  "./branchline-applications.js",
  "./branchline-applications.js?v=megaframe-pages-20261121",
  "./branchline-applications.js?v=unified-four-apps-20261122",
  "./auth-app.js?v=apps-hub-20261119",
  "./auth-app.js?v=ps-equal-share-20261121",
  "./auth-app.js?v=certificate-label-20261121",
  "./auth-app.js?v=ps-assist-review-20261121",
  "./auth-app.js?v=r6-sales-imports-2026112504",
  "./ps-certificates.mjs?v=certificate-label-20261121",
  "./certificate-periods.mjs?v=certificate-label-20261121",
  "./table-ui.js",
  "./promotion-review-ui.mjs",
  "./unified-import.mjs",
  "./unified-import-ui.mjs",
  "./import-engine/core.mjs",
  "./import-engine/brand-reference.mjs",
  "./import-engine/promotion-pdf.mjs",
  "./import-engine/promotion-import.mjs",
  "./import-engine/promotion-sheet.mjs",
  "./import-engine/promotion-bundles.mjs",
  "./import-engine/promotion-allocation.mjs",
  "./demo-data.js",
  "./inventory.js",
  "./sales-delivery.js",
  "./sales-returns.mjs",
  "./inventory-demo.js",
  "./currency.js",
  "./analytics.js",
  "./sales-history.js",
  "./daily-history.js",
  "./supabase-config.js",
  "./updates/check.js?v=2026112504",
  "./updates/check.css?v=2026112504",
  "./widgets/floating-widgets.css?v=2026112504",
  "./widgets/help-panel.css?v=2026112504",
  "./widgets/floating-widgets.js?v=2026112504",
  "./widgets/guide-content.js?v=2026112504",
  "./widgets/help-panel.js?v=2026112504",
  "./widgets/widget-shell.js?v=2026112504",
  "./widgets/widget-bootstrap.js?v=2026112504",
  "./widgets/assets/assistant.webp",
  "./widgets/assets/announcements.svg",
  "./widgets/assets/guide.svg",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
].map(path => new URL(path, self.registration.scope).href);
const APP_SHELL = new Set(APP_SHELL_URLS);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("branchline-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Branchline", {
    body: data.body || "",
    icon: new URL("./icons/r6/Approved.branchline.png?v=r6-install-20261124-11", self.registration.scope).href,
    badge: new URL("./icons/r6/Approved.branchline.png?v=r6-install-20261124-11", self.registration.scope).href,
    tag: data.tag || "branchline",
    data: { url: data.url || "./" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const open = clients.find(client => client.url.startsWith(self.registration.scope));
    if (open) return open.navigate(target).then(client => client?.focus());
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !APP_SHELL.has(request.url)) return;

  event.respondWith(
    fetch(request)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await (await caches.open(CACHE_NAME)).match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const appShell = await (await caches.open(CACHE_NAME)).match(new URL("./index.html", self.registration.scope).href);
          if (appShell) return appShell;
        }
        return new Response("", { status: 503, statusText: "Unavailable offline" });
      }),
  );
});
