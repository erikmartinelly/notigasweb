/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA EN VIVO, MOVIMIENTO REALISTA Y CONEXIÓN GPS HD
   ========================================================================== */

let map, userMarker, truckMarker, truckMarker2;
let mapTileLayers = {};
let routeIndex = 0;
let animationTimer = null;

// RUTA VIAL ANIMADA EN VIVO ALREDEDOR DE LA OTB (WAYPOINTS REALISTAS)
const animatedRouteWaypoints = [
  [-17.3895, -66.1568],
  [-17.3898, -66.1558],
  [-17.3905, -66.1552],
  [-17.3912, -66.1555],
  [-17.3918, -66.1565],
  [-17.3915, -66.1578],
  [-17.3905, -66.1582],
  [-17.3898, -66.1575]
];

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

  const defaultLat = -17.3895;
  const defaultLng = -66.1568;

  map = L.map('map', {
    center: [defaultLat, defaultLng],
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

  mapTileLayers['googleStatic'].addTo(map);

  // MARCADOR INTERACTIVO DEL CLIENTE CON SILUETA SVG DE GARRAFA GLP
  userMarker = L.marker([defaultLat, defaultLng], {
    icon: garrafaIcon,
    draggable: true
  }).addTo(map);

  userMarker.bindPopup(`
    <div style="font-size: 12px; font-weight: 700; color: #FF6D00;">
      🔥 Ubicación de Entrega GLP (Punto Interactivo)
    </div>
    <div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">
      Arrastra el marcador exacto a la puerta de tu domicilio.
    </div>
  `).openPopup();

  // MARCADOR DINÁMICO DEL CAMIÓN REPARTIDOR EN MOVIMIENTO REALISTA
  truckMarker = L.marker(animatedRouteWaypoints[0], {
    icon: truckIcon
  }).addTo(map);

  truckMarker.bindPopup(`
    <div style="font-size: 12px; font-weight: 700; color: #00E676;">
      🟢 Repartidor de Gas GLP N° 42 (En Ruta)
    </div>
    <div style="font-size: 10px; color: #CBD5E1; margin-top: 2px;">
      Velocidad: 25 km/h • Cobertura activa OTB Central
    </div>
  `);

  // CLICK EN EL MAPA PARA RE-POSICIONAR PIN DE CLIENTE
  map.on('click', (e) => {
    userMarker.setLatLng(e.latlng);
  });

  // INICIAR MOVIMIENTO FLUIDO Y CONTINUO DEL REPARTIDOR POR LA OTB
  iniciarMovimientoRepartidor();

  // CONECTAR BOTÓN GPS Y INICIAR RASTREO
  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', conectarGPSAuto);
  }

  conectarGPSAuto();
}

/* MOVIMIENTO FLUIDO Y CONTINUO DEL REPARTIDOR A TRAVÉS DE WAYPOINTS */
function iniciarMovimientoRepartidor() {
  if (animationTimer) clearInterval(animationTimer);

  let targetIndex = 1;
  let step = 0;
  const totalSteps = 60; // Suavidad de interpolación entre puntos

  animationTimer = setInterval(() => {
    if (!truckMarker) return;

    const startPos = animatedRouteWaypoints[routeIndex];
    const endPos = animatedRouteWaypoints[targetIndex];

    step++;
    const currentLat = startPos[0] + (endPos[0] - startPos[0]) * (step / totalSteps);
    const currentLng = startPos[1] + (endPos[1] - startPos[1]) * (step / totalSteps);

    truckMarker.setLatLng([currentLat, currentLng]);

    if (step >= totalSteps) {
      step = 0;
      routeIndex = targetIndex;
      targetIndex = (targetIndex + 1) % animatedRouteWaypoints.length;
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

/* CONEXIÓN CON GPS EN VIVO Y SINCRONIZACIÓN DE COORDENADAS */
function conectarGPSAuto() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (map && userMarker) {
          map.setView([lat, lng], 17);
          userMarker.setLatLng([lat, lng]);
          userMarker.getPopup().setContent(`
            <div style="font-size: 12px; font-weight: 700; color: #FF6D00;">
              📍 Ubicación GPS Sincronizada en Vivo
            </div>
            <div style="font-size: 10px; color: #94A3B8;">
              Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}
            </div>
          `).openPopup();
        }
      },
      (err) => {
        console.warn("GPS Hardware inaccesible, usando coordenadas locales por defecto:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Rastreo en tiempo real mediante watchPosition
    navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
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
