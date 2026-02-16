/* Service Worker — caches app shell for offline use */
const CACHE_NAME = 'leading-light-v15';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/map.js',
  '/js/routes.js',
  '/js/emergency.js',
  '/js/reports.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  /* Network-first for all external API calls */
  if (url.includes('nominatim') || url.includes('overpass') ||
      url.includes('ip-api') || url.includes('police.uk') ||
      url.includes('usa.gov') || url.includes('detroitmi.gov') ||
      url.includes('osrm') || url.includes('router.project-osrm') ||
      url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    /* Network-first for app shell too (avoids serving stale files) */
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          /* Update cache with fresh copy */
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
