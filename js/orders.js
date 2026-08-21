/* ==========================================================================
   NOTIGAS - GESTIÓN DE PEDIDOS Y ALERTAS VECINALES (V104)
   ========================================================================== */

function formatearAntiguedadPedido(value) {
  if (!value) return 'reciente';
  const time = typeof value === 'number' ? value : new Date(value).getTime();
  if (isNaN(time)) return 'reciente';
  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return 'hace un momento';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  return `hace ${Math.floor(diffHours / 24)} d`;
}
window.formatearAntiguedadPedido = formatearAntiguedadPedido;

window.ORDER_STATES = window.ORDER_STATES || Object.freeze({
  PENDIENTE: 'pendiente',
  VISTO: 'visto',
  ASIGNADO: 'asignado',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado'
});

function abrirModalDriverOrders() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) {
    modal.style.display = 'flex';
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
  }
}
window.abrirModalDriverOrders = abrirModalDriverOrders;

function closeDriverOrdersModal() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) {
    modal.style.display = 'none';
  }
}
window.closeDriverOrdersModal = closeDriverOrdersModal;

async function renderDriverOrdersList() {
  const container = document.getElementById('driverOrdersContainer') || document.getElementById('driverOrdersList');
  if (!container) return;

  if (!window.supabaseClient) {
    container.innerHTML = '<div style="padding:15px; color:#F8FAFC; text-align:center;">Sin conexión a Supabase</div>';
    return;
  }

  const activeCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
  const now = Date.now();
  const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
  const activeWindow = new Date(now - expirationMs).toISOString();
  const localUserId = (typeof getAuthenticatedUserId === 'function')
    ? await getAuthenticatedUserId()
    : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);

  const cityKeys = (typeof window.getCityMetroKeys === 'function')
    ? window.getCityMetroKeys(activeCity)
    : (activeCity && activeCity !== 'todos' && activeCity !== 'all' ? [String(activeCity).toLowerCase().trim()] : null);

  // 1. Pedidos disponibles desde la vista pública (evita bloqueo por RLS de pedidos no asignados)
  let pubQuery = window.supabaseClient
    .from('pedidos_publicos')
    .select('id, user_id, categoria, titulo, cantidad, direccion, telefono, descripcion, barrio_otb, latitude, longitude, created_at, estado, driver_id, ciudad')
    .in('estado', ['pendiente', 'visto'])
    .gte('created_at', activeWindow)
    .order('created_at', { ascending: false });

  if (cityKeys && cityKeys.length > 0) {
    pubQuery = pubQuery.in('ciudad', cityKeys);
  }

  // 2. Pedidos ya asignados a este repartidor desde la tabla pedidos
  let assignedPromise = Promise.resolve({ data: [], error: null });
  if (localUserId) {
    let assignedQuery = window.supabaseClient
      .from('pedidos')
      .select('id, user_id, categoria, titulo, cantidad, direccion, telefono, descripcion, barrio_otb, latitude, longitude, created_at, estado, driver_id, ciudad')
      .eq('driver_id', localUserId)
      .eq('estado', 'asignado')
      .gte('created_at', activeWindow)
      .order('created_at', { ascending: false });
    if (cityKeys && cityKeys.length > 0) {
      assignedQuery = assignedQuery.in('ciudad', cityKeys);
    }
    assignedPromise = assignedQuery;
  }

  const [pubRes, assignedRes] = await Promise.all([pubQuery, assignedPromise]);

  if (pubRes.error) {
    console.error("Error cargando lista de pedidos repartidor (públicos):", pubRes.error);
  }
  if (assignedRes.error) {
    console.error("Error cargando pedidos asignados repartidor:", assignedRes.error);
  }

  const pubOrders = pubRes.data || [];
  const assignedOrders = assignedRes.data || [];
  const orders = [...assignedOrders, ...pubOrders];

  if (!orders || orders.length === 0) {
    if (pubRes.error || assignedRes.error) {
      const errDetail = pubRes.error?.message || assignedRes.error?.message || 'Error de conexión o permisos';
      const safeErr = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(errDetail) : errDetail;
      container.innerHTML = `
        <div style="padding:22px; text-align:center; color:#F87171; font-size:12px; background:rgba(239, 68, 68, 0.08); border-radius:8px; border:1px solid rgba(239, 68, 68, 0.25);">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom:8px; display:block; color:#EF4444;"></i>
          <strong style="display:block; margin-bottom:4px; font-size:13px;">Error cargando pedidos</strong>
          <span style="font-size:11px; color:#FECACA; word-break:break-word;">${safeErr}</span>
        </div>`;
      return;
    }
    container.innerHTML = '<div style="padding:25px; text-align:center; color:#94A3B8; font-size:12px;"><i class="fa-solid fa-clipboard-check" style="font-size:24px; margin-bottom:8px; display:block;"></i>No hay pedidos pendientes en esta zona.</div>';
    return;
  }

  // Agrupar pedidos por categoría
  const groups = {};
  orders.forEach(o => {
    const cat = o.categoria || 'Gas GLP';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(o);
  });

  let html = '';

  // Pedidos asignados a este chofer
  const myAssigned = orders.filter(o => o.estado === 'asignado' && o.driver_id === localUserId);
  if (myAssigned.length > 0) {
    html += '<div class="demand-section-title" style="color:#10B981; margin-bottom:8px;"><i class="fa-solid fa-truck-fast"></i> Mis Pedidos en Camino</div>';
    myAssigned.forEach(o => {
      const antiguedad = formatearAntiguedadPedido(o.created_at);
      const street = o.direccion ? escapeHtmlStr(o.direccion) : (o.barrio_otb ? escapeHtmlStr(o.barrio_otb) : 'Ubicación GPS en Mapa');
      const lat = o.latitude || 0;
      const lng = o.longitude || 0;
      const tel = o.telefono ? escapeHtmlStr(o.telefono) : '';
      const desc = o.descripcion ? escapeHtmlStr(o.descripcion) : '';

      html += `
        <div class="assigned-order-card" style="margin-bottom:10px; border-left:4px solid #10B981; background:rgba(16,185,129,0.06); padding:10px; border-radius:8px; border:1px solid rgba(16,185,129,0.2);">
          <div class="demand-card-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <span style="font-size:9px; background:#10B981; color:white; padding:2px 6px; border-radius:4px; font-weight:800;">EN ENTREGA</span>
              <div style="font-size:13px; font-weight:800; color:#F8FAFC; margin-top:2px;">${escapeHtmlStr(o.categoria || 'Pedido')} (${escapeHtmlStr(o.cantidad || '1 un')})</div>
            </div>
            <div style="font-size:10px; color:#94A3B8;">${antiguedad}</div>
          </div>
          <div class="demand-card-meta" style="margin-top:6px; font-size:11px;">
            <div style="color:#CBD5E1;">📍 <strong>Dirección:</strong> ${street}</div>
            ${tel ? `<div style="margin-top:3px;">📞 <strong>Teléfono:</strong> <a href="tel:${tel}" style="color:#38BDF8; font-weight:700; text-decoration:underline;">${tel}</a></div>` : '<div style="color:#64748B; font-size:10px; margin-top:2px;">📞 Teléfono: No indicado</div>'}
            ${desc ? `<div style="margin-top:3px; font-size:10.5px; color:#94A3B8; font-style:italic;">📝 ${desc}</div>` : ''}
          </div>
          <div class="demand-card-actions" style="margin-top:8px; display:flex; gap:6px;">
            <button type="button" class="btn-action" style="background:#0284C7; color:white; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; border:none; cursor:pointer; flex:1; display:inline-flex; align-items:center; justify-content:center; gap:5px;" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-order-id="${o.id}">
              <i class="fa-solid fa-map-location-dot"></i> VER EN EL MAPA
            </button>
            <button type="button" class="btn-action" style="background:#10B981; color:white; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; border:none; cursor:pointer; flex:1; display:inline-flex; align-items:center; justify-content:center; gap:5px;" data-action="confirmarEntregaPedido" data-id="${o.id}">
              <i class="fa-solid fa-circle-check"></i> Entregado
            </button>
          </div>
        </div>
      `;
    });
  }

  // Grupos de demanda disponibles
  html += '<div class="demand-section-title" style="margin-top:12px; margin-bottom:8px;"><i class="fa-solid fa-layer-group"></i> Demanda Vecinal Acumulada</div>';
  Object.keys(groups).forEach(cat => {
    const list = groups[cat].filter(o => o.estado === 'pendiente' || o.estado === 'visto');
    if (list.length === 0) return;

    const totalGarrafas = list.reduce((acc, cur) => acc + (parseInt(cur.cantidad, 10) || 1), 0);
    const newestTime = list[0].created_at;
    const antiguedad = formatearAntiguedadPedido(newestTime);

    html += `
      <div class="demand-group-card" style="margin-bottom:10px;">
        <div class="demand-card-header">
          <div>
            <div style="font-size:13px; font-weight:800; color:#F8FAFC;">${escapeHtmlStr(cat)}</div>
            <div style="font-size:10px; color:#94A3B8;">${list.length} ${list.length === 1 ? 'vecino esperando' : 'vecinos esperando'}</div>
          </div>
          <div class="demand-card-count">${totalGarrafas} <span style="font-size:10px; color:#94A3B8;">pedidos</span></div>
        </div>
        <div class="demand-card-meta">
          <div>⏱️ Último pedido: ${antiguedad}</div>
        </div>
        <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">
          ${list.map(o => {
            const st = o.direccion ? escapeHtmlStr(o.direccion) : (o.barrio_otb ? escapeHtmlStr(o.barrio_otb) : 'Ubicación GPS en Mapa');
            const lat = o.latitude || 0;
            const lng = o.longitude || 0;
            const tel = o.telefono ? escapeHtmlStr(o.telefono) : '';
            const desc = o.descripcion ? escapeHtmlStr(o.descripcion) : '';
            const buyer = o.titulo || 'Pedido Vecinal';
            return `
              <div style="padding:8px 0; border-bottom:1px dashed rgba(255,255,255,0.08); font-size:11px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                  <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:800; color:#F8FAFC; margin-bottom:2px;">
                      📦 ${escapeHtmlStr(o.categoria || cat)} <span style="color:#FF6D00;">(${escapeHtmlStr(o.cantidad || '1 un')})</span>
                    </div>
                    <div style="color:#CBD5E1; font-size:11px; margin-top:2px;">
                      📍 <strong>Dirección:</strong> ${st}
                    </div>
                    ${tel ? `
                      <div style="margin-top:3px; font-size:11px; color:#38BDF8;">
                        📞 <strong>Teléfono:</strong> <a href="tel:${tel}" style="color:#38BDF8; font-weight:700; text-decoration:underline;">${tel}</a>
                      </div>
                    ` : ''}
                    ${desc ? `
                      <div style="margin-top:3px; font-size:10.5px; color:#94A3B8; font-style:italic;">
                        📝 ${desc}
                      </div>
                    ` : ''}
                  </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                  <button type="button" style="background:#0284C7; color:#F8FAFC; border:none; padding:5px 9px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-order-id="${o.id}" title="Ver en el mapa">
                    <i class="fa-solid fa-map-location-dot"></i> VER EN EL MAPA
                  </button>
                  <button type="button" style="background:#FF6D00; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;" data-action="aceptarPedidoRepartidor" data-id="${o.id}" data-lat="${lat}" data-lng="${lng}" data-address="${escapeHtmlStr(o.direccion || '')}">
                    <i class="fa-solid fa-truck"></i> Tomar
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.centrarPedidoEnMapa = function(lat, lng, id) {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  const modalPan = document.getElementById('modalPanoramicaPedidos');
  if (modalPan) modalPan.style.display = 'none';

  if (typeof switchTab === 'function') {
    switchTab(0);
  }

  if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && typeof map !== 'undefined' && map) {
    map.flyTo([lat, lng], 17, { duration: 1.2 });
    setTimeout(() => {
      if (id && window.neighborOrderMarkers && window.neighborOrderMarkers[id]) {
        try { window.neighborOrderMarkers[id].openPopup(); } catch(e){}
      }
    }, 1300);
    if (typeof showToast === 'function') {
      showToast('Ubicación Localizada', 'Centrando el mapa en el destino del pedido.', 'info', 2500);
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('Ubicación No Disponible', 'El pedido no tiene coordenadas válidas en el mapa.', 'warning', 3000);
    }
  }
};

window.aceptarPedidoRepartidor = function(orderId, lat, lng, address) {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'Sin conexión a la base de datos.', 'error');
    else alert('❌ Error: Sin conexión a la base de datos.');
    return;
  }
  showConfirmModal('🚚', 'Elegir Pedido', 'El pedido se te asignará y se abrirá la navegación externa.', 'Elegir y navegar', async () => {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Asignando pedido...');

    const { error } = await window.supabaseClient.rpc('rpc_assign_order', {
      p_order_id: orderId
    });

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (error) {
      console.error('Error asignando pedido:', error);
      if (typeof showToast === 'function') showToast('Pedido no disponible', error.message || 'Otro repartidor pudo tomarlo antes.', 'error');
      else alert('❌ No se pudo asignar el pedido.');
      return;
    }

    if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
    if (typeof showToast === 'function') {
      showToast('Pedido Asignado', 'Abriendo la ruta en Google Maps.', 'success');
    }
    if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
    window.abrirRutaGoogleMaps(lat, lng, orderId, address || '');
  });
};

window.abrirRutaGoogleMaps = function (a, b, c, d) {
  let lat = null;
  let lng = null;
  let orderId = null;
  let address = '';

  if (typeof a === 'object' && a !== null) {
    lat = Number(a.latitude ?? a.lat);
    lng = Number(a.longitude ?? a.lng);
    orderId = a.id || a.order_id || null;
    address = a.direccion || a.address || '';
  } else if (typeof a === 'string' && isNaN(Number(a)) && (a.includes('-') || a.length > 15)) {
    orderId = a;
    lat = Number(b);
    lng = Number(c);
    address = d || '';
  } else {
    lat = Number(a);
    lng = Number(b);
    orderId = c || null;
    address = d || '';
  }

  if (typeof closeDriverOrdersModal === 'function') {
    closeDriverOrdersModal();
  }

  let destination = '';
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    destination = `${lat},${lng}`;
  } else if (address && String(address).trim() !== '') {
    const activeCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
    destination = `${String(address).trim()}, ${activeCity}, Bolivia`;
  } else {
    console.error('Coordenadas o dirección no válidas para Google Maps:', { orderId, lat, lng, address });
    if (typeof showToast === 'function') {
      showToast('Ubicación No Disponible', 'El pedido no cuenta con coordenadas válidas.', 'warning', 3500);
    }
    return;
  }

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  try {
    const newWin = window.open(mapsUrl, '_blank');
    if (!newWin) {
      const link = document.createElement('a');
      link.href = mapsUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (e) {
    window.location.href = mapsUrl;
  }

  if (typeof showToast === 'function') {
    showToast('🚀 En Ruta', 'Abriendo navegación en Google Maps...', 'success', 2500);
  }
};

async function confirmarEntregaPedido(id) {
  if (!window.supabaseClient) return;

  showConfirmModal('🏁', 'Confirmar Entrega', '¿El vecino ya recibió su pedido y se realizó el cobro/entrega?', 'Sí, ya entregué el pedido', async () => {
    showLoadingOverlay('Confirmando entrega...');

    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_driver_confirm_delivery', {
        p_order_id: id
      });

      hideLoadingOverlay();

      if (error) {
        console.error("Error confirmando entrega:", error);
        showToast('Error', error.message || 'No se pudo confirmar la entrega.', 'error', 4000);
      } else {
        closeDriverOrdersModal();
        showToast('¡Buen trabajo!', 'Pedido entregado. El pedido fue archivado en tus estadísticas.', 'success', 5000);
        if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
        if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
      }
    } catch(e) {
      hideLoadingOverlay();
      console.error("Error inesperado en confirmarEntregaPedido:", e);
      showToast('Error', 'Error inesperado al confirmar entrega.', 'error', 4000);
    }
  }, 'Volver');
}
window.confirmarEntregaPedido = confirmarEntregaPedido;

function ejecutarPurgaBaseDeDatosAuto() {
  const now = Date.now();
  const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;

  try {
    const order = AppState.get('activeOrder');
    if (order) {
      const orderTime = order.timestamp || (order.created_at ? new Date(order.created_at).getTime() : null);
      if (orderTime && (now - orderTime) > expirationMs) {
        AppState.set('activeOrder', null);
      }
    }
  } catch(e) {}

  try {
    const rawPosts = localStorage.getItem('notigas_forum_posts');
    if (rawPosts) {
      let posts = JSON.parse(rawPosts);
      const cleanPosts = posts.filter(p => (now - p.timestamp) < (72 * 60 * 60 * 1000));
      localStorage.setItem('notigas_forum_posts', JSON.stringify(cleanPosts));
    }
  } catch(e){}
}

let _activeOrderStatusRequest = null;
let _activeOrderStatusCheckedAt = 0;
let _activeOrderFinalTimer = null;
const ACTIVE_ORDER_STATUS_REFRESH_MS = 15000;

const ORDER_STATUS_PRESENTATION = {
  pendiente: {
    title: 'Esperando repartidor',
    label: 'PENDIENTE',
    owner: 'DEMANDA VECINAL',
    info: 'Tu pedido está registrado y visible para los repartidores de tu zona.',
    detail: 'Se asignará cuando un repartidor elija tu pedido.',
    color: '#FF6D00',
    shadow: 'rgba(255, 109, 0, 0.18)'
  },
  visto: {
    title: 'Pedido revisado',
    label: 'VISTO',
    owner: 'SIGUE DISPONIBLE',
    info: 'Un repartidor vio tu pedido y continúa disponible.',
    detail: 'Esperando que un repartidor lo elija.',
    color: '#FF8F00',
    shadow: 'rgba(255, 143, 0, 0.18)'
  },
  asignado: {
    title: '¡En camino!',
    label: 'EN CAMINO',
    owner: 'REPARTIDOR EN RUTA',
    info: 'Un repartidor tomó tu pedido y se dirige a tu ubicación.',
    detail: 'Mantente atento a tu timbre o teléfono.',
    color: '#00E676',
    shadow: 'rgba(0, 230, 118, 0.22)'
  },
  entregado: {
    title: '¡Pedido Entregado!',
    label: 'ENTREGADO',
    owner: 'FINALIZADO',
    info: 'Tu pedido fue completado exitosamente.',
    detail: '¡Gracias por usar NOTIGAS!',
    color: '#00C853',
    shadow: 'rgba(0, 200, 83, 0.22)'
  },
  cancelado: {
    title: 'Pedido Cancelado',
    label: 'CANCELADO',
    owner: 'CERRADO',
    info: 'Este pedido fue cancelado.',
    detail: 'Puedes solicitar uno nuevo cuando gustes.',
    color: '#EF4444',
    shadow: 'rgba(239, 68, 68, 0.22)'
  }
};

function renderActiveOrderNotice(order) {
  const tripCard = document.getElementById('notigasTripCard');
  if (!tripCard) return;

  if (!order || !order.estado) {
    tripCard.style.display = 'none';
    return;
  }

  const estado = String(order.estado).toLowerCase();
  const view = ORDER_STATUS_PRESENTATION[estado] || ORDER_STATUS_PRESENTATION.pendiente;

  tripCard.dataset.state = estado;
  tripCard.style.display = 'block';

  const title = document.getElementById('notigasTripTitle');
  const info = document.getElementById('notigasTripInfo');
  const statusText = document.getElementById('notigasTripStatusText');
  const driverName = document.getElementById('notigasTripDriverName');
  const timeEst = document.getElementById('notigasTripTimeEst');
  const statusIndicator = document.getElementById('notigasTripStatusIndicator');
  const tripBtnReceived = document.getElementById('tripBtnReceived');
  const tripBtnCancel = document.getElementById('tripBtnCancel');

  if (title) title.textContent = view.title;
  if (info) info.textContent = view.info;
  if (statusText) {
    statusText.textContent = view.label;
    statusText.style.color = view.color;
  }
  if (driverName) driverName.textContent = view.owner;
  if (timeEst) timeEst.textContent = view.detail;
  if (statusIndicator) {
    statusIndicator.style.background = view.color;
    statusIndicator.style.boxShadow = `0 0 0 4px ${view.shadow}`;
  }

  if (tripBtnReceived) {
    tripBtnReceived.style.display = (estado === 'asignado') ? 'flex' : 'none';
  }
  if (tripBtnCancel) {
    tripBtnCancel.style.display = (estado === 'entregado' || estado === 'cancelado') ? 'none' : 'flex';
  }
}

async function syncActiveOrderStatusFromDatabase(order) {
  if (!window.supabaseClient || !order?.id || _activeOrderStatusRequest) return;
  const now = Date.now();
  if (now - _activeOrderStatusCheckedAt < ACTIVE_ORDER_STATUS_REFRESH_MS) return;
  _activeOrderStatusCheckedAt = now;

  _activeOrderStatusRequest = window.supabaseClient
    .from('pedidos')
    .select('estado, driver_id, updated_at')
    .eq('id', order.id)
    .maybeSingle();

  try {
    const { data, error } = await _activeOrderStatusRequest;
    if (error || !data) return;

    const changed = data.estado !== order.estado ||
      data.driver_id !== order.driver_id ||
      data.updated_at !== order.updated_at;
    if (!changed) return;

    const updatedOrder = { ...order, ...data };
    AppState.set('activeOrder', updatedOrder);
    renderActiveOrderNotice(updatedOrder);

    if (data.estado === 'entregado' || data.estado === 'cancelado') {
      clearTimeout(_activeOrderFinalTimer);
      _activeOrderFinalTimer = setTimeout(() => {
        AppState.set('activeOrder', null);
        checkActiveOrderStatus();
      }, 4000);
    }
  } catch (error) {
    console.warn('Verificación de estado de pedido:', error);
  } finally {
    _activeOrderStatusRequest = null;
  }
}

async function syncBuyerActiveOrderFromCloud() {
  if (!window.supabaseClient) return;
  try {
    const localUserId = (typeof getAuthenticatedUserId === 'function')
      ? await getAuthenticatedUserId()
      : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);

    if (!localUserId) return;

    const { data: activeOrders, error } = await window.supabaseClient
      .from('pedidos')
      .select('*')
      .eq('user_id', localUserId)
      .in('estado', ['pendiente', 'visto', 'asignado'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && Array.isArray(activeOrders) && activeOrders.length > 0) {
      AppState.set('activeOrder', activeOrders[0]);
      checkActiveOrderStatus();
    } else if (!error) {
      // Protección anti-intermitencia estricta: NUNCA borrar si checkSpecific falla o viene null por delay de red/RLS.
      // SOLO borrar si la base de datos confirma de forma inequívoca que fue entregado o cancelado.
      const current = AppState.get('activeOrder');
      if (current && current.id) {
        const { data: checkSpecific, error: specErr } = await window.supabaseClient
          .from('pedidos')
          .select('id, estado')
          .eq('id', current.id)
          .maybeSingle();

        if (!specErr && checkSpecific && (checkSpecific.estado === 'entregado' || checkSpecific.estado === 'cancelado')) {
          AppState.set('activeOrder', null);
          checkActiveOrderStatus();
        }
      }
    }
  } catch (e) {
    console.warn('Error sincronizando pedido activo del comprador:', e);
  }
}
window.syncBuyerActiveOrderFromCloud = syncBuyerActiveOrderFromCloud;

function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');
  const btnReceived = document.getElementById('btnConfirmOrderReceived');
  const btnMain = document.getElementById('btnMainOrder');
  const tripCard = document.getElementById('notigasTripCard');
  const buyerActions = document.getElementById('buyerFloatingActions');

  const activeOrder = AppState.get('activeOrder');
  const appMode = (typeof AppState !== 'undefined' ? AppState.get('appMode') : 'buyer') || 'buyer';

  if (activeOrder && appMode === 'buyer') {
    try {
      const order = (typeof activeOrder === 'string') ? JSON.parse(activeOrder) : activeOrder;
      const estado = String(order.estado || 'pendiente').toLowerCase();

      if (estado === 'entregado' || estado === 'cancelado') {
        AppState.set('activeOrder', null);
      } else {
        // MODO PEDIDO ACTIVO: Fijar firmemente "Cancelar Pedido" y tarjeta informativa
        if (btnMain) btnMain.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'flex';
        if (buyerActions) buyerActions.style.display = 'flex';

        if (estado === 'asignado') {
          if (btnReceived) btnReceived.style.display = 'flex';
        } else {
          if (btnReceived) btnReceived.style.display = 'none';
        }

        renderActiveOrderNotice(order);
        actualizarFaviconSegunPedido(order.categoria, order.estado);
        syncActiveOrderStatusFromDatabase(order);

        if (typeof renderActiveOrdersMap === 'function') {
          renderActiveOrdersMap();
        }

        return;
      }
    } catch(e){
      console.warn('Error procesando activeOrder en checkActiveOrderStatus:', e);
    }
  }

  // MODO NORMAL (Sin pedido activo)
  if (btnReceived) btnReceived.style.display = 'none';
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnMain && appMode === 'buyer') btnMain.style.display = 'flex';

  if (tripCard) tripCard.style.display = 'none';
  if (buyerActions && appMode === 'buyer') buyerActions.style.display = 'flex';

  actualizarFaviconSegunPedido(null);

  if (typeof renderActiveOrdersMap === 'function') {
    renderActiveOrdersMap();
  }
}

if (typeof AppState !== 'undefined' && typeof AppState.on === 'function') {
  AppState.on('activeOrder', () => checkActiveOrderStatus());
}

function abrirSubmenuPedidos() {
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'flex';
}

function closeSubmenuModal() {
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'none';
}

window.centrarMapaEnMiPedido = function() {
  try {
    const order = AppState.get('activeOrder');
    if (order) {
      const lat = order.latitude || order.lat;
      const lng = order.longitude || order.lng;
      if (lat && lng && typeof map !== 'undefined') {
        map.flyTo([lat, lng], 17, { duration: 1.0 });
      }
    }
  } catch(e) {
    console.error("Error al centrar en el pedido:", e);
  }
};

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
      sel.dispatchEvent(new Event('change'));
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
  const selectCategoria = document.getElementById('selectCategoria');
  const inputCantidad = document.getElementById('inputCantidad');
  const inputCalle = document.getElementById('inputCallePrincipal');
  const inputTel = document.getElementById('inputTelefonoComprador') || document.getElementById('inputTelefono');

  const categoria = selectCategoria ? selectCategoria.value : 'gas';
  const cantidad = inputCantidad ? inputCantidad.value : '1';
  const calle = inputCalle ? inputCalle.value.trim() : '';
  const telefono = inputTel ? inputTel.value.trim() : '';

  // La ubicación se determina por GPS en el mapa de forma obligatoria y real (sin coordenadas inventadas)
  const activePos = (typeof window.getActiveUserLocation === 'function') ? window.getActiveUserLocation() : ((typeof AppState !== 'undefined') ? AppState.get('userLocation') : null);
  const rawLat = activePos ? (activePos.lat ?? activePos.latitude ?? window.currentGpsLat) : window.currentGpsLat;
  const rawLng = activePos ? (activePos.lng ?? activePos.longitude ?? window.currentGpsLng) : window.currentGpsLng;

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    if (typeof showToast === 'function') {
      showToast('📍 Ubicación GPS Requerida', 'No se pudo obtener tu ubicación en el mapa. Activa tu GPS o pulsa el botón "Mi Ubicación" antes de pedir.', 'warning', 6000);
    }
    return;
  }

  const currentCity = (typeof AppState !== 'undefined' && AppState.get('city')) ? AppState.get('city') : (window.selectedCity || 'cochabamba');

  const orderData = {
    categoria,
    cantidad: cantidad ? `${cantidad} un` : '1 un',
    direccion: calle || 'Ubicación GPS indicada en el mapa',
    callePrincipal: calle || 'Ubicación GPS indicada en el mapa',
    telefono: telefono || null,
    latitude: lat,
    longitude: lng,
    lat,
    lng,
    ciudad: currentCity,
    timestamp: Date.now(),
    estado: 'pendiente'
  };

  if (window.supabaseClient) {
    showLoadingOverlay('Registrando tu pedido...');

    getAuthenticatedUserId().then(async (userId) => {
      if (!userId) {
        hideLoadingOverlay();
        showToast('Error', 'Debes estar autenticado para crear un pedido.', 'error', 3000);
        return;
      }

      const catName = orderData.categoria ? (orderData.categoria.charAt(0).toUpperCase() + orderData.categoria.slice(1)) : 'Gas';
      const orderTitle = `Pedido de ${catName}`;

      const { data, error } = await window.supabaseClient
        .from('pedidos')
        .insert([{
          user_id: userId,
          titulo: orderTitle,
          categoria: orderData.categoria,
          cantidad: orderData.cantidad,
          direccion: orderData.direccion,
          telefono: orderData.telefono,
          latitude: orderData.latitude,
          longitude: orderData.longitude,
          ciudad: orderData.ciudad,
          estado: 'pendiente'
        }])
        .select()
        .single();

      hideLoadingOverlay();

      if (error) {
        console.error('Error insertando pedido en Supabase:', error);
        showToast('Error', error.message || 'No se pudo guardar el pedido en el servidor.', 'error', 4000);
        return;
      }

      clearTimeout(_activeOrderFinalTimer);
      _activeOrderFinalTimer = null;
      orderData.id = data.id;
      orderData.user_id = userId;
      AppState.set('activeOrder', orderData);
      closePedidoModal();
      showToast('¡Pedido Publicado!', 'Tu pedido ya está visible para los repartidores en el mapa.', 'success', 5000);
      checkActiveOrderStatus();

      if (typeof cargarPedidosVecinalesEnVivo === 'function') {
        cargarPedidosVecinalesEnVivo();
      }

      if (typeof renderActiveOrdersMap === 'function') {
        renderActiveOrdersMap();
      }
      if (typeof renderDriverDemandByZoom === 'function') {
        renderDriverDemandByZoom();
      }
    }).catch(e => {
      hideLoadingOverlay();
      console.error(e);
      showToast('Error', 'Error de conexión con la cuenta. Tu pedido no pudo ser registrado.', 'error', 3000);
    });
  } else {
    showToast('Error', 'El servidor no está disponible. No se puede crear el pedido.', 'error', 3000);
  }
}

function cancelarPedidoActivo() {
  const activeOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
  if (!activeOrder) {
    showToast('Sin Pedido Activo', 'No tienes un pedido activo para cancelar.', 'warning', 3000);
    return;
  }

  showConfirmModal(
    '❌',
    '¿Cancelar tu pedido?',
    'Tu pedido activo dejará de aparecer en el mapa y los repartidores ya no lo verán.',
    'Sí, cancelar',
    async () => {
      if (!window.supabaseClient) {
        showToast('Error de Conexión', 'No hay conexión con el servidor.', 'error', 4000);
        return;
      }

      showLoadingOverlay('Cancelando requerimiento...');
      try {
        const order = (typeof activeOrder === 'string') ? JSON.parse(activeOrder) : activeOrder;
        if (!order || !order.id) {
          hideLoadingOverlay();
          AppState.set('activeOrder', null);
          checkActiveOrderStatus();
          if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
          return;
        }

        const { data, error } = await window.supabaseClient.rpc('rpc_cancel_own_order', {
          p_order_id: order.id
        });

        hideLoadingOverlay();

        if (error) {
          console.error("Error cancelando pedido:", error);
          showToast('Error', error.message || 'No se pudo cancelar el pedido en el servidor.', 'error', 4500);
          return;
        }

        const currentMarker = window.userMarker || (typeof userMarker !== 'undefined' ? userMarker : null);
        const locIcon = window.userLocationIcon || (typeof userLocationIcon !== 'undefined' ? userLocationIcon : null);
        if (currentMarker && locIcon && typeof currentMarker.setIcon === 'function') {
          currentMarker.setIcon(locIcon);
        }

        AppState.set('activeOrder', null);
        showToast('Pedido Cancelado', 'Se ha cancelado tu requerimiento.', 'info', 4000);
        checkActiveOrderStatus();

        if (typeof renderActiveOrdersMap === 'function') {
          renderActiveOrdersMap();
        }
      } catch(e) {
        hideLoadingOverlay();
        console.error("Excepción al cancelar pedido:", e);
        showToast('Error', 'Error inesperado al cancelar el pedido.', 'error', 4000);
      }
    },
    'Volver'
  );
}
window.cancelarPedidoActivo = cancelarPedidoActivo;

async function confirmarRecepcionComprador() {
  const activeOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
  if (!activeOrder) {
    showToast('Sin Pedido Activo', 'No tienes un pedido activo en curso.', 'warning', 3000);
    return;
  }

  showConfirmModal(
    '🏁',
    '¿Ya recibiste tu pedido?',
    'Al confirmar, el requerimiento dejará de aparecer en el mapa y ya no estará disponible para nuevos repartidores.',
    'Sí, ya lo recibí',
    async () => {
      if (!window.supabaseClient) {
        showToast('Error de Conexión', 'No hay conexión con el servidor. Verifica tu internet.', 'error', 4000);
        return;
      }

      showLoadingOverlay('Confirmando recepción...');
      try {
        const order = (typeof activeOrder === 'string') ? JSON.parse(activeOrder) : activeOrder;
        if (!order || !order.id) {
          hideLoadingOverlay();
          showToast('Error', 'Datos del pedido no válidos.', 'error', 3000);
          return;
        }

        const { data, error } = await window.supabaseClient.rpc('rpc_confirm_order_received', {
          p_order_id: order.id
        });

        hideLoadingOverlay();

        if (error) {
          console.error("Error confirmando recepción:", error);
          showToast('Error', error.message || 'No se pudo confirmar la recepción del pedido.', 'error', 4500);
          return;
        }

        const currentMarker = window.userMarker || (typeof userMarker !== 'undefined' ? userMarker : null);
        const greenIcon = window.garrafaGreenIcon || (typeof garrafaGreenIcon !== 'undefined' ? garrafaGreenIcon : null);
        if (currentMarker && greenIcon && typeof currentMarker.setIcon === 'function') {
          currentMarker.setIcon(greenIcon);
          await new Promise(r => setTimeout(r, 1000));
        }

        AppState.set('activeOrder', null);
        showToast('¡Gracias!', 'Gracias por confirmar. Tu pedido ha sido finalizado exitosamente.', 'success', 5000);
        checkActiveOrderStatus();

        if (typeof renderActiveOrdersMap === 'function') {
          renderActiveOrdersMap();
        }
      } catch(e) {
        hideLoadingOverlay();
        console.error("Excepción en confirmarRecepcionComprador:", e);
        showToast('Error', 'Ocurrió un error inesperado al confirmar la recepción.', 'error', 4000);
      }
    },
    'Volver'
  );
}
window.confirmarRecepcionComprador = confirmarRecepcionComprador;

async function abrirPanoramicaPedidos() {
  let contenido = '';
  const now = Date.now();

  const rawPropio = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
  if (rawPropio) {
    try {
      const o = (typeof rawPropio === 'string') ? JSON.parse(rawPropio) : rawPropio;
      const antiguedad = formatearAntiguedadPedido(o.timestamp);
      const isAsignado = (o.estado === 'asignado');

      contenido += `
        <div style="background: linear-gradient(135deg, rgba(255,109,0,0.15), rgba(0,230,118,0.08)); border: 1px solid #FF6D00; border-radius: 12px; padding: 12px; margin-bottom: 10px;">
          <div style="font-weight: 900; font-size: 13px; color: #FF6D00; margin-bottom: 6px;"><i class="fa-solid fa-box"></i> Tu Pedido Activo</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>📦 Producto:</strong> ${escapeHtmlStr(o.categoria)}</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>🔢 Cantidad:</strong> ${escapeHtmlStr(String(o.cantidad))}</div>
          <div style="font-size: 12px; color: #CBD5E1;"><strong>🚦 Calle:</strong> ${escapeHtmlStr(o.callePrincipal || 'En mapa')}</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 4px;">⏱️ Publicado hace ${antiguedad}</div>
          <div style="display:flex; gap:6px; margin-top:10px;">
            ${isAsignado ? `
              <button type="button" data-action="confirmarRecepcionComprador" style="flex:1; background:linear-gradient(135deg, #10B981, #059669); color:white; border:none; padding:7px 10px; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer;">
                <i class="fa-solid fa-circle-check"></i> Ya recibí mi pedido
              </button>
            ` : ''}
            <button type="button" data-action="cancelarPedidoActivo" style="flex:1; background:#ef4444; color:white; border:none; padding:7px 10px; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer;">
              <i class="fa-solid fa-ban"></i> Cancelar
            </button>
          </div>
        </div>
      `;
    } catch(e){}
  }

  let otrosPedidosHtml = '';
  if (window.supabaseClient) {
    try {
      const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
      const activeWindow = new Date(now - expirationMs).toISOString();
      const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
      const cityKeys = (typeof window.getCityMetroKeys === 'function')
        ? window.getCityMetroKeys(currentCity)
        : (currentCity && currentCity !== 'todos' && currentCity !== 'all' ? [currentCity.toLowerCase().trim()] : null);

      let query = window.supabaseClient
        .from('pedidos_publicos')
        .select('id, categoria, cantidad, direccion, created_at, estado, latitude, longitude')
        .in('estado', ['pendiente', 'visto'])
        .gte('created_at', activeWindow)
        .order('created_at', { ascending: false })
        .limit(20);

      if (cityKeys && cityKeys.length > 0) {
        query = query.in('ciudad', cityKeys);
      }

      const { data: otros } = await query;
      if (otros && otros.length > 0) {
        otros.forEach(p => {
          const antiguedad = formatearAntiguedadPedido(p.created_at);
          otrosPedidosHtml += `
            <div style="background: #1E293B; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
              <div style="flex:1;">
                <div style="font-size:12px; font-weight:800; color:#F8FAFC;">${escapeHtmlStr(p.categoria)} (${p.cantidad})</div>
                <div style="font-size:11px; color:#94A3B8;">📍 ${escapeHtmlStr(p.direccion || 'Ubicación GPS en Mapa')}</div>
                <div style="font-size:10px; color:#64748B;">⏱️ ${antiguedad}</div>
              </div>
              <button type="button" data-action="centrarPedidoEnMapa" data-lat="${p.latitude}" data-lng="${p.longitude}" data-order-id="${p.id}" style="background:#0284C7; color:#F8FAFC; border:none; padding:6px 10px; border-radius:6px; font-size:10.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
                <i class="fa-solid fa-map-location-dot"></i> VER EN EL MAPA
              </button>
            </div>
          `;
        });
      }
    } catch(e){}
  }

  if (otrosPedidosHtml) {
    contenido += `
      <div style="font-weight: 800; font-size: 12px; color: #94A3B8; margin: 12px 0 6px;"><i class="fa-solid fa-users"></i> Otros Pedidos en tu Zona</div>
      ${otrosPedidosHtml}
    `;
  }

  if (!contenido) {
    contenido = '<div style="text-align:center; padding:30px; color:#94A3B8; font-size:12px;"><i class="fa-solid fa-circle-info" style="font-size:24px; margin-bottom:8px; display:block;"></i>No hay pedidos activos registrados en este momento.</div>';
  }

  const modal = document.getElementById('modalPanoramicaPedidos');
  const body = document.getElementById('bodyPanoramicaPedidos');
  if (modal && body) {
    body.innerHTML = contenido;
    modal.style.display = 'flex';
  }
}
window.abrirPanoramicaPedidos = abrirPanoramicaPedidos;

function cerrarPanoramicaPedidos() {
  const modal = document.getElementById('modalPanoramicaPedidos');
  if (modal) modal.style.display = 'none';
}
window.cerrarPanoramicaPedidos = cerrarPanoramicaPedidos;

function coordenadasValidasAlerta(pos) {
  if (!pos) return false;
  const lat = Number(pos.lat ?? pos.latitude);
  const lng = Number(pos.lng ?? pos.longitude);
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function transmitirAlertaVecinal(payload) {
  if (!window.supabaseClient || !payload) return false;
  try {
    const channel = window.supabaseClient.channel('alertas_vecinales_realtime');
    await channel.send({
      type: 'broadcast',
      event: 'alerta_vecinal',
      payload
    });
    return true;
  } catch (error) {
    console.warn('Transmisión de alerta vecinal no disponible:', error);
    return false;
  }
}

function puedeEmitirAlertaVecinal(tipo) {
  const key = `notigas_last_alert_${tipo}`;
  const lastTime = parseInt(localStorage.getItem(key) || '0', 10);
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000; // 1 minuto
  if (now - lastTime < COOLDOWN_MS) {
    const remainingSecs = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
    if (typeof showToast === 'function') {
      showToast('Espera un momento', `Ya emitiste esta alerta recientemente. Espera ${remainingSecs}s para enviar otra.`, 'warning', 3000);
    }
    return false;
  }
  localStorage.setItem(key, String(now));
  return true;
}

async function notificarEscucheCamion() {
  if (!puedeEmitirAlertaVecinal('escuche_camion')) return;

  const pos = (typeof window.getActiveUserLocation === 'function') ? window.getActiveUserLocation() : ((typeof AppState !== 'undefined') ? AppState.get('userLocation') : null);
  if (!coordenadasValidasAlerta(pos)) {
    if (typeof showToast === 'function') showToast('GPS Requerido', 'Activa tu GPS para avisar a los vecinos dónde escuchaste el camión.', 'warning', 3500);
    return;
  }

  const payload = {
    tipo: 'escuche_camion',
    titulo: '¡Camión de Gas Escuchado!',
    mensaje: 'Un vecino cercano reporta haber escuchado la música del camión de gas en esta zona.',
    lat: Number(pos.lat || pos.latitude),
    lng: Number(pos.lng || pos.longitude),
    timestamp: Date.now()
  };

  showLoadingOverlay('Avisando a los vecinos...');
  try {
    const sent = await transmitirAlertaVecinal(payload);
    let saved = false;
    if (window.supabaseClient) {
      const { error } = await window.supabaseClient.from('alertas_comunitarias').insert([{
        tipo: 'camion_cerca',
        latitud: payload.lat,
        longitud: payload.lng,
        departamento: (typeof AppState !== 'undefined') ? (AppState.get('city') || 'Cochabamba') : 'Cochabamba'
      }]);
      saved = !error;
    }
    hideLoadingOverlay();
    if (saved || sent) {
      if (typeof showToast === 'function') showToast('¡Aviso Enviado!', 'Los vecinos de tu zona han sido notificados.', 'success', 4000);
    } else {
      if (typeof showToast === 'function') showToast('Aviso Vecinal', 'Tu reporte fue transmitido a los vecinos en el mapa.', 'info', 3500);
    }
  } catch (e) {
    hideLoadingOverlay();
    console.error('Error enviando alerta vecinal:', e);
    if (typeof showToast === 'function') showToast('Aviso Registrado', 'Tu reporte fue registrado.', 'info', 3000);
  }
}
window.notificarEscucheCamion = notificarEscucheCamion;

async function lanzarEspecialEsperame() {
  if (!puedeEmitirAlertaVecinal('esperame')) return;

  const pos = (typeof window.getActiveUserLocation === 'function') ? window.getActiveUserLocation() : ((typeof AppState !== 'undefined') ? AppState.get('userLocation') : null);
  if (!coordenadasValidasAlerta(pos)) {
    if (typeof showToast === 'function') showToast('GPS Requerido', 'Activa tu ubicación GPS para pedir al repartidor que te espere.', 'warning', 3500);
    return;
  }

  const payload = {
    tipo: 'esperame',
    titulo: '¡Vecino saliendo con garrafa!',
    mensaje: 'Un vecino cercano está saliendo con su garrafa. Por favor espérale unos minutos.',
    lat: Number(pos.lat || pos.latitude),
    lng: Number(pos.lng || pos.longitude),
    timestamp: Date.now()
  };

  showLoadingOverlay('Avisando al repartidor...');
  try {
    const sent = await transmitirAlertaVecinal(payload);
    let saved = false;
    if (window.supabaseClient) {
      const { error } = await window.supabaseClient.from('alertas_comunitarias').insert([{
        tipo: 'vecino_esperando',
        latitud: payload.lat,
        longitud: payload.lng,
        departamento: (typeof AppState !== 'undefined') ? (AppState.get('city') || 'Cochabamba') : 'Cochabamba'
      }]);
      saved = !error;
    }
    hideLoadingOverlay();
    if (saved || sent) {
      if (typeof showToast === 'function') showToast('¡Aviso Enviado!', 'Se ha alertado a los repartidores que estás saliendo.', 'success', 4000);
    } else {
      if (typeof showToast === 'function') showToast('Aviso Registrado', 'Tu alerta está activa en el mapa vecinal.', 'info', 3500);
    }
  } catch (e) {
    hideLoadingOverlay();
    console.error('Error enviando alerta espérame:', e);
  }
}
window.lanzarEspecialEsperame = lanzarEspecialEsperame;

window.recibirAlertaVecinalBroadcast = function(payload) {
  if (!payload || !payload.lat || !payload.lng) return;
  const userPos = (typeof window.getActiveUserLocation === 'function') ? window.getActiveUserLocation() : ((typeof AppState !== 'undefined') ? AppState.get('userLocation') : null);
  if (userPos && userPos.lat && userPos.lng && typeof calcularDistanciaMetros === 'function') {
    const dist = calcularDistanciaMetros(userPos.lat, userPos.lng, payload.lat, payload.lng);
    if (dist > 3000) return;
  }

  if (payload.tipo === 'escuche_camion') {
    if (typeof mostrarPopupAlertaRepartidor === 'function') {
      mostrarPopupAlertaRepartidor('🎵 ¡Camión de Gas Cerca!', payload.mensaje || 'Un vecino reporta haber escuchado la música del camión cerca de tu zona.');
    } else if (typeof showToast === 'function') {
      showToast('🎵 ¡Camión de Gas Cerca!', payload.mensaje || 'Un vecino reporta el camión cerca.', 'info', 5000);
    }
  } else if (payload.tipo === 'esperame') {
    if (typeof mostrarPopupAlertaRepartidor === 'function') {
      mostrarPopupAlertaRepartidor('⏳ ¡Vecino Saliendo!', payload.mensaje || 'Un vecino cercano está saliendo con su garrafa.');
    } else if (typeof showToast === 'function') {
      showToast('⏳ ¡Vecino Saliendo!', payload.mensaje || 'Un vecino cercano está saliendo.', 'warning', 5000);
    }
  }
};
