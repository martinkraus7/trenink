// Service Worker for offline support
// Strategy: network-first for same-origin HTML (always try latest), stale-while-revalidate for assets

const CACHE = "trenink-v3";
const SHELL = ["./", "./index.html"];
// Tailwind Play CDN — opaque response; cache.add() ji odmítá (status 0), proto fetch + put
const TAILWIND_URL = "https://cdn.tailwindcss.com/";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(SHELL).then(() =>
        fetch(new Request(TAILWIND_URL, { mode: "no-cors" }))
          .then((r) => c.put(TAILWIND_URL, r))
          .catch(() => {})
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Skip cross-origin video/iframe requests (YouTube, etc.)
  if (url.origin !== self.location.origin && !url.hostname.includes("tailwindcss")) {
    return;
  }

  // Jen same-origin — jinak by CDN (pathname "/") spadlo do network-first větve
  const isHTML = url.origin === self.location.origin && (
    req.headers.get("accept")?.includes("text/html")
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith("/")
  );

  if (isHTML) {
    // Network-first: get latest HTML when online, fall back to cache.
    // Cachovat jen OK odpovědi — 404/captive portal nesmí otrávit cache.
    // Klíč bez query stringu — denní shortcut URL (?hrv=…&save=1) by jinak množily kopie index.html.
    const key = url.origin + url.pathname;
    e.respondWith(
      fetch(req).then((r) => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(key, clone));
        }
        return r;
      }).catch(() => caches.match(key).then((c) => c || caches.match("./index.html")))
    );
  } else {
    // Stale-while-revalidate: vrať cache hned, na pozadí stáhni čerstvou verzi do cache.
    // Opaque (Tailwind CDN, r.ok vždy false) cachovat taky — jinak by offline chyběly styly.
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((r) => {
          if (r.ok || r.type === "opaque") {
            const clone = r.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return r;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
