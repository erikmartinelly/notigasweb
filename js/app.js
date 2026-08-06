/* ==========================================================================
   NOTIGAS - MÓDULO PRINCIPAL DE NAVEGACIÓN,
   FAVICON DINÁMICO POR CATEGORÍA Y MODO REPARTIDOR EN RUTA
   ========================================================================== */

const ORDER_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Horas para Pedidos Activos

let currentAppMode = 'buyer';
let isDriverGpsLive = true;
window.isHeatmapActive = window.isHeatmapActive || false;

/* =====================================================
   SISTEMA DE LOADING GLOBAL (ANTI-FREEZE)
   ===================================================== */
let globalLoadingTimeout;

window.showLoadingOverlay = function(message = "Procesando...") {
  const overlay = document.getElementById('globalLoadingOverlay');
  const msgEl = document.getElementById('globalLoadingMessage');
  const btn = document.getElementById('globalLoadingCancelBtn');
  
  if (overlay && msgEl && btn) {
    msgEl.innerText = message;
    btn.style.display = 'none';
    overlay.style.display = 'flex';

    clearTimeout(globalLoadingTimeout);
    globalLoadingTimeout = setTimeout(() => {
      msgEl.innerText = "La conexión está tardando más de lo normal...";
      btn.style.display = 'block';
    }, 10000); // 10 segundos
  }
};

window.hideLoadingOverlay = function() {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    clearTimeout(globalLoadingTimeout);
  }
};

/* =====================================================
   SISTEMA DE TOAST NOTIFICATIONS (Reemplazo de alert())
   ===================================================== */
function showToast(title, message, type = 'info', durationMs = 1000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `notigas-toast toast-${type}`;
  toast.style.position = 'relative';
  toast.style.overflow = 'hidden';
  toast.style.setProperty('--toast-duration', `${durationMs}ms`);

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', order: '📦' };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <span class="toast-title">${title}</span>
      <span class="toast-msg">${message}</span>
    </div>
    <button class="toast-close" aria-label="Cerrar">&times;</button>
    <div class="toast-progress"></div>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('click', (e) => { if (e.target !== closeBtn) dismiss(); });

  container.appendChild(toast);

  // Auto-cierre
  setTimeout(dismiss, durationMs);
}

/* Modal de confirmación elegante (Reemplazo de confirm()) */
function showConfirmModal(icon, title, text, acceptLabel, acceptCallback) {
  const overlay = document.getElementById('confirmModalOverlay');
  if (!overlay) { if (confirm(text)) { acceptCallback(); } return; }

  document.getElementById('confirmModalIcon').textContent = icon;
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalText').textContent = text;

  const btnAccept = document.getElementById('confirmModalAccept');
  const btnCancel = document.getElementById('confirmModalCancel');

  btnAccept.textContent = acceptLabel || 'Confirmar';

  // Limpiar listeners previos
  const newAccept = btnAccept.cloneNode(true);
  const newCancel = btnCancel.cloneNode(true);
  btnAccept.parentNode.replaceChild(newAccept, btnAccept);
  btnCancel.parentNode.replaceChild(newCancel, btnCancel);

  overlay.style.display = 'flex';

  newAccept.addEventListener('click', () => {
    overlay.style.display = 'none';
    acceptCallback();
  });

  newCancel.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  // 🛡️ Filtro de Seguridad Geo-Bloqueo (Solo América)
  try {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
         // Permite Norteamérica (NA), Sudamérica (SA) y España (ES)
         if (data && data.continent_code && data.continent_code !== 'SA' && data.continent_code !== 'NA' && data.country_code !== 'ES') {
             document.body.innerHTML = `
                 <div style="background:#0F172A; width:100vw; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-family:'Inter', sans-serif; text-align:center; padding:20px; box-sizing:border-box;">
                     <h1 style="color:#FF1744; font-size:48px; margin:0;"><i class="fa-solid fa-earth-americas"></i></h1>
                     <h2 style="margin-top:10px;">Acceso Restringido</h2>
                     <p style="color:#94A3B8; font-size:14px; max-width:400px; line-height:1.5;">
                         NOTIGAS es una plataforma exclusiva para América.<br>Tu conexión proviene de <strong>${data.country_name || 'otra región'}</strong>, por lo que el acceso ha sido bloqueado por motivos de seguridad.
                     </p>
                 </div>
             `;
         }
      }).catch(e => console.warn("GeoIP Check failed"));
  } catch(e){}

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

  // REQUERIR GPS OBLIGATORIO Y PURGA AUTOMÁTICA DE BASE DE DATOS AL CARGAR
  // verificarGPSObligatorio() eliminada para no causar doble petición y bloquear PC
  ejecutarPurgaBaseDeDatosAuto();
  checkActiveOrderStatus();

  // REGISTRO OFICIAL DE SERVICE WORKER PWA PARA SOPORTE OFFLINE Y VELOCIDAD
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // AUTODETECTAR Y ACTIVAR MODO SEGÚN ROL REGISTRADO (COMPRADOR VS REPARTIDOR)
  try {
    const saved = localStorage.getItem('notigas_user_data');
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
    const saved = localStorage.getItem('notigas_user_data');
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
      const gpsVal = localStorage.getItem('driverGpsLive') || 'on';
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
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      setVal('inputDriverNombre', u.nombre);
      setVal('inputDriverTelRef', u.whatsapp);
      setVal('inputDriverPlate', u.placa);
      setVal('inputDriverCat', u.categoria);
      setVal('inputDriverProductos', u.productos);
      setVal('inputDriverZonas', u.zonas);
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
  const buyerActions = document.getElementById('buyerFloatingActions');
  const driverActions = document.getElementById('driverFloatingActions');
  const badgeContainer = document.getElementById('headerRoleBadge');

  if (mode === 'driver') {
    if (buyerActions) buyerActions.style.display = 'none';
    if (driverActions) driverActions.style.display = 'flex';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:11px; background:rgba(255,109,0,0.2); color:#FF6D00; padding:4px 10px; border-radius:12px; font-weight:900; border:1px solid #FF6D00;">🚛 MODO REPARTIDOR</span>
      `;
    }

    localStorage.setItem('driverGpsLive', 'on');
    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
  } else {
    if (buyerActions) buyerActions.style.display = 'flex';
    if (driverActions) driverActions.style.display = 'none';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span style="font-size:11px; background:rgba(2,136,209,0.2); color:#38BDF8; padding:4px 10px; border-radius:12px; font-weight:900; border:1px solid #0288D1;">🛍️ MODO COMPRADOR</span>
      `;
    }
  }
}

function toggleDriverGpsTransmission() {
  isDriverGpsLive = !isDriverGpsLive;
  const btn = document.getElementById('btnDriverGpsToggle');
  if (isDriverGpsLive) {
    localStorage.setItem('driverGpsLive', 'on');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-stop"></i> 🔴 PAUSAR RECORRIDO EN VIVO';
    showToast('GPS Activado', 'Tu ubicación exacta ahora es visible para los vecinos de tu OTB.', 'success', 1000);
    
    // Broadcast a Supabase
    let driverName = 'Repartidor';
    let driverCat = 'gas';
    try {
      const u = JSON.parse(localStorage.getItem('notigas_user_data'));
      if (u && u.nombre) driverName = u.nombre;
    } catch(e){}
    if (typeof window.startDriverLocationBroadcast === 'function') {
      window.startDriverLocationBroadcast(driverName, driverCat);
    }
  } else {
    localStorage.setItem('driverGpsLive', 'off');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-location-arrow"></i> 🟢 INICIAR RECORRIDO EN VIVO';
    showToast('GPS Pausado', 'Tu camión ha sido ocultado del mapa vecinal.', 'warning', 1000);
    
    // Detener Broadcast en Supabase
    if (typeof window.stopDriverLocationBroadcast === 'function') {
      window.stopDriverLocationBroadcast();
    }
  }
  if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
}

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

function abrirModalDriverOrders() {
  renderDriverOrdersList();
  const modal = document.getElementById('modalDriverOrders');
  if (modal) modal.style.display = 'flex';
}

function closeDriverOrdersModal() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) modal.style.display = 'none';
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



function renderDriverOrdersList() {
  const container = document.getElementById('driverOrdersContainer');
  if (!container) return;

  const activeOrderRaw = localStorage.getItem('notigas_active_order');
  let orders = [];

  if (activeOrderRaw) {
    try { 
      const parsedOrder = JSON.parse(activeOrderRaw);
      if (isOrderCategoryMatchingDriver(parsedOrder.categoria)) {
        orders.push(parsedOrder); 
      }
    } catch(e){}
  }

  // Lista simulada de demostración para el repartidor según su categoría exclusiva
  if (orders.length === 0) {
    const mockOrders = [
      { categoria: "🔥 Garrafa de Gas GLP", cantidad: "2 unidades", dist: "150m (Calle 4 #21)", timestamp: Date.now() - 300000 },
      { categoria: "💧 Botellón Agua 20L", cantidad: "1 unidad", dist: "320m (Av. Principal esquina Plaza)", timestamp: Date.now() - 600000 },
      { categoria: "🧹 Detergentes / Limpieza", cantidad: "2 galones lavandina", dist: "280m (Calle Bolivar #42)", timestamp: Date.now() - 450000 },
      { categoria: "🪵 Carbón / Leña", cantidad: "1 bolsa 10kg", dist: "450m (Calle 8 #45)", timestamp: Date.now() - 900000 }
    ];
    orders = mockOrders.filter(o => isOrderCategoryMatchingDriver(o.categoria));
    
    if (orders.length === 0) {
      let driverCategoryName = "tu categoría";
      try {
        const u = JSON.parse(localStorage.getItem('notigas_user_data') || '{}');
        if (u.categoria) driverCategoryName = u.categoria;
      } catch(e){}

      container.innerHTML = `<div style="padding:24px; text-align:center; color:#94A3B8; font-size:13px;"><i class="fa-solid fa-filter-circle-xmark" style="font-size:28px; color:#F59E0B; margin-bottom:10px;"></i><br><strong style="color:white;">No hay pedidos activos de ${driverCategoryName}</strong><br><span style="font-size:11px; color:#64748B;">Solo recibes pedidos de tu rubro exclusivo en este momento.</span></div>`;
      return;
    }
  }

  let html = '';
  orders.forEach(ord => {
    const iconHtml = obtenerIconoHtmlPorCategoria(ord.categoria);
    const chatTarget = ord.buyerName || 'Comprador Vecinal';
    const telNum = ord.telefono ? ord.telefono.replace(/[^0-9+]/g, '') : '';
    html += `
      <div class="driver-order-card">
        <div class="driver-order-header">
          <span class="driver-order-title" style="display:flex; align-items:center;">${iconHtml} ${escapeHtmlStr(ord.categoria)}</span>
          <span class="driver-order-dist">📍 ${ord.dist || 'Cerca de ti'}</span>
        </div>
        <div style="font-size: 11.5px; color: white; line-height:1.5;">
          <strong>Cliente:</strong> ${escapeHtmlStr(chatTarget)}<br>
          ${ord.callePrincipal ? `<span style="color:#FFB300; font-weight:700;">🏠 Dirección: ${escapeHtmlStr(ord.callePrincipal)}</span><br>` : ''}
          ${ord.telefono ? `<span style="color:#00E676; font-weight:700;">📞 Teléfono: ${escapeHtmlStr(ord.telefono)}</span><br>` : ''}
          <span style="font-size: 9.5px; color: #64748B;">Solicitado hace momentos • Coordenada Georeferenciada</span>
        </div>
        <div class="driver-order-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-driver-accept" style="flex:1;" onclick="aceptarPedidoRepartidor('${escapeHtmlStr(ord.categoria)}')"><i class="fa-solid fa-circle-check"></i> ✅ Aceptar</button>
          <button class="btn-driver-chat-vecino" style="flex:1;" onclick="abrirChatPrivadoConComprador('${encodeURIComponent(chatTarget)}')"><i class="fa-solid fa-comments"></i> 💬 Chat</button>
          ${telNum ? `<a href="tel:${telNum}" style="background:#0288D1; color:white; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:800; text-decoration:none; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-phone"></i> Llamar</a>` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function aceptarPedidoRepartidor(cat) {
  closeDriverOrdersModal();
  showToast('Pedido Aceptado', `Has aceptado la solicitud de ${cat}. El vecino ha sido notificado.`, 'success', 5000);
}

/* PURGA AUTOMÁTICA DE BASE DE DATOS LOCAL Y MEMORIA PARA EVITAR COLAPSO */
function ejecutarPurgaBaseDeDatosAuto() {
  const now = Date.now();

  try {
    const rawOrder = localStorage.getItem('notigas_active_order');
    if (rawOrder) {
      const order = JSON.parse(rawOrder);
      if (order.timestamp && (now - order.timestamp) > ORDER_EXPIRATION_MS) {
        localStorage.removeItem('notigas_active_order');
      }
    }
  } catch(e){}

  try {
    const rawPosts = localStorage.getItem('notigas_forum_posts');
    if (rawPosts) {
      let posts = JSON.parse(rawPosts);
      const cleanPosts = posts.filter(p => (now - p.timestamp) < (72 * 60 * 60 * 1000));
      localStorage.setItem('notigas_forum_posts', JSON.stringify(cleanPosts));
    }
  } catch(e){}

  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('notigas_private_chat_')) {
        const rawChat = localStorage.getItem(key);
        if (rawChat) {
          let chat = JSON.parse(rawChat);
          const cleanChat = chat.filter(m => (now - m.timestamp) < (48 * 60 * 60 * 1000));
          if (cleanChat.length === 0) {
            keysToRemove.push(key);
          } else {
            localStorage.setItem(key, JSON.stringify(cleanChat));
          }
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch(e){}
}


function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');
  const btnMain = document.getElementById('btnMainOrder');
  const chatBanner = document.getElementById('chatActivoBanner');
  const rawOrder = localStorage.getItem('notigas_active_order');
  
  if (rawOrder) {
    try {
      const order = JSON.parse(rawOrder);
      if (btnCancel) btnCancel.style.display = 'flex';
      if (btnMain) btnMain.style.display = 'none'; // Ocultar Hacer Pedido para dar espacio limpio a Cancelar Pedido
      if (chatBanner) chatBanner.style.display = 'flex';
      actualizarFaviconSegunPedido(order.categoria);
      if (typeof renderActiveOrdersMap === 'function') {
        renderActiveOrdersMap();
      }
      return;
    } catch(e){}
  }
  
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnMain) btnMain.style.display = 'flex'; // Restaurar Hacer Pedido
  if (chatBanner) chatBanner.style.display = 'none';
  actualizarFaviconSegunPedido(null);
  if (typeof renderActiveOrdersMap === 'function') {
    renderActiveOrdersMap();
  }
}

/* CAMBIO DE FAVICON E ICONO DE PESTAÑA SEGÚN EL TIPO DE PEDIDO SELECCIONADO */
function actualizarFaviconSegunPedido(categoria) {
  let favEl = document.getElementById('dynamicFavicon');
  if (!favEl) favEl = document.querySelector("link[rel*='icon']");
  if (!favEl) return;

  if (!categoria) {
    favEl.href = "favicon.svg?v=4";
    document.title = "NOTIGAS - Plataforma Vecinal en Vivo";
    return;
  }

  const cat = categoria.toLowerCase();
  const getSvgUrl = (svgContent) => "data:image/svg+xml;utf8," + encodeURIComponent(svgContent);

  if (cat.includes('gas')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FF6D00"/><path d="M35 15h30v10H35V15zm40 20H25v15h50V35zm5 20H20c-5.5 0-10 4.5-10 10v20c0 5.5 4.5 10 10 10h60c5.5 0 10-4.5 10-10V65c0-5.5-4.5-10-10-10z" fill="#FFF"/><circle cx="50" cy="75" r="10" fill="#E65100"/></svg>`);
    document.title = "🔥 Pedido Activo: Garrafa de Gas GLP - NOTIGAS";
  } else if (cat.includes('detergente') || cat.includes('limpieza')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#E040FB"/><path d="M40 10h20v15H40V10zm25 25H35v60h30V35zm-15 15c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z" fill="#FFF"/></svg>`);
    document.title = "🧼 Pedido Activo: Detergentes - NOTIGAS";
  } else if (cat.includes('agua')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#0288D1"/><path d="M50 15 C30 45, 20 60, 20 70 A30 30 0 0 0 80 70 C80 60, 70 45, 50 15 Z" fill="#FFF"/></svg>`);
    document.title = "💧 Pedido Activo: Agua 20L - NOTIGAS";
  } else if (cat.includes('chatarra')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#00E676"/><path d="M50 15 L65 40 H35 Z M20 50 L35 75 H5 Z M80 50 L95 75 H65 Z" fill="#FFF"/></svg>`);
    document.title = "♻️ Pedido Activo: Chatarra - NOTIGAS";
  } else if (cat.includes('papel')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#4FC3F7"/><rect x="25" y="20" width="50" height="60" rx="4" fill="#FFF"/><line x1="35" y1="35" x2="65" y2="35" stroke="#0288D1" stroke-width="4"/><line x1="35" y1="50" x2="65" y2="50" stroke="#0288D1" stroke-width="4"/><line x1="35" y1="65" x2="55" y2="65" stroke="#0288D1" stroke-width="4"/></svg>`);
    document.title = "📄 Pedido Activo: Papel / Cartón - NOTIGAS";
  } else if (cat.includes('frutas') || cat.includes('verduras')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FF5252"/><path d="M50 30 C30 30, 20 50, 20 65 C20 80, 35 90, 50 90 C65 90, 80 80, 80 65 C80 50, 70 30, 50 30 Z" fill="#FFF"/><path d="M50 15 Q60 10 65 25" stroke="#4CAF50" stroke-width="6" fill="none"/></svg>`);
    document.title = "🍎 Pedido Activo: Frutas / Verduras - NOTIGAS";
  } else if (cat.includes('carbón') || cat.includes('leña')) {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FF9100"/><path d="M50 15 C30 45, 60 55, 35 85 C65 85, 80 60, 50 15 Z" fill="#FFF"/></svg>`);
    document.title = "🪵 Pedido Activo: Carbón / Leña - NOTIGAS";
  } else {
    favEl.href = getSvgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FFC107"/><rect x="20" y="35" width="60" height="45" fill="#FFF"/><path d="M15 35 L50 15 L85 35 Z" fill="#FFF"/></svg>`);
    document.title = "📦 Pedido Activo: Encargo - NOTIGAS";
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
  let lat = (typeof currentGpsLat !== 'undefined' && currentGpsLat) ? currentGpsLat : -17.3895;
  let lng = (typeof currentGpsLng !== 'undefined' && currentGpsLng) ? currentGpsLng : -66.1568;

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

function abrirSubmenuPedidos() { 
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'flex'; 
}

function closeSubmenuModal() { 
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'none'; 
}

function seleccionarYPedirDirecto(catNombre) {
  closeSubmenuModal();
  const sel = document.getElementById('selectCategoria');
  if (sel && catNombre) {
    let foundIdx = -1;
    const cleanSearch = catNombre.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    for (let i = 0; i < sel.options.length; i++) {
      const cleanVal = sel.options[i].value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (cleanVal && (cleanVal.includes(cleanSearch) || cleanSearch.includes(cleanVal))) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx !== -1) {
      sel.selectedIndex = foundIdx;
    }
  }
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
}

function closePedidoModal() { 
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'none'; 
}

function confirmarPedido() {
  const pos = getActiveUserLocation();
  let cat = document.getElementById('selectCategoria')?.value || 'Garrafa de Gas GLP';
  
  if (cat.includes('Otros')) {
    const detail = (document.getElementById('inputOrderOtrosDetalle')?.value || '').trim();
    if (detail) {
      cat = `${cat} - ${detail}`;
    }
  }

  const inputAddr = (document.getElementById('inputCallePrincipal')?.value || '').trim();
  const inputTel = (document.getElementById('inputTelefonoComprador')?.value || '').trim();

  // Tanto la dirección como el teléfono son OPCIONALES (el mapa ya ubica al comprador vía GPS)
  const direccion = inputAddr || 'Ubicación fijada en mapa por GPS';
  const telefono = inputTel || '';

  let buyerName = 'Comprador Vecinal';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) buyerName = `${u.nombre}${u.apellido ? ' ' + u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  const activeOrderData = {
    categoria: cat,
    cantidad: '1 unidad',
    callePrincipal: direccion,
    telefono: telefono,
    buyerName: buyerName,
    lat: pos.lat,
    lng: pos.lng,
    timestamp: Date.now()
  };

  localStorage.setItem('notigas_active_order', JSON.stringify(activeOrderData));
  // Transmitir a Supabase (Realtime para el Mapa)
  if (window.supabaseClient) {
    window.supabaseClient.from('publicaciones').insert([{
        tipo: 'pedido',
        categoria: cat,
        titulo: `Pedido Vecinal: ${cat}`,
        descripcion: `Dirección: ${direccion}. Teléfono: ${telefono}`,
        ciudad: 'Cochabamba',
        barrio_otb: 'Global',
        user_email: (typeof getCurrentUserEmail === 'function') ? getCurrentUserEmail() : 'anonimo@notigas.com',
        user_role: 'comprador',
        latitude: pos.lat,
        longitude: pos.lng,
        distribuidor_nombre: buyerName
    }]).then(({ error }) => {
        if(error) console.error("Error enviando pedido a Supabase:", error);
        else console.log("✅ Pedido guardado en Supabase.");
    });
  }

  showToast('✅ ¡Pedido en Camino!', 'Tu orden ha sido confirmada y transmitida a los repartidores de tu zona. Permanece atento a tu teléfono y a la puerta.', 'success', 3000);
  closePedidoModal();
  checkActiveOrderStatus();

  if (typeof renderActiveOrdersMap === 'function') {
    renderActiveOrdersMap();
  }

  showToast('Pedido Publicado en Mapa', `🚀 ${cat}\n📍 ${direccion}${telefono ? '\n📞 Tel: ' + telefono : ''}`, 'order', 1000);
}

function cancelarPedidoActivo() {
  showConfirmModal('❌', '¿Cancelar tu pedido?', 'Tu pedido activo será eliminado del mapa y los repartidores dejarán de verlo.', 'Sí, cancelar', () => {
    localStorage.removeItem('notigas_active_order');
    checkActiveOrderStatus();
    if (typeof renderActiveOrdersMap === 'function') {
      renderActiveOrdersMap();
    }
    showToast('Pedido Cancelado', 'Se ha restaurado el estado normal de la aplicación.', 'error', 4000);
  });
}

/* PANORÁMICA DE PEDIDOS ACTIVOS */
function abrirPanoramicaPedidos() {
  let contenido = '';
  const now = Date.now();

  // Pedido propio activo
  const rawPropio = localStorage.getItem('notigas_active_order');
  if (rawPropio) {
    try {
      const o = JSON.parse(rawPropio);
      const minutos = Math.floor((now - o.timestamp) / 60000);
      contenido += `
        <div style="background: linear-gradient(135deg, rgba(255,109,0,0.15), rgba(0,230,118,0.08)); border: 1px solid #FF6D00; border-radius: 12px; padding: 12px; margin-bottom: 10px;">
          <div style="font-weight: 900; font-size: 13px; color: #FF6D00; margin-bottom: 6px;"><i class="fa-solid fa-box"></i> Tu Pedido Activo</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>📦 Producto:</strong> ${escapeHtmlStr(o.categoria)}</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>🔢 Cantidad:</strong> ${escapeHtmlStr(o.cantidad)}</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>🚦 Calle:</strong> ${escapeHtmlStr(o.callePrincipal || 'En mapa')}</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 4px;">⏱️ Publicado hace ${minutos} min</div>
          <button onclick="cancelarPedidoActivo(); cerrarPanoramicaPedidos();" style="margin-top:8px; background:#D32F2F; color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; width:100%;">❌ Cancelar este Pedido</button>
        </div>
      `;
    } catch(e){}
  }

  // Pedidos de otros vecinos en el mapa de calor
  const mockOrders = [
    { categoria: '🔥 Garrafa de Gas GLP', cantidad: '2 unidades', dist: '150m', callePrincipal: 'Calle 4 #21', timestamp: now - 300000 },
    { categoria: '💧 Botóllón Agua 20L', cantidad: '1 unidad', dist: '320m', callePrincipal: 'Av. Principal', timestamp: now - 600000 },
    { categoria: '🪵 Carbón / Leña', cantidad: '1 bolsa 10kg', dist: '450m', callePrincipal: 'Calle 8 #45', timestamp: now - 900000 },
  ];

  const colors = ['#00B0FF', '#00E676', '#FFB300'];
  mockOrders.forEach((o, i) => {
    const min = Math.floor((now - o.timestamp) / 60000);
    contenido += `
      <div style="background: rgba(30,41,59,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; margin-bottom: 8px; display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; background: rgba(${i===0?'0,176,255':i===1?'0,230,118':'255,179,0'},0.15); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">${o.categoria.split(' ')[0]}</div>
        <div style="flex:1;">
          <div style="font-size:12px; font-weight:700; color:white;">${escapeHtmlStr(o.categoria)}</div>
          <div style="font-size:11px; color:#94A3B8;">📦 ${escapeHtmlStr(o.cantidad)} • 📍 ${escapeHtmlStr(o.dist)} • ⏱️ hace ${min} min</div>
        </div>
        <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00E676; padding:3px 7px; border-radius:20px; font-weight:700;">ACTIVO</span>
      </div>
    `;
  });

  if (!contenido) {
    contenido = `<div style="text-align:center; color:#64748B; padding:20px 0;"><i class="fa-solid fa-inbox" style="font-size:32px; margin-bottom:10px; display:block;"></i>No hay pedidos activos en tu zona en este momento.</div>`;
  }

  let modal = document.getElementById('modalPanoramicaPedidos');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalPanoramicaPedidos';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:480px; max-height:80vh; overflow-y:auto;">
        <div class="modal-title">
          <span><i class="fa-solid fa-chart-bar"></i> 📊 Panorámica de Pedidos Activos</span>
          <button class="btn-close" onclick="cerrarPanoramicaPedidos()">✕</button>
        </div>
        <p style="font-size:11px; color:#94A3B8; margin-bottom:12px;">Resumen en tiempo real de los pedidos activos en tu zona. Los pedidos se actualizan automáticamente.</p>
        <div id="panoramicaContent"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const contentEl = document.getElementById('panoramicaContent');
  if (contentEl) contentEl.innerHTML = contenido;
  modal.style.display = 'flex';
}

function cerrarPanoramicaPedidos() {
  const modal = document.getElementById('modalPanoramicaPedidos');
  if (modal) modal.style.display = 'none';
}

function notificarEscucheCamion() {
  const pos = getActiveUserLocation();

  // Guardar en el buffer de reportes de vecinos (validez por 30 minutos)
  let buffer = [];
  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');
    if (raw) buffer = JSON.parse(raw);
  } catch(e){}

  const now = Date.now();
  buffer = buffer.filter(t => (now - t.timestamp) < (30 * 60 * 1000));

  let reporterName = "Un vecino";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) reporterName = u.nombre;
    }
  } catch(e){}

  buffer.unshift({
    id: Date.now(),
    lat: pos.lat,
    lng: pos.lng,
    timestamp: now,
    reporter: reporterName
  });

  localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(buffer));

  if (typeof renderReportedTrucksBuffer === 'function') {
    renderReportedTrucksBuffer();
  }

  mostrarPopupAlertaRepartidor(`🔔 <strong>AVISO VECINAL EN VIVO:</strong><br>${reporterName} acaba de reportar que escuchó al camión pasar por esta zona.`);
  showToast('¡Gracias Vecino!', 'Se ha fijado un marcador de Camión Oído/Visto en tu ubicación para que los demás vecinos lo vean.', 'success', 5000);
}

function lanzarEspecialEsperame() {
  const pos = getActiveUserLocation();

  // Guardar solicitud en el buffer de reportes
  let buffer = [];
  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');
    if (raw) buffer = JSON.parse(raw);
  } catch(e){}

  const now = Date.now();
  buffer = buffer.filter(t => (now - t.timestamp) < (30 * 60 * 1000));

  let reporterName = "Un vecino";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) reporterName = u.nombre;
    }
  } catch(e){}

  buffer.unshift({
    id: Date.now(),
    lat: pos.lat,
    lng: pos.lng,
    timestamp: now,
    reporter: `${reporterName} (🛑 Alerta Espérame)`
  });

  localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(buffer));

  if (typeof renderReportedTrucksBuffer === 'function') {
    renderReportedTrucksBuffer();
  }

  mostrarPopupAlertaRepartidor(`🛑 <strong>¡ALERTA VECINAL "ESPÉRAME"!</strong><br>${reporterName} solicita que el camión detenga su marcha cerca de esta ubicación.`);
  showToast('Alerta Emitida', `Se ha colocado un punto de alerta en el mapa visible para todos los vecinos y repartidores.`, 'warning', 1000);
}

function mostrarPopupAlertaRepartidor(mensajeHtml) {
  const popup = document.getElementById('driverAlertPopup');
  if (!popup) return;

  popup.innerHTML = mensajeHtml;
  popup.style.display = 'block';

  setTimeout(() => {
    if (popup) popup.style.display = 'none';
  }, 7000);
}
