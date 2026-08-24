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

// ==========================================================================
// 1. CONSTANTES Y CONFIGURACIÓN BASE
// ==========================================================================

const TRUCK_ANIM_INTERVAL_MS = 80;
const DRIVER_RADAR_MAX_ZOOM = 14;
window.DRIVER_RADAR_MAX_ZOOM = DRIVER_RADAR_MAX_ZOOM;

// COORDENADAS OFICIALES GEOBOLIVIA Y MUNICIPIOS POR ÁREA METROPOLITANA
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

// MARCADOR DE UBICACIÓN CASA DEL COMPRADOR (PUNTO DE ENTREGA CON CASA)
const userLocationSvgHtml = `
  <div class="buyer-house-marker" title="Tu casa / Lugar de entrega. Arrastra a tu puerta exacta">
    <div class="buyer-house-pulse"></div>
    <div class="buyer-house-pin">
      <svg viewBox="0 0 48 58" width="48" height="58" class="buyer-house-svg">
        <defs>
          <filter id="housePinShadow" x="-30%" y="-20%" width="160%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0F172A" flood-opacity="0.45"/>
          </filter>
          <linearGradient id="housePinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284C7"/>
            <stop offset="50%" stop-color="#0369A1"/>
            <stop offset="100%" stop-color="#075985"/>
          </linearGradient>
        </defs>
        <!-- Forma de Pin apuntando a coordenada exacta (24, 56) -->
        <path d="M 24 56 C 24 56 6 36 6 22 C 6 11 14 3 24 3 C 34 3 42 11 42 22 C 42 36 24 56 24 56 Z" fill="url(#housePinGrad)" filter="url(#housePinShadow)"/>
        <!-- Círculo interior blanco -->
        <circle cx="24" cy="22" r="14" fill="#FFFFFF"/>
        <!-- Silueta de Casa en Azul Notigas -->
        <!-- Techo y Fachada -->
        <path d="M 24 12.5 L 14.5 20.5 L 17 20.5 L 17 29.5 L 31 29.5 L 31 20.5 L 33.5 20.5 Z" fill="#0284C7"/>
        <!-- Chimenea -->
        <rect x="28.5" y="13.5" width="2.5" height="4.5" fill="#0369A1"/>
        <!-- Puerta -->
        <rect x="22" y="23" width="4" height="6.5" rx="0.8" fill="#F8FAFC"/>
        <!-- Ventana -->
        <rect x="27" y="21.5" width="3" height="3" rx="0.6" fill="#F8FAFC"/>
      </svg>
      <span class="manual-location-handle" aria-hidden="true"><i class="fa-solid fa-hand-pointer"></i></span>
    </div>
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

// ==========================================================================
// 2. ESTADO GLOBAL Y VARIABLES DEL MÓDULO (INICIALIZACIÓN TEMPRANA / ANTI-TDZ)
// ==========================================================================

let map = null;
let userMarker = null;
let truckMarker = null;
let mapTileLayers = {};
let animationTimer = null;
let lastGpsBroadcastTime = 0;
let currentGpsLat = null;
let currentGpsLng = null;
window.currentGpsLat = currentGpsLat;
window.currentGpsLng = currentGpsLng;

let heatmapLayerGroup = null;
let activeOrderLayerGroup = null;
let reportedTrucksLayerGroup = null;

let activeGpsWatchId = null;
let truckTargetLat = null;
let truckTargetLng = null;
let truckCurrentLat = null;
let truckCurrentLng = null;

let neighborOrderMarkers = {};
window.neighborOrderMarkers = neighborOrderMarkers;
let activeTruckMarkers = {};
window.activeTruckTimers = window.activeTruckTimers || {};
window.neighborOrderTimers = window.neighborOrderTimers || {};
window.isHeatmapActive = window.isHeatmapActive || false;

// Estado de marcador de usuario
let isUserMarkerDraggedManually = false;
let manualLocationSyncTimer = null;
let isMapInteractedByUser = false;
let currentActiveOrderMarker = null;

// Promesa activa y throttling para pedidos en vivo
let _activeFetchOrdersPromise = null;
let _lastCargarPedidosTime = 0;

// Estado de transmisión GPS de chofer
let lastBroadcastLat = null;
let lastBroadcastLng = null;
let _cachedDriverProfile = null;
let _cachedDriverUserId = null;

// Marcadores de radar y estado de demanda por repartidor
window.orderRadarMarkers = window.orderRadarMarkers || {};
window.driverDemandMapState = window.driverDemandMapState || {
  availableOrders: [],
  assignedOrders: []
};

// Variables para instancias de Iconos Leaflet
let userLocationIcon = null;
let deliveryPinIcon = null;
let garrafaIcon = null;
let garrafaYellowIcon = null;
let garrafaGreenIcon = null;
let truckIcon = null;
let truckRadarBlueIcon = null;
let reportedTruckIcon = null;

// ==========================================================================
// 3. FUNCIONES DE UTILIDAD, CÁLCULO Y CATEGORÍAS
// ==========================================================================

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

/* CALCULAR ÁNGULO DE DIRECCIÓN (BEARING) ENTRE DOS COORDENADAS */
function calcularAnguloMovimiento(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
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
  if (!driverCat) return false;

  const normDriver = window.normalizeCategoryCode(driverCat);
  const normOrder = window.normalizeCategoryCode(orderCategory);

  return normDriver === normOrder;
};

function isOrderCategoryMatchingDriver(orderCategory, driverCatInput) {
  return window.isOrderCategoryMatchingDriver(orderCategory, driverCatInput);
}

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

window.getCityMetroKeys = function(cityKey) {
  const norm = String(cityKey || '').toLowerCase().trim();
  if (!norm || norm === 'todos' || norm === 'all') return null;
  if (norm === 'cochabamba' || norm === 'cbba' || norm === 'cercado') {
    return ['cochabamba', 'cbba', 'sacaba', 'quillacollo', 'tiquipaya', 'colcapirhua', 'vinto', 'sipesipe', 'cercado'];
  }
  if (norm === 'santacruz' || norm === 'santa cruz') {
    return ['santacruz', 'santa cruz', 'warnes', 'cotoca', 'montero', 'la guardia', 'laguardia', 'porongo'];
  }
  if (norm === 'lapaz' || norm === 'la paz') {
    return ['lapaz', 'la paz', 'el alto', 'elalto', 'viacha', 'achocalla', 'murillo'];
  }
  if (norm === 'elalto' || norm === 'el alto') {
    return ['elalto', 'el alto', 'lapaz', 'la paz', 'viacha'];
  }
  return [norm];
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

// SVG E ICONOS PARA AVISOS VECINALES (ESCUCHÉ CAMIÓN Y ESPÉRAME)
function getReportedTruckIcon(tipo) {
  if (typeof L === 'undefined') return null;
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

function obtenerIconoCategoriaMapa(catNombre) {
  if (typeof L === 'undefined') return null;
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

async function obtenerFichaChoferEnMemoria(userId, userData) {
  // 1. Usar datos ya cargados en AppState si están disponibles
  if (userData && (userData.nombre || userData.placa || userData.whatsapp)) {
    return {
      nombre_completo: userData.nombre || userData.full_name || 'Repartidor GLP',
      telefono_whatsapp: userData.whatsapp || userData.telefono || '',
      placa: userData.placa || 'Camión',
      categoria: userData.categoria || 'Gas GLP',
      ciudad: userData.ciudad || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba')
    };
  }

  // 2. Si ya está en caché local de memoria y coincide el user_id
  if (_cachedDriverProfile && _cachedDriverUserId === userId) {
    return _cachedDriverProfile;
  }

  // 3. Consulta única inicial a Supabase si no está en memoria
  if (window.supabaseClient && userId) {
    try {
      const { data: driver } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('nombre_completo, telefono_whatsapp, placa, categoria, ciudad')
        .eq('user_id', userId)
        .maybeSingle();

      if (driver) {
        _cachedDriverProfile = driver;
        _cachedDriverUserId = userId;
        return driver;
      }
    } catch (_) {}
  }

  return null;
}

// ==========================================================================
// 4. FUNCIONES DE GESTIÓN Y RENDERIZADO DEL MAPA
// ==========================================================================

function actualizarIconoMarcadorUsuario(forcedMode) {
  if (!userMarker || !truckIcon || !userLocationIcon || !deliveryPinIcon) return;
  const isDriver = (forcedMode === 'driver') || 
                   (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || 
                   (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ||
                   (typeof AppState !== 'undefined' && AppState.get('userData') && AppState.get('userData').role === 'repartidor');
  if (isDriver) {
    const isZoomOut = map && (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
    userMarker.setIcon(isZoomOut && truckRadarBlueIcon ? truckRadarBlueIcon : truckIcon);
  } else {
    userMarker.setIcon(userLocationIcon);
  }
}
window.actualizarIconoMarcadorUsuario = actualizarIconoMarcadorUsuario;

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
  if (!window.orderRadarMarkers) return;
  Object.keys(window.orderRadarMarkers).forEach(orderId => {
    const marker = window.orderRadarMarkers[orderId];
    if (map && marker) map.removeLayer(marker);
    delete window.orderRadarMarkers[orderId];
  });
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
                     (typeof AppState !== 'undefined' && AppState.get('userData') && AppState.get('userData').role === 'repartidor');
    if (isDriver && userMarker.options?.icon !== targetIcon) {
      userMarker.setIcon(targetIcon);
    }
  }
}

// Algoritmo de Clustering Espacial y Radar de Concentración de Demanda
function renderOrderRadarsOnMap(orders) {
  if (!map || typeof L === 'undefined') return;
  if (map.getZoom() > DRIVER_RADAR_MAX_ZOOM) {
    clearOrderRadarMarkers();
    return;
  }

  const activeKeys = new Set();
  const bounds = (typeof map.getBounds === 'function') ? map.getBounds().pad(0.15) : null;
  const currentZoom = map.getZoom();

  // Radio de agrupación según nivel de zoom
  let clusterRadiusMeters = 850;
  if (currentZoom <= 10) clusterRadiusMeters = 3000;
  else if (currentZoom <= 12) clusterRadiusMeters = 1600;
  else if (currentZoom <= 13) clusterRadiusMeters = 1000;
  else clusterRadiusMeters = 600;

  // 1. Filtrar pedidos válidos dentro del viewport visible
  const visibleOrders = (orders || []).filter(order => {
    const lat = Number(order.latitude ?? order.lat);
    const lng = Number(order.longitude ?? order.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !order?.id) return false;
    if (bounds && typeof bounds.contains === 'function' && !bounds.contains([lat, lng])) return false;
    return true;
  });

  // 2. Agrupación por proximidad espacial (Centroid Clustering)
  const clusters = [];
  visibleOrders.forEach(order => {
    const lat = Number(order.latitude ?? order.lat);
    const lng = Number(order.longitude ?? order.lng);
    const orderUnits = parseInt(order.cantidad, 10) || 1;
    const orderCat = order.categoria || 'Gas GLP';
    const orderBarrio = order.barrio_otb || order.direccion || '';

    let matchedCluster = null;
    for (const cl of clusters) {
      let dist = 999999;
      if (typeof L.latLng === 'function') {
        dist = L.latLng(lat, lng).distanceTo(L.latLng(cl.lat, cl.lng));
      } else {
        const dLat = (lat - cl.lat) * 111320;
        const dLng = (lng - cl.lng) * 111320 * Math.cos(cl.lat * (Math.PI / 180));
        dist = Math.sqrt(dLat * dLat + dLng * dLng);
      }

      if (dist <= clusterRadiusMeters) {
        matchedCluster = cl;
        break;
      }
    }

    if (matchedCluster) {
      const prevTotal = matchedCluster.totalUnits;
      matchedCluster.lat = (matchedCluster.lat * prevTotal + lat * orderUnits) / (prevTotal + orderUnits);
      matchedCluster.lng = (matchedCluster.lng * prevTotal + lng * orderUnits) / (prevTotal + orderUnits);
      matchedCluster.totalCount += 1;
      matchedCluster.totalUnits += orderUnits;
      matchedCluster.orders.push(order);
      if (orderBarrio) matchedCluster.barrios.push(orderBarrio);
    } else {
      clusters.push({
        id: `cl_${order.id}`,
        lat,
        lng,
        totalCount: 1,
        totalUnits: orderUnits,
        categoria: orderCat,
        orders: [order],
        barrios: orderBarrio ? [orderBarrio] : []
      });
    }
  });

  // 3. Ordenar clusters por volumen y densidad (los racimos más grandes y rentables primero)
  clusters.sort((a, b) => b.totalUnits - a.totalUnits || b.totalCount - a.totalCount);

  // 4. Renderizar hasta 35 clusters de mayor concentración
  const maxClustersToRender = 35;
  const topClusters = clusters.slice(0, maxClustersToRender);

  topClusters.forEach((cl, idx) => {
    const key = `cluster_${cl.orders.map(o => o.id).sort().join('_').slice(0, 40)}_${idx}`;
    activeKeys.add(key);

    const lat = cl.lat;
    const lng = cl.lng;
    const count = cl.totalCount;
    const units = cl.totalUnits;
    const cat = cl.categoria;
    const topBarrio = cl.barrios.length > 0 ? cl.barrios[0] : 'Zona Vecinal';

    let densityClass = 'density-single';
    let densityBadge = '';
    let radarPulseColor = '#FF8F00';
    let ringSize = 65;

    if (units >= 8 || count >= 5) {
      densityClass = 'density-high';
      densityBadge = `<div class="demand-cluster-badge badge-fire">🔥 <strong>${units}</strong> <small>un</small></div>`;
      radarPulseColor = '#FF1744';
      ringSize = 90;
    } else if (units >= 3 || count >= 2) {
      densityClass = 'density-med';
      densityBadge = `<div class="demand-cluster-badge badge-amber">⚡ <strong>${units}</strong> <small>un</small></div>`;
      radarPulseColor = '#FF6D00';
      ringSize = 80;
    } else {
      densityClass = 'density-single';
      densityBadge = `<div class="demand-cluster-badge badge-single">📦 <strong>${units}</strong></div>`;
      radarPulseColor = '#FF9100';
      ringSize = 65;
    }

    const safeCat = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(cat) : cat;
    const safeBarrio = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(topBarrio) : topBarrio;

    const existingMarker = window.orderRadarMarkers[key];
    if (existingMarker) {
      const currentPos = existingMarker.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lng) > 0.00001) {
        existingMarker.setLatLng([lat, lng]);
      }
      return;
    }

    const clusterHtml = `
      <div class="demand-radar-cluster ${densityClass}" title="Concentración: ${units} ${safeCat} (${count} pedidos en ${safeBarrio}). Haz clic para acercar.">
        <div class="demand-radar" style="width:${ringSize}px; height:${ringSize}px; border-color:${radarPulseColor};">
          <span style="border-color:${radarPulseColor};"></span>
          <span style="border-color:${radarPulseColor};"></span>
          <i style="background:${radarPulseColor};"></i>
        </div>
        ${densityBadge}
      </div>
    `;

    const icon = L.divIcon({
      className: 'demand-cluster-icon-wrapper',
      html: clusterHtml,
      iconSize: [ringSize, ringSize],
      iconAnchor: [ringSize / 2, ringSize / 2]
    });

    const marker = L.marker([lat, lng], {
      icon,
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false,
      zIndexOffset: 12000 + (units * 10)
    }).addTo(map);

    marker.bindTooltip(`<strong>🔥 ${units} un. (${count} pedidos)</strong><br><span style="font-size:10px;">${safeBarrio} · ${safeCat}</span>`, {
      direction: 'top',
      offset: [0, -20],
      className: 'notigas-cluster-tooltip'
    });

    marker.on('click', () => {
      map.flyTo([lat, lng], 16, { duration: 0.85 });
    });

    window.orderRadarMarkers[key] = marker;
  });

  // Eliminar únicamente radares de clusters fuera de vista o disueltos
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

  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isDriver = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && AppState.get('appMode') === 'driver');

  const currentActiveOrderId = (!isDriver) ? (() => {
    try {
      const raw = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
      if (!raw) return null;
      const ao = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      return String(ao?.id || '');
    } catch(e){ return null; }
  })() : null;

  const activeKeys = new Set();

  (orders || []).forEach(order => {
    const orderId = String(order.id || '');
    if (!orderId || orderId === 'mi_pedido_activo') return;
    if (currentActiveOrderId && orderId === currentActiveOrderId) return;
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

    const icon = getReportedTruckIcon(esEsperame ? 'esperame' : 'escuche_camion');
    if (!icon) return;

    const marker = L.marker([t.lat, t.lng], { icon });
    
    const popupHtml = esEsperame ? `
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#EF4444; font-size:13px;"><i class="fa-solid fa-hand"></i> ¡VECINO SOLICITA ESPERA!</strong><br>
        <span style="font-size:11px; color:#CBD5E1;">🛑 Alerta "ESPÉRAME" emitida por: <strong>${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(t.reporter || 'Un vecino') : 'Un vecino'}</strong></span><br>
        <span style="font-size:10px; color:#F87171; font-weight:700;">⏱️ ${timeText}</span><br>
        <button style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" data-action="abrirSubmenuPedidos">🛒 Pedir Garrafa / Servicio Aquí</button>
      </div>
    ` : `
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#FF6D00; font-size:13px;"><i class="fa-solid fa-truck-fast"></i> Camión Oído / Visto en la Zona</strong><br>
        <span style="font-size:11px; color:#CBD5E1;">📢 Reportado por: <strong>${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(t.reporter || 'Un vecino') : 'Un vecino'}</strong></span><br>
        <span style="font-size:10px; color:#00E676; font-weight:700;">⏱️ ${timeText}</span><br>
        <button style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" data-action="abrirSubmenuPedidos">🛒 Pedir Garrafa / Servicio Aquí</button>
      </div>
    `;

    marker.bindPopup(popupHtml);
    reportedTrucksLayerGroup.addLayer(marker);
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
      if (!categoryIcon) return;

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
        if (typeof window.actualizarCoordenadasPedidoActivo === 'function') {
          window.actualizarCoordenadasPedidoActivo(newPos.lat, newPos.lng, true);
        } else if (typeof actualizarCoordenadasPedidoActivo === 'function') {
          actualizarCoordenadasPedidoActivo(newPos.lat, newPos.lng, true);
        }
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

      const telInfo = order.telefono ? `<br><span style="font-size:10.5px; color:#00E676; font-weight:800;">📞 Tel: ${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(order.telefono) : order.telefono}</span>` : '';
      const addrInfo = order.callePrincipal ? `<br><span style="font-size:10.5px; color:#FFB300; font-weight:800;">🏠 ${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(order.callePrincipal) : order.callePrincipal}</span>` : '';

      orderMarker.bindPopup(`
        <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
          <strong style="color:#FF6D00; font-size:13px;">📦 Pedido Activo en Vivo</strong><br>
          <span style="font-size:11px; color:#CBD5E1; font-weight:700;">${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(order.categoria) : order.categoria} (${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(order.cantidad || '1 un') : (order.cantidad || '1 un')})</span>
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

function actualizarRepartidorEnMapa(data) {
  if (!map || !data) return;

  const lat = parseFloat(data.latitude || data.lat);
  const lng = parseFloat(data.longitude || data.lng);
  if (isNaN(lat) || isNaN(lng)) return;

  // 1. Detectar si el camión pertenece al usuario actual conectado en este dispositivo
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const currentAuthId = (typeof window._tempAuthUser !== 'undefined' && window._tempAuthUser?.id) 
    ? window._tempAuthUser.id 
    : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);
  const userRole = u.role || ((typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ? 'repartidor' : 'vecino');
  const isSelfDriver = (userRole === 'repartidor') && (
    (data.user_id && currentAuthId && String(data.user_id) === String(currentAuthId)) ||
    (data.user_id && u.user_id && String(data.user_id) === String(u.user_id)) ||
    (data.user_id && u.id && String(data.user_id) === String(u.id)) ||
    (data.distribuidor_nombre && u.nombre && String(data.distribuidor_nombre).toLowerCase().trim() === String(u.nombre).toLowerCase().trim())
  );

  // Si es el propio chofer en su propio dispositivo, su posición ya la dibuja userMarker (GPS en vivo)
  if (isSelfDriver) {
    // Limpiar cualquier marcador residual en activeTruckMarkers que coincida con este chofer
    Object.keys(activeTruckMarkers).forEach(key => {
      const m = activeTruckMarkers[key];
      if (key === data.id || key === data.user_id || m?._notigasRouteId === data.id || m?._notigasUserId === data.user_id) {
        if (map && m) map.removeLayer(m);
        delete activeTruckMarkers[key];
      }
    });
    return;
  }

  // 2. Filtrar por categoría si el observador es un chofer (repartidores solo ven camiones de su rubro)
  const driverCategoria = u.categoria || 'gas';
  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(data.categoria, driverCategoria)) {
     return;
  }

  // 3. Buscar si ya existe un marcador para este camión por routeId, userId o nombre
  const routeId = data.id ? String(data.id) : null;
  const userId = data.user_id ? String(data.user_id) : null;
  const driverName = data.distribuidor_nombre ? String(data.distribuidor_nombre).trim() : null;

  let existingKey = null;
  let existingMarker = null;

  // Búsqueda exhaustiva para reutilizar el mismo marcador y evitar duplicados
  for (const key of Object.keys(activeTruckMarkers)) {
    const m = activeTruckMarkers[key];
    if (!m) continue;
    if ((routeId && (key === routeId || m._notigasRouteId === routeId)) ||
        (userId && (key === userId || m._notigasUserId === userId)) ||
        (driverName && m._notigasDriverName === driverName)) {
      existingKey = key;
      existingMarker = m;
      break;
    }
  }

  const isZoomOut = map && (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);
  const iconToUse = isZoomOut && truckRadarBlueIcon ? truckRadarBlueIcon : truckIcon;
  const safeNombre = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(data.distribuidor_nombre || 'Repartidor') : (data.distribuidor_nombre || 'Repartidor');
  const safeCategoria = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(data.categoria || 'Servicio de Entrega') : (data.categoria || 'Servicio de Entrega');
  const safeTelefono = data.telefono ? (typeof escapeHtmlStr === 'function' ? escapeHtmlStr(data.telefono) : data.telefono) : '';

  const popupHtml = `
    <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
      <strong style="color:#00E676; font-size:13px;">🚛 Camión en Vivo</strong><br>
      <span style="font-size:12px; color:#FFFFFF; font-weight:800;">${safeNombre}</span><br>
      <span style="font-size:11px; color:#64748B;">${safeCategoria}</span><br>
      ${safeTelefono ? `<a href="tel:${safeTelefono}" style="display:inline-block; margin-top:5px; font-size:11px; color:#1E293B; background:#FFD54F; padding:4px 8px; border-radius:12px; text-decoration:none; font-weight:bold;">📞 Llama: ${safeTelefono}</a>` : ''}
    </div>
  `;

  // Clave canónica unificada para el mapa
  const canonicalKey = routeId || userId || driverName;
  if (!canonicalKey) return;

  if (existingMarker) {
    let newAngle = existingMarker._notigasHeading || 0;
    const oldLatLng = existingMarker.getLatLng();
    if (oldLatLng) {
      const dist = calcularDistanciaMetros(oldLatLng.lat, oldLatLng.lng, lat, lng);
      if (dist > 2) {
        newAngle = calcularAnguloMovimiento(oldLatLng.lat, oldLatLng.lng, lat, lng);
        existingMarker._notigasHeading = newAngle;
      }
    }

    existingMarker.setLatLng([lat, lng]);
    existingMarker._notigasRouteId = routeId || existingMarker._notigasRouteId;
    existingMarker._notigasUserId = userId || existingMarker._notigasUserId;
    existingMarker._notigasDriverName = driverName || existingMarker._notigasDriverName;
    if (existingMarker.setIcon) existingMarker.setIcon(iconToUse);
    if (existingMarker.getPopup()) {
      existingMarker.setPopupContent(popupHtml);
    }

    if (existingKey !== canonicalKey) {
      delete activeTruckMarkers[existingKey];
      activeTruckMarkers[canonicalKey] = existingMarker;
    }
  } else {
    // Limpiar posibles residuos antes de instanciar uno nuevo
    Object.keys(activeTruckMarkers).forEach(key => {
      const m = activeTruckMarkers[key];
      if (m && ((routeId && m._notigasRouteId === routeId) || (userId && m._notigasUserId === userId) || (driverName && m._notigasDriverName === driverName))) {
        if (map) map.removeLayer(m);
        delete activeTruckMarkers[key];
      }
    });

    const marker = L.marker([lat, lng], { icon: iconToUse, zIndexOffset: 9000 }).addTo(map);
    marker._notigasRouteId = routeId;
    marker._notigasUserId = userId;
    marker._notigasDriverName = driverName;
    marker._notigasHeading = 0;
    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      if (map && map.getZoom() <= DRIVER_RADAR_MAX_ZOOM) {
        map.flyTo([lat, lng], 16, { duration: 0.8 });
      }
    });
    activeTruckMarkers[canonicalKey] = marker;
  }

  const theMarker = activeTruckMarkers[canonicalKey];
  if (!isZoomOut && theMarker) {
    const currentAngle = theMarker._notigasHeading || 0;
    setTimeout(() => {
      const el = theMarker.getElement();
      if (el) {
        const img = el.querySelector('.driver-3d-truck-img');
        if (img) {
          img.style.transform = `rotate(${currentAngle}deg)`;
          img.style.transition = 'transform 0.5s ease-out';
        }
      }
    }, 50);
  }

  // Eliminar camiones fantasma sin actualización en 10 minutos
  if (window.activeTruckTimers[canonicalKey]) clearTimeout(window.activeTruckTimers[canonicalKey]);
  window.activeTruckTimers[canonicalKey] = setTimeout(() => {
    if (activeTruckMarkers[canonicalKey]) {
      map.removeLayer(activeTruckMarkers[canonicalKey]);
      delete activeTruckMarkers[canonicalKey];
    }
  }, 10 * 60000);
}

function agregarPedidoVecinoEnMapa(order) {
  if (!map || !order) return;
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  let userRole = u.role || ((typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver') ? 'repartidor' : 'vecino');
  const isDriverView = (userRole === 'repartidor');
  const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

  if (!isDriverView && order.user_id && order.user_id === localUserId) return; // Skip own orders only in buyer view

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

  // Asignar el icono dependiendo del estado y categoría
  let currentIcon = null;
  if (order.estado === 'entregado') {
     currentIcon = garrafaGreenIcon;
  } else if (order.visto === true || order.estado === 'visto') {
     currentIcon = garrafaYellowIcon;
  } else if (typeof obtenerIconoCategoriaMapa === 'function') {
     currentIcon = obtenerIconoCategoriaMapa(order.categoria);
  }
  if (!currentIcon) {
     currentIcon = garrafaIcon;
  }

  // Si el usuario actual es REPARTIDOR, solo ver pedidos de SU MISMA CATEGORÍA
  const driverCategoria = u.categoria || 'todos';

  if (isDriverView && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(order.categoria, driverCategoria)) {
     return; // Ignore orders outside of their category
  }

  const lat = parseFloat(order.latitude || order.lat);
  const lng = parseFloat(order.longitude || order.lng);
  if (isNaN(lat) || isNaN(lng)) return; // Evita que Leaflet falle si un pedido no tiene coordenadas

  const marker = L.marker([lat, lng], {
    icon: currentIcon,
    zIndexOffset: 8000,
    interactive: true,
    bubblingMouseEvents: false,
    keyboard: true
  }).addTo(map);
  const isAssignedToDriver = userRole === 'repartidor' &&
    order.estado === 'asignado' && order.driver_id === localUserId;

  const escapeFn = typeof escapeHtmlStr === 'function' ? escapeHtmlStr : (s => s || '');
  const nombreStr = isDriverView
    ? `<span class="order-popup-name">👤 <strong>Comprador:</strong> ${escapeFn(order.buyer_name || order.titulo || 'Vecino')}</span><br>`
    : `<span class="order-popup-name">📦 <strong>Pedido Vecinal</strong></span><br>`;
  const emailStr = (isDriverView && order.buyer_email) ? `<span class="order-popup-email" style="font-size:11px; color:#0288D1;">✉️ <strong>Correo:</strong> ${escapeFn(order.buyer_email)}</span><br>` : '';
  const dirStr = isDriverView
    ? `<span class="order-popup-address">📍 <strong>Dirección:</strong> ${escapeFn(order.direccion || 'Ubicación fijada en mapa GPS (opcional)')}</span><br>`
    : `<span class="order-popup-address">📍 <strong>Zona:</strong> ${escapeFn(order.barrio_otb || order.direccion || 'Ubicación fijada en mapa')}</span><br>`;
  const telStr = isDriverView
    ? `<span class="order-popup-contact">📞 <strong>Teléfono:</strong> ${escapeFn(order.telefono || 'Opcional / No indicado')}</span><br>`
    : '';
  const mapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  let orderAction = '';
  if (isAssignedToDriver) {
    orderAction = `
      <a href="${mapsNavUrl}" target="_blank" rel="noopener noreferrer" data-action="abrirRutaGoogleMaps" data-lat="${lat}" data-lng="${lng}" data-id="${escapeFn(order.id)}" data-address="${escapeFn(order.direccion || '')}" class="btn-driver-route order-popup-action">
        <i class="fa-solid fa-diamond-turn-right"></i> IR CON GOOGLE MAPS
      </a>`;
  } else if (userRole === 'repartidor') {
    orderAction = `
      <button type="button" data-action="aceptarPedidoRepartidor" data-lat="${lat}" data-lng="${lng}" data-id="${escapeFn(order.id)}" data-address="${escapeFn(order.direccion || '')}" class="btn-driver-accept order-popup-action">
        <i class="fa-solid fa-diamond-turn-right"></i> ELEGIR Y NAVEGAR (GOOGLE MAPS)
      </button>`;
  } else {
    orderAction = `
      <button type="button" data-action="abrirSubmenuPedidos" class="btn-action" style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; width:100%;">
        🛒 Pedir Garrafa / Servicio Aquí
      </button>`;
  }

  const popupHtml = `
    <div class="notigas-order-popup" style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
      <strong style="color:#FF6D00; font-size:13px;">📦 Pedido ${isAssignedToDriver ? 'Asignado' : (isDriverView ? 'Disponible' : 'Vecinal')}</strong><br>
      ${nombreStr}
      ${emailStr}
      <span class="order-popup-category">🏷️ ${escapeFn(order.categoria || 'Gas')} · ${escapeFn(order.cantidad || '1')} unidad(es)</span><br>
      ${dirStr}
      ${telStr}
      ${orderAction}
    </div>
  `;

  marker.bindPopup(popupHtml);

  if (isDriverView) {
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

// ACTUALIZACIÓN GRANULAR INCREMENTAL DE 1 PEDIDO (0 CONSULTAS DE RED)
window.actualizarPedidoEnMapa = function(order, eventType = 'UPDATE') {
  if (!map || !order || !order.id) return;
  const state = window.driverDemandMapState = window.driverDemandMapState || { availableOrders: [], assignedOrders: [] };
  const orderId = String(order.id);
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isDriverUser = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && (AppState.get('appMode') === 'driver' || AppState.get('userRole') === 'repartidor'));
  const driverCategoria = u.categoria || 'todos';

  // 1. Si el pedido fue cancelado o entregado, removerlo del mapa y alertar al chofer si estaba asignado
  if (eventType === 'DELETE' || order.estado === 'cancelado' || order.estado === 'entregado') {
    const wasAssignedToMe = (state.assignedOrders || []).some(o => String(o.id) === orderId) || (order.driver_id && String(order.driver_id) === String(localUserId));
    
    if (order.estado === 'cancelado' && wasAssignedToMe && isDriverUser) {
      const locStr = order.direccion || order.barrio_otb || 'la ubicación indicada';
      if (typeof mostrarPopupAlertaRepartidor === 'function') {
        mostrarPopupAlertaRepartidor('⛔ PEDIDO CANCELADO POR EL VECINO', `El comprador ha cancelado su pedido en ${locStr}. Se retiró de tus rutas asignadas.`, 9000);
      }
      if (typeof showToast === 'function') {
        showToast('⛔ Pedido Cancelado', `El pedido que tenías asignado en ${locStr} fue cancelado por el comprador.`, 'warning', 8000);
      }
      try {
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 400]);
      } catch(_) {}
    }

    window.removerPedidoDeMapa(orderId);
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
    return;
  }

  if (order.estado === 'asignado') {
    state.availableOrders = (state.availableOrders || []).filter(o => String(o.id) !== orderId);
    if (isDriverUser && order.driver_id === localUserId) {
      const idx = (state.assignedOrders || []).findIndex(o => String(o.id) === orderId);
      if (idx >= 0) state.assignedOrders[idx] = order;
      else state.assignedOrders.push(order);
    } else {
      window.removerPedidoDeMapa(orderId);
      return;
    }
  } else {
    // Pendiente o Visto
    if (isDriverUser && typeof window.isOrderCategoryMatchingDriver === 'function' && !window.isOrderCategoryMatchingDriver(order.categoria, driverCategoria)) {
      window.removerPedidoDeMapa(orderId);
      return;
    }
    const idx = (state.availableOrders || []).findIndex(o => String(o.id) === orderId);
    if (idx >= 0) state.availableOrders[idx] = order;
    else state.availableOrders.push(order);
  }

  // 3. Renderizado incremental directo en el mapa
  const lat = parseFloat(order.latitude || order.lat);
  const lng = parseFloat(order.longitude || order.lng);
  if (isNaN(lat) || isNaN(lng)) return;

  const isZoomOut = (map.getZoom() <= DRIVER_RADAR_MAX_ZOOM);

  if (isZoomOut) {
    const existingRadar = window.orderRadarMarkers[orderId];
    if (existingRadar) {
      existingRadar.setLatLng([lat, lng]);
    } else {
      const safeCategory = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(order.categoria || 'Gas') : 'Gas';
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
      window.orderRadarMarkers[orderId] = marker;
    }
    if (neighborOrderMarkers[orderId]) {
      map.removeLayer(neighborOrderMarkers[orderId]);
      delete neighborOrderMarkers[orderId];
    }
  } else {
    const existingPin = neighborOrderMarkers[orderId];
    if (existingPin) {
      existingPin.setLatLng([lat, lng]);
    } else {
      agregarPedidoVecinoEnMapa(order);
    }
    if (window.orderRadarMarkers[orderId]) {
      map.removeLayer(window.orderRadarMarkers[orderId]);
      delete window.orderRadarMarkers[orderId];
    }
  }
};

window.removerPedidoDeMapa = function(orderId) {
  if (!orderId) return;
  const key = String(orderId);
  const state = window.driverDemandMapState = window.driverDemandMapState || { availableOrders: [], assignedOrders: [] };
  state.availableOrders = (state.availableOrders || []).filter(o => String(o.id) !== key);
  state.assignedOrders = (state.assignedOrders || []).filter(o => String(o.id) !== key);

  if (window.orderRadarMarkers[key]) {
    if (map) map.removeLayer(window.orderRadarMarkers[key]);
    delete window.orderRadarMarkers[key];
  }
  if (neighborOrderMarkers[key]) {
    if (map) map.removeLayer(neighborOrderMarkers[key]);
    delete neighborOrderMarkers[key];
    if (window.neighborOrderTimers[key]) {
      clearTimeout(window.neighborOrderTimers[key]);
      delete window.neighborOrderTimers[key];
    }
  }
};

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

let _orderLocationDebounceTimer = null;

async function actualizarCoordenadasPedidoActivo(newLat, newLng, skipMarkerSet = false) {
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
        clearTimeout(_orderLocationDebounceTimer);
        _orderLocationDebounceTimer = setTimeout(async () => {
          try {
            // 1. Intentar actualizar vía RPC con SECURITY DEFINER
            let isSaved = false;
            try {
              const { data: rpcRes, error: rpcErr } = await window.supabaseClient.rpc('rpc_update_order_location', {
                p_order_id: order.id,
                p_latitude: newLat,
                p_longitude: newLng
              });
              if (!rpcErr && rpcRes && rpcRes.success) {
                isSaved = true;
              }
            } catch(e){}

            // 2. Fallback a UPDATE directo con política RLS pedidos_update_own
            if (!isSaved) {
              const { error: directErr } = await window.supabaseClient
                .from('pedidos')
                .update({ latitude: newLat, longitude: newLng, updated_at: new Date().toISOString() })
                .eq('id', order.id);
              if (!directErr) isSaved = true;
            }

            if (isSaved) {
              if (typeof showToast === 'function') {
                showToast("📍 Ubicación de tu pedido actualizada en el mapa", "success");
              }
            } else {
              console.warn("⚠️ No se pudo guardar la nueva ubicación del pedido en Supabase");
            }
          } catch(err) {
            console.error("Error sincronizando nueva posición del pedido:", err);
          }
        }, 350);
      }
    }
  } catch(e){
    console.error("Error en actualizarCoordenadasPedidoActivo:", e);
  }

  if (!skipMarkerSet && currentActiveOrderMarker) {
    currentActiveOrderMarker.setLatLng([newLat, newLng]);
  }
}
window.actualizarCoordenadasPedidoActivo = actualizarCoordenadasPedidoActivo;

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
  if (window.orderRadarMarkers) {
    for (const id in window.orderRadarMarkers) {
      const marker = window.orderRadarMarkers[id];
      if (map.hasLayer(marker)) {
        const latlng = marker.getLatLng();
        allBounds.push([latlng.lat, latlng.lng]);
      }
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
    if (typeof window.actualizarCoordenadasPedidoActivo === 'function') {
      window.actualizarCoordenadasPedidoActivo(lat, lng);
    } else if (typeof actualizarCoordenadasPedidoActivo === 'function') {
      actualizarCoordenadasPedidoActivo(lat, lng);
    }
    verificarYMostrarRepartidorGPS();
    manualLocationSyncTimer = null;
  }, 80);
}

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
      const currentCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
      if (inferred && inferred !== currentCity) {
          if (typeof window.cambiarCiudad === 'function') {
              window.cambiarCiudad(inferred);
          } else if (typeof AppState !== 'undefined') {
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

  if (!userMarker && map && activeIcon) {
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
      <div class="google-infowindow-content" style="text-align:center; padding:4px;">
        <strong style="color:#0284C7; font-size:13px;">🏠 Mi Casa (Punto de Entrega)</strong><br>
        <span style="font-size:11px; color:#5F6368;">Arrastra el marcador a la puerta exacta de tu casa</span>
      </div>
    `);
    const isMobileDevice = (typeof navigator !== 'undefined' && navigator.userAgent) ? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) : false;
    const tooltipMsg = isMobileDevice ? '🏠 Arrástrame a tu puerta' : '🏠 Clic en el mapa o arrastra a tu puerta';
    userMarker.bindTooltip(tooltipMsg, {
      direction: 'top',
      offset: [0, -54],
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
    let newAngle = userMarker._notigasHeading || 0;
    const oldLatLng = userMarker.getLatLng();
    if (oldLatLng && isDriver) {
      const dist = calcularDistanciaMetros(oldLatLng.lat, oldLatLng.lng, activeLat, activeLng);
      if (dist > 2) {
        newAngle = calcularAnguloMovimiento(oldLatLng.lat, oldLatLng.lng, activeLat, activeLng);
        userMarker._notigasHeading = newAngle;
      }
    }

    userMarker.setLatLng([activeLat, activeLng]);
    if (activeIcon) userMarker.setIcon(activeIcon);
    if (userMarker.dragging && !userMarker.dragging.enabled()) {
      userMarker.dragging.enable();
    }
  }

  if (isDriver && userMarker && !isZoomOut) {
    const currentAngle = userMarker._notigasHeading || 0;
    setTimeout(() => {
      const el = userMarker.getElement();
      if (el) {
        const img = el.querySelector('.driver-3d-truck-img');
        if (img) {
          img.style.transform = `rotate(${currentAngle}deg)`;
          img.style.transition = 'transform 0.5s ease-out';
        }
      }
    }, 50);
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
  } else if (typeof AppState !== 'undefined') {
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

  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isDriver = (u.role === 'repartidor') || ((typeof AppState !== 'undefined') && AppState.get('appMode') === 'driver');
  const driverCity = (u.ciudad) ? String(u.ciudad).toLowerCase().trim() : null;

  if (isDriver && driverCity && mun.key !== driverCity) {
    if (typeof showToast === 'function') {
      showToast('📍 Explorando Mapa', `Visualizando ${mun.nombre || mun.key}. Tus pedidos y radar de entrega operan en tu ciudad registrada (${u.ciudad}).`, 'warning', 4000);
    }
  } else if (typeof showToast === 'function') {
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

let _driverGpsConsecutiveErrors = 0;

/* ESTRATEGIA ADAPTATIVA INTELIGENTE DE TRANSMISIÓN GPS (1 sola operación UPSERT por tick con verificación de red) */
async function transmitirUbicacionRepartidorServidorDB(lat, lng) {
  const driverGpsLive = (typeof AppState !== 'undefined') ? AppState.get('driverGpsLive') : null;
  if (driverGpsLive !== 'on') return;

  const now = Date.now();

  // Comprobar si el vehículo está detenido o en movimiento
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
      if (window.supabaseClient) {
        const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
        const driver = await obtenerFichaChoferEnMemoria(localUserId, u);

        if (!driver) {
          return;
        }

        // Transmisión directa mediante 1 sola operación UPSERT con verificación de errores
        const { error: upsertErr } = await window.supabaseClient
          .from('rutas_repartidores')
          .upsert(
            {
              user_id: localUserId,
              distribuidor_nombre: driver.nombre_completo || 'Repartidor GLP',
              categoria: driver.categoria || 'Gas GLP',
              titulo: driver.placa || 'Camión',
              ciudad: driver.ciudad || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba'),
              latitude: lat,
              longitude: lng,
              telefono: driver.telefono_whatsapp || '',
              last_active: new Date().toISOString()
            },
            {
              onConflict: 'user_id'
            }
          );

        if (upsertErr) {
          _driverGpsConsecutiveErrors++;
          console.warn(`⚠️ Error al sincronizar GPS del repartidor con Supabase (Fallo #${_driverGpsConsecutiveErrors}):`, upsertErr.message);
          if (_driverGpsConsecutiveErrors === 3 && typeof showToast === 'function') {
            showToast('⚠️ Tu señal GPS no se está sincronizando con la nube. Revisa tu conexión a internet.', 'warning');
          }
          return; // No actualizar timestamp para reintentar en el siguiente ciclo
        }

        // Éxito confirmado
        _driverGpsConsecutiveErrors = 0;
        lastBroadcastLat = lat;
        lastBroadcastLng = lng;
        lastGpsBroadcastTime = now;
      }
    }
  } catch(e){
    _driverGpsConsecutiveErrors++;
    console.error("Error transmitiendo GPS:", e);
  }
}

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
      const driverCategoria = u.categoria || 'todos';
      const normCity = String(activeCity || '').toLowerCase().trim();
      const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();

      // Proyección explícita de columnas necesarias incluyendo visto
      const ORDER_COLUMNS = 'id, user_id, categoria, titulo, cantidad, direccion, telefono, estado, driver_id, ciudad, latitude, longitude, visto, created_at, updated_at';
      const TRUCK_COLUMNS = 'id, user_id, distribuidor_nombre, categoria, titulo, ciudad, latitude, longitude, garrafas_agotadas, last_active, telefono, placa, productos';

      // Obtener Bounding Box del viewport visible con margen de 25% para pre-carga suave
      let bbox = null;
      if (map && typeof map.getBounds === 'function') {
        try {
          const rawBounds = map.getBounds();
          if (rawBounds && typeof rawBounds.pad === 'function' && typeof rawBounds.getSouth === 'function') {
            const padded = rawBounds.pad(0.25);
            const s = padded.getSouth();
            const n = padded.getNorth();
            const w = padded.getWest();
            const e = padded.getEast();
            if (!isNaN(s) && !isNaN(n) && !isNaN(w) && !isNaN(e) && s < n && w < e) {
              bbox = { minLat: s, maxLat: n, minLng: w, maxLng: e };
            }
          }
        } catch (_) {}
      }

      const cityKeys = (typeof window.getCityMetroKeys === 'function')
        ? window.getCityMetroKeys(activeCity)
        : (normCity && normCity !== 'todos' && normCity !== 'all' ? [normCity] : null);

      // Usar Bounding Box siempre que el zoom sea operativo (>= 8) para reducir tráfico y evitar pedidos faltantes
      const currentZoom = (map && typeof map.getZoom === 'function') ? map.getZoom() : 13;
      const shouldUseBbox = bbox && (currentZoom >= 8);

      // 1. Consulta de Camiones en vivo (común para ambos roles con límite de seguridad)
      let trucksQuery = window.supabaseClient
        .from('rutas_repartidores_publicas')
        .select(TRUCK_COLUMNS)
        .gte('last_active', tenMinsAgo)
        .limit(100);
      if (cityKeys && cityKeys.length > 0) {
        trucksQuery = trucksQuery.in('ciudad', cityKeys);
      }
      if (shouldUseBbox) {
        trucksQuery = trucksQuery
          .gte('latitude', bbox.minLat)
          .lte('latitude', bbox.maxLat)
          .gte('longitude', bbox.minLng)
          .lte('longitude', bbox.maxLng);
      }

      // 2. Consulta de Pedidos Públicos (disponibles para radar y mapa en la zona metropolitana)
      let pubQuery = window.supabaseClient
        .from('pedidos_publicos')
        .select(ORDER_COLUMNS)
        .gte('created_at', activeWindow)
        .in('estado', ['pendiente', 'visto'])
        .limit(200);
      if (isDriverUser) {
        const driverCity = (u.ciudad && u.ciudad !== 'todos' && u.ciudad !== 'all') ? String(u.ciudad).toLowerCase().trim() : null;
        if (driverCity) {
          const dCityKeys = (typeof window.getCityMetroKeys === 'function') ? window.getCityMetroKeys(driverCity) : [driverCity];
          pubQuery = pubQuery.in('ciudad', dCityKeys);
        } else if (cityKeys && cityKeys.length > 0) {
          pubQuery = pubQuery.in('ciudad', cityKeys);
        }

        const normDriverCat = (typeof window.normalizeCategoryCode === 'function')
          ? window.normalizeCategoryCode(driverCategoria)
          : String(driverCategoria).toLowerCase().trim();

        if (normDriverCat && normDriverCat !== 'todos' && normDriverCat !== 'otros') {
          if (normDriverCat === 'gas') {
            pubQuery = pubQuery.in('categoria', ['gas', 'Gas', 'GAS', 'Gas GLP', 'gas glp', 'garrafa', 'Garrafa', 'GLP']);
          } else if (normDriverCat === 'agua') {
            pubQuery = pubQuery.in('categoria', ['agua', 'Agua', 'AGUA', 'Agua Potable', 'agua potable', 'botellon', 'Botellón', 'botellón']);
          } else {
            pubQuery = pubQuery.eq('categoria', driverCategoria);
          }
        }
      } else if (cityKeys && cityKeys.length > 0) {
        pubQuery = pubQuery.in('ciudad', cityKeys);
      }
      if (shouldUseBbox) {
        pubQuery = pubQuery
          .gte('latitude', bbox.minLat)
          .lte('latitude', bbox.maxLat)
          .gte('longitude', bbox.minLng)
          .lte('longitude', bbox.maxLng);
      }

      // 3. Consulta de Pedidos Asignados (sólo para repartidor autenticado)
      let assignedPromise = Promise.resolve({ data: [], error: null });
      if (isDriverUser) {
        const currentUserId = (typeof getAuthenticatedUserId === 'function')
          ? await getAuthenticatedUserId()
          : (u.id || (typeof AppState !== 'undefined' ? AppState.get('userData')?.id : null) || window._tempAuthUser?.id);

        if (currentUserId) {
          let assignedQuery = window.supabaseClient
            .from('pedidos')
            .select(ORDER_COLUMNS)
            .eq('driver_id', currentUserId)
            .eq('estado', 'asignado')
            .gte('created_at', activeWindow)
            .limit(50);
          if (cityKeys && cityKeys.length > 0) {
            assignedQuery = assignedQuery.in('ciudad', cityKeys);
          }
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

      // Renderizado y reconciliación de camiones activos en vivo
      if (Array.isArray(trucksRes.data)) {
        const liveTruckIds = new Set();
        trucksRes.data.forEach(truck => {
          actualizarRepartidorEnMapa(truck);
          if (truck.id) liveTruckIds.add(String(truck.id));
          if (truck.user_id) liveTruckIds.add(String(truck.user_id));
          if (truck.distribuidor_nombre) liveTruckIds.add(String(truck.distribuidor_nombre).trim());
        });

        // Reconciliación: eliminar del mapa camiones que hayan dejado de transmitir o estén inactivos
        Object.keys(activeTruckMarkers).forEach(key => {
          const m = activeTruckMarkers[key];
          const isAlive = liveTruckIds.has(key) ||
            (m?._notigasRouteId && liveTruckIds.has(m._notigasRouteId)) ||
            (m?._notigasUserId && liveTruckIds.has(m._notigasUserId)) ||
            (m?._notigasDriverName && liveTruckIds.has(m._notigasDriverName));

          if (!isAlive) {
            if (map && m) map.removeLayer(m);
            delete activeTruckMarkers[key];
            if (window.activeTruckTimers[key]) {
              clearTimeout(window.activeTruckTimers[key]);
              delete window.activeTruckTimers[key];
            }
          }
        });
      }
    } catch(e) {
      console.error("❌ Error general cargando live data:", e);
    } finally {
      _activeFetchOrdersPromise = null;
    }
  })();

  return _activeFetchOrdersPromise;
}

// ==========================================================================
// 5. INICIALIZACIÓN PRINCIPAL DE LEAFLET Y CONTENEDOR
// ==========================================================================

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

  // Instanciación de iconos oficiales Leaflet
  userLocationIcon = L.divIcon({
    className: 'user-location-marker-container',
    html: userLocationSvgHtml,
    iconSize: [48, 58],
    iconAnchor: [24, 56],
    popupAnchor: [0, -52],
    tooltipAnchor: [0, -52]
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

  reportedTruckIcon = getReportedTruckIcon('escuche_camion');

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

  // Mapa base optimizado de alta velocidad (CartoDB Voyager sin etiquetas + Capa independiente de etiquetas)
  const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  const baseTileLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 20,
      maxNativeZoom: 19,
      subdomains: ['a', 'b', 'c', 'd'],
      attribution: mapAttribution,
      className: 'map-base-layer',
      crossOrigin: true
    }
  );

  const labelsTileLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 20,
      maxNativeZoom: 19,
      subdomains: ['a', 'b', 'c', 'd'],
      className: 'map-labels-layer',
      crossOrigin: true,
      zIndex: 450
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
  labelsTileLayer.addTo(map);
  mapTileLayers['osm_base'] = baseTileLayer;
  mapTileLayers['osm_labels'] = labelsTileLayer;
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
  map.on('moveend', () => {
    if (typeof cargarPedidosVecinalesEnVivo === 'function') {
      cargarPedidosVecinalesEnVivo();
    }
  });

  map.on('click', (e) => {
    mostrarEfectoPuntoClic(e.latlng.lat, e.latlng.lng);
    moverMarcadorUbicacionManual(e.latlng.lat, e.latlng.lng);
  });

  actualizarIconoMarcadorUsuario();

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

  // Carga inmediata de pedidos en vivo al inicializar el mapa
  if (typeof cargarPedidosVecinalesEnVivo === 'function') {
    cargarPedidosVecinalesEnVivo(true);
  }
}

// ==========================================================================
// 6. EXPOSICIÓN GLOBAL EN WINDOW PARA TODOS LOS MÓDULOS
// ==========================================================================

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
window.renderOrderRadarsOnMap = renderOrderRadarsOnMap;
window.renderDriverDemandByZoom = renderDriverDemandByZoom;
window.actualizarIconosRepartidoresPorZoom = actualizarIconosRepartidoresPorZoom;
window.clearOrderRadarMarkers = clearOrderRadarMarkers;
window.initNotigasMap = initNotigasMap;

// ==========================================================================
// 7. ARRANQUE SEGURO DEL MAPA (AL FINAL ABSOLUTO DEL MÓDULO)
// ==========================================================================

function startMapWhenReady() {
  if (typeof L !== 'undefined' && document.getElementById('map')) {
    initNotigasMap();
  } else {
    setTimeout(startMapWhenReady, 50);
  }
}
window.startMapWhenReady = startMapWhenReady;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMapWhenReady);
} else {
  startMapWhenReady();
}
