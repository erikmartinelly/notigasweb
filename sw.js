/* NOTIGAS SERVICE WORKER v75.0 - CACHÉ PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-cache-v75';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css?v=75',
  './js/state.js?v=75',
  './js/ui.js?v=75',
  './js/supabase-config.js?v=75',
  './js/auth.js?v=75',
  './js/vendors.js?v=75',
  './js/map.js?v=75',
  './js/map_search.js?v=75',
  './js/map_gps.js?v=75',
  './js/forum.js?v=75',
  './js/ads.js?v=75',
  './js/orders.js?v=75',
  './js/admin.js?v=75',
  './js/admin_users.js?v=75',
  './js/app.js?v=75',
  './js/events.js?v=75',
  './icons/garrafa_red_clean.svg',
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
  
  const url = event.request.url;
  // Bypass: peticiones externas, mapas y Supabase (autenticación/realtime nunca deben cachearse)
  if (
    url.includes('google.com') ||
    url.includes('googleusercontent.com') ||
    url.includes('openstreetmap.org') ||
    url.includes('cartocdn.com') ||
    url.includes('cloudflare.com') ||
    url.includes('supabase.co') ||
    url.includes('ipapi') ||
    url.includes('ipwho') ||
    url.includes('freeipapi') ||
    url.includes('osrm.org') ||
    url.includes('komoot.io') ||
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
          return caches.match('./index.html', { ignoreSearch: true });
        }
      });
    })
  );
});
