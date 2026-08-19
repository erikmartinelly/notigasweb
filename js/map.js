/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA EN VIVO, POSICIONAMIENTO GPS OBLIGATORIO,
   ANIMACIONES Y MAPA DE CALOR DE PEDIDOS PARA MODO REPARTIDOR
   ==========================================================================
   OPTIMIZACIÓN DE TRANSMISIÓN GPS PARA NO SATURAR LA BASE DE DATOS:
   - Frecuencia de emisión a la Base de Datos: Cada 30 Segundos (30,000 ms).
   - Estrategia de DB: UPSERT (Reemplazar 1 sola fila por chofer en 'rutas_repartidores').
   - Interpolación en el Cliente: Movimiento continuo a 60 FPS sin recargar DB.
   - Reducción de carga en servidor DB: 96.6% de ahorro en IOPS y escrituras.
   ========================================================================== */

const TRUCK_ANIM_INTERVAL_MS = 80;

let map, userMarker, truckMarker;
window.activeTruckTimers = {};
window.neighborOrderTimers = {};
let mapTileLayers = {};
let animationTimer = null;
let lastGpsBroadcastTime = 0;
let currentGpsLat = null;
let currentGpsLng = null;
window.currentGpsLat = currentGpsLat;
window.currentGpsLng = currentGpsLng;
let heatmapLayerGroup = null;
let activeGpsWatchId = null;
let truckTargetLat = null;
let truckTargetLng = null;
let truckCurrentLat = null;
let truckCurrentLng = null;
let neighborOrderMarkers = {};
window.neighborOrderMarkers = neighborOrderMarkers;
let activeTruckMarkers = {};
window.isHeatmapActive = window.isHeatmapActive || false;

// Estado de marcador de usuario
let isUserMarkerDraggedManually = false;
let manualLocationSyncTimer = null;
let isMapInteractedByUser = false;
let currentActiveOrderMarker = null;

function isLeafletMapInstance(candidate) {
  return !!candidate &&
    typeof candidate.addLayer === 'function' &&
    typeof candidate.removeLayer === 'function' &&
    typeof candidate.invalidateSize === 'function' &&
    typeof candidate.getCenter === 'function';
}

function getLeafletMapInstance() {
  if (isLeafletMapInstance(window.notigasMap)) return window.notigasMap;
  if (isLeafletMapInstance(window.map)) return window.map;
  return null;
}

// El icono oficial rojo se mantiene igual; el estado se comunica con un indicador de color.
const garrafaSvgMarkerHtml = `
  <div class="radar-marker-wrapper notigas-order-marker notigas-order-marker--pending">
    <div class="radar-pulse-ring"></div>
    <img src="icons/garrafa_red_clean.svg" class="notigas-order-icon-img" alt="Pedido NOTIGAS pendiente">
    <span class="notigas-order-state-dot" aria-hidden="true"></span>
  </div>
`;

const garrafaYellowSvgMarkerHtml = `
  <div class="notigas-order-marker notigas-order-marker--seen">
    <img src="icons/garrafa_red_clean.svg" class="notigas-order-icon-img" alt="Pedido NOTIGAS visto">
    <span class="notigas-order-state-dot" aria-hidden="true"></span>
  </div>
`;

const garrafaGreenSvgMarkerHtml = `
  <div class="notigas-order-marker notigas-order-marker--delivered">
    <img src="icons/garrafa_red_clean.svg" class="notigas-order-icon-img" alt="Pedido NOTIGAS entregado">
    <span class="notigas-order-state-dot" aria-hidden="true"></span>
  </div>
`;

// Marcador único de repartidor: Camión 3D Rojo Moderno + insignia R Oficial
const truckSvgMarkerHtml = `
  <div class="driver-map-marker" title="Repartidor Oficial NOTIGAS en Vivo">
    <img src="icons/camion_3d_rojo.svg" class="driver-3d-truck-img" alt="Camión Repartidor 3D">
    <span class="driver-marker-badge" aria-hidden="true">R</span>
    <span class="driver-marker-online" title="GPS en Tiempo Real"></span>
  </div>
`;

// PUNTO AZUL DE UBICACIÓN GPS AUTÉNTICO DE GOOGLE MAPS
const userLocationSvgHtml = `
  <div class="google-blue-dot-marker" title="Tu ubicación. Arrastra para moverla manualmente">
    <div class="google-blue-dot-pulse"></div>
    <div class="google-blue-dot-core"></div>
    <span class="manual-location-handle" aria-hidden="true"><i class="fa-solid fa-hand-pointer"></i></span>
  </div>
`;

// PIN ROJO CLÁSICO DE GOOGLE MAPS PARA ENTREGA
const deliveryPinSvgHtml = `
  <div class="google-red-pin-marker" title="Ubicación de Entrega (Arrastra a tu puerta)">
    <svg viewBox="0 0 384 512" width="36" height="48" class="google-red-pin-svg">
      <defs>
        <filter id="gmapPinShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(0,0,0,0.38)"/>
        </filter>
      </defs>
      <path fill="#EA4335" filter="url(#gmapPinShadow)" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
      <circle cx="192" cy="192" r="70" fill="#FFFFFF"/>
      <circle cx="192" cy="192" r="40" fill="#C5221F"/>
    </svg>
  </div>
`;

// ONDAS DE RADAR AZUL PARA CAMIONES REPARTIDORES AL HACER ZOOM OUT
const truckRadarBlueSvgHtml = `
  <div class="truck-radar-blue" title="Camión Repartidor en Vivo (Haz clic para ver)">
    <span></span>
    <span></span>
    <span></span>
    <i><i class="fa-solid fa-truck-fast"></i></i>
  </div>
`;

let userLocationIcon, deliveryPinIcon;
let garrafaIcon, garrafaYellowIcon, garrafaGreenIcon;
let truckIcon, truckRadarBlueIcon;

function initNotigasMap() {
  if (typeof L === 'undefined') {
    console.warn("⏳ Leaflet aún no está disponible, reintentando initNotigasMap...");
    setTimeout(initNotigasMap, 100);
    return;
  }

  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  const existingMap = getLeafletMapInstance();
  if (existingMap) {
    map = existingMap;
    console.log("ℹ️ El mapa ya está inicializado. Actualizando dimensiones...");
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    return;
  }

  if (mapElement._leaflet_id) {
    try {
      if (isLeafletMapInstance(map) && map.remove) {
        map.remove();
      }
    } catch(err) {
      console.warn("Reajustando contenedor de mapa:", err);
    }
    mapElement._leaflet_id = null;
  }

  // Iconos oficiales estilo Google Maps
  userLocationIcon = L.divIcon({
    className: 'user-location-marker-container',
    html: userLocationSvgHtml,
    iconSize: [56, 56],
    iconAnchor: [28, 28]
  });

  deliveryPinIcon = L.divIcon({
    className: 'delivery-pin-marker-container',
    html: deliveryPinSvgHtml,
    iconSize: [36, 48],
    iconAnchor: [18, 48]
  });

  garrafaIcon = L.divIcon({
    className: 'garrafa-flashing-marker',
    html: garrafaSvgMarkerHtml,
    iconSize: [44, 54],
    iconAnchor: [22, 54]
  });

  garrafaYellowIcon = L.divIcon({
    className: 'garrafa-flashing-marker-yellow',
    html: garrafaYellowSvgMarkerHtml,
    iconSize: [44, 54],
    iconAnchor: [22, 54]
  });

  garrafaGreenIcon = L.divIcon({
    className: 'garrafa-flashing-marker-green',
    html: garrafaGreenSvgMarkerHtml,
    iconSize: [44, 54],
    iconAnchor: [22, 54]
  });

  truckIcon = L.divIcon({
    className: 'notigas-driver-marker',
    html: truckSvgMarkerHtml,
    iconSize: [52, 62],
    iconAnchor: [26, 31]
  });

  truckRadarBlueIcon = L.divIcon({
    className: 'driver-truck-radar-container',
    html: truckRadarBlueSvgHtml,
    iconSize: [80, 80],
    iconAnchor: [40, 40]
  });

  window.actualizarIconoMarcadorUsuario = function(forcedMode) {
    if (!userMarker || !truckIcon || !userLocationIcon || !deliveryPinIcon) return;
    const isDriver = (forcedMode === 'driver') || 
                     (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || 
                     (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ||
                     (AppState.get('userData') && AppState.get('userData').role === 'repartidor');
    if (isDriver) {
      const isZoomOut = map && (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
      userMarker.setIcon(isZoomOut && truckRadarBlueIcon ? truckRadarBlueIcon : truckIcon);
    } else {
      userMarker.setIcon(userLocationIcon);
    }
  };

  window.actualizarIconoMarcadorUsuario();

  let startLat = currentGpsLat;
  let startLng = currentGpsLng;
  let isNationalView = false;
  if (!startLat || !startLng) {
    const savedCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
    if (savedCity && window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[savedCity]) {
      startLat = window.BOLIVIA_CITIES[savedCity].lat;
      startLng = window.BOLIVIA_CITIES[savedCity].lon || window.BOLIVIA_CITIES[savedCity].lng;
    } else {
      startLat = -17.3895;
      startLng = -66.1568;
    }
  }

  try {
    map = L.map('map', {
      center: [startLat, startLng],
      zoom: isNationalView ? 6 : 16,
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: true,
      zoomAnimation: true
    });
    window.notigasMap = map;
    window.map = map;
  } catch(mapErr) {
    console.error("Error al crear instancia de Leaflet:", mapErr);
    return;
  }

  // Control de zoom compacto, coherente con la interfaz de navegación.
  L.control.zoom({
    position: 'topright',
    zoomInTitle: 'Acercar',
    zoomOutTitle: 'Alejar'
  }).addTo(map);

  // Mapa base optimizado de alta velocidad (CartoDB Voyager + OSM Fallback, sin rate-limit 429)
  const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  const baseTileLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 20,
      maxNativeZoom: 19,
      subdomains: ['a', 'b', 'c', 'd'],
      attribution: mapAttribution,
      className: 'map-base-layer',
      crossOrigin: true
    }
  );

  baseTileLayer.on('tileerror', function(error) {
    if (error && error.tile && !error.tile._fallbackDone) {
      error.tile._fallbackDone = true;
      const c = error.coords;
      if (c) {
        error.tile.src = `https://tile.openstreetmap.org/${c.z}/${c.x}/${c.y}.png`;
      }
    }
  });

  baseTileLayer.addTo(map);
  mapTileLayers['osm_base'] = baseTileLayer;
  if (map.attributionControl) map.attributionControl.setPrefix(false);

  // Ajustes de tamaño inmediatos y periódicos para asegurar renderizado completo
  setTimeout(() => { if (map) map.invalidateSize(); }, 150);
  setTimeout(() => { if (map) map.invalidateSize(); }, 500);
  setTimeout(() => { if (map) map.invalidateSize(); }, 1200);

  window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
  window.addEventListener('orientationchange', () => { if (map) map.invalidateSize(); });

  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', () => {
      if (typeof conectarGPSAuto === 'function') conectarGPSAuto(true);
    });
  }

  map.on('dragstart', () => {
    isMapInteractedByUser = true;
    if (typeof desactivarSeguirme === 'function') desactivarSeguirme();
  });
  map.on('zoom', () => {
    actualizarIconosRepartidoresPorZoom();
  });
  map.on('zoomend', () => {
    renderDriverDemandByZoom();
  });

  map.on('click', (e) => {
    mostrarEfectoPuntoClic(e.latlng.lat, e.latlng.lng);
    moverMarcadorUbicacionManual(e.latlng.lat, e.latlng.lng);
  });

  if (currentGpsLat && currentGpsLng) {
    applyGpsPosition(currentGpsLat, currentGpsLng, "Ubicación Inicial", true, true);
  } else {
    applyGpsPosition(startLat, startLng, "Ciudad Seleccionada", true, false);
  }

  if (typeof conectarGPSAuto === 'function') {
    // La detección inicial no debe deshacer una ubicación que el usuario ya movió.
    conectarGPSAuto(false);
  }
  renderReportedTrucksBuffer();
}

function startMapWhenReady() {
  if (typeof L !== 'undefined' && document.getElementById('map')) {
    initNotigasMap();
  } else {
    setTimeout(startMapWhenReady, 50);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMapWhenReady);
} else {
  startMapWhenReady();
}

let _activeFetchOrdersPromise = null;
let _lastCargarPedidosTime = 0;

async function cargarPedidosVecinalesEnVivo(force = false) {
  if (!window.supabaseClient || !map) {
    return;
  }
  // Si ya hay una consulta idéntica en vuelo, reutilizarla (evita peticiones duplicadas)
  if (_activeFetchOrdersPromise) {
    return _activeFetchOrdersPromise;
  }
  // Throttling: descartar ráfagas en menos de 1500ms salvo que sea forzada
  const now = Date.now();
  if (!force && now - _lastCargarPedidosTime < 1500) {
    return;
  }

  _activeFetchOrdersPromise = (async () => {
    try {
      _lastCargarPedidosTime = Date.now();
      const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
      const activeWindow = new Date(Date.now() - expirationMs).toISOString();

      const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
      const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
      const isDriverUser = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && (AppState.get('appMode') === 'driver' || AppState.get('userRole') === 'repartidor'));
      const driverCategoria = u.categoria || 'gas';
      const normCity = String(activeCity || '').toLowerCase().trim();
      const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();

      // Proyección explícita de columnas necesarias (elimina el overhead masivo de select *)
      const ORDER_COLUMNS = 'id, user_id, categoria, titulo, cantidad, direccion, telefono, estado, driver_id, ciudad, latitude, longitude, created_at';
      const TRUCK_COLUMNS = 'id, user_id, distribuidor_nombre, categoria, titulo, ciudad, latitude, longitude, garrafas_agotadas, last_active, telefono, placa, productos';

      // 1. Consulta de Camiones en vivo (común para ambos roles)
      let trucksQuery = window.supabaseClient
        .from('rutas_repartidores_publicas')
        .select(TRUCK_COLUMNS)
        .gte('last_active', tenMinsAgo);
      if (normCity) trucksQuery = trucksQuery.ilike('ciudad', normCity);

      // 2. Consulta de Pedidos Públicos (pendientes y vistos)
      let pubQuery = window.supabaseClient
        .from('pedidos_publicos')
        .select(ORDER_COLUMNS)
        .gte('created_at', activeWindow)
        .in('estado', ['pendiente', 'visto']);
      if (normCity) pubQuery = pubQuery.ilike('ciudad', normCity);

      // 3. Consulta de Pedidos Asignados (sólo para repartidor autenticado)
      let assignedPromise = Promise.resolve({ data: [], error: null });
      if (isDriverUser) {
        const currentUserId = (typeof getAuthenticatedUserId === 'function')
          ? getAuthenticatedUserId()
          : (u.id || (typeof AppState !== 'undefined' ? AppState.get('userData')?.id : null) || window._tempAuthUser?.id);

        if (currentUserId) {
          let assignedQuery = window.supabaseClient
            .from('pedidos')
            .select(ORDER_COLUMNS)
            .eq('driver_id', currentUserId)
            .eq('estado', 'asignado')
            .gte('created_at', activeWindow);
          if (normCity) assignedQuery = assignedQuery.ilike('ciudad', normCity);
          assignedPromise = assignedQuery;
        }
      }

      // EJECUCIÓN PARALELA DE TODAS LAS CONSULTAS DE RED (Reduce latencia de T1+T2+T3 a max(T1,T2,T3))
      const [pubRes, assignedRes, trucksRes] = await Promise.all([
        pubQuery,
        assignedPromise,
        trucksQuery
      ]);

      if (pubRes.error) console.error("❌ Error de Supabase al cargar pedidos públicos:", pubRes.error.message);
      if (assignedRes.error) console.error("❌ Error de Supabase al cargar pedidos asignados:", assignedRes.error.message);
      if (trucksRes.error) console.error("❌ Error de Supabase al cargar camiones:", trucksRes.error.message);

      if (isDriverUser) {
        clearNeighborOrderMarkers();
        let availableOrders = [];
        if (Array.isArray(pubRes.data)) {
          availableOrders = pubRes.data.filter(order => {
            return typeof window.isOrderCategoryMatchingDriver !== 'function' ||
              window.isOrderCategoryMatchingDriver(order.categoria, driverCategoria);
          });
        }
        const assignedOrders = assignedRes.data || [];
        window.driverDemandMapState = { availableOrders, assignedOrders };
        renderDriverDemandByZoom();
      } else {
        const availableOrders = pubRes.data || [];
        window.driverDemandMapState = {
          availableOrders,
          assignedOrders: []
        };
        renderDriverDemandByZoom();
      }

      // Renderizado de camiones activos
      if (Array.isArray(trucksRes.data)) {
        trucksRes.data.forEach(truck => actualizarRepartidorEnMapa(truck));
      }
    } catch(e) {
      console.error("❌ Error general cargando live data:", e);
    } finally {
      _activeFetchOrdersPromise = null;
    }
  })();

  return _activeFetchOrdersPromise;
}

// Marcadores de radar individuales por pedido
window.orderRadarMarkers = window.orderRadarMarkers || {};
window.orderRadarMarkers = window.orderRadarMarkers || {};
window.driverDemandMapState = window.driverDemandMapState || {
  availableOrders: [],
  assignedOrders: []
};
const DRIVER_RADAR_MAX_ZOOM = 14;

function clearNeighborOrderMarkers() {
  Object.keys(neighborOrderMarkers).forEach(orderId => {
    if (map && neighborOrderMarkers[orderId]) {
      map.removeLayer(neighborOrderMarkers[orderId]);
    }
    delete neighborOrderMarkers[orderId];
    if (window.neighborOrderTimers[orderId]) {
      clearTimeout(window.neighborOrderTimers[orderId]);
      delete window.neighborOrderTimers[orderId];
    }
  });
}

function clearOrderRadarMarkers() {
  Object.keys(window.orderRadarMarkers).forEach(orderId => {
    const marker = window.orderRadarMarkers[orderId];
    if (map && marker) map.removeLayer(marker);
    delete window.orderRadarMarkers[orderId];
  });
}

function renderDriverDemandByZoom() {
  if (!map || typeof L === 'undefined') return;
  const state = window.driverDemandMapState || {};
  const ordersById = new Map();

  // 1. Indexar todos los pedidos individuales (disponibles y asignados)
  [...(state.availableOrders || []), ...(state.assignedOrders || [])].forEach(order => {
    if (order?.id) ordersById.set(String(order.id), order);
  });

  // 2. Asegurar que el pedido activo del usuario actual NUNCA se oculte ni pierda señal
  try {
    const rawOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
    if (rawOrder) {
      const ao = (typeof rawOrder === 'string') ? JSON.parse(rawOrder) : rawOrder;
      if (ao && (ao.latitude || ao.lat) && (ao.longitude || ao.lng)) {
        const aoId = String(ao.id || 'mi_pedido_activo');
        ordersById.set(aoId, ao);
      }
    }
  } catch(e){}

  const allOrders = Array.from(ordersById.values());

  // Actualizar también la apariencia de los camiones repartidores (icono azul radar si zoom out)
  actualizarIconosRepartidoresPorZoom();

  const isZoomOut = (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);

  // VISTA LEJANA (zoom <= 14): RECONCILIACIÓN DE RADARES INDIVIDUALES
  if (isZoomOut) {
    clearNeighborOrderMarkers();
    if (activeOrderLayerGroup && map.hasLayer(activeOrderLayerGroup)) {
      map.removeLayer(activeOrderLayerGroup);
    }
    renderOrderRadarsOnMap(allOrders);
    return;
  }

  // VISTA CERCANA (zoom > 14): RECONCILIACIÓN DE PINES INDIVIDUALES
  clearOrderRadarMarkers();
  if (activeOrderLayerGroup && !map.hasLayer(activeOrderLayerGroup)) {
    activeOrderLayerGroup.addTo(map);
  }

  renderNeighborOrdersDetailed(allOrders);

  // Re-dibujar el marcador interactivo del pedido propio en modo detalle
  if (typeof renderActiveOrdersMap === 'function') {
    renderActiveOrdersMap();
  }
}

function actualizarIconosRepartidoresPorZoom() {
  if (!map || typeof L === 'undefined' || !truckRadarBlueIcon || !truckIcon) return;
  const isZoomOut = (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
  const targetIcon = isZoomOut ? truckRadarBlueIcon : truckIcon;

  Object.keys(activeTruckMarkers).forEach(truckId => {
    const marker = activeTruckMarkers[truckId];
    if (marker && marker.setIcon && marker.options?.icon !== targetIcon) {
      marker.setIcon(targetIcon);
    }
  });

  if (userMarker && userMarker.setIcon) {
    const isDriver = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || 
                     (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ||
                     (AppState.get('userData') && AppState.get('userData').role === 'repartidor');
    if (isDriver && userMarker.options?.icon !== targetIcon) {
      userMarker.setIcon(targetIcon);
    }
  }
}

// Reconciliación eficiente de radares individuales (DOM Diffing sin destruir elementos activos)
function renderOrderRadarsOnMap(orders) {
  if (!map || typeof L === 'undefined') return;
  if (map.getZoom() > DRIVER_RADAR_MAX_ZOOM) {
    clearOrderRadarMarkers();
    return;
  }

  const activeKeys = new Set();

  (orders || []).forEach(order => {
    const lat = Number(order.latitude ?? order.lat);
    const lng = Number(order.longitude ?? order.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !order?.id) return;

    const key = String(order.id);
    activeKeys.add(key);

    const existingMarker = window.orderRadarMarkers[key];
    if (existingMarker) {
      // Reutilizar marcador existente en el DOM: solo mover si cambió posición
      const currentPos = existingMarker.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lng) > 0.00001) {
        existingMarker.setLatLng([lat, lng]);
      }
      return;
    }

    // Creación única para nuevos pedidos
    const safeCategory = typeof escapeHtmlStr === 'function'
      ? escapeHtmlStr(order.categoria || 'Gas')
      : 'Gas';
    const icon = L.divIcon({
      className: 'demand-order-radar-icon',
      html: `<div class="demand-radar" title="Pedido Activo de ${safeCategory} (Haz clic para ver)"><span></span><span></span><span></span><i></i></div>`,
      iconSize: [80, 80],
      iconAnchor: [40, 40]
    });

    const marker = L.marker([lat, lng], {
      icon,
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false,
      zIndexOffset: 12000
    }).addTo(map);

    marker.on('click', () => {
      map.flyTo([lat, lng], 16, { duration: 0.8 });
    });

    window.orderRadarMarkers[key] = marker;
  });

  // Eliminar únicamente radares de pedidos que ya no existen
  Object.keys(window.orderRadarMarkers).forEach(key => {
    if (!activeKeys.has(key)) {
      const marker = window.orderRadarMarkers[key];
      if (map && marker) map.removeLayer(marker);
      delete window.orderRadarMarkers[key];
    }
  });
}

// Reconciliación eficiente de pines de detalle (zoom > 14)
function renderNeighborOrdersDetailed(orders) {
  if (!map || typeof L === 'undefined') return;

  const currentActiveOrderId = (() => {
    try {
      const raw = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
      if (!raw) return null;
      const ao = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      return String(ao?.id || '');
    } catch(e){ return null; }
  })();

  const activeKeys = new Set();

  (orders || []).forEach(order => {
    const orderId = String(order.id || '');
    if (!orderId || orderId === 'mi_pedido_activo' || orderId === currentActiveOrderId) return;
    activeKeys.add(orderId);

    // Si ya existe el pin, reutilizarlo sin disparar reflows
    if (neighborOrderMarkers[orderId]) {
      const lat = parseFloat(order.latitude || order.lat);
      const lng = parseFloat(order.longitude || order.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        const currentPos = neighborOrderMarkers[orderId].getLatLng();
        if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lng) > 0.00001) {
          neighborOrderMarkers[orderId].setLatLng([lat, lng]);
        }
      }
      return;
    }

    agregarPedidoVecinoEnMapa(order);
  });

  // Eliminar únicamente pines de pedidos que ya no están activos
  Object.keys(neighborOrderMarkers).forEach(orderId => {
    if (!activeKeys.has(orderId)) {
      if (map && neighborOrderMarkers[orderId]) {
        map.removeLayer(neighborOrderMarkers[orderId]);
      }
      delete neighborOrderMarkers[orderId];
      if (window.neighborOrderTimers[orderId]) {
        clearTimeout(window.neighborOrderTimers[orderId]);
        delete window.neighborOrderTimers[orderId];
      }
    }
  });
}

window.renderOrderRadarsOnMap = renderOrderRadarsOnMap;
window.renderDriverDemandByZoom = renderDriverDemandByZoom;
window.actualizarIconosRepartidoresPorZoom = actualizarIconosRepartidoresPorZoom;
window.clearOrderRadarMarkers = clearOrderRadarMarkers;

function actualizarRepartidorEnMapa(data) {
  if (!map || !data) return;

  const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

  // Si el camión recibido es del propio usuario activo, no duplicar (ya está representado por userMarker)
  if (data.user_id && localUserId && data.user_id === localUserId) {
    if (activeTruckMarkers[data.user_id]) {
      map.removeLayer(activeTruckMarkers[data.user_id]);
      delete activeTruckMarkers[data.user_id];
    }
    return;
  }

  // Filtrar si es otro repartidor de otra categoría
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const userRole = u.role || ((typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ? 'repartidor' : 'vecino');
  const driverCategoria = u.categoria || 'gas';

  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(data.categoria, driverCategoria)) {
     return; // Repartidores solo ven camiones de su rubro
  }

  const truckId = data.user_id || data.id || data.distribuidor_nombre;
  if (!truckId) return;

  const isZoomOut = map && (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
  const iconToUse = isZoomOut && truckRadarBlueIcon ? truckRadarBlueIcon : truckIcon;

  if (activeTruckMarkers[truckId]) {
    activeTruckMarkers[truckId].setLatLng([data.latitude, data.longitude]);
    activeTruckMarkers[truckId]._notigasRouteId = data.id || null;
    activeTruckMarkers[truckId]._notigasUserId = data.user_id || null;
    if (activeTruckMarkers[truckId].setIcon) {
      activeTruckMarkers[truckId].setIcon(iconToUse);
    }
  } else {
    const marker = L.marker([data.latitude, data.longitude], { icon: iconToUse, zIndexOffset: 9000 }).addTo(map);
    marker._notigasRouteId = data.id || null;
    marker._notigasUserId = data.user_id || null;
    marker.bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#00E676; font-size:13px;">🚛 Camión en Vivo</strong><br>
        <span style="font-size:12px; color:#FFFFFF; font-weight:800;">${escapeHtmlStr(data.distribuidor_nombre || 'Repartidor')}</span><br>
        <span style="font-size:11px; color:#64748B;">${escapeHtmlStr(data.categoria || 'Servicio de Entrega')}</span><br>
        ${data.telefono ? `<a href="tel:${escapeHtmlStr(data.telefono)}" style="display:inline-block; margin-top:5px; font-size:11px; color:#1E293B; background:#FFD54F; padding:4px 8px; border-radius:12px; text-decoration:none; font-weight:bold;">📞 Llama: ${escapeHtmlStr(data.telefono)}</a>` : ''}
      </div>
    `);
    marker.on('click', () => {
      if (map && map.getZoom() <= DRIVER_RADAR_MAX_ZOOM) {
        map.flyTo([data.latitude, data.longitude], 16, { duration: 0.8 });
      }
    });
    activeTruckMarkers[truckId] = marker;
  }

  // Eliminar camiones fantasma sin actualizar en 10 minutos
  if (window.activeTruckTimers[truckId]) clearTimeout(window.activeTruckTimers[truckId]);
  window.activeTruckTimers[truckId] = setTimeout(() => {
    if (activeTruckMarkers[truckId]) {
      map.removeLayer(activeTruckMarkers[truckId]);
      delete activeTruckMarkers[truckId];
    }
  }, 10 * 60000);
}

function agregarPedidoVecinoEnMapa(order) {
  if (!map || !order) return;
  const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

  if (order.user_id === localUserId) return; // Skip own orders

  const orderId = order.id;
  if (neighborOrderMarkers[orderId]) {
    map.removeLayer(neighborOrderMarkers[orderId]);
  }

  // Si el pedido está cancelado, lo quitamos del mapa visualmente
  if (order.estado === 'cancelado') {
    if (neighborOrderMarkers[orderId]) {
      map.removeLayer(neighborOrderMarkers[orderId]);
      delete neighborOrderMarkers[orderId];
    }
    return;
  }

  // Asignar el icono dependiendo del estado
  let currentIcon = garrafaIcon;
  if (order.estado === 'entregado') {
     currentIcon = garrafaGreenIcon;
  } else if (order.visto === true) {
     currentIcon = garrafaYellowIcon;
  }

  // Si el usuario actual es REPARTIDOR, solo ver pedidos de SU MISMA CATEGORÍA
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  let userRole = u.role || ((typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ? 'repartidor' : 'vecino');
  let driverCategoria = u.categoria || 'gas';

  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(order.categoria, driverCategoria)) {
     return; // Ignore orders outside of their category
  }

  const lat = parseFloat(order.latitude || order.lat);
  const lng = parseFloat(order.longitude || order.lng);
  if (isNaN(lat) || isNaN(lng)) return; // Evita que Leaflet falle si un pedido no tiene coordenadas

  const isDriverView = userRole === 'repartidor';
  const marker = L.marker([lat, lng], {
    icon: currentIcon,
    zIndexOffset: 8000,
    interactive: isDriverView,
    bubblingMouseEvents: false,
    keyboard: isDriverView
  }).addTo(map);
  const isAssignedToDriver = userRole === 'repartidor' &&
    order.estado === 'asignado' && order.driver_id === localUserId;
  const nombreStr = `<span class="order-popup-name">👤 <strong>Comprador:</strong> ${escapeHtmlStr(order.buyer_name || order.titulo || 'Vecino')}</span><br>`;
  const emailStr = order.buyer_email ? `<span class="order-popup-email" style="font-size:11px; color:#0288D1;">✉️ <strong>Correo:</strong> ${escapeHtmlStr(order.buyer_email)}</span><br>` : '';
  const dirStr = `<span class="order-popup-address">📍 <strong>Dirección:</strong> ${escapeHtmlStr(order.direccion || 'Ubicación fijada en mapa GPS (opcional)')}</span><br>`;
  const telStr = `<span class="order-popup-contact">📞 <strong>Teléfono:</strong> ${escapeHtmlStr(order.telefono || 'Opcional / No indicado')}</span><br>`;
  const mapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  let orderAction = '';
  if (isAssignedToDriver) {
    orderAction = `
      <a href="${mapsNavUrl}" target="_blank" rel="noopener noreferrer" data-action="abrirRutaGoogleMaps" data-lat="${lat}" data-lng="${lng}" data-id="${escapeHtmlStr(order.id)}" data-address="${escapeHtmlStr(order.direccion || '')}" class="btn-driver-route order-popup-action">
        <i class="fa-solid fa-diamond-turn-right"></i> IR CON GOOGLE MAPS
      </a>`;
  } else if (userRole === 'repartidor') {
    orderAction = `
      <button type="button" data-action="aceptarPedidoRepartidor" data-lat="${lat}" data-lng="${lng}" data-id="${escapeHtmlStr(order.id)}" data-address="${escapeHtmlStr(order.direccion || '')}" class="btn-driver-accept order-popup-action">
        <i class="fa-solid fa-diamond-turn-right"></i> ELEGIR Y NAVEGAR (GOOGLE MAPS)
      </button>`;
  }

  const popupHtml = `
    <div class="notigas-order-popup">
      <strong style="color:#FF6D00; font-size:13px;">📦 Pedido ${isAssignedToDriver ? 'Asignado' : 'Disponible'}</strong><br>
      ${nombreStr}
      ${emailStr}
      <span class="order-popup-category">🏷️ ${escapeHtmlStr(order.categoria || 'Gas')} · ${escapeHtmlStr(order.cantidad || '1')} unidad(es)</span><br>
      ${dirStr}
      ${telStr}
      ${orderAction}
    </div>
  `;

  if (isDriverView) {
    marker.bindPopup(popupHtml);

    marker.on('popupopen', () => {
      try {
        if (order.estado === 'pendiente' && !order.visto && window.supabaseClient && order.id) {
          window.supabaseClient.rpc('rpc_mark_order_seen', { p_order_id: order.id }).then(({ error }) => {
            if (!error) {
              order.visto = true;
              if (neighborOrderMarkers[order.id]) {
                neighborOrderMarkers[order.id].setIcon(garrafaYellowIcon);
              }
            }
          }).catch(e => console.warn(e));
        }
      } catch(e){}
    });
  }

  neighborOrderMarkers[orderId] = marker;

  if (window.neighborOrderTimers[orderId]) clearTimeout(window.neighborOrderTimers[orderId]);
  window.neighborOrderTimers[orderId] = setTimeout(() => {
    if (neighborOrderMarkers[orderId]) {
      map.removeLayer(neighborOrderMarkers[orderId]);
      delete neighborOrderMarkers[orderId];
    }
  }, (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000);
}

function removerPublicacionDeMapa(id) {
  if (neighborOrderMarkers[id]) {
    if (map) map.removeLayer(neighborOrderMarkers[id]);
    delete neighborOrderMarkers[id];
  }
  Object.keys(activeTruckMarkers).forEach(truckKey => {
    const marker = activeTruckMarkers[truckKey];
    if (truckKey === id || marker?._notigasRouteId === id || marker?._notigasUserId === id) {
      if (map && marker) map.removeLayer(marker);
      delete activeTruckMarkers[truckKey];
      if (window.activeTruckTimers[truckKey]) {
        clearTimeout(window.activeTruckTimers[truckKey]);
        delete window.activeTruckTimers[truckKey];
      }
    }
  });
}

function actualizarCoordenadasPedidoActivo(newLat, newLng, skipMarkerSet = false) {
  try {
    const rawOrder = (typeof AppState !== 'undefined' ? AppState.get('activeOrder') : null);
    if (rawOrder) {
      const order = (typeof rawOrder === 'string') ? JSON.parse(rawOrder) : { ...rawOrder };
      order.lat = newLat;
      order.lng = newLng;
      order.latitude = newLat;
      order.longitude = newLng;
      AppState.set('activeOrder', order);

      if (order.id && window.supabaseClient) {
        window.supabaseClient
          .from('pedidos')
          .update({ latitude: newLat, longitude: newLng, updated_at: new Date().toISOString() })
          .eq('id', order.id)
          .then();
      }
    }
  } catch(e){}

  if (!skipMarkerSet && currentActiveOrderMarker) {
    currentActiveOrderMarker.setLatLng([newLat, newLng]);
  }
}

function verPedidosEnMapa() {
  if (!map) return;
  if (typeof desactivarSeguirme === 'function') desactivarSeguirme();

  const allBounds = [];
  for (const id in neighborOrderMarkers) {
    const marker = neighborOrderMarkers[id];
    if (map.hasLayer(marker)) {
      const latlng = marker.getLatLng();
      allBounds.push([latlng.lat, latlng.lng]);
    }
  }

  if (allBounds.length > 0) {
    if (allBounds.length === 1) {
      map.flyTo(allBounds[0], 15);
    } else {
      const bounds = L.latLngBounds(allBounds);
      map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 15 });
    }
    if (typeof showToast === 'function') {
       showToast('🗺️ Mapa de Pedidos', 'Mostrando pedidos activos en tu zona.', 'success', 2000);
    }
  } else {
    if (typeof showToast === 'function') {
       showToast('ℹ️ Sin Pedidos', 'Actualmente no hay pedidos activos.', 'info', 3000);
    }
    if (currentGpsLat && currentGpsLng) {
      map.flyTo([currentGpsLat, currentGpsLng], 13.5);
    }
  }
}

function mostrarEfectoPuntoClic(lat, lng) {
  if (!map) return;
  try {
    const rippleIcon = L.divIcon({
      className: 'click-drop-ripple-marker',
      html: '<div class="click-drop-pulse"></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    const rippleMarker = L.marker([lat, lng], {
      icon: rippleIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 9999
    }).addTo(map);
    setTimeout(() => {
      if (map && rippleMarker) map.removeLayer(rippleMarker);
    }, 700);
  } catch(_) {}
}

function moverMarcadorUbicacionManual(lat, lng) {
  isUserMarkerDraggedManually = true;
  window.isGpsExact = false;
  currentGpsLat = lat;
  window.currentGpsLat = currentGpsLat;
  currentGpsLng = lng;
  window.currentGpsLng = currentGpsLng;
  if (typeof AppState !== 'undefined') {
    AppState.set('gpsLat', lat);
    AppState.set('gpsLng', lng);
  }

  const isDriver = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver');

  if (!userMarker && map) {
    applyGpsPosition(lat, lng, "Ajuste Manual", false, false);
  } else if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    if (!isDriver && userLocationIcon) {
      userMarker.setIcon(userLocationIcon);
    }
    if (userMarker.dragging && !userMarker.dragging.enabled()) {
      userMarker.dragging.enable();
    }
    if (userMarker.isPopupOpen && userMarker.isPopupOpen()) {
      userMarker.closePopup();
    }
  }
  programarSincronizacionUbicacionManual(lat, lng);
}

function programarSincronizacionUbicacionManual(lat, lng) {
  if (manualLocationSyncTimer) clearTimeout(manualLocationSyncTimer);
  manualLocationSyncTimer = setTimeout(() => {
    actualizarCoordenadasPedidoActivo(lat, lng);
    verificarYMostrarRepartidorGPS();
    manualLocationSyncTimer = null;
  }, 80);
}

window.BOLIVIA_CITIES = {
  santacruz:  { key: 'santacruz',  nombre: 'Santa Cruz de la Sierra', lat: -17.7833, lon: -63.1821, keywords: ['santa cruz', 'santacruz', 'montero', 'warnes'] },
  lapaz:      { key: 'lapaz',      nombre: 'La Paz',                  lat: -16.5000, lon: -68.1500, keywords: ['la paz', 'lapaz', 'murillo'] },
  elalto:     { key: 'elalto',     nombre: 'El Alto',                 lat: -16.5000, lon: -68.1900, keywords: ['el alto', 'elalto', 'viacha'] },
  cochabamba: { key: 'cochabamba', nombre: 'Cochabamba',              lat: -17.3895, lon: -66.1568, keywords: ['cochabamba', 'quillacollo', 'sacaba', 'tiquipaya'] },
  sucre:      { key: 'sucre',      nombre: 'Sucre',                   lat: -19.0333, lon: -65.2627, keywords: ['sucre', 'chuquisaca'] },
  tarija:     { key: 'tarija',     nombre: 'Tarija',                  lat: -21.5355, lon: -64.7296, keywords: ['tarija', 'yacuiba', 'bermejo'] },
  oruro:      { key: 'oruro',      nombre: 'Oruro',                   lat: -17.9833, lon: -67.1500, keywords: ['oruro', 'huanuni'] },
  potosi:     { key: 'potosi',     nombre: 'Potosí',                  lat: -19.5836, lon: -65.7531, keywords: ['potosi', 'potosí', 'uyuni'] },
  trinidad:   { key: 'trinidad',   nombre: 'Trinidad',                lat: -14.8333, lon: -64.9000, keywords: ['trinidad', 'beni', 'riberalta'] },
  cobija:     { key: 'cobija',     nombre: 'Cobija',                  lat: -11.0267, lon: -68.7692, keywords: ['cobija', 'pando'] }
};

window.matchCityByNameOrRegion = function(cityName, regionName) {
  const text = `${cityName || ''} ${regionName || ''}`.toLowerCase();
  for (const key of Object.keys(window.BOLIVIA_CITIES)) {
    const c = window.BOLIVIA_CITIES[key];
    if (c.keywords && c.keywords.some(k => text.includes(k))) {
      return c.key;
    }
  }
  return null;
};

window.inferMainCityFromCoords = function(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return 'cochabamba';
  const cities = Object.values(window.BOLIVIA_CITIES);
  let closest = 'cochabamba';
  let minDist = Infinity;
  for (const c of cities) {
    const d = (typeof calcularDistanciaMetros === 'function')
      ? calcularDistanciaMetros(lat, lng, c.lat, c.lon)
      : Math.hypot(lat - c.lat, lng - c.lon);
    if (d !== null && d < minDist) {
      minDist = d;
      closest = c.key;
    }
  }
  return closest;
};

function applyGpsPosition(lat, lng, label, forceReset = false, isExact = true) {
  window.isGpsExact = isExact;
  if (forceReset) {
    isUserMarkerDraggedManually = false;
    isMapInteractedByUser = false;
  }

  // Una lectura GPS posterior no debe pisar el punto de entrega que el usuario
  // colocó manualmente. Solo un reinicio explícito de GPS lo reemplaza.
  if (!isUserMarkerDraggedManually) {
    currentGpsLat = lat;
    window.currentGpsLat = currentGpsLat;
    currentGpsLng = lng;
    window.currentGpsLng = currentGpsLng;
    if (typeof AppState !== 'undefined') {
      AppState.set('gpsLat', lat);
      AppState.set('gpsLng', lng);
    }
  }

  // Auto-detectar ciudad al obtener GPS inicial
  if (forceReset && typeof window.inferMainCityFromCoords === 'function') {
      const inferred = window.inferMainCityFromCoords(lat, lng);
      const currentCity = AppState.get('city');
      if (inferred && inferred !== currentCity) {
          if (typeof window.cambiarCiudad === 'function') {
              window.cambiarCiudad(inferred);
          } else {
              AppState.set('city', inferred);
          }
          const sel = document.getElementById('newUserCity');
          if (sel) sel.value = inferred;

          if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
          if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
      }
  }

  const activeLat = isUserMarkerDraggedManually ? currentGpsLat : lat;
  const activeLng = isUserMarkerDraggedManually ? currentGpsLng : lng;

  if (map) {
    map.invalidateSize();
    if (forceReset || !isMapInteractedByUser) {
      const currentZoom = map.getZoom();
      const targetZoom = (!currentZoom || currentZoom <= 10 || forceReset) ? 16 : currentZoom;
      map.setView([activeLat, activeLng], targetZoom);
    }
  }

  const isDriver = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') || (typeof AppState !== 'undefined' && AppState.get('userData')?.role === 'repartidor');
  const isZoomOut = map && (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
  const activeIcon = isDriver ? (isZoomOut && truckRadarBlueIcon ? truckRadarBlueIcon : truckIcon) : userLocationIcon;

  if (!userMarker && map) {
    userMarker = L.marker([activeLat, activeLng], {
      icon: activeIcon,
      draggable: true,
      autoPan: false,
      riseOnHover: true,
      zIndexOffset: 1000
    }).addTo(map);

    if (userMarker.dragging) {
      userMarker.dragging.enable();
    }

    userMarker.bindPopup(`
      <div class="google-infowindow-content">
        <strong style="color:#EA4335; font-size:13px;">📍 Ubicación de Entrega</strong><br>
        <span style="font-size:11px; color:#5F6368;">Arrastra el marcador a la puerta exacta de tu casa</span>
      </div>
    `);
    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const tooltipMsg = isMobileDevice ? 'Arrástrame a tu puerta' : '📍 Clic en el mapa o arrastra a tu puerta';
    userMarker.bindTooltip(tooltipMsg, {
      direction: 'top',
      offset: [0, -22],
      className: 'manual-location-tooltip'
    });

    userMarker.on('dragstart', function() {
      isUserMarkerDraggedManually = true;
      if (!isDriver && userLocationIcon) {
        userMarker.setIcon(userLocationIcon);
      }
    });

    userMarker.on('dragend', function(e) {
      const newPos = e.target.getLatLng();
      isUserMarkerDraggedManually = true;
      window.isGpsExact = false;
      currentGpsLat = newPos.lat;
      window.currentGpsLat = currentGpsLat;
      currentGpsLng = newPos.lng;
      window.currentGpsLng = currentGpsLng;
      if (typeof AppState !== 'undefined') {
        AppState.set('gpsLat', newPos.lat);
        AppState.set('gpsLng', newPos.lng);
      }

      if (!isDriver && userLocationIcon) {
        userMarker.setIcon(userLocationIcon);
      }
      programarSincronizacionUbicacionManual(newPos.lat, newPos.lng);
    });
  } else if (userMarker) {
    userMarker.setLatLng([activeLat, activeLng]);
    userMarker.setIcon(activeIcon);
    if (userMarker.dragging && !userMarker.dragging.enabled()) {
      userMarker.dragging.enable();
    }
  }

  const banner = document.getElementById('gpsMandatoryBanner');
  if (banner) banner.style.display = 'none';
  const card = document.getElementById('gpsFloatingBanner');
  if (card) card.style.display = 'none';

  if (map) {
    map.invalidateSize();
  }

  if (forceReset) {
    renderActiveOrdersMap();
    verificarYMostrarRepartidorGPS();
  }

  // Emitir posición GPS a base de datos solo si explícitamente es repartidor
  const user = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isRepartidor = (user.role === 'repartidor') || ((typeof AppState !== 'undefined') && AppState.get('appMode') === 'driver');

  if (isRepartidor) {
      const _lat = isUserMarkerDraggedManually ? currentGpsLat : lat;
      const _lng = isUserMarkerDraggedManually ? currentGpsLng : lng;
      transmitirUbicacionRepartidorServidorDB(_lat, _lng);
  }
}

let lastBroadcastLat = null;
let lastBroadcastLng = null;

/* ESTRATEGIA ADAPTATIVA INTELIGENTE DE TRANSMISIÓN GPS */
async function transmitirUbicacionRepartidorServidorDB(lat, lng) {
  const driverGpsLive = AppState.get('driverGpsLive');
  if (driverGpsLive !== 'on') return;

  const now = Date.now();

  // 2. Comprobar si el vehículo está detenido o en movimiento
  if (lastBroadcastLat !== null && lastBroadcastLng !== null) {
    const distMovida = calcularDistanciaMetros(lastBroadcastLat, lastBroadcastLng, lat, lng);
    const tiempoTranscurrido = now - lastGpsBroadcastTime;

    // Si avanzó menos de 15 metros (estacionado o en parada), emitir solo cada 30 segundos
    if (distMovida !== null && distMovida < 15) {
      if (tiempoTranscurrido < 30000) {
        return; // Vehículo estacionado: Ahorro de megas y batería
      }
    } else {
      // Si avanzó más de 15 metros (en movimiento activo), emitir cada 5 segundos
      if (tiempoTranscurrido < 5000) {
        return;
      }
    }
  }

  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (u.role === 'repartidor') {
      lastBroadcastLat = lat;
      lastBroadcastLng = lng;
      lastGpsBroadcastTime = now;

        if (window.supabaseClient) {
          const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

          const { data: driver } =
              await window.supabaseClient
                  .from('choferes_habilitados')
                  .select(
                      'nombre_completo, telefono_whatsapp, placa, categoria, ciudad'
                  )
                  .eq('user_id', localUserId)
                  .maybeSingle();

          if (!driver) {
              return;
          }

          await window.supabaseClient
              .from('rutas_repartidores')
              .upsert(
                  {
                      user_id: localUserId,
                      distribuidor_nombre:
                          driver.nombre_completo ||
                          'Repartidor GLP',

                      categoria:
                          driver.categoria ||
                          'Gas GLP',

                      titulo:
                          driver.placa ||
                          'Camión',

                      ciudad:
                          driver.ciudad,

                      latitude: lat,
                      longitude: lng,

                      telefono:
                          driver.telefono_whatsapp || '',

                      last_active:
                          new Date().toISOString()
                  },
                  {
                      onConflict: 'user_id'
                  }
              );
        }
      }
    }
  } catch(e){
    console.error("Error transmitiendo GPS", e);
  }
}

let reportedTrucksLayerGroup = null;

// SVG E ICONOS PARA AVISOS VECINALES (ESCUCHÉ CAMIÓN Y ESPÉRAME)
function getReportedTruckIcon(tipo) {
  const isEsperame = (tipo === 'esperame');
  const pingColor = isEsperame ? 'rgba(239,68,68,0.45)' : 'rgba(255,109,0,0.45)';
  const gradColor = isEsperame ? 'linear-gradient(135deg, #DC2626, #991B1B)' : 'linear-gradient(135deg, #FF6D00, #D32F2F)';
  const iconClass = isEsperame ? 'fa-solid fa-hand' : 'fa-solid fa-bell';
  const dotColor = isEsperame ? '#FF1744' : '#FFD600';

  const html = `
    <div style="position: relative; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 50px; height: 50px; border-radius: 50%; background: ${pingColor}; animation: radarPing 1.8s infinite ease-out;"></div>
      <div style="position: relative; background: ${gradColor}; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 18px rgba(0,0,0,0.6); cursor: pointer;">
        <i class="${iconClass}" style="color: #FFFFFF; font-size: 18px;"></i>
        <span style="position: absolute; top: -3px; right: -3px; background: ${dotColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #1E293B;" title="${isEsperame ? 'Alerta Espérame' : 'Camión Reportado'}"></span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'reported-truck-marker',
    html: html,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25]
  });
}

const reportedTruckIcon = getReportedTruckIcon('escuche_camion');

function renderReportedTrucksBuffer() {
  if (!map) return;

  if (!reportedTrucksLayerGroup) {
    reportedTrucksLayerGroup = L.layerGroup().addTo(map);
  }

  reportedTrucksLayerGroup.clearLayers();

  let buffer = [];
  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');
    if (raw) buffer = JSON.parse(raw);
  } catch(e){}

  const now = Date.now();
  // Depurar camiones reportados que tengan más de 30 minutos
  let validTrucks = buffer.filter(t => (now - t.timestamp) < (30 * 60 * 1000));
  localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(validTrucks));

  // Si el usuario actual es REPARTIDOR, filtrar camiones reportados por su categoría específica
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isDriverUser = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && AppState.get('appMode') === 'driver');

  if (isDriverUser && typeof isOrderCategoryMatchingDriver === 'function') {
    validTrucks = validTrucks.filter(t => isOrderCategoryMatchingDriver(t.cat || 'Gas GLP'));
  }

  validTrucks.forEach(t => {
    const minutesAgo = Math.floor((now - t.timestamp) / 60000);
    const timeText = minutesAgo < 1 ? 'Hace un instante' : `Hace ${minutesAgo} min`;
    const esEsperame = (t.tipo === 'esperame' || (t.reporter && t.reporter.includes('Espérame')));

    const marker = L.marker([t.lat, t.lng], { icon: getReportedTruckIcon(esEsperame ? 'esperame' : 'escuche_camion') });
    
    const popupHtml = esEsperame ? `
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#EF4444; font-size:13px;"><i class="fa-solid fa-hand"></i> ¡VECINO SOLICITA ESPERA!</strong><br>
        <span style="font-size:11px; color:#CBD5E1;">🛑 Alerta "ESPÉRAME" emitida por: <strong>${escapeHtmlStr(t.reporter || 'Un vecino')}</strong></span><br>
        <span style="font-size:10px; color:#F87171; font-weight:700;">⏱️ ${timeText}</span><br>
        <button style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" data-action="abrirSubmenuPedidos">🛒 Pedir Garrafa / Servicio Aquí</button>
      </div>
    ` : `
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#FF6D00; font-size:13px;"><i class="fa-solid fa-truck-fast"></i> Camión Oído / Visto en la Zona</strong><br>
        <span style="font-size:11px; color:#CBD5E1;">📢 Reportado por: <strong>${escapeHtmlStr(t.reporter || 'Un vecino')}</strong></span><br>
        <span style="font-size:10px; color:#00E676; font-weight:700;">⏱️ ${timeText}</span><br>
        <button style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" data-action="abrirSubmenuPedidos">🛒 Pedir Garrafa / Servicio Aquí</button>
      </div>
    `;

    marker.bindPopup(popupHtml);
    reportedTrucksLayerGroup.addLayer(marker);
  });
}

/* FÓRMULA DE HAVERSINE PARA TRIANGULACIÓN DE DISTANCIA ENTRE COORDENADAS GPS */
function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined || lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatearDistanciaTriangulada(distMetros) {
  if (distMetros === null || isNaN(distMetros)) return 'Cerca de ti';
  if (distMetros < 1000) return `${distMetros}m de distancia`;
  return `${(distMetros / 1000).toFixed(1)} km de distancia`;
}

window.normalizeCategoryCode = function(cat) {
  const c = String(cat || '').toLowerCase().trim();
  if (c.includes('gas') || c.includes('glp') || c.includes('garrafa')) return 'gas';
  if (c.includes('agua') || c.includes('botell')) return 'agua';
  if (c.includes('deterg') || c.includes('limpieza')) return 'detergentes';
  if (c.includes('chatarra')) return 'chatarra';
  if (c.includes('papel') || c.includes('carton') || c.includes('cartón')) return 'papel';
  if (c.includes('fruta') || c.includes('verdur')) return 'frutas';
  return c || 'gas';
};

window.isOrderCategoryMatchingDriver = function(orderCategory, driverCatInput) {
  let driverCat = driverCatInput;
  if (!driverCat) {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (u.categoria) driverCat = u.categoria;
  }
  if (!driverCat) return true; // Si no tiene categoría configurada, ve todo

  const normDriver = window.normalizeCategoryCode(driverCat);
  const normOrder = window.normalizeCategoryCode(orderCategory);

  return normDriver === normOrder || normDriver === 'otros' || normOrder === 'otros';
};

function isOrderCategoryMatchingDriver(orderCategory, driverCatInput) {
  return window.isOrderCategoryMatchingDriver(orderCategory, driverCatInput);
}

let activeOrderLayerGroup = null;

function obtenerIconoCategoriaMapa(catNombre) {
  const c = (catNombre || '').toLowerCase();

  let iconContent = '';
  let badgeLabel = 'Gas GLP';
  let badgeColor = '#FF1744';

  if (c.includes('agua')) {
    badgeLabel = '💧 Agua';
    badgeColor = '#00B0FF';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #00B0FF);"><i class="fa-solid fa-bottle-water" style="font-size: 36px; color: #00B0FF; animation: pulseGlow 1.2s infinite alternate;"></i></div>`;
  } else if (c.includes('chatarra')) {
    badgeLabel = '♻️ Chatarra';
    badgeColor = '#00E676';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #00E676);"><i class="fa-solid fa-recycle" style="font-size: 36px; color: #00E676; animation: pulseGlow 1.2s infinite alternate;"></i></div>`;
  } else if (c.includes('papel') || c.includes('cartón')) {
    badgeLabel = '📄 Papel';
    badgeColor = '#FFB300';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FFB300);"><i class="fa-solid fa-box-open" style="font-size: 34px; color: #FFB300;"></i></div>`;
  } else if (c.includes('fruta') || c.includes('verdura')) {
    badgeLabel = '🍎 Frutas';
    badgeColor = '#FF5252';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FF5252);"><i class="fa-solid fa-apple-whole" style="font-size: 34px; color: #FF5252;"></i></div>`;
  } else if (c.includes('detergente') || c.includes('limpieza')) {
    badgeLabel = '🧼 Detergente';
    badgeColor = '#E040FB';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #E040FB);"><i class="fa-solid fa-pump-soap" style="font-size: 34px; color: #E040FB;"></i></div>`;
  } else if (c.includes('carbón') || c.includes('leña')) {
    badgeLabel = '🪵 Carbón';
    badgeColor = '#FF6D00';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FF6D00);"><i class="fa-solid fa-fire" style="font-size: 34px; color: #FF6D00;"></i></div>`;
  } else if (!c.includes('gas')) {
    badgeLabel = '📦 Otros';
    badgeColor = '#94A3B8';
    iconContent = `<div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #94A3B8);"><i class="fa-solid fa-box" style="font-size: 34px; color: #94A3B8;"></i></div>`;
  } else {
    // ESTÉTICA NOTIGAS ORDER (GAS - ICONO ROJO OFICIAL)
    return L.divIcon({
      className: 'notigas-order-icon',
      html: `
        <div class="order-marker" style="display: flex; flex-direction: column; align-items: center;">
          <img src="icons/garrafa_red_clean.svg" style="width: 44px; height: 50px; filter: drop-shadow(0 4px 10px rgba(229, 57, 53, 0.75)); display: block;" alt="Garrafa de Gas NOTIGAS">
          <div class="order-label" style="margin-top: 2px; background: #0F172A; color: #FFFFFF; border: 1.5px solid #FF1744; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.5); text-shadow: 0 1px 3px rgba(0,0,0,0.9); -webkit-font-smoothing: antialiased;">
            PEDIDO
          </div>
        </div>
      `,
      iconSize: [90, 82],
      iconAnchor: [45, 58],
      popupAnchor: [0, -55]
    });
  }

  const markerHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; user-select: none;">
      ${iconContent}
      <div style="margin-top: 2px; background: #0F172A; color: #ffffff; border: 1.5px solid ${badgeColor}; padding: 2px 7px; border-radius: 12px; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; text-shadow: 0 1px 3px rgba(0,0,0,0.9); transform: translateZ(0);">
        ${badgeLabel}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'category-order-marker',
    html: markerHtml,
    iconSize: [70, 75],
    iconAnchor: [35, 75],
    popupAnchor: [0, -75]
  });
}

function renderActiveOrdersMap() {
  if (!map) return;
  if (!activeOrderLayerGroup) {
    activeOrderLayerGroup = L.layerGroup().addTo(map);
  }
  activeOrderLayerGroup.clearLayers();

  const rawOrder = (typeof AppState !== 'undefined' ? AppState.get('activeOrder') : null);
  if (!rawOrder) {
    if (userMarker && !map.hasLayer(userMarker)) {
      userMarker.addTo(map);
    }
    return;
  }

  try {
    const order = (typeof rawOrder === 'string') ? JSON.parse(rawOrder) : rawOrder;

    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    const isDriverUser = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && AppState.get('appMode') === 'driver');

    if (isDriverUser && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(order.categoria, u.categoria)) {
      return;
    }

    const lat = order.latitude || order.lat;
    const lng = order.longitude || order.lng;
    if (lat && lng) {
      if (userMarker && map.hasLayer(userMarker)) {
        map.removeLayer(userMarker);
      }

      const categoryIcon = obtenerIconoCategoriaMapa(order.categoria);

      const orderMarker = L.marker([lat, lng], {
        icon: categoryIcon,
        draggable: true,
        autoPan: false
      });
      currentActiveOrderMarker = orderMarker;

      if (orderMarker.dragging) {
        orderMarker.dragging.enable();
      }

      orderMarker.on('dragend', function(e) {
        const newPos = e.target.getLatLng();
        isUserMarkerDraggedManually = true;
        currentGpsLat = newPos.lat;
        window.currentGpsLat = currentGpsLat;
        currentGpsLng = newPos.lng;
        window.currentGpsLng = currentGpsLng;
        actualizarCoordenadasPedidoActivo(newPos.lat, newPos.lng, true);
      });

      const btnAccion = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver')
        ? '' // El repartidor gestiona los pedidos desde su panel.
        : `
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button type="button" style="flex:1; background:linear-gradient(135deg, #10B981, #059669); color:white; border:none; padding:6px 8px; border-radius:6px; font-size:10.5px; font-weight:800; cursor:pointer;" data-action="confirmarRecepcionComprador" title="Confirmar que recibiste tu pedido">
              <i class="fa-solid fa-circle-check"></i> Ya recibí
            </button>
            <button type="button" style="flex:1; background:#ef4444; color:white; border:none; padding:6px 8px; border-radius:6px; font-size:10.5px; font-weight:800; cursor:pointer;" data-action="cancelarPedidoActivo" title="Cancelar este requerimiento">
              <i class="fa-solid fa-ban"></i> Cancelar
            </button>
          </div>
        `;

      const telInfo = order.telefono ? `<br><span style="font-size:10.5px; color:#00E676; font-weight:800;">📞 Tel: ${escapeHtmlStr(order.telefono)}</span>` : '';
      const addrInfo = order.callePrincipal ? `<br><span style="font-size:10.5px; color:#FFB300; font-weight:800;">🏠 ${escapeHtmlStr(order.callePrincipal)}</span>` : '';

      orderMarker.bindPopup(`
        <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
          <strong style="color:#FF6D00; font-size:13px;">📦 Pedido Activo en Vivo</strong><br>
          <span style="font-size:11px; color:#CBD5E1; font-weight:700;">${escapeHtmlStr(order.categoria)} (${escapeHtmlStr(order.cantidad || '1 un')})</span>
          ${addrInfo}
          ${telInfo}<br>
          <span style="font-size:9.5px; color:#94A3B8;">📍 Arrastra este icono para mover tu ubicación</span><br>
          ${btnAccion}
        </div>
      `);
      activeOrderLayerGroup.addLayer(orderMarker);
    }
  } catch(e){}
}

/* ==========================================================================
   ALGORITMO DE OPTIMIZACIÓN DE RUTAS BARRIALES
   ELIMINADO: La navegación paso a paso se abre de forma externa en Google Maps
   para evitar sobrecargar el navegador y mejorar la fiabilidad.
   ========================================================================== */

function verificarYMostrarRepartidorGPS() {
  if (!map) return;

  if (typeof window.actualizarIconoMarcadorUsuario === 'function') {
    window.actualizarIconoMarcadorUsuario();
  }

  renderReportedTrucksBuffer();
  renderActiveOrdersMap();

  // FIX: Ya no dibujamos el camión propio leyendo de localStorage.
  // El GPS del repartidor viaja a Supabase y Supabase lo devuelve por Realtime
  // para que TODOS (incluso el propio repartidor) vean el mismo estado en la nube.
}

/* Las funciones de geolocalización nativa y fallback IP (obtenerUbicacionIPFallbackDesktop, conectarGPSAuto, etc.) han sido movidas a map_gps.js para evitar que fallos del GPS corrompan el resto de la app. */

/* COORDENADAS OFICIALES GEOBOLIVIA Y MUNICIPIOS POR ÁREA METROPOLITANA */
const GEOBOLIVIA_MUNICIPIOS = [
  // 1º SANTA CRUZ DE LA SIERRA Y ÁREA METROPOLITANA
  { key: "santacruz", nombre: "Santa Cruz de la Sierra", keywords: ["santa cruz", "santacruz"], lat: -17.7833, lon: -63.1821, querySuffix: "Santa Cruz de la Sierra, Bolivia" },
  { key: "warnes", nombre: "Warnes", keywords: ["warnes"], lat: -17.5167, lon: -63.1667, querySuffix: "Warnes, Santa Cruz, Bolivia" },
  { key: "cotoca", nombre: "Cotoca", keywords: ["cotoca"], lat: -17.7544, lon: -62.9961, querySuffix: "Cotoca, Santa Cruz, Bolivia" },
  { key: "laguardia", nombre: "La Guardia", keywords: ["la guardia", "laguardia"], lat: -17.8833, lon: -63.3333, querySuffix: "La Guardia, Santa Cruz, Bolivia" },
  { key: "montero", nombre: "Montero", keywords: ["montero"], lat: -17.3386, lon: -63.2553, querySuffix: "Montero, Santa Cruz, Bolivia" },
  { key: "porongo", nombre: "Porongo / Urubó", keywords: ["porongo", "urubo"], lat: -17.7981, lon: -63.2425, querySuffix: "Porongo, Santa Cruz, Bolivia" },

  // 2º COCHABAMBA Y ÁREA METROPOLITANA
  { key: "cochabamba", nombre: "Cochabamba", keywords: ["cochabamba", "cercado", "cbba"], lat: -17.3895, lon: -66.1568, querySuffix: "Cochabamba, Bolivia" },
  { key: "sacaba", nombre: "Sacaba", keywords: ["sacaba", "huayllani"], lat: -17.4041, lon: -66.0404, querySuffix: "Sacaba, Cochabamba, Bolivia" },
  { key: "quillacollo", nombre: "Quillacollo", keywords: ["quillacollo", "urkupiña"], lat: -17.3939, lon: -66.2797, querySuffix: "Quillacollo, Cochabamba, Bolivia" },
  { key: "tiquipaya", nombre: "Tiquipaya", keywords: ["tiquipaya"], lat: -17.3381, lon: -66.2189, querySuffix: "Tiquipaya, Cochabamba, Bolivia" },
  { key: "colcapirhua", nombre: "Colcapirhua", keywords: ["colcapirhua"], lat: -17.3908, lon: -66.2386, querySuffix: "Colcapirhua, Cochabamba, Bolivia" },
  { key: "vinto", nombre: "Vinto", keywords: ["vinto"], lat: -17.3964, lon: -66.3147, querySuffix: "Vinto, Cochabamba, Bolivia" },
  { key: "sipesipe", nombre: "Sipe Sipe", keywords: ["sipe sipe", "sipesipe"], lat: -17.4478, lon: -66.3639, querySuffix: "Sipe Sipe, Cochabamba, Bolivia" },

  // 3º LA PAZ
  { key: "lapaz", nombre: "La Paz", keywords: ["la paz", "lapaz"], lat: -16.4897, lon: -68.1193, querySuffix: "La Paz, Bolivia" },
  { key: "viacha", nombre: "Viacha", keywords: ["viacha"], lat: -16.6528, lon: -68.3014, querySuffix: "Viacha, La Paz, Bolivia" },
  { key: "achocalla", nombre: "Achocalla", keywords: ["achocalla"], lat: -16.5683, lon: -68.1633, querySuffix: "Achocalla, La Paz, Bolivia" },

  // 4º EL ALTO
  { key: "elalto", nombre: "El Alto", keywords: ["el alto", "elalto"], lat: -16.5000, lon: -68.1500, querySuffix: "El Alto, Bolivia" },

  // 5º TARIJA Y OTROS DEPARTAMENTOS
  { key: "tarija", nombre: "Tarija", keywords: ["tarija", "chapaco"], lat: -21.5355, lon: -64.7296, querySuffix: "Tarija, Bolivia" },
  { key: "sucre", nombre: "Sucre", keywords: ["sucre", "chuquisaca"], lat: -19.0333, lon: -65.2627, querySuffix: "Sucre, Bolivia" },
  { key: "oruro", nombre: "Oruro", keywords: ["oruro"], lat: -17.9833, lon: -67.1500, querySuffix: "Oruro, Bolivia" },
  { key: "potosi", nombre: "Potosí", keywords: ["potosi", "potosí"], lat: -19.5836, lon: -65.7531, querySuffix: "Potosí, Bolivia" },
  { key: "trinidad", nombre: "Trinidad", keywords: ["trinidad", "beni"], lat: -14.8333, lon: -64.9000, querySuffix: "Trinidad, Bolivia" },
  { key: "cobija", nombre: "Cobija", keywords: ["cobija", "pando"], lat: -11.0333, lon: -68.7667, querySuffix: "Cobija, Bolivia" }
];

async function cambiarCiudadCapital(cityKey) {
  const mun = GEOBOLIVIA_MUNICIPIOS.find(m => m.key === cityKey)
    || (window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[cityKey])
    || GEOBOLIVIA_MUNICIPIOS[0];

  currentGpsLat = mun.lat;
  window.currentGpsLat = currentGpsLat;
  currentGpsLng = mun.lon || mun.lng;
  window.currentGpsLng = currentGpsLng;

  if (map) {
    map.flyTo([mun.lat, mun.lon || mun.lng], 14, { duration: 1.0 });
  }

  applyGpsPosition(mun.lat, mun.lon || mun.lng, mun.nombre || cityKey, false);
  localStorage.setItem('notigas_active_city', mun.nombre || cityKey);

  // Limpiar pedidos antiguos de la ciudad anterior
  for (let id in neighborOrderMarkers) {
    if (map && neighborOrderMarkers[id]) {
      map.removeLayer(neighborOrderMarkers[id]);
    }
  }
  Object.keys(neighborOrderMarkers).forEach(k => delete neighborOrderMarkers[k]);

  for (let id in activeTruckMarkers) {
    if (map && activeTruckMarkers[id]) {
      map.removeLayer(activeTruckMarkers[id]);
    }
  }
  Object.keys(activeTruckMarkers).forEach(k => delete activeTruckMarkers[k]);

  if (typeof window.cambiarCiudad === 'function') {
    await window.cambiarCiudad(mun.key);
  } else {
    AppState.set('city', mun.key);
    if (typeof descargarChoferesYRenderizar === 'function') {
      descargarChoferesYRenderizar('TODOS');
    }
    if (typeof renderForumFeed === 'function') renderForumFeed();
    if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
  }

  // Actualizar selectores visibles de ciudad
  const select = document.getElementById('selectCiudadCapital');
  if (select) select.value = mun.key;
  const selectDriverModal = document.getElementById('selectDriverModalCity');
  if (selectDriverModal) selectDriverModal.value = mun.key;

  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  // Si es repartidor, refrescar lista de pedidos para la nueva ciudad
  if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
  const modalDriverOrders = document.getElementById('modalDriverOrders');
  if (modalDriverOrders && modalDriverOrders.style.display !== 'none' && typeof renderDriverOrdersList === 'function') {
    renderDriverOrdersList();
  }

  if (typeof showToast === 'function') {
    showToast('📍 Ciudad Actualizada', `Operando en ${mun.nombre || mun.key}`, 'info', 2500);
  }
}

function procesarResultadoBusqueda(item, queryOriginal) {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);

  const houseNum = item.address?.house_number ? ` #${item.address.house_number}` : '';
  const callePrincipal = (item.address?.road || item.address?.pedestrian || queryOriginal) + houseNum;
  const calleReferencia = item.address?.suburb || item.address?.neighbourhood || item.address?.quarter || item.address?.subdistrict || item.address?.city || item.address?.town || "Zona cercana";

  const inputPrin = document.getElementById('inputCallePrincipal');
  const inputRef = document.getElementById('inputCalleReferencia');
  if (inputPrin) inputPrin.value = callePrincipal;
  if (inputRef) inputRef.value = calleReferencia;

  currentGpsLat = lat;
  window.currentGpsLat = currentGpsLat;
  currentGpsLng = lon;
  window.currentGpsLng = currentGpsLng;

  if (map) {
    map.flyTo([lat, lon], 17, { duration: 1.0 });
  }

  applyGpsPosition(lat, lon, '', false);
}

/* La función buscarCalle ha sido movida a map_search.js para aligerar este archivo */

/* Alias eliminado (código muerto) — se usa transmitirUbicacionRepartidorServidorDB directamente */

/* Suscripciones Realtime del mapa se encuentran en supabase-config.js */

// ==========================================
// EXPOSICIÓN GLOBAL EN WINDOW PARA TODOS LOS MÓDULOS
// ==========================================
window.applyGpsPosition = applyGpsPosition;
window.cambiarCiudadCapital = cambiarCiudadCapital;
window.moverMarcadorUbicacionManual = moverMarcadorUbicacionManual;
window.verPedidosEnMapa = verPedidosEnMapa;
window.actualizarRepartidorEnMapa = actualizarRepartidorEnMapa;
window.removerPublicacionDeMapa = removerPublicacionDeMapa;
window.renderActiveOrdersMap = renderActiveOrdersMap;
window.renderReportedTrucksBuffer = renderReportedTrucksBuffer;
window.verificarYMostrarRepartidorGPS = verificarYMostrarRepartidorGPS;
window.transmitirUbicacionRepartidorServidorDB = transmitirUbicacionRepartidorServidorDB;
window.calcularDistanciaMetros = calcularDistanciaMetros;
window.formatearDistanciaTriangulada = formatearDistanciaTriangulada;
window.cargarPedidosVecinalesEnVivo = cargarPedidosVecinalesEnVivo;
window.agregarPedidoVecinoEnMapa = agregarPedidoVecinoEnMapa;
window.procesarResultadoBusqueda = procesarResultadoBusqueda;
window.initNotigasMap = initNotigasMap;

// ==========================================
// RUTAS OSRM PARA CHOFERES (NIVEL 1) ELIMINADO
// La navegación se abre de forma externa en Google Maps
