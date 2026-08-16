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
    if (
        typeof activeGpsWatchId !== 'undefined' &&
        activeGpsWatchId !== null &&
        navigator.geolocation?.clearWatch
    ) {
        navigator.geolocation.clearWatch(activeGpsWatchId);
        activeGpsWatchId = null;
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
                enableHighAccuracy: false,
                timeout: 3500, // Timeout corto en PC para evitar congelamientos
                maximumAge: 30000
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
                console.warn('GPS nativo falló o tardó demasiado:', error.message);
                reject(error);
            },
            options
        );
    });
}

async function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
    const fetchIP = (url, parser) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        return fetch(url, { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status));
            })
            .then(parser)
            .catch(err => {
                clearTimeout(timeoutId);
                throw err;
            });
    };

    const apis = [
        fetchIP('https://ipapi.co/json/', data => {
            if (data?.latitude != null && data?.longitude != null) {
                return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude), city: data.city, region: data.region };
            }
            throw new Error('no lat/lng');
        }),
        fetchIP('https://ipinfo.io/json', data => {
            if (data?.loc) {
                const parts = data.loc.split(',');
                return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]), city: data.city, region: data.region };
            }
            throw new Error('no loc');
        }),
        fetchIP('https://freeipapi.com/api/json', data => {
            if (data?.latitude != null && data?.longitude != null) {
                return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude), city: data.cityName, region: data.regionName };
            }
            throw new Error('no lat/lng');
        }),
        fetchIP('https://ipwho.is/', data => {
            if (data?.success && data?.latitude != null && data?.longitude != null) {
                return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude), city: data.city, region: data.region };
            }
            throw new Error('no success');
        })
    ];

    try {
        const coords = await Promise.any(apis);
        console.log('📍 NOTIGAS IP Geolocation detectada:', coords);

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

        // Si la IP está dentro de los límites generales de Bolivia, usar coords IP; sino usar las de la capital detectada
        const inBolivia = (coords.lat >= -23.5 && coords.lat <= -9.5 && coords.lng >= -70.0 && coords.lng <= -57.0);
        const finalLat = inBolivia ? coords.lat : cityData.lat;
        const finalLng = inBolivia ? coords.lng : (cityData.lon || cityData.lng);

        if (typeof window.applyGpsPosition === 'function') {
            window.applyGpsPosition(finalLat, finalLng, `Ubicación por IP (${cityData.nombre})`, forceReset, false);
        }

        if (typeof window.cambiarCiudad === 'function') {
            window.cambiarCiudad(detectedCity);
        } else if (typeof AppState !== 'undefined') {
            AppState.set('city', detectedCity);
        }

        return { lat: finalLat, lng: finalLng, city: detectedCity };
    } catch(err) {
        console.warn('⚠️ Fallback a ciudad predeterminada (Cochabamba):', err);
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

        return { lat: fallback.lat, lng: fallback.lon || fallback.lng, city: 'cochabamba' };
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

    if (typeof activeGpsWatchId !== 'undefined' && activeGpsWatchId !== null) {
        navigator.geolocation.clearWatch(
            activeGpsWatchId
        );
    }

    activeGpsWatchId =
        navigator.geolocation.watchPosition(
            position => {
                const lat =
                    position.coords.latitude;
                const lng =
                    position.coords.longitude;
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

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isMobile) {
        // En PC: fijar ubicación por IP de inmediato para que la app cargue en 0ms sin colgarse
        obtenerUbicacionIPFallbackDesktop(forceReset);
        // Intentar refinar con GPS nativo en segundo plano sin bloquear
        solicitarGeolocalizacionNativaNavegador(false, false).catch(() => {});
        return;
    }

    solicitarGeolocalizacionNativaNavegador(
        isMobile,
        forceReset
    )
    .then(() => {
        if (typeof showToast === 'function') {
            showToast(
                '📍 Ubicación guardada',
                'Ubicación detectada con éxito.',
                'success',
                4000
            );
        }
    })
    .catch(() => {
        obtenerUbicacionIPFallbackDesktop(forceReset);
    });
}

// ==========================================
// EXPOSICIÓN GLOBAL EN WINDOW
// ==========================================
window.conectarGPSAuto = conectarGPSAuto;
window.detenerGPSComprador = detenerGPSComprador;
window.iniciarWatchGPSRepartidor = iniciarWatchGPSRepartidor;
window.obtenerUbicacionIPFallbackDesktop = obtenerUbicacionIPFallbackDesktop;
window.solicitarGeolocalizacionNativaNavegador = solicitarGeolocalizacionNativaNavegador;
window.esModoRepartidor = esModoRepartidor;

