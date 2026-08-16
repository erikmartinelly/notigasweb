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

  container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Cargando pedidos...</div>';

  let orders = [];

  if (window.supabaseClient) {
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
    } catch (e) {
      console.warn('Error obteniendo perfil de chofer desde base de datos:', e);
    }

    // Fallback secundario a AppState
    if (!driverCiudad || !driverCategoria) {
      const userData = (typeof AppState !== 'undefined') ? (AppState.get('userData') || {}) : {};
      driverCiudad = driverCiudad || userData.ciudad || userData.city || ((typeof AppState !== 'undefined') ? AppState.get('city') : '');
      driverCategoria = driverCategoria || userData.categoria || userData.category || 'gas';
    }

    if (!localUserId && typeof getCurrentUserId === 'function') {
      localUserId = getCurrentUserId();
    }

    if (!driverCiudad) {
      container.innerHTML = `<div style="padding:24px; text-align:center; color:#94A3B8; font-size:13px;"><i class="fa-solid fa-triangle-exclamation" style="font-size:28px; color:#F59E0B; margin-bottom:10px;"></i><br><strong style="color:white;">No se pudo determinar la ciudad activa.</strong><br><span style="font-size:11px; color:#64748B;">Selecciona tu ciudad en el mapa o perfil para ver pedidos.</span></div>`;
      return;
    }

    const activeWindow = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const normCity = String(driverCiudad).toLowerCase().trim();

    const { data, error } = await window.supabaseClient
      .from('pedidos')
      .select('*')
      .ilike('ciudad', normCity)
      .in('estado', ['pendiente', 'visto', 'asignado'])
      .gte('created_at', activeWindow)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando pedidos:', error);
      container.innerHTML = `<div style="padding:24px; text-align:center; color:#EF4444; font-size:13px;"><i class="fa-solid fa-circle-exclamation" style="font-size:28px; margin-bottom:10px;"></i><br><strong>Error cargando pedidos: ${window.escapeHtmlStr(error.message || '')}</strong></div>`;
      return;
    }

    if (data) {
      // Filtramos con normalización de categoría flexible y por disponibilidad de pedido
      orders = data.filter(o => {
        const matchesCategory = (typeof window.isOrderCategoryMatchingDriver === 'function')
          ? window.isOrderCategoryMatchingDriver(o.categoria, driverCategoria)
          : true;
        const isAvailable = o.estado === 'pendiente' || o.estado === 'visto' || (o.estado === 'asignado' && o.driver_id === localUserId);
        return matchesCategory && isAvailable;
      });
    }
  }

  if (orders.length === 0) {
    let driverCategoryName = "tu categoría";
    try {
      const u = JSON.parse(JSON.stringify(AppState.get('userData') || {}) || '{}');
      if (u.categoria) driverCategoryName = u.categoria;
    } catch(e){}

    container.innerHTML = `<div style="padding:24px; text-align:center; color:#94A3B8; font-size:13px;"><i class="fa-solid fa-filter-circle-xmark" style="font-size:28px; color:#F59E0B; margin-bottom:10px;"></i><br><strong style="color:white;">No hay pedidos activos de ${driverCategoryName}</strong><br><span style="font-size:11px; color:#64748B;">Solo recibes pedidos de tu rubro exclusivo en este momento.</span></div>`;
    return;
  }

  let html = '';
  orders.forEach(ord => {
    const mins = Math.floor((Date.now() - new Date(ord.created_at).getTime()) / 60000);
    html += `
        <div class="order-card-pressable" data-action="centrarPedidoEnMapa" data-lat="${ord.latitude || ord.lat}" data-lng="${ord.longitude || ord.lng}" data-order-id="${window.escapeHtmlStr(String(ord.id || ''))}" style="background:#1E293B; padding:12px; margin-bottom:10px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.25); border:1px solid rgba(245, 158, 11, 0.2); cursor:pointer;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="font-weight:900; font-size:13px; color:#F8FAFC;">🛒 Pedido #${ord.id ? String(ord.id).slice(0, 8) : '?'}</span>
            <span style="font-size:10px; color:#F59E0B; font-weight:700;">⏱ ${mins} min</span>
          </div>
          <div style="font-size:12px; margin-bottom:4px; color:#CBD5E1;">📍 <strong>Dir:</strong> ${window.escapeHtmlStr(ord.direccion || '')}</div>
          <div style="font-size:12px; margin-bottom:4px; color:#CBD5E1;">📦 <strong>Prod:</strong> ${window.escapeHtmlStr(ord.categoria || '')} (${window.escapeHtmlStr(ord.cantidad || '')} un)</div>
          ${ord.telefono ? `<div style="font-size:12px; margin-bottom:8px; color:#00E676;">📞 <strong>Tel:</strong> ${window.escapeHtmlStr(ord.telefono)}</div>` : ''}
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button data-action="centrarPedidoEnMapa" data-lat="${ord.latitude || ord.lat}" data-lng="${ord.longitude || ord.lng}" data-id="${ord.id}" data-order-id="${ord.id}" class="btn-secondary" style="flex:1; padding:8px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
              📍 Ver mapa
            </button>
            <button data-action="abrirRutaGoogleMaps" data-lat="${ord.latitude || ord.lat}" data-lng="${ord.longitude || ord.lng}" data-id="${ord.id}" class="btn-driver-route" style="flex:1; padding:8px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">
              🚀 Ir al pedido
            </button>
          </div>
        </div>
      `;
  });

  container.innerHTML = html;
}

window.centrarPedidoEnMapa = function(lat, lng, id) {
  if (typeof map !== 'undefined' && lat && lng) {
     const m = document.getElementById('modalDriverOrders');
     if (m) m.style.display = 'none';
     map.flyTo([lat, lng], 18, { duration: 1.5 });
     // Abrir el popup si el marcador existe en la vista del mapa
     if (window.neighborOrderMarkers && window.neighborOrderMarkers[id]) {
        setTimeout(() => window.neighborOrderMarkers[id].openPopup(), 1500);
     }
  }
}

// window.aceptarPedidoRepartidor removido intencionalmente (Fase 3: Sólo grupos)

window.aceptarGrupoDemanda = async function(clusterId, ciudad, categoria) {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'Sin conexión a la base de datos.', 'error');
    else alert('❌ Error: Sin conexión a la base de datos.');
    return;
  }
  showConfirmModal('🚚', 'Aceptar Grupo', '¿Deseas asignarte este grupo de pedidos?', 'Sí, aceptar pedidos', async () => {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Asignando pedidos...');

    // Call RPC to officially assign the orders in backend
    const { error } = await window.supabaseClient.rpc('rpc_accept_demand_cluster_v2', {
        p_cluster_id: clusterId,
        p_ciudad: ciudad,
        p_categoria: categoria
    });

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (error) {
      console.error("Error asignando cluster:", error);
      if (typeof showToast === 'function') showToast('Error', error.message || 'No se pudo asignar el grupo de pedidos.', 'error');
      else alert('❌ No se pudo asignar el grupo de pedidos.');
      return;
    }

    AppState.set('activeClusterId', clusterId);
    AppState.set('activeClusterCity', ciudad);
    AppState.set('activeClusterCategoria', categoria);

    if (typeof showToast === 'function') {
      showToast('¡Pedidos Asignados!', 'Los pedidos de la zona han sido asignados a ti.', 'success', 5000);
    }

    if (window.demandClusterMarkers && window.demandClusterMarkers[clusterId]) {
      if (typeof map !== 'undefined' && map) map.removeLayer(window.demandClusterMarkers[clusterId]);
      delete window.demandClusterMarkers[clusterId];
    }

    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
  });
}

window.abrirRutaGoogleMaps = async function (a, b, c) {
  let orderId, lat, lng;

  // Soportar ambas firmas: (orderId, lat, lng) y (lat, lng, orderId)
  if (typeof a === 'string' && (typeof b === 'number' || typeof b === 'string') && (typeof c === 'number' || typeof c === 'string') && isNaN(Number(a))) {
    orderId = a;
    lat = Number(b);
    lng = Number(c);
  } else {
    lat = Number(a);
    lng = Number(b);
    orderId = c;
  }

  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();

  if (!orderId || lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    console.error('Datos incompletos del pedido:', {
      orderId,
      lat,
      lng
    });

    if (typeof showToast === 'function') {
      showToast('Error', 'No se puede abrir la ruta: faltan datos del pedido.', 'error', 4000);
    } else {
      alert('No se puede abrir la ruta: faltan datos del pedido.');
    }
    return;
  }

  try {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Asignando pedido...');

    const { data, error } = await window.supabaseClient.rpc(
      'rpc_assign_order',
      {
        p_order_id: orderId
      }
    );

    if (error) {
      console.error('Error asignando pedido:', error);
      const msg = error.message || 'El pedido ya no está disponible.';
      if (typeof showToast === 'function') {
        showToast('No disponible', msg, 'error', 5000);
      } else {
        alert('❌ ' + msg);
      }
      return;
    }

    if (!data?.ok) {
      if (typeof showToast === 'function') {
        showToast('Error', 'No se pudo asignar el pedido.', 'error', 4000);
      } else {
        alert('No se pudo asignar el pedido.');
      }
      return;
    }

    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(`${lat},${lng}`)}`;

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );

  } catch (err) {
    console.error('Error inesperado asignando pedido:', err);
    if (typeof showToast === 'function') {
      showToast('Error', 'No se pudo asignar el pedido. Intenta nuevamente.', 'error', 4000);
    } else {
      alert('No se pudo asignar el pedido. Intenta nuevamente.');
    }
  } finally {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
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
      .in('estado', ['asignado', 'en_ruta', 'en_camino']);

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

function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');

  const btnMain = document.getElementById('btnMainOrder');

  const activeOrder = AppState.get('activeOrder');
  const isAdmin = AppState.get('isAdmin');

  if (activeOrder && !isAdmin) {
    try {
      const order = activeOrder;

      if (btnCancel) btnCancel.style.display = 'flex';
      if (btnMain) btnMain.style.display = 'none';

      const tripCard = document.getElementById('notigasTripCard');
      const buyerActions = document.getElementById('buyerFloatingActions');
      if (tripCard) {
        tripCard.style.display = 'block';
        // Mostrar buyerActions pero ocultar btnMain y botones irrelevantes
        if (buyerActions) buyerActions.style.display = 'flex';
      }

      const statusText = document.getElementById('tripCardStatusText');
      const driverName = document.getElementById('tripCardDriverName');
      const timeEst = document.getElementById('tripCardTime');
      const statusIndicator = document.getElementById('tripCardStatusIndicator');

      const estado = String(order.estado || 'pendiente').toLowerCase();

      if (estado === 'pendiente' || estado === 'visto') {
        if (statusText) statusText.innerText = 'BUSCANDO';
        if (driverName) driverName.innerText = 'SOLICITUD ENVIADA';
        if (timeEst) timeEst.innerText = 'Esperando disponibilidad de un repartidor en tu zona...';
        if (statusIndicator) {
          statusIndicator.style.background = '#FF9800';
          statusIndicator.style.boxShadow = '0 0 7px rgba(255,152,0,.55)';
        }
      } else if (estado === 'asignado') {
        if (statusText) statusText.innerText = 'ASIGNADO';
        if (driverName) driverName.innerText = 'REPARTIDOR ASIGNADO';
        if (timeEst) timeEst.innerText = 'Un repartidor aceptó tu pedido.';
        if (statusIndicator) {
          statusIndicator.style.background = '#3B82F6';
          statusIndicator.style.boxShadow = '0 0 7px rgba(59,130,246,.55)';
        }
      } else if (estado === 'en_ruta' || estado === 'en_camino') {
        if (statusText) statusText.innerText = 'EN RUTA';
        if (driverName) driverName.innerText = 'REPARTIDOR EN CAMINO';
        if (timeEst) timeEst.innerText = 'El repartidor está transmitiendo su ruta en vivo.';
        if (statusIndicator) {
          statusIndicator.style.background = '#10B981';
          statusIndicator.style.boxShadow = '0 0 7px rgba(16,185,129,.55)';
        }
      } else if (estado === 'entregado') {
        if (statusText) statusText.innerText = 'ENTREGADO';
        if (driverName) driverName.innerText = 'PEDIDO COMPLETADO';
        if (timeEst) timeEst.innerText = 'Pedido entregado exitosamente.';
        if (statusIndicator) {
          statusIndicator.style.background = '#10B981';
          statusIndicator.style.boxShadow = '0 0 7px rgba(16,185,129,.55)';
        }
      }

      actualizarFaviconSegunPedido(order.categoria, order.estado);

      if (window.supabaseClient && order.id) {
         window.supabaseClient.from('pedidos').select('estado').eq('id', order.id).maybeSingle()
         .then(({data, error}) => {
            if (error || !data) return;
            if (data.estado && data.estado !== order.estado) {
               order.estado = data.estado;
               AppState.set('activeOrder', order);
               if (data.estado === 'entregado' || data.estado === 'cancelado') {
                  setTimeout(() => {
                    AppState.set('activeOrder', null);
                    checkActiveOrderStatus();
                  }, 3000);
               } else {
                  checkActiveOrderStatus();
               }
            }
         }).catch(err => {
            console.warn("Verificación de estado de pedido:", err);
         });
      }

      if (typeof renderActiveOrdersMap === 'function') {
        renderActiveOrdersMap();

      }

      return;

    } catch(e){}

  }

  if (btnCancel) btnCancel.style.display = 'none';
  if (btnMain) btnMain.style.display = 'flex'; // Restaurar Hacer Pedido

  const tripCard = document.getElementById('notigasTripCard');
  if (tripCard) tripCard.style.display = 'none';
  const buyerActions = document.getElementById('buyerFloatingActions');
  if (buyerActions) buyerActions.style.display = 'flex';

  actualizarFaviconSegunPedido(null);

  if (typeof renderActiveOrdersMap === 'function') {
    renderActiveOrdersMap();

  }
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
                const localUserId = await getAuthenticatedUserId();
                const { error } = await window.supabaseClient.from('pedidos')
                    .delete()
                    .eq('id', order.id)
                    .eq('user_id', localUserId);

                if (error) {
                    console.error(error);
                    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                    showToast('Error', 'No se pudo confirmar la entrega.', 'error');
                    return;
                }

             }

         } catch(e) {}

         if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

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

  mostrarPopupAlertaRepartidor(`🛑 <strong>¡ALERTA VECINAL "ESPÉRAME"!</strong><br>${reporterName} solicita que el camión detenga su marcha cerca de esta ubicación.`);

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
