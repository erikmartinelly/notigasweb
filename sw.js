/* NOTIGAS SERVICE WORKER v52.0 - CACHÉ PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-cache-v66';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css?v=66',
  './js/state.js?v=66',
  './js/supabase-config.js?v=66',
  './js/auth.js?v=66',
  './js/vendors.js?v=66',
  './js/map.js?v=66',
  './js/forum.js?v=66',
  './js/ads.js?v=66',
  './js/ui.js?v=66',
  './js/orders.js?v=66',
  './js/app.js?v=66',
  './js/admin.js?v=66',
  './js/admin_users.js?v=66',
  './icons/garrafa_red_clean.svg',
  './icons/camion_red.svg',
  './js/events.js?v=66',
  './js/map_search.js?v=66',
  './js/map_gps.js?v=66',
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
  // Bypass: peticiones externas y Supabase (autenticación/realtime nunca deben cachearse)
  if (
    url.includes('google.com') ||
    url.includes('openstreetmap.org') ||
    url.includes('cloudflare.com') ||
    url.includes('supabase.co') ||
    url.includes('ipapi') ||
    url.includes('ipwho') ||
    url.includes('freeipapi') ||
    url.includes('osrm.org') ||
    url.includes('jsdelivr.net') ||
    url.includes('unpkg.com') ||
    url.includes('accounts.google.com')
  ) {
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

