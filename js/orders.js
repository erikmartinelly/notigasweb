
function sincronizarSelectCiudadesBoliviaEnModal(selectEl, selectedVal) {
  if (!selectEl) return;
  const currentVal = (selectedVal || selectEl.value || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba') || 'cochabamba').toLowerCase().trim();
  
  if (window.BOLIVIA_CITIES && Object.keys(window.BOLIVIA_CITIES).length > 0) {
    selectEl.innerHTML = '';
    Object.keys(window.BOLIVIA_CITIES).forEach(key => {
      const c = window.BOLIVIA_CITIES[key];
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `📍 ${c.nombre || c.name || key}`;
      if (key === currentVal) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }
}
window.sincronizarSelectCiudadesBoliviaEnModal = sincronizarSelectCiudadesBoliviaEnModal;

/* ==========================================================================
   NOTIGAS - GESTIÓN DE PEDIDOS Y ALERTAS VECINALES (V105)
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

function abrirModalDriverOrders() {
  const modal = document.getElementById('modalDriverOrders');
  if (modal) {
    const selCity = document.getElementById('selectDriverModalCity');
    const curCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'cochabamba') : 'cochabamba';
    if (selCity) {
      if (typeof sincronizarSelectCiudadesBoliviaEnModal === 'function') {
        sincronizarSelectCiudadesBoliviaEnModal(selCity, curCity);
      }
      selCity.value = curCity;
    }
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
  // La lista legacy nunca debe consultar pedidos libres completos. Primero carga
  // y delega a la capa de privacidad, que consume order_public_radar.
  if (typeof window.secureRenderDriverOrdersList === 'function') {
    return window.secureRenderDriverOrdersList();
  }
  if (typeof window.loadDriverPaymentsModule === 'function') {
    try {
      await window.loadDriverPaymentsModule();
      if (typeof window.secureRenderDriverOrdersList === 'function') {
        return window.secureRenderDriverOrdersList();
      }
    } catch (err) {
      console.warn('[Orders] No se pudo cargar la capa segura de pedidos:', err);
    }
  }
  const container = document.getElementById('driverOrdersContainer') || document.getElementById('driverOrdersList');
  if (!container) return;

  if (!window.supabaseClient) {
    container.innerHTML = '<div style="padding:15px; color:#F8FAFC; text-align:center;">Sin conexión a Supabase</div>';
    return;
  }

  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const localUserId = (typeof getAuthenticatedUserId === 'function')
    ? await getAuthenticatedUserId()
    : ((typeof getCurrentUserId === 'function') ? getCurrentUserId() : null);

  // Regla estricta: un repartidor SOLO ve y toma pedidos de la ciudad donde se registró
  let driverCity = null;
  if (userData && userData.ciudad && userData.ciudad !== 'todos' && userData.ciudad !== 'all') {
    driverCity = String(userData.ciudad).toLowerCase().trim();
  } else {
    // Si no está registrado en una ciudad, usar la ciudad del GPS (o la seleccionada) para restringir
    const rawCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
    driverCity = (rawCity && rawCity !== 'todos' && rawCity !== 'all') ? String(rawCity).toLowerCase().trim() : null;
  }

  // El recolector puede marcar varios materiales, asi que la columna categoria
  // guarda una lista separada por coma. El pedido le sirve si CUALQUIERA de sus
  // materiales coincide con los del recolector.
  const driverCategoria = (userData && userData.categoria) ? userData.categoria : 'plastico';
  const driverCatList = (typeof window.normalizeCategoryList === 'function')
    ? window.normalizeCategoryList(driverCategoria)
    : [String(driverCategoria).toLowerCase().trim()];

  const expirationMs = (window.NOTIGAS && window.NOTIGAS.ORDER_EXPIRATION_MS) ? window.NOTIGAS.ORDER_EXPIRATION_MS : 48 * 60 * 60 * 1000;
  const activeWindow = new Date(Date.now() - expirationMs).toISOString();

  // 1. Pedidos disponibles desde la vista pública (filtrado estricto por ciudad y categoría del chofer)
  let pubQuery = window.supabaseClient
    .from('pedidos_publicos')
    .select('id, user_id, categoria, titulo, cantidad, direccion, telefono, descripcion, barrio_otb, latitude, longitude, created_at, estado, driver_id, ciudad, subestado')
    .in('estado', ['pendiente', 'visto'])
    .is('driver_id', null)
    .gte('created_at', activeWindow)
    .order('created_at', { ascending: false });

  if (driverCity) {
    const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(driverCity) : [driverCity];
    pubQuery = pubQuery.in('ciudad', cityKeys);
  }

  // Filtrado a nivel de base de datos por categoría.
  // pedidos.categoria está forzada a un código canónico por el CHECK
  // pedidos_categoria_catalogo_chk, asi que basta con comparar contra la lista
  // de materiales del recolector. "todos" y "otros" no son materiales reales.
  const filtrosCat = (driverCatList || [])
    .filter(c => c && c !== 'todos' && c !== 'otros');
  if (filtrosCat.length === 1) {
    pubQuery = pubQuery.eq('categoria', filtrosCat[0]);
  } else if (filtrosCat.length > 1) {
    pubQuery = pubQuery.in('categoria', filtrosCat);
  }

  // 2. Pedidos ya asignados a este repartidor desde la tabla pedidos
  let assignedPromise = Promise.resolve({ data: [], error: null });
  if (localUserId) {
    let assignedQuery = window.supabaseClient
      .from('pedidos')
        .select('id, user_id, categoria, tipo_solicitud, titulo, cantidad, direccion, telefono, descripcion, barrio_otb, latitude, longitude, created_at, estado, driver_id, ciudad, subestado')
      .eq('driver_id', localUserId)
      .eq('estado', 'asignado')
      .gte('created_at', activeWindow)
      .order('created_at', { ascending: false });
    if (driverCity) {
      const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(driverCity) : [driverCity];
      assignedQuery = assignedQuery.in('ciudad', cityKeys);
    }
    assignedPromise = assignedQuery;
  }

  // 3. Estado operativo del repartidor. NOTIGAS no cobra comisión ni saldo:
  // la suspensión solo puede ser una sanción administrativa.
  let driverFinancePromise = Promise.resolve({ data: null, error: null });
  if (localUserId) {
    driverFinancePromise = window.supabaseClient
      .from('choferes_habilitados')
      .select('estado_servicio, bloqueado, motivo_bloqueo')
      .eq('user_id', localUserId)
      .maybeSingle();
  }

  const [pubRes, assignedRes, finRes] = await Promise.all([pubQuery, assignedPromise, driverFinancePromise]);
  if (pubRes.error) console.error('Error cargando lista de pedidos repartidor (públicos):', pubRes.error);
  if (assignedRes.error) console.error('Error cargando pedidos asignados repartidor:', assignedRes.error);

  const financeRow = finRes?.data || {};
  const driverFinances = {
    estado_servicio: financeRow.estado_servicio || userData?.estado_servicio || 'activo',
    bloqueado: Boolean(financeRow.bloqueado || userData?.bloqueado),
    motivo_bloqueo: financeRow.motivo_bloqueo || userData?.motivo_bloqueo || ''
  };
  // Solo sankciones administrativas suspenden: no hay suspension por mora ni por pago.
  driverFinances.isSuspended = Boolean(
    driverFinances.bloqueado ||
    driverFinances.estado_servicio === 'suspendido' ||
    driverFinances.estado_servicio === 'baneado'
  );

  if (typeof AppState !== 'undefined') {
    const curU = AppState.get('userData') || {};
    AppState.set('userData', { ...curU, ...financeRow });
  }

  const barColor = driverFinances.isSuspended ? '#EF4444' : '#10B981';

  let financialWidgetHtml = `
    <div class="driver-financial-card" style="background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%);border:1.5px solid ${driverFinances.isSuspended ? '#EF4444' : '#334155'};border-radius:10px;padding:10px 12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
        <span style="font-size:16px;font-weight:800;color:#E2E8F0;">🇧🇴 Acceso gratuito</span>
        <span style="font-size:16px;font-weight:900;color:${barColor};">${driverFinances.isSuspended ? 'Suspendido' : 'Sin cobros'}</span>
      </div>
      <div style="background:#0F172A;border-radius:6px;height:8px;width:100%;overflow:hidden;border:1px solid #334155;"><div style="background:${barColor};height:100%;width:100%;"></div></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:16px;color:#94A3B8;">
        <span>Comisión por pedido: Bs 0,00</span>
        <span>NOTIGAS no procesa fondos</span>
      </div>
    </div>`;

  if (driverFinances.isSuspended) {
    const motivo = driverFinances.motivo_bloqueo || 'Cuenta suspendida por una sanción administrativa.';
    financialWidgetHtml += `<div class="driver-lockout-banner" style="background:rgba(239,68,68,.15);border:2px solid #EF4444;border-radius:10px;padding:12px;margin-bottom:12px;color:#FECACA;"><strong>⛔ CUENTA SUSPENDIDA</strong><div style="margin-top:5px;font-size:16px;line-height:1.45;">${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(motivo) : motivo}</div></div>`;
  }

  const pubOrders = pubRes.data || [];
  const assignedOrders = assignedRes.data || [];

  // Todos los repartidores habilitados reciben los pedidos en tiempo real, sin ventajas artificiales.
  const visiblePubOrders = pubOrders.filter(o =>
    (typeof window.isOrderCategoryMatchingDriver !== 'function') ||
    window.isOrderCategoryMatchingDriver(o.categoria, driverCategoria)
  );
  const allOrders = [...assignedOrders, ...visiblePubOrders];

  // Filtrar asignados a este chofer o públicos válidos
  const orders = allOrders.filter(o => {
    if (o.estado === 'asignado') {
      return o.driver_id && String(o.driver_id) === String(localUserId);
    }
    return true;
  });

  const planBannerHtml = `
    <div class="driver-plan-banner" style="background:linear-gradient(135deg,rgba(16,185,129,.14),#0F172A);border:1.5px solid #10B981;border-radius:10px;padding:10px 12px;margin-bottom:12px;color:#D1FAE5;font-size:16px;line-height:1.45;">
      <strong style="color:#FFFFFF;">🇧🇴 Bolivia · Acceso gratuito sin comisión</strong> · NOTIGAS no cobra por pedido ni por generar o escanear un QR local. El pago se acuerda directo con el comprador en bolivianos.
    </div>`;

  if (!orders || orders.length === 0) {
    if (pubRes.error || assignedRes.error) {
      const errDetail = pubRes.error?.message || assignedRes.error?.message || 'Error de conexión o permisos';
      const safeErr = typeof escapeHtmlStr === 'function' ? escapeHtmlStr(errDetail) : errDetail;
      container.innerHTML = financialWidgetHtml + `
        <div style="padding:22px; text-align:center; color:#F87171; font-size:16px; background:rgba(239, 68, 68, 0.08); border-radius:8px; border:1px solid rgba(239, 68, 68, 0.25);">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom:8px; display:block; color:#EF4444;"></i>
          <strong style="display:block; margin-bottom:4px; font-size:16px;">Error cargando pedidos</strong>
          <span style="font-size:16px; color:#FECACA; word-break:break-word;">${safeErr}</span>
        </div>`;
      return;
    }

    const vipLockedNotice = '';

    container.innerHTML = financialWidgetHtml + planBannerHtml + `
      <div style="padding:25px; text-align:center; color:#94A3B8; font-size:16px;">
        <i class="fa-solid fa-clipboard-check" style="font-size:24px; margin-bottom:8px; display:block;"></i>
        No hay pedidos pendientes disponibles en este momento para tu categoría en esta ciudad.
        ${vipLockedNotice}
      </div>`;
    return;
  }

  // Agrupar pedidos por categoría y zona
  const groups = {};
  orders.forEach(o => {
    const cat = o.categoria || 'plastico';
    const zone = (o.barrio_otb || 'Sin Zona').trim();
    const groupKey = `${cat}|${zone}`;
    if (!groups[groupKey]) {
      groups[groupKey] = { cat: cat, zone: zone, items: [] };
    }
    groups[groupKey].items.push(o);
  });

  let html = financialWidgetHtml + planBannerHtml;

  // Pedidos asignados a este chofer
  const myAssigned = orders.filter(o => o.estado === 'asignado' && o.driver_id === localUserId);
  if (myAssigned.length > 0) {
    html += '<div class="demand-section-title" style="color:#10B981; margin-bottom:8px;"><i class="fa-solid fa-truck-fast"></i> Mis Pedidos en Camino</div>';
    if (myAssigned.length > 1) {
      html += `
        <button type="button" class="btn-action" style="width:100%; margin-bottom:12px; background:linear-gradient(135deg, #10B981, #059669); color:white; border:1.5px solid #6EE7B7; padding:10px; border-radius:10px; font-size:15px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px; box-shadow:0 4px 15px rgba(16,185,129,0.35);" data-action="trazarRutaMultiParada">
          <i class="fa-solid fa-signs-post"></i> TRAZAR CIRCUITO COMPLETO (${myAssigned.length} RECOGIDAS)
        </button>
      `;
    }
    myAssigned.forEach(o => {
      const antiguedad = formatearAntiguedadPedido(o.created_at);
      const street = o.direccion ? escapeHtmlStr(o.direccion) : (o.barrio_otb ? escapeHtmlStr(o.barrio_otb) : 'Ubicación GPS en Mapa');
      const lat = o.latitude || 0;
      const lng = o.longitude || 0;
      const tel = o.telefono ? escapeHtmlStr(o.telefono) : '';
      const desc = o.descripcion ? escapeHtmlStr(o.descripcion) : '';
      const subestadoBadge = o.subestado === 'en_puerta'
        ? '<span style="font-size:16px; background:#D97706; color:white; padding:2px 6px; border-radius:4px; font-weight:800; margin-left:4px;">🚪 EN PUERTA</span>'
        : (o.subestado === 'en_camino'
            ? '<span style="font-size:16px; background:#0284C7; color:white; padding:2px 6px; border-radius:4px; font-weight:800; margin-left:4px;">🚚 EN CAMINO</span>'
            : '');

      html += `
        <div class="assigned-order-card" style="margin-bottom:10px; border-left:4px solid #10B981; background:rgba(16,185,129,0.06); padding:10px; border-radius:8px; border:1px solid rgba(16,185,129,0.2);">
          <div class="demand-card-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                <span style="font-size:16px; background:#10B981; color:white; padding:2px 6px; border-radius:4px; font-weight:800;">EN ENTREGA</span>
                ${subestadoBadge}
              </div>
              <div style="font-size:16px; font-weight:800; color:#F8FAFC; margin-top:2px;">${escapeHtmlStr(o.categoria || 'Pedido')} (${escapeHtmlStr(o.cantidad || '1 un')})</div>
            </div>
            <div style="font-size:16px; color:#94A3B8;">${antiguedad}</div>
          </div>
          <div class="demand-card-meta" style="margin-top:6px; font-size:16px;">
            <div style="color:#CBD5E1;">📍 <strong>Dirección:</strong> ${street}</div>
            ${tel ? `<div style="margin-top:3px;">📞 <strong>Teléfono:</strong> <a href="tel:${tel}" style="color:#38BDF8; font-weight:700; text-decoration:underline;">${tel}</a></div>` : '<div style="color:#64748B; font-size:16px; margin-top:2px;">📞 Teléfono: No indicado</div>'}
            ${desc ? `<div style="margin-top:3px; font-size:16px; color:#94A3B8; font-style:italic;">📝 ${desc}</div>` : ''}
          </div>

          <div class="driver-quick-actions-container" style="margin-top:8px;">
            <div class="driver-quick-actions-title">⚡ Estado con Cliente:</div>
            <div class="driver-quick-actions-grid">
              <button type="button" class="btn-quick-action btn-quick-camino ${o.subestado === 'en_camino' ? 'active' : ''}" 
                data-action="cambiarEstadoRapidoPedido" data-id="${o.id}" data-status="en_camino" title="Avisar al cliente que vas en camino">
                <i class="fa-solid fa-truck-fast"></i> En camino
              </button>
              <button type="button" class="btn-quick-action btn-quick-puerta ${o.subestado === 'en_puerta' ? 'active' : ''}" 
                data-action="cambiarEstadoRapidoPedido" data-id="${o.id}" data-status="en_puerta" title="Avisar al cliente que estás en la puerta">
                <i class="fa-solid fa-bell"></i> En puerta
              </button>
              ${tel ? `
              <button type="button" class="btn-quick-action btn-quick-whatsapp" 
                data-action="abrirWhatsappDirecto" data-tel="${tel}" data-address="${street}" data-categoria="${escapeHtmlStr(o.categoria || 'plastico')}" title="Chat directo por WhatsApp">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp
              </button>
              ` : ''}
              <button type="button" class="btn-quick-action btn-quick-cancel" 
                data-action="liberarPedidoRepartidor" data-id="${o.id}" title="Liberar pedido para que otro repartidor lo tome">
                <i class="fa-solid fa-arrow-rotate-left"></i> No podré
              </button>
            </div>
          </div>

          <div class="demand-card-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn-action" style="background:#0284C7; color:white; padding:6px 10px; border-radius:6px; font-size:15px; font-weight:700; border:none; cursor:pointer; flex:1; min-width:120px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" data-action="trazarRutaEnMapa" data-lat="${lat}" data-lng="${lng}" data-id="${o.id}" data-address="${escapeHtmlStr(street)}" data-categoria="${escapeHtmlStr(o.categoria || '')}" data-cantidad="${escapeHtmlStr(o.cantidad || '')}" data-tel="${escapeHtmlStr(tel)}" title="Ver en el mapa de NOTIGAS">
              <i class="fa-solid fa-route"></i> VER EN MAPA
            </button>
            <button type="button" class="btn-action" style="background:#1E293B; color:#38BDF8; border:1px solid #38BDF8; padding:6px 9px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:4px;" data-action="abrirRutaGoogleMaps" data-lat="${lat}" data-lng="${lng}" data-address="${escapeHtmlStr(street)}" title="Navegar con Google Maps externo (opcional)">
              <i class="fa-solid fa-diamond-turn-right"></i> Maps
            </button>
            <button type="button" class="btn-action" style="background:#10B981; color:white; padding:6px 10px; border-radius:6px; font-size:15px; font-weight:700; border:none; cursor:pointer; flex:1; min-width:105px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" data-action="confirmarEntregaPedido" data-id="${o.id}">
              <i class="fa-solid fa-circle-check"></i> Entregado
            </button>
            <button type="button" class="btn-action" style="background:rgba(239,68,68,0.2); color:#FCA5A5; border:1px solid #EF4444; padding:6px 10px; border-radius:6px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:4px;" data-action="denunciarPedidoFalso" data-id="${o.id}" data-buyer="${encodeURIComponent(o.cliente_nombre || o.nombre || 'Comprador')}" data-tel="${encodeURIComponent(tel || '')}" title="Denunciar que este pedido es falso o fraude">
              <i class="fa-solid fa-triangle-exclamation"></i> Falso
            </button>
          </div>
        </div>
      `;
    });
  }

  // Grupos de demanda disponibles
  html += '<div class="demand-section-title" style="margin-top:12px; margin-bottom:8px;"><i class="fa-solid fa-layer-group"></i> Demanda Vecinal Acumulada</div>';
  Object.values(groups).forEach(g => {
    const list = g.items.filter(o => (o.estado === 'pendiente' || o.estado === 'visto') && (!o.driver_id || o.driver_id === null));
    if (list.length === 0) return;

    const totalBalones = list.reduce((acc, cur) => acc + (parseInt(cur.cantidad, 10) || 1), 0);
    const newestTime = list[0].created_at;
    const antiguedad = formatearAntiguedadPedido(newestTime);

    html += `
      <div class="demand-group-card" style="margin-bottom:10px;">
        <div class="demand-card-header">
          <div>
            <div style="font-size:16px; font-weight:800; color:#F8FAFC;">${escapeHtmlStr(g.cat)} <span style="font-size:16px; color:#38BDF8; font-weight:700;">- ${escapeHtmlStr(g.zone)}</span></div>
            <div style="font-size:16px; color:#94A3B8;">${list.length} ${list.length === 1 ? 'vecino esperando' : 'vecinos esperando'}</div>
          </div>
          <div class="demand-card-count">${totalBalones} <span style="font-size:16px; color:#94A3B8;">pedidos</span></div>
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
              <div style="padding:8px 0; border-bottom:1px dashed rgba(255,255,255,0.08); font-size:16px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                  <div style="flex:1; min-width:0;">
                    <div style="font-size:16px; font-weight:800; color:#F8FAFC; margin-bottom:2px;">
                      📦 ${escapeHtmlStr(o.categoria || g.cat)} <span style="color:#FF6D00;">(${escapeHtmlStr(o.cantidad || '1 un')})</span>
                    </div>
                    <div style="color:#CBD5E1; font-size:16px; margin-top:2px;">
                      📍 <strong>Dirección:</strong> ${st}
                    </div>
                    ${tel ? `
                      <div style="margin-top:3px; font-size:16px; color:#38BDF8;">
                        📞 <strong>Teléfono:</strong> <a href="tel:${tel}" style="color:#38BDF8; font-weight:700; text-decoration:underline;">${tel}</a>
                      </div>
                    ` : ''}
                    ${desc ? `
                      <div style="margin-top:3px; font-size:16px; color:#94A3B8; font-style:italic;">
                        📝 ${desc}
                      </div>
                    ` : ''}
                  </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                  <button type="button" style="background:#0284C7; color:#F8FAFC; border:none; padding:5px 9px; border-radius:6px; font-size:16px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;" data-action="centrarPedidoEnMapa" data-lat="${lat}" data-lng="${lng}" data-order-id="${o.id}" title="Ver en el mapa">
                    <i class="fa-solid fa-map-location-dot"></i> VER EN EL MAPA
                  </button>
                  ${driverFinances.isSuspended ? `
                    <button type="button" style="background:#475569; color:#94A3B8; border:none; padding:5px 12px; border-radius:6px; font-size:16px; font-weight:800; cursor:not-allowed; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;" onclick="alert('⛔ Cuenta bloqueada por una sanción administrativa. Contacta a soporte de NOTIGAS para conocer el motivo.');" title="Cuenta bloqueada por sanción administrativa">
                      <i class="fa-solid fa-ban"></i> Bloqueado
                    </button>
                  ` : `
                    <button type="button" style="background:#FF6D00; color:white; border:none; padding:5px 12px; border-radius:6px; font-size:16px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;" data-action="aceptarPedidoRepartidor" data-id="${o.id}" data-lat="${lat}" data-lng="${lng}" data-address="${escapeHtmlStr(o.direccion || '')}">
                      <i class="fa-solid fa-truck"></i> Tomar
                    </button>
                  `}
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

  // Suspender solo por sanción administrativa: NOTIGAS no aplica límites de crédito ni saldo.
  const curUser = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  if (curUser && (curUser.estado_servicio === 'suspendido_tope' || curUser.bloqueado)) {
    const mensaje = 'Tu cuenta está suspendida por una sanción administrativa. NOTIGAS no cobra comisiones ni aplica bloqueos por monto pendiente.';
    if (typeof showToast === 'function') {
      showToast('⛔ Cuenta suspendida', mensaje, 'error', 7000);
    } else {
      alert('⛔ Cuenta suspendida: ' + mensaje);
    }
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
      if (typeof showToast === 'function') {
        showToast('Pedido no disponible', error.message || 'Otro repartidor pudo tomarlo antes.', 'error', 4000);
      } else {
        alert('❌ ' + (error.message || 'No se pudo asignar el pedido.'));
      }
      return;
    }

    if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
    if (typeof showToast === 'function') {
      showToast('✅ Pedido Tomado', 'Mostrando punto de recojo en tu mapa.', 'success');
    }
    if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
    if (typeof window.trazarRutaEnMapa === 'function') {
      window.trazarRutaEnMapa(lat, lng, orderId, address || '');
    }
  });
};

/* ==========================================================================
   SISTEMA DE RUTAS Y NAVEGACIÓN INTERNA EN MAPA
   Permite al repartidor ver su camión y hacia dónde debe ir directamente
   dentro de NOTIGAS (Leaflet). Ofrece un botón opcional para abrir en
   Google Maps externo si el chofer requiere navegación giro a giro.
   ========================================================================== */

window.activeDriverRoute = null;
window.activeDriverRoutePolyline = null;
window.activeDriverRouteGlow = null;

function limpiarCapasRuta(mapInstance) {
  const m = mapInstance || (typeof map !== 'undefined' ? map : window.map);
  if (!m) return;
  if (window.activeDriverRoutePolyline && typeof m.removeLayer === 'function' && m.hasLayer(window.activeDriverRoutePolyline)) {
    m.removeLayer(window.activeDriverRoutePolyline);
  }
  window.activeDriverRoutePolyline = null;
  if (window.activeDriverRouteGlow && typeof m.removeLayer === 'function' && m.hasLayer(window.activeDriverRouteGlow)) {
    m.removeLayer(window.activeDriverRouteGlow);
  }
  window.activeDriverRouteGlow = null;
}

function limpiarRutaEnMapa() {
  limpiarCapasRuta();
  window.activeDriverRoute = null;
  const hud = document.getElementById('driverRouteHud');
  if (hud) hud.style.display = 'none';
}
window.limpiarRutaEnMapa = limpiarRutaEnMapa;

function mostrarHudRuta(info) {
  const hud = document.getElementById('driverRouteHud');
  if (!hud) return;

  const badge = document.getElementById('driverRouteHudBadge');
  const mat = document.getElementById('driverRouteHudMaterial');
  const dist = document.getElementById('driverRouteHudDist');
  const addr = document.getElementById('driverRouteHudAddress');
  const btnWa = document.getElementById('btnHudWhatsapp');
  const btnPuerta = document.getElementById('btnHudEnPuerta');
  const btnGmaps = document.getElementById('btnHudGoogleMaps');

  if (badge) badge.textContent = info.title || 'EN RUTA';
  if (mat) mat.textContent = info.material || '♻️ Recogida de Material';
  if (addr) addr.textContent = info.address ? `📍 ${info.address}` : '📍 Ubicación GPS';

  if (dist) {
    if (Number.isFinite(info.distMetros)) {
      const d = info.distMetros;
      dist.innerHTML = `<i class="fa-solid fa-location-arrow"></i> Distancia: <strong>${d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`}</strong>`;
    } else {
      dist.innerHTML = '<i class="fa-solid fa-location-arrow"></i> Activa tu ubicación para medir distancia';
    }
  }

  if (btnWa) {
    if (info.telefono) {
      btnWa.style.display = 'inline-flex';
      btnWa.setAttribute('data-tel', info.telefono);
      btnWa.setAttribute('data-address', info.address || '');
      btnWa.setAttribute('data-categoria', info.categoria || '');
    } else {
      btnWa.style.display = 'none';
    }
  }

  if (btnPuerta && info.orderId) {
    btnPuerta.setAttribute('data-id', info.orderId);
  }

  if (btnGmaps) {
    btnGmaps.setAttribute('data-lat', String(info.destLat || ''));
    btnGmaps.setAttribute('data-lng', String(info.destLng || ''));
    btnGmaps.setAttribute('data-address', info.address || '');
    if (!info.isMulti) {
      btnGmaps.removeAttribute('data-multi');
      btnGmaps.removeAttribute('data-waypoints');
    }
  }

  hud.style.display = 'block';
}

function trazarRutaEnMapa(lat, lng, orderId, address, categoria, cantidad, telefono) {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  const modalPan = document.getElementById('modalPanoramicaPedidos');
  if (modalPan) modalPan.style.display = 'none';

  if (typeof switchTab === 'function') switchTab(0);

  const mapInstance = (typeof map !== 'undefined' && map) || window.map || null;
  if (!mapInstance) {
    if (typeof showToast === 'function') showToast('Mapa no disponible', 'Espera a que cargue el mapa.', 'warning');
    return;
  }

  const destLat = Number(lat);
  const destLng = Number(lng);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || destLat === 0 || destLng === 0) {
    if (typeof showToast === 'function') showToast('Ubicación No Disponible', 'El pedido no cuenta con coordenadas válidas.', 'warning', 3500);
    return;
  }

  limpiarCapasRuta(mapInstance);

  let driverLat = (typeof window.currentGpsLat === 'number' && Number.isFinite(window.currentGpsLat))
    ? window.currentGpsLat
    : null;
  let driverLng = (typeof window.currentGpsLng === 'number' && Number.isFinite(window.currentGpsLng))
    ? window.currentGpsLng
    : null;

  if ((driverLat === null || driverLng === null) && window.userMarker && typeof window.userMarker.getLatLng === 'function') {
    const pos = window.userMarker.getLatLng();
    if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
      driverLat = pos.lat;
      driverLng = pos.lng;
    }
  }

  let distMetros = null;
  const tieneGpsChofer = Number.isFinite(driverLat) && Number.isFinite(driverLng) && (driverLat !== 0 || driverLng !== 0);

  if (tieneGpsChofer) {
    if (typeof window.calcularDistanciaMetros === 'function') {
      distMetros = window.calcularDistanciaMetros(driverLat, driverLng, destLat, destLng);
    }

    if (window.L && typeof window.L.polyline === 'function') {
      window.activeDriverRouteGlow = window.L.polyline([[driverLat, driverLng], [destLat, destLng]], {
        color: '#38BDF8',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      });
      if (typeof window.activeDriverRouteGlow.addTo === 'function') window.activeDriverRouteGlow.addTo(mapInstance);

      window.activeDriverRoutePolyline = window.L.polyline([[driverLat, driverLng], [destLat, destLng]], {
        color: '#10B981',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });
      if (typeof window.activeDriverRoutePolyline.addTo === 'function') window.activeDriverRoutePolyline.addTo(mapInstance);
    }

    if (typeof mapInstance.fitBounds === 'function') {
      try {
        mapInstance.fitBounds([[driverLat, driverLng], [destLat, destLng]], {
          padding: [80, 80],
          maxZoom: 16,
          animate: true
        });
      } catch (_) {
        if (typeof mapInstance.flyTo === 'function') mapInstance.flyTo([destLat, destLng], 15);
      }
    } else if (typeof mapInstance.flyTo === 'function') {
      mapInstance.flyTo([destLat, destLng], 15);
    }
  } else {
    if (typeof mapInstance.flyTo === 'function') {
      mapInstance.flyTo([destLat, destLng], 16, { duration: 1.2 });
    }
    if (typeof showToast === 'function') {
      showToast('📍 Punto de Recojo', 'Centrando en el destino. Activa tu GPS para ver tu camión en vivo.', 'info', 4000);
    }
  }

  setTimeout(() => {
    if (orderId && window.neighborOrderMarkers && window.neighborOrderMarkers[orderId]) {
      try { window.neighborOrderMarkers[orderId].openPopup(); } catch (_) {}
    }
  }, 800);

  window.activeDriverRoute = {
    orderId,
    lat: destLat,
    lng: destLng,
    address: address || '',
    categoria: categoria || 'Material',
    cantidad: cantidad || '',
    telefono: telefono || '',
    multi: false
  };

  mostrarHudRuta({
    title: 'EN RUTA DE RECOLECCIÓN',
    material: `${categoria ? ('♻️ ' + categoria) : '♻️ Recogida de Material'}${cantidad ? ` (${cantidad})` : ''}`,
    address: address || 'Ubicación fijada en mapa GPS',
    distMetros,
    telefono: telefono || '',
    categoria: categoria || '',
    orderId,
    destLat,
    destLng
  });
}
window.trazarRutaEnMapa = trazarRutaEnMapa;

function trazarRutaMultiParada() {
  if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
  if (typeof switchTab === 'function') switchTab(0);

  const mapInstance = (typeof map !== 'undefined' && map) || window.map || null;
  if (!mapInstance) return;

  const rawOrders = (typeof AppState !== 'undefined') ? AppState.get('neighborOrders') : [];
  let localUserId = null;
  try {
    localUserId = (typeof getAuthenticatedUserId === 'function')
      ? (window.currentAuthUserId || AppState.get('userData')?.id)
      : null;
  } catch (_) {}

  const myAssigned = (Array.isArray(rawOrders) ? rawOrders : []).filter(o =>
    o && o.estado === 'asignado' && (!localUserId || o.driver_id === localUserId) &&
    Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude))
  );

  if (!myAssigned.length) {
    if (typeof showToast === 'function') showToast('Sin pedidos en camino', 'No tienes pedidos asignados actualmente.', 'info');
    return;
  }

  limpiarCapasRuta(mapInstance);

  let curLat = (typeof window.currentGpsLat === 'number' && Number.isFinite(window.currentGpsLat))
    ? window.currentGpsLat
    : (window.userMarker?.getLatLng?.()?.lat ?? null);
  let curLng = (typeof window.currentGpsLng === 'number' && Number.isFinite(window.currentGpsLng))
    ? window.currentGpsLng
    : (window.userMarker?.getLatLng?.()?.lng ?? null);

  const tieneChofer = Number.isFinite(curLat) && Number.isFinite(curLng) && (curLat !== 0 || curLng !== 0);

  let remaining = [...myAssigned];
  const orderedStops = [];
  let pLat = tieneChofer ? curLat : Number(remaining[0].latitude);
  let pLng = tieneChofer ? curLng : Number(remaining[0].longitude);

  let totalDist = 0;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const o = remaining[i];
      const d = (typeof window.calcularDistanciaMetros === 'function')
        ? window.calcularDistanciaMetros(pLat, pLng, Number(o.latitude), Number(o.longitude))
        : Math.hypot(Number(o.latitude) - pLat, Number(o.longitude) - pLng);
      if (d !== null && d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }
    const nextStop = remaining.splice(nearestIdx, 1)[0];
    orderedStops.push(nextStop);
    totalDist += (minDist !== Infinity ? minDist : 0);
    pLat = Number(nextStop.latitude);
    pLng = Number(nextStop.longitude);
  }

  const polyPoints = [];
  if (tieneChofer) polyPoints.push([curLat, curLng]);
  orderedStops.forEach(s => polyPoints.push([Number(s.latitude), Number(s.longitude)]));

  if (window.L && typeof window.L.polyline === 'function' && polyPoints.length > 1) {
    window.activeDriverRouteGlow = window.L.polyline(polyPoints, {
      color: '#38BDF8',
      weight: 8,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    });
    if (typeof window.activeDriverRouteGlow.addTo === 'function') window.activeDriverRouteGlow.addTo(mapInstance);

    window.activeDriverRoutePolyline = window.L.polyline(polyPoints, {
      color: '#10B981',
      weight: 4,
      dashArray: '8, 8',
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    });
    if (typeof window.activeDriverRoutePolyline.addTo === 'function') window.activeDriverRoutePolyline.addTo(mapInstance);
  }

  if (typeof mapInstance.fitBounds === 'function' && polyPoints.length > 1) {
    try {
      mapInstance.fitBounds(polyPoints, { padding: [70, 70], maxZoom: 16 });
    } catch (_) {}
  }

  window.activeDriverRoute = {
    multi: true,
    stops: orderedStops,
    totalDist
  };

  const primeraParada = orderedStops[0];
  const gmapsWaypoints = orderedStops.map(s => `${s.latitude},${s.longitude}`).join('|');

  mostrarHudRuta({
    title: `CIRCUITO: ${orderedStops.length} PARADAS`,
    material: `1ª Parada: ${primeraParada.categoria || 'Recogida'} (${primeraParada.cantidad || '1 un'})`,
    address: `${orderedStops.length} paradas organizadas en orden de cercanía`,
    distMetros: totalDist,
    telefono: primeraParada.telefono || '',
    categoria: primeraParada.categoria || '',
    orderId: primeraParada.id,
    destLat: primeraParada.latitude,
    destLng: primeraParada.longitude,
    isMulti: true
  });

  const btnGmaps = document.getElementById('btnHudGoogleMaps');
  if (btnGmaps) {
    btnGmaps.setAttribute('data-multi', '1');
    btnGmaps.setAttribute('data-waypoints', gmapsWaypoints);
  }

  if (typeof showToast === 'function') {
    const kmText = totalDist < 1000 ? `${totalDist} m` : `${(totalDist / 1000).toFixed(1)} km`;
    showToast('🧭 Circuito Organizado', `${orderedStops.length} paradas trazadas en orden óptimo (~${kmText} totales).`, 'success', 4500);
  }
}
window.trazarRutaMultiParada = trazarRutaMultiParada;

function actualizarRutaActivaConGps(lat, lng) {
  if (!window.activeDriverRoute) return;
  const mapInstance = (typeof map !== 'undefined' && map) || window.map || null;
  if (!mapInstance) return;

  const truckLat = Number(lat);
  const truckLng = Number(lng);
  if (!Number.isFinite(truckLat) || !Number.isFinite(truckLng)) return;

  if (window.activeDriverRoute.multi) {
    const stops = window.activeDriverRoute.stops || [];
    if (stops.length && window.activeDriverRoutePolyline && typeof window.activeDriverRoutePolyline.setLatLngs === 'function') {
      const polyPoints = [[truckLat, truckLng], ...stops.map(s => [Number(s.latitude), Number(s.longitude)])];
      window.activeDriverRoutePolyline.setLatLngs(polyPoints);
      if (window.activeDriverRouteGlow && typeof window.activeDriverRouteGlow.setLatLngs === 'function') {
        window.activeDriverRouteGlow.setLatLngs(polyPoints);
      }
    }
  } else {
    const destLat = window.activeDriverRoute.lat;
    const destLng = window.activeDriverRoute.lng;
    if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
      if (window.activeDriverRoutePolyline && typeof window.activeDriverRoutePolyline.setLatLngs === 'function') {
        window.activeDriverRoutePolyline.setLatLngs([[truckLat, truckLng], [destLat, destLng]]);
        if (window.activeDriverRouteGlow && typeof window.activeDriverRouteGlow.setLatLngs === 'function') {
          window.activeDriverRouteGlow.setLatLngs([[truckLat, truckLng], [destLat, destLng]]);
        }
      }
      if (typeof window.calcularDistanciaMetros === 'function') {
        const dist = window.calcularDistanciaMetros(truckLat, truckLng, destLat, destLng);
        const distEl = document.getElementById('driverRouteHudDist');
        if (distEl && dist !== null) {
          distEl.innerHTML = `<i class="fa-solid fa-location-arrow"></i> Distancia: <strong>${dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}</strong>`;
        }
      }
    }
  }
}
window.actualizarRutaActivaConGps = actualizarRutaActivaConGps;

function abrirNavegacionExterna(lat, lng, address, waypoints) {
  let url = '';
  if (waypoints && typeof waypoints === 'string') {
    const parts = waypoints.split('|').filter(Boolean);
    if (parts.length > 1) {
      const dest = parts[parts.length - 1];
      const middle = parts.slice(0, parts.length - 1).join('|');
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(middle)}&travelmode=driving`;
    } else if (parts.length === 1) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts[0])}&travelmode=driving`;
    }
  }

  if (!url) {
    const dLat = Number(lat);
    const dLng = Number(lng);
    let destination = '';
    if (Number.isFinite(dLat) && Number.isFinite(dLng) && dLat !== 0 && dLng !== 0) {
      destination = `${dLat},${dLng}`;
    } else if (address) {
      const city = (typeof AppState !== 'undefined') ? (AppState.get('city') || '') : '';
      destination = `${address}, ${city}, Bolivia`;
    }
    if (destination) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    }
  }

  if (url) {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {
      window.location.href = url;
    }
    if (typeof showToast === 'function') {
      showToast('🚀 Google Maps', 'Abriendo navegación en Google Maps externo...', 'info', 3000);
    }
  } else {
    if (typeof showToast === 'function') showToast('Ubicación no disponible', 'No hay coordenadas para abrir Google Maps.', 'warning');
  }
}
window.abrirNavegacionExterna = abrirNavegacionExterna;

window.abrirRutaGoogleMaps = function (a, b, c, d) {
  let lat = null, lng = null, orderId = null, address = '';
  if (typeof a === 'object' && a !== null) {
    lat = Number(a.latitude ?? a.lat);
    lng = Number(a.longitude ?? a.lng);
    orderId = a.id || a.order_id || null;
    address = a.direccion || a.address || '';
  } else if (typeof a === 'string' && isNaN(Number(a)) && (a.includes('-') || a.length > 15)) {
    orderId = a; lat = Number(b); lng = Number(c); address = d || '';
  } else {
    lat = Number(a); lng = Number(b); orderId = c || null; address = d || '';
  }
  if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    abrirNavegacionExterna(lat, lng, address);
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
        const res = data || {};
        const accounting = res.accounting || res;
        const isSuspended = Boolean(accounting.suspendido ?? res.suspendido ?? false);

        if (isSuspended) {
          showToast('⚠️ Cuenta suspendida', 'Pedido entregado. Tu cuenta está suspendida por una sanción administrativa.', 'warning', 8000);
        } else {
          showToast('¡Entrega confirmada! 🎉', 'Entrega registrada. Sin comisión y sin saldo pendiente: el pago se coordina directo con el comprador (QR local Simple o Banesco QR).', 'success', 5000);
        }

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

async function cambiarEstadoRapidoPedido(orderId, quickStatus) {
  if (!window.supabaseClient || !orderId) return;

  const statusLabel = quickStatus === 'en_puerta' ? 'Estoy en su puerta' : 'En camino';
  const statusIcon = quickStatus === 'en_puerta' ? '🚪' : '🚚';

  if (typeof showLoadingOverlay === 'function') {
    showLoadingOverlay(`Notificando "${statusLabel}"...`);
  }

  try {
    const { data, error } = await window.supabaseClient.rpc('rpc_driver_set_quick_status', {
      p_order_id: orderId,
      p_quick_status: quickStatus
    });

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (error) {
      console.error('Error al actualizar estado rápido:', error);
      if (typeof showToast === 'function') {
        showToast('Error', error.message || 'No se pudo actualizar el estado.', 'error', 4000);
      }
      return;
    }

    if (typeof showToast === 'function') {
      showToast(
        `${statusIcon} Notificación enviada`,
        quickStatus === 'en_puerta'
          ? 'El cliente fue notificado que estás en su puerta.'
          : 'El cliente fue notificado que vas en camino.',
        'success',
        3500
      );
    }

    if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
    if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
  } catch (e) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error('Error inesperado en cambiarEstadoRapidoPedido:', e);
    if (typeof showToast === 'function') {
      showToast('Error', 'Error de conexión al actualizar estado.', 'error', 4000);
    }
  }
}
window.cambiarEstadoRapidoPedido = cambiarEstadoRapidoPedido;

async function liberarPedidoRepartidor(orderId) {
  if (!window.supabaseClient || !orderId) return;

  const msg = '¿Seguro que no podrás entregar este pedido? Volverá a la lista disponible para que otro repartidor de la ciudad pueda atenderlo de inmediato.';
  showConfirmModal('⚠️', '¿No podrás llegar?', msg, 'Sí, liberar pedido', async () => {
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('Liberando pedido...');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_driver_release_order', {
        p_order_id: orderId,
        p_motivo: 'Repartidor canceló por imprevisto'
      });

      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

      if (error) {
        console.error('Error al liberar pedido:', error);
        if (typeof showToast === 'function') {
          showToast('Error', error.message || 'No se pudo liberar el pedido.', 'error', 4000);
        }
        return;
      }

      if (typeof showToast === 'function') {
        showToast('Pedido liberado', 'El pedido volvió a estar disponible para otros repartidores.', 'info', 4500);
      }

      if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
      if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
      if (typeof map !== 'undefined' && map && map.closePopup) {
        map.closePopup();
      }
    } catch (e) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      console.error('Error inesperado en liberarPedidoRepartidor:', e);
      if (typeof showToast === 'function') {
        showToast('Error', 'Error inesperado al liberar el pedido.', 'error', 4000);
      }
    }
  }, 'Mantener pedido');
}
window.liberarPedidoRepartidor = liberarPedidoRepartidor;

function abrirWhatsappDirecto(rawTel, direccion, categoria) {
  if (!rawTel) {
    if (typeof showToast === 'function') {
      showToast('Teléfono no disponible', 'El cliente no especificó número telefónico en este pedido.', 'warning', 3500);
    }
    return;
  }

  const catName = categoria || 'plastico';
  const dirText = direccion ? ` para la recogida en *${direccion}*` : '';
  const msg = `Hola! 👋 Te escribo desde NOTIGAS sobre tu pedido de *${catName}*${dirText}. Estoy coordinando la recogida.`;

  /* Bolivia usa +591. Antes este enlace armaba +51 (Perú), por lo que WhatsApp
     abría un número inexistente. NOTIGAS_BO normaliza 8 dígitos locales o un
     número que ya venga con el prefijo 591. */
  const boPhone = window.NOTIGAS_BO;
  let waUrl = '';
  if (boPhone && typeof boPhone.whatsappUrl === 'function') {
    waUrl = boPhone.whatsappUrl(rawTel, msg);
  } else {
    let cleanTel = String(rawTel).replace(/[^0-9]/g, '');
    if (cleanTel.startsWith('591') && cleanTel.length > 8) cleanTel = cleanTel.slice(3);
    if (cleanTel.length === 8) cleanTel = '591' + cleanTel;
    waUrl = `https://wa.me/${cleanTel}?text=${encodeURIComponent(msg)}`;
  }

  window.open(waUrl, '_blank', 'noopener,noreferrer');
}
window.abrirWhatsappDirecto = abrirWhatsappDirecto;

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

  // El código de localStorage para notigas_forum_posts ha sido removido
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

  let effectiveState = String(order.estado || 'pendiente').toLowerCase();
  if (effectiveState === 'pendiente' && order.visto === true) {
    effectiveState = 'visto';
  }
  let view = ORDER_STATUS_PRESENTATION[effectiveState] || ORDER_STATUS_PRESENTATION.pendiente;

  // Personalización cuando el repartidor emite estado rápido
  if (effectiveState === 'asignado' && order.subestado) {
    if (order.subestado === 'en_puerta') {
      view = {
        title: '¡Recolector en tu Puerta! 🚪',
        label: 'EN TU PUERTA',
        owner: 'RECOLECTOR LLEGÓ',
        info: 'El recolector ya está en la puerta de tu domicilio.',
        detail: '¡Por favor acércate a la puerta con tu material reciclable!',
        color: '#10B981',
        shadow: 'rgba(16, 185, 129, 0.45)'
      };
    } else if (order.subestado === 'en_camino') {
      view = {
        title: '¡Recolector en Camino! 🚚',
        label: 'EN CAMINO',
        owner: 'RECOLECTOR EN RUTA',
        info: 'El recolector aceptó tu solicitud y va hacia tu dirección.',
        detail: 'Mantente atento a tu timbre o teléfono celular.',
        color: '#0284C7',
        shadow: 'rgba(2, 132, 199, 0.45)'
      };
    }
  }

  tripCard.dataset.state = effectiveState;
  if (order.subestado) {
    tripCard.dataset.subestado = order.subestado;
  } else {
    delete tripCard.dataset.subestado;
  }
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
    tripBtnReceived.style.display = (effectiveState === 'asignado') ? 'flex' : 'none';
  }
  if (tripBtnCancel) {
    tripBtnCancel.style.display = (effectiveState === 'entregado' || effectiveState === 'cancelado') ? 'none' : 'flex';
  }
}

async function syncActiveOrderStatusFromDatabase(order) {
  if (!window.supabaseClient || !order?.id || _activeOrderStatusRequest) return;
  const now = Date.now();
  if (now - _activeOrderStatusCheckedAt < ACTIVE_ORDER_STATUS_REFRESH_MS) return;
  _activeOrderStatusCheckedAt = now;

  _activeOrderStatusRequest = window.supabaseClient
    .from('pedidos')
    .select('estado, driver_id, visto, subestado, updated_at')
    .eq('id', order.id)
    .maybeSingle();

  try {
    const { data, error } = await _activeOrderStatusRequest;
    if (error || !data) return;

    const changed = data.estado !== order.estado ||
      data.visto !== order.visto ||
      data.driver_id !== order.driver_id ||
      data.subestado !== order.subestado ||
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

        if (order.lat && order.lng && typeof window.setManualUserLocation === 'function') {
          window.setManualUserLocation(parseFloat(order.lat), parseFloat(order.lng));
        }

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

async function abrirSubmenuPedidos() {
  const userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const isLoggedIn = Boolean(userId || userData?.user_id || userData?.gmail);

  if (!isLoggedIn) {
    if (typeof window.abrirModalRegistroPedido === 'function') {
      window.abrirModalRegistroPedido();
    }
    return;
  }

  if (typeof window.setTipoSolicitud === 'function') {
    window.setTipoSolicitud('recogida');
  }

  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
}
window.abrirSubmenuPedidos = abrirSubmenuPedidos;

function closeSubmenuModal() {
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'none';
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

function leerMaterialesUsuario() {
  const cbs = Array.from(document.querySelectorAll('input[name="userMaterial"]:checked'));
  return cbs.map(cb => (cb.value || '').trim()).filter(Boolean);
}

function serializarMaterialesUsuario(materiales) {
  return (materiales || []).filter(Boolean).join(', ');
}

function aplicarMaterialesEnPedidoUsuario(categoria) {
  const marcados = new Set(String(categoria || '')
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean));
  document.querySelectorAll('input[name="userMaterial"]').forEach(cb => {
    cb.checked = marcados.has((cb.value || '').trim().toLowerCase());
  });
  sincronizarMaterialesUsuarioEnSelect();
  if (typeof sincronizarGrupoOtros === 'function') sincronizarGrupoOtros();
}

function sincronizarMaterialesUsuarioEnSelect() {
  const mats = leerMaterialesUsuario();
  const sel = document.getElementById('selectCategoria');
  if (sel && mats.length) {
    sel.value = mats[0];
  }
}

window.leerMaterialesUsuario = leerMaterialesUsuario;
window.serializarMaterialesUsuario = serializarMaterialesUsuario;
window.aplicarMaterialesEnPedidoUsuario = aplicarMaterialesEnPedidoUsuario;
window.sincronizarMaterialesUsuarioEnSelect = sincronizarMaterialesUsuarioEnSelect;

async function seleccionarYPedirDirecto(catNombre) {
  if (typeof window.verificarPermisoOperarEnCiudad === 'function' && !window.verificarPermisoOperarEnCiudad('crear un pedido')) {
    return;
  }
  const userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const isLoggedIn = Boolean(userId || userData?.user_id || userData?.gmail);

  if (!isLoggedIn) {
    closeSubmenuModal();
    if (typeof window.abrirModalRegistroPedido === 'function') {
      window.abrirModalRegistroPedido();
    }
    return;
  }

  closeSubmenuModal();

  // El modo se deduce de la categoria: el reciclaje es "recogida" y el
  // resto "compra". Antes de fijar la categoria hay que haber puesto el modo,
  // porque setTipoSolicitud repuebla el <select>.
  const boCat = (window.NOTIGAS_BO && typeof window.NOTIGAS_BO.categoriaPorCodigo === 'function')
    ? window.NOTIGAS_BO.categoriaPorCodigo(catNombre) : null;
  if (boCat) {
    window.setTipoSolicitud(boCat.tipo_solicitud);
  }

  if (boCat && boCat.tipo_solicitud === 'recogida') {
    aplicarMaterialesEnPedidoUsuario(catNombre);
  }

  const sel = document.getElementById('selectCategoria');
  if (sel && catNombre) {
    // Coincidencia exacta por codigo; la busqueda difusa se mantiene como
    // respaldo para las categorias heredadas.
    let foundIdx = -1;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === catNombre) { foundIdx = i; break; }
    }

    if (foundIdx === -1) {
      const cleanSearch = catNombre.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      for (let i = 0; i < sel.options.length; i++) {
        const cleanVal = sel.options[i].value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanVal && (cleanVal.includes(cleanSearch) || cleanSearch.includes(cleanVal))) {
          foundIdx = i;
          break;
        }
      }
    }

    if (foundIdx !== -1) {
      sel.selectedIndex = foundIdx;
      sel.dispatchEvent(new Event('change'));
    }
  }

  // Auto-completar teléfono registrado del cliente en Bolivia
  const inputTel = document.getElementById('inputTelefonoComprador');
  if (inputTel && !inputTel.value) {
    const curPhone = (typeof AppState !== 'undefined') ? (AppState.get('userData')?.telefono || '') : '';
    if (curPhone) inputTel.value = curPhone;
  }

  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
}
window.seleccionarYPedirDirecto = seleccionarYPedirDirecto;

/* El submenu de "PEDIR RECOJO DE RECICLABLES" deja Forzar una sola categoria por
   pedido: sus tarjetas eran un atajo a seleccionarYPedirDirecto(codigo). Ahora el
   usuario marca varios materiales y este los traslada al formulario de pedido,
   que ya sabe serializarlos en una sola categoria ("plastico, papel"). */
async function abrirPedidoRecogidaMultiple() {
  if (typeof window.verificarPermisoOperarEnCiudad === 'function' && !window.verificarPermisoOperarEnCiudad('crear un pedido')) {
    return;
  }

  const userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const isLoggedIn = Boolean(userId || userData?.user_id || userData?.gmail);

  if (!isLoggedIn) {
    closeSubmenuModal();
    if (typeof window.abrirModalRegistroPedido === 'function') {
      window.abrirModalRegistroPedido();
    }
    return;
  }

  const marcados = Array.from(document.querySelectorAll('input[name="submenuMaterial"]:checked'))
    .map(cb => (cb.value || '').trim())
    .filter(Boolean);

  if (marcados.length === 0) {
    if (typeof showToast === 'function') {
      showToast('♻️ Marca al menos un material', 'Selecciona los tipos de material reciclable que tienes disponibles.', 'warning', 3500);
    } else {
      alert('Selecciona al menos un tipo de material que tienes disponible.');
    }
    return;
  }

  closeSubmenuModal();
  window.setTipoSolicitud('recogida');
  aplicarMaterialesEnPedidoUsuario(marcados.join(', '));

  const inputTel = document.getElementById('inputTelefonoComprador');
  if (inputTel && !inputTel.value) {
    const curPhone = (typeof AppState !== 'undefined') ? (AppState.get('userData')?.telefono || '') : '';
    if (curPhone) inputTel.value = curPhone;
  }

  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
}
window.abrirPedidoRecogidaMultiple = abrirPedidoRecogidaMultiple;

function closePedidoModal() {
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'none';
}

/* Tipo de solicitud activa.
   'recogida' -> la casa publica el material que tiene y el repartidor va a
                 buscarlo. Es el foco del producto.
   'compra'   -> el comprador pide que le lleven el producto.
   El servidor lo re-deriva desde la categoria, asi que este estado solo
   gobierna que categorias se ofrecen y que textos se muestran. */
let tipoSolicitudActual = 'recogida';

function categoriasDisponibles(tipo) {
  const bo = window.NOTIGAS_BO;
  if (bo && typeof bo.categoriasPorTipo === 'function') return bo.categoriasPorTipo(tipo);
  return [];
}

function setTipoSolicitud(tipo) {
  // Todas las categorias vigentes son de recogida: la recarga de detergentes
  // se retiro, asi que el flujo de compra ya no tiene opciones. Si llega un
  // tipo 'compra' (por un registro legacy) se fuerza recogida para no mostrar
  // un formulario vacio.
  const hayCompra = categoriasDisponibles('compra').length > 0;
  tipo = (tipo === 'compra' && hayCompra) ? 'compra' : 'recogida';
  tipoSolicitudActual = tipo;
  const esRecogida = (tipo === 'recogida');

  document.querySelectorAll('#tipoSolicitudToggle button[data-tipo]').forEach((b) => {
    const on = (b.dataset.tipo === tipo);
    b.style.borderColor = on ? (esRecogida ? '#22C55E' : '#0288D1') : '#1E293B';
    b.style.background  = on ? (esRecogida ? 'rgba(34,197,94,0.18)' : 'rgba(2,136,209,0.20)') : 'rgba(30,41,59,0.6)';
    b.style.color       = on ? (esRecogida ? '#BBF7D0' : '#BAE6FD') : '#94A3B8';
  });

  // Ya no quedan categorias de compra: la recarga de detergentes se retiro.
  // El boton de compra desaparecio del HTML y, si un cliente viejo lo trae, se
  // oculta. El boton de recogida queda siempre visible. Se usa querySelector
  // (no querySelectorAll) porque el sandbox de check_runtime.js devuelve null
  // de forma segura.
  const btnTipoCompra = document.querySelector('#tipoSolicitudToggle button[data-tipo="compra"]');
  if (btnTipoCompra) btnTipoCompra.style.display = (tipo === 'compra') ? 'flex' : 'none';
  const btnTipoRecogida = document.querySelector('#tipoSolicitudToggle button[data-tipo="recogida"]');
  if (btnTipoRecogida) btnTipoRecogida.style.display = (tipo === 'recogida') ? 'flex' : 'none';

  // El catalogo del servidor es la fuente de verdad. Sin NOTIGAS_BO se
  // respeta la lista estatica del HTML.
  const sel = document.getElementById('selectCategoria');
  const lista = categoriasDisponibles(tipo);
  if (sel && lista.length) {
    const previo = sel.value;
    sel.innerHTML = lista
      .map((c) => '<option value="' + c.codigo + '">' + c.etiqueta + '</option>')
      .join('');
    // "otros" no es una categoria: es la peticion libre que alimenta la
    // estadistica de demanda. Como no esta en el catalogo, hay que reañadirla
    // cada vez que se repuebla el select, y solo tiene sentido al publicar
    // material (recogida), no al comprar.
    if (esRecogida) {
      sel.insertAdjacentHTML('beforeend',
        '<option value="otros">💬 Otra solicitud (cuéntanos qué necesitas)</option>');
    }
    if (lista.some((c) => c.codigo === previo)) sel.value = previo;
    sincronizarGrupoOtros(sel);
  }

  const userMatPicker = document.getElementById('userMaterialesPicker');
  if (userMatPicker) {
    userMatPicker.style.display = esRecogida ? 'grid' : 'none';
  }
  if (sel) {
    sel.style.display = esRecogida ? 'none' : 'block';
  }

  const ayuda = document.getElementById('tipoSolicitudAyuda');
  const labelCat = document.getElementById('labelCategoria');
  const labelCant = document.getElementById('labelCantidad');
  const btnTxt = document.getElementById('btnPedidoTexto');
  const title = document.getElementById('modalPedidoTitle');

  if (ayuda) {
    if (esRecogida) {
      ayuda.textContent = 'Publica el material que tienes en casa. Los recolectores cercanos verán tu punto en el mapa y vendrán a recogerlo. NOTIGAS no cobra por la recogida.';
      ayuda.style.background = 'rgba(34,197,94,0.12)';
      ayuda.style.borderLeftColor = '#22C55E';
      ayuda.style.color = '#BBF7D0';
    } else {
      ayuda.textContent = 'Pide el producto que necesitas y los recolectores cercanos te lo llevan. El pago se acuerda directo por QR local; NOTIGAS no cobra comisión.';
      ayuda.style.background = 'rgba(2,136,209,0.12)';
      ayuda.style.borderLeftColor = '#0288D1';
      ayuda.style.color = '#BAE6FD';
    }
  }
  if (labelCat) labelCat.textContent = esRecogida ? 'Materiales que tienes para recoger (puedes marcar varios):' : 'Producto / Servicio que necesitas:';
  if (labelCant) labelCant.textContent = esRecogida
    ? '¿Cuánto material tienes? (Ej: 3 bolsas, 1 quintal):'
    : '¿Cuánto necesitas? (Ej: 2 unidades, 1 quintal):';
  if (btnTxt) btnTxt.textContent = esRecogida ? 'Publicar Recogida' : 'Pedido Recolector';
  if (title) title.textContent = esRecogida ? '♻️ Solicitar Recogida de Material' : '🛒 Pedido Recolector';

  sincronizarGrupoOtros(sel);
}
window.setTipoSolicitud = setTipoSolicitud;
window.tipoSolicitudActual = () => tipoSolicitudActual;

// Muestra u oculta el campo de texto libre segun la categoria elegida. Vive
// aqui porque orders.js es quien repuebla el select; events.js lo llama
// desde el listener de 'change' para que las dos rutas no se separen.
function sincronizarGrupoOtros(sel) {
  const select = sel || document.getElementById('selectCategoria');
  const groupOtros = document.getElementById('groupOrderOtros');
  if (!groupOtros) return;
  const checkOtros = document.querySelector('input[name="userMaterial"][value="otros"]');
  const esOtros = (!!select && select.value === 'otros') || (!!checkOtros && checkOtros.checked);
  groupOtros.style.display = esOtros ? 'block' : 'none';
  if (!esOtros) {
    const input = document.getElementById('inputOrderOtrosDetalle');
    if (input) input.value = '';
  }
}
window.sincronizarGrupoOtros = sincronizarGrupoOtros;

function confirmarPedido() {
  if (typeof window.verificarPermisoOperarEnCiudad === 'function' && !window.verificarPermisoOperarEnCiudad('crear un pedido')) {
    return;
  }
  const selectCategoria = document.getElementById('selectCategoria');
  const inputCantidad = document.getElementById('inputCantidad');
  const inputCalle = document.getElementById('inputCallePrincipal');
  const inputTel = document.getElementById('inputTelefonoComprador') || document.getElementById('inputTelefono');
  const inputHorario = document.getElementById('inputOrderHorario');
  const inputOtros = document.getElementById('inputOrderOtrosDetalle');

  const esRecogida = (tipoSolicitudActual === 'recogida');
  let categoria = 'plastico';

  if (esRecogida) {
    const matUsuario = (typeof leerMaterialesUsuario === 'function') ? leerMaterialesUsuario() : [];
    const usaOtros = (selectCategoria && selectCategoria.value === 'otros') || matUsuario.includes('otros');
    if (usaOtros) {
      categoria = 'otros';
    } else if (matUsuario.length > 0) {
      categoria = serializarMaterialesUsuario(matUsuario);
    } else {
      if (typeof showToast === 'function') {
        showToast('♻️ Marca al menos un material', 'Selecciona los tipos de material reciclable que tienes disponibles.', 'warning', 3500);
      } else {
        alert('Selecciona al menos un tipo de material que tienes disponible.');
      }
      return;
    }
  } else {
    categoria = selectCategoria && selectCategoria.value ? selectCategoria.value : 'plastico';
  }

  const primerCodigo = categoria.split(',')[0].trim();
  const boCat = (window.NOTIGAS_BO && typeof window.NOTIGAS_BO.categoriaPorCodigo === 'function')
    ? window.NOTIGAS_BO.categoriaPorCodigo(primerCodigo) : null;
  const tipoSolicitud = (categoria === 'otros') ? 'recogida' : (boCat ? boCat.tipo_solicitud : (tipoSolicitudActual || 'compra'));
  const cantidad = inputCantidad ? inputCantidad.value.trim() : '';
  const calle = inputCalle ? inputCalle.value.trim() : '';
  const telefonoCrudo = inputTel ? inputTel.value.trim() : '';
  const boPhone = window.NOTIGAS_BO;
  const telefono = (boPhone && typeof boPhone.normalizarTelefono === 'function')
    ? boPhone.normalizarTelefono(telefonoCrudo)
    : telefonoCrudo.replace(/[^0-9]/g, '');
  const telefonoValido = (boPhone && typeof boPhone.esTelefonoValido === 'function')
    ? boPhone.esTelefonoValido(telefono)
    : /^[0-9]{8}$/.test(telefono);

  /* El WhatsApp es obligatorio: es el único canal para coordinar la recogida
     cuando el recolector llega al domicilio. No se aceptan pedidos sin número. */
  if (!telefonoValido) {
    if (typeof showToast === 'function') {
      showToast('📞 Falta tu WhatsApp', 'Escribe tu número boliviano de 8 dígitos. Lo necesitamos para coordinar la recogida.', 'warning', 5000);
    }
    if (inputTel) {
      if (typeof inputTel.focus === 'function') inputTel.focus();
      if (typeof inputTel.scrollIntoView === 'function') inputTel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  if (inputTel && typeof inputTel.value === 'string') inputTel.value = telefono;

  const horarioSeleccionado = inputHorario ? String(inputHorario.value || '').trim() : '';
  const otrosDetalle = (categoria === 'otros' && inputOtros) ? inputOtros.value.trim() : '';

  /* "otros" es un pedido real de recogida: el vecino describe que material
     tiene y se publica como cualquier otra recogida (con GPS y cantidad). */
  if (categoria === 'otros' && otrosDetalle.length < 3) {
    showToast('💬 Cuéntanos qué material tienes', 'Escribe al menos 3 caracteres para publicar tu recogida.', 'warning', 4000);
    if (inputOtros) inputOtros.focus();
    return;
  }

  /* El horario elegido viaja en descripcion porque es el campo que ya leen las
     tarjetas del recolector y la vista publica. Para "otros" se conserva el
     material descrito y se agrega el horario sin pisarlo. */
  const partesDescripcion = [];
  if (categoria === 'otros' && otrosDetalle) partesDescripcion.push(otrosDetalle);
  if (horarioSeleccionado) partesDescripcion.push(`Horario para pasar: ${horarioSeleccionado}`);
  const descripcion = partesDescripcion.join(' · ');

  if (!cantidad) {
    if (typeof showToast === 'function') {
      showToast(
        tipoSolicitud === 'recogida' ? '📦 Indica cuánto material tienes' : '📦 Indica cuánto necesitas',
        tipoSolicitud === 'recogida'
          ? 'Por ejemplo "3 bolsas" o "1 quintal". Así el repartidor sabe qué llevar.'
          : 'Por ejemplo "2 unidades" o "1 quintal".',
        'warning', 5000
      );
    }
    if (inputCantidad) inputCantidad.focus();
    return;
  }

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

  // El pedido va siempre a la ciudad donde esta registrado el usuario, no a la
  // ciudad que este mirando en el selector. El servidor vuelve a imponerlo en
  // guard_optional_order_insert, asi que esto es solo para mostrar el texto
  // correcto antes de enviar.
  const registeredCity = (typeof AppState !== 'undefined' && AppState.get('userData') && AppState.get('userData').ciudad)
    ? String(AppState.get('userData').ciudad).toLowerCase().trim()
    : '';
  const selectedCity = (typeof AppState !== 'undefined' && AppState.get('city')) ? AppState.get('city') : (window.selectedCity || 'cochabamba');
  const currentCity = registeredCity || selectedCity;

  if (registeredCity && selectedCity && registeredCity !== String(selectedCity).toLowerCase().trim()) {
    const visibleName = (window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[selectedCity] && window.BOLIVIA_CITIES[selectedCity].nombre) || selectedCity;
    const registeredName = (window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[registeredCity] && window.BOLIVIA_CITIES[registeredCity].nombre) || registeredCity;
    if (typeof showToast === 'function') {
      showToast('📍 Tu ciudad de registro', `Tu pedido se publica en ${registeredName}, no en ${visibleName}.`, 'info', 5000);
    }
  }

  const orderData = {
    categoria,
    tipoSolicitud,
    cantidad,
    descripcion,
    direccion: calle || 'Ubicación GPS indicada en el mapa',
    callePrincipal: calle || 'Ubicación GPS indicada en el mapa',
    telefono: telefono || '',
    latitude: lat,
    longitude: lng,
    lat,
    lng,
    ciudad: currentCity,
    timestamp: Date.now(),
    estado: 'pendiente'
  };

  if (window.supabaseClient) {
    showLoadingOverlay(tipoSolicitud === 'recogida' ? 'Publicando tu material...' : 'Registrando tu pedido...');

    getAuthenticatedUserId().then(async (userId) => {
if (!userId) {
          hideLoadingOverlay();
          if (typeof window.abrirModalRegistroPedido === 'function') {
            window.abrirModalRegistroPedido();
          } else {
            showToast('Error', 'Debes estar autenticado para crear un pedido.', 'error', 3000);
          }
          return;
        }

      const catName = (orderData.categoria === 'otros')
        ? 'Otros (a especificar)'
        : (boCat ? boCat.chip : (orderData.categoria || 'Plastico'));
      const orderTitle = tipoSolicitud === 'recogida' ? `Recogida de ${catName}` : `Pedido de ${catName}`;

      const { data, error } = await window.supabaseClient
        .from('pedidos')
        .insert([{
          user_id: userId,
          titulo: orderTitle,
          categoria: orderData.categoria,
          cantidad: orderData.cantidad,
          descripcion: orderData.descripcion,
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
      showToast(
        tipoSolicitud === 'recogida' ? '♻️ ¡Recogida Publicada!' : '🛒 ¡Pedido Publicado!',
        tipoSolicitud === 'recogida'
          ? 'Los repartidores cercanos verrán tu material en el mapa y lo vendrán a recogerlo.'
          : 'Tu pedido ya está visible para los repartidores en el mapa.',
        'success', 5000
      );
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

/* ==========================================================================
   MIS PEDIDOS (ficha del vecino)
   Cada usuario ve aqui SUS pedidos y puede confirmar "Ya fue recogido".
   La confirmacion pasa por rpc_user_confirm_pickup, que valida al propietario,
   acepta pedidos en pendiente/visto/asignado y deja el pedido en 'entregado'.
   Al confirmarlo se quita del mapa y de la lista de pedidos libres.
   ========================================================================== */

const MIS_PEDIDOS_ESTADO_UI = {
  pendiente: { label: 'Buscando recolector', color: '#FF8F00', bg: 'rgba(255,143,0,.14)' },
  visto:     { label: 'Visto por un recolector', color: '#F59E0B', bg: 'rgba(245,158,11,.14)' },
  asignado:  { label: 'Recolector en camino', color: '#10B981', bg: 'rgba(16,185,129,.16)' },
  entregado: { label: 'Recogido', color: '#22C55E', bg: 'rgba(34,197,94,.16)' },
  recibido:  { label: 'Recibido', color: '#22C55E', bg: 'rgba(34,197,94,.16)' },
  cancelado: { label: 'Cancelado', color: '#EF4444', bg: 'rgba(239,68,68,.14)' }
};

function etiquetaCategoriaMisPedidos(categoria) {
  const codigos = String(categoria || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  if (!codigos.length) return 'Material';
  const bo = window.NOTIGAS_BO;
  const mapa = (bo && bo.CATEGORIAS_POR_CODIGO) ? bo.CATEGORIAS_POR_CODIGO : {};
  return codigos.map(codigo => {
    if (codigo === 'otros') return 'Otros';
    return (mapa[codigo] && mapa[codigo].chip) ? mapa[codigo].chip : codigo;
  }).join(' · ');
}

function fechaCortaMisPedidos(valor) {
  if (!valor) return 'Fecha no disponible';
  try {
    return new Date(valor).toLocaleString('es-BO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return String(valor);
  }
}

async function abrirMisPedidos() {
  const modal = document.getElementById('modalMisPedidos');
  if (modal) modal.style.display = 'flex';
  await renderMisPedidos();
}
window.abrirMisPedidos = abrirMisPedidos;

function cerrarMisPedidos() {
  const modal = document.getElementById('modalMisPedidos');
  if (modal) modal.style.display = 'none';
}
window.cerrarMisPedidos = cerrarMisPedidos;

async function renderMisPedidos() {
  const body = document.getElementById('bodyMisPedidos');
  if (!body) return;

  if (!window.supabaseClient) {
    body.innerHTML = '<div style="text-align:center;padding:18px;color:#FCA5A5;font-size:16px;">Sin conexión con el servidor. Intenta de nuevo en un momento.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:20px;color:#94A3B8;font-size:16px;">Cargando tus pedidos...</div>';

  let userId = null;
  try {
    userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
  } catch (_) {}

  if (!userId) {
    body.innerHTML = '<div style="text-align:center;padding:18px;color:#FCD34D;font-size:16px;line-height:1.5;">Inicia sesión para ver tus pedidos y confirmar cuando ya fueron recogidos.</div>';
    return;
  }

  const escape = typeof escapeHtmlStr === 'function' ? escapeHtmlStr : (v) => String(v ?? '');
  const { data, error } = await window.supabaseClient
    .from('pedidos')
    .select('id, categoria, cantidad, descripcion, direccion, telefono, estado, created_at, driver_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    console.error('[NOTIGAS] No se pudieron cargar los pedidos del vecino:', error);
    body.innerHTML = `<div style="text-align:center;padding:18px;color:#FCA5A5;font-size:16px;">No se pudieron cargar tus pedidos.<br>${escape(error.message || 'Intenta de nuevo.')}</div>`;
    return;
  }

  const pedidos = Array.isArray(data) ? data : [];
  if (!pedidos.length) {
    body.innerHTML = '<div style="text-align:center;padding:24px 12px;color:#94A3B8;font-size:16px;line-height:1.5;">Todavía no tienes pedidos publicados.<br>Cuando publiques una recogida aparecerá aquí.</div>';
    return;
  }

  const activos = pedidos.filter(p => ['pendiente', 'visto', 'asignado'].includes(String(p.estado || '').toLowerCase()));
  const historial = pedidos.filter(p => !activos.includes(p));

  const tarjeta = (pedido) => {
    const estado = String(pedido.estado || 'pendiente').toLowerCase();
    const ui = MIS_PEDIDOS_ESTADO_UI[estado] || MIS_PEDIDOS_ESTADO_UI.pendiente;
    const puedeConfirmar = ['pendiente', 'visto', 'asignado'].includes(estado);
    const descripcion = String(pedido.descripcion || '').trim();
    const cantidad = String(pedido.cantidad || '1 unidad').trim();
    const direccion = String(pedido.direccion || 'Ubicación GPS indicada en el mapa').trim();

    return `
      <article style="background:#1E293B;border:1px solid #334155;border-radius:14px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="min-width:0;">
            <div style="font-size:17px;font-weight:900;color:#F8FAFC;line-height:1.25;">♻️ ${escape(etiquetaCategoriaMisPedidos(pedido.categoria))}</div>
            <div style="font-size:16px;color:#CBD5E1;margin-top:3px;">📦 ${escape(cantidad)}</div>
          </div>
          <span style="flex:0 0 auto;background:${ui.bg};border:1px solid ${ui.color};color:${ui.color};border-radius:999px;padding:4px 9px;font-size:14px;font-weight:900;white-space:nowrap;">${escape(ui.label)}</span>
        </div>
        ${descripcion ? `<div style="font-size:16px;color:#FDA4AF;margin-top:8px;line-height:1.4;">🕒 ${escape(descripcion)}</div>` : ''}
        <div style="font-size:16px;color:#94A3B8;margin-top:6px;line-height:1.4;">📍 ${escape(direccion)}</div>
        <div style="font-size:15px;color:#64748B;margin-top:5px;">📅 ${escape(fechaCortaMisPedidos(pedido.created_at))}</div>
        ${puedeConfirmar ? `
          <button type="button" data-action="confirmarRecogidaPedido" data-id="${escape(pedido.id)}" style="width:100%;margin-top:10px;background:linear-gradient(135deg,#10B981,#059669);color:#FFFFFF;border:1px solid #6EE7B7;border-radius:10px;padding:10px;font-size:16px;font-weight:900;cursor:pointer;">
            <i class="fa-solid fa-circle-check"></i> Ya fue recogido
          </button>
        ` : ''}
      </article>`;
  };

  body.innerHTML = `
    ${activos.length ? `
      <div style="font-size:15px;font-weight:900;color:#94A3B8;letter-spacing:.4px;margin:2px 0 8px;">PEDIDOS ACTIVOS</div>
      ${activos.map(tarjeta).join('')}
    ` : '<div style="text-align:center;padding:16px 10px;color:#94A3B8;font-size:16px;">No tienes pedidos activos.</div>'}
    ${historial.length ? `
      <div style="font-size:15px;font-weight:900;color:#94A3B8;letter-spacing:.4px;margin:14px 0 8px;">HISTORIAL</div>
      ${historial.map(tarjeta).join('')}
    ` : ''}
  `;
}
window.renderMisPedidos = renderMisPedidos;

async function confirmarRecogidaPedido(orderId) {
  if (!orderId) return;

  const ejecutar = async () => {
    if (!window.supabaseClient) {
      if (typeof showToast === 'function') showToast('Sin conexión', 'No hay conexión con el servidor.', 'error', 4000);
      return;
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Confirmando recogida...');
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_user_confirm_pickup', {
        p_order_id: orderId
      });

      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

      if (error) {
        console.error('[NOTIGAS] Error confirmando recogida:', error);
        if (typeof showToast === 'function') showToast('No se pudo confirmar', error.message || 'Intenta de nuevo.', 'error', 4500);
        return;
      }

      const rawActive = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
      let activeOrder = null;
      try {
        activeOrder = (typeof rawActive === 'string') ? JSON.parse(rawActive) : rawActive;
      } catch (_) {}
      if (activeOrder && String(activeOrder.id) === String(orderId)) {
        AppState.set('activeOrder', null);
      }

      if (typeof window.removerPedidoDeMapa === 'function') window.removerPedidoDeMapa(orderId);
      if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
      if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
      if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
      if (typeof renderDriverDemandByZoom === 'function') renderDriverDemandByZoom();

      await renderMisPedidos();

      if (typeof showToast === 'function') {
        showToast('✅ ¡Gracias!', 'Pedido confirmado como recogido. Ya no aparece en el mapa.', 'success', 5000);
      }
    } catch (e) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      console.error('[NOTIGAS] Excepción confirmando recogida:', e);
      if (typeof showToast === 'function') showToast('Error', 'No se pudo confirmar la recogida.', 'error', 4000);
    }
  };

  if (typeof window.showConfirmModal === 'function') {
    window.showConfirmModal(
      '♻️',
      '¿Ya fue recogido?',
      'Confirma solo cuando el recolector ya haya retirado tu material. El pedido desaparecerá del mapa y de la lista de recolectores.',
      'Sí, ya fue recogido',
      ejecutar,
      'Volver'
    );
  } else {
    await ejecutar();
  }
}
window.confirmarRecogidaPedido = confirmarRecogidaPedido;

async function reportarIncumplimientoPrecio() {
  const rawOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
  const order = typeof rawOrder === 'string' ? JSON.parse(rawOrder) : rawOrder;
  if (!order?.id || !order.driver_id || order.estado !== 'asignado') {
    showToast('Queja no disponible', 'Solo puedes reportar el precio de un pedido asignado.', 'warning', 3500);
    return;
  }
  const rawPrice = window.prompt('¿Qué precio te cobró el repartidor? Ingresa el monto en bolivianos, por ejemplo: 45.00');
  if (rawPrice === null) return;
  const chargedPrice = Number(String(rawPrice).trim().replace(',', '.'));
  if (!Number.isFinite(chargedPrice) || chargedPrice < 0 || chargedPrice > 1000) {
    showToast('Precio no válido', 'Ingresa un monto válido en bolivianos.', 'warning', 3500);
    return;
  }
  showConfirmModal('⚠️', 'Reportar precio distinto', 'Se enviará a administración el precio publicado en la ficha y el monto que reportas. La queja no aplica sanciones automáticas.', 'Enviar queja', async () => {
    const { data, error } = await window.supabaseClient.rpc('rpc_reportar_incumplimiento_precio', {
      p_order_id: order.id, p_precio_cobrado: chargedPrice, p_detalle: null
    });
    if (error) { showToast('No se pudo enviar', error.message || 'Inténtalo nuevamente.', 'error', 4000); return; }
    showToast('Queja enviada', data?.already_reported ? 'Ya habías reportado este pedido.' : 'Administración revisará el precio publicado y tu reporte.', 'success', 4500);
  }, 'Volver');
}
window.reportarIncumplimientoPrecio = reportarIncumplimientoPrecio;

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
          <div style="font-weight: 900; font-size:16px; color: #FF6D00; margin-bottom: 6px;"><i class="fa-solid fa-box"></i> Tu Pedido Activo</div>
          <div style="font-size:16px; color: #CBD5E1;"><strong>📦 Producto:</strong> ${escapeHtmlStr(o.categoria)}</div>
          <div style="font-size:16px; color: #CBD5E1;"><strong>🔢 Cantidad:</strong> ${escapeHtmlStr(String(o.cantidad))}</div>
          <div style="font-size:16px; color: #CBD5E1;"><strong>🚦 Calle:</strong> ${escapeHtmlStr(o.callePrincipal || 'En mapa')}</div>
          <div style="font-size:16px; color: #64748B; margin-top: 4px;">⏱️ Publicado hace ${antiguedad}</div>
          <div style="display:flex; gap:6px; margin-top:10px;">
            ${isAsignado ? `
              <button type="button" data-action="confirmarRecepcionComprador" style="flex:1; background:linear-gradient(135deg, #10B981, #059669); color:white; border:none; padding:7px 10px; border-radius:8px; font-size:16px; font-weight:800; cursor:pointer;">
                <i class="fa-solid fa-circle-check"></i> Ya recibí mi pedido
              </button>
              <button type="button" data-action="reportarIncumplimientoPrecio" style="flex:1; background:#F59E0B; color:#111827; border:none; padding:7px 10px; border-radius:8px; font-size:16px; font-weight:800; cursor:pointer;">
                <i class="fa-solid fa-flag"></i> Queja por precio
              </button>
            ` : ''}
            <button type="button" data-action="cancelarPedidoActivo" style="flex:1; background:#ef4444; color:white; border:none; padding:7px 10px; border-radius:8px; font-size:16px; font-weight:800; cursor:pointer;">
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
        .select('id, categoria, cantidad, direccion, created_at, estado, visto, latitude, longitude')
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
                <div style="font-size:16px; font-weight:800; color:#F8FAFC;">${escapeHtmlStr(p.categoria)} (${p.cantidad})</div>
                <div style="font-size:16px; color:#94A3B8;">📍 ${escapeHtmlStr(p.direccion || 'Ubicación GPS en Mapa')}</div>
                <div style="font-size:16px; color:#64748B;">⏱️ ${antiguedad}</div>
              </div>
              <button type="button" data-action="centrarPedidoEnMapa" data-lat="${p.latitude}" data-lng="${p.longitude}" data-order-id="${p.id}" style="background:#0284C7; color:#F8FAFC; border:none; padding:6px 10px; border-radius:6px; font-size:16px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
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
      <div style="font-weight: 800; font-size:16px; color: #94A3B8; margin: 12px 0 6px;"><i class="fa-solid fa-users"></i> Otros Pedidos en tu Zona</div>
      ${otrosPedidosHtml}
    `;
  }

  if (!contenido) {
    contenido = '<div style="text-align:center; padding:30px; color:#94A3B8; font-size:16px;"><i class="fa-solid fa-circle-info" style="font-size:24px; margin-bottom:8px; display:block;"></i>No hay pedidos activos registrados en este momento.</div>';
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
  if (!window.notigasGlobalChannel) {
    console.warn('No hay un canal global activo para emitir la alerta.');
    return false;
  }
  try {
    await window.notigasGlobalChannel.send({
      type: 'broadcast',
      event: 'vecinos_alert',
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
    titulo: '¡Camión Recolector Escuchado!',
    mensaje: 'Un vecino cercano reporta haber escuchado o visto el camión recolector en esta zona.',
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
    titulo: '¡Vecino publicando material!' ,
    mensaje: 'Un vecino cercano publicó material para recoger. Por favor espérale unos minutos.',
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
  // Guardar en el buffer local para que aparezca en el mapa
  try {
    let buffer = [];
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');
    if (raw) buffer = JSON.parse(raw);
    buffer.push({
      id: 'alerta_' + Date.now(),
      lat: payload.lat,
      lng: payload.lng,
      tipo: payload.tipo,
      timestamp: payload.timestamp || Date.now(),
      reporter: payload.tipo === 'esperame' ? 'Vecino (Espérame)' : 'Vecino (Escuchó Camión)'
    });
    localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(buffer));
    if (typeof renderReportedTrucks === 'function') {
      renderReportedTrucks();
    }
  } catch(e) {
    console.warn("Error guardando alerta vecinal en buffer local:", e);
  }

  if (payload.tipo === 'escuche_camion') {
    if (typeof mostrarPopupAlertaRepartidor === 'function') {
      mostrarPopupAlertaRepartidor('🔔 ¡Camión Recolector Cerca!', payload.mensaje || 'Un vecino reporta haber visto o escuchado al camión recolector cerca de tu zona.');
    } else if (typeof showToast === 'function') {
      showToast('🔔 ¡Camión Recolector Cerca!', payload.mensaje || 'Un vecino reporta el camión recolector cerca.', 'info', 5000);
    }
  } else if (payload.tipo === 'esperame') {
    if (typeof mostrarPopupAlertaRepartidor === 'function') {
      mostrarPopupAlertaRepartidor('⏳ ¡Vecino Saliendo!', payload.mensaje || 'Un vecino cercano publicó material para recoger.');
    } else if (typeof showToast === 'function') {
      showToast('⏳ ¡Vecino Saliendo!', payload.mensaje || 'Un vecino cercano está saliendo.', 'warning', 5000);
    }
  }
};
