/* =====================================================
   NOTIGAS - MÓDULO DE BÚSQUEDA DE CALLES (DESACOPLADO DE MAP.JS)
   ===================================================== */

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

  const MAX_METRO_DIST_METROS = 50000;

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
      let validItems = (Array.isArray(data) ? data : []).filter(item => {
        const itemLat = parseFloat(item.lat);
        const itemLon = parseFloat(item.lon);
        const dist = calcularDistanciaMetros(munObj.lat, munObj.lon, itemLat, itemLon);
        return dist !== null && dist <= MAX_METRO_DIST_METROS;
      });

      if (validItems.length > 0) {
        procesarResultadoBusqueda(validItems[0], calleQuery);
      } else {
        // 2º Motor: Photon (Komoot High-Performance Geocoder)
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

                window.currentGpsLat = pLat;
                window.currentGpsLng = pLon;
                if (typeof AppState !== 'undefined') {
                  AppState.set('gpsLat', pLat);
                  AppState.set('gpsLng', pLon);
                }

                const mapCandidates = [
                  window.notigasMap,
                  window.map,
                  (typeof map !== 'undefined' ? map : null)
                ];
                const m = mapCandidates.find(candidate =>
                  candidate &&
                  typeof candidate.flyTo === 'function' &&
                  typeof candidate.getZoom === 'function'
                );
                if (m) {
                  m.flyTo([pLat, pLon], 17, { duration: 1.0 });
                }

                if (typeof window.applyGpsPosition === 'function') {
                  window.applyGpsPosition(pLat, pLon, '', false);
                } else if (typeof applyGpsPosition === 'function') {
                  applyGpsPosition(pLat, pLon, '', false);
                }
                return;
              }
            }

            // 3º Fallback: Búsqueda metropolitana amplia
            const searchUrlFallback = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(calleQuery + ', ' + munObj.nombre + ', Bolivia')}&countrycodes=bo`;
            fetch(searchUrlFallback)
              .then(r => r.json())
              .then(fallbackData => {
                let fbValidItems = (Array.isArray(fallbackData) ? fallbackData : []).filter(item => {
                  const itemLat = parseFloat(item.lat);
                  const itemLon = parseFloat(item.lon);
                  const dist = (typeof window.calcularDistanciaMetros === 'function') 
                    ? window.calcularDistanciaMetros(munObj.lat, munObj.lon, itemLat, itemLon)
                    : ((typeof calcularDistanciaMetros === 'function') ? calcularDistanciaMetros(munObj.lat, munObj.lon, itemLat, itemLon) : null);
                  return dist !== null && dist <= MAX_METRO_DIST_METROS;
                });

                if (fbValidItems.length > 0) {
                  if (typeof window.procesarResultadoBusqueda === 'function') {
                    window.procesarResultadoBusqueda(fbValidItems[0], calleQuery);
                  } else if (typeof procesarResultadoBusqueda === 'function') {
                    procesarResultadoBusqueda(fbValidItems[0], calleQuery);
                  }
                } else {
                  if(typeof showToast === 'function') {
                    showToast('Calle no encontrada', `No se encontró la calle "${calleQuery}" en ${munObj.nombre}.`, 'warning', 4000);
                  }
                }
              }).catch(e => {
                console.error("Error en geocoding Fallback:", e);
              });
          }).catch(e => {
            console.error("Error en geocoding Photon:", e);
          });
      }
    }).catch(e => {
      console.error("Error en geocoding Nominatim:", e);
      if (typeof showToast === 'function') {
         showToast('Búsqueda no disponible', 'No se pudo contactar el servicio de búsqueda de calles.', 'warning', 3000);
      }
    });
}

window.buscarCalle = buscarCalle;
