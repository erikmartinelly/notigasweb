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
let globalLoadingTimeout;



/* =====================================================
   SISTEMA DE TOAST NOTIFICATIONS (Reemplazo de alert())
   ===================================================== */

/* Modal de confirmación elegante (Reemplazo de confirm()) */

document.addEventListener('DOMContentLoaded', () => {
  // FIX: El bloqueo por GeoIP se ha eliminado a favor del acceso libre global,
  // dado que causaba bloqueos falsos por VPNs o lentitud de red.
  // console.log('GeoIP desactivado');




  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (let r of regs) r.update();
    }).catch(() => {});
  }

  const btnUserSettings = document.getElementById('btnOpenUserSettings');
  const modalUserSettings = document.getElementById('modalUserSettings');

  if (btnUserSettings && modalUserSettings) {
    btnUserSettings.addEventListener('click', () => {
      abrirConfiguracionSegunRol();
    });
  }

  // PURGA AUTOMÁTICA DE CACHÉ LOCAL (Limpia pedidos antiguos del localStorage, no de la BD)
  // verificarGPSObligatorio() eliminada para no causar doble petición y bloquear PC
  ejecutarPurgaBaseDeDatosAuto();
  checkActiveOrderStatus();

  // Service Worker registrado al final del archivo para evitar duplicado

  // AUTODETECTAR Y ACTIVAR MODO SEGÚN ROL REGISTRADO (COMPRADOR VS REPARTIDOR)
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor') {
        setAppMode('driver');
      } else {
        setAppMode('buyer');
      }
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

  let isDriver = false;
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      isDriver = (u.role === 'repartidor');
      if (isDriver && driverNameLabel && u.nombre) {
        driverNameLabel.textContent = u.nombre;
      }
    }
  } catch(e){}

  if (isDriver) {
    if (buyerSection) buyerSection.style.display = 'none';
    if (driverSection) driverSection.style.display = 'block';
    if (titleEl) titleEl.textContent = '⚙️ MENÚ Repartidor';

    // Cargar estado GPS guardado
    try {
      const gpsVal = (AppState.get('driverGpsLive') || 'on') || 'on';
      const gpsSelect = document.getElementById('driverGpsLive');
      if (gpsSelect) gpsSelect.value = gpsVal;
    } catch(e){}
  } else {
    if (buyerSection) buyerSection.style.display = 'block';
    if (driverSection) driverSection.style.display = 'none';
    if (titleEl) titleEl.textContent = '⚙️ MENÚ';
  }

  const modal = document.getElementById('modalUserSettings');
  if (modal) modal.style.display = 'flex';
}

/* ABRE LA FICHA DEL REPARTIDOR EN MODO EDICIÓN (DESDE EL MENÚ CONFIG, NO DEL HEADER) */
function abrirFichaRepartidorEdicion() {
  // Cargar datos existentes del repartidor en el formulario
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      setVal('inputDriverNombre', u.nombre);
      setVal('inputDriverTelRef', u.whatsapp);
      setVal('inputDriverPlate', u.placa);
      setVal('inputDriverCat', u.categoria);
      setVal('inputDriverProductos', u.productos);
      setVal('inputDriverCiudad', u.ciudad);

      setVal('inputDriverSchedule', u.schedule);
    }
  } catch(e){}

  // Cambiar título a modo edición
  const titleEl = document.getElementById('driverModalTitleText');
  const subtitleEl = document.getElementById('driverModalSubtitle');
  if (titleEl) titleEl.textContent = 'Editar Mi Ficha de Repartidor';
  if (subtitleEl) subtitleEl.textContent = 'Actualiza los datos de tu negocio. Los cambios se aplican de inmediato.';

  const modal = document.getElementById('modalDriver');
  if (modal) modal.style.display = 'flex';
}

const abrirEdicionFichaRepartidor = abrirFichaRepartidorEdicion;

function setAppMode(mode) {
  currentAppMode = mode;
  if (typeof AppState !== 'undefined') AppState.set('appMode', mode);
  const buyerActions = document.getElementById('buyerFloatingActions');
  const driverActions = document.getElementById('driverFloatingActions');
  const badgeContainer = document.getElementById('headerRoleBadge');

  if (mode === 'driver') {
    if (buyerActions) buyerActions.style.display = 'none';
    if (driverActions) driverActions.style.display = 'flex';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:9.5px; background:rgba(255,109,0,0.2); color:#FF6D00; padding:3px 6px; border-radius:8px; font-weight:900; border:1px solid #FF6D00;">🚛 MODO REPARTIDOR</span>
      `;
    }

    AppState.set('driverGpsLive', 'on');
    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
  } else {
    if (buyerActions) buyerActions.style.display = 'flex';
    if (driverActions) driverActions.style.display = 'none';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:9.5px; background:rgba(2,136,209,0.2); color:#38BDF8; padding:3px 6px; border-radius:8px; font-weight:900; border:1px solid #0288D1;">🛍️ MODO COMPRADOR</span>
      `;
    }
  }
}

window.activarMiUbicacionRepartidor = function() {
  if (typeof conectarGPSAuto === 'function') {
    conectarGPSAuto(true); // forceReset = true (centra el mapa una vez)
  }
  
  isDriverGpsLive = true;
  AppState.set('driverGpsLive', 'on');
  if (typeof showToast === 'function') showToast('Ubicación Obtenida', 'El mapa se ha centrado en tu posición y el GPS está activo.', 'success', 2000);
  
  if (typeof transmitirUbicacionRepartidorServidorDB === 'function' && typeof currentGpsLat !== 'undefined' && typeof currentGpsLng !== 'undefined') {
    transmitirUbicacionRepartidorServidorDB(currentGpsLat, currentGpsLng);
  }
  
  // Activar seguirme automáticamente al presionar Mi ubicación
  activarSeguirme();
};

window.activarSeguirme = function() {
  isMapInteractedByUser = false;
  
  if (typeof currentGpsLat !== 'undefined' && typeof currentGpsLng !== 'undefined' && map) {
    map.flyTo([currentGpsLat, currentGpsLng], map.getZoom() || 16, { duration: 1.0 });
  }
  
  const btn = document.getElementById('btnDriverFollowMe');
  if (btn) {
    btn.style.background = '#059669'; // verde esmeralda para indicar ACTIVO
    btn.innerHTML = '🎯 SIGUIENDO';
  }
  
  if (typeof showToast === 'function') showToast('Seguimiento Activado', 'El mapa seguirá tus movimientos automáticamente.', 'info', 1500);
};

window.desactivarSeguirme = function() {
  if (isMapInteractedByUser) {
    const btn = document.getElementById('btnDriverFollowMe');
    if (btn && btn.innerHTML.includes('SIGUIENDO')) {
      btn.style.background = '#1E293B';
      btn.innerHTML = '🎯 INICIAR RECORRIDO';
      if (typeof showToast === 'function') showToast('Seguimiento Pausado', 'Modo exploración manual activo.', 'warning', 1500);
    }
  }
};

function toggleHeatmapOverlay() {
  window.isHeatmapActive = !window.isHeatmapActive;
  const btn = document.getElementById('btnDriverHeatmap');

  if (typeof renderHeatmapOverlay === 'function') {
    renderHeatmapOverlay();
  }

  if (btn) {
    if (window.isHeatmapActive) {
      btn.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ❌ SALIR MAPA DE CALOR';
      btn.style.background = 'linear-gradient(135deg, #D32F2F, #B71C1C)';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-fire"></i> 🔥 MAPA DE CALOR DE PEDIDOS';
      btn.style.background = '';
    }
  }
}



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
  return `<img src="icons/garrafa_red_clean.svg" style="width:24px; height:24px; vertical-align:middle; margin-right:6px; filter:drop-shadow(0 0 4px #FF1744);" alt="Gas GLP">`;
}






/* PURGA AUTOMÁTICA DE BASE DE DATOS LOCAL Y MEMORIA PARA EVITAR COLAPSO */


/* CAMBIO DE FAVICON E ICONO DE PESTAÑA SEGÚN EL TIPO DE PEDIDO SELECCIONADO */
function actualizarFaviconSegunPedido(categoria, estado = 'pendiente') {
  let favEl = document.getElementById('dynamicFavicon');
  if (!favEl) favEl = document.querySelector("link[rel*='icon']");
  if (!favEl) return;

  if (!categoria && !estado) {
    favEl.href = "favicon.svg?v=4";
    document.title = "NOTIGAS - Plataforma Vecinal en Vivo";
    return;
  }

  const cat = (categoria || '').toLowerCase();
  const getSvgUrl = (svgContent) => "data:image/svg+xml;utf8," + encodeURIComponent(svgContent);

  let color = "#FF1744"; // pendiente = rojo
  if (estado === 'visto') color = "#FFC107"; // visto = amarillo
  else if (estado === 'cancelado' || estado === 'entregado') color = "#00E676"; // final = verde

  if (cat.includes('gas')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${color}"/><path d="M35 15h30v10H35V15zm40 20H25v15h50V35zm5 20H20c-5.5 0-10 4.5-10 10v20c0 5.5 4.5 10 10 10h60c5.5 0 10-4.5 10-10V65c0-5.5-4.5-10-10-10z" fill="#FFF"/><circle cx="50" cy="75" r="10" fill="#E65100"/></svg>`);
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

// Función verificarGPSObligatorio eliminada para evitar redundancia y conflictos con conectarGPSAuto en map.js

function switchTab(index) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
  document.querySelectorAll('.tab-content').forEach((tab, i) => tab.classList.toggle('active', i === index));
  if (index === 0 && typeof map !== 'undefined' && map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

function getActiveUserLocation() {
  let lat = (typeof currentGpsLat !== 'undefined' && currentGpsLat) ? currentGpsLat : null;
  let lng = (typeof currentGpsLng !== 'undefined' && currentGpsLng) ? currentGpsLng : null;

  if (typeof userMarker !== 'undefined' && userMarker && userMarker.getLatLng) {
    try {
      const pos = userMarker.getLatLng();
      if (pos && pos.lat && pos.lng) {
        lat = pos.lat;
        lng = pos.lng;
      }
    } catch(e){}
  }
  return { lat, lng };
}








/* PANORÁMICA DE PEDIDOS ACTIVOS */
// FIX W-02: Reemplaza los mockOrders hardcodeados con datos reales de Supabase.






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
    navigator.serviceWorker.register('./sw.js?v=66')
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
            setInterval(cargarPedidosVecinalesEnVivo, 15000);
        }
    };

    document.addEventListener('notigas_auth_ready', initSupabaseFeatures);
});

// 3. Manejo de eventos globales
// (El guardado de estado en localStorage al cerrar ha sido eliminado)

// (El handler de error global ya está registrado al inicio del archivo)

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
