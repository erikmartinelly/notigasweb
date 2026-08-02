/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA EN VIVO, POSICIONAMIENTO GPS OBLIGATORIO Y ANIMACIONES
   ========================================================================== */

let map, userMarker, truckMarker;
let mapTileLayers = {};
let routeIndex = 0;
let animationTimer = null;
let currentGpsLat = -17.3895;
let currentGpsLng = -66.1568;

// SVG OFICIAL EN ALTA DEFINICIÓN - GARRAFA GLP PROBADA (NARANJA FUEGO CON GLOW 3D)
const garrafaSvgMarkerHtml = `
  <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
    <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,109,0,0.35); animation: pulseGlow 1.8s infinite ease-in-out;"></div>
    <div style="position: relative; background: linear-gradient(135deg, #FF6D00, #E65100); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 15px rgba(255,109,0,0.8); cursor: pointer;">
      <svg style="width: 22px; height: 22px; fill: #FFFFFF;" viewBox="0 0 24 24">
        <path d="M9 2h6v2H9V2zm8 4H7v3h10V6zm1 4H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM12 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
      </svg>
    </div>
  </div>
`;

// SVG E ICONO DE ALTA DEFINICIÓN DEL CAMIÓN GARRAFERO EN MOVIMIENTO EN VIVO
const truckSvgMarkerHtml = `
  <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
    <div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(2,136,209,0.3); animation: radarPing 2s infinite ease-out;"></div>
    <div style="position: relative; background: linear-gradient(135deg, #1E293B, #0F172A); width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FF6D00; box-shadow: 0 4px 18px rgba(0,0,0,0.6); cursor: pointer;">
      <i class="fa-solid fa-truck-fast" style="color: #FF6D00; font-size: 18px;"></i>
      <span style="position: absolute; top: -3px; right: -3px; background: #00E676; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #1E293B;" title="En ruta activa"></span>
    </div>
  </div>
`;

const garrafaIcon = L.divIcon({
  className: 'garrafa-map-marker',
  html: garrafaSvgMarkerHtml,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22]
});

const truckIcon = L.divIcon({
  className: 'truck-map-marker',
  html: truckSvgMarkerHtml,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24]
});

document.addEventListener('DOMContentLoaded', () => {
  initNotigasMap();
});

function initNotigasMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  // INICIALIZAR MAPA EN COORDENADAS BASE
  map = L.map('map', {
    center: [currentGpsLat, currentGpsLng],
    zoom: 16,
    zoomControl: false
  });

  // CAPAS HD GOOGLE MAPS E INTEGRACIÓN ESTÁTICA/SATÉLITE
  mapTileLayers['googleStatic'] = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '&copy; Google Maps HD'
  });

  mapTileLayers['googleSatelite'] = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '&copy; Google Satélite HD'
  });

  const savedStyle = localStorage.getItem('notigas_pref_map_style') || 'googleStatic';
  if (mapTileLayers[savedStyle]) {
    mapTileLayers[savedStyle].addTo(map);
  } else {
    mapTileLayers['googleStatic'].addTo(map);
  }

  // MARCADOR DEL CLIENTE/USUARIO CON ICONO DE GARRAFA GLP
  userMarker = L.marker([currentGpsLat, currentGpsLng], {
    icon: garrafaIcon,
    draggable: true
  }).addTo(map);

  userMarker.bindPopup(`
    <div style="font-size: 12px; font-weight: 700; color: #FF6D00;">
      🔥 Tu Ubicación de Entrega (Punto GPS)
    </div>
    <div style="font-size: 10px; color: #94A3B8; margin-top: 2px;">
      Buscando posición GPS exacta...
    </div>
  `).openPopup();

  // MARCADOR DEL CAMIÓN DE REPARTO EN VIVO
  truckMarker = L.marker([currentGpsLat + 0.0012, currentGpsLng + 0.0015], {
    icon: truckIcon
  }).addTo(map);

  truckMarker.bindPopup(`
    <div style="font-size: 12px; font-weight: 700; color: #00E676;">
      🟢 Repartidor de Gas GLP N° 42 (En Ruta)
    </div>
    <div style="font-size: 10px; color: #CBD5E1; margin-top: 2px;">
      Transmitiendo ubicación en vivo • OTB Central
    </div>
  `);

  map.on('click', (e) => {
    userMarker.setLatLng(e.latlng);
  });

  // SOLICITAR E INICIAR POSICIONAMIENTO GPS OBLIGATORIO AUTOMÁTICO AL CARGAR
  conectarGPSAuto();

  // INICIAR ANIMACIÓN CONTINUA DE MOVIMIENTO DEL CAMIÓN DE REPARTO
  iniciarMovimientoRepartidor();

  // CONECTAR BOTÓN GPS
  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', conectarGPSAuto);
  }
}

/* POSICIONAMIENTO GPS AUTOMÁTICO EN VIVO AL ABRIR LA APLICACIÓN */
function conectarGPSAuto() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentGpsLat = pos.coords.latitude;
        currentGpsLng = pos.coords.longitude;

        if (map && userMarker) {
          map.setView([currentGpsLat, currentGpsLng], 17);
          userMarker.setLatLng([currentGpsLat, currentGpsLng]);

          userMarker.getPopup().setContent(`
            <div style="font-size: 12px; font-weight: 700; color: #FF6D00;">
              📍 Tu Ubicación GPS Sincronizada en Vivo
            </div>
            <div style="font-size: 10px; color: #94A3B8;">
              Lat: ${currentGpsLat.toFixed(5)}, Lng: ${currentGpsLng.toFixed(5)}
            </div>
          `).openPopup();
        }

        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'none';
      },
      (err) => {
        console.warn("GPS Hardware no otorgado aún:", err.message);
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'block';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // RASTREO CONTINUO EN SEGUNDO PLANO VÍA WATCHPOSITION
    navigator.geolocation.watchPosition(
      (pos) => {
        currentGpsLat = pos.coords.latitude;
        currentGpsLng = pos.coords.longitude;
        if (userMarker) {
          userMarker.setLatLng([currentGpsLat, currentGpsLng]);
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }
}

/* ANIMACIÓN DE MOVIMIENTO REALISTA DEL REPARTIDOR */
function iniciarMovimientoRepartidor() {
  if (animationTimer) clearInterval(animationTimer);

  let step = 0;
  const totalSteps = 60;

  animationTimer = setInterval(() => {
    if (!truckMarker) return;

    // Crear waypoints dinámicos basados en la posición GPS actual
    const waypoints = [
      [currentGpsLat + 0.0010, currentGpsLng + 0.0012],
      [currentGpsLat + 0.0005, currentGpsLng + 0.0018],
      [currentGpsLat - 0.0005, currentGpsLng + 0.0015],
      [currentGpsLat - 0.0010, currentGpsLng + 0.0005],
      [currentGpsLat - 0.0008, currentGpsLng - 0.0008],
      [currentGpsLat + 0.0002, currentGpsLng - 0.0012],
      [currentGpsLat + 0.0012, currentGpsLng - 0.0005]
    ];

    let targetIndex = (routeIndex + 1) % waypoints.length;
    const startPos = waypoints[routeIndex];
    const endPos = waypoints[targetIndex];

    step++;
    const lat = startPos[0] + (endPos[0] - startPos[0]) * (step / totalSteps);
    const lng = startPos[1] + (endPos[1] - startPos[1]) * (step / totalSteps);

    truckMarker.setLatLng([lat, lng]);

    if (step >= totalSteps) {
      step = 0;
      routeIndex = targetIndex;
    }
  }, 100);
}

function setMapStyle(btnElem, styleKey) {
  document.querySelectorAll('.map-style-btn').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  Object.keys(mapTileLayers).forEach(k => {
    if (map.hasLayer(mapTileLayers[k])) map.removeLayer(mapTileLayers[k]);
  });

  if (mapTileLayers[styleKey]) {
    mapTileLayers[styleKey].addTo(map);
  }
}

function buscarCalle() {
  const input = document.getElementById('inputSearchStreet');
  if (!input) return;

  const query = input.value.trim();
  if (!query) return;

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Bolivia')}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 17);
        userMarker.setLatLng([lat, lon]);
        userMarker.getPopup().setContent(`<b>🔍 Ubicación Encontrada:</b><br>${data[0].display_name}`).openPopup();
      } else {
        alert('No se encontraron resultados para la búsqueda.');
      }
    })
    .catch(err => {
      console.error("Error al buscar calle:", err);
      alert("Error al conectar con el servicio de mapas.");
    });
}
