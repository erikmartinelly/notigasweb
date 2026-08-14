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
                timeout: 20000,
                maximumAge: 30000
            };

        navigator.geolocation.getCurrentPosition(
            position => {
                applyGpsPosition(
                    position.coords.latitude,
                    position.coords.longitude,
                    'Ubicación GPS del navegador',
                    forceReset
                );
                resolve(position);
            },
            error => {
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
                            forceReset
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

function obtenerUbicacionIPFallbackDesktop(forceReset = false) {
    console.log(
        '📍 Fallback IP: ubicación aproximada de red.'
    );

    const fetchIP = (url, parser) =>
        fetch(url)
            .then(response =>
                response.ok
                    ? response.json()
                    : Promise.reject(
                        new Error(
                            'HTTP ' + response.status
                        )
                    )
            )
            .then(parser);

    const apis = [
        fetchIP(
            'https://ipinfo.io/json',
            data => data?.loc
                ? {
                    lat: parseFloat(
                        data.loc.split(',')[0]
                    ),
                    lng: parseFloat(
                        data.loc.split(',')[1]
                    )
                }
                : Promise.reject()
        ),
        fetchIP(
            'https://freeipapi.com/api/json',
            data =>
                data?.latitude != null &&
                data?.longitude != null
                    ? {
                        lat: data.latitude,
                        lng: data.longitude
                    }
                    : Promise.reject()
        ),
        fetchIP(
            'https://ipwho.is/',
            data =>
                data?.success &&
                data?.latitude != null &&
                data?.longitude != null
                    ? {
                        lat: data.latitude,
                        lng: data.longitude
                    }
                    : Promise.reject()
        )
    ];

    return Promise.any(apis)
        .then(coords => {
            /*
             * IMPORTANTE:
             * IP NO ES DOMICILIO EXACTO.
             *
             * Solamente sirve para aproximar ciudad
             * y centrar inicialmente el mapa.
             */
            if (forceReset) {
                applyGpsPosition(
                    coords.lat,
                    coords.lng,
                    'Ubicación aproximada por red',
                    true
                );
            }
            return coords;
        })
        .catch(() => {
            return {
                lat: -17.3895,
                lng: -66.1568
            };
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
                    false
                );

                if (moved >= 30) {
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
        solicitarGeolocalizacionNativaNavegador(
            true,
            forceReset
        )
        .then(() => {
            iniciarWatchGPSRepartidor();
        })
        .catch(error => {
            console.warn(
                'No se pudo iniciar GPS del repartidor:',
                error
            );
            if (typeof showToast === 'function') {
                showToast(
                    '⚠️ GPS requerido',
                    'El repartidor necesita mantener activada la ubicación.',
                    'warning',
                    6000
                );
            }
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
