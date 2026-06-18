const CACHE = 'rapid-response-v2';
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

// Network first, bypassing HTTP cache for page loads so GitHub Pages updates appear on the normal URL.
self.addEventListener('fetch', e => {
  const request = e.request.mode === 'navigate'
    ? new Request(e.request, { cache: 'reload' })
    : e.request;

  e.respondWith(
    fetch(request).catch(() => caches.match(e.request))
  );
});
