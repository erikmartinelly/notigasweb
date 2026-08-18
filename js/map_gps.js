/* =====================================================
   NOTIGAS - MÓDULO DE GPS Y GEOLOCALIZACIÓN
   ===================================================== */

function esModoRepartidor() {
    try {
        return (
            AppState?.get('appMode') === 'driver' ||
            AppState?.get('userRole') === 'repartidor'
        );
    } catch (e) {
        return false;
    }
}

function detenerGPSComprador() {
    const watchId = window.activeGpsWatchId || (typeof activeGpsWatchId !== 'undefined' ? activeGpsWatchId : null);
    if (watchId !== null && navigator.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
        window.activeGpsWatchId = null;
        if (typeof activeGpsWatchId !== 'undefined') {
            try { activeGpsWatchId = null; } catch (_) {}
        }
    }
    if (typeof window.activeGpsIpInterval !== 'undefined' && window.activeGpsIpInterval !== null) {
        clearInterval(window.activeGpsIpInterval);
        window.activeGpsIpInterval = null;
    }
}

window.detenerGPSComprador = detenerGPSComprador;

function solicitarGeolocalizacionNativaNavegador(
    isMobile = false,
    forceReset = false
) {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('Geolocalización no soportada'));
            return;
        }

        const options = isMobile
            ? {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 10000
            }
            : {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            };

        navigator.geolocation.getCurrentPosition(
            position => {
                applyGpsPosition(
                    position.coords.latitude,
                    position.coords.longitude,
                    'Ubicación GPS del navegador',
                    forceReset,
                    true // isExact
                );
                resolve(position);
            },
            error => {
                console.log('GPS nativo no disponible; usando ubicación aproximada por IP:', error.message);
                reject(error);
            },
            options
        );
    });
}

async function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
    if (!forceReset) {
        try {
            const cached = sessionStorage.getItem('notigas_ip_geo_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) && (Date.now() - parsed.time < 30 * 60 * 1000)) {
                    return parsed;
                }
            }
        } catch (_) {}
    }

    const fetchIP = (source, url, parser) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2200);
        return fetch(url, { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status));
            })
            .then(data => ({ source, ...parser(data) }))
            .catch(err => {
                clearTimeout(timeoutId);
                throw err;
            });
    };

    const apis = [
        fetchIP('freeipapi', 'https://freeipapi.com/api/json', data => {
            if (data?.latitude != null && data?.longitude != null) {
                return { lat: Number(data.latitude), lng: Number(data.longitude), city: data.cityName, region: data.regionName, countryCode: data.countryCode };
            }
            throw new Error('no lat/lng');
        }),
        fetchIP('ipwhois', 'https://ipwho.is/', data => {
            if (data?.success && data?.latitude != null && data?.longitude != null) {
                return { lat: Number(data.latitude), lng: Number(data.longitude), city: data.city, region: data.region, countryCode: data.country_code };
            }
            throw new Error('no success');
        }),
        fetchIP('ipapi', 'https://ipapi.co/json/', data => {
            if (data?.latitude != null && data?.longitude != null) {
                return { lat: Number(data.latitude), lng: Number(data.longitude), city: data.city, region: data.region, countryCode: data.country_code };
            }
            throw new Error('no lat/lng');
        }),
        fetchIP('ipinfo', 'https://ipinfo.io/json', data => {
            if (data?.loc) {
                const parts = data.loc.split(',');
                return { lat: Number(parts[0]), lng: Number(parts[1]), city: data.city, region: data.region, countryCode: data.country };
            }
            throw new Error('no loc');
        })
    ];

    try {
        const results = await Promise.allSettled(apis);
        const validResults = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value)
            .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
            .filter(item => {
                const country = String(item.countryCode || '').toUpperCase();
                const inBolivia = item.lat >= -23.5 && item.lat <= -9.5 && item.lng >= -70 && item.lng <= -57;
                return inBolivia && (!country || country === 'BO');
            });

        if (validResults.length === 0) {
            throw new Error('Ningún proveedor devolvió una ubicación válida en Bolivia');
        }

        const median = values => {
            const sorted = [...values].sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        };
        const medianLat = median(validResults.map(item => item.lat));
        const medianLng = median(validResults.map(item => item.lng));
        const distanceToMedian = item => Math.hypot(item.lat - medianLat, item.lng - medianLng);
        const consensus = validResults.filter(item => distanceToMedian(item) <= 1.2);
        const sources = consensus.length > 0 ? consensus : validResults;
        const coords = {
            lat: median(sources.map(item => item.lat)),
            lng: median(sources.map(item => item.lng))
        };
        const metadata = sources.reduce((closest, item) => {
            return !closest || distanceToMedian(item) < distanceToMedian(closest) ? item : closest;
        }, null);
        coords.city = metadata?.city;
        coords.region = metadata?.region;
        coords.providers = sources.map(item => item.source);

        console.log('NOTIGAS ubicación IP por consenso:', coords);

        if (window.isGpsExact === true && Number.isFinite(window.currentGpsLat) && Number.isFinite(window.currentGpsLng)) {
            return {
                lat: window.currentGpsLat,
                lng: window.currentGpsLng,
                city: (typeof AppState !== 'undefined') ? AppState.get('city') : null,
                exact: true
            };
        }

        let detectedCity = 'cochabamba';
        if (typeof window.inferMainCityFromCoords === 'function') {
            detectedCity = window.inferMainCityFromCoords(coords.lat, coords.lng);
        }
        if (!detectedCity || detectedCity === 'fuera_de_cobertura') {
            if (typeof window.matchCityByNameOrRegion === 'function') {
                detectedCity = window.matchCityByNameOrRegion(coords.city, coords.region) || 'cochabamba';
            } else {
                detectedCity = 'cochabamba';
            }
        }

        const cityDefs = (typeof window.BOLIVIA_CITIES !== 'undefined') ? window.BOLIVIA_CITIES : null;
        const cityData = (cityDefs && cityDefs[detectedCity]) ? cityDefs[detectedCity] : { key: 'cochabamba', nombre: 'Cochabamba', lat: -17.3895, lon: -66.1568 };

        const finalLat = coords.lat;
        const finalLng = coords.lng;

        if (typeof window.applyGpsPosition === 'function') {
            window.applyGpsPosition(finalLat, finalLng, `Ubicación por IP (${cityData.nombre})`, forceReset, false);
        }

        if (typeof window.cambiarCiudad === 'function') {
            window.cambiarCiudad(detectedCity);
        } else if (typeof AppState !== 'undefined') {
            AppState.set('city', detectedCity);
        }

        const finalResult = { lat: finalLat, lng: finalLng, city: detectedCity, exact: false, providers: coords.providers, time: Date.now() };
        try { sessionStorage.setItem('notigas_ip_geo_cache', JSON.stringify(finalResult)); } catch(_) {}
        return finalResult;
    } catch(err) {
        if (window.isGpsExact === true && Number.isFinite(window.currentGpsLat) && Number.isFinite(window.currentGpsLng)) {
            return {
                lat: window.currentGpsLat,
                lng: window.currentGpsLng,
                city: (typeof AppState !== 'undefined') ? AppState.get('city') : null,
                exact: true
            };
        }
        console.log('Ubicación por IP no disponible; usando ciudad base Cochabamba:', err);
        const fallback = (typeof window.BOLIVIA_CITIES !== 'undefined' && window.BOLIVIA_CITIES['cochabamba'])
            ? window.BOLIVIA_CITIES['cochabamba']
            : { key: 'cochabamba', nombre: 'Cochabamba', lat: -17.3895, lon: -66.1568 };

        if (typeof window.applyGpsPosition === 'function') {
            window.applyGpsPosition(fallback.lat, fallback.lon || fallback.lng, 'Cochabamba (Ubicación Base)', forceReset, false);
        }

        if (typeof window.cambiarCiudad === 'function') {
            window.cambiarCiudad('cochabamba');
        } else if (typeof AppState !== 'undefined') {
            AppState.set('city', 'cochabamba');
        }

        return { lat: fallback.lat, lng: fallback.lon || fallback.lng, city: 'cochabamba', exact: false, fallback: true };
    }
}

function iniciarWatchGPSRepartidor() {
    if (
        !esModoRepartidor() ||
        !('geolocation' in navigator)
    ) {
        return;
    }

    detenerGPSComprador();

    let lastLat = null;
    let lastLng = null;
    let stationarySince = null;

    const oldWatchId = window.activeGpsWatchId || (typeof activeGpsWatchId !== 'undefined' ? activeGpsWatchId : null);
    if (oldWatchId !== null && navigator.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(oldWatchId);
    }

    const newWatchId = navigator.geolocation.watchPosition(
            position => {
                const lat =
                    position.coords.latitude;
                const lng =
                    position.coords.longitude;
                window.currentGpsLat = lat;
                window.currentGpsLng = lng;
                const now = Date.now();
                let moved = 0;

                if (
                    lastLat !== null &&
                    lastLng !== null &&
                    typeof calcularDistanciaMetros === 'function'
                ) {
                    moved =
                        calcularDistanciaMetros(
                            lastLat,
                            lastLng,
                            lat,
                            lng
                        ) || 0;
                }

                lastLat = lat;
                lastLng = lng;

                applyGpsPosition(
                    lat,
                    lng,
                    'GPS repartidor',
                    false,
                    true // isExact
                );

                const minMovement = (window.NOTIGAS && window.NOTIGAS.MIN_MOVEMENT_METERS) ? window.NOTIGAS.MIN_MOVEMENT_METERS : 30;
                if (moved >= minMovement) {
                    stationarySince = null;
                } else if (stationarySince === null) {
                    stationarySince = now;
                }

                if (typeof transmitirUbicacionRepartidorServidorDB === 'function') {
                    transmitirUbicacionRepartidorServidorDB(
                        lat,
                        lng
                    );
                }
            },
            error => {
                console.warn(
                    'GPS repartidor:',
                    error.message
                );
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 5000
            }
        );
    window.activeGpsWatchId = newWatchId;
}

function conectarGPSAuto(forceReset = false) {
    const isDriver = esModoRepartidor();

    // =====================================================
    // REPARTIDOR
    // =====================================================
    if (isDriver) {
        solicitarGeolocalizacionNativaNavegador(true, forceReset)
        .then(() => {
            iniciarWatchGPSRepartidor();
        })
        .catch(error => {
            console.warn('GPS nativo falló para repartidor. Intentando fallback por IP:', error);

            // Intenta localizar por IP
            obtenerUbicacionIPFallbackDesktop(forceReset).then(coords => {
                if (typeof showToast === 'function') {
                    showToast('📍 Ubicación IP Activa', 'Usando geolocalización por IP debido a la falta de GPS nativo.', 'info', 4000);
                }

                // Como la IP es estática, usamos setInterval para transmitirla periódicamente
                // y mantener al repartidor "en vivo" en la base de datos sin simular movimiento.
                if (window.activeGpsIpInterval) clearInterval(window.activeGpsIpInterval);
                window.activeGpsIpInterval = setInterval(() => {
                    if (typeof transmitirUbicacionRepartidorServidorDB === 'function') {
                        transmitirUbicacionRepartidorServidorDB(coords.lat, coords.lng);
                    }
                }, 10000); // Transmitir cada 10 segundos

            }).catch(ipError => {
                if (typeof showToast === 'function') {
                    showToast('❌ Error de Ubicación', 'No pudimos obtener ubicación ni por GPS ni por IP.', 'error', 4000);
                }
            });
        });
        return;
    }

    // =====================================================
    // COMPRADOR
    // =====================================================
    detenerGPSComprador();

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isMobile) {
        // En PC: estimación IP por consenso y refinamiento nativo en paralelo.
        obtenerUbicacionIPFallbackDesktop(forceReset).then(result => {
            if (!result.exact && typeof showToast === 'function') {
                showToast('Ubicación aproximada', 'Ajusta o arrastra el marcador hasta la puerta exacta de tu domicilio.', 'info', 4000);
            }
        });
        solicitarGeolocalizacionNativaNavegador(false, false).catch(() => {});
        return;
    }

    // EN ANDROID: Mostrar aviso de activación obligatoria si aún no hay GPS exacto
    if (isAndroid && !window.isGpsExact) {
        const floatingBanner = document.getElementById('gpsFloatingBanner');
        if (floatingBanner) floatingBanner.style.display = 'block';
    }

    solicitarGeolocalizacionNativaNavegador(
        isMobile,
        forceReset
    )
    .then(() => {
        const floatingBanner = document.getElementById('gpsFloatingBanner');
        if (floatingBanner) floatingBanner.style.display = 'none';
        const mandatoryBanner = document.getElementById('gpsMandatoryBanner');
        if (mandatoryBanner) mandatoryBanner.style.display = 'none';

        if (typeof showToast === 'function') {
            showToast(
                '📍 GPS Conectado',
                'Ubicación detectada con éxito en tu dispositivo.',
                'success',
                3500
            );
        }
    })
    .catch((err) => {
        console.warn('Fallo de GPS en móvil:', err);
        if (isAndroid) {
            const floatingBanner = document.getElementById('gpsFloatingBanner');
            if (floatingBanner) floatingBanner.style.display = 'block';
            if (typeof showToast === 'function') {
                showToast(
                    '⚠️ GPS Requerido',
                    'Por favor enciende el GPS de tu celular Android y permite el acceso para continuar.',
                    'warning',
                    5000
                );
            }
        }
        obtenerUbicacionIPFallbackDesktop(forceReset);
    });
}

function verificarGpsAndroidObligatorio() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid && !window.isGpsExact) {
        const floatingBanner = document.getElementById('gpsFloatingBanner');
        if (floatingBanner) floatingBanner.style.display = 'block';
    }
}

// Comprobar automáticamente al iniciar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(verificarGpsAndroidObligatorio, 1200);
    });
} else {
    setTimeout(verificarGpsAndroidObligatorio, 1200);
}

// ==========================================
// EXPOSICIÓN GLOBAL EN WINDOW
// ==========================================
window.conectarGPSAuto = conectarGPSAuto;
window.verificarGpsAndroidObligatorio = verificarGpsAndroidObligatorio;
window.detenerGPSComprador = detenerGPSComprador;
window.iniciarWatchGPSRepartidor = iniciarWatchGPSRepartidor;
window.obtenerUbicacionIPFallbackDesktop = obtenerUbicacionIPFallbackDesktop;
window.solicitarGeolocalizacionNativaNavegador = solicitarGeolocalizacionNativaNavegador;
window.esModoRepartidor = esModoRepartidor;
