/* NOTIGAS SERVICE WORKER v107.0 - CACHÉ PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-cache-v116';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css?v=116',
  './js/state.js?v=116',
  './js/ui.js?v=116',
  './js/supabase-config.js?v=116',
  './js/auth.js?v=116',
  './js/vendors.js?v=116',
  './js/map.js?v=116',
  './js/map_search.js?v=116',
  './js/map_gps.js?v=116',
  './js/orders.js?v=116',
  './js/forum.js?v=116',
  './js/promo.js?v=116',
  './js/admin_users.js?v=116',
  './js/admin.js?v=116',
  './js/app.js?v=116',
  './js/events.js?v=116',
  './icons/garrafa_red_clean.svg',
  './icons/garrafa_red-192.png',
  './icons/garrafa_red-512.png',
  './icons/camion_red.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usar Promise.allSettled para que un solo archivo no rompa todo el Service Worker
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
  if (!event.request.url.startsWith('http')) return; // Prevenir errores con extensiones de Chrome (chrome-extension://)

  // Solo cachear archivos propios. Auth, Supabase, mapas, CDNs y AdSense deben
  // comunicarse directamente con sus servidores y nunca pasar por la caché PWA.
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
  const isNavigation = event.request.mode === 'navigate' || acceptsHtml;

  // La página principal debe ser network-first para no mantener una versión
  // antigua después de un despliegue. La caché solo actúa como respaldo offline.
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
      });
    })
  );
});
