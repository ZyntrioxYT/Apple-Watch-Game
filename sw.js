const CACHE = 'reaction-game-v3';
const ASSETS = [
  '/Apple-Watch-Game/',
  '/Apple-Watch-Game/index.html',
  '/Apple-Watch-Game/icon-192.png',
  '/Apple-Watch-Game/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network first, fall back to cache
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
