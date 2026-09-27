// Scope is counter/ only; no caching of eBird responses or other projects.
const CACHE = 'ebird-counter-shell-v1';
const FILES = ['./', './index.html', './style.css', './app.mjs', './core.mjs', './aliases.mjs', './manifest.webmanifest', './icon.svg', './data/locations.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ebird-counter-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
