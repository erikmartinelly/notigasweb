/* NOTIGAS SERVICE WORKER V50.0 - CACHÉ PROGRESIVO Y MODO OFFLINE (rutas corregidas) */
const CACHE_NAME = 'notigas-pwa-cache-v50';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './panel270977.html',
  './app.js',
  './map.js',
  './vendors.js',
  './forum.js',
  './auth.js',
  './ads.js',
  './admin.js',
  './supabase-config.js',
  './favicon.png',
  './favicon.svg',
  './icons/garrafa_red_clean.svg',
  './icons/camion_red.svg',
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
  
  const url = event.request.url;
  if (url.includes('google.com') || url.includes('openstreetmap.org') || url.includes('cloudflare.com') || url.includes('ipapi') || url.includes('ipwho') || url.includes('freeipapi') || url.includes('osrm.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-While-Revalidate: servir caché y actualizar en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      // Network-first para recursos no cacheados
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback offline para páginas HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
