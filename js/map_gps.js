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
    }

    if (typeof activeGpsWatchId !== 'undefined') {
        activeGpsWatchId = null;
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
                timeout: 15000,
                maximumAge: 10000
            }
            : {
                enableHighAccuracy: false,
                timeout: (window.NOTIGAS && window.NOTIGAS.GPS_TIMEOUT_MS) ? window.NOTIGAS.GPS_TIMEOUT_MS : 12000,
                maximumAge: 5000
            };

        console.log(`
NOTIGAS GEOLOCATION -------------------
Secure Context: ${window.isSecureContext ? 'YES' : 'NO'}
Native GPS: Attempting...`);

        navigator.geolocation.getCurrentPosition(
            position => {
                console.log(`
NOTIGAS GEOLOCATION -------------------
Secure Context: ${window.isSecureContext ? 'YES' : 'NO'}
Native GPS: SUCCESS
Accuracy: EXACT (${position.coords.accuracy}m)`);
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
                console.log(`
NOTIGAS GEOLOCATION -------------------
Secure Context: ${window.isSecureContext ? 'YES' : 'NO'}
Native GPS: FAILED
Error code: ${error.code}
Error message: ${error.message}`);
                console.warn(
                    'GPS inicial falló:',
                    error.message
                );

                navigator.geolocation.getCurrentPosition(
                    position => {
                        applyGpsPosition(
                            position.coords.latitude,
                            position.coords.longitude,
                            'Ubicación GPS de respaldo',
                            forceReset,
                            true // isExact
                        );
                        resolve(position);
                    },
                    error2 => reject(error2),
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 60000
                    }
                );
            },
            options
        );
    });
}

async function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
    const fetchIP = (url, parser) =>
        fetch(url)
            .then(response => response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status)))
            .then(parser);

    const apis = [
        fetchIP('https://ipapi.co/json/', data => data?.latitude != null && data?.longitude != null ? { lat: data.latitude, lng: data.longitude } : Promise.reject(new Error('no lat/lng'))),
        fetchIP('https://ipinfo.io/json', data => data?.loc ? { lat: parseFloat(data.loc.split(',')[0]), lng: parseFloat(data.loc.split(',')[1]) } : Promise.reject(new Error('no loc'))),
        fetchIP('https://freeipapi.com/api/json', data => data?.latitude != null && data?.longitude != null ? { lat: data.latitude, lng: data.longitude } : Promise.reject(new Error('no lat/lng'))),
        fetchIP('https://ipwho.is/', data => data?.success && data?.latitude != null && data?.longitude != null ? { lat: data.latitude, lng: data.longitude } : Promise.reject(new Error('no success')))
    ];

    return Promise.any(apis)
        .then(coords => {
            console.log(`
NOTIGAS GEOLOCATION -------------------
IP fallback: SUCCESS
Accuracy: APPROXIMATE`);
            if (forceReset || typeof window.currentGpsLat === 'undefined' || window.currentGpsLat === null) {
                if (typeof window.applyGpsPosition === 'function') {
                    window.applyGpsPosition(coords.lat, coords.lng, 'Ubicación aproximada por IP', forceReset, false); // isExact = false
                }
            }
            return coords;
        })
        .catch(() => {
            console.log(`
NOTIGAS GEOLOCATION -------------------
IP fallback: FAILED
No location found. User must select manually.`);
            return null;
        });
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
                if (window.activeGpsWatchId) clearInterval(window.activeGpsWatchId);
                window.activeGpsWatchId = setInterval(() => {
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
    //
    // NUNCA watchPosition()
    // =====================================================
    detenerGPSComprador();

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    solicitarGeolocalizacionNativaNavegador(
        isMobile,
        forceReset
    )
    .then(() => {
        if (typeof showToast === 'function') {
            showToast(
                '📍 Ubicación guardada',
                'Ya registramos tu ubicación. Puedes apagar el GPS; NOTIGAS no lo necesita mientras seas comprador.',
                'success',
                7000
            );
        }
    })
    .catch(() => {
        // En PC usamos IP solamente como respaldo
        if (!isMobile) {
            obtenerUbicacionIPFallbackDesktop(
                forceReset
            );
        } else {
            if (typeof showToast === 'function') {
                showToast(
                    '⚠️ Necesitamos tu ubicación',
                    'Activa la ubicación para registrar tu dirección habitual.',
                    'warning',
                    6000
                );
            }
        }
    });
}
