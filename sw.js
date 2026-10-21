"use strict";

const CACHE_NAME = "branchline-shell-v81";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./install.html",
  "./styles.css",
  "./auth-app.js",
  "./demo-data.js",
  "./inventory.js",
  "./inventory-demo.js",
  "./currency.js",
  "./analytics.js",
  "./sales-history.js",
  "./daily-history.js",
  "./supabase-config.js",
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
      .then(keys => Promise.all(keys.filter(key => key.startsWith("branchline-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Branchline", {
    body: data.body || "",
    icon: new URL("./icons/icon-192.png", self.registration.scope).href,
    badge: new URL("./icons/icon-192.png", self.registration.scope).href,
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
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const appShell = await caches.match(new URL("./index.html", self.registration.scope).href);
          if (appShell) return appShell;
        }
        return new Response("", { status: 503, statusText: "Unavailable offline" });
      }),
  );
});
