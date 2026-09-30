/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */
const defaultVendorsList = [];

const NOTIGAS_LIVE_DRIVER_RADIUS_KM = 10;
let _liveDriverFallbackTimer = null;
let _liveDriverFallbackBusy = false;

function getBuyerMapPosition() {
  const active = typeof window.getActiveUserLocation === 'function' ? window.getActiveUserLocation() : null;
  const lat = Number(active?.lat ?? active?.latitude ?? (typeof AppState !== 'undefined' ? AppState.get('gpsLat') : null) ?? window.currentGpsLat);
  const lng = Number(active?.lng ?? active?.longitude ?? (typeof AppState !== 'undefined' ? AppState.get('gpsLng') : null) ?? window.currentGpsLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLiveDriverFallbackContainer() {
  const tab = document.getElementById('tab0');
  if (!tab) return null;
  let container = document.getElementById('noLiveDriversFallback');
  if (!container) {
    container = document.createElement('section');
    container.id = 'noLiveDriversFallback';
    container.setAttribute('aria-live', 'polite');
    container.style.cssText = 'display:none;margin:12px 10px 20px;padding:16px;background:#0F172A;border:1px solid #334155;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.25);';
    const map = document.getElementById('map');
    if (map && map.parentNode === tab) map.insertAdjacentElement('afterend', container);
    else tab.appendChild(container);
  }
  return container;
}

function hideLiveDriverFallback() {
  const container = getLiveDriverFallbackContainer();
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function renderLiveDriverFallback(vendors) {
  const container = getLiveDriverFallbackContainer();
  if (!container) return;
  const list = Array.isArray(vendors) ? vendors.slice(0, 8) : [];
  const safe = typeof escapeHtmlStr === 'function' ? escapeHtmlStr : (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  const cards = list.map(vendor => {
    const driverId = safe(String(vendor.driverProfileId || String(vendor.id || '').replace(/^driver_/, '')));
    const name = safe(vendor.name || 'Distribuidor registrado');
    const category = safe(vendor.category || 'plastico');
    const products = safe(vendor.products || 'Servicios de reparto a domicilio');
    const zones = safe(vendor.zones || 'Zona local');
    // Sin precio en la tarjeta: NOTIGAS no intermedia fondos ni precios.
    return `<article style="background:#1E293B;border:1px solid #334155;border-radius:12px;padding:11px;margin-top:8px;"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div><strong style="color:#F8FAFC;font-size:13px;">${name}</strong><div style="color:#94A3B8;font-size:11px;margin-top:2px;">${category}</div></div><span style="font-size:10px;color:#86EFAC;font-weight:800;">REGISTRADO</span></div><div style="color:#CBD5E1;font-size:11px;margin-top:6px;">📦 ${products}</div><div style="color:#CBD5E1;font-size:11px;margin-top:3px;">🗺️ ${zones}</div><button type="button" class="btn-vendor-order" style="width:100%;margin-top:9px;" data-action="seleccionarYPedirDirecto" data-cat="${encodeURIComponent(vendor.category || 'plastico')}" data-driver-id="${driverId}" data-driver-name="${name}"><i class="fa-solid fa-cart-plus"></i> Solicitar Pedido</button></article>`;
  }).join('');

  container.innerHTML = `<div style="text-align:center;"><div style="font-size:25px;margin-bottom:5px;">🚚</div><strong style="display:block;color:#F8FAFC;font-size:14px;">No hay repartidores en vivo en tu zona en este momento.</strong><p style="margin:6px 0 10px;color:#CBD5E1;font-size:12px;line-height:1.45;">Pero puedes dejar tu pedido a estos distribuidores registrados y te contactarán en breve.</p></div><div>${cards || '<div style="text-align:center;color:#94A3B8;font-size:12px;padding:10px 0;">No hay distribuidores registrados disponibles en esta zona.</div>'}</div>`;
  container.style.display = 'block';
}

async function actualizarFallbackRepartidoresEnVivo() {
  if (_liveDriverFallbackBusy || !window.supabaseClient) return;
  const tab = document.getElementById('tab0');
  if (!tab || !tab.classList.contains('active')) {
    hideLiveDriverFallback();
    return;
  }
  const position = getBuyerMapPosition();
  if (!position) return;

  _liveDriverFallbackBusy = true;
  try {
    const city = typeof AppState !== 'undefined' ? (AppState.get('city') || '').trim().toLowerCase() : '';
    const cityKeys = city && typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(city) : (city ? [city] : []);
    let query = window.supabaseClient.from('rutas_repartidores_publicas').select('id,user_id,latitude,longitude,last_active,ciudad').gte('last_active', new Date(Date.now() - 10 * 60000).toISOString()).limit(100);
    if (cityKeys.length) query = query.in('ciudad', cityKeys);
    const { data, error } = await query;
    if (error) throw error;

    const liveNearby = (data || []).filter(route => {
      const lat = Number(route.latitude);
      const lng = Number(route.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && distanciaKm(position.lat, position.lng, lat, lng) <= NOTIGAS_LIVE_DRIVER_RADIUS_KM;
    });

    if (liveNearby.length > 0) {
      hideLiveDriverFallback();
      return;
    }

    if (!(AppState.get('notigas_vendors_directory') || []).length) {
      await descargarChoferesYRenderizar('TODOS');
    }
    renderLiveDriverFallback(getStoredVendors());
  } catch (error) {
    console.warn('[NOTIGAS] No se pudo determinar si existen repartidores en vivo:', error);
  } finally {
    _liveDriverFallbackBusy = false;
  }
}

function iniciarFallbackRepartidoresEnVivo() {
  clearInterval(_liveDriverFallbackTimer);
  actualizarFallbackRepartidoresEnVivo();
  _liveDriverFallbackTimer = setInterval(actualizarFallbackRepartidoresEnVivo, 15000);
}

async function descargarChoferesYRenderizar(cat = 'TODOS') {
  if (!window.supabaseClient) { renderVendorCards(cat); return; }
  const city = AppState.get('city');
  if (!city) { renderVendorCards(cat); return; }
  try {
    const cityNormalized = city.trim().toLowerCase();
    const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(cityNormalized) : [cityNormalized];
    const { data, error } = await window.supabaseClient.from('choferes_publicos')
      .select('id, nombre_completo, categoria, ciudad, telefono, descripcion, foto_url, estado_verificacion, created_at, color_camion')
      .in('ciudad', cityKeys);
    if (error) {
      console.error('Error descargando choferes desde choferes_publicos:', error);
      AppState.set('notigas_vendors_directory', []);
    } else if (data && data.length > 0) {
      const list = data.filter(d => !d.estado_verificacion || d.estado_verificacion === 'aprobado').map(d => {
        // La categoria puede traer varios materiales separados por coma. La
        // tarjeta muestra el primero, y el filtro de abajo acepta cualquiera.
        const catList = (typeof window.normalizeCategoryList === 'function')
          ? window.normalizeCategoryList(d.categoria)
          : [];
        const catPrincipal = catList.length ? catList[0] : (d.categoria || 'plastico');
        return {
          id: `driver_${d.id}`, driverProfileId: d.id, name: d.nombre_completo,
          category: catPrincipal,
          categoryList: catList,
          icon: typeof getIconForCategory === 'function' ? getIconForCategory(catPrincipal) : '🚛',
          plate: d.placa || 'Placa registrada', products: d.productos || 'Materiales reciclables',
          zones: d.zonas || 'zona local', schedule: d.schedule || 'Lunes a Sábado',
          color_camion: d.color_camion || '',
          active: true
        };
      });
      AppState.set('notigas_vendors_directory', list);
    } else AppState.set('notigas_vendors_directory', []);
  } catch (e) { console.error('Error fetching local drivers:', e); }
  renderVendorCards(cat);
}

document.addEventListener('notigas_auth_ready', () => {
  const tab1 = document.getElementById('tab1');
  if (tab1 && tab1.classList.contains('active')) descargarChoferesYRenderizar('TODOS');
  instalarFlujoSolicitudDistribuidor();
  iniciarFallbackRepartidoresEnVivo();
});
document.addEventListener('supabase_ready', iniciarFallbackRepartidoresEnVivo);
window.addEventListener('load', iniciarFallbackRepartidoresEnVivo);

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
  // El filtro debe considerar TODOS los materiales del recolector: si marca
  // plastico y papel, aparece al filtrar por cualquiera de los dos.
  const catFiltro = String(filterCat || '').toLowerCase().trim();
  const filtered = (!catFiltro || catFiltro === 'todos')
    ? allVendors
    : allVendors.filter(v => {
      const cats = (Array.isArray(v.categoryList) && v.categoryList.length) ? v.categoryList : [String(v.category || '').toLowerCase()];
      return cats.some(c => String(c).toLowerCase() === catFiltro);
    });
  let html = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#94A3B8;padding:40px 14px;font-size:13px;background:#1E293B;border-radius:14px;border:1px dashed rgba(255,255,255,.15);margin-top:14px;"><i class="fa-solid fa-store-slash" style="font-size:32px;color:#FF6D00;margin-bottom:10px;"></i><br><strong>Aún no hay Fichas de Recolectores registradas en esta categoría.</strong><br><span style="font-size:11px;color:#64748B;">¿Eres recolector? Registra tu ficha de negocio gratis y conéctate con los vecinos de tu zona.</span><br><br><button class="btn-driver" style="margin:0 auto;padding:10px 16px;font-size:12px;" data-action="abrirModalDriver">🚚 Publicar Mi Mini Página de Negocio</button></div>`;
    const adMarkup = typeof window.getAdSenseFeedMarkup === 'function' ? window.getAdSenseFeedMarkup('vendors') : ''; if (adMarkup) container.insertAdjacentHTML('afterbegin', adMarkup); return;
  }
  const adInsertAfterIndex = Math.max(0, Math.ceil(filtered.length / 2) - 1);
  filtered.forEach((vendor, index) => {
    const safeVendorId = escapeHtmlStr(vendor.id || '');
    const safeProfileId = escapeHtmlStr(String(vendor.driverProfileId || String(vendor.id || '').replace(/^driver_/, '')));
    const safeVendorIcon = typeof window.crearAvatarCamionChoferHtml === 'function' ? window.crearAvatarCamionChoferHtml(vendor.name, {category: vendor.category, color: vendor.color_camion, es_premium: false}) : escapeHtmlStr(vendor.icon || getIconForCategory(vendor.category));
    // La ficha no muestra precios: el acuerdo es directo entre las partes.
    const etiquetaMateriales = (function () {
      const cats = (Array.isArray(vendor.categoryList) && vendor.categoryList.length) ? vendor.categoryList : [vendor.category];
      const bo = window.NOTIGAS_BO;
      return cats.map((c) => {
        const item = bo && typeof bo.categoriaPorCodigo === 'function' ? bo.categoriaPorCodigo(c) : null;
        return (item && item.etiqueta) ? item.etiqueta : String(c || '');
      }).filter(Boolean).join(' • ');
    })();
    html += `<div class="vendor-fb-card"><div class="vendor-fb-header"><div class="vendor-profile"><div class="vendor-avatar" style="background:transparent;border:none;width:auto;height:auto;padding:0;overflow:visible;">${safeVendorIcon}</div><div class="vendor-meta"><span class="vendor-name">${escapeHtmlStr(vendor.name)}</span><span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${escapeHtmlStr(etiquetaMateriales)}</span></div></div><div style="display:flex;align-items:center;gap:6px;">${isAdmin ? `<button data-action="eliminarFichaAdmin" data-id="${safeVendorId}" style="background:#D32F2F;color:white;border:none;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="promo-badge" style="background:rgba(0,230,118,.15);color:#00E676;border-color:rgba(0,230,118,.4);">RECOLECTOR ACTIVO</span>`}</div></div><div class="vendor-fb-body"><div class="vendor-field"><strong>⭐ Calificación:</strong> Sin calificaciones todavía</div><div class="vendor-field"><strong>📦 Productos:</strong> ${escapeHtmlStr(vendor.products)}</div><div class="vendor-field"><strong>🗺️ Zona de cobertura:</strong> ${escapeHtmlStr(vendor.zones)}</div></div><div class="vendor-fb-footer"><button class="btn-vendor-order" data-action="seleccionarYPedirDirecto" data-cat="${encodeURIComponent(vendor.category)}" data-driver-id="${safeProfileId}" data-driver-name="${escapeHtmlStr(vendor.name || 'el recolector seleccionado')}"><i class="fa-solid fa-cart-plus"></i> Solicitar Pedido</button></div></div>`;
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
/* Icono de la categoria. Resuelve contra el catalogo canonico cuando esta
   disponible y solo entonces cae a los textos heredados. */
function getIconForCategory(cat) {
  if (!cat) return '📦';
  const c = String(cat).toLowerCase().trim();
  const bo = window.NOTIGAS_BO;
  if (bo && typeof bo.categoriaPorCodigo === 'function') {
    const found = bo.CATEGORIAS_POR_CODIGO[c];
    if (found) return found.icono;
  }
  if (c.includes('chatarra') || c.includes('metal')) return '⚙️';
  if (c.includes('papel') || c.includes('carton') || c.includes('cartón')) return '📄';
  if (c.includes('botella') || c.includes('vidrio')) return '🥤';
  if (c.includes('organico') || c.includes('orgánico')) return '🌿';
  if (c.includes('plastico') || c.includes('plástico')) return '♻️';
  if (c.includes('detergente') || c.includes('limpieza')) return '🧽';
  // Categorias retiradas (agua, frutas, sal, afilado, gas, carbon): sin icono
  // propio, para no sugerir un material que NOTIGAS ya no maneja.
  return '📦';
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
    const categoria = (selectCategoria && selectCategoria.value)
      ? selectCategoria.value
      : ((target.category && String(target.category).toLowerCase()) || 'plastico');
    const cantidad = inputCantidad ? inputCantidad.value.trim() : '1 unidad';
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