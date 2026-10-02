// Scope is counter/ only; no caching of eBird responses or other projects.
const CACHE = "ebird-counter-shell-v7";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.mjs",
  "./build-info.mjs",
  "./core.mjs",
  "./organization.mjs",
  "./personal.mjs",
  "./aliases.mjs",
  "./historical-names.mjs",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./navigation.mjs",
  "./data/taiwan-index.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ebird-counter-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ).then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(fetch(event.request).then(async (response) => {
    if (response.ok && FILES.some((file) => new URL(file, self.registration.scope).href === url.href)) {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      } catch {}
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
