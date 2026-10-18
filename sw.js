"use strict";

const CACHE_NAME = "branchline-shell-v30";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./install.html",
  "./styles.css",
  "./app.js",
  "./auth-app.js",
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
