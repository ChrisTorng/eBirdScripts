// Scope is counter/ only; no caching of eBird responses or other projects.
const CACHE = "ebird-counter-shell-v5";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.mjs",
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
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
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
      ),
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
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
