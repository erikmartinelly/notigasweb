/* ==========================================================================
   NOTIGAS - MÓDULO PRINCIPAL DE NAVEGACIÓN,
   FAVICON DINÁMICO POR CATEGORÍA Y MODO REPARTIDOR EN RUTA
   ========================================================================== */

// FIX W-07: ORDER_EXPIRATION_MS centralizada en state.js (window.NOTIGAS.ORDER_EXPIRATION_MS)
// Se elimina la copia local para evitar inconsistencias futuras.

let currentAppMode = 'buyer';
let isDriverGpsLive = true;
window.isHeatmapActive = window.isHeatmapActive || false;

/* =====================================================
   MANEJO CENTRALIZADO DE ERRORES GLOBALES
   Captura errores no controlados y los presenta al usuario
   de forma amigable en vez de fallar silenciosamente.
   ===================================================== */

/* =====================================================
   SISTEMA DE LOADING GLOBAL (ANTI-FREEZE)
   ===================================================== */
window.globalLoadingTimeout = null;

/* =====================================================
   SISTEMA DE TOAST NOTIFICATIONS (Reemplazo de alert())
   ===================================================== */

/* Modal de confirmación elegante (Reemplazo de confirm()) */

document.addEventListener('DOMContentLoaded', () => {
  // FIX: El bloqueo por GeoIP se ha eliminado a favor del acceso libre global,
  // dado que causaba bloqueos falsos por VPNs o lentitud de red.
  // console.log('GeoIP desactivado');

  const btnUserSettings = document.getElementById('btnOpenUserSettings');
  const modalUserSettings = document.getElementById('modalUserSettings');

  if (btnUserSettings && modalUserSettings) {
    btnUserSettings.addEventListener('click', () => {
      abrirConfiguracionSegunRol();
    });
  }


  // PURGA AUTOMÁTICA DE CACHÉ LOCAL (Limpia pedidos antiguos del localStorage, no de la BD)
  // verificarGPSObligatorio() eliminada para no causar doble petición y bloquear PC
  if (typeof ejecutarPurgaBaseDeDatosAuto === 'function') ejecutarPurgaBaseDeDatosAuto();
  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();

  // Service Worker registrado al final del archivo para evitar duplicado

  // AUTODETECTAR Y ACTIVAR MODO SEGÚN ROL REGISTRADO (COMPRADOR VS REPARTIDOR)
  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (u.role === 'repartidor') {
      setAppMode('driver');
    } else {
      setAppMode('buyer');
    }
  } catch(e){
    setAppMode('buyer');
  }
});

/* ABRE EL MODAL DE CONFIGURACIÓN MOSTRANDO LA SECCIÓN DEL ROL ACTIVO */
function abrirConfiguracionSegunRol() {
  const buyerSection = document.getElementById('settingsBuyerSection');
  const driverSection = document.getElementById('settingsDriverSection');
  const titleEl = document.getElementById('settingsModalTitle');
  const driverNameLabel = document.getElementById('settingsDriverNameLabel');
  const buyerToDriverContainer = document.getElementById('buyerToDriverBtnContainer');

  let isDriver = false;
  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    isDriver = (u.role === 'repartidor');
    if (isDriver && driverNameLabel && u.nombre) {
      driverNameLabel.textContent = u.nombre;
    }
  } catch(e){}

  if (isDriver) {
    if (buyerSection) buyerSection.style.display = 'none';
    if (driverSection) driverSection.style.display = 'block';
    if (titleEl) titleEl.textContent = '⚙️ MENÚ Repartidor';

    // Cargar estado GPS guardado
    try {
      const gpsVal = AppState.get('driverGpsLive') === 'on' ? 'on' : 'off';
      const gpsSelect = document.getElementById('driverGpsLive');
      if (gpsSelect) gpsSelect.value = gpsVal;
    } catch(e){}
  } else {
    if (buyerSection) buyerSection.style.display = 'block';
    if (driverSection) driverSection.style.display = 'none';
    if (titleEl) titleEl.textContent = '⚙️ MENÚ';

    if (buyerToDriverContainer) {
      const userData = AppState.get('userData') || {};
      const yaTieneFicha = Boolean(userData.hasDriverProfile || userData.placa || userData.whatsapp);
      buyerToDriverContainer.innerHTML = `
        <button type="button" id="btnActivateDriverMode" style="width:100%; background:linear-gradient(135deg,#FF6D00,#E65100); color:white; border:none; padding:10px; border-radius:10px; font-weight:800; cursor:pointer; font-size:12px;">
          <i class="fa-solid fa-truck-fast"></i> ${yaTieneFicha ? 'Volver al modo Repartidor' : 'Registrarme como Repartidor'}
        </button>`;
      const activateButton = document.getElementById('btnActivateDriverMode');
      if (activateButton) activateButton.addEventListener('click', () => {
        if (typeof window.migrarDatosAntiguosARepartidor === 'function') {
          window.migrarDatosAntiguosARepartidor();
        }
      });
    }
  }
  const subtitleEl = document.getElementById('driverModalSubtitle');
  if (titleEl) titleEl.textContent = 'Editar Mi Ficha de Repartidor';
  if (subtitleEl) subtitleEl.textContent = 'Actualiza los datos de tu negocio. Los cambios se aplican de inmediato.';

  const modal = document.getElementById('modalDriver');
  if (modal) modal.style.display = 'flex';
}

const abrirEdicionFichaRepartidor = abrirFichaRepartidorEdicion;

function setAppMode(mode) {
  const normalizedMode = mode === 'driver' ? 'driver' : 'buyer';
  currentAppMode = normalizedMode;
  mode = normalizedMode;
  if (typeof AppState !== 'undefined') {
    AppState.set('appMode', mode);
    AppState.set('userRole', mode === 'driver' ? 'repartidor' : 'vecino');
  }
  const buyerActions = document.getElementById('buyerFloatingActions');
  const driverActions = document.getElementById('driverFloatingActions');
  const badgeContainer = document.getElementById('headerRoleBadge');

  if (typeof window.actualizarIconoMarcadorUsuario === 'function') {
    window.actualizarIconoMarcadorUsuario(mode);
  }

  if (mode === 'driver') {
    if (buyerActions) buyerActions.style.display = 'none';
    if (driverActions) driverActions.style.display = 'flex';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:9.5px; background:rgba(255,109,0,0.2); color:#FF6D00; padding:3px 6px; border-radius:8px; font-weight:900; border:1px solid #FF6D00;">🚛 MODO REPARTIDOR</span>
      `;
    }

    actualizarEstadoBotonesRecorrido(AppState.get('driverGpsLive') === 'on');
    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
    if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
  } else {
    if (AppState.get('driverGpsLive') === 'on' && typeof window.pausarRecorridoRepartidor === 'function') {
      window.pausarRecorridoRepartidor({ silent: true });
    }
    if (buyerActions) buyerActions.style.display = 'flex';
    if (driverActions) driverActions.style.display = 'none';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:9.5px; background:rgba(2,136,209,0.2); color:#38BDF8; padding:3px 6px; border-radius:8px; font-weight:900; border:1px solid #0288D1;">🛍️ MODO COMPRADOR</span>
      `;
    }
    if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
    if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();
  }
}
window.setAppMode = setAppMode;

window.activarMiUbicacionRepartidor = function() {
  if (typeof currentGpsLat !== 'undefined' && typeof currentGpsLng !== 'undefined' && map) {
    map.flyTo([currentGpsLat, currentGpsLng], 16, { duration: 1.0 });
    if (typeof showToast === 'function') showToast('📍 Ubicación Centrada', 'El mapa se ha enfocado en tu posición actual.', 'info', 2000);
  } else {
    if (typeof conectarGPSAuto === 'function') {
      conectarGPSAuto(true);
    }
    if (typeof showToast === 'function') showToast('📍 Buscando GPS', 'Obteniendo tu ubicación actual...', 'info', 2000);
  }
};

function actualizarEstadoBotonesRecorrido(isActive) {
  const btnFollow = document.getElementById('btnDriverFollowMe');
  const btnPause = document.getElementById('btnDriverPause');
  const gpsSelect = document.getElementById('driverGpsLive');

  if (btnFollow) {
    btnFollow.classList.toggle('is-running', isActive);
    btnFollow.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btnFollow.innerHTML = isActive
      ? '<i class="fa-solid fa-satellite-dish"></i> UBICACIÓN VISIBLE'
      : '<i class="fa-solid fa-location-dot"></i> AVISAR DE MI UBICACIÓN';
  }
  if (btnPause) {
    btnPause.classList.toggle('is-paused', !isActive);
    btnPause.setAttribute('aria-pressed', isActive ? 'false' : 'true');
    btnPause.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> PAUSAR MI UBICACIÓN';
  }
  if (gpsSelect) gpsSelect.value = isActive ? 'on' : 'off';
}
window.actualizarEstadoBotonesRecorrido = actualizarEstadoBotonesRecorrido;

window.activarSeguirme = function() {
  if (AppState.get('driverGpsLive') === 'on') {
    actualizarEstadoBotonesRecorrido(true);
    if (typeof showToast === 'function') {
      showToast('Ubicación visible', 'Estamos avisando tu posición en el mapa a los clientes.', 'success', 2600);
    }
    return true;
  }

  isDriverGpsLive = true;
  AppState.set('driverGpsLive', 'on');
  AppState.set('isDriverLive', true);
  isMapInteractedByUser = false;

  actualizarEstadoBotonesRecorrido(true);

  if (typeof conectarGPSAuto === 'function') {
      conectarGPSAuto(true);
  }

  if (typeof currentGpsLat !== 'undefined' && typeof currentGpsLng !== 'undefined' && map) {
    map.flyTo([currentGpsLat, currentGpsLng], map.getZoom() || 16, { duration: 1.0 });
  }

  if (typeof showToast === 'function') {
    showToast('Ubicación visible', 'Estamos avisando tu posición en el mapa a los clientes.', 'success', 3000);
  }
  return true;
};

window.desactivarSeguirme = function() {
  // Explorar el mapa manualmente no apaga ni elimina el recorrido publicado.
  isMapInteractedByUser = true;
};

window.pausarRecorridoRepartidor = async function(options = {}) {
  const wasActive = AppState.get('driverGpsLive') === 'on';
  isDriverGpsLive = false;
  AppState.set('driverGpsLive', 'off');
  AppState.set('isDriverLive', false);
  isMapInteractedByUser = true;

  actualizarEstadoBotonesRecorrido(false);

  if (typeof window.detenerGPSComprador === 'function') {
    window.detenerGPSComprador();
  }

  if (typeof window.stopDriverLocationBroadcast === 'function') {
    await window.stopDriverLocationBroadcast();
  }

  if (!options.silent && typeof showToast === 'function') {
    showToast(
      wasActive ? 'Ubicación pausada' : 'Ubicación ya pausada',
      wasActive ? 'Tu posición dejó de mostrarse a los clientes y el camión fue retirado del mapa.' : 'Tu ubicación ya estaba oculta para los clientes.',
      'warning',
      2200
    );
  }
  return true;
};

function obtenerIconoHtmlPorCategoria(catNombre) {
  const c = (catNombre || '').toLowerCase();
  if (c.includes('agua')) {
    return `<i class="fa-solid fa-bottle-water" style="color:#00B0FF; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (c.includes('chatarra')) {
    return `<i class="fa-solid fa-recycle" style="color:#00E676; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (c.includes('papel') || c.includes('cartón')) {
    return `<i class="fa-solid fa-box-open" style="color:#FFB300; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (c.includes('fruta') || c.includes('verdura')) {
    return `<i class="fa-solid fa-apple-whole" style="color:#FF5252; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (c.includes('detergente') || c.includes('limpieza')) {
    return `<i class="fa-solid fa-pump-soap" style="color:#E040FB; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (c.includes('carbón') || c.includes('leña')) {
    return `<i class="fa-solid fa-fire" style="color:#FF6D00; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  } else if (!c.includes('gas')) {
    return `<i class="fa-solid fa-box" style="color:#94A3B8; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
  }
  return `<img src="icons/garrafa_red_clean.svg" style="width:24px; height:24px; vertical-align:middle; margin-right:6px; filter:drop-shadow(0 0 4px rgba(255, 23, 68, 0.7));" alt="Gas GLP NOTIGAS">`;
}

/* PURGA AUTOMÁTICA DE BASE DE DATOS LOCAL Y MEMORIA PARA EVITAR COLAPSO */

/* CAMBIO DE FAVICON E ICONO DE PESTAÑA SEGÚN EL TIPO DE PEDIDO SELECCIONADO */
function actualizarFaviconSegunPedido(categoria, estado = 'pendiente') {
  let favEl = document.getElementById('dynamicFavicon');
  if (!favEl) favEl = document.querySelector("link[rel*='icon']");
  if (!favEl) return;

  const isDriverMode = (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') || 
                       (typeof AppState !== 'undefined' && AppState.get('appMode') === 'driver');

  if (!categoria && !estado) {
    if (isDriverMode) {
      favEl.href = "icons/camion_3d_rojo.svg?v=86";
      document.title = "🚛 MODO REPARTIDOR - NOTIGAS en Vivo";
    } else {
      favEl.href = "icons/garrafa_red-192.png?v=85";
      document.title = "NOTIGAS - Plataforma Vecinal en Vivo";
    }
    return;
  }

  if (estado === 'asignado') {
    favEl.href = "icons/camion_3d_rojo.svg?v=86";
    document.title = "🚚 Pedido en Camino: Repartidor Asignado - NOTIGAS";
    return;
  }

  const cat = (categoria || '').toLowerCase();
  const getSvgUrl = (svgContent) => "data:image/svg+xml;utf8," + encodeURIComponent(svgContent);

  let color = "#FF1744"; // pendiente = rojo
  if (estado === 'visto') color = "#FFC107"; // visto = amarillo
  else if (estado === 'cancelado' || estado === 'entregado') color = "#00E676"; // final = verde

  if (cat.includes('gas')) {
    favEl.href = "icons/garrafa_red-192.png?v=85";
    document.title = "🔥 Pedido Activo: Garrafa de Gas GLP - NOTIGAS";
  } else if (cat.includes('detergente') || cat.includes('limpieza')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M40 10h20v15H40V10zm25 25H35v60h30V35zm-15 15c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z" fill="#FFF"/></svg>`);
    document.title = "🧼 Pedido Activo: Detergentes - NOTIGAS";
  } else if (cat.includes('agua')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M50 15 C30 45, 20 60, 20 70 A30 30 0 0 0 80 70 C80 60, 70 45, 50 15 Z" fill="#FFF"/></svg>`);
    document.title = "💧 Pedido Activo: Agua 20L - NOTIGAS";
  } else if (cat.includes('chatarra')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M50 15 L65 40 H35 Z M20 50 L35 75 H5 Z M80 50 L95 75 H65 Z" fill="#FFF"/></svg>`);
    document.title = "♻️ Pedido Activo: Chatarra - NOTIGAS";
  } else if (cat.includes('papel')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><rect x="25" y="20" width="50" height="60" rx="4" fill="#FFF"/><line x1="35" y1="35" x2="65" y2="35" stroke="#0288D1" stroke-width="4"/><line x1="35" y1="50" x2="65" y2="50" stroke="#0288D1" stroke-width="4"/><line x1="35" y1="65" x2="55" y2="65" stroke="#0288D1" stroke-width="4"/></svg>`);
    document.title = "📄 Pedido Activo: Papel / Cartón - NOTIGAS";
  } else if (cat.includes('frutas') || cat.includes('verduras')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M50 30 C30 30, 20 50, 20 65 C20 80, 35 90, 50 90 C65 90, 80 80, 80 65 C80 50, 70 30, 50 30 Z" fill="#FFF"/><path d="M50 15 Q60 10 65 25" stroke="#4CAF50" stroke-width="6" fill="none"/></svg>`);
    document.title = "🍎 Pedido Activo: Frutas / Verduras - NOTIGAS";
  } else if (cat.includes('carbón') || cat.includes('leña')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M50 15 C30 45, 60 55, 35 85 C65 85, 80 60, 50 15 Z" fill="#FFF"/></svg>`);
    document.title = "🪵 Pedido Activo: Carbón / Leña - NOTIGAS";
  } else {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><rect x="20" y="35" width="60" height="45" fill="#FFF"/><path d="M15 35 L50 15 L85 35 Z" fill="#FFF"/></svg>`);
    document.title = "📦 Pedido Activo - NOTIGAS";
  }
}

function switchTab(index) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
  document.querySelectorAll('.tab-content').forEach((tab, i) => tab.classList.toggle('active', i === index));

  if (index === 0) {
    const activeMap = window.notigasMap || window.map || (typeof map !== 'undefined' ? map : null);
    if (activeMap && typeof activeMap.invalidateSize === 'function') {
      setTimeout(() => activeMap.invalidateSize(), 200);
    }
  } else if (index === 1) {
    // Carga bajo demanda del directorio de repartidores y publicidad
    if (typeof descargarChoferesYRenderizar === 'function') descargarChoferesYRenderizar('TODOS');
    if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
  } else if (index === 2) {
    // Carga bajo demanda del muro vecinal
    if (typeof renderForumFeed === 'function') renderForumFeed();
  }
}
window.switchTab = switchTab;

function getActiveUserLocation() {
  let lat = window.currentGpsLat || (typeof currentGpsLat !== 'undefined' ? currentGpsLat : (typeof AppState !== 'undefined' ? AppState.get('gpsLat') : null));
  let lng = window.currentGpsLng || (typeof currentGpsLng !== 'undefined' ? currentGpsLng : (typeof AppState !== 'undefined' ? AppState.get('gpsLng') : null));

  const marker = window.userMarker || (typeof userMarker !== 'undefined' ? userMarker : null);
  if (marker && typeof marker.getLatLng === 'function') {
    try {
      const pos = marker.getLatLng();
      if (pos && pos.lat && pos.lng) {
        lat = pos.lat;
        lng = pos.lng;
      }
    } catch(e){}
  }

  // Fallback al centro actual del mapa si las coordenadas no están fijadas
  const activeMap = window.notigasMap || window.map || (typeof map !== 'undefined' ? map : null);
  if ((!lat || !lng) && activeMap && typeof activeMap.getCenter === 'function') {
    try {
      const center = activeMap.getCenter();
      if (center && center.lat && center.lng) {
        lat = center.lat;
        lng = center.lng;
      }
    } catch(e){}
  }

  return { lat, lng };
}
window.getActiveUserLocation = getActiveUserLocation;

/* ==========================================================================
   NOTIGAS - APLICACIÓN PRINCIPAL (CARRITO, GEOLOCALIZACIÓN Y NOTIFICACIONES)
   ========================================================================== */

// notigasTrack stub hasta configurar GA real
window.notigasTrack = window.notigasTrack || function(event, params) {
  console.log('[Analytics stub]', event, params || {});
};

// 1. Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=103')
      .then((reg) => console.log('✅ Service Worker registrado', reg.scope))
      .catch((err) => console.error('❌ Error Service Worker:', err));
  });
}

// 2. Inicialización principal de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 NOTIGAS iniciando...');

    // Escuchar a que Auth termine de inicializar y validar la BD (para asegurar rol y ciudad)
    const initSupabaseFeatures = () => {
        console.log('🔗 Auth y BD sincronizados. Iniciando servicios en red...');
        if (typeof iniciarSuscripcionesRealtime === 'function') {
            iniciarSuscripcionesRealtime();
        }
        if (typeof cargarPedidosVecinalesEnVivo === 'function') {
            cargarPedidosVecinalesEnVivo();
            // Mecanismo de recuperación (polling backup) en caso de que falle Realtime
            if (typeof iniciarSuscripcionesRealtime === 'function') {
                if (window.notigasRealtimeFallbackInterval) {
                    clearInterval(
                        window.notigasRealtimeFallbackInterval
                    );
                }

                window.notigasRealtimeFallbackInterval =
                    setInterval(() => {
                        if (
                            AppState.get(
                                'realtimeConnected'
                            ) === false
                        ) {
                            cargarPedidosVecinalesEnVivo();
                        }
                    }, 15000);
            }
        }
    };

    document.addEventListener('notigas_auth_ready', initSupabaseFeatures, { once: true });
});

// 5. Función de navegación entre vistas
window.navegarA = function(vista) {
    const vistas = ['mapa', 'foro', 'vendedores', 'pedidos'];

    if (!vistas.includes(vista)) {
        console.error('Vista no válida:', vista);
        return;
    }

    // Ocultar todas las vistas
    vistas.forEach(v => {
        const elemento = document.getElementById(`vista-${v}`);
        if (elemento) elemento.style.display = 'none';
    });

    // Mostrar la vista solicitada
    const vistaActual = document.getElementById(`vista-${vista}`);
    if (vistaActual) {
        vistaActual.style.display = 'block';
        window.AppState.set('vistaActual', vista);
    }
};

// 6. Sistema de notificaciones global
