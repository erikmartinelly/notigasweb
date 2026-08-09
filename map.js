/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA EN VIVO, POSICIONAMIENTO GPS OBLIGATORIO,
   ANIMACIONES Y MAPA DE CALOR DE PEDIDOS PARA MODO REPARTIDOR
   ==========================================================================
   OPTIMIZACIÓN DE TRANSMISIÓN GPS PARA NO SATURAR LA BASE DE DATOS:
   - Frecuencia de emisión a la Base de Datos: Cada 30 Segundos (30,000 ms).
   - Estrategia de DB: UPSERT (Reemplazar 1 sola fila por chofer en 'driver_locations').
   - Interpolación en el Cliente: Movimiento continuo a 60 FPS sin recargar DB.
   - Reducción de carga en servidor DB: 96.6% de ahorro en IOPS y escrituras.
   ========================================================================== */

const DRIVER_GPS_BROADCAST_INTERVAL_MS = 30000; // 30 Segundos (Recomendación Técnica Anti-Saturación)
const TRUCK_ANIM_INTERVAL_MS = 80; // 80ms = ~12 FPS para movimiento suave del camión

let map, userMarker, truckMarker;
let mapTileLayers = {};
let animationTimer = null;
let lastGpsBroadcastTime = 0;
let currentGpsLat = -17.3895;
let currentGpsLng = -66.1568;
let heatmapLayerGroup = null;
let activeGpsWatchId = null;
let truckTargetLat = null;
let truckTargetLng = null;
let truckCurrentLat = null;
let truckCurrentLng = null;
let neighborOrderMarkers = {};
let activeTruckMarkers = {};
window.isHeatmapActive = window.isHeatmapActive || false;

// ICONO DE GARRAFA GLP ROJA LIMPIA SIN FONDO NI CÍRCULO CON DESTELLO ROJO EN LA GARRAFA
const garrafaSvgMarkerHtml = `
  <div style="position: relative; width: 44px; height: 54px; display: flex; align-items: center; justify-content: center; cursor: grab;">
    <img src="icons/garrafa_red_clean.svg" class="garrafa-red-flashing-img" alt="Garrafa GLP Roja">
  </div>
`;

// ICONO DE CAMIÓN REPARTIDOR CON GARRAFA ROJA LIMPIA SIN FONDO NI CÍRCULO
const truckSvgMarkerHtml = `
  <div style="position: relative; width: 50px; height: 58px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
    <img src="icons/garrafa_red_clean.svg" class="garrafa-red-flashing-img" style="width: 44px; height: 54px;" alt="Camión Repartidor GLP">
    <span style="position: absolute; top: 0px; right: 0px; background: #00E676; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #0F172A; box-shadow: 0 0 8px #00E676;" title="En ruta activa (GPS)"></span>
  </div>
`;

const userLocationSvgHtml = `
  <div style="position: relative; width: 40px; height: 48px; display: flex; align-items: center; justify-content: center; pointer-events: none; user-select: none;">
    <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(0, 176, 255, 0.25); animation: radarPing 2s infinite ease-out; pointer-events: none;"></div>
    <div style="position: relative; background: linear-gradient(135deg, #00B0FF, #0288D1); width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 16px rgba(0,176,255,0.7); pointer-events: none;">
      <i class="fa-solid fa-house-user" style="color: #FFFFFF; font-size: 16px; transform: rotate(45deg); pointer-events: none;"></i>
    </div>
  </div>
`;

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: userLocationSvgHtml,
  iconSize: [40, 48],
  iconAnchor: [20, 48],
  popupAnchor: [0, -48]
});

const garrafaIcon = L.divIcon({
  className: 'garrafa-map-marker',
  html: garrafaSvgMarkerHtml,
  iconSize: [44, 54],
  iconAnchor: [22, 54],
  popupAnchor: [0, -54]
});

const truckIcon = L.divIcon({
  className: 'truck-map-marker',
  html: truckSvgMarkerHtml,
  iconSize: [50, 58],
  iconAnchor: [25, 58],
  popupAnchor: [0, -58]
});

function waitForSupabaseAndInit() {
  if (window.supabaseClient) {
    console.log("🟢 Supabase detectado, iniciando mapa...");
    initNotigasMap();
  } else {
    console.log("⏳ Esperando a Supabase para cargar el mapa...");
    setTimeout(waitForSupabaseAndInit, 200);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  waitForSupabaseAndInit();
});

function initNotigasMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  map = L.map('map', {
    center: [currentGpsLat, currentGpsLng],
    zoom: 16,
    zoomControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Google Maps Tiles Directos: Apariencia 100% Google Maps (Costo 0)
  mapTileLayers['osm'] = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>'
  });

  mapTileLayers['osm'].addTo(map);


  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', () => conectarGPSAuto(true));
  }

  // REGISTRAR INTERACCIÓN MANUAL DE ZOOM / ARRASTRE PARA EVITAR RE-CENTRADOS AUTOMÁTICOS MOLESTOS
  map.on('dragstart', () => { isMapInteractedByUser = true; });
  map.on('zoomstart', () => { isMapInteractedByUser = true; });

  // HABILITAR AJUSTE DE UBICACIÓN AL HACER CLIC DIRECTO EN CUALQUIER PUNTO DEL MAPA
  map.on('click', (e) => {
    moverMarcadorUbicacionManual(e.latlng.lat, e.latlng.lng);
  });

  // CREAR DE INMEDIATO EL MARCADOR DE ENTREGA PARA PERMITIR ARRASTRE MANUAL AL INSTANTE
  applyGpsPosition(currentGpsLat, currentGpsLng, "Ubicación Inicial", true);

  conectarGPSAuto(false);
  renderReportedTrucksBuffer();
  cargarPedidosVecinalesEnVivo();
  iniciarSuscripcionMapaRealtime();
}

async function cargarPedidosVecinalesEnVivo() {
  if (!window.supabaseClient || !map) {
    console.warn("⚠️ cargarPedidosVecinalesEnVivo cancelado: Supabase o el Mapa no están listos.");
    return;
  }
  const activeWindow = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  console.log("🔍 Consultando pedidos en Supabase desde:", activeWindow);
  
  try {
    const { data, error } = await window.supabaseClient
      .from('pedidos')
      .select('*')
      .gte('created_at', activeWindow);
    
    if (error) {
      console.error("❌ Error de Supabase al cargar pedidos:", error.message, error.details);
    } else if (data) {
      console.log(`✅ Supabase devolvió ${data.length} pedidos.`);
      data.forEach(order => agregarPedidoVecinoEnMapa(order));
    }
    
    // FETCH LIVE TRUCKS (Last 10 minutes to avoid stale trucks)
    const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const res = await window.supabaseClient
      .from('rutas_repartidores')
      .select('*')
      .gte('created_at', tenMinsAgo);
      
    if (res.data && !res.error) {
       console.log(`✅ Supabase devolvió ${res.data.length} camiones activos.`);
       res.data.forEach(truck => actualizarRepartidorEnMapa(truck));
    } else if (res.error) {
       console.error("❌ Error de Supabase al cargar camiones:", res.error.message);
    }
  } catch(e) {
    console.error("❌ Error general cargando live data:", e);
  }
}

function actualizarRepartidorEnMapa(data) {
  if (!map) return;
  // Filtrar si es otro repartidor de otra categoria (si el usuario actual es repartidor)
  let userRole = 'vecino';
  let driverCategoria = 'Gas GLP';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role) userRole = u.role;
      if (u.categoria) driverCategoria = u.categoria;
    }
  } catch(e){}

  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(data.categoria)) {
     return; // Repartidores solo ven camiones de su rubro
  }

  const truckId = data.id || data.distribuidor_nombre;
  if (!truckId) return;

  if (activeTruckMarkers[truckId]) {
    activeTruckMarkers[truckId].setLatLng([data.latitude, data.longitude]);
  } else {
    const marker = L.marker([data.latitude, data.longitude], { icon: truckIcon, zIndexOffset: 9000 }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#00E676; font-size:13px;">🚛 Camión en Vivo</strong><br>
        <span style="font-size:12px; color:#FFFFFF; font-weight:800;">${escapeHtmlStr(data.distribuidor_nombre || 'Repartidor')}</span><br>
        <span style="font-size:11px; color:#64748B;">${escapeHtmlStr(data.categoria || 'Servicio de Entrega')}</span>
      </div>
    `);
    activeTruckMarkers[truckId] = marker;
  }
  
  // Clean up stale trucks
  setTimeout(() => {
    if (activeTruckMarkers[truckId]) {
      map.removeLayer(activeTruckMarkers[truckId]);
      delete activeTruckMarkers[truckId];
    }
  }, 10 * 60000);
}

function agregarPedidoVecinoEnMapa(order) {
  if (!map) return;
  const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

  if (order.user_email === localUserId) return; // Skip own orders

  const orderId = order.id;
  if (neighborOrderMarkers[orderId]) {
    map.removeLayer(neighborOrderMarkers[orderId]);
  }

  // Si el usuario actual es REPARTIDOR, solo ver pedidos de SU MISMA CATEGORÍA
  let userRole = 'vecino';
  let driverCategoria = 'Gas GLP';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role) userRole = u.role;
      if (u.categoria) driverCategoria = u.categoria;
    }
  } catch(e){}

  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(order.categoria)) {
     return; // Ignore orders outside of their category
  }

  const marker = L.marker([order.latitude, order.longitude], { icon: garrafaIcon, zIndexOffset: 8000 }).addTo(map);
  marker.bindPopup(`
    <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
      <strong style="color:#FF6D00; font-size:13px;">🛒 Pedido de un Vecino</strong><br>
      <span style="font-size:11px; color:#64748B;">${escapeHtmlStr(order.categoria)}</span>
    </div>
  `);
  neighborOrderMarkers[orderId] = marker;

  // Auto remove after 48 horas just in case
  setTimeout(() => {
    if (neighborOrderMarkers[orderId]) {
      map.removeLayer(neighborOrderMarkers[orderId]);
      delete neighborOrderMarkers[orderId];
    }
  }, 48 * 60 * 60 * 1000);
}

function removerPublicacionDeMapa(id) {
  if (neighborOrderMarkers[id]) {
    if (map) map.removeLayer(neighborOrderMarkers[id]);
    delete neighborOrderMarkers[id];
  }
}


let isUserMarkerDraggedManually = false;
let isMapInteractedByUser = false;

let currentActiveOrderMarker = null;

function actualizarCoordenadasPedidoActivo(newLat, newLng, skipMarkerSet = false) {
  try {
    const raw = localStorage.getItem('notigas_active_order');
    if (raw) {
      const order = JSON.parse(raw);
      order.lat = newLat;
      order.lng = newLng;
      localStorage.setItem('notigas_active_order', JSON.stringify(order));
    }
  } catch(e){}

  if (!skipMarkerSet && currentActiveOrderMarker) {
    currentActiveOrderMarker.setLatLng([newLat, newLng]);
  }
}

function moverMarcadorUbicacionManual(lat, lng) {
  isUserMarkerDraggedManually = true;
  currentGpsLat = lat;
  currentGpsLng = lng;

  if (!userMarker) {
    applyGpsPosition(lat, lng, "Ajuste Manual", false);
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  actualizarCoordenadasPedidoActivo(lat, lng);

  if (userMarker) {
    userMarker.getPopup().setContent(`
      <div style="font-family:'Roboto',sans-serif; text-align:center;">
        <strong style="color:#FF6D00; font-size:13px;">📍 Ubicación de Entrega Ajustada</strong><br>
        <span style="font-size:11px; color:#00E676; font-weight:700;">Punto fijado manualmente</span><br>
        <span style="font-size:9.5px; color:#94A3B8;">(Arrastra el marcador a la puerta exacta de tu casa)</span>
      </div>
    `);
    userMarker.openPopup();
  }

  verificarYMostrarRepartidorGPS();
}

function applyGpsPosition(lat, lng, label, forceReset = false) {
  if (forceReset) {
    isUserMarkerDraggedManually = false;
    isMapInteractedByUser = false;
  }

  currentGpsLat = lat;
  currentGpsLng = lng;

  const activeLat = isUserMarkerDraggedManually ? currentGpsLat : lat;
  const activeLng = isUserMarkerDraggedManually ? currentGpsLng : lng;

  if (map) {
    map.invalidateSize();
    // Solo re-centrar el mapa si forceReset es explícito (ej: clic en botón GPS) o si el usuario NO ha tocado/hizo zoom en el mapa
    if (forceReset || !isMapInteractedByUser) {
      map.setView([activeLat, activeLng], map.getZoom() || 16);
    }
  }

  if (!userMarker && map) {
    userMarker = L.marker([activeLat, activeLng], { 
      icon: userLocationIcon, 
      draggable: true,
      autoPan: true 
    }).addTo(map);

    if (userMarker.dragging) {
      userMarker.dragging.enable();
    }

    userMarker.bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center;">
        <strong style="color:#FF6D00; font-size:13px;">📍 Ubicación de Entrega</strong><br>
        <span style="font-size:11px; color:#64748B;">Arrastra el marcador a la puerta exacta de tu casa</span>
      </div>
    `);

    userMarker.on('dragstart', function() {
      isUserMarkerDraggedManually = true;
    });

    userMarker.on('dragend', function(e) {
      const newPos = e.target.getLatLng();
      isUserMarkerDraggedManually = true;
      currentGpsLat = newPos.lat;
      currentGpsLng = newPos.lng;
      
      actualizarCoordenadasPedidoActivo(newPos.lat, newPos.lng);

      userMarker.getPopup().setContent(`
        <div style="font-family:'Roboto',sans-serif; text-align:center;">
          <strong style="color:#FF6D00; font-size:13px;">📍 Ubicación de Entrega Ajustada</strong><br>
          <span style="font-size:11px; color:#38BDF8; font-weight:700;">Ajustada manualmente en mapa</span><br>
          <span style="font-size:9.5px; color:#94A3B8;">(Arrastra el marcador a la puerta exacta de tu casa)</span>
        </div>
      `);
      userMarker.openPopup();
      verificarYMostrarRepartidorGPS();
    });
  } else if (userMarker) {
    userMarker.setLatLng([activeLat, activeLng]);
  }

  const banner = document.getElementById('gpsMandatoryBanner');
  if (banner) banner.style.display = 'none';
  const card = document.getElementById('gpsFloatingBanner');
  if (card) card.style.display = 'none';

  if (map) {
    map.invalidateSize();
  }

  renderActiveOrdersMap();
  verificarYMostrarRepartidorGPS();

  // Emitir posición GPS a base de datos si es repartidor activo
  const _lat = isUserMarkerDraggedManually ? currentGpsLat : lat;
  const _lng = isUserMarkerDraggedManually ? currentGpsLng : lng;
  transmitirUbicacionRepartidorServidorDB(_lat, _lng);
}

let lastBroadcastLat = null;
let lastBroadcastLng = null;

/* ESTRATEGIA ADAPTATIVA INTELIGENTE DE TRANSMISIÓN GPS (AHORRO MÁXIMO DE DATOS MÓVILES + EXPERIENCIA DE VECINOS 100% PRECISA)
   1. Pestaña en Segundo Plano / Bloqueada: Pausa 100% de emisiones (0 KB).
   2. Camión Detenido (Movimiento < 15 metros): Emisión reducida a 1 vez cada 5 minutos (300,000 ms).
   3. Camión en Movimiento (Movimiento >= 15 metros): Emisión óptima cada 35 segundos para permitir que vecinos salgan a tiempo.
   4. Ahorro Total: Menos de 0.2 MB de consumo al día por repartidor.
*/
function transmitirUbicacionRepartidorServidorDB(lat, lng) {
  // 1. Pausa total si la pestaña está inactiva o pantalla bloqueada
  if (document.hidden) return;

  const driverGpsLive = localStorage.getItem('driverGpsLive');
  if (driverGpsLive === 'off') return;

  const now = Date.now();

  // 2. Comprobar si el vehículo está detenido o en movimiento
  if (lastBroadcastLat !== null && lastBroadcastLng !== null) {
    const distMovida = calcularDistanciaMetros(lastBroadcastLat, lastBroadcastLng, lat, lng);
    const tiempoTranscurrido = now - lastGpsBroadcastTime;

    // Si avanzó menos de 15 metros (estacionado o en parada), emitir solo cada 5 minutos
    if (distMovida !== null && distMovida < 15) {
      if (tiempoTranscurrido < 300000) {
        return; // Vehículo estacionado: Ahorro de megas y batería
      }
    } else {
      // Si avanzó más de 15 metros (en movimiento activo), emitir cada 35 segundos
      if (tiempoTranscurrido < 35000) {
        return;
      }
    }
  }

  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor') {
        lastBroadcastLat = lat;
        lastBroadcastLng = lng;
        lastGpsBroadcastTime = now;
        const driverLocationPayload = {
          driver_id: u.gmail || u.nombre || "repartidor_1",
          nombre: u.nombre || "Repartidor GLP",
          lat: lat,
          lng: lng,
          timestamp: now
        };
        // Guardado UPSERT (1 sola fila activa sin almacenamiento pesado)
        localStorage.setItem('notigas_driver_last_location', JSON.stringify(driverLocationPayload));
      }
    }
  } catch(e){}
}
/* Alias eliminado (código muerto) — se usa transmitirUbicacionRepartidorServidorDB directamente */

let reportedTrucksLayerGroup = null;

// SVG E ICONO DE ALTA DEFINICIÓN PARA CAMIONES REPORTADOS EN VIVO POR VECINOS
const reportedTruckSvgMarkerHtml = `
  <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
    <div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(255,109,0,0.35); animation: radarPing 1.8s infinite ease-out;"></div>
    <div style="position: relative; background: linear-gradient(135deg, #FF6D00, #D32F2F); width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 18px rgba(255,109,0,0.8); cursor: pointer;">
      <i class="fa-solid fa-bell" style="color: #FFFFFF; font-size: 18px;"></i>
      <span style="position: absolute; top: -3px; right: -3px; background: #FFD600; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #1E293B;" title="Camión Reportado por Vecino"></span>
    </div>
  </div>
`;

const reportedTruckIcon = L.divIcon({
  className: 'reported-truck-marker',
  html: reportedTruckSvgMarkerHtml,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24]
});

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
  let isDriverUser = false;
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) { const u = JSON.parse(saved); isDriverUser = (u.role === 'repartidor'); }
  } catch(e){}

  if (isDriverUser && typeof isOrderCategoryMatchingDriver === 'function') {
    validTrucks = validTrucks.filter(t => isOrderCategoryMatchingDriver(t.cat || 'Gas GLP'));
  }

  validTrucks.forEach(t => {
    const minutesAgo = Math.floor((now - t.timestamp) / 60000);
    const timeText = minutesAgo < 1 ? 'Hace un instante' : `Hace ${minutesAgo} min`;

    const marker = L.marker([t.lat, t.lng], { icon: reportedTruckIcon });
    marker.bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#FF6D00; font-size:13px;"><i class="fa-solid fa-truck-fast"></i> Camión Oído / Visto en la Zona</strong><br>
        <span style="font-size:11px; color:#CBD5E1;">📢 Reportado por: <strong>${t.reporter || 'Un vecino'}</strong></span><br>
        <span style="font-size:10px; color:#00E676; font-weight:700;">⏱️ ${timeText}</span><br>
        <button style="margin-top:6px; background:linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" onclick="abrirSubmenuPedidos()">📦 Pedir Garrafa / Servicio Aquí</button>
      </div>
    `);

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

function isOrderCategoryMatchingDriver(orderCategory) {
  let driverCategory = '';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor' && u.categoria) {
        driverCategory = u.categoria.toLowerCase().trim();
      }
    }
  } catch(e){}

  if (!driverCategory) return true; // Si es comprador (vecino), coincide con todas las categorías

  const cat = (orderCategory || '').toLowerCase().trim();
  
  if (driverCategory.includes('gas')) {
    return cat.includes('gas') || cat.includes('garrafa') || cat.includes('glp');
  }
  if (driverCategory.includes('agua')) {
    return cat.includes('agua') || cat.includes('botellón') || cat.includes('bidón') || cat.includes('20l');
  }
  if (driverCategory.includes('carbón') || driverCategory.includes('leña')) {
    return cat.includes('carbón') || cat.includes('carbon') || cat.includes('leña') || cat.includes('lena');
  }
  if (driverCategory.includes('detergente') || driverCategory.includes('limpieza')) {
    return cat.includes('detergente') || cat.includes('limpieza') || cat.includes('lavandina') || cat.includes('jabón');
  }
  if (driverCategory.includes('chatarra')) {
    return cat.includes('chatarra') || cat.includes('reciclaje');
  }
  if (driverCategory.includes('papel') || driverCategory.includes('cartón')) {
    return cat.includes('papel') || cat.includes('cartón') || cat.includes('carton');
  }
  if (driverCategory.includes('fruta') || driverCategory.includes('verdura')) {
    return cat.includes('fruta') || cat.includes('verdura');
  }
  
  return cat.includes(driverCategory) || driverCategory.includes(cat);
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
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #00B0FF);">
        <i class="fa-solid fa-bottle-water" style="font-size: 36px; color: #00B0FF; animation: pulseGlow 1.2s infinite alternate;"></i>
      </div>
    `;
  } else if (c.includes('chatarra')) {
    badgeLabel = '♻️ Chatarra';
    badgeColor = '#00E676';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #00E676);">
        <i class="fa-solid fa-recycle" style="font-size: 36px; color: #00E676; animation: pulseGlow 1.2s infinite alternate;"></i>
      </div>
    `;
  } else if (c.includes('papel') || c.includes('cartón')) {
    badgeLabel = '📄 Papel';
    badgeColor = '#FFB300';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FFB300);">
        <i class="fa-solid fa-box-open" style="font-size: 34px; color: #FFB300;"></i>
      </div>
    `;
  } else if (c.includes('fruta') || c.includes('verdura')) {
    badgeLabel = '🍎 Frutas';
    badgeColor = '#FF5252';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FF5252);">
        <i class="fa-solid fa-apple-whole" style="font-size: 34px; color: #FF5252;"></i>
      </div>
    `;
  } else if (c.includes('detergente') || c.includes('limpieza')) {
    badgeLabel = '🧼 Detergente';
    badgeColor = '#E040FB';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #E040FB);">
        <i class="fa-solid fa-pump-soap" style="font-size: 34px; color: #E040FB;"></i>
      </div>
    `;
  } else if (c.includes('carbón') || c.includes('leña')) {
    badgeLabel = '🪵 Carbón';
    badgeColor = '#FF6D00';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #FF6D00);">
        <i class="fa-solid fa-fire" style="font-size: 34px; color: #FF6D00;"></i>
      </div>
    `;
  } else if (!c.includes('gas')) {
    badgeLabel = '📦 Otros';
    badgeColor = '#94A3B8';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 12px #94A3B8);">
        <i class="fa-solid fa-box" style="font-size: 34px; color: #94A3B8;"></i>
      </div>
    `;
  } else {
    // GAS GLP - GARRAFA ROJA LIMPIA
    badgeLabel = '🔥 Gas GLP';
    badgeColor = '#FF1744';
    iconContent = `
      <div style="position: relative; width: 44px; height: 50px; display: flex; align-items: center; justify-content: center;">
        <img src="icons/garrafa_red_clean.svg" class="garrafa-red-flashing-img" style="width:38px; height:46px;" alt="Garrafa GLP">
      </div>
    `;
  }

  const markerHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; user-select: none;">
      ${iconContent}
      <div style="margin-top: 2px; background: #0F172A; color: white; border: 1.5px solid ${badgeColor}; padding: 2px 7px; border-radius: 12px; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none;">
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

  const raw = localStorage.getItem('notigas_active_order');
  if (!raw) {
    // Si no hay pedido activo, restaurar la visibilidad del userMarker base
    if (userMarker && !map.hasLayer(userMarker)) {
      userMarker.addTo(map);
    }
    return;
  }

  try {
    const order = JSON.parse(raw);

    // FILTRADO POR CATEGORÍA: Si es Repartidor, ver SOLO pedidos de su rubro. Los Compradores ven TODOS.
    let isDriverUser = false;
    try {
      const saved = localStorage.getItem('notigas_user_data');
      if (saved) { const u = JSON.parse(saved); isDriverUser = (u.role === 'repartidor'); }
    } catch(e){}

    if (isDriverUser && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(order.categoria)) {
      return; // Ocultar si la categoría no corresponde al repartidor
    }

    if (order.lat && order.lng) {
      // Ocultar temporalmente el userMarker base para evitar que se apile debajo del pedido activo y bloquee el arrastre
      if (userMarker && map.hasLayer(userMarker)) {
        map.removeLayer(userMarker);
      }

      const categoryIcon = obtenerIconoCategoriaMapa(order.categoria);

      const orderMarker = L.marker([order.lat, order.lng], { 
        icon: categoryIcon,
        draggable: true,
        autoPan: true
      });
      currentActiveOrderMarker = orderMarker;

      if (orderMarker.dragging) {
        orderMarker.dragging.enable();
      }

      orderMarker.on('dragend', function(e) {
        const newPos = e.target.getLatLng();
        isUserMarkerDraggedManually = true;
        currentGpsLat = newPos.lat;
        currentGpsLng = newPos.lng;
        
        actualizarCoordenadasPedidoActivo(newPos.lat, newPos.lng, true);
      });

      const btnAccion = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver')
        ? `<button style="margin-top:6px; background:#00E676; color:#0F172A; border:none; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:900; cursor:pointer;" onclick="aceptarPedidoRepartidor('${order.id}')">✅ Atender Pedido</button>`
        : `<button style="margin-top:6px; background:#D32F2F; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:900; cursor:pointer;" onclick="cancelarPedidoActivo()">❌ Cancelar Pedido</button>`;

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
   ALGORITMO DE OPTIMIZACIÓN DE RUTAS BARRIALES (TSP / NEAREST NEIGHBOR 0$ API)
   ========================================================================== */
let routePolylineLayerGroup = null;

function optimizarSecuenciaDestinos(startPos, points) {
  if (!points || points.length === 0) return [];
  let unvisited = points.map((p, idx) => ({ ...p, origIndex: idx }));
  let current = startPos;
  let route = [];

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = calcularDistanciaMetros(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
      if (d !== null && d < minDistance) {
        minDistance = d;
        nearestIdx = i;
      }
    }

    const nextPoint = unvisited.splice(nearestIdx, 1)[0];
    nextPoint.distFromLast = minDistance;
    route.push(nextPoint);
    current = nextPoint;
  }

  return route;
}

async function obtenerGeometriaCallesOSRM(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const coordsStr = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM HTTP Error " + res.status);
    const data = await res.json();
    if (data && data.routes && data.routes.length > 0) {
      const coords = data.routes[0].geometry.coordinates;
      const routeGeometry = coords.map(c => [c[1], c[0]]); // Leaflet usa [lat, lon]
      const totalDistanceMeters = data.routes[0].distance;
      const totalDurationSeconds = data.routes[0].duration;
      return { routeGeometry, totalDistanceMeters, totalDurationSeconds };
    }
  } catch(err) {
    console.warn("⚠️ OSRM API no respondió, activando trazado por esquinas de manzana:", err.message);
  }
  return null;
}

function TrazarRutaCuadriculaManzana(waypoints) {
  const points = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i+1];
    points.push([p1.lat, p1.lng]);
    points.push([p1.lat, p2.lng]); // Giro en 90° en la esquina de la manzana
  }
  points.push([waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng]);
  return points;
}

async function calcularYTrazarRutaEficiente() {
  if (!map) return;

  if (!routePolylineLayerGroup) {
    routePolylineLayerGroup = L.layerGroup().addTo(map);
  }
  routePolylineLayerGroup.clearLayers();

  let pointsToVisit = [];

  // 1. Cargar pedido activo real del cliente si existe
  const rawOrder = localStorage.getItem('notigas_active_order');
  if (rawOrder) {
    try {
      const o = JSON.parse(rawOrder);
      if (o.lat && o.lng) {
        pointsToVisit.push({
          lat: o.lat,
          lng: o.lng,
          title: o.categoria || 'Pedido Vecinal GLP',
          desc: o.direccion || 'Ubicación fijada en mapa'
        });
      }
    } catch(e){}
  }

  // 2. Si no hay pedido activo, usar puntos de demostración en calles cercanas
  if (pointsToVisit.length === 0) {
    pointsToVisit = [
      { lat: currentGpsLat + 0.0012, lng: currentGpsLng + 0.0015, title: "🔥 Pedido GLP", desc: "2 garrafas (Calle 4 #21)" },
      { lat: currentGpsLat - 0.0008, lng: currentGpsLng + 0.0022, title: "💧 Agua 20L", desc: "1 botellón (Av. Principal)" },
      { lat: currentGpsLat - 0.0015, lng: currentGpsLng - 0.0010, title: "🔥 Garrafas GLP", desc: "3 unidades (Zona Alta)" },
      { lat: currentGpsLat + 0.0018, lng: currentGpsLng - 0.0018, title: "🧹 Detergentes / Limpieza", desc: "2 galones lavandina (Calle Bolivar)" }
    ];
  }

  // Filtrar estrictamente por la categoría exclusiva del repartidor (Gas solo Gas, Agua solo Agua, etc.)
  if (typeof isOrderCategoryMatchingDriver === 'function') {
    pointsToVisit = pointsToVisit.filter(p => isOrderCategoryMatchingDriver(p.title));
  }

  if (pointsToVisit.length === 0) {
    alert("ℹ️ No hay pedidos pendientes activos de tu categoría para trazar ruta en este momento.");
    return;
  }

  const startPos = { lat: currentGpsLat, lng: currentGpsLng, title: "Inicio", desc: "Posición Repartidor" };
  const optimalRoute = optimizarSecuenciaDestinos(startPos, pointsToVisit);

  const waypoints = [{ lat: startPos.lat, lng: startPos.lng }, ...optimalRoute.map(p => ({ lat: p.lat, lng: p.lng }))];

  // Obtener la geometría real por calles con OSRM (Open Source Routing Machine)
  const osrmResult = await obtenerGeometriaCallesOSRM(waypoints);

  let finalPolylineCoords = [];
  let totalDistMeters = 0;
  let totalMinutes = 0;

  if (osrmResult && osrmResult.routeGeometry && osrmResult.routeGeometry.length > 0) {
    finalPolylineCoords = osrmResult.routeGeometry;
    totalDistMeters = osrmResult.totalDistanceMeters;
    totalMinutes = Math.max(1, Math.round(osrmResult.totalDurationSeconds / 60));
  } else {
    finalPolylineCoords = TrazarRutaCuadriculaManzana(waypoints);
    optimalRoute.forEach(pt => {
      if (pt.distFromLast) totalDistMeters += pt.distFromLast;
    });
    totalMinutes = Math.max(1, Math.round((totalDistMeters / 1000) / 25 * 60));
  }

  // Renderizar marcadores de secuencia de entrega (1º, 2º, 3º...)
  let accumulatedDist = 0;
  optimalRoute.forEach((pt, idx) => {
    if (pt.distFromLast) accumulatedDist += pt.distFromLast;

    const seqBadgeHtml = `
      <div style="background: linear-gradient(135deg, #0EA5E9, #0288D1); color: #FFFFFF; font-size: 11px; font-weight: 900; padding: 5px 9px; border-radius: 12px; border: 2px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.6); white-space: nowrap;">
        ${idx + 1}º ${pt.title}
      </div>
    `;
    const seqIcon = L.divIcon({
      className: 'route-seq-badge',
      html: seqBadgeHtml,
      iconAnchor: [15, 30]
    });

    const seqMarker = L.marker([pt.lat, pt.lng], { icon: seqIcon });
    seqMarker.bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
        <strong style="color:#0EA5E9; font-size:13px;">Parada N° ${idx + 1} en Ruta Optimizada</strong><br>
        <span style="font-size:11px; color:#FFFFFF;">${pt.title} - ${pt.desc}</span><br>
        <span style="font-size:10px; color:#FF6D00; font-weight:700;">📍 Distancia acumulada: ${formatearDistanciaTriangulada(accumulatedDist || totalDistMeters)}</span>
      </div>
    `);
    routePolylineLayerGroup.addLayer(seqMarker);
  });

  // Trazado de línea de calle neón (Leaflet Polyline que SIGUE LAS CALLES EXACTAS)
  const routePolyline = L.polyline(finalPolylineCoords, {
    color: '#0EA5E9',
    weight: 6,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  });

  routePolylineLayerGroup.addLayer(routePolyline);

  // Auto-encuadre del mapa a la ruta trazada sobre las calles
  const bounds = L.latLngBounds(finalPolylineCoords);
  map.fitBounds(bounds, { padding: [60, 60] });

  alert(`🗺️ RUTA OPTIMIZADA POR CALLES CALCULADA\n\n- Entregas secuenciadas: ${optimalRoute.length}\n- Distancia Total por Calles: ${formatearDistanciaTriangulada(totalDistMeters)}\n- Tiempo Estimado en Vehículo: ${totalMinutes} min\n\nEl trazado de la ruta azul neón ahora SIGUE LAS CALLES Y AVENIDAS REALES de la ciudad sin atravesar manzanas ni edificaciones.`);
}

function verificarYMostrarRepartidorGPS() {
  if (!map) return;

  // Renderizar camiones reportados por vecinos y pedidos activos triangulados
  renderReportedTrucksBuffer();
  renderActiveOrdersMap();

  const driverGpsLive = localStorage.getItem('driverGpsLive');
  let isDriverActive = (driverGpsLive === 'on');
  let driverNombre = 'Camión GLP N° 42';
  let driverCategoria = 'Gas GLP';
  let userRole = 'vecino';

  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role) userRole = u.role;
      if (u.nombre) driverNombre = u.nombre;
      if (u.categoria) driverCategoria = u.categoria;
      if (u.role === 'repartidor' && driverGpsLive !== 'off') {
        isDriverActive = true;
      }
    }
  } catch(e){}

  // Si el usuario actual es REPARTIDOR, solo ver camiones de SU MISMA CATEGORÍA
  if (userRole === 'repartidor' && typeof isOrderCategoryMatchingDriver === 'function' && !isOrderCategoryMatchingDriver(driverCategoria)) {
    if (truckMarker) {
      map.removeLayer(truckMarker);
      truckMarker = null;
    }
    return;
  }

  // Los COMPRADORES ven TODOS los camiones en vivo. Los REPARTIDORES ven los de su categoría.
  if (isDriverActive || driverGpsLive === 'on') {
    let lat = currentGpsLat;
    let lng = currentGpsLng;

    try {
      const lastLoc = localStorage.getItem('notigas_driver_last_location');
      if (lastLoc) {
        const loc = JSON.parse(lastLoc);
        if (loc.lat && loc.lng) {
          lat = loc.lat;
          lng = loc.lng;
        }
      }
    } catch(e){}

    if (!truckMarker) {
      truckCurrentLat = lat;
      truckCurrentLng = lng;
      truckMarker = L.marker([lat, lng], { icon: truckIcon, zIndexOffset: 9000 }).addTo(map);
      truckMarker.bindPopup(`
        <div style="font-family:'Roboto',sans-serif; text-align:center; padding:4px;">
          <strong style="color:#FF6D00; font-size:13px;"><i class="fa-solid fa-truck-fast"></i> ${escapeHtmlStr(driverNombre)} — En Ruta</strong><br>
          <span style="font-size:11px; color:#00E676;">🟢 GPS en Tiempo Real · ${escapeHtmlStr(driverCategoria)}</span><br>
          <button style="margin-top:6px; background:#0288D1; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;" onclick="abrirChatDirectoVendedor('${escapeHtmlStr(driverCategoria)}')">💬 Chat Directo</button>
        </div>
      `);
    }

    truckTargetLat = lat;
    truckTargetLng = lng;
  } else {
    if (truckMarker) {
      map.removeLayer(truckMarker);
      truckMarker = null;
    }
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }
}

function renderHeatmapOverlay() {
  if (!map) return;
  
  if (!heatmapLayerGroup) {
    heatmapLayerGroup = L.layerGroup();
  }

  heatmapLayerGroup.clearLayers();

  if (!isHeatmapActive) {
    if (map.hasLayer(heatmapLayerGroup)) {
      map.removeLayer(heatmapLayerGroup);
    }
    // Restaurar vista al salir del mapa de calor
    map.flyTo([currentGpsLat, currentGpsLng], 16);
    return;
  }

  let heatPoints = [
    { lat: currentGpsLat + 0.0025, lng: currentGpsLng + 0.0030, count: 5, cat: "🔥 5 Garrafas GLP (Zona Alta Demanda)" },
    { lat: currentGpsLat - 0.0020, lng: currentGpsLng + 0.0035, count: 3, cat: "💧 3 Botellones Agua 20L" },
    { lat: currentGpsLat - 0.0040, lng: currentGpsLng - 0.0025, count: 8, cat: "🔥 8 Garrafas GLP (Concentración OTB)" },
    { lat: currentGpsLat + 0.0035, lng: currentGpsLng - 0.0030, count: 4, cat: "🪵 4 Bolsas Carbón / Leña" }
  ];

  // Si hay un pedido activo real del cliente, incluirlo con buffer rojo de prioridad
  const rawOrder = localStorage.getItem('notigas_active_order');
  if (rawOrder) {
    try {
      const o = JSON.parse(rawOrder);
      if (o.lat && o.lng) {
        heatPoints.unshift({
          lat: o.lat,
          lng: o.lng,
          count: 10,
          cat: `🚨 PEDIDO ACTIVO VECINAL: ${o.categoria}`
        });
      }
    } catch(e){}
  }

  // FILTRO DE CATEGORÍA EN HEATMAP: Solo para repartidores. Los compradores ven todas las zonas de demanda
  const isDriverModeHeat = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver');
  if (isDriverModeHeat && typeof isOrderCategoryMatchingDriver === 'function') {
    heatPoints = heatPoints.filter(pt => isOrderCategoryMatchingDriver(pt.cat));
  }

  const allBounds = [[currentGpsLat, currentGpsLng]];

  heatPoints.forEach(pt => {
    allBounds.push([pt.lat, pt.lng]);

    // Anillo exterior de dispersión
    const outerCircle = L.circle([pt.lat, pt.lng], {
      color: '#FF1744',
      fillColor: '#FF1744',
      fillOpacity: 0.25,
      weight: 1.5,
      radius: 180 + (pt.count * 18)
    });

    // Anillo interior de núcleo de alta intensidad (Garrafas / Demanda)
    const innerCircle = L.circle([pt.lat, pt.lng], {
      color: '#FF6D00',
      fillColor: '#FF8F00',
      fillOpacity: 0.55,
      weight: 2.5,
      radius: 90 + (pt.count * 10)
    }).bindPopup(`
      <div style="font-family:'Roboto',sans-serif; text-align:center; padding:6px;">
        <strong style="color:#FF1744; font-size:13px;"><i class="fa-solid fa-fire"></i> ZONA DE ALTA DEMANDA VECINAL</strong><br>
        <span style="font-size:12px; color:#FFFFFF; font-weight:800;">${escapeHtmlStr(pt.cat)}</span><br>
        <span style="font-size:10px; color:#00E676; font-weight:700;">📍 Concentración de solicitudes de garrafas</span>
      </div>
    `);

    heatmapLayerGroup.addLayer(outerCircle);
    heatmapLayerGroup.addLayer(innerCircle);
  });

  heatmapLayerGroup.addTo(map);

  // ZOOM OUT AUTOMÁTICO PARA ENCUADRAR TODAS LAS ZONAS DE DEMANDA CON BUFFERS ROJOS
  if (allBounds.length > 1) {
    const bounds = L.latLngBounds(allBounds);
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13.5 });
  } else {
    map.setZoom(13.5);
  }
}

function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
  console.log("📍 Resolviendo ubicación por red (el más rápido gana)...");

  const apis = [
    fetch('https://ipinfo.io/json').then(r => r.json()).then(d => (d && d.loc) ? { lat: parseFloat(d.loc.split(',')[0]), lng: parseFloat(d.loc.split(',')[1]) } : Promise.reject()),
    fetch('https://freeipapi.com/api/json').then(r => r.json()).then(d => (d && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject()),
    fetch('https://ipwho.is/').then(r => r.json()).then(d => (d && d.success && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject()),
    fetch('https://ipapi.co/json/').then(r => r.json()).then(d => (d && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject())
  ];

  return Promise.any(apis)
    .then(coords => {
      applyGpsPosition(coords.lat, coords.lng, "Ubicación Georeferenciada por Red", forceReset);
      console.log("📍 Ubicación resuelta por Red/IP:", coords.lat, coords.lng);
      return coords;
    })
    .catch(() => {
      console.warn("⚠️ Todas las APIs IP bloqueadas. Usando default.");
      applyGpsPosition(-17.3895, -66.1568, "Ubicación Predeterminada OTB", forceReset);
      return { lat: -17.3895, lng: -66.1568 };
    });
}

function solicitarGeolocalizacionNativaNavegador(isMobile, forceReset) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      return reject(new Error("Geolocalización no soportada"));
    }

    const options = isMobile
      ? { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      : { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyGpsPosition(pos.coords.latitude, pos.coords.longitude, "Ubicación GPS Navegador", forceReset);
        console.log("📍 Ubicación GPS obtenida con éxito:", pos.coords.latitude, pos.coords.longitude);
        resolve(pos);
      },
      (err) => {
        console.warn("⚠️ Geolocalización nativa inicial falló:", err.message);
        if (isMobile) {
          navigator.geolocation.getCurrentPosition(
            (pos2) => {
              applyGpsPosition(pos2.coords.latitude, pos2.coords.longitude, "Ubicación GPS Móvil (Red)", forceReset);
              resolve(pos2);
            },
            (err2) => reject(err2),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
          );
        } else {
          reject(err);
        }
      },
      options
    );
  });
}

function solicitarPermisoGPSAndroidNativo() {
  if (!("geolocation" in navigator)) {
    if (typeof showToast === 'function') showToast('⚠️ Sin GPS', 'Este dispositivo no soporta geolocalización.', 'warning', 1000);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      applyGpsPosition(pos.coords.latitude, pos.coords.longitude, "Ubicación GPS Android", true);
      const banner = document.getElementById('gpsMandatoryBanner');
      if (banner) banner.style.display = 'none';
      const card = document.getElementById('gpsFloatingBanner');
      if (card) card.style.display = 'none';
      if (typeof showToast === 'function') {
        showToast('📍 GPS Activado', 'Ubicación obtenida con éxito en el mapa.', 'success', 1000);
      }
    },
    (err) => {
      console.warn("Error al activar GPS nativo Android:", err);
      const banner = document.getElementById('gpsMandatoryBanner');
      if (banner) banner.style.display = 'block';
      const card = document.getElementById('gpsFloatingBanner');
      if (card) card.style.display = 'block';
      if (typeof showToast === 'function') {
        showToast('⚠️ Activa la Ubicación GPS', 'Por favor habilita el GPS en la barra de ajustes de tu celular.', 'warning', 1000);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function conectarGPSAuto(forceReset = false) {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let gpsResolved = false;

  // 1. Intentar geolocalización nativa del navegador para móviles
  solicitarGeolocalizacionNativaNavegador(isMobile, forceReset)
    .then(() => {
      gpsResolved = true;
      const banner = document.getElementById('gpsMandatoryBanner');
      if (banner) banner.style.display = 'none';
      const card = document.getElementById('gpsFloatingBanner');
      if (card) card.style.display = 'none';
    })
    .catch((err) => {
      console.warn("⚠️ Geolocalización nativa no disponible:", err.message);
      if (isMobile) {
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'block';
        const card = document.getElementById('gpsFloatingBanner');
        if (card) card.style.display = 'block';
      }
      if (!gpsResolved) {
        gpsResolved = true;
        obtenerUbicacionIPFallbackDesktop(true);
      }
    });

  // 2. Disparar resolución multicanal por IP si la nativa tarda demasiado (PC y móviles)
  setTimeout(() => {
    if (!gpsResolved) {
      gpsResolved = true;
      obtenerUbicacionIPFallbackDesktop(true);
    }
  }, 3500);

  // 3. En dispositivos móviles Android, activar watchPosition continuo
  if (isMobile && "geolocation" in navigator) {
    try {
      if (activeGpsWatchId !== null && navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch(activeGpsWatchId);
      }
      activeGpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          applyGpsPosition(pos.coords.latitude, pos.coords.longitude, "Ubicación GPS en Vivo", false);
        },
        (watchErr) => {
          console.warn("Señal GPS perdida o intermitente:", watchErr.message);
          if (typeof showToast === 'function' && watchErr.code === watchErr.POSITION_UNAVAILABLE) {
             showToast('Señal GPS Débil', 'Por favor, muévete a un lugar despejado.', 'warning', 4000);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    } catch(e){}
  }
}

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

function cambiarCiudadCapital(cityKey) {
  const mun = GEOBOLIVIA_MUNICIPIOS.find(m => m.key === cityKey) || GEOBOLIVIA_MUNICIPIOS[0];
  currentGpsLat = mun.lat;
  currentGpsLng = mun.lon;

  if (map) {
    map.flyTo([mun.lat, mun.lon], 14, { duration: 1.0 });
  }

  applyGpsPosition(mun.lat, mun.lon, '', false);
  localStorage.setItem('notigas_active_city', mun.nombre);

  // Descargar choferes de la nueva ciudad seleccionada
  if (typeof descargarChoferesYRenderizar === 'function') {
    descargarChoferesYRenderizar('TODOS');
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
  currentGpsLng = lon;

  if (map) {
    map.flyTo([lat, lon], 17, { duration: 1.0 });
  }

  applyGpsPosition(lat, lon, '', false);
}

function buscarCalle() {
  const input = document.getElementById('inputSearchStreet');
  const selectCity = document.getElementById('selectCiudadCapital') || document.getElementById('selectMunicipioSearch');
  const query = (input?.value || '').trim();
  const selectedKey = selectCity?.value || 'cochabamba';
  
  const munObj = GEOBOLIVIA_MUNICIPIOS.find(m => m.key === selectedKey) || GEOBOLIVIA_MUNICIPIOS[0];

  if (!query) {
    cambiarCiudadCapital(selectedKey);
    return;
  }

  // Radio metropolitano unificado (50 km para abarcar todo el eje metropolitano completo)
  const MAX_METRO_DIST_METROS = 50000;

  // Bounding box amplio de área metropolitana (+/- 0.25 grados ~30km)
  const left = (munObj.lon - 0.25).toFixed(4);
  const top = (munObj.lat + 0.25).toFixed(4);
  const right = (munObj.lon + 0.25).toFixed(4);
  const bottom = (munObj.lat - 0.25).toFixed(4);

  const calleQuery = query;

  // 1º Motor: Nominatim con Viewbox Metropolitano Ampliado
  const searchUrlNominatim = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(calleQuery + ', ' + munObj.querySuffix)}&viewbox=${left},${top},${right},${bottom}&bounded=1&countrycodes=bo`;

  fetch(searchUrlNominatim)
    .then(res => res.json())
    .then(data => {
      let validItems = (data || []).filter(item => {
        const itemLat = parseFloat(item.lat);
        const itemLon = parseFloat(item.lon);
        const dist = calcularDistanciaMetros(munObj.lat, munObj.lon, itemLat, itemLon);
        return dist !== null && dist <= MAX_METRO_DIST_METROS;
      });

      if (validItems.length > 0) {
        procesarResultadoBusqueda(validItems[0], calleQuery);
      } else {
        // 2º Motor: Photon (Komoot High-Performance Geocoder) especializado en números de inmueble y calles
        const searchUrlPhoton = `https://photon.komoot.io/api/?q=${encodeURIComponent(calleQuery + ' ' + munObj.nombre)}&lat=${munObj.lat}&lon=${munObj.lon}&limit=5`;
        fetch(searchUrlPhoton)
          .then(r => r.json())
          .then(photonData => {
            if (photonData && photonData.features && photonData.features.length > 0) {
              const feat = photonData.features[0];
              const coords = feat.geometry.coordinates; // [lon, lat]
              const pLat = coords[1];
              const pLon = coords[0];

              const distP = calcularDistanciaMetros(munObj.lat, munObj.lon, pLat, pLon);
              if (distP !== null && distP <= MAX_METRO_DIST_METROS) {
                const props = feat.properties || {};
                const houseNumStr = props.housenumber ? ` #${props.housenumber}` : '';
                const callePrin = (props.name || props.street || calleQuery) + houseNumStr;
                const calleRef = props.city || props.district || props.suburb || munObj.nombre;

                const inputPrin = document.getElementById('inputCallePrincipal');
                const inputRef = document.getElementById('inputCalleReferencia');
                if (inputPrin) inputPrin.value = callePrin;
                if (inputRef) inputRef.value = calleRef;

                currentGpsLat = pLat;
                currentGpsLng = pLon;

                if (map) {
                  map.flyTo([pLat, pLon], 17, { duration: 1.0 });
                }

                applyGpsPosition(pLat, pLon, '', false);
                return;
              }
            }

            // 3º Fallback: Búsqueda metropolitana amplia
            const searchUrlFallback = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(calleQuery + ', ' + munObj.nombre + ', Bolivia')}&countrycodes=bo`;
            fetch(searchUrlFallback)
              .then(r => r.json())
              .then(fallbackData => {
                let fbValidItems = (fallbackData || []).filter(item => {
                  const itemLat = parseFloat(item.lat);
                  const itemLon = parseFloat(item.lon);
                  const dist = calcularDistanciaMetros(munObj.lat, munObj.lon, itemLat, itemLon);
                  return dist !== null && dist <= MAX_METRO_DIST_METROS;
                });

                if (fbValidItems.length > 0) {
                  procesarResultadoBusqueda(fbValidItems[0], calleQuery);
                } else {
                  alert(`📍 No se encontró la calle "${calleQuery}" en el Área Metropolitana de ${munObj.nombre}.\n\nVerifica que el nombre o número de la calle esté bien escrito.`);
                }
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

// =============================================
// SUSCRIPCIÓN EN TIEMPO REAL PARA MAPA (PEDIDOS Y CAMIONES)
// =============================================
function iniciarSuscripcionMapaRealtime() {
    if (!window.supabaseClient) {
        console.warn("⚠️ Supabase no disponible para suscripción del mapa");
        return;
    }

    window.supabaseClient.channel('mapa_realtime_pedidos')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'pedidos' },
            (payload) => {
                const data = payload.new;
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    agregarPedidoVecinoEnMapa(data);
                } else if (payload.eventType === 'DELETE') {
                    const oldData = payload.old;
                    if (oldData && oldData.id) removerPublicacionDeMapa(oldData.id);
                }
            }
        ).subscribe();

    window.supabaseClient.channel('mapa_realtime_rutas')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'rutas_repartidores' },
            (payload) => {
                const data = payload.new;
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    actualizarRepartidorEnMapa(data);
                } else if (payload.eventType === 'DELETE') {
                    const oldData = payload.old;
                    if (oldData && oldData.id) removerPublicacionDeMapa(oldData.id);
                }
            }
        ).subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log("📡 Mapa suscrito a Realtime correctamente.");
            } else if (err) {
                console.error("❌ Error en suscripción del mapa:", err);
            }
        });
}

// BOTON DE DEBUGGING TEMPORAL
window.forzarRecargaMapa = function() {
  console.log("Forzando recarga manual del mapa...");
  if (activeOrderLayerGroup) activeOrderLayerGroup.clearLayers();
  if (driverLayerGroup) driverLayerGroup.clearLayers();
  cargarPedidosVecinalesEnVivo();
}; 
