/* ORDERS LOGIC */

function abrirModalDriverOrders() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) modal.style.display = 'flex';

  const selectCity = document.getElementById('selectDriverModalCity');
  if (selectCity) {
    const currentCity = (typeof AppState !== 'undefined') ? AppState.get('city') : 'cochabamba';
    if (currentCity) selectCity.value = currentCity;
  }

  renderDriverOrdersList();
}
window.abrirModalDriverOrders = abrirModalDriverOrders;

function closeDriverOrdersModal() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) modal.style.display = 'none';
}
window.closeDriverOrdersModal = closeDriverOrdersModal;

async function renderDriverOrdersList() {
  const container = document.getElementById('driverOrdersContainer');
  if (!container) return;

  container.innerHTML = '<div class="driver-demand-empty">Cargando pedidos...</div>';

  if (!window.supabaseClient) {
    container.innerHTML = '<div class="driver-demand-empty">Sin conexión con la base de datos.</div>';
    return;
  }

  let driverCiudad = '';
  let driverCategoria = '';
  let localUserId = null;

  try {
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    const user = sessionData?.session?.user;
    if (user) {
      localUserId = user.id;
      const { data: driverRow } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('ciudad, categoria')
        .eq('user_id', user.id)
        .maybeSingle();

      if (driverRow) {
        driverCiudad = driverRow.ciudad || '';
        driverCategoria = driverRow.categoria || '';
      }
    }
  } catch (error) {
    console.warn('Error obteniendo perfil de repartidor:', error);
  }

  const userData = (typeof AppState !== 'undefined') ? (AppState.get('userData') || {}) : {};
  driverCiudad = driverCiudad || userData.ciudad || userData.city || ((typeof AppState !== 'undefined') ? AppState.get('city') : '');
  driverCategoria = driverCategoria || userData.categoria || userData.category || 'gas';

  if (!driverCiudad) {
    container.innerHTML = '<div class="driver-demand-empty">Selecciona tu ciudad para ver los pedidos disponibles.</div>';
    return;
  }

  const normCity = String(driverCiudad).toLowerCase().trim();
  let clusters = [];
  let availableOrders = [];
  let assignedOrders = [];
  let ordersError = null;

  try {
    if (typeof window.obtenerGruposDemanda === 'function') {
      clusters = await window.obtenerGruposDemanda(normCity, driverCategoria);
    } else {
      const result = await window.supabaseClient.rpc('rpc_get_demand_clusters_v2', {
        p_ciudad: normCity,
        p_categoria: null,
        p_distancia_metros: 300,
        p_min_pedidos: 2
      });
      if (!result.error && Array.isArray(result.data)) {
        clusters = result.data.filter(cluster => {
          return typeof window.isOrderCategoryMatchingDriver !== 'function' ||
            window.isOrderCategoryMatchingDriver(cluster.categoria, driverCategoria);
        });
      }
    }
    if (typeof window.obtenerPedidosDisponiblesDesdeGrupos === 'function') {
      availableOrders = await window.obtenerPedidosDisponiblesDesdeGrupos(clusters, normCity, driverCategoria);
    }
  } catch (error) {
    ordersError = error;
    console.error('Error cargando pedidos disponibles desde grupos:', error);
  }

  // Fallback: si no hay grupos densos (clusters), consultar directamente pedidos públicos disponibles
  if (!Array.isArray(availableOrders) || availableOrders.length === 0) {
    try {
      let pubQuery = window.supabaseClient
        .from('pedidos_publicos')
        .select('*')
        .in('estado', ['pendiente', 'visto']);
      if (normCity) pubQuery = pubQuery.ilike('ciudad', normCity);
      const { data: pubData } = await pubQuery;
      if (Array.isArray(pubData)) {
        availableOrders = pubData.filter(order => {
          return typeof window.isOrderCategoryMatchingDriver !== 'function' ||
            window.isOrderCategoryMatchingDriver(order.categoria, driverCategoria);
        });
        ordersError = null;
      }
    } catch(e) {
      console.warn('Error en fallback de pedidos públicos para repartidor:', e);
    }
  }

  if (localUserId) {
    const assignedResult = await window.supabaseClient.rpc('rpc_get_my_assigned_orders');

    if (!assignedResult.error) {
      assignedOrders = (assignedResult.data || []).filter(order => {
        return typeof window.isOrderCategoryMatchingDriver !== 'function' ||
          window.isOrderCategoryMatchingDriver(order.categoria, driverCategoria);
      });
    } else {
      console.warn('RPC de contacto seguro pendiente; cargando pedidos sin correo:', assignedResult.error.message);
      const fallbackResult = await window.supabaseClient
        .from('pedidos')
        .select('id, titulo, categoria, cantidad, direccion, telefono, latitude, longitude, created_at, estado')
        .eq('driver_id', localUserId)
        .ilike('ciudad', normCity)
        .eq('estado', 'asignado')
        .order('created_at', { ascending: true });

      if (fallbackResult.error) {
        console.warn('Error cargando entregas asignadas:', fallbackResult.error);
      } else {
        assignedOrders = fallbackResult.data || [];
      }
    }
  }

  const minutesSince = value => {
    const timestamp = new Date(value || Date.now()).getTime();
    return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  };

  let html = '';

  if (assignedOrders.length > 0) {
    html += '<div class="demand-section-title"><i class="fa-solid fa-route"></i> Pedidos asignados</div>';
    assignedOrders.forEach(order => {
      const lat = Number(order.latitude);
      const lng = Number(order.longitude);
      const safeAddress = window.escapeHtmlStr(order.direccion || 'Ubicación fijada en el mapa');
      const safeBuyerName = window.escapeHtmlStr(order.titulo || 'Comprador vecinal');
      const safeBuyerEmail = window.escapeHtmlStr(order.buyer_email || 'Correo disponible al aplicar migración 041');
      const emailHref = order.buyer_email ? `mailto:${encodeURIComponent(order.buyer_email)}` : '';
      html += `
        <article class="assigned-order-card">
          <div class="demand-card-header">
            <strong>Entrega #${window.escapeHtmlStr(String(order.id).slice(0, 8))}</strong>
            <span class="trip-status-text">ASIGNADO</span>
          </div>
          <div class="demand-card-meta">
            <div><i class="fa-solid fa-user"></i> ${safeBuyerName}</div>
            <div><i class="fa-solid fa-envelope"></i> ${emailHref ? `<a class="assigned-buyer-email" href="${emailHref}">${safeBuyerEmail}</a>` : safeBuyerEmail}</div>
            <div><i class="fa-solid fa-box"></i> ${window.escapeHtmlStr(order.categoria || '')} (${window.escapeHtmlStr(order.cantidad || '1')})</div>
            <div><i class="fa-solid fa-location-dot"></i> ${safeAddress}</div>
          </div>
          <div class="demand-card-actions">
            <button type="button" class="btn-driver-view-order" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-id="${window.escapeHtmlStr(order.id)}">
              <i class="fa-solid fa-map-location-dot"></i> Ver el pedido en el mapa
            </button>
            <button type="button" class="btn-driver-route" data-action="abrirRutaGoogleMaps" data-lat="${lat}" data-lng="${lng}" data-id="${window.escapeHtmlStr(order.id)}" data-address="${safeAddress}">
              <i class="fa-solid fa-diamond-turn-right"></i> Navegar
            </button>
            <button type="button" class="btn-driver-complete" data-action="confirmarEntregaPedido" data-id="${window.escapeHtmlStr(order.id)}">
              <i class="fa-solid fa-check"></i> Entregado
            </button>
          </div>
        </article>`;
    });
  }

  html += '<div class="demand-section-title"><i class="fa-solid fa-clipboard-list"></i> Pedidos disponibles</div>';

  if (ordersError) {
    html += `<div class="driver-demand-empty">No se pudieron cargar los pedidos: ${window.escapeHtmlStr(ordersError.message || 'error de conexión')}.</div>`;
  } else if (availableOrders.length === 0) {
    html += `<div class="driver-demand-empty">Todavía no hay pedidos disponibles de ${window.escapeHtmlStr(driverCategoria)} en esta ciudad.</div>`;
  } else {
    availableOrders
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach(order => {
        const lat = Number(order.latitude);
        const lng = Number(order.longitude);
        const safeId = window.escapeHtmlStr(order.id || '');
        const safeCategory = window.escapeHtmlStr(order.categoria || driverCategoria);
        const safeQuantity = window.escapeHtmlStr(order.cantidad || '1');
        const safeZone = window.escapeHtmlStr(order.barrio_otb || 'Zona indicada en el mapa');
        html += `
          <article class="demand-group-card available-order-card">
            <div class="demand-card-header">
              <div>
                <div class="demand-card-count">${safeCategory}</div>
                <strong>${safeQuantity} unidad(es)</strong>
              </div>
              <span class="trip-status-text">DISPONIBLE</span>
            </div>
            <div class="demand-card-meta">
              <div><i class="fa-solid fa-location-dot"></i> ${safeZone}</div>
              <div><i class="fa-regular fa-clock"></i> Publicado hace ${minutesSince(order.created_at)} min.</div>
            </div>
            <div class="demand-card-actions">
              <button type="button" class="btn-driver-accept" data-action="aceptarPedidoRepartidor" data-id="${safeId}" data-lat="${lat}" data-lng="${lng}">
                <i class="fa-solid fa-diamond-turn-right"></i> Elegir y navegar
              </button>
            </div>
          </article>`;
      });
  }

  container.innerHTML = html;
}

window.centrarPedidoEnMapa = function(lat, lng, id) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (typeof map !== 'undefined' && map && !isNaN(nLat) && !isNaN(nLng) && nLat !== 0 && nLng !== 0) {
    if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
    if (typeof switchTab === 'function') switchTab(0);
    if (typeof desactivarSeguirme === 'function') desactivarSeguirme();

    setTimeout(() => {
      map.invalidateSize();
      map.flyTo([nLat, nLng], 18, { duration: 1.2 });
      if (typeof window.renderDriverDemandByZoom === 'function') {
        window.renderDriverDemandByZoom();
      }
    }, 80);

    setTimeout(() => {
      const marker = window.neighborOrderMarkers?.[id];
      if (marker) marker.openPopup();
    }, 1400);

    if (typeof showToast === 'function') {
      showToast('📍 Pedido localizado', 'Mostrando la ubicación exacta del pedido asignado.', 'success', 2800);
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
  showConfirmModal('🚚', 'Elegir Pedido', 'El pedido quedará asignado a tu cuenta y se abrirá la navegación externa.', 'Elegir y navegar', async () => {
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

  // Determinar argumentos de manera flexible (múltiples firmas)
  if (typeof a === 'object' && a !== null) {
    lat = Number(a.latitude ?? a.lat);
    lng = Number(a.longitude ?? a.lng);
    orderId = a.id || a.order_id || null;
    address = a.direccion || a.address || '';
  } else if (typeof a === 'string' && isNaN(Number(a)) && (a.includes('-') || a.length > 15)) {
    // a es UUID orderId
    orderId = a;
    lat = Number(b);
    lng = Number(c);
    address = d || '';
  } else {
    // a es lat, b es lng, c es orderId
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

  // Abrir Google Maps de forma nativa e inmediata
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

  // La navegación se habilita después de asignar el pedido individual.
};

async function confirmarEntregaPedido(id) {
  if (!window.supabaseClient) return;

  showConfirmModal('🏁', 'Confirmar Entrega', '¿El vecino ya recibió su pedido y se realizó el pago?', 'Sí, ya entregué el pedido', async () => {
    showLoadingOverlay('Confirmando entrega...');

    const localUserId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);

    const { error } = await window.supabaseClient.from('pedidos')
      .update({ estado: 'entregado' })
      .eq('id', id)
      .eq('driver_id', localUserId)
      .in('estado', ['asignado']);

    hideLoadingOverlay();

    if (error) {
      console.error("Error confirmando entrega:", error);
      showToast('Error', 'No se pudo confirmar la entrega.', 'error');
    } else {
      closeDriverOrdersModal();
      showToast('¡Buen trabajo!', 'Pedido entregado. El pedido fue archivado en tus estadísticas.', 'success', 5000);
      if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
      if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    }
  });
}
window.confirmarEntregaPedido = confirmarEntregaPedido;

// Purga automática de caché local (elimina pedidos locales expirados, no la base de datos)
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
      }, 5000);
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
  const btnMain = document.getElementById('btnMainOrder');
  const tripCard = document.getElementById('notigasTripCard');
  const buyerActions = document.getElementById('buyerFloatingActions');

  const activeOrder = AppState.get('activeOrder');
  const isAdmin = AppState.get('isAdmin');

  if (activeOrder && !isAdmin) {
    try {
      const order = activeOrder;

      if (btnCancel) btnCancel.style.display = 'flex';
      if (btnMain) btnMain.style.display = 'none';

      if (buyerActions) buyerActions.style.display = 'flex';
      renderActiveOrderNotice(order);

      actualizarFaviconSegunPedido(order.categoria, order.estado);
      syncActiveOrderStatusFromDatabase(order);

      if (typeof renderActiveOrdersMap === 'function') {
        renderActiveOrdersMap();
      }

      return;

    } catch(e){}
  }

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
  const ciudad = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
  if (!ciudad) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Ciudad Requerida', 'No se ha definido la ciudad. Por favor selecciona tu ciudad en el mapa antes de pedir.', 'warning', 4500);
    } else {
      alert('No se ha definido la ciudad.');
    }
    return;
  }

  const pos = getActiveUserLocation();
  if (!pos.lat || !pos.lng) {
    const defaultCoords = {
      santacruz: { lat: -17.7833, lng: -63.1821 },
      cochabamba: { lat: -17.3895, lng: -66.1568 },
      lapaz: { lat: -16.5000, lng: -68.1500 },
      elalto: { lat: -16.5000, lng: -68.1900 },
      sucre: { lat: -19.0333, lng: -65.2627 },
      tarija: { lat: -21.5355, lng: -64.7296 },
      oruro: { lat: -17.9833, lng: -67.1500 },
      potosi: { lat: -19.5836, lng: -65.7531 },
      trinidad: { lat: -14.8333, lng: -64.9000 },
      cobija: { lat: -11.0267, lng: -68.7692 }
    };
    if (defaultCoords[ciudad]) {
      pos.lat = defaultCoords[ciudad].lat;
      pos.lng = defaultCoords[ciudad].lng;
    }
  }

  let cat = document.getElementById('selectCategoria')?.value || 'gas';
  if (cat === 'otros') {
    const detail = (document.getElementById('inputOrderOtrosDetalle')?.value || '').trim();
    if (detail) {
        // Standard category code 'otros'
    }
  }

  const inputAddr = (document.getElementById('inputCallePrincipal')?.value || '').trim();
  const inputTel = (document.getElementById('inputTelefonoComprador')?.value || '').trim();
  const direccion = inputAddr || 'Ubicación fijada en mapa por GPS';
  const telefono = inputTel || '';

  let buyerName = 'Comprador Vecinal';
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) buyerName = `${u.nombre}${u.apellido ? ' ' + u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  if (window.supabaseClient) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Creando pedido...');

    window.supabaseClient.auth.getSession().then(async ({ data: sessionData }) => {
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
         if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
         if (typeof showToast === 'function') {
           showToast('Inicia Sesión', 'Debes iniciar sesión con Google o Email para enviar tu pedido.', 'warning', 4000);
         } else {
           alert("Debes iniciar sesión con Google o Email para enviar tu pedido.");
         }
         closePedidoModal();
         const modalAuth = document.getElementById('modalWelcomeAuth');
         if (modalAuth) modalAuth.style.display = 'flex';
         return;
      }

      const { data: resultData, error } = await window.supabaseClient.from('pedidos').insert([{
          categoria: cat,
          cantidad: '1 unidad',
          titulo: buyerName,
          direccion: direccion,
          telefono: telefono,
          descripcion: `Pedido rápido: 1 unidad.`,
          ciudad: ciudad,
          barrio_otb: 'Por GPS',
          user_id: userId,
          latitude: pos.lat,
          longitude: pos.lng
      }]).select('id').single();

      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

      if (error) {
        console.error("Error enviando pedido a Supabase:", error);
        if (typeof showToast === 'function') {
          showToast('Error', 'No se pudo enviar el pedido al servidor: ' + (error.message || ''), 'error', 4000);
        } else {
          alert('Error al enviar pedido: ' + error.message);
        }
      } else {
        console.log("✅ Pedido guardado en Supabase.");
        closePedidoModal();

        // FIX: Solo guardar localmente si la BD aceptó, y añadir el ID real

        const activeOrderData = {
          id: resultData.id,

          categoria: cat,

          cantidad: '1 unidad',

          callePrincipal: direccion,

          telefono: telefono,

          buyerName: buyerName,

          lat: pos.lat,

          lng: pos.lng,

          timestamp: Date.now()

        };

        AppState.set('activeOrder', activeOrderData);

        if (typeof notigasTrack === 'function') notigasTrack('pedido_creado', { categoria: cat });

        showToast('✅ Pedido Recibido', 'Tu solicitud fue enviada a los repartidores disponibles de tu zona. La atención depende de la disponibilidad de un repartidor.', 'success', 5000);

        closePedidoModal();

        checkActiveOrderStatus();

        if (typeof renderActiveOrdersMap === 'function') {
          renderActiveOrdersMap();
        }
      }

    }).catch(e => {
       if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

       console.error(e);

       showToast('Error', 'Error de conexión con la cuenta. Tu pedido no pudo ser registrado.', 'error', 3000);

    });

  } else {
    showToast('Error', 'El servidor no está disponible. No se puede crear el pedido.', 'error', 3000);

  }
}

function cancelarPedidoActivo() {
  showConfirmModal('❌', '¿Cancelar tu pedido?', 'Tu pedido activo será eliminado del mapa y los repartidores dejarán de verlo.', 'Sí, cancelar', async () => {
    const rawOrder = JSON.stringify(AppState.get('activeOrder'));

    if (window.supabaseClient && rawOrder) {
      try {
        const order = JSON.parse(rawOrder);

        if (order.id) {
          const userId = await getAuthenticatedUserId();
          if (userId) {
             const { error } = await window.supabaseClient.from('pedidos')
                .delete()
                .eq('id', order.id)
                .eq('user_id', userId);

             if (error) {
                 console.error("Error cancelando pedido en Supabase:", error);
                 showToast('Error', 'No se pudo cancelar el pedido.', 'error', 3000);
             }
          }
        }

      } catch(e) {
          console.error("Error al cancelar pedido local:", e);
      }

    }

    if (typeof userMarker !== 'undefined' && userMarker && typeof userLocationIcon !== 'undefined') {
        userMarker.setIcon(userLocationIcon);
        await new Promise(r => setTimeout(r, 1500));
    }

    AppState.set('activeOrder', null);

    showToast('Pedido Cancelado', 'Se ha restaurado el estado normal de la aplicación.', 'error', 4000);

    checkActiveOrderStatus();

    if (typeof renderActiveOrdersMap === 'function') {
      renderActiveOrdersMap();

    }

  });
}
window.cancelarPedidoActivo = cancelarPedidoActivo;

async function confirmarRecepcionComprador() {
  showConfirmModal('🏁', 'Confirmar Recepción', '¿Confirmas que el repartidor llegó y recibiste tu pedido de forma exitosa?', 'Sí, lo recibí', async () => {
     const rawOrder = JSON.stringify(AppState.get('activeOrder'));

     if (window.supabaseClient && rawOrder) {
         showLoadingOverlay('Confirmando entrega...');

         try {
             const order = JSON.parse(rawOrder);

             if (order.id) {
                const localUserId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);
                const { error } = await window.supabaseClient.from('pedidos')
                    .update({ estado: 'entregado' })
                    .eq('id', order.id)
                    .eq('user_id', localUserId);

                if (error) {
                    console.error("Error confirmando entrega:", error);
                    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                    showToast('Error', 'No se pudo confirmar la entrega.', 'error');
                    return;
                }

             }

         } catch(e) {
             console.error("Excepción en confirmarRecepcionComprador:", e);
         } finally {
             if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
         }

     }

     if (typeof userMarker !== 'undefined' && userMarker && typeof garrafaGreenIcon !== 'undefined') {
         userMarker.setIcon(garrafaGreenIcon);
         await new Promise(r => setTimeout(r, 1500));
     }

     AppState.set('activeOrder', null);

     showToast('¡Gracias!', 'Gracias por confirmar. El pedido ha sido finalizado exitosamente.', 'success', 5000);

     checkActiveOrderStatus();

     if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  });
}

async function abrirPanoramicaPedidos() {
  let contenido = '';

  const now = Date.now();

  // Pedido propio activo (desde localStorage)

  const rawPropio = JSON.stringify(AppState.get('activeOrder'));

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

          <button data-action="cancelarPedidoActivo" style="margin-top:8px; background:#D32F2F; color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; width:100%;">❌ Cancelar este Pedido</button>

        </div>

      `;

    } catch(e){}

  }

  // FIX W-02: Cargar pedidos reales de otros vecinos desde Supabase (en lugar de mockOrders)

  let otrosPedidosHtml = '';

  if (window.supabaseClient) {
    try {
      const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;

      const activeWindow = new Date(now - expirationMs).toISOString();

      const ciudadReal = AppState.get('city');

      const { data: pedidosReales } = await window.supabaseClient
        .from('pedidos_publicos')
        .select('id, categoria, created_at')

        .eq('ciudad', ciudadReal)

        .gte('created_at', activeWindow)

        .order('created_at', { ascending: false })

        .limit(10);

      if (pedidosReales && pedidosReales.length > 0) {
        pedidosReales.forEach(o => {
          const min = Math.floor((now - new Date(o.created_at).getTime()) / 60000);

          const iconHtml = typeof obtenerIconoHtmlPorCategoria === 'function' ? obtenerIconoHtmlPorCategoria(o.categoria) : '📦';

          otrosPedidosHtml += `

            <div style="background: rgba(30,41,59,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; margin-bottom: 8px; display:flex; align-items:center; gap:10px;">

              <div style="width:36px; height:36px; background: rgba(255,109,0,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">${iconHtml}</div>

              <div style="flex:1;">

                <div style="font-size:12px; font-weight:700; color:white;">${escapeHtmlStr(o.categoria)}</div>

                <div style="font-size:11px; color:#94A3B8;">📍 Vecino cercano • ⏱️ hace ${min} min</div>

              </div>

              <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00E676; padding:3px 7px; border-radius:20px; font-weight:700;">ACTIVO</span>

            </div>

          `;

        });

        contenido += otrosPedidosHtml;

      } else if (!rawPropio) {
        contenido = `<div style="text-align:center; color:#64748B; padding:20px 0;"><i class="fa-solid fa-inbox" style="font-size:32px; margin-bottom:10px; display:block;"></i>No hay pedidos activos en tu zona en este momento.</div>`;

      }

    } catch (e) {
      console.warn('Error cargando pedidos reales en panorámica:', e);

    }

  }

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

          <button class="btn-close" data-action="cerrarPanoramicaPedidos">✖</button>

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

  let reporterName = "Un vecino";

  try {
    const saved = JSON.stringify(AppState.get('userData') || {});

    if (saved) {
      const u = JSON.parse(saved);

      if (u.nombre) reporterName = u.nombre;

    }

  } catch(e){}

  const alertPayload = {
    id: Date.now(),

    lat: pos.lat,

    lng: pos.lng,

    timestamp: Date.now(),

    reporter: reporterName,

    ciudad: AppState.get('city')

  };

  // Enviar a Supabase Realtime si está conectado

  if (window.supabaseClient && window._realtimeChannel) {
     window._realtimeChannel.send({
       type: 'broadcast',

       event: 'vecinos_alert',

       payload: alertPayload

     });

  }

  // Guardar localmente y mostrar

  recibirAlertaVecinalBroadcast(alertPayload);

  showToast('📢 Alerta Enviada', 'Los vecinos de tu ciudad han sido notificados de que hay un camión cerca.', 'success', 4000);
}

function lanzarEspecialEsperame() {
  const pos = getActiveUserLocation();

  let reporterName = "Un vecino";

  try {
    const saved = JSON.stringify(AppState.get('userData') || {});

    if (saved) {
      const u = JSON.parse(saved);

      if (u.nombre) reporterName = u.nombre;

    }

  } catch(e){}

  const alertPayload = {
    id: Date.now(),

    lat: pos.lat,

    lng: pos.lng,

    timestamp: Date.now(),

    reporter: `${reporterName} (🛑 Alerta Espérame)`,

    ciudad: AppState.get('city')

  };

  if (window.supabaseClient && window._realtimeChannel) {
     window._realtimeChannel.send({
       type: 'broadcast',

       event: 'vecinos_alert',

       payload: alertPayload

     });

  }

  recibirAlertaVecinalBroadcast(alertPayload);

  mostrarPopupAlertaRepartidor(
    'ALERTA VECINAL "ESPÉRAME"',
    `${reporterName} solicita que el camión detenga su marcha cerca de esta ubicación.`
  );

  showToast('Alerta Emitida', `Se ha colocado un punto de alerta en el mapa visible para todos los vecinos y repartidores.`, 'warning', 3000);
}

window.recibirAlertaVecinalBroadcast = function(payload) {
  // Solo procesar alertas de nuestra misma ciudad

  const miCiudad = AppState.get('city');

  if (payload.ciudad && payload.ciudad !== miCiudad) return;

  let buffer = [];

  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');

    if (raw) buffer = JSON.parse(raw);

  } catch(e){}

  // Evitar duplicados

  if (buffer.find(a => a.id === payload.id)) return;

  const now = Date.now();

  buffer = buffer.filter(t => (now - t.timestamp) < (30 * 60 * 1000));

  buffer.unshift(payload);

  localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(buffer));

  if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();
};
