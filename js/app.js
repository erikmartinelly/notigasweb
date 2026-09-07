
/* FUNCIÓN GLOBAL: ALTERNAR ROL DE USUARIO (COMPRADOR ⇄ REPARTIDOR) PARA ADMINISTRADOR Y PRUEBAS */
window.cambiarModoRolUsuario = function(targetMode) {
  const currentMode = (typeof AppState !== 'undefined' ? AppState.get('appMode') : 'buyer') || 'buyer';
  const newMode = targetMode || (currentMode === 'driver' ? 'buyer' : 'driver');

  const userData = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};

  if (newMode === 'driver') {
    userData.role = 'repartidor';
    if (!userData.nombre) userData.nombre = 'Repartidor de Pruebas';
    if (!userData.telefono) userData.telefono = '987654321';
    if (!userData.categoria) userData.categoria = 'Gas GLP';
    if (!userData.placa) userData.placa = 'TEST-01';
    if (!userData.ciudad) userData.ciudad = (AppState.get('city') || 'lima');
    userData.hasDriverProfile = true;
    AppState.set('userData', userData);

    if (typeof setAppMode === 'function') setAppMode('driver', true);

    if (typeof showToast === 'function') {
      showToast('🚛 Modo Repartidor Activado', 'Ahora puedes ver y tomar pedidos, gestionar tu recorrido GPS y ver pedidos en tu zona.', 'success', 4000);
    }
  } else {
    userData.role = 'vecino';
    AppState.set('userData', userData);

    if (typeof setAppMode === 'function') setAppMode('buyer', true);

    if (typeof showToast === 'function') {
      showToast('🛍️ Modo Comprador Activado', 'Ahora puedes pedir balones de gas, ver el mapa y los repartidores cercanos.', 'info', 4000);
    }
  }

  // Refrescar vistas en mapa
  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
  if (typeof actualizarIconoMarcadorUsuario === 'function') actualizarIconoMarcadorUsuario(newMode);
};


/* CONTROL ESTRICTO DE OPERACIÓN POR CIUDAD REGISTRADA */
window.verificarPermisoOperarEnCiudad = function(accionNombre) {
  const userData = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const userRole = userData.role || (typeof AppState !== 'undefined' ? AppState.get('userRole') : 'vecino');
  const ciudadUsuario = (userData.ciudad || '').toLowerCase().trim();
  const ciudadActiva = (typeof AppState !== 'undefined' ? AppState.get('city') || 'lima' : 'lima').toLowerCase().trim();

  // Si no está autenticado, permitir que el flujo estándar de login lo maneje
  const uid = userData.user_id || (typeof getCurrentUserId === 'function' ? getCurrentUserId() : null);
  if (!uid) {
    return true;
  }

  // Si no tiene ciudad registrada o coincide con la ciudad que está viendo, puede operar
  if (!ciudadUsuario || ciudadUsuario === ciudadActiva) {
    return true;
  }

  // Si está explorando otra ciudad distinta a la suya, bloquear la operación y sugerir editar ficha
  const getCityLabel = (key) => (window.PERU_CITIES && (window.PERU_CITIES[key]?.nombre || window.PERU_CITIES[key]?.name)) || (key ? key.toUpperCase() : 'LIMA');
  const esDriver = (userRole === 'repartidor' || userData.hasDriverProfile);
  const tipoFicha = esDriver ? 'repartidor' : 'comprador';

  if (typeof showToast === 'function') {
    showToast(
      '📍 Ciudad Diferente a tu Ficha',
      `Estás viendo ${getCityLabel(ciudadActiva)}, pero tu ficha de ${tipoFicha} está registrada en ${getCityLabel(ciudadUsuario)}. Para ${accionNombre} aquí, edita tu ficha y cambia tu ciudad habitual.`,
      'warning',
      6000
    );
  } else {
    alert(`Estás viendo ${getCityLabel(ciudadActiva)}, pero tu ficha está registrada en ${getCityLabel(ciudadUsuario)}. Para ${accionNombre}, edita tu ficha.`);
  }

  // Abrir automáticamente la edición de ficha correspondiente
  if (esDriver) {
    if (typeof window.abrirFichaRepartidorEdicion === 'function') {
      window.abrirFichaRepartidorEdicion();
    }
  } else {
    if (typeof window.abrirEdicionFichaComprador === 'function') {
      window.abrirEdicionFichaComprador();
    }
  }

  return false;
};

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

  // PURGA AUTOMÁTICA DE CACHÉ LOCAL (Limpia pedidos antiguos del localStorage, no de la BD)
  // verificarGPSObligatorio() eliminada para no causar doble petición y bloquear PC
  if (typeof ejecutarPurgaBaseDeDatosAuto === 'function') ejecutarPurgaBaseDeDatosAuto();
  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();

  // Service Worker registrado al final del archivo para evitar duplicado

  // AUTODETECTAR Y ACTIVAR MODO SEGÚN ROL REGISTRADO (COMPRADOR VS REPARTIDOR)
  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (u.role === 'repartidor') {
      setAppMode('driver', false);
    } else {
      setAppMode('buyer', false);
    }
  } catch(e){
    setAppMode('buyer', false);
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
        <button type="button" id="btnRegistroRepartidoresMenu" style="width:100%; background:linear-gradient(135deg,#FF6D00,#E65100); color:white; border:none; padding:12px; border-radius:10px; font-weight:800; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(255,109,0,0.25);">
          <i class="fa-solid fa-truck-fast"></i> ${yaTieneFicha ? 'Volver al modo Repartidor' : 'Registro Repartidores'}
        </button>`;
      const activateButton = document.getElementById('btnRegistroRepartidoresMenu');
      if (activateButton) activateButton.addEventListener('click', () => {
        if (typeof window.abrirRegistroRepartidores === 'function') {
          window.abrirRegistroRepartidores();
        } else if (typeof window.migrarDatosAntiguosARepartidor === 'function') {
          window.migrarDatosAntiguosARepartidor();
        }
      });
    }
  }

  // Alternar botón Cerrar Sesión vs bloque de acceso (Ingresar / Registrarse)
  if (typeof window.actualizarVisibilidadBotonesAuth === 'function') {
    window.actualizarVisibilidadBotonesAuth();
  }

  // Visibilidad del botón de acceso a Administrador exclusiva para administradores autenticados
  const btnAdmin = document.getElementById('btnAdminAccessQuick');
  if (btnAdmin) {
    const isAdmin = (typeof AppState !== 'undefined') && AppState.get('isAdmin') === true;
    btnAdmin.style.display = isAdmin ? 'flex' : 'none';
  }

  const modal = document.getElementById('modalUserSettings');
  if (modal) modal.style.display = 'flex';
}

/* ABRE LA FICHA DEL REPARTIDOR EN MODO EDICIÓN (DESDE EL MENÚ CONFIG, NO DEL HEADER) */
function abrirFichaRepartidorEdicion() {
  // Cargar datos existentes del repartidor en el formulario
  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    setVal('inputDriverNombre', u.nombre);
    setVal('inputDriverTelRef', u.whatsapp);
    setVal('inputDriverPlate', u.placa);
    setVal('inputDriverCat', u.categoria);
    setVal('inputDriverProductos', u.productos);
    setVal('inputDriverZonas', u.zonas);
    setVal('inputDriverSchedule', u.schedule);
  } catch(e){}

  // Cambiar título a modo edición
  const titleEl = document.getElementById('driverModalTitleText');
  const subtitleEl = document.getElementById('driverModalSubtitle');
  if (titleEl) titleEl.textContent = 'Editar Mi Ficha de Repartidor';
  if (subtitleEl) subtitleEl.textContent = 'Actualiza los datos de tu negocio. Los cambios se aplican de inmediato.';

  if (typeof window.inicializarColorPickerChofer === 'function') {
    window.inicializarColorPickerChofer();
  }

  const modal = document.getElementById('modalDriver');
  if (modal) modal.style.display = 'flex';
}

const abrirEdicionFichaRepartidor = abrirFichaRepartidorEdicion;

function setAppMode(mode, refreshData = true) {
  const normalizedMode = (mode === 'driver' || mode === 'repartidor') ? 'driver' : 'buyer';
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
        <button type="button" id="btnHeaderRoleToggle" onclick="window.cambiarModoRolUsuario('buyer')" class="btn-role-switch-header" title="Modo Repartidor activo. Haz clic para cambiar a Comprador" style="background:rgba(255,109,0,0.22); color:#FF6D00; padding:4px 8px; border-radius:8px; font-weight:900; font-size:11px; border:1.5px solid #FF6D00; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(255,109,0,0.3);">
          <i class="fa-solid fa-truck-fast"></i> <span>REPARTIDOR</span> <i class="fa-solid fa-repeat" style="font-size:9px; opacity:0.85;"></i>
        </button>
      `;
    }

    actualizarEstadoBotonesRecorrido(AppState.get('driverGpsLive') === 'on');
    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
    if (refreshData && typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
  } else {
    if (AppState.get('driverGpsLive') === 'on' && typeof window.pausarRecorridoRepartidor === 'function') {
      window.pausarRecorridoRepartidor({ silent: true });
    }
    if (buyerActions) buyerActions.style.display = 'flex';
    if (driverActions) driverActions.style.display = 'none';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <button type="button" id="btnHeaderRoleToggle" onclick="window.cambiarModoRolUsuario('driver')" class="btn-role-switch-header" title="Modo Comprador activo. Haz clic para cambiar a Repartidor" style="background:rgba(2,136,209,0.22); color:#38BDF8; padding:4px 8px; border-radius:8px; font-weight:900; font-size:11px; border:1.5px solid #0288D1; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(2,136,209,0.3);">
          <i class="fa-solid fa-basket-shopping"></i> <span>COMPRADOR</span> <i class="fa-solid fa-repeat" style="font-size:9px; opacity:0.85;"></i>
        </button>
      `;
    }
    if (refreshData && typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
    if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();
    if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
    if (typeof syncBuyerActiveOrderFromCloud === 'function') syncBuyerActiveOrderFromCloud();
  }

  // Sincronizar botones en modal de configuración
  const btnB = document.getElementById('btnSwitchModeBuyer');
  const btnD = document.getElementById('btnSwitchModeDriver');
  const lbl = document.getElementById('lblCurrentActiveRole');
  if (btnB && btnD) {
    if (mode === 'driver') {
      btnD.style.borderColor = '#FF6D00';
      btnD.style.background = 'rgba(255,109,0,0.25)';
      btnD.style.color = '#FF6D00';
      btnB.style.borderColor = '#475569';
      btnB.style.background = '#1E293B';
      btnB.style.color = '#94A3B8';
      if (lbl) { lbl.textContent = 'Repartidor'; lbl.style.color = '#FF6D00'; }
    } else {
      btnB.style.borderColor = '#0288D1';
      btnB.style.background = 'rgba(2,136,209,0.25)';
      btnB.style.color = '#38BDF8';
      btnD.style.borderColor = '#475569';
      btnD.style.background = '#1E293B';
      btnD.style.color = '#94A3B8';
      if (lbl) { lbl.textContent = 'Comprador'; lbl.style.color = '#38BDF8'; }
    }
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

async function switchTab(index) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  document.querySelectorAll('.tab-content').forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });

  // Los anuncios pueden aparecer en mapa, repartidores y muro.
  if (typeof window.loadAdsModule === 'function') {
    await window.loadAdsModule();
  }
  if (typeof window.cargarAnunciosGuardados === 'function') {
    await window.cargarAnunciosGuardados();
  }

  if (index === 0) {
    const activeMap = window.notigasMap || window.map || (typeof map !== 'undefined' ? map : null);
    if (activeMap && typeof activeMap.invalidateSize === 'function') {
      setTimeout(() => activeMap.invalidateSize(), 200);
    }
  } else if (index === 1) {
    if (typeof descargarChoferesYRenderizar === 'function') {
      await descargarChoferesYRenderizar('TODOS');
    }
  } else if (index === 2) {
    if (typeof window.loadForumModule === 'function') {
      await window.loadForumModule();
    }
    if (typeof renderForumFeed === 'function') {
      await renderForumFeed();
    }
  }
}
window.switchTab = switchTab;

// Pre-carga en segundo plano durante tiempo libre de la CPU (Idle Preload)
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => {
    setTimeout(() => {
      if (typeof window.loadForumModule === 'function') window.loadForumModule();
      if (typeof window.loadAdsModule === 'function') window.loadAdsModule();
    }, 2500);
  });
} else {
  setTimeout(() => {
    if (typeof window.loadForumModule === 'function') window.loadForumModule();
    if (typeof window.loadAdsModule === 'function') window.loadAdsModule();
  }, 3500);
}

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

// 1. Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swVer = window.NOTIGAS?.CACHE_VERSION || '122';
    navigator.serviceWorker.register(`./sw.js?v=${swVer}`)
      .then((reg) => console.log('✅ Service Worker registrado', reg.scope))
      .catch((err) => console.error('❌ Error Service Worker:', err));
  });
}

// 2. Inicialización principal de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 NOTIGAS iniciando...');

    // Escuchar a que Auth termine de inicializar y validar la BD (para asegurar rol y ciudad)
    const initSupabaseFeatures = () => {
        console.log('🔗 Auth y BD sincronizados. Conectando Realtime y cargando datos...');
        if (typeof iniciarSuscripcionesRealtime === 'function') {
            iniciarSuscripcionesRealtime();
        }
        if (typeof cargarPedidosVecinalesEnVivo === 'function') {
            cargarPedidosVecinalesEnVivo(true);
        }
        // Mecanismo de recuperación (polling backup) sólo si Realtime no está conectado (30 segundos)
        if (window.notigasRealtimeFallbackInterval) {
            clearInterval(window.notigasRealtimeFallbackInterval);
        }
        window.notigasRealtimeFallbackInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                if (AppState && AppState.get('realtimeConnected') === false) {
                    if (typeof cargarPedidosVecinalesEnVivo === 'function') {
                        cargarPedidosVecinalesEnVivo();
                    }
                }
            }
        }, 30000);
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


// Purga automática preventiva en segundo plano al iniciar la app
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.supabaseClient && typeof window.supabaseClient.rpc === 'function') {
      window.supabaseClient.rpc('rpc_purge_old_records').then(({ data }) => {
        if (data && (data.pedidos_eliminados > 0 || data.avisos_eliminados > 0)) {
          console.info('Purga automática preventiva realizada:', data);
        }
      }).catch(() => {});
    }
  }, 3000);
});
