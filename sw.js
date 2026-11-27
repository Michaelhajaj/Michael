/* Service worker – offline support for the gypsum planner app.
   Network-first for everything same-origin (always fresh when online),
   falls back to the cache when offline. Cross-origin and non-GET are untouched
   (AI worker calls, payments, fonts). */
const CACHE = "gp-app-v2";
const CORE = [
  "./", "./index.html", "./plans.html", "./manifest.webmanifest",
  "./css/plans.css", "./js/config.js", "./js/gypsum-rules.js", "./js/gypsum-engine.js",
  "./js/plans.js", "./js/plans3d.js", "./js/ai-chat.js", "./js/pwa.js", "./privacy.html",
  "./images/icons/icon-192.png", "./images/icons/icon-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await cache.match("./plans.html", { ignoreSearch: true })) || Response.error();
      throw err;
    }
  })());
});
