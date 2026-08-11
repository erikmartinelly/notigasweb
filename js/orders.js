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
    let ciudadReal = AppState.get('city') || 'santacruz';

    const activeWindow = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await window.supabaseClient
      .from('pedidos')
      .select('*')
      .eq('ciudad', ciudadReal)
      .gte('created_at', activeWindow);
      
    if (data) {
      orders = data.filter(o => typeof isOrderCategoryMatchingDriver === 'function' && isOrderCategoryMatchingDriver(o.categoria));
      const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
      // En la app del repartidor, ver pedidos pendientes, y los que él mismo ha aceptado
      orders = orders.filter(o => o.estado === 'pendiente' || (o.estado === 'asignado' && o.driver_id === localUserId));
    }
  }

  if (orders.length === 0) {
    let driverCategoryName = "tu categoría";
    try {
      const u = JSON.parse(localStorage.getItem('notigas_user_data') || '{}');
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
          
          ${(ord.estado === 'asignado' && ord.driver_id === localUserId) 
            ? `<button onclick="confirmarEntregaPedido('${ord.id}')" style="flex:1; padding:10px; border:none; border-radius:8px; background:linear-gradient(135deg, #22C55E, #16A34A); color:white; font-weight:700; cursor:pointer;"><i class="fa-solid fa-check"></i> Entregado</button>` 
            : `<button onclick="aceptarPedidoRepartidor('${ord.id}')" style="flex:1; padding:10px; border:none; border-radius:8px; background:linear-gradient(135deg, #3B82F6, #2563EB); color:white; font-weight:700; cursor:pointer;"><i class="fa-solid fa-hand-holding"></i> Aceptar Pedido</button>`
          }
        </div>
      `;
  });

  container.innerHTML = html;
}
window.aceptarPedidoRepartidor = async function(id) {
  if (!window.supabaseClient) return;
  showConfirmModal('🚚', 'Aceptar Pedido', '¿Confirmas que te dirigirás a esta dirección ahora mismo?', 'Sí, iré ahora', async () => {
    showLoadingOverlay('Asignando pedido...');
    const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
    const { error } = await window.supabaseClient.from('pedidos').update({ estado: 'asignado', driver_id: localUserId }).eq('id', id).eq('estado', 'pendiente');
    hideLoadingOverlay();
    
    if (error) {
      console.error("Error al asignar pedido:", error);
      showToast('Error', 'El pedido ya fue tomado o hubo un problema.', 'error', 3000);
    } else {
      showToast('Asignado', 'Has aceptado el pedido. El vecino será notificado.', 'success', 3000);
      renderDriverOrdersList();
    }
  });
}
async function confirmarEntregaPedido(id) {
  if (!window.supabaseClient) return;
  showConfirmModal('🏁', 'Confirmar Entrega', '¿El vecino ya recibió su pedido y se realizó el pago?', 'Sí, ya entregué el pedido', async () => {
    showLoadingOverlay('Confirmando entrega...');
    const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
    const { error } = await window.supabaseClient.from('pedidos')
      .update({ estado: 'entregado' })
      .eq('id', id)
      .eq('driver_id', localUserId);
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
function ejecutarPurgaBaseDeDatosAuto() {
  const now = Date.now();
  const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;

  try {
    const rawOrder = localStorage.getItem('notigas_active_order');
    if (rawOrder) {
      const order = JSON.parse(rawOrder);
      if (order.timestamp && (now - order.timestamp) > expirationMs) {
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

}
function checkActiveOrderStatus() {
  ejecutarPurgaBaseDeDatosAuto();

  const btnCancel = document.getElementById('btnCancelOrder');
  const btnMain = document.getElementById('btnMainOrder');
  const rawOrder = localStorage.getItem('notigas_active_order');
  
  if (rawOrder) {
    try {
      const order = JSON.parse(rawOrder);
      if (btnCancel) btnCancel.style.display = 'flex';
      if (btnMain) btnMain.style.display = 'none'; 
      actualizarFaviconSegunPedido(order.categoria);
      
      if (window.supabaseClient) {
         const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
         if (document.getElementById('estadoPedidoActivo')) {
           window.supabaseClient.from('pedidos').select('estado').eq('user_id', localUserId).in('estado', ['pendiente', 'asignado']).order('created_at', {ascending: false}).limit(1).single()
           .then(({data, error}) => {
              if (error || !data) {
                 // Order is no longer active in DB
                 localStorage.removeItem('notigas_active_order');
                 checkActiveOrderStatus();
                 return;
              }
              if (data.estado === 'asignado') {
                 const btnCancel = document.getElementById('btnActiveOrderCancel');
                 if (btnCancel) {
                    btnCancel.innerHTML = `<i class="fa-solid fa-check-circle"></i> Ya recibí mi pedido`;
                    btnCancel.style.background = 'linear-gradient(135deg, #00E676, #00C853)';
                 }
                 document.getElementById('estadoPedidoActivo').innerHTML = `
                   <div style="background:linear-gradient(135deg, #10B981, #059669); padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:5px; color:white;">
                     <i class="fa-solid fa-truck-fast"></i> ¡Un Repartidor va en camino!
                   </div>
                 `;
                 if (!sessionStorage.getItem('notigas_notified_asignado')) {
                    showToast('🚚 ¡Repartidor asignado!', 'Un repartidor ha aceptado tu pedido y va hacia allá.', 'success', 6000);
                    sessionStorage.setItem('notigas_notified_asignado', 'true');
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

  if (window.supabaseClient) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Creando pedido...');
    window.supabaseClient.auth.getSession().then(async ({ data: sessionData }) => {
      // Usar UUID real de la sesión o bloquear si no hay sesión
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
         if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
         alert("❌ Error de seguridad: Debes iniciar sesión con Google para pedir.");
         return;
      }
      
      const ciudadReal = AppState.get('city') || 'santacruz';

      const { data: resultData, error } = await window.supabaseClient.from('pedidos').insert([{
          categoria: cat,
          cantidad: 1,
          direccion: direccion,
          telefono: telefono,
          descripcion: `Cantidad: 1 unidad. Dirección: ${direccion}. Teléfono: ${telefono}. Cliente: ${buyerName}`,
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
        localStorage.setItem('notigas_active_order', JSON.stringify(activeOrderData));

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
    const rawOrder = localStorage.getItem('notigas_active_order');
    localStorage.removeItem('notigas_active_order');
    
    if (window.supabaseClient && rawOrder) {
      try {
        const order = JSON.parse(rawOrder);
        if (order.id) {
          const { error } = await window.supabaseClient.from('pedidos').update({ estado: 'cancelado' }).eq('id', order.id);
          if (error) console.error("Error cancelando pedido en Supabase:", error);
        }
      } catch(e) {}
    }
    showToast('Pedido Cancelado', 'Se ha restaurado el estado normal de la aplicación.', 'error', 4000);
    checkActiveOrderStatus();
    if (typeof renderActiveOrdersMap === 'function') {
      renderActiveOrdersMap();
    }
  });
}
async function confirmarRecepcionComprador() {
  showConfirmModal('🏁', 'Confirmar Recepción', '¿Confirmas que el repartidor llegó y recibiste tu pedido de forma exitosa?', 'Sí, lo recibí', async () => {
     const rawOrder = localStorage.getItem('notigas_active_order');
     localStorage.removeItem('notigas_active_order');
     
     if (window.supabaseClient && rawOrder) {
         showLoadingOverlay('Confirmando entrega...');
         try {
             const order = JSON.parse(rawOrder);
             if (order.id) {
                const { error } = await window.supabaseClient.from('pedidos').update({ estado: 'entregado' }).eq('id', order.id);
                if (error) console.error(error);
             }
         } catch(e) {}
         if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
     }
     showToast('¡Gracias!', 'Gracias por confirmar. El pedido ha sido finalizado exitosamente.', 'success', 5000);
     checkActiveOrderStatus();
     if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
  });
}
async function abrirPanoramicaPedidos() {
  let contenido = '';
  const now = Date.now();

  // Pedido propio activo (desde localStorage)
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

  // FIX W-02: Cargar pedidos reales de otros vecinos desde Supabase (en lugar de mockOrders)
  let otrosPedidosHtml = '';
  if (window.supabaseClient) {
    try {
      const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
      const activeWindow = new Date(now - expirationMs).toISOString();
      const ciudadReal = AppState.get('city') || 'santacruz';
      const { data: pedidosReales } = await window.supabaseClient
        .from('pedidos')
        .select('id, categoria, descripcion, created_at')
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
  let reporterName = "Un vecino";
  try {
    const saved = localStorage.getItem('notigas_user_data');
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
    ciudad: AppState.get('city') || 'santacruz'
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
    const saved = localStorage.getItem('notigas_user_data');
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
    ciudad: AppState.get('city') || 'santacruz'
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
  const miCiudad = AppState.get('city') || 'santacruz';
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

window.aceptarPedidoRepartidor = async function(orderId) {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  
  if (!window.supabaseClient) {
    alert('? Error: Sin conexin a la base de datos.');
    return;
  }
  
  const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : 'anonimo_id';
  
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Aceptando pedido...');
  
  const { data, error } = await window.supabaseClient.from('pedidos')
    .update({ estado: 'asignado', driver_id: localUserId })
    .eq('id', orderId)
    .eq('estado', 'pendiente')
    .select()
    .single();
    
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  
  if (error || !data) {
    console.error('Error al aceptar pedido:', error);
    alert('? No se pudo aceptar el pedido. Es posible que otro repartidor ya lo haya tomado o haya sido cancelado.');
    return;
  }
  
  if (typeof showToast === 'function') {
    showToast('Pedido Aceptado!', 'Has aceptado el pedido exitosamente. El vecino ha sido notificado.', 'success', 5000);
  } else {
    alert('? PEDIDO ACEPTADO!\nEl vecino ha sido notificado de que ests en camino.');
  }
  
  // Refrescar el mapa para mostrar el pedido asignado
  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
};

