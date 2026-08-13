/* =====================================================
   NOTIGAS - MÓDULO DE GPS Y GEOLOCALIZACIÓN
   (Maneja GPS nativo del navegador, Android y fallback a IP)
   ===================================================== */

function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
  console.log("📍 Resolviendo ubicación por red (el más rápido gana)...");

  const fetchIP = (url, parser) => fetch(url)
    .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
    .then(parser)
    .catch(e => Promise.reject(e));

  const apis = [
    fetchIP('https://ipinfo.io/json', d => (d && d.loc) ? { lat: parseFloat(d.loc.split(',')[0]), lng: parseFloat(d.loc.split(',')[1]) } : Promise.reject(new Error("No loc"))),
    fetchIP('https://freeipapi.com/api/json', d => (d && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject(new Error("No coords"))),
    fetchIP('https://ipwho.is/', d => (d && d.success && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject(new Error("No success"))),
    fetchIP('https://ipapi.co/json/', d => (d && d.latitude && d.longitude) ? { lat: d.latitude, lng: d.longitude } : Promise.reject(new Error("No coords"))),
    fetchIP('https://get.geojs.io/v1/ip/geo.json', d => (d && d.latitude && d.longitude) ? { lat: parseFloat(d.latitude), lng: parseFloat(d.longitude) } : Promise.reject(new Error("No coords")))
  ];

  return Promise.any(apis)
    .then(coords => {
      applyGpsPosition(coords.lat, coords.lng, "Ubicación Georeferenciada por Red", forceReset);
      console.log("📍 Ubicación resuelta por Red/IP:", coords.lat, coords.lng);
      return coords;
    })
    .catch((e) => {
      console.warn("⚠️ Todas las APIs IP bloqueadas o fallaron.", e);
      if (typeof showToast === 'function') {
         showToast('📍 Modo Manual Activo', 'Tu PC o red bloqueó el GPS automático. Por favor, mueve el mapa manualmente.', 'warning', 6000);
      }
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
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            applyGpsPosition(pos2.coords.latitude, pos2.coords.longitude, "Ubicación GPS (Respaldo)", forceReset);
            resolve(pos2);
          },
          (err2) => reject(err2),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
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
  const banner = document.getElementById('gpsMandatoryBanner');
  if (banner) banner.style.display = 'none';
  const card = document.getElementById('gpsFloatingBanner');
  if (card) card.style.display = 'none';

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let gpsResolved = false;

  if (isMobile) {
    // 1. Teléfono Celular: GPS Nativo Obligatorio
    solicitarGeolocalizacionNativaNavegador(true, forceReset)
      .then(() => {
        gpsResolved = true;
        if (banner) banner.style.display = 'none';
        if (card) card.style.display = 'none';
      })
      .catch((err) => {
        console.warn("⚠️ GPS Celular denegado o apagado:", err.message);
        if (banner) banner.style.display = 'block';
        if (card) card.style.display = 'block';
        if (typeof showToast === 'function') {
          showToast('⚠️ Activa tu GPS', 'Es obligatorio habilitar y permitir el GPS en tu celular para usar la app.', 'error', 6000);
        }
      });
  } else {
    // 2. PC Windows/Desktop: Ubicación por IP Inmediata y Obligatoria
    gpsResolved = true;
    obtenerUbicacionIPFallbackDesktop(forceReset);
  }

  // 3. Activar watchPosition continuo (útil principalmente en móviles)
  if (isMobile && "geolocation" in navigator) {
    try {
      if (activeGpsWatchId !== null && navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch(activeGpsWatchId);
      }
      activeGpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          applyGpsPosition(pos.coords.latitude, pos.coords.longitude, "Ubicación GPS en Vivo", false);
          if (banner) banner.style.display = 'none';
          if (card) card.style.display = 'none';
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
