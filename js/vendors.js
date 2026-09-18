/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */
const defaultVendorsList = [];
async function descargarChoferesYRenderizar(cat = 'TODOS') {
  if (!window.supabaseClient) { renderVendorCards(cat); return; }
  const city = AppState.get('city');
  if (!city) { renderVendorCards(cat); return; }
  try {
    const cityNormalized = city.trim().toLowerCase();
    const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(cityNormalized) : [cityNormalized];
    const { data, error } = await window.supabaseClient.from('choferes_publicos')
      .select('id, nombre_completo, categoria, ciudad, telefono, descripcion, foto_url, estado_verificacion, created_at, color_camion, precio_balon_10kg, es_premium')
      .in('ciudad', cityKeys);
    if (error) {
      console.error('Error descargando choferes desde choferes_publicos:', error);
      AppState.set('notigas_vendors_directory', []);
    } else if (data && data.length > 0) {
      const list = data.filter(d => !d.estado_verificacion || d.estado_verificacion === 'aprobado').map(d => ({
        id: `driver_${d.id}`, driverProfileId: d.id, name: d.nombre_completo,
        category: d.categoria || 'Gas GLP',
        icon: typeof getIconForCategory === 'function' ? getIconForCategory(d.categoria) : '🚛',
        plate: d.placa || 'Placa registrada', products: d.productos || 'Servicios de reparto a domicilio',
        zones: d.zonas || 'zona local', schedule: d.schedule || 'Lunes a Sábado',
        color_camion: d.color_camion || '', precio_balon_10kg: d.precio_balon_10kg || null,
        es_premium: false, active: true
      }));
      AppState.set('notigas_vendors_directory', list);
    } else AppState.set('notigas_vendors_directory', []);
  } catch (e) { console.error('Error fetching local drivers:', e); }
  renderVendorCards(cat);
}
document.addEventListener('notigas_auth_ready', () => {
  const tab1 = document.getElementById('tab1');
  if (tab1 && tab1.classList.contains('active')) descargarChoferesYRenderizar('TODOS');
  instalarFlujoSolicitudDistribuidor();
});
function filterVendorCategory(cat, chipElem) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (chipElem) chipElem.classList.add('active'); renderVendorCards(cat);
}
function getStoredVendors() {
  const list = AppState.get('notigas_vendors_directory') || [];
  const deletedIds = AppState.get('notigas_deleted_vendor_ids') || [];
  const isAdmin = typeof AppState !== 'undefined' && AppState.get('isAdmin') === true;
  return list.filter(v => !deletedIds.includes(v.id) && (v.active || isAdmin));
}
function renderVendorCards(filterCat) {
  const container = document.getElementById('vendorGridContainer'); if (!container) return;
  const isAdmin = typeof AppState !== 'undefined' && AppState.get('isAdmin') === true;
  const allVendors = getStoredVendors();
  const filtered = filterCat === 'TODOS' ? allVendors : allVendors.filter(v => v.category.toLowerCase().includes(filterCat.toLowerCase()) || filterCat.toLowerCase().includes(v.category.toLowerCase()));
  let html = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#94A3B8;padding:40px 14px;font-size:13px;background:#1E293B;border-radius:14px;border:1px dashed rgba(255,255,255,.15);margin-top:14px;"><i class="fa-solid fa-store-slash" style="font-size:32px;color:#FF6D00;margin-bottom:10px;"></i><br><strong>Aún no hay Fichas de Repartidores registradas en esta categoría.</strong><br><span style="font-size:11px;color:#64748B;">¿Eres repartidor? Registra tu ficha de negocio gratis y conéctate con los vecinos de tu zona.</span><br><br><button class="btn-driver" style="margin:0 auto;padding:10px 16px;font-size:12px;" data-action="abrirModalDriver">🚚 Publicar Mi Mini Página de Negocio</button></div>`;
    const adMarkup = typeof window.getAdSenseFeedMarkup === 'function' ? window.getAdSenseFeedMarkup('vendors') : ''; if (adMarkup) container.insertAdjacentHTML('afterbegin', adMarkup); return;
  }
  const adInsertAfterIndex = Math.max(0, Math.ceil(filtered.length / 2) - 1);
  filtered.forEach((vendor, index) => {
    const safeVendorId = escapeHtmlStr(vendor.id || '');
    const safeProfileId = escapeHtmlStr(String(vendor.driverProfileId || String(vendor.id || '').replace(/^driver_/, '')));
    const safeVendorIcon = typeof window.crearAvatarCamionChoferHtml === 'function' ? window.crearAvatarCamionChoferHtml(vendor.name, {category: vendor.category, color: vendor.color_camion, price: vendor.precio_balon_10kg, es_premium: false}) : escapeHtmlStr(vendor.icon || getIconForCategory(vendor.category));
    let price10kgHtml = '';
    if (vendor.precio_balon_10kg && !isNaN(Number(vendor.precio_balon_10kg)) && Number(vendor.precio_balon_10kg) > 0) price10kgHtml = `<div class="vendor-field vendor-field-price" style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);padding:6px 10px;border-radius:8px;margin:2px 0;"><strong style="color:#A7F3D0;font-size:12px;">🔥 Balón 10 Kg:</strong><span class="vendor-price-highlight" style="color:#22C55E;font-size:14.5px;font-weight:900;margin-left:auto;">S/ ${Number(vendor.precio_balon_10kg).toFixed(2)}</span></div>`;
    html += `<div class="vendor-fb-card"><div class="vendor-fb-header"><div class="vendor-profile"><div class="vendor-avatar" style="background:transparent;border:none;width:auto;height:auto;padding:0;overflow:visible;">${safeVendorIcon}</div><div class="vendor-meta"><span class="vendor-name">${escapeHtmlStr(vendor.name)}</span><span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${escapeHtmlStr(vendor.category)}</span></div></div><div style="display:flex;align-items:center;gap:6px;">${isAdmin ? `<button data-action="eliminarFichaAdmin" data-id="${safeVendorId}" style="background:#D32F2F;color:white;border:none;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="promo-badge" style="background:rgba(0,230,118,.15);color:#00E676;border-color:rgba(0,230,118,.4);">REPARTIDOR ACTIVO</span>`}</div></div><div class="vendor-fb-body">${price10kgHtml}<div class="vendor-field"><strong>⭐ Calificación:</strong> Sin calificaciones todavía</div><div class="vendor-field"><strong>📦 Productos:</strong> ${escapeHtmlStr(vendor.products)}</div><div class="vendor-field"><strong>🗺️ Zona de cobertura:</strong> ${escapeHtmlStr(vendor.zones)}</div></div><div class="vendor-fb-footer"><button class="btn-vendor-order" data-action="seleccionarYPedirDirecto" data-cat="${encodeURIComponent(vendor.category)}" data-driver-id="${safeProfileId}" data-driver-name="${escapeHtmlStr(vendor.name || 'el distribuidor seleccionado')}"><i class="fa-solid fa-cart-plus"></i> Solicitar Pedido</button></div></div>`;
    if (index === adInsertAfterIndex && typeof window.getAdSenseFeedMarkup === 'function') html += window.getAdSenseFeedMarkup('vendors');
  });
  container.innerHTML = html; if (typeof window.activateAdSenseIn === 'function') window.activateAdSenseIn(container);
}
document.addEventListener('notigas_ads_config_ready', () => renderVendorCards('TODOS'));
function abrirChatSoporteOficial() { showToast('Próximamente', 'El chat de soporte estará disponible pronto.', 'info'); }
async function eliminarFichaAdmin(vendorId) {
  if (!window.supabaseClient || !vendorId) return;
  const rowId = String(vendorId).replace(/^driver_/, '');
  const { data, error } = await window.supabaseClient.from('choferes_habilitados').select('user_id, nombre_completo').eq('id', rowId).maybeSingle();
  if (error || !data?.user_id) { console.error('No se pudo resolver la cuenta del repartidor:', error); if (typeof showToast === 'function') showToast('❌ Error', 'No se encontró la cuenta real del repartidor.', 'error', 4500); return; }
  if (typeof window.borrarRepartidorPermanente === 'function') await window.borrarRepartidorPermanente(vendorId, data.user_id, data.nombre_completo || 'Repartidor');
}
function getIconForCategory(cat) {
  if (!cat) return '📦'; const c = cat.toLowerCase();
  if (c.includes('gas')) return '🔥'; if (c.includes('agua')) return '💧'; if (c.includes('chatarra')) return '♻️'; if (c.includes('papel')) return '📄';
  if (c.includes('frutas') || c.includes('verduras')) return '🍎'; if (c.includes('detergente') || c.includes('limpieza')) return '🧼'; if (c.includes('carbón') || c.includes('leña')) return '🪵'; return '📦';
}

let _directDistributorTarget = null;
let _directDistributorInstalled = false;
let _directDistributorTimer = null;
function instalarFlujoSolicitudDistribuidor() {
  if (_directDistributorInstalled || typeof window.seleccionarYPedirDirecto !== 'function') return;
  _directDistributorInstalled = true;
  const originalSeleccionar = window.seleccionarYPedirDirecto;
  const originalConfirmar = window.confirmarPedido;
  window.seleccionarYPedirDirecto = function(catNombre) {
    const source = document.activeElement;
    const driverId = source && source.dataset ? source.dataset.driverId : '';
    const driverName = source && source.dataset ? source.dataset.driverName : 'el distribuidor seleccionado';
    if (driverId) {
      const active = typeof AppState !== 'undefined' ? AppState.get('activeOrder') : null;
      if (active && active.id && !['entregado','cancelado'].includes(String(active.estado || '').toLowerCase())) { if (typeof showToast === 'function') showToast('Pedido activo', 'Primero termina o cancela tu pedido actual.', 'warning', 4500); return; }
      _directDistributorTarget = {driverId, driverName, category: catNombre};
      if (typeof switchTab === 'function') switchTab(0);
    } else _directDistributorTarget = null;
    return originalSeleccionar(catNombre);
  };
  window.confirmarPedido = async function() {
    const target = _directDistributorTarget;
    if (!target) return originalConfirmar();
    const selectCategoria = document.getElementById('selectCategoria');
    const inputCantidad = document.getElementById('inputCantidad');
    const inputCalle = document.getElementById('inputCallePrincipal');
    const inputTel = document.getElementById('inputTelefonoComprador') || document.getElementById('inputTelefono');
    const categoria = selectCategoria ? selectCategoria.value : target.category || 'gas';
    const cantidad = inputCantidad ? inputCantidad.value : '1';
    const calle = inputCalle ? inputCalle.value.trim() : '';
    const telefono = inputTel ? inputTel.value.trim() : '';
    const activePos = typeof window.getActiveUserLocation === 'function' ? window.getActiveUserLocation() : (typeof AppState !== 'undefined' ? AppState.get('userLocation') : null);
    const lat = Number(activePos ? (activePos.lat ?? activePos.latitude ?? window.currentGpsLat) : window.currentGpsLat);
    const lng = Number(activePos ? (activePos.lng ?? activePos.longitude ?? window.currentGpsLng) : window.currentGpsLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) { if (typeof showToast === 'function') showToast('📍 Ubicación GPS Requerida', 'Activa tu GPS antes de solicitar el pedido.', 'warning', 6000); return; }
    if (!window.supabaseClient) { if (typeof showToast === 'function') showToast('Error', 'El servidor no está disponible.', 'error', 3500); return; }
    const userId = typeof getAuthenticatedUserId === 'function' ? await getAuthenticatedUserId() : null;
    if (!userId) { if (typeof showToast === 'function') showToast('Inicia sesión', 'Debes iniciar sesión como comprador para solicitar un pedido.', 'warning', 4500); return; }
    const currentCity = typeof AppState !== 'undefined' ? (AppState.get('city') || '') : '';
    showLoadingOverlay('Enviando solicitud al distribuidor...');
    try {
      const {data, error} = await window.supabaseClient.rpc('rpc_request_order_to_driver', {p_driver_id: target.driverId, p_categoria: categoria, p_titulo: `Pedido de ${categoria}`, p_cantidad: cantidad ? `${cantidad} un` : '1 un', p_direccion: calle || 'Ubicación GPS indicada en el mapa', p_telefono: telefono || null, p_ciudad: currentCity, p_barrio_otb: null, p_latitude: lat, p_longitude: lng});
      hideLoadingOverlay();
      if (error) { console.error('[NOTIGAS] Error en solicitud dirigida:', error); if (typeof showToast === 'function') showToast('No se pudo enviar', error.message || 'El distribuidor no está disponible.', 'error', 5000); return; }
      const order = data; order.user_id = userId; order.timestamp = Date.now(); AppState.set('activeOrder', order); closePedidoModal(); _directDistributorTarget = null;
      if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus(); if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo(); if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
      if (typeof showToast === 'function') showToast('📨 Solicitud enviada', `${target.driverName} tiene 30 segundos para responder.`, 'success', 5000);
      clearTimeout(_directDistributorTimer);
      _directDistributorTimer = setTimeout(async () => {
        try {
          const {error: expandError} = await window.supabaseClient.rpc('rpc_expand_expired_driver_requests'); if (expandError) throw expandError;
          const {data: refreshed, error: refreshError} = await window.supabaseClient.from('pedidos').select('id, estado, driver_id, requested_driver_id, driver_request_status').eq('id', order.id).maybeSingle(); if (refreshError) throw refreshError;
          if (refreshed && !refreshed.driver_id && refreshed.driver_request_status === 'expanded') {
            const current = AppState.get('activeOrder') || {}; AppState.set('activeOrder', {...current, ...refreshed, driver_request_status: 'expanded'});
            if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
            if (typeof showToast === 'function') showToast('🔎 Búsqueda ampliada', `No hubo respuesta de ${target.driverName}. Estamos buscando otro repartidor disponible en tu zona.`, 'warning', 8000);
            if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo(); if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
          }
        } catch (e) { console.warn('[NOTIGAS] No se pudo ampliar automáticamente la búsqueda:', e); }
      }, 30000);
    } catch (e) { hideLoadingOverlay(); console.error('[NOTIGAS] Error inesperado en solicitud dirigida:', e); if (typeof showToast === 'function') showToast('Error', 'No se pudo registrar la solicitud.', 'error', 4500); }
  };
}
document.addEventListener('notigas_auth_ready', instalarFlujoSolicitudDistribuidor);
document.addEventListener('supabase_ready', instalarFlujoSolicitudDistribuidor);
window.addEventListener('load', instalarFlujoSolicitudDistribuidor);
setTimeout(instalarFlujoSolicitudDistribuidor, 0);
