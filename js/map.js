/* ==========================================================================
   NOTIGAS - MÓDULO DE MAPA LEAFLET & HARDWARE GPS AUTOMÁTICO
   ========================================================================== */

let map, userMarker, truckMarker;
let tileLayers = {};
let currentTileLayer = null;

document.addEventListener('DOMContentLoaded', () => {
  try {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Inicialización del Mapa Leaflet en Cochabamba
    map = L.map('map', { zoomControl: false }).setView([-17.3935, -66.1570], 15);

    tileLayers = {
      googleStatic: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 19 }),
      googleSatelite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 19 })
    };

    currentTileLayer = tileLayers.googleStatic;
    currentTileLayer.addTo(map);

    const truckIcon = L.divIcon({
      html: '<div style="font-size:28px; color:#FF6D00; background:#1E293B; border-radius:50%; padding:6px; border:2px solid #FF6D00; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><i class="fa-solid fa-truck-fast"></i></div>',
      className: 'custom-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    /* ICONO DE MAPA DE PEDIDO: EXCLUSIVO SILUETA SVG DE GARRAFA GLP */
    const userIcon = L.divIcon({
      html: '<div style="font-size:24px; color:white; background:#E65100; border-radius:50%; padding:6px; border:2px solid white; box-shadow:0 0 14px #FF6D00; cursor:move; display:flex; align-items:center; justify-content:center;"><svg style="width:22px; height:22px; fill:white; display:block;" viewBox="0 0 24 24"><path d="M9 2h6v2H9V2zm8 4H7v3h10V6zm1 4H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM12 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg></div>',
      className: 'custom-icon',
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    truckMarker = L.marker([-17.3910, -66.1550], { icon: truckIcon }).addTo(map).bindPopup('<b>Camión GLP N° 42</b><br>En Ruta en tu OTB');
    
    userMarker = L.marker([-17.3935, -66.1570], { icon: userIcon, draggable: true }).addTo(map);
    userMarker.bindPopup('<b>Tu Punto de Pedido (Garrafa GLP)</b><br><small>Arrastra este icono o usa la lupa 🔍 para ubicar tu dirección exacta.</small>').openPopup();

    userMarker.on('dragend', function (e) {
      const coord = e.target.getLatLng();
      userMarker.setPopupContent(`<b>Punto de Pedido Ajustado</b><br><small>Lat: ${coord.lat.toFixed(5)}, Lng: ${coord.lng.toFixed(5)}</small>`).openPopup();
    });

    map.on('click', function(e) {
      userMarker.setLatLng(e.latlng);
      userMarker.setPopupContent(`<b>Punto de Pedido Ajustado por Clic</b><br><small>Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}</small>`).openPopup();
    });

    // Conexión automática al GPS Hardware del dispositivo
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (userMarker) userMarker.setLatLng([lat, lng]);
        if (map) map.setView([lat, lng], 16);
        if (userMarker) userMarker.setPopupContent(`<b>Conectado por GPS Hardware</b><br><small>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</small>`).openPopup();
      }, (err) => console.log('GPS en espera de interacción del usuario.'));
    }

    // Listener del botón GPS manual en header
    const btnGps = document.getElementById('btnGps');
    if (btnGps) {
      btnGps.addEventListener('click', () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (userMarker) userMarker.setLatLng([lat, lng]);
            if (map) map.setView([lat, lng], 16);
            if (userMarker) userMarker.setPopupContent(`<b>Punto de Pedido por GPS Hardware</b><br><small>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</small>`).openPopup();
          }, () => alert('Permiso de GPS no concedido.'));
        }
      });
    }
  } catch (err) {
    console.error("Error al inicializar el mapa:", err);
  }
});

function setMapStyle(btnElement, styleKey) {
  if (!map || !tileLayers[styleKey]) return;
  map.removeLayer(currentTileLayer);
  currentTileLayer = tileLayers[styleKey];
  currentTileLayer.addTo(map);

  document.querySelectorAll('.map-style-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
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
        const displayName = data[0].display_name;

        if (map) map.flyTo([lat, lon], 17);
        if (userMarker) {
          userMarker.setLatLng([lat, lon]);
          userMarker.setPopupContent(`<b>📍 Calle Encontrada</b><br><small>${displayName}</small>`).openPopup();
        }
      } else {
        alert('Calle o zona no encontrada. Intenta especificar la ciudad (ej: Av Heroinas Cochabamba).');
      }
    })
    .catch(() => alert('Error de red al buscar la calle.'));
}
