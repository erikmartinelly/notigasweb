/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA EN VIVO, GPS AUTO Y SILUETA SVG DE GARRAFA GLP
   ========================================================================== */

let map, userMarker, truckMarker;
let mapTileLayers = {};

// SVG Oficial de Garrafa de Gas GLP (Propano) Naranja Fuego
const garrafaSvgHtml = `
  <div style="background-color: #FF6D00; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 0 15px rgba(255,109,0,0.8); cursor: pointer;">
    <svg style="width: 22px; height: 22px; fill: #FFFFFF;" viewBox="0 0 24 24">
      <path d="M9 2h6v2H9V2zm8 4H7v3h10V6zm1 4H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM12 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
    </svg>
  </div>
`;

const garrafaIcon = L.divIcon({
  className: 'garrafa-map-marker',
  html: garrafaSvgHtml,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20]
});

const truckIcon = L.divIcon({
  className: 'truck-map-marker',
  html: `
    <div style="background-color: #0288D1; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 0 12px rgba(2,136,209,0.8);">
      <i class="fa-solid fa-truck-fast" style="color: white; font-size: 16px;"></i>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

document.addEventListener('DOMContentLoaded', () => {
  initNotigasMap();
});

function initNotigasMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  // Coordenadas por defecto (Cochabamba, Bolivia)
  const defaultLat = -17.3895;
  const defaultLng = -66.1568;

  map = L.map('map', {
    center: [defaultLat, defaultLng],
    zoom: 16,
    zoomControl: false
  });

  // Capas de mapas HD (Google Static / Satélite HD)
  mapTileLayers['googleStatic'] = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps HD'
  });

  mapTileLayers['googleSatelite'] = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Satélite HD'
  });

  mapTileLayers['googleStatic'].addTo(map);

  // Marcador interactivo del Cliente / Garrafa GLP
  userMarker = L.marker([defaultLat, defaultLng], {
    icon: garrafaIcon,
    draggable: true
  }).addTo(map);

  userMarker.bindPopup(`<b>🔥 Ubicación de Entrega (Garrafa GLP)</b><br>Arrastra el pin a tu puerta exacta.`).openPopup();

  // Marcador en movimiento del Camión Garrafero / Repartidor
  truckMarker = L.marker([defaultLat + 0.0015, defaultLng + 0.0015], {
    icon: truckIcon
  }).addTo(map);

  truckMarker.bindPopup(`<b>🟢 Repartidor en Ruta (Camión N° 42)</b><br>Atendiendo la zona de tu OTB.`);

  // Evento de clic en mapa para posicionar marcador de entrega
  map.on('click', (e) => {
    userMarker.setLatLng(e.latlng);
  });

  // Botón GPS Auto
  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', conectarGPSAuto);
  }

  // Conexión GPS hardware automática de inicio
  conectarGPSAuto();
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

function conectarGPSAuto() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (map && userMarker) {
          map.setView([lat, lng], 17);
          userMarker.setLatLng([lat, lng]);
          userMarker.getPopup().setContent(`<b>📍 Ubicación GPS Verificada</b><br>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`).openPopup();
        }
      },
      (err) => {
        console.warn("GPS Hardware inaccesible, usando coordenadas locales por defecto:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
}

function buscarCalle() {
  const input = document.getElementById('inputSearchStreet');
  if (!input) return;

  const query = input.value.trim();
  if (!query) return;

  // Búsqueda Nominatim OpenStreetMap
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
