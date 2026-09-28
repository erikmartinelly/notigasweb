
/* FUNCIÓN GLOBAL: ALTERNAR ROL DE USUARIO (COMPRADOR ⇄ REPARTIDOR) PARA ADMINISTRADOR Y PRUEBAS */
window.cambiarModoRolUsuario = function(targetMode) {
  const currentMode = (typeof AppState !== 'undefined' ? AppState.get('appMode') : 'buyer') || 'buyer';
  const newMode = targetMode || (currentMode === 'driver' ? 'buyer' : 'driver');

  const userData = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};

  if (newMode === 'driver') {
    userData.role = 'repartidor';
    if (!userData.nombre) userData.nombre = 'Repartidor de Pruebas';
    if (!userData.telefono) userData.telefono = '70123456';
    if (!userData.categoria) userData.categoria = 'plastico';
    if (!userData.placa) userData.placa = 'TEST-01';
    if (!userData.ciudad) userData.ciudad = (AppState.get('city') || 'cochabamba');
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
      showToast('♻️ Modo Comprador Activado', 'Publica material para recoger y ve quién lo busca cerca de ti.', 'info', 4000);
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
  const ciudadActiva = (typeof AppState !== 'undefined' ? AppState.get('city') || 'cochabamba' : 'cochabamba').toLowerCase().trim();

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
  const getCityLabel = (key) => (window.BOLIVIA_CITIES && (window.BOLIVIA_CITIES[key]?.nombre || window.BOLIVIA_CITIES[key]?.name)) || (key ? key.toUpperCase() : 'COCHABAMBA');
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
    setVal('inputDriverDni', u.dni);
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
        <button type="button" id="btnHeaderRoleToggle" data-notigas-action="switch-role" data-role-target="buyer" class="btn-role-switch-header" title="Modo Repartidor activo. Haz clic para cambiar a Comprador" style="background:rgba(255,109,0,0.22); color:#FF6D00; padding:4px 8px; border-radius:8px; font-weight:900; font-size:11px; border:1.5px solid #FF6D00; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(255,109,0,0.3);">
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
        <button type="button" id="btnHeaderRoleToggle" data-notigas-action="switch-role" data-role-target="driver" class="btn-role-switch-header" title="Modo Comprador activo. Haz clic para cambiar a Repartidor" style="background:rgba(2,136,209,0.22); color:#38BDF8; padding:4px 8px; border-radius:8px; font-weight:900; font-size:11px; border:1.5px solid #0288D1; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(2,136,209,0.3);">
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

/* Icono HTML de la categoría. Usa el mismo catálogo que el mapa para que un
   pedido muestre el mismo color e icono en la tarjeta, en la notificación y
   en el pin. */
const CATEGORIA_ICONO_FONTAWESOME = {
  plastico:    'fa-recycle',
  papel:       'fa-newspaper',
  chatarra:    'fa-gears',
  botellas:    'fa-bottle-dispenser',
  organico:    'fa-seedling',
  frutas:      'fa-apple-whole',
  detergentes: 'fa-pump-soap',
  sal:         'fa-mortar-pestle',
  afilado:     'fa-scissors',
  agua:        'fa-bottle-water',
  otros:       'fa-box'
};

function obtenerIconoHtmlPorCategoria(catNombre) {
  const c = String(catNombre || '').toLowerCase().trim();
  const bo = window.NOTIGAS_BO;
  const codigo = (typeof window.normalizeCategoryCode === 'function')
    ? window.normalizeCategoryCode(catNombre)
    : c;
  const color = (bo && bo.CATEGORIAS_POR_CODIGO && bo.CATEGORIAS_POR_CODIGO[codigo])
    ? bo.CATEGORIAS_POR_CODIGO[codigo].color
    : '#94A3B8';
  const faIcon = CATEGORIA_ICONO_FONTAWESOME[codigo] || 'fa-box';
  return `<i class="fa-solid ${faIcon}" style="color:${color}; font-size:22px; vertical-align:middle; margin-right:6px;"></i>`;
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
      if (typeof window.actualizarFaviconCamion === 'function') {
        const uData = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
        window.actualizarFaviconCamion({
          nombre: uData.nombre || 'Distribuidor',
          empresa: uData.categoria || 'NOTIGAS',
          color: uData.color_camion
        });
      } else {
        favEl.href = "favicon.svg?v=144";
      }
      document.title = "🚛 DISTRIBUIDOR OFICIAL - NOTIGAS en Vivo";
    } else {
      if (typeof window.restaurarFaviconDefault === 'function') {
        window.restaurarFaviconDefault();
      } else {
        favEl.href = "icons/camion_reciclaje.svg?v=144";
      }
      document.title = "NOTIGAS: Noticias de Generadores de residuos seleccionados";
    }
    return;
  }

  if (estado === 'asignado') {
    favEl.href = "icons/camion_3d_rojo.svg?v=144";
    document.title = "🚚 Pedido en Camino: Repartidor Asignado - NOTIGAS";
    return;
  }

  const getSvgUrl = (svgContent) => "data:image/svg+xml;utf8," + encodeURIComponent(svgContent);

  let color = "#FF1744"; // pendiente = rojo
  if (estado === 'visto') color = "#FFC107"; // visto = amarillo
  else if (estado === 'cancelado' || estado === 'entregado') color = "#00E676"; // final = verde

  const bo = window.NOTIGAS_BO;
  const codigo = (typeof window.normalizeCategoryCode === 'function')
    ? window.normalizeCategoryCode(categoria)
    : String(categoria || '').toLowerCase().trim();
  const cat = (bo && bo.CATEGORIAS_POR_CODIGO && bo.CATEGORIAS_POR_CODIGO[codigo]) || null;

  const etiqueta = cat ? cat.etiqueta : 'Otros';
  const emoji = cat ? cat.icono : '📦';
  const esRecogida = cat ? cat.tipo_solicitud === 'recogida' : false;
  const colorCat = cat ? cat.color : color;
  const verbo = esRecogida ? 'Recogida' : 'Pedido';

  // Glifos blancos por categoría; el círculo toma el color del catálogo.
  const GLIFOS = {
    plastico:    '<path d="M50 18 L64 40 H36 Z M22 50 L36 74 H8 Z M78 50 L92 74 H64 Z" fill="#FFF"/>',
    papel:       '<rect x="26" y="20" width="48" height="60" rx="4" fill="#FFF"/><line x1="35" y1="36" x2="65" y2="36" stroke="#00000030" stroke-width="4"/><line x1="35" y1="50" x2="65" y2="50" stroke="#00000030" stroke-width="4"/><line x1="35" y1="64" x2="55" y2="64" stroke="#00000030" stroke-width="4"/>',
    chatarra:    '<path d="M50 15 L65 40 H35 Z M20 50 L35 75 H5 Z M80 50 L95 75 H65 Z" fill="#FFF"/>',
    botellas:    '<path d="M40 12h20v10H40z" fill="#FFF"/><path d="M38 22h24l-4 12v40a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6V34z" fill="#FFF"/>',
    organico:    '<path d="M50 82 V44" stroke="#FFF" stroke-width="7" stroke-linecap="round"/><path d="M50 50 C30 50 22 36 24 22 C40 22 50 32 50 50 Z" fill="#FFF"/><path d="M50 58 C70 58 78 44 76 30 C60 30 50 40 50 58 Z" fill="#FFF"/>',
    frutas:      '<path d="M50 32 C32 32 22 50 22 64 C22 78 36 88 50 88 C64 88 78 78 78 64 C78 50 68 32 50 32 Z" fill="#FFF"/><path d="M50 18 Q60 12 66 28" stroke="#FFF" stroke-width="6" fill="none" stroke-linecap="round"/>',
    detergentes: '<path d="M40 12h20v14H40z" fill="#FFF"/><path d="M36 26h28v56H36z" fill="#FFF"/><circle cx="50" cy="54" r="9" fill="#00000030"/>',
    sal:         '<path d="M28 78 L40 40 h20 l12 38 Z" fill="#FFF"/><circle cx="50" cy="32" r="7" fill="#FFF"/>',
    afilado:     '<circle cx="32" cy="68" r="12" fill="none" stroke="#FFF" stroke-width="7"/><circle cx="68" cy="68" r="12" fill="none" stroke="#FFF" stroke-width="7"/><line x1="39" y1="61" x2="63" y2="29" stroke="#FFF" stroke-width="8" stroke-linecap="round"/>',
    agua:        '<path d="M50 15 C30 45, 20 60, 20 70 A30 30 0 0 0 80 70 C80 60, 70 45, 50 15 Z" fill="#FFF"/>',
    otros:       '<rect x="20" y="36" width="60" height="44" fill="#FFF"/><path d="M14 36 L50 16 L86 36 Z" fill="#FFF"/>'
  };

  favEl.href = getSvgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="48" fill="${color}"/>` +
    `<circle cx="50" cy="50" r="44" fill="${colorCat}"/>` +
    (GLIFOS[codigo] || GLIFOS.otros) +
    `</svg>`
  );
  document.title = `${emoji} ${verbo} Activo: ${etiqueta} - NOTIGAS`;
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
    const swVer = window.NOTIGAS?.CACHE_VERSION || '144';
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


// La purga de retención se ejecuta exclusivamente en servidor mediante pg_cron.
