/* SAID academy — offline fallback + asset cache */
const VERSION = "v3";
const CORE = ["offline.html", "assets/logo-dark-96.png", "assets/fonts/manrope-latin.woff2", "assets/fonts/manrope-latin-ext.woff2", "assets/fonts/manrope-cyrillic.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // sahifa: avval tarmoq, bo'lmasa oxirgi nusxa, bo'lmasa offline sahifa
    // cache:"no-cache" — brauzerning HTTP keshini chetlab, serverdan yangi nusxani tekshiradi
    e.respondWith(fetch(req, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("offline.html"))));
    return;
  }
  if (req.url.includes("/assets/")) {
    // rasm, shrift, video: avval kesh, fonda yangilash
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
