/* ORDERS LOGIC */

function abrirModalDriverOrders() {

  renderDriverOrdersList();

  const modal = document.getElementById('modalDriverOrders');

  if (modal) modal.style.display = 'flex';

}

function closeDriverOrdersModal() {

  const modal = document.getElementById('modalDriverOrders');

  if (modal) modal.style.display = 'none';

}

async function renderDriverOrdersList() {

  const container = document.getElementById('driverOrdersContainer');

  if (!container) return;



  container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Cargando pedidos...</div>';



  let orders = [];

  if (window.supabaseClient) {

    const userData = AppState.get('userData');
    let ciudadReal = (userData && (userData.ciudad || userData.city)) ? (userData.ciudad || userData.city) : AppState.get('city');



    const activeWindow = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data } = await window.supabaseClient
      .from('pedidos')
      .select('*')
      .eq('ciudad', ciudadReal)
      .gte('created_at', activeWindow);
      
    if (data) {
      orders = data.filter(o => typeof isOrderCategoryMatchingDriver === 'function' && isOrderCategoryMatchingDriver(o.categoria));
      // Filtramos por estado 'pendiente' por si queda algún rastro, aunque físicamente se borran.
      orders = orders.filter(o => o.estado === 'pendiente' || o.estado === 'activo');
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

        <div style="background:#FFF; padding:12px; margin-bottom:10px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.05); border:1px solid #E2E8F0;">

          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">

            <span style="font-weight:900; font-size:13px; color:#1E293B;">🛒 Pedido #${ord.id || '?'}</span>

            <span style="font-size:10px; color:#64748B;">⏱ ${mins} min</span>

          </div>

          <div style="font-size:12px; margin-bottom:4px; color:#475569;">📍 <strong>Dir:</strong> ${window.escapeHtmlStr(ord.direccion || '')}</div>

          <div style="font-size:12px; margin-bottom:4px; color:#475569;">📦 <strong>Prod:</strong> ${window.escapeHtmlStr(ord.categoria || '')} (${window.escapeHtmlStr(ord.cantidad || '')} un)</div>

          ${ord.telefono ? `<div style="font-size:12px; margin-bottom:8px; color:#475569;">📞 <strong>Tel:</strong> ${window.escapeHtmlStr(ord.telefono)}</div>` : ''}

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button onclick="window.centrarPedidoEnMapa(${ord.latitude || ord.lat}, ${ord.longitude || ord.lng}, '${ord.id}')" style="flex:1; background:#E2E8F0; color:#1E293B; border:none; padding:8px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
              📍 Ver mapa
            </button>
            <button onclick="window.abrirRutaGoogleMaps(${ord.latitude || ord.lat}, ${ord.longitude || ord.lng}, '${ord.id}')" style="flex:1; background:#2494e8; color:white; border:none; padding:8px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
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
    else if (typeof showToast === 'function') { showToast('Notificación', '❌ Error: Sin conexión a la base de datos.', 'info', 4000); } else { alert('❌ Error: Sin conexión a la base de datos.'); };
    return;
  }
  showConfirmModal('🚚', 'Aceptar Grupo', '¿Deseas asignarte este grupo de pedidos?', 'Sí, aceptar pedidos', async () => {
    
    AppState.set('activeClusterId', clusterId);
    AppState.set('activeClusterCity', ciudad);
    AppState.set('activeClusterCategoria', categoria);
    
    if (typeof showToast === 'function') {
      showToast('¡Pedidos Asignados!', 'Los pedidos de la zona han sido asignados a ti.', 'success', 5000);
    } else {
      if (typeof showToast === 'function') { showToast('Notificación', '✅ ¡PEDIDOS ASIGNADOS!\nLos pedidos de la zona han sido asignados a ti.', 'info', 4000); } else { alert('✅ ¡PEDIDOS ASIGNADOS!\nLos pedidos de la zona han sido asignados a ti.'); };
    }
    
    if (window.demandClusterMarkers && window.demandClusterMarkers[clusterId]) {
      if (typeof map !== 'undefined' && map) map.removeLayer(window.demandClusterMarkers[clusterId]);
      delete window.demandClusterMarkers[clusterId];
    }
    
    // Call RPC to officially assign the orders
    const localUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : (AppState.get('userData') ? AppState.get('userData').id : null);
    if (localUserId) {
        await window.supabaseClient.rpc('rpc_accept_demand_cluster_v2', {
            p_cluster_id: clusterId,
            p_ciudad: ciudad,
            p_categoria: categoria
        });
    }

    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
  });
}

window.abrirRutaGoogleMaps = async function(lat, lng, orderId) {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  
  if (window.supabaseClient && orderId) {
    const localUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : (AppState.get('userData') ? AppState.get('userData').id : null);
    if (localUserId) {
      // Intentar asignar el pedido al repartidor si aún no está asignado
      await window.supabaseClient.from('pedidos')
        .update({ estado: 'asignado', repartidor_asignado: localUserId })
        .eq('id', orderId)
        .eq('estado', 'pendiente');
    }
  }

  // Abrir Google Maps con las coordenadas
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
}

async function confirmarEntregaPedido(id) {

  if (!window.supabaseClient) return;

  showConfirmModal('🏁', 'Confirmar Entrega', '¿El vecino ya recibió su pedido y se realizó el pago?', 'Sí, ya entregué el pedido', async () => {

    showLoadingOverlay('Confirmando entrega...');

    const localUserId = await getAuthenticatedUserId();

    const { error } = await window.supabaseClient.from('pedidos')

      .update({ estado: 'entregado' })

      .eq('id', id)

      .eq('driver_id', localUserId)
      
      .eq('estado', 'asignado');

    hideLoadingOverlay();

    

    if (error) {

      console.error("Error confirmando entrega:", error);

      showToast('Error', 'No se pudo confirmar la entrega.', 'error');

    } else {

      closeDriverOrdersModal();

      showToast('¡Buen trabajo!', 'Pedido entregado. El pedido fue archivado en tus estadísticas.', 'success', 5000);

    }

  });

}

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

  } catch(e){}



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
      
      if (statusText) statusText.innerText = (order.estado || 'ESPERA').toUpperCase();
      if (driverName) driverName.innerText = order.repartidor_asignado ? 'EN CAMINO' : 'BUSCANDO...';
      if (timeEst) timeEst.innerText = order.repartidor_asignado ? 'Aproximadamente 8-15 min.' : 'Asignando repartidor...';
      if (statusIndicator) {
         statusIndicator.style.background = order.repartidor_asignado ? '#27d17f' : '#FF9800';
         statusIndicator.style.boxShadow = order.repartidor_asignado ? '0 0 7px rgba(39,209,127,.55)' : '0 0 7px rgba(255,152,0,.55)';
      }


      actualizarFaviconSegunPedido(order.categoria, order.estado);

      

      if (window.supabaseClient) {

         const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';

         const estadoEl = document.getElementById('estadoPedidoActivo');
         if (estadoEl) {
           window.supabaseClient.from('pedidos').select('estado').eq('id', order.id).single()
           .then(({data, error}) => {
              if (error || !data) {
                 // Order is no longer active in DB
                 AppState.set('activeOrder', null);
                 checkActiveOrderStatus();
                 return;
              }
              if (data.estado === 'asignado') {
                 const btnCancel = document.getElementById('btnActiveOrderCancel');
                 if (btnCancel) {
                    btnCancel.innerHTML = `<i class="fa-solid fa-check-circle"></i> Ya recibí mi pedido`;
                    btnCancel.style.background = 'linear-gradient(135deg, #00E676, #00C853)';
                 }
                 const el = document.getElementById('estadoPedidoActivo');
                 if (el) {
                   el.innerHTML = `
                   <div style="background:linear-gradient(135deg, #10B981, #059669); padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:5px; color:white;">
                     <i class="fa-solid fa-truck-fast"></i> ¡Un Repartidor va en camino!
                   </div>
                   `;
                 }
                 if (!sessionStorage.getItem('notigas_notified_asignado')) {
                    showToast('🚚 ¡Repartidor asignado!', 'Un repartidor ha aceptado tu pedido y va hacia allá.', 'success', 6000);
                    sessionStorage.setItem('notigas_notified_asignado', 'true');
                 }
              }
           }).catch(err => {
              console.warn("Verificación de estado de pedido:", err);
           });
         }

                 }

              }

           });

         }

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

  const pos = getActiveUserLocation();

  let cat = document.getElementById('selectCategoria')?.value || 'gas';

  if (cat === 'otros') {
    const detail = (document.getElementById('inputOrderOtrosDetalle')?.value || '').trim();
    if (detail) {
        // Appending to a generic field instead of corrupting the category code
        // For now, we will just use the standard 'otros' category code
    }
  }



  const inputAddr = (document.getElementById('inputCallePrincipal')?.value || '').trim();

  const inputTel = (document.getElementById('inputTelefonoComprador')?.value || '').trim();



  // Tanto la dirección como el teléfono son OPCIONALES (el mapa ya ubica al comprador vía GPS)

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

      // Usar UUID real de la sesión o bloquear si no hay sesión

      const userId = sessionData?.session?.user?.id;

      if (!userId) {

         if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

         if (typeof showToast === 'function') { showToast('Notificación', "❌ Error de seguridad: Debes iniciar sesión con Google o Email para pedir.", 'info', 4000); } else { alert("❌ Error de seguridad: Debes iniciar sesión con Google o Email para pedir."); };

         return;

      }

      

      const ciudadReal = AppState.get('city');



      const { data: resultData, error } = await window.supabaseClient.from('pedidos').insert([{

          categoria: cat,

          cantidad: 1,

          titulo: buyerName,

          direccion: direccion,

          telefono: telefono,

          descripcion: `Pedido rápido: 1 unidad.`,

          ciudad: ciudadReal,

          barrio_otb: 'Por GPS',

          user_id: userId,

          latitude: pos.lat,

          longitude: pos.lng

      }]).select('id').single();



      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();



      if(error) {

        console.error("Error enviando pedido a Supabase:", error);

        showToast('Error', 'No se pudo enviar el pedido al servidor.', 'error', 3000);

      } else {

        console.log("✅ Pedido guardado en Supabase.");

        

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

        

        showToast('✅ ¡Pedido en Camino!', 'Tu orden ha sido confirmada y transmitida a los repartidores de tu zona. Permanece atento a tu teléfono.', 'success', 4000);

        closePedidoModal();

        checkActiveOrderStatus();



        if (typeof renderActiveOrdersMap === 'function') {

          renderActiveOrdersMap();

        }



        showToast('Pedido Publicado en Mapa', `🚀 ${cat}\n📍 ${direccion}${telefono ? '\n📞 Tel: ' + telefono : ''}`, 'order', 3000);

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
                 return;
             }
          }
        }

      } catch(e) {}

    }
    
    if (typeof userMarker !== 'undefined' && userMarker && typeof garrafaGreenIcon !== 'undefined') {
        userMarker.setIcon(garrafaGreenIcon);
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


