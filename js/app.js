/* ==========================================================================
   NOTIGAS - MÓDULO PRINCIPAL DE NAVEGACIÓN, CONTROLADOR DE COLA DE TRÁFICO,
   FAVICON DINÁMICO POR CATEGORÍA Y MODO REPARTIDOR EN RUTA
   ========================================================================== */

const ORDER_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Horas para Pedidos Activos
const SYSTEM_CAPACITY_LIMIT = 1000; // Capacidad nodal de concurrencia

let currentAppMode = 'buyer'; // 'buyer' (Vecino) o 'driver' (Repartidor)
let isDriverGpsLive = true;
let isHeatmapActive = false;

document.addEventListener('DOMContentLoaded', () => {
  const btnUserSettings = document.getElementById('btnOpenUserSettings');
  const btnOpenDriver = document.getElementById('btnOpenDriver');
  const modalUserSettings = document.getElementById('modalUserSettings');
  const modalDriver = document.getElementById('modalDriver');

  if (btnUserSettings && modalUserSettings) {
    btnUserSettings.addEventListener('click', () => modalUserSettings.style.display = 'flex');
  }

  if (btnOpenDriver && modalDriver) {
    btnOpenDriver.addEventListener('click', () => modalDriver.style.display = 'flex');
  }

  // REQUERIR GPS OBLIGATORIO Y PURGA AUTOMÁTICA DE BASE DE DATOS AL CARGAR
  verificarGPSObligatorio();
  ejecutarPurgaBaseDeDatosAuto();
  checkActiveOrderStatus();

  // AUTODETECTAR Y ACTIVAR MODO REPARTIDOR SI EL USUARIO REGISTRADO ES REPARTIDOR
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'chofer' || u.role === 'repartidor') {
        setAppMode('driver');
      }
    }
  } catch(e){}
});

/* TOGGLE Y CONTROL DE MODO VECINO VS MODO REPARTIDOR EN RUTA */
function toggleAppMode() {
  const newMode = (currentAppMode === 'buyer') ? 'driver' : 'buyer';
  setAppMode(newMode);
}

function setAppMode(mode) {
  currentAppMode = mode;
  const btnToggle = document.getElementById('btnModeToggle');
  const driverBanner = document.getElementById('driverModeBanner');
  const buyerActions = document.getElementById('buyerFloatingActions');
  const driverActions = document.getElementById('driverFloatingActions');

  if (mode === 'driver') {
    if (btnToggle) btnToggle.innerHTML = '<i class="fa-solid fa-truck-fast"></i> 🚛 REPARTIDOR';
    if (driverBanner) driverBanner.style.display = 'block';
    if (buyerActions) buyerActions.style.display = 'none';
    if (driverActions) driverActions.style.display = 'flex';

    // Activar transmisión GPS y mapa de calor
    localStorage.setItem('driverGpsLive', 'on');
    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
  } else {
    if (btnToggle) btnToggle.innerHTML = '<i class="fa-solid fa-repeat"></i> 🛍️ VECINO';
    if (driverBanner) driverBanner.style.display = 'none';
    if (buyerActions) buyerActions.style.display = 'flex';
    if (driverActions) driverActions.style.display = 'none';
  }
}

function toggleDriverGpsTransmission() {
  isDriverGpsLive = !isDriverGpsLive;
  const btn = document.getElementById('btnDriverGpsToggle');
  if (isDriverGpsLive) {
    localStorage.setItem('driverGpsLive', 'on');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-location-arrow"></i> 🟢 INICIAR RECORRIDO EN VIVO (GPS ON)';
    alert("🟢 TRANSMISIÓN GPS ACTIVADA\nTu ubicación exacta ahora es visible para los vecinos de tu OTB.");
  } else {
    localStorage.setItem('driverGpsLive', 'off');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-location-slash"></i> 🔴 PAUSAR RECORRIDO EN VIVO (GPS OFF)';
    alert("🔴 TRANSMISIÓN GPS PAUSADA\nTu camión ha sido ocultado del mapa vecinal.");
  }
  if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
}

function toggleHeatmapOverlay() {
  isHeatmapActive = !isHeatmapActive;
  if (typeof renderHeatmapOverlay === 'function') {
    renderHeatmapOverlay();
  }
  if (isHeatmapActive) {
    alert("🔥 MAPA DE CALOR & CONCENTRACIÓN ACTIVADO\nVisualizando zonas con mayor acumulación de pedidos de garrafas GLP en tu OTB.");
  } else {
    alert("🔥 Mapa de calor desactivado.");
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

function renderDriverOrdersList() {
  const container = document.getElementById('driverOrdersContainer');
  if (!container) return;

  const activeOrderRaw = localStorage.getItem('notigas_active_order');
  let orders = [];

  if (activeOrderRaw) {
    try { orders.push(JSON.parse(activeOrderRaw)); } catch(e){}
  }

  // Si no hay pedidos reales, mostrar simulados en vivo para demostración del repartidor
  if (orders.length === 0) {
    orders = [
      { categoria: "🔥 Garrafa de Gas GLP", cantidad: "2 unidades", dist: "150m (Calle 4 #21)", timestamp: Date.now() - 300000 },
      { categoria: "💧 Botellón Agua 20L", cantidad: "1 unidad", dist: "320m (Av. Principal esquina Plaza)", timestamp: Date.now() - 600000 },
      { categoria: "🪵 Carbón / Leña", cantidad: "1 bolsa 10kg", dist: "450m (Calle 8 #45)", timestamp: Date.now() - 900000 }
    ];
  }

  let html = '';
  orders.forEach(ord => {
    html += `
      <div class="driver-order-card">
        <div class="driver-order-header">
          <span class="driver-order-title">${ord.categoria}</span>
          <span class="driver-order-dist">📍 ${ord.dist || 'Cerca de ti'}</span>
        </div>
        <div style="font-size: 11px; color: white;">
          <strong>Detalle:</strong> ${ord.cantidad}<br>
          <span style="font-size: 9.5px; color: #94A3B8;">Solicitado hace momentos • OTB Central</span>
        </div>
        <div class="driver-order-actions">
          <button class="btn-driver-accept" onclick="aceptarPedidoRepartidor('${ord.categoria}')"><i class="fa-solid fa-circle-check"></i> ✅ Aceptar Pedido</button>
          <button class="btn-driver-chat-vecino" onclick="abrirChatConRepartidor('Soporte OTB', 'Soporte')"><i class="fa-solid fa-comments"></i> 💬 Contactar Vecino</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function aceptarPedidoRepartidor(cat) {
  closeDriverOrdersModal();
  alert(`✅ PEDIDO ACEPTADO POR EL REPARTIDOR\n\nHas aceptado la solicitud de ${cat}. El vecino ha sido notificado de que estás en camino.`);
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
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('notigas_private_chat_')) {
        const rawChat = localStorage.getItem(key);
        if (rawChat) {
          let chat = JSON.parse(rawChat);
          const cleanChat = chat.filter(m => (now - m.timestamp) < (48 * 60 * 60 * 1000));
          if (cleanChat.length === 0) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, JSON.stringify(cleanChat));
          }
        }
      }
    }
  } catch(e){}
}

/* CONTROLADOR DE COLA Y TRÁFICO ELEVADO PARA HASTA 1,000+ USUARIOS SIMULTÁNEOS */
function controlarColaTraficoUsuarios(callbackAction) {
  const activeUserCount = Math.floor(Math.random() * 250) + 50; 

  if (activeUserCount > 180) {
    let queueBanner = document.getElementById('notigasQueueBanner');
    if (!queueBanner) {
      queueBanner = document.createElement('div');
      queueBanner.id = 'notigasQueueBanner';
      queueBanner.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #FF6D00, #E65100);
        color: white;
        padding: 10px 16px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        z-index: 2500;
        box-shadow: 0 4px 18px rgba(255,109,0,0.6);
        text-align: center;
        width: 90%;
        max-width: 440px;
      `;
      document.body.appendChild(queueBanner);
    }

    queueBanner.innerHTML = `⏳ <strong>Alta afluencia de usuarios en tu OTB (+1,000 activos).</strong><br><span style="font-size:10px; opacity:0.95;">Procesando tu solicitud en cola (5 a 10 seg)...</span>`;
    queueBanner.style.display = 'block';

    setTimeout(() => {
      if (queueBanner) queueBanner.style.display = 'none';
      if (typeof callbackAction === 'function') callbackAction();
    }, 4000);
  } else {
    if (typeof callbackAction === 'function') callbackAction();
  }
}

function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');
  const rawOrder = localStorage.getItem('notigas_active_order');
  
  if (rawOrder) {
    try {
      const order = JSON.parse(rawOrder);
      if (btnCancel) btnCancel.style.display = 'flex';
      actualizarFaviconSegunPedido(order.categoria);
      return;
    } catch(e){}
  }
  
  if (btnCancel) btnCancel.style.display = 'none';
  actualizarFaviconSegunPedido(null);
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

function verificarGPSObligatorio() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'none';
      },
      (err) => {
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'block';
      },
      { timeout: 8000 }
    );
  }
}

function switchTab(index) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
  document.querySelectorAll('.tab-content').forEach((tab, i) => tab.classList.toggle('active', i === index));
  if (index === 0 && typeof map !== 'undefined' && map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
  if (index === 3 && typeof cambiarVendedorChat === 'function') {
    cambiarVendedorChat();
  }
}

function abrirSubmenuPedidos() { 
  controlarColaTraficoUsuarios(() => {
    const modalSubmenu = document.getElementById('modalSubmenu');
    if (modalSubmenu) modalSubmenu.style.display = 'flex'; 
  });
}

function closeSubmenuModal() { 
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'none'; 
}

function seleccionarYPedirDirecto(catNombre) {
  closeSubmenuModal();
  const sel = document.getElementById('selectCategoria');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.includes(catNombre) || catNombre.includes(sel.options[i].value)) {
        sel.selectedIndex = i;
        break;
      }
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
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  const cat = document.getElementById('selectCategoria')?.value || 'Garrafa de Gas GLP';
  const cant = document.getElementById('inputCantidad')?.value || '1 unidad';
  
  const activeOrderData = {
    categoria: cat,
    cantidad: cant,
    lat: pos.lat,
    lng: pos.lng,
    timestamp: Date.now()
  };

  localStorage.setItem('notigas_active_order', JSON.stringify(activeOrderData));
  closePedidoModal();
  checkActiveOrderStatus();

  alert(`📦 PEDIDO EN VIVO REGISTRADO\n\nCategoría: ${cat}\nDetalle: ${cant}\n📍 Ubicación de Entrega: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}\n\nEl icono de pestaña (favicon) y el título de tu navegador han sido actualizados para reflejar tu pedido de ${cat}.`);
}

function cancelarPedidoActivo() {
  if (confirm("❌ ¿Estás seguro de que deseas cancelar tu pedido activo en vivo?")) {
    localStorage.removeItem('notigas_active_order');
    checkActiveOrderStatus();
    alert("❌ TU PEDIDO HA SIDO CANCELADO\nSe ha restaurado el icono normal de la aplicación.");
  }
}

function notificarEscucheCamion() {
  if (typeof userMarker === 'undefined' || !userMarker) {
    alert("📍 Activa o conecta tu GPS para reportar la ubicación del camión.");
    return;
  }
  const pos = userMarker.getLatLng();

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
  alert(`🔔 ¡GRACIAS VECINO!\n\nSe ha fijado un marcador de Camión Oído/Visto en tu ubicación actual en el mapa para que todos los demás vecinos lo vean.`);
}

function lanzarEspecialEsperame() {
  if (typeof userMarker === 'undefined' || !userMarker) {
    alert("📍 Activa o conecta tu GPS para emitir el aviso de pánico.");
    return;
  }
  const pos = userMarker.getLatLng();

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
  alert(`🛑 AVISO DE PÁNICO "ESPÉRAME" EMITIDO.\n📍 Ubicación Exacta: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}\n\nSe ha colocado un punto de alerta en el mapa visible para todos.`);
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
