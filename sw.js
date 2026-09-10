/* NOTIGAS SERVICE WORKER v128.0 - CACHÉ PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-cache-v128';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css?v=128',
  './js/driver_icons.js?v=128',
  './js/state.js?v=128',
  './js/ui.js?v=128',
  './js/supabase-config.js?v=128',
  './js/voucher_ocr.js?v=128',
  './js/auth.js?v=128',
  './js/vendors.js?v=128',
  './js/map.js?v=128',
  './js/map_search.js?v=128',
  './js/map_gps.js?v=128',
  './js/orders.js?v=128',
  './js/forum.js?v=128',
  './js/promo.js?v=128',
  './js/admin_users.js?v=128',
  './js/admin.js?v=128',
  './js/admin_payments.js?v=128',
  './js/driver_payments.js?v=128',
  './js/app.js?v=128',
  './js/events.js?v=128',
  './icons/camion_dina_rojo.svg',
  './icons/garrafa_red_clean.svg',
  './icons/garrafa_red-192.png',
  './icons/garrafa_red-512.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(ASSETS_TO_CACHE.map(asset => {
         return fetch(asset).then(response => {
            if (response.ok) return cache.put(asset, response);
            console.warn('SW: No se pudo cachear:', asset);
         }).catch(err => console.warn('SW: Error cacheando:', asset, err));
      }));
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
  if (!event.request.url.startsWith('http')) return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
  const isNavigation = event.request.mode === 'navigate' || acceptsHtml;

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
