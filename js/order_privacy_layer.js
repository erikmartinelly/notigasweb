/* ==========================================================================
   NOTIGAS - CAPA DE PRIVACIDAD DE PEDIDOS
   - Usuarios registrados ven repartidores activos mediante vistas sanitizadas.
   - Pedidos libres: solo área aproximada de 50 m, sin datos del comprador/pedido.
   - Pedido asignado al repartidor: dirección exacta + WhatsApp/datos necesarios.
   - Una suspensión financiera/administrativa bloquea NUEVAS tomas, pero no
     oculta pedidos ya asignados ni impide completarlos/liberarlos.
   ========================================================================== */
(function () {
  'use strict';

  const radarLayers = new Map();
  const SUSPENDED_STATES = new Set([
    'suspendido_tope',
    'suspendido',
    'suspendido_mora',
    'suspendido_pago',
    'baneado',
    'inactivo'
  ]);

  let radarChannel = null;
  let overrideTimer = null;
  let authListener = null;
  let driverCanTakeOrders = false;
  let driverSuspensionReason = '';

  function getMapInstance() {
    try {
      if (typeof map !== 'undefined' && map) return map;
    } catch (_) {}
    return window.map || null;
  }

  function escapeHtml(value) {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentCity() {
    const raw = (typeof AppState !== 'undefined' && AppState.get('city')) || 'lima';
    return String(raw || 'lima').toLowerCase().trim();
  }

  function isDriverMode() {
    if (typeof AppState === 'undefined') return false;
    return AppState.get('appMode') === 'driver' || AppState.get('userRole') === 'repartidor';
  }

  function showSuspendedMessage(reason) {
    const message = reason || 'Tu cuenta está suspendida. Regulariza el motivo pendiente para volver a tomar pedidos.';
    if (typeof window.showToast === 'function') {
      window.showToast('Cuenta suspendida', message, 'warning', 6000);
    } else if (typeof window.alert === 'function') {
      window.alert(message);
    }
  }

  async function refreshDriverAccessState() {
    driverCanTakeOrders = false;
    driverSuspensionReason = '';

    if (!isDriverMode() || !window.supabaseClient) {
      return { canTake: false, reason: '' };
    }

    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) {
        driverSuspensionReason = 'Debes iniciar sesión como repartidor para tomar pedidos.';
        return { canTake: false, reason: driverSuspensionReason };
      }

      const { data, error } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('estado_servicio,bloqueado,motivo_bloqueo,estado_verificacion')
        .eq('user_id', uid)
        .maybeSingle();

      if (error || !data) {
        driverSuspensionReason = 'No se pudo validar el estado operativo de tu cuenta.';
        return { canTake: false, reason: driverSuspensionReason };
      }

      const state = String(data.estado_servicio || 'activo').toLowerCase().trim();
      const verification = String(data.estado_verificacion || '').toLowerCase().trim();
      const suspended = Boolean(data.bloqueado) || SUSPENDED_STATES.has(state) || verification !== 'aprobado';

      driverCanTakeOrders = !suspended && state === 'activo';
      driverSuspensionReason = driverCanTakeOrders
        ? ''
        : (data.motivo_bloqueo || 'Tu cuenta está suspendida. Regulariza el motivo pendiente para volver a tomar pedidos.');

      return { canTake: driverCanTakeOrders, reason: driverSuspensionReason };
    } catch (error) {
      console.warn('[OrderPrivacy] No se pudo validar estado del repartidor:', error);
      driverSuspensionReason = 'No se pudo validar el estado operativo de tu cuenta.';
      return { canTake: false, reason: driverSuspensionReason };
    }
  }

  function clearRadarLayers() {
    const mapRef = getMapInstance();
    radarLayers.forEach((layer) => {
      try { if (mapRef && layer) mapRef.removeLayer(layer); } catch (_) {}
    });
    radarLayers.clear();
  }

  function buildAvailablePopup(row) {
    const radius = Number(row.radius_m || 50);
    let action = '';
    if (isDriverMode()) {
      action = driverCanTakeOrders
        ? `<button type="button" style="margin-top:8px;width:100%;padding:7px 10px;border:0;border-radius:7px;font-weight:800;cursor:pointer;" onclick="window.tomarPedidoDesdeZonaPrivada('${escapeHtml(row.order_id)}',${Number(row.latitude)},${Number(row.longitude)})">Tomar pedido</button>`
        : `<div style="margin-top:8px;padding:7px 9px;border-radius:7px;font-size:11px;font-weight:800;">Cuenta suspendida: puedes ver la zona, pero no tomar nuevos pedidos.</div>`;
    }
    return `<div style="min-width:180px;line-height:1.4;"><strong>Pedido disponible</strong><br><span>Ubicación aproximada dentro de un área de ${radius} m.</span>${action}</div>`;
  }

  function renderRadar(rows) {
    const mapRef = getMapInstance();
    if (!mapRef || typeof L === 'undefined') return;

    clearRadarLayers();
    (rows || []).forEach((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const radius = Number(row.radius_m || 50);
      const circle = L.circle([lat, lng], {
        radius,
        weight: 2,
        fillOpacity: 0.16,
        interactive: true
      }).addTo(mapRef);
      circle.bindPopup(buildAvailablePopup(row));
      radarLayers.set(String(row.order_id), circle);
    });
  }

  async function loadOrderRadar() {
    if (!window.supabaseClient) return;
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    if (!sessionData?.session?.user) {
      clearRadarLayers();
      return;
    }

    if (isDriverMode()) await refreshDriverAccessState();

    let query = window.supabaseClient
      .from('order_public_radar')
      .select('order_id, ciudad, latitude, longitude, radius_m');

    const city = currentCity();
    if (city && city !== 'todos' && city !== 'all') {
      const keys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(city) : [city];
      if (Array.isArray(keys) && keys.length) query = query.in('ciudad', keys);
      else query = query.eq('ciudad', city);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[OrderPrivacy] No se pudo cargar el radar sanitizado:', error.message || error);
      clearRadarLayers();
      return;
    }
    renderRadar(data || []);
  }

  window.loadOrderPrivacyRadar = loadOrderRadar;

  window.tomarPedidoDesdeZonaPrivada = async function (orderId, lat, lng) {
    if (!isDriverMode()) return;
    const access = await refreshDriverAccessState();
    if (!access.canTake) {
      showSuspendedMessage(access.reason);
      return;
    }
    if (typeof window.aceptarPedidoRepartidor === 'function') {
      window.aceptarPedidoRepartidor(orderId, Number(lat), Number(lng), 'Zona aproximada de 50 m');
    }
  };

  window.centrarZonaPedidoAproximada = function (orderId, lat, lng) {
    const mapRef = getMapInstance();
    if (!mapRef) return;
    const layer = radarLayers.get(String(orderId));
    try {
      mapRef.flyTo([Number(lat), Number(lng)], Math.max(mapRef.getZoom?.() || 15, 16), { duration: 0.8 });
      if (layer?.openPopup) setTimeout(() => layer.openPopup(), 850);
    } catch (_) {}
  };

  function normalizeWhatsapp(raw) {
    return String(raw || '').replace(/\D/g, '');
  }

  async function secureRenderDriverOrdersList() {
    const container = document.getElementById('driverOrdersContainer') || document.getElementById('driverOrdersList');
    if (!container || !window.supabaseClient) return;

    container.innerHTML = '<div style="padding:16px;text-align:center;">Cargando pedidos...</div>';
    const access = await refreshDriverAccessState();

    let radarQuery = window.supabaseClient
      .from('order_public_radar')
      .select('order_id, ciudad, latitude, longitude, radius_m');
    const city = currentCity();
    if (city && city !== 'todos' && city !== 'all') {
      const keys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(city) : [city];
      if (Array.isArray(keys) && keys.length) radarQuery = radarQuery.in('ciudad', keys);
      else radarQuery = radarQuery.eq('ciudad', city);
    }

    const [radarRes, assignedRes] = await Promise.all([
      radarQuery,
      window.supabaseClient.rpc('rpc_get_my_assigned_orders')
    ]);

    if (radarRes.error) console.warn('[OrderPrivacy] Radar:', radarRes.error.message || radarRes.error);
    if (assignedRes.error) console.warn('[OrderPrivacy] Asignados:', assignedRes.error.message || assignedRes.error);

    const assigned = assignedRes.data || [];
    const available = radarRes.data || [];
    let html = '<div style="padding:10px 0 6px;font-weight:900;">Pedidos</div>';

    if (!access.canTake) {
      html += `<div style="padding:10px;margin:8px 0 12px;border:1px solid rgba(239,68,68,.55);border-radius:8px;background:rgba(239,68,68,.10);font-size:11px;line-height:1.45;"><strong>Cuenta suspendida para nuevos pedidos.</strong><br>${escapeHtml(access.reason || driverSuspensionReason)}</div>`;
    }

    if (assigned.length) {
      html += '<div style="font-size:11px;font-weight:800;margin:8px 0;">MIS PEDIDOS TOMADOS</div>';
      assigned.forEach((o) => {
        const lat = Number(o.latitude || 0);
        const lng = Number(o.longitude || 0);
        const tel = String(o.telefono || '').trim();
        const wa = normalizeWhatsapp(tel);
        html += `<div style="padding:10px;margin-bottom:9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;">
          <div style="font-weight:800;">Pedido en entrega</div>
          <div style="margin-top:5px;">📍 ${escapeHtml(o.direccion || o.barrio_otb || 'Ubicación exacta en el mapa')}</div>
          ${tel ? `<div style="margin-top:4px;">📞 ${escapeHtml(tel)}</div>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="padding:6px 9px;border-radius:6px;text-decoration:none;font-weight:800;">WhatsApp</a>` : ''}
            <button type="button" onclick="window.centrarPedidoEnMapa?.(${lat},${lng},'${escapeHtml(o.id)}')" style="padding:6px 9px;border-radius:6px;border:0;font-weight:800;cursor:pointer;">Ver ubicación exacta</button>
            <button type="button" data-action="confirmarEntregaPedido" data-id="${escapeHtml(o.id)}" style="padding:6px 9px;border-radius:6px;border:0;font-weight:800;cursor:pointer;">Entregado</button>
            <button type="button" data-action="liberarPedidoRepartidor" data-id="${escapeHtml(o.id)}" style="padding:6px 9px;border-radius:6px;border:0;font-weight:800;cursor:pointer;">No podré</button>
          </div>
        </div>`;
      });
    }

    html += '<div style="font-size:11px;font-weight:800;margin:12px 0 8px;">PEDIDOS LIBRES</div>';
    if (!available.length) {
      html += '<div style="padding:16px;text-align:center;opacity:.75;">No hay pedidos libres en tu zona.</div>';
    } else {
      available.forEach((o) => {
        const lat = Number(o.latitude);
        const lng = Number(o.longitude);
        const radius = Number(o.radius_m || 50);
        const takeButton = access.canTake
          ? `<button type="button" onclick="window.tomarPedidoDesdeZonaPrivada('${escapeHtml(o.order_id)}',${lat},${lng})" style="padding:6px 9px;border-radius:6px;border:0;font-weight:800;cursor:pointer;">Tomar</button>`
          : '';
        html += `<div style="padding:10px;margin-bottom:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;">
          <div style="font-weight:800;">Pedido disponible</div>
          <div style="font-size:11px;margin-top:3px;opacity:.8;">Solo se muestra un área aproximada de ${radius} m. Los datos del pedido se habilitan únicamente si lo tomas.</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button type="button" onclick="window.centrarZonaPedidoAproximada('${escapeHtml(o.order_id)}',${lat},${lng})" style="padding:6px 9px;border-radius:6px;border:0;font-weight:800;cursor:pointer;">Ver zona</button>
            ${takeButton}
          </div>
        </div>`;
      });
    }

    container.innerHTML = html;
    if (typeof window.ensureNotDeliveredButtons === 'function') window.ensureNotDeliveredButtons(container);
  }

  function installDriverListOverride() {
    window.renderDriverOrdersList = secureRenderDriverOrdersList;
  }

  function subscribeRadar() {
    if (!window.supabaseClient) return;
    if (radarChannel) {
      try { window.supabaseClient.removeChannel(radarChannel); } catch (_) {}
      radarChannel = null;
    }
    radarChannel = window.supabaseClient
      .channel(`order-radar-private-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_public_radar' }, () => {
        loadOrderRadar();
        if (isDriverMode() && typeof window.renderDriverOrdersList === 'function') window.renderDriverOrdersList();
      })
      .subscribe();
  }

  async function bootstrap() {
    installDriverListOverride();
    if (overrideTimer) clearInterval(overrideTimer);
    overrideTimer = setInterval(installDriverListOverride, 2500);

    await loadOrderRadar();
    subscribeRadar();

    if (typeof AppState !== 'undefined' && typeof AppState.on === 'function') {
      AppState.on('city', () => {
        loadOrderRadar();
        subscribeRadar();
      });
      AppState.on('appMode', () => loadOrderRadar());
      AppState.on('userData', () => {
        if (isDriverMode()) loadOrderRadar();
      });
    }

    if (window.supabaseClient?.auth?.onAuthStateChange) {
      const result = window.supabaseClient.auth.onAuthStateChange(() => {
        loadOrderRadar();
        subscribeRadar();
      });
      authListener = result?.data?.subscription || null;
    }
  }

  window.NOTIGAS_ORDER_PRIVACY_READY = true;
  window.secureRenderDriverOrdersList = secureRenderDriverOrdersList;
  window.refreshDriverOrderAccessState = refreshDriverAccessState;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  window.addEventListener?.('beforeunload', () => {
    if (overrideTimer) clearInterval(overrideTimer);
    try { authListener?.unsubscribe?.(); } catch (_) {}
    try { if (radarChannel && window.supabaseClient) window.supabaseClient.removeChannel(radarChannel); } catch (_) {}
  });
})();
