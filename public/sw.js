const CACHE_NAME = "photos-cache-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./materialdesignicons.min.css",
  "./vuetify.min.css",
  "./vue.global.js",
  "./vuetify.min.js",
  "./vue-router.global.js",
  "./materialdesignicons-webfont.woff2",
  "./icon-192.png",
  "./icon-512.png",
];
// install: кладём базовые файлы
const toAbs = (p) => new URL(p, self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((c) => c.addAll(PRECACHE_FILES.map(toAbs)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // не трогаем дев-рутину Vite
  if (url.pathname.startsWith("/@vite") || url.pathname.includes("vite.svg"))
    return;

  // навигация: сеть → кеш index.html при офлайне
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(toAbs("index.html")))
    );
    return;
  }

  // кэшируем только same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      });
    })
  );
});
