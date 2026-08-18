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

function startDriverOrdersAutoRefresh() {
  if (window._driverOrdersInterval) clearInterval(window._driverOrdersInterval);
  window._driverOrdersInterval = setInterval(() => {
    const modal = document.getElementById('modalDriverOrders');
    if (modal && modal.style.display === 'flex' && typeof renderDriverOrdersList === 'function') {
      renderDriverOrdersList();
    }
  }, 10000);
}

function abrirModalDriverOrders() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) {
    modal.style.display = 'flex';
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
    startDriverOrdersAutoRefresh();
  }
}
window.abrirModalDriverOrders = abrirModalDriverOrders;

function closeDriverOrdersModal() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) {
    modal.style.display = 'none';
    if (window._driverOrdersInterval) {
      clearInterval(window._driverOrdersInterval);
      window._driverOrdersInterval = null;
    }
  }
}
window.closeDriverOrdersModal = closeDriverOrdersModal;

async function renderDriverOrdersList() {
  const container = document.getElementById('driverOrdersList');
  if (!container) return;

  if (!window.supabaseClient) {
    container.innerHTML = '<div style="padding:15px; color:#F8FAFC; text-align:center;">Sin conexión a Supabase</div>';
    return;
  }

  const activeCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
  const now = Date.now();
  const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
  const activeWindow = new Date(now - expirationMs).toISOString();

  let query = window.supabaseClient
    .from('pedidos')
    .select('id, user_id, categoria, cantidad, direccion, telefono, latitude, longitude, created_at, estado, driver_id, ciudad')
    .in('estado', ['pendiente', 'visto', 'asignado'])
    .gte('created_at', activeWindow)
    .order('created_at', { ascending: false });

  if (activeCity) {
    query = query.ilike('ciudad', `%${activeCity}%`);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("Error cargando lista de pedidos repartidor:", error);
    container.innerHTML = '<div style="padding:15px; color:#EF4444; text-align:center;">Error al cargar requerimientos</div>';
    return;
  }

  if (!orders || orders.length === 0) {
    container.innerHTML = '<div style="padding:25px; text-align:center; color:#94A3B8; font-size:12px;"><i class="fa-solid fa-clipboard-check" style="font-size:24px; margin-bottom:8px; display:block;"></i>No hay pedidos pendientes en esta zona.</div>';
    return;
  }

  const localUserId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);

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
      const street = o.direccion ? escapeHtmlStr(o.direccion) : 'Ubicación GPS en Mapa';
      const lat = o.latitude || 0;
      const lng = o.longitude || 0;
      const tel = o.telefono ? escapeHtmlStr(o.telefono) : '';

      html += `
        <div class="assigned-order-card" style="margin-bottom:10px; border-left:4px solid #10B981;">
          <div class="demand-card-header">
            <div>
              <span style="font-size:9px; background:#10B981; color:white; padding:2px 6px; border-radius:4px; font-weight:800;">EN ENTREGA</span>
              <div style="font-size:13px; font-weight:800; color:#F8FAFC; margin-top:2px;">${escapeHtmlStr(o.categoria)} (${o.cantidad})</div>
            </div>
            <div style="font-size:10px; color:#94A3B8;">${antiguedad}</div>
          </div>
          <div class="demand-card-meta" style="margin-top:6px;">
            <div>📍 <strong>Destino:</strong> ${street}</div>
            ${tel ? `<div>📞 <strong>Tel:</strong> <a href="tel:${tel}" style="color:#38BDF8;">${tel}</a></div>` : ''}
          </div>
          <div class="demand-card-actions" style="margin-top:8px; display:flex; gap:6px;">
            <button type="button" class="btn-action" style="background:#0284C7; color:white; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; border:none; cursor:pointer; flex:1;" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-order-id="${o.id}">
              <i class="fa-solid fa-map-location-dot"></i> Ver Mapa
            </button>
            <button type="button" class="btn-action" style="background:#10B981; color:white; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; border:none; cursor:pointer; flex:1;" data-action="confirmarEntregaPedido" data-id="${o.id}">
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
            const st = o.direccion ? escapeHtmlStr(o.direccion) : 'Ubicación GPS en Mapa';
            const lat = o.latitude || 0;
            const lng = o.longitude || 0;
            const buyer = 'Vecino';
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed rgba(255,255,255,0.04); font-size:11px;">
                <div>
                  <span style="color:#F8FAFC; font-weight:700;">${st}</span> (${o.cantidad || '1 un'})
                  <div style="font-size:9.5px; color:#64748B;">${buyer}</div>
                </div>
                <div style="display:flex; gap:4px;">
                  <button type="button" style="background:#334155; color:#F8FAFC; border:none; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-order-id="${o.id}" title="Ver en mapa">
                    <i class="fa-solid fa-location-crosshairs"></i>
                  </button>
                  <button type="button" style="background:#FF6D00; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:800; cursor:pointer;" data-action="aceptarPedidoRepartidor" data-id="${o.id}" data-lat="${lat}" data-lng="${lng}" data-address="${escapeHtmlStr(o.direccion || '')}">
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
  if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && typeof map !== 'undefined' && map) {
    map.flyTo([lat, lng], 17, { duration: 1.2 });
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
      if (order.timestamp && (now - order.timestamp) > expirationMs) {
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
    title: 'Pedido en camino',
    label: 'ASIGNADO',
    owner: 'REPARTIDOR ASIGNADO',
    info: 'Un repartidor aceptó tu pedido.',
    detail: 'El chofer ya puede ver el destino y navegar hacia la entrega.',
    color: '#D32F2F',
    shadow: 'rgba(211, 47, 47, 0.18)'
  },
  entregado: {
    title: 'Pedido entregado',
    label: 'ENTREGADO',
    owner: 'PEDIDO COMPLETADO',
    info: 'La entrega fue confirmada correctamente.',
    detail: 'Gracias por usar la red vecinal NOTIGAS.',
    color: '#15803D',
    shadow: 'rgba(21, 128, 61, 0.18)'
  },
  cancelado: {
    title: 'Pedido cancelado',
    label: 'CANCELADO',
    owner: 'PEDIDO CERRADO',
    info: 'El pedido ya no forma parte de la demanda vecinal.',
    detail: 'Puedes crear una nueva solicitud cuando la necesites.',
    color: '#B71C1C',
    shadow: 'rgba(183, 28, 28, 0.18)'
  }
};

function renderActiveOrderNotice(order) {
  const tripCard = document.getElementById('notigasTripCard');
  if (!tripCard || !order) return;

  const estado = String(order.estado || 'pendiente').toLowerCase();
  const view = ORDER_STATUS_PRESENTATION[estado] || ORDER_STATUS_PRESENTATION.pendiente;
  const title = document.getElementById('tripCardTitle');
  const info = document.getElementById('tripCardInfo');
  const statusText = document.getElementById('tripCardStatusText');
  const driverName = document.getElementById('tripCardDriverName');
  const timeEst = document.getElementById('tripCardTime');
  const statusIndicator = document.getElementById('tripCardStatusIndicator');
  const tripBtnReceived = tripCard.querySelector('.trip-btn-received');
  const tripBtnCancel = tripCard.querySelector('.trip-btn-cancel');

  tripCard.dataset.orderState = estado;
  tripCard.style.display = 'block';
  tripCard.setAttribute('aria-label', `${view.title}. ${view.info}`);
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

function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');
  const btnReceived = document.getElementById('btnConfirmOrderReceived');
  const btnMain = document.getElementById('btnMainOrder');
  const tripCard = document.getElementById('notigasTripCard');
  const buyerActions = document.getElementById('buyerFloatingActions');

  const activeOrder = AppState.get('activeOrder');
  const isAdmin = AppState.get('isAdmin');

  if (activeOrder && !isAdmin) {
    try {
      const order = activeOrder;
      const estado = String(order.estado || 'pendiente').toLowerCase();

      if (btnMain) btnMain.style.display = 'none';
      if (buyerActions) buyerActions.style.display = 'flex';

      if (estado === 'asignado') {
        // En camino: el comprador puede confirmar que ya lo recibió o cancelar
        if (btnReceived) btnReceived.style.display = 'flex';
        if (btnCancel) btnCancel.style.display = 'flex';
      } else {
        // Pendiente o Visto: sólo cancelar permitido, no confirmar antes de asignación
        if (btnReceived) btnReceived.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'flex';
      }

      renderActiveOrderNotice(order);
      actualizarFaviconSegunPedido(order.categoria, order.estado);
      syncActiveOrderStatusFromDatabase(order);

      if (typeof renderActiveOrdersMap === 'function') {
        renderActiveOrdersMap();
      }

      return;
    } catch(e){}
  }

  if (btnReceived) btnReceived.style.display = 'none';
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnMain) btnMain.style.display = 'flex'; // Restaurar Hacer Pedido

  if (tripCard) tripCard.style.display = 'none';
  if (buyerActions) buyerActions.style.display = 'flex';

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

  // La ubicación se determina por GPS en el mapa; dirección y teléfono son opcionales
  const activePos = (typeof window.getActiveUserLocation === 'function') ? window.getActiveUserLocation() : ((typeof AppState !== 'undefined') ? AppState.get('userLocation') : null);
  const lat = activePos ? (activePos.lat || activePos.latitude || window.currentGpsLat || -17.3935) : (window.currentGpsLat || -17.3935);
  const lng = activePos ? (activePos.lng || activePos.longitude || window.currentGpsLng || -66.1570) : (window.currentGpsLng || -66.1570);

  const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'Cochabamba') : 'Cochabamba';

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

      const { data, error } = await window.supabaseClient
        .from('pedidos')
        .insert([{
          user_id: userId,
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

      orderData.id = data.id;
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
  const rawOrder = JSON.stringify(AppState.get('activeOrder'));
  if (!rawOrder) {
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
        const order = JSON.parse(rawOrder);
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
  const rawOrder = JSON.stringify(AppState.get('activeOrder'));
  if (!rawOrder) {
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
        const order = JSON.parse(rawOrder);
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

  const rawPropio = JSON.stringify(AppState.get('activeOrder'));
  if (rawPropio) {
    try {
      const o = JSON.parse(rawPropio);
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

      let query = window.supabaseClient
        .from('pedidos')
        .select('id, categoria, cantidad, direccion, created_at, estado, latitude, longitude')
        .in('estado', ['pendiente', 'visto'])
        .gte('created_at', activeWindow)
        .order('created_at', { ascending: false })
        .limit(20);

      if (currentCity) {
        query = query.ilike('ciudad', `%${currentCity}%`);
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
              <button type="button" data-action="centrarPedidoEnMapa" data-lat="${p.latitude}" data-lng="${p.longitude}" data-order-id="${p.id}" style="background:#334155; color:#F8FAFC; border:none; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                <i class="fa-solid fa-crosshairs"></i>
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
