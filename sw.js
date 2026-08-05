/* NOTIGAS SERVICE WORKER V9.0 - CACHÉ PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-pwa-cache-v9';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css',
  './js/app.js',
  './js/map.js',
  './js/vendors.js',
  './js/forum.js',
  './js/chat.js',
  './js/auth.js',
  './js/ads.js',
  './js/admin.js',
  './favicon.png',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Omitir peticiones externas a mapas tiles / apis dinámicas
  const url = event.request.url;
  if (url.includes('google.com') || url.includes('openstreetmap.org') || url.includes('cloudflare.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar en caché e ir actualizando en segundo plano (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
