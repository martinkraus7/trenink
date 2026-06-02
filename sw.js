// Service Worker for offline support
// Strategy: network-first for HTML (always try latest), cache-first for assets

const CACHE = "trenink-v2";
const SHELL = ["./", "./index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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

  const isHTML = req.headers.get("accept")?.includes("text/html")
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith("/");

  if (isHTML) {
    // Network-first: get latest HTML when online, fall back to cache
    e.respondWith(
      fetch(req).then((r) => {
        const clone = r.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
        return r;
      }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
  } else {
    // Stale-while-revalidate: vrať cache hned, na pozadí stáhni čerstvou verzi do cache
    // (jinak by cache-first zamrzlo Tailwind CDN napořád)
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((r) => {
          if (r.ok) {
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
