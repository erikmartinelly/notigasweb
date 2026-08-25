/* ==========================================================================

   NOTIGAS - MÓDULO DE ADMINISTRACIÓN, ADSENSE, MODERACIÓN & BANEOS

   ========================================================================== */

// La lista quemada de emails ha sido eliminada. La validación se hace contra Supabase `admin_credentials`.
const ADMIN_SESSION_MAX_MS = 30 * 60 * 1000;
const _ADMIN_AD_TABLE = window.NOTIGAS?.AD_TABLE || 'anuncios_globales';
const _ADMIN_NOTICE_TABLE = window.NOTIGAS?.NOTICE_TABLE || 'avisos';
const _ADMIN_AD_PLACEMENTS = window.NOTIGAS?.AD_PLACEMENTS || Object.freeze({
  MAPA: 'mapa',
  REPARTIDORES: 'repartidores',
  MURO_AVISOS: 'muro_avisos'
});

function normalizeAdPlacement(value) {
  const normalized = String(value || _ADMIN_AD_PLACEMENTS.MAPA).toLowerCase().trim();
  // Compatibilidad transitoria con registros anteriores a la migración 092.
  if (normalized === 'avisos') return _ADMIN_AD_PLACEMENTS.MURO_AVISOS;
  if (Object.values(_ADMIN_AD_PLACEMENTS).includes(normalized)) return normalized;
  return _ADMIN_AD_PLACEMENTS.MAPA;
}

window.getVerifiedAdminEmail = async function() {
  try {
    if (!window.supabaseClient?.auth) return null;

    // Toda escritura administrativa debe estar respaldada por una sesión JWT vigente.
    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
    const email = String(authData?.user?.email || '').toLowerCase().trim();
    if (authError || !email) throw new Error('La sesión de administrador expiró. Inicia sesión nuevamente.');

    const { data: adminData, error: adminError } = await window.supabaseClient
      .from('admin_credentials')
      .select('email')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (adminError || !adminData) throw new Error('La cuenta autenticada no tiene permisos de administrador.');

    window._verifiedAdminEmail = email;
    window._adminVerificationError = '';
    if (typeof AppState !== 'undefined') AppState.set('isAdmin', true);
    return email;
  } catch(e) { 
    console.warn('Error obteniendo email de admin:', e);
    window._verifiedAdminEmail = null;
    window._adminVerificationError = e?.message || 'No se pudo validar la sesión administrativa.';
    if (typeof AppState !== 'undefined') AppState.set('isAdmin', false);
    return null; 
  }
};

window.abrirModalAdminDashboard = async function() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();

  const modalAdmin = document.getElementById('modalAdmin');
  if (!modalAdmin) return;

  if (!window.supabaseClient) {
    if (typeof showToast === 'function') {
      showToast('Error', 'Sin conexión con el servidor Supabase.', 'error', 3000);
    } else {
      alert('Sin conexión con el servidor.');
    }
    return;
  }

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Verificando credenciales de administrador...');

  try {
    const email = await window.getVerifiedAdminEmail();

    if (!email) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') {
        showToast('Acceso Restringido', 'Debes iniciar sesión con tu cuenta de Administrador.', 'warning', 4500);
      } else {
        alert('Debes iniciar sesión con tu cuenta de Administrador.');
      }
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
      return;
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    // Administrador verificado
    modalAdmin.style.display = 'flex';
    if (typeof switchModalTab === 'function') switchModalTab(0);
    if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();

  } catch (e) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error('Error al abrir panel de admin:', e);
    if (typeof showToast === 'function') {
      showToast('Error', 'No se pudieron verificar las credenciales de administrador.', 'error', 4000);
    }
  }
};

function cerrarSesionRepartidorActivarComprador() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🔄', '¿Cambiar a Modo Comprador?', 'Tu ficha de negocio se mantendrá guardada. Solo se cambiará tu modo de ingreso.', 'Sí, cambiar', () => {
      AppState.set('userData', null);
      AppState.set('driverGpsLive', 'off');
      if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
      if (typeof setAppMode === 'function') setAppMode('buyer');
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
      if (typeof showToast === 'function') showToast('🛒 Modo Comprador', 'Modo Repartidor cerrado. Puedes ingresar como Comprador.', 'info', 2000);
    });
  }
}

let adminLoginAttempts = 0;

/* GESTIÓN DEL MODAL EXCLUSIVO DE ADMINISTRADOR */

function closeAdminModal() {
  const modalAdmin = document.getElementById('modalAdmin');
  if (modalAdmin) modalAdmin.style.display = 'none';

  // Restaurar el manejador de Google general
  if (typeof initGoogleOneTap === 'function') {
    initGoogleOneTap();
  }
}

function activarMapaCalorAdminLive() {
  closeAdminModal();

  if (typeof switchTab === 'function') switchTab(0);

  window.isHeatmapActive = true;

  if (typeof renderHeatmapOverlay === 'function') renderHeatmapOverlay();

  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  const btn = document.getElementById('auto-event-64') || document.getElementById('btnDriverHeatmap');

  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ❌ SALIR MAPA DE CALOR';

    btn.style.background = 'linear-gradient(135deg, #D32F2F, #B71C1C)';

  }

  if (typeof showToast === 'function') showToast('🔥 Monitor Admin', 'Visualizando pedidos en vivo y zonas de concentración en mapa.', 'info', 2000);
}

function switchModalTab(idx) {
  document.querySelectorAll('.modal-tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));

  document.querySelectorAll('.modal-tab-pane').forEach((pane, i) => pane.classList.toggle('active', i === idx));

  if (idx === 0) renderAdminDashboardKPIs();

  if (idx === 1) renderAdminVendorsList();

  if (idx === 2) renderAdminOrdersList();

  if (idx === 3) {
    cargarConfiguracionPublicidadEnAdmin();
    renderAdminAdsAndPostsList();
  }

  if (idx === 4) {
    renderAdminAvisosFeedList();
  }

  if (idx === 5) renderAdminReports();
}

window.adminActivePromoTab = 'mapa';
window.pendingUploadUrls = {
  mapa: null,
  repartidores: null,
  muro_avisos: null
};

window.switchPromoSubTab = function(tabName) {
  const normTab = normalizeAdPlacement(tabName);
  window.adminActivePromoTab = normTab;

  const btnMapa = document.getElementById('btnPromoSubTabMapa');
  const btnRepartidores = document.getElementById('btnPromoSubTabRepartidores');
  const btnMuroAvisos = document.getElementById('btnPromoSubTabMuroAvisos');

  const paneMapa = document.getElementById('promoSubPaneMapa');
  const paneRepartidores = document.getElementById('promoSubPaneRepartidores');
  const paneMuroAvisos = document.getElementById('promoSubPaneMuroAvisos');

  if (btnMapa) {
    btnMapa.style.background = (normTab === 'mapa') ? '#FF6D00' : 'transparent';
    btnMapa.style.color = (normTab === 'mapa') ? 'white' : '#94A3B8';
    btnMapa.classList.toggle('active', normTab === 'mapa');
  }
  if (btnRepartidores) {
    btnRepartidores.style.background = (normTab === 'repartidores') ? '#00E676' : 'transparent';
    btnRepartidores.style.color = (normTab === 'repartidores') ? '#0F172A' : '#94A3B8';
    btnRepartidores.classList.toggle('active', normTab === 'repartidores');
  }
  if (btnMuroAvisos) {
    btnMuroAvisos.style.background = (normTab === 'muro_avisos') ? '#F59E0B' : 'transparent';
    btnMuroAvisos.style.color = (normTab === 'muro_avisos') ? '#0F172A' : '#94A3B8';
    btnMuroAvisos.classList.toggle('active', normTab === 'muro_avisos');
  }

  if (paneMapa) paneMapa.style.display = (normTab === 'mapa') ? 'block' : 'none';
  if (paneRepartidores) paneRepartidores.style.display = (normTab === 'repartidores') ? 'block' : 'none';
  if (paneMuroAvisos) paneMuroAvisos.style.display = (normTab === 'muro_avisos') ? 'block' : 'none';
};

function normalizeAdCity(city) {
  const norm = String(city || 'cochabamba').toLowerCase().trim();
  if (!norm || ['', 'todas', 'todos', 'all', 'todas las ciudades', 'todas_las_ciudades', 'nacional', 'global'].includes(norm)) {
    return 'global';
  }
  return norm;
}

async function cargarConfiguracionPublicidadEnAdmin(targetCity = null) {
  const citySelector = document.getElementById('adminSelectPromoCiudad');
  const rawCity = targetCity || (citySelector ? citySelector.value : null) || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba') || 'cochabamba';
  if (!window.supabaseClient) return;

  try {
    const normCity = normalizeAdCity(rawCity);
    const citiesToQuery = (normCity && normCity !== 'global') ? [normCity, 'global'] : ['global'];

    let { data, error } = await window.supabaseClient
      .from(_ADMIN_AD_TABLE)
      .select('id, titulo, url, image_url, activo, posicion, ciudad')
      .in('ciudad', citiesToQuery)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const cityAds = data.filter(a => String(a.ciudad || '').toLowerCase().trim() === normCity);
      const globalAds = data.filter(a => String(a.ciudad || '').toLowerCase().trim() === 'global');

      const positions = Object.values(_ADMIN_AD_PLACEMENTS);
      positions.forEach(pos => {
        // Prioridad 1: Configuración específica para esta ciudad
        let ad = cityAds.find(a => normalizeAdPlacement(a.posicion) === pos);
        // Fallback: Si no tiene configuración para esta ciudad y no es 'global', mostrar la global como base
        if (!ad && normCity !== 'global') {
          ad = globalAds.find(a => normalizeAdPlacement(a.posicion) === pos);
        }

        const inputTitle = document.getElementById(`inputPromoText_${pos}`);
        const inputUrl = document.getElementById(`inputPromoUrl_${pos}`);
        const selectState = document.getElementById(`selectPromoState_${pos}`);
        const preview = document.getElementById(`promoImagePreview_${pos}`);
        const previewBox = document.getElementById(`promoImagePreviewBox_${pos}`);

        if (ad) {
          if (inputTitle) inputTitle.value = ad.titulo || '';
          if (inputUrl) inputUrl.value = ad.url || '';
          if (selectState) selectState.value = (ad.activo === false) ? 'inactivo' : 'activo';
          if (ad.image_url && preview && previewBox) {
            preview.src = ad.image_url;
            previewBox.style.display = 'flex';
            window.pendingUploadUrls[pos] = ad.image_url;
          } else {
            if (preview) preview.src = '';
            if (previewBox) previewBox.style.display = 'none';
            window.pendingUploadUrls[pos] = null;
          }
        } else {
          if (inputTitle) inputTitle.value = '';
          if (inputUrl) inputUrl.value = '';
          if (selectState) selectState.value = 'activo';
          if (preview) preview.src = '';
          if (previewBox) previewBox.style.display = 'none';
          window.pendingUploadUrls[pos] = null;
        }
      });
    }
  } catch(e) {
    console.warn('Error precargando propaganda local en admin:', e);
  }
}

// Listener para recargar inputs al cambiar la ciudad en el panel admin
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'adminSelectPromoCiudad') {
    cargarConfiguracionPublicidadEnAdmin(e.target.value);
    if (typeof renderAdminAdsAndPostsList === 'function') {
      renderAdminAdsAndPostsList();
    }
  }
});

async function renderAdminAdsAndPostsList() {
  const container = document.getElementById('adminPromoListContainer');
  if (!container || !window.supabaseClient) return;

  container.innerHTML = '<div style="color:#94A3B8; text-align:center;">Cargando...</div>';
  let html = '';
  let count = 0;

  const citySelector = document.getElementById('adminSelectPromoCiudad');
  const activeCity = citySelector ? citySelector.value : (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba');
  const normCity = activeCity ? String(activeCity).toLowerCase().trim() : 'cochabamba';
  
  // 1. Anuncios Locales por Pestaña
  let adsQuery = window.supabaseClient
    .from(_ADMIN_AD_TABLE)
    .select('id, titulo, url, image_url, ciudad, posicion, activo, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
    
  if (normCity && normCity !== 'todos' && normCity !== 'all') {
    adsQuery = adsQuery.eq('ciudad', normCity);
  }

  const { data: adData, error: adsError } = await adsQuery;
  if (adsError) { console.error('Error cargando anuncios_globales:', adsError); return; }

  if (adData && adData.length > 0) {
    adData.forEach(ad => {
      count++;
      const pos = normalizeAdPlacement(ad.posicion);
      let posBadge = '🗺️ 1ª MAPA (Banner)';
      let badgeBg = 'rgba(56,189,248,0.2)';
      let badgeColor = '#38BDF8';

      if (pos === 'repartidores') {
        posBadge = '🚚 2ª REPARTIDORES (Feed)';
        badgeBg = 'rgba(0,230,118,0.2)';
        badgeColor = '#00E676';
      } else if (pos === 'muro_avisos') {
        posBadge = '📢 3ª ANUNCIO EN AVISOS (Muro)';
        badgeBg = 'rgba(245,158,11,0.2)';
        badgeColor = '#F59E0B';
      }

      const estadoText = (ad.activo !== false) ? '🟢 ACTIVO' : '🔴 DESACTIVADO';

      html += `
        <div style="background:#1E293B; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="background:${badgeBg}; color:${badgeColor}; font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px;">${posBadge}</span>
              <strong style="color:white; font-size:11px;">📍 ${window.escapeHtmlStr(String(ad.ciudad || '').toUpperCase())}</strong>
              <span style="font-size:9.5px; color:#94A3B8;">${estadoText}</span>
            </div>
            <button data-action="borrarAnuncioLocalAdmin" data-id="${ad.id}" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>
          </div>
          <div style="font-size:11px; color:#E2E8F0; margin-top:6px; line-height:1.35;">
            <strong>Título:</strong> ${window.escapeHtmlStr(ad.titulo || '')}<br>
            ${ad.url ? `<strong>Enlace:</strong> <a href="${window.escapeHtmlStr(ad.url)}" target="_blank" rel="noopener noreferrer" style="color:#38BDF8; text-decoration:underline;">${window.escapeHtmlStr(ad.url)}</a><br>` : ''}
            ${ad.image_url ? `<strong>Imagen:</strong> <span style="color:#00E676;">Sí (Cargada)</span>` : ''}
          </div>
        </div>
      `;
    });
  }

  if (count === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic; font-size:11px; text-align:center; padding:12px;">No hay anuncios registrados para esta ciudad.</div>';
    return;
  }

  container.innerHTML = html;
}

async function renderAdminDashboardKPIs() {
  const elUsers = document.getElementById('adminKpiUsers');
  const elVendors = document.getElementById('adminKpiVendors');
  const elOrders = document.getElementById('adminKpiOrders');
  const elDelivered = document.getElementById('adminKpiDelivered');
  const elCancelled = document.getElementById('adminKpiCancelled');
  const elAvisos = document.getElementById('adminKpiAvisos');
  const elReports = document.getElementById('adminKpiReports');
  const elReportedUsers = document.getElementById('adminKpiReportedUsers');

  let usersCount = 0;
  let vendorsCount = 0;
  let ordersCount = 0;
  let deliveredCount = 0;
  let cancelledCount = 0;
  let avisosCount = 0;
  let reportsCount = 0;
  let reportedEntitiesCount = 0;

  if (window.supabaseClient) {
    try {
      // 1. Intentar RPC optimizado de métricas administrativas
      const { data: rpcMetrics, error: rpcErr } = await window.supabaseClient.rpc('rpc_admin_get_metrics');

      if (!rpcErr && rpcMetrics && rpcMetrics.ok) {
        usersCount = rpcMetrics.users_count || 0;
        vendorsCount = rpcMetrics.vendors_count || 0;
        ordersCount = rpcMetrics.orders_active || 0;
        deliveredCount = rpcMetrics.orders_delivered || 0;
        cancelledCount = rpcMetrics.orders_cancelled || 0;
        avisosCount = rpcMetrics.avisos_count || 0;
        reportsCount = rpcMetrics.reports_count || 0;
        reportedEntitiesCount = rpcMetrics.reported_entities_count || 0;
      } else {
        // 2. Fallback de consultas directas agregadas en PostgreSQL
        const [
          resVendors,
          resProfiles,
          resActiveOrders,
          resDeliveredOrders,
          resCancelledOrders,
          resAvisos,
          resReports,
          resDenunciasRows
        ] = await Promise.all([
          window.supabaseClient.from('choferes_habilitados').select('*', { count: 'exact', head: true }).eq('estado_verificacion', 'aprobado'),
          window.supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
          window.supabaseClient.from('pedidos').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'visto', 'asignado']),
          window.supabaseClient.from('pedidos').select('*', { count: 'exact', head: true }).in('estado', ['entregado', 'recibido']),
          window.supabaseClient.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'cancelado'),
          window.supabaseClient.from(_ADMIN_NOTICE_TABLE).select('*', { count: 'exact', head: true }),
          window.supabaseClient.from('denuncias').select('*', { count: 'exact', head: true }),
          window.supabaseClient.from('denuncias').select('denunciado_id, user_id')
        ]);

        vendorsCount = resVendors.count || 0;
        usersCount = resProfiles.count || 0;
        ordersCount = resActiveOrders.count || 0;
        deliveredCount = resDeliveredOrders.count || 0;
        cancelledCount = resCancelledOrders.count || 0;
        avisosCount = resAvisos.count || 0;
        reportsCount = resReports.count || 0;

        if (resDenunciasRows && resDenunciasRows.data) {
          const uniqueReported = new Set();
          resDenunciasRows.data.forEach(d => {
            const target = (d.denunciado_id || d.user_id || '').trim();
            if (target) uniqueReported.add(target);
          });
          reportedEntitiesCount = uniqueReported.size;
        }
      }
    } catch(e) {
      console.error('Error cargando KPIs agregados del dashboard de administración:', e);
    }
  }

  if (elUsers) elUsers.innerText = usersCount;
  if (elVendors) elVendors.innerText = vendorsCount;
  if (elOrders) elOrders.innerText = ordersCount;
  if (elDelivered) elDelivered.innerText = deliveredCount;
  if (elCancelled) elCancelled.innerText = cancelledCount;
  if (elAvisos) elAvisos.innerText = avisosCount;
  if (elReports) elReports.innerText = reportsCount;
  if (elReportedUsers) elReportedUsers.innerText = reportedEntitiesCount;
}

async function emitirAlertaOficialAdmin(mensaje) {
  const input = document.getElementById('inputAdminBroadcastMsg');
  const texto = String(mensaje || input?.value || '').trim();
  const ciudad = (typeof AppState !== 'undefined') ? AppState.get('city') : null;

  if (!texto) {
    if (typeof showToast === 'function') showToast('⚠️ Texto Requerido', 'Ingresa el texto de la Alerta Oficial OTB.', 'warning', 2000);
    return;
  }

  if (!ciudad) {
    if (typeof showToast === 'function') showToast('⚠️ Ciudad Requerida', 'No hay ciudad activa seleccionada.', 'warning', 2000);
    return;
  }

  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'Sin conexión a Supabase.', 'error', 3000);
    return;
  }

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Transmitiendo comunicado oficial...');

  try {
    const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
    const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : (userData ? userData.id : null);

    const { data, error } = await window.supabaseClient
      .from(_ADMIN_NOTICE_TABLE)
      .insert({
        ciudad: ciudad,
        mensaje: texto,
        titulo: 'COMUNICADO OFICIAL',
        descripcion: texto,
        tipo: 'oficial',
        activo: true,
        user_id: localUserId
      })
      .select()
      .single();

    if (error) throw error;

    if (input) input.value = '';
    if (typeof showToast === 'function') showToast('📢 Comunicado Emitido', `Aviso oficial guardado en base de datos y transmitido a ${ciudad}.`, 'success', 3500);

    return data;
  } catch (err) {
    console.error('Error emitiendo alerta oficial admin:', err);
    if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo emitir la alerta oficial.', 'error', 4000);
  } finally {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

async function ejecutarPurgaBaseDeDatosManual() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🧹', '¿Ejecutar Purga de Base de Datos?', 'Se eliminarán de PostgreSQL pedidos mayores a 24h y avisos mayores a 24h, además de limpiar el caché local.', 'Sí, purgar BD', async () => {
      if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Ejecutando purga en PostgreSQL...');
      try {
        if (window.supabaseClient) {
          const { data, error } = await window.supabaseClient.rpc('rpc_purge_old_records');
          if (error) throw error;
        }

        if (typeof ejecutarPurgaBaseDeDatosAuto === 'function') {
          ejecutarPurgaBaseDeDatosAuto();
        }

        if (typeof renderAdminDashboardKPIs === 'function') {
          renderAdminDashboardKPIs();
        }

        if (typeof showToast === 'function') showToast('🧹 Purga Completada', 'Se ejecutó la purga en PostgreSQL y se liberó almacenamiento.', 'info', 3000);
      } catch (err) {
        console.error('Error ejecutando purga manual en PostgreSQL:', err);
        if (typeof showToast === 'function') showToast('Error en Purga', err.message || 'No se pudo completar la purga en la base de datos.', 'error', 4000);
      } finally {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      }
    });
  }
}

/* Alias: el botón "Restaurar Base de Datos por Defecto (Quitar Baneos)" del panel admin

   llama a restaurarBaseDatosPorDefecto(). Reutiliza limpiarTodosLosBaneosAdmin(). */

window.restaurarBaseDatosPorDefecto = function() {
  if (typeof limpiarTodosLosBaneosAdmin === 'function') {
    limpiarTodosLosBaneosAdmin();

  }
};

async function renderAdminVendorsList() {
  const container = document.getElementById('adminVendorsListContainer');

  if (!container) return;

  container.innerHTML = '<div style="color:#94A3B8; text-align:center; padding:16px;">Cargando usuarios y repartidores...</div>';

  let deletedIds = [];

  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');

    if (raw) deletedIds = JSON.parse(raw);

  } catch(e){}

  if (!window.supabaseClient) {
    renderFinalVendors([], deletedIds, []);
    return;
  }

  const [driversResult, usersResult] = await Promise.all([
    window.supabaseClient.from('choferes_habilitados').select('id, user_id, nombre_completo, categoria, placa, telefono_whatsapp, created_at').order('created_at', { ascending: false }).limit(100),
    window.supabaseClient.rpc('rpc_admin_list_users')
  ]);

  if (driversResult.error) console.error('Error cargando choferes_habilitados:', driversResult.error);
  if (usersResult.error) console.error('Error cargando usuarios administrativos:', usersResult.error);

  const users = Array.isArray(usersResult.data) ? usersResult.data : [];
  const usersById = new Map(users.map(user => [String(user.user_id || ''), user]));
  const defaultVendors = (driversResult.data || []).map(driver => {
    const linkedUser = usersById.get(String(driver.user_id || ''));
    return {
      id: `driver_${driver.id}`,
      user_id: driver.user_id,
      name: driver.nombre_completo,
      category: driver.categoria || 'Gas GLP',
      plate: driver.placa || 'Placa registrada',
      whatsapp: driver.telefono_whatsapp || '',
      is_banned: !!(linkedUser && linkedUser.is_banned)
    };
  });
  const buyersList = users
    .filter(user => !user.is_driver)
    .map(user => ({
      user_id: user.user_id,
      gmail: user.email || '',
      nombre: user.nombre || user.email || 'Usuario',
      role: user.role || 'vecino',
      is_banned: !!user.is_banned
    }));

  renderFinalVendors(defaultVendors, deletedIds, buyersList, usersResult.error);
}

function renderFinalVendors(defaultVendors, deletedIds, buyersList = [], usersLoadError = null) {
  const container = document.getElementById('adminVendorsListContainer');

  if (!container) return;

  const finalVendors = defaultVendors.filter(v => !deletedIds.includes(v.id));

  let html = `
    <div style="display:flex; gap:8px; margin-bottom: 12px;">
      <button onclick="document.getElementById('admin_view_vendors').style.display='block'; document.getElementById('admin_view_buyers').style.display='none'; this.style.background='#FF6D00'; document.getElementById('btn_toggle_buyers').style.background='#334155';" id="btn_toggle_vendors" style="flex:1; padding:8px; border-radius:6px; border:none; cursor:pointer; font-weight:800; font-size:11px; background:#FF6D00; color:white;"><i class="fa-solid fa-truck-fast"></i> REPARTIDORES</button>
      <button onclick="document.getElementById('admin_view_vendors').style.display='none'; document.getElementById('admin_view_buyers').style.display='block'; this.style.background='#38BDF8'; document.getElementById('btn_toggle_vendors').style.background='#334155';" id="btn_toggle_buyers" style="flex:1; padding:8px; border-radius:6px; border:none; cursor:pointer; font-weight:800; font-size:11px; background:#334155; color:white;"><i class="fa-solid fa-users"></i> COMPRADORES</button>
    </div>
  `;
  
  html += `<div id="admin_view_vendors">`;

  if (finalVendors.length === 0) {
    html += '<div style="color:#64748B; font-style:italic; font-size:10.5px; margin-bottom:8px;">No hay repartidores registrados.</div>';
  }

  finalVendors.forEach((v) => {
    const isBanned = v.is_banned || esRepartidorBaneado(v.name, v.plate, v.whatsapp, v.user_id);

    const safeName = encodeURIComponent(v.name || '').replace(/'/g, "%27");

    const safePlate = encodeURIComponent(v.plate || '').replace(/'/g, "%27");

    html += `

      <div style="background:#1E293B; padding:10px 12px; border-radius:10px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.7' : '1'}; margin-bottom:6px;">

        <div>

          <strong style="color:${isBanned ? '#EF4444' : '#FF6D00'}; font-size:12px;">${isBanned ? '🚫 [BLOQUEADO/BANEADO] ' : '🚚 '}${escapeHtmlStr(v.name)}</strong>

          <span style="font-size:10.5px; color:#CBD5E1;"> (${escapeHtmlStr(v.category)})</span>

          <div style="font-size:10px; color:#94A3B8; margin-top:2px;">Placa: ${escapeHtmlStr(v.plate)} • Estado: ${isBanned ? '<span style="color:#EF4444; font-weight:700;">ACCESO BLOQUEADO</span>' : '<span style="color:#00B0FF; font-weight:700;">ACTIVO (REGISTRO AUTOMÁTICO)</span>'}</div>

        </div>

        <div style="display:flex; gap:4px;">

          ${isBanned ? `

            <button data-action="desbanearRepartidorAdmin" data-id="${v.id}" data-user-id="${encodeURIComponent(v.user_id || '')}" data-name="${safeName}" style="background:#0288D1; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-lock-open"></i> Desbanear</button>

          ` : `

            <button data-action="banearRepartidorAdmin" data-id="${v.id}" data-user-id="${encodeURIComponent(v.user_id || '')}" data-name="${safeName}" data-plate="${safePlate}" style="background:#E65100; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-user-slash"></i> Banear</button>

          `}

          <button data-action="borrarRepartidorPermanente" data-id="${v.id}" data-user-id="${escapeHtmlStr(v.user_id || '')}" data-gmail="${escapeHtmlStr(v.gmail || '')}" data-name="${safeName}" style="background:#D32F2F; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>

        </div>

      </div>

    `;

  });

  html += `</div><div id="admin_view_buyers" style="display:none;">`;

  if (usersLoadError) {
    html += '<div style="color:#FCA5A5; background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.3); border-radius:8px; padding:8px; font-size:10.5px;">No se pudo consultar la lista real de compradores. Ejecuta la migración 044 en Supabase y vuelve a abrir el panel.</div>';
  } else if (buyersList.length === 0) {
    html += '<div style="color:#64748B; font-style:italic; font-size:10.5px;">No hay compradores registrados aún.</div>';

  } else {
    buyersList.forEach(b => {
      const isBanned = b.is_banned || esRepartidorBaneado(b.nombre || '', '', '', b.user_id || b.gmail);
      const safeBuyerName = encodeURIComponent(b.nombre || b.gmail || 'Usuario').replace(/'/g, '%27');

      html += `

        <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.7' : '1'}; margin-bottom:4px;">

          <div>

            <strong style="color:${isBanned ? '#EF4444' : '#38BDF8'}; font-size:11.5px;">${isBanned ? '🚫 [BLOQUEADO] ' : '👤 '}${escapeHtmlStr(b.nombre || b.gmail)}</strong>

            <div style="font-size:9.5px; color:#94A3B8;">${escapeHtmlStr(b.gmail)} • ${isBanned ? '<span style="color:#EF4444; font-weight:700;">ACCESO BLOQUEADO</span>' : '<span style="color:#00B0FF;">Activo</span>'}</div>

          </div>

          <div style="display:flex; gap:4px;">
            <button data-action="${isBanned ? 'desbanearUsuarioAdmin' : 'banearCompradorAdmin'}" data-gmail="${escapeHtmlStr(b.gmail)}" data-id="${escapeHtmlStr(b.user_id || '')}" data-name="${safeBuyerName}" style="background:${isBanned ? '#0288D1' : '#E65100'}; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;">${isBanned ? '🔓 Desbanear' : '🚫 Banear'}</button>
            <button data-action="borrarCompradorPermanente" data-user-id="${escapeHtmlStr(b.user_id || '')}" data-gmail="${escapeHtmlStr(b.gmail)}" data-name="${safeBuyerName}" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>
          </div>

        </div>

      `;

    });

  }

  html += `</div>`;
  container.innerHTML = html;
}

function activarBloqueoPantallaCompletaApp() {
  const overlay = document.getElementById('appLockoutOverlay');

  if (overlay) {
    overlay.style.display = 'flex';

  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(verificarBloqueoAppUsuario, 400);
});

/* INSPECCIÓN Y ELIMINACIÓN DE PEDIDOS FANTASMA PARA EL ADMINISTRADOR */

async function renderAdminOrdersList() {
  const container = document.getElementById('adminOrdersMonitorContainer');

  if (!container) return;

  const formatTimeStr = (totalMins) => {
    if (totalMins < 60) return `${totalMins} min`;
    if (totalMins < 1440) {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${h} h ${m} min`;
    }
    const d = Math.floor(totalMins / 1440);
    const h = Math.floor((totalMins % 1440) / 60);
    return `${d} d ${h} h`;
  };

  let totalCount = 0;

  let html = `

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">

      <span style="font-size:11px; color:#94A3B8;">Control total de pedidos: renovar, reabrir o eliminar:</span>

      <button data-action="limpiarTodosLosPedidosFantasmaAdmin" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;"><i class="fa-solid fa-broom"></i> 🧹 Limpiar Pedidos de Prueba/Caché</button>

    </div>

  `;

  // 1. Pedidos en Vivo desde Supabase (Solo pedidos activos, excluyendo basura entregada/cancelada)
  if (window.supabaseClient) {
    try {
      // Disparar purga silenciosa de registros terminales
      window.supabaseClient.rpc('rpc_purge_old_records').then(() => {}).catch(() => {});
    } catch (_) {}

    const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
    const normCity = activeCity ? String(activeCity).toLowerCase().trim() : null;

    let query = window.supabaseClient
      .from('pedidos')
      .select('*')
      .in('estado', ['pendiente', 'visto', 'asignado'])
      .order('created_at', { ascending: false })
      .limit(250);
      
    if (normCity && normCity !== 'todos' && normCity !== 'all') {
      const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(activeCity) : [normCity];
      query = query.in('ciudad', cityKeys);
    }

    const { data: pedidos, error } = await query;

    if (error) {
      console.error('Error cargando pedidos para administración:', error);
      html += '<div style="color:#B91C1C; background:#FEE2E2; border-radius:8px; padding:10px; margin-bottom:8px; font-size:11px;">No se pudo consultar la lista de pedidos.</div>';
    }

    if (pedidos && pedidos.length > 0) {
      pedidos.forEach(order => {
        totalCount++;

        const orderDate = order.created_at ? new Date(order.created_at).getTime() : Date.now();

        const mins = Number.isFinite(orderDate) ? Math.max(0, Math.floor((Date.now() - orderDate) / 60000)) : 0;

        const statusConfig = {
          pendiente: { label: '⏳ Pendiente', color: '#56BC37' },
          visto: { label: '👀 Visto', color: '#0288D1' },
          asignado: { label: '🚚 Asignado', color: '#F57F17' },
          entregado: { label: '✅ Entregado', color: '#15803D' },
          cancelado: { label: '⛔ Cancelado', color: '#64748B' }
        };
        const currentStatus = statusConfig[order.estado] || { label: escapeHtmlStr(order.estado || 'Sin estado'), color: '#64748B' };
        const borderColor = currentStatus.color;
        const estadoBadge = `<span style="font-size:10px; background:${borderColor}; color:white; padding:3px 6px; border-radius:4px; font-weight:800;">${currentStatus.label}</span>`;
        const latitude = Number(order.latitude);
        const longitude = Number(order.longitude);

        html += `

          <div style="background:#FFFFFF; padding:12px; border-radius:10px; border:1.5px solid ${borderColor}; margin-bottom:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">

            <div style="display:flex; justify-content:space-between; align-items:center;">

              <span style="font-size:12.5px; font-weight:900; color:${borderColor};"><i class="fa-solid fa-box"></i> Pedido Supabase</span>

              ${estadoBadge}

            </div>

            <div style="font-size:11.5px; color:#2F3C45; margin-top:6px;">

              <strong>Estado DB:</strong> ${escapeHtmlStr(order.estado || 'Sin estado')} • Hace ${formatTimeStr(mins)}<br>

              <strong>Producto:</strong> ${escapeHtmlStr(order.categoria || 'Gas')} (${escapeHtmlStr(order.cantidad || '1 un')})<br>

              <strong>Dirección:</strong> ${escapeHtmlStr(order.direccion || 'Georeferenciada')}<br>

              <strong>Teléfono:</strong> <span style="color:${borderColor}; font-weight:800;">${escapeHtmlStr(order.telefono || 'No especificado')}</span><br>

              <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${Number.isFinite(latitude) ? latitude.toFixed(5) : '-'}, Lng ${Number.isFinite(longitude) ? longitude.toFixed(5) : '-'}</span>
              ${order.driver_id ? `<br><span style="font-size:10px; color:#64748B;">Repartidor: ${escapeHtmlStr(String(order.driver_id).substring(0, 8))}...</span>` : ''}

            </div>

            <div style="display:flex; gap:6px; margin-top:8px;">
              <button data-action="renovarPedidoAdmin" data-id="${escapeHtmlStr(order.id)}" style="flex:1; background:#0288D1; color:white; border:none; padding:7px 10px; border-radius:8px; font-weight:800; font-size:10.5px; cursor:pointer;">
                <i class="fa-solid fa-rotate"></i> Renovar / Reabrir
              </button>
              <button data-action="borrarPedidoFantasmaAdmin" data-type="supabase" data-id="${escapeHtmlStr(order.id)}" style="flex:1; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:7px 10px; border-radius:8px; font-weight:800; font-size:10.5px; cursor:pointer;">
                <i class="fa-solid fa-trash-can"></i> Eliminar
              </button>
            </div>

          </div>

        `;

      });

    }

  }

  // 2. Pedido Activo de Comprador Local (Respaldo)

  const rawOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;

  if (rawOrder) {
    try {
      const order = (typeof rawOrder === 'string') ? JSON.parse(rawOrder) : rawOrder;

      totalCount++;

      const mins = Math.floor((Date.now() - (order.timestamp || Date.now())) / 60000);

      html += `

        <div style="background:#FFFFFF; padding:12px; border-radius:10px; border:1.5px solid #56BC37; margin-bottom:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">

          <div style="display:flex; justify-content:space-between; align-items:center;">

            <span style="font-size:12.5px; font-weight:900; color:#56BC37;"><i class="fa-solid fa-box"></i> Pedido Local (Caché)</span>

            <span style="font-size:10px; background:rgba(86,188,55,0.2); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">⏱ Hace ${formatTimeStr(mins)}</span>

          </div>

          <div style="font-size:11.5px; color:#2F3C45; margin-top:6px;">

            <strong>Producto:</strong> ${escapeHtmlStr(order.categoria)} (${escapeHtmlStr(order.cantidad || '1 un')})<br>

            <strong>Dirección:</strong> ${escapeHtmlStr(order.callePrincipal || 'Georeferenciada')}<br>

            <strong>Teléfono:</strong> <span style="color:#56BC37; font-weight:800;">${escapeHtmlStr(order.telefono || 'No especificado')}</span><br>

            <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${order.lat ? order.lat.toFixed(5) : '-'}, Lng ${order.lng ? order.lng.toFixed(5) : '-'}</span>

          </div>

          <button data-action="borrarPedidoFantasmaAdmin" data-type="active_order" style="margin-top:8px; width:100%; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">

            <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Pedido (Local)

          </button>

        </div>

      `;

    } catch(e){}

  }

  // 3. Alertas de Camión / Pánico reportadas por vecinos

  let truckBuffer = [];

  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');

    if (raw) truckBuffer = JSON.parse(raw);

  } catch(e){}

  truckBuffer.forEach((t, idx) => {
    totalCount++;

    const mins = Math.floor((Date.now() - (t.timestamp || Date.now())) / 60000);

    html += `

      <div style="background:#FFFFFF; padding:12px; border-radius:10px; border:1px solid rgba(86,188,55,0.4); margin-bottom:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">

        <div style="display:flex; justify-content:space-between; align-items:center;">

          <span style="font-size:12px; font-weight:800; color:#56BC37;"><i class="fa-solid fa-bell"></i> Alerta Camión Oído / Visto</span>

          <span style="font-size:10px; background:rgba(86,188,55,0.15); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">Hace ${formatTimeStr(mins)}</span>

        </div>

        <div style="font-size:11px; color:#2F3C45; margin-top:4px;">

          <strong>Reportado por:</strong> ${escapeHtmlStr(t.reporter || 'Vecino')}<br>

          <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${t.lat ? t.lat.toFixed(5) : '-'}, Lng ${t.lng ? t.lng.toFixed(5) : '-'}</span>

        </div>

        <button data-action="borrarPedidoFantasmaAdmin" data-type="truck_report" data-idx="${idx}" style="margin-top:8px; width:100%; background:rgba(211,47,47,0.8); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:10px; cursor:pointer;">

          <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Alerta Fantasma

        </button>

      </div>

    `;

  });

  if (totalCount === 0) {
    container.innerHTML = `

      <div style="text-align:center; padding:24px 12px; color:#64748B; font-size:12px; background:#FFFFFF; border-radius:10px; border:1px dashed rgba(0,0,0,0.15);">

        <i class="fa-solid fa-box-open" style="font-size:28px; color:#56BC37; margin-bottom:8px;"></i><br>

        <strong style="color:#2F3C45;">No hay pedidos activos ni alertas en el mapa.</strong><br>

        <span style="font-size:10px;">El mapa está limpio. Todos los pedidos de Supabase se mostrarán aquí.</span>

      </div>

    `;

    return;

  }

  container.innerHTML = html;
}

async function borrarPedidoFantasmaAdmin(tipo, param = null) {
  if (tipo === 'supabase' && window.supabaseClient && param) {
    if (typeof showConfirmModal === 'function') {
      showConfirmModal('⚠️ Eliminar Pedido', '¿Eliminar permanentemente este pedido? Esta acción no se puede deshacer.', 'Eliminar', async () => {
        const { error } = await window.supabaseClient.from('pedidos').delete().eq('id', param);
        if (error) {
          console.error("Error borrando pedido supabase:", error);
          if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo borrar de Supabase.', 'error', 3000);
          return;
        }
        if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
        if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
        if (typeof renderAdminActiveOrders === 'function') renderAdminActiveOrders();
        if (typeof renderAdminOrdersList === 'function') renderAdminOrdersList();
        if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
        if (typeof showToast === 'function') showToast('🗑️ Pedido/Alerta Removido', 'Eliminado correctamente del sistema.', 'info', 4000);
      });
    }
    return;
  } else if (tipo === 'active_order') {
    AppState.set('activeOrder', null);
  } else if (tipo === 'truck_report' && param !== null) {
    try {
      const raw = localStorage.getItem('notigas_reported_trucks_buffer');

      if (raw) {
        let buffer = JSON.parse(raw);

        buffer.splice(param, 1);

        localStorage.setItem('notigas_reported_trucks_buffer', JSON.stringify(buffer));

      }

    } catch(e){}

  }

  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();

  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();

  renderAdminOrdersList();

  renderAdminDashboardKPIs();

  if (typeof showToast === 'function') {
    showToast('🗑️ Pedido/Alerta Removido', 'Eliminado correctamente del sistema.', 'info', 4000);

  }
}

async function renovarPedidoAdmin(orderId) {
  if (!orderId || !window.supabaseClient) return;
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('Renovar Pedido', '¿Renovar este pedido? Volverá a estado pendiente, quedará sin repartidor asignado y comenzará un nuevo plazo.', 'Renovar', async () => {
      const { error } = await window.supabaseClient.rpc('rpc_admin_renew_order', { p_order_id: orderId });
      if (error) {
        console.error('Error renovando pedido:', error);
        if (typeof showToast === 'function') {
          showToast('❌ No se pudo renovar', error.message || 'Verifica que la migración 044 esté aplicada en Supabase.', 'error', 5500);
        }
        return;
      }

      await renderAdminOrdersList();
      if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
      if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
      if (typeof showToast === 'function') {
        showToast('🔄 Pedido renovado', 'El pedido volvió a estado pendiente y ya puede ser tomado por un repartidor.', 'success', 4500);
      }
    });
  }
}

function limpiarTodosLosPedidosFantasmaAdmin() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🧹', '¿Limpiar Pedidos de Prueba/Caché?', 'Se eliminarán de inmediato todos los pedidos activos en caché y reportes del mapa. No afectará los pedidos reales.', 'Sí, limpiar', () => {
      ejecutarLimpiezaTotalPedidos();
    });
  } else {
    if (confirm('🧹 ¿Borrar TODOS los pedidos y reportes del mapa?')) {
      ejecutarLimpiezaTotalPedidos();

    }

  }
}

async function ejecutarLimpiezaTotalPedidos() {
  AppState.set('activeOrder', null);

  localStorage.removeItem('notigas_reported_trucks_buffer');

  if (window.supabaseClient) {
    // Only delete orders that are ghost/old/corrupt instead of all orders

    // The previous implementation was: delete().neq('id', 0)

    // Now we will just clean the cache since deleting all real orders is unsafe

    console.log("Limpiados los pedidos en caché y localstorage. No se eliminaron pedidos reales de Supabase.");

  }

  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();

  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();

  renderAdminOrdersList();

  renderAdminDashboardKPIs();

  if (typeof showToast === 'function') {
    showToast('✨ Caché limpiada', 'Se eliminaron el pedido local y las alertas guardadas en este dispositivo. Los pedidos reales no fueron afectados.', 'success', 4000);

  }
}

async function guardarPropagandaTab(tabName, silent = false) {
  const currentAdmin = await getVerifiedAdminEmail();
  if (!currentAdmin) {
    if (!silent && typeof showToast === 'function') {
      showToast('⛔ Acceso Restringido', window._adminVerificationError || 'Debes iniciar sesión con tu cuenta administradora para modificar anuncios.', 'error', 4500);
    }
    return false;
  }

  const pos = normalizeAdPlacement(tabName);
  const inputTitleEl = document.getElementById(`inputPromoText_${pos}`);
  const inputUrlEl = document.getElementById(`inputPromoUrl_${pos}`);
  const selectStateEl = document.getElementById(`selectPromoState_${pos}`);

  const inputAd = (inputTitleEl?.value || '').trim();
  const rawUrl = (inputUrlEl?.value || '').trim();
  const safeUrl = rawUrl ? (typeof formatExternalUrl === 'function' ? formatExternalUrl(rawUrl) : (typeof getSafeExternalUrl === 'function' ? getSafeExternalUrl(rawUrl) : rawUrl)) : '';
  const adState = selectStateEl?.value || 'activo';
  const isActivo = (adState !== 'inactivo');

  if (rawUrl && typeof getSafeExternalUrl === 'function' && !getSafeExternalUrl(safeUrl || rawUrl)) {
    if (!silent && typeof showToast === 'function') {
      showToast('⚠️ Enlace inválido', 'Por favor ingresa un enlace web o de WhatsApp válido.', 'warning', 4000);
    }
    return false;
  }

  // Actualizar el valor en el input si se formateó (ej. agregar https:// o wa.me)
  if (inputUrlEl && safeUrl && safeUrl !== rawUrl) {
    inputUrlEl.value = safeUrl;
  }

  const citySelector = document.getElementById('adminSelectPromoCiudad');
  const activeCity = (citySelector ? citySelector.value : null) || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba') || 'cochabamba';
  const normCity = normalizeAdCity(activeCity);
  const imgUrl = window.pendingUploadUrls ? window.pendingUploadUrls[pos] : null;

  if (window.supabaseClient) {
    try {
      let lastErrMsg = '';

      // 1. Guardar a través de RPC atómico con p_admin_email y p_posicion
      try {
        const { data: rpcRes, error: rpcErr } = await window.supabaseClient.rpc('rpc_save_local_ad', {
          p_titulo: inputAd || (pos === 'mapa' ? 'Promociona tu negocio o servicio profesional directamente en tu OTB' : (pos === 'repartidores' ? 'Distribución mayorista, repuestos y accesorios autorizados' : 'Promociona tu negocio o servicio en tu barrio')),
          p_descripcion: `Propaganda Local - ${pos.toUpperCase()}`,
          p_url: safeUrl || rawUrl || '',
          p_image_url: imgUrl || '',
          p_ciudad: normCity,
          p_activo: isActivo,
          p_posicion: pos,
          p_admin_email: currentAdmin
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          if (imgUrl === '__REMOVE__') {
            if (window.pendingUploadUrls) window.pendingUploadUrls[pos] = null;
          }
          return true;
        } else if (rpcErr) {
          lastErrMsg = rpcErr.message;
          console.warn('Advertencia en RPC rpc_save_local_ad:', rpcErr.message);
        } else if (rpcRes && !rpcRes.success) {
          lastErrMsg = rpcRes.error || 'Error al procesar el anuncio';
          console.warn('RPC rpc_save_local_ad devolvió error:', lastErrMsg);
        }
      } catch(rpcEx) {
        lastErrMsg = rpcEx?.message || String(rpcEx);
        console.warn('Excepción llamando a rpc_save_local_ad:', rpcEx);
      }

      // No se usa un fallback SELECT→UPDATE/INSERT: el RPC es la única escritura
      // autorizada y atómica para anuncios publicitarios.
      throw new Error(lastErrMsg || 'No se pudo guardar el anuncio publicitario. Verifica tu sesión de administrador.');
    } catch (e) {
      console.error(`Error al guardar anuncio para ${pos}:`, e);
      if (!silent && typeof showToast === 'function') {
        showToast('❌ Error al guardar', e.message || `No se pudo guardar la propaganda de ${pos} en Supabase.`, 'error', 5000);
      }
      return false;
    }
  }
  if (!silent && typeof showToast === 'function') {
    showToast('Sin conexión', 'No existe conexión con Supabase; el anuncio no fue guardado.', 'error', 4500);
  }
  return false;
}
window.guardarPropagandaTab = guardarPropagandaTab;

window._isSavingAdsMutex = false;

window.guardarSubmenuAnuncios = async function() {
  if (window._isSavingAdsMutex) return;
  window._isSavingAdsMutex = true;
  const btn = document.getElementById('btnSaveCurrentAdTab');
  if (btn) btn.disabled = true;

  try {
    const currentTab = normalizeAdPlacement(window.adminActivePromoTab);
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Guardando propaganda de ${currentTab.toUpperCase()}...`);

    const ok = await guardarPropagandaTab(currentTab, false);
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (ok) {
      if (typeof cargarAnunciosGuardados === 'function') await cargarAnunciosGuardados();
      await cargarConfiguracionPublicidadEnAdmin();
      if (typeof renderAdminAdsAndPostsList === 'function') renderAdminAdsAndPostsList();
      if (typeof renderVendorsList === 'function') renderVendorsList();
      if (typeof renderForumFeed === 'function') renderForumFeed();

      const citySelector = document.getElementById('adminSelectPromoCiudad');
      const activeCity = (citySelector ? citySelector.value : null) || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba') || 'cochabamba';
      const normCity = normalizeAdCity(activeCity);
      const displayCity = (normCity === 'global') ? 'TODAS LAS CIUDADES (GLOBAL)' : normCity.toUpperCase();
      if (typeof showToast === 'function') {
        showToast('✅ Propaganda Guardada', `La propaganda de la pestaña ${currentTab.toUpperCase()} quedó actualizada para ${displayCity}.`, 'success', 4500);
      }
    }
  } finally {
    window._isSavingAdsMutex = false;
    if (btn) btn.disabled = false;
  }
};

window.guardarTodasLasPropagandas = async function() {
  if (window._isSavingAdsMutex) return;
  window._isSavingAdsMutex = true;
  const btn = document.getElementById('btnSaveAllPromoAdmin');
  const originalTab = normalizeAdPlacement(window.adminActivePromoTab);
  if (btn) btn.disabled = true;

  try {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Guardando las 3 pestañas de propaganda...');

    const tabs = Object.values(_ADMIN_AD_PLACEMENTS);
    let allOk = true;

    for (const tab of tabs) {
      const ok = await guardarPropagandaTab(tab, true); // silent = true para no saturar con notificaciones
      if (!ok) {
        allOk = false;
        break;
      }
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (allOk) {
      if (typeof cargarAnunciosGuardados === 'function') await cargarAnunciosGuardados();
      await cargarConfiguracionPublicidadEnAdmin();
      if (typeof renderAdminAdsAndPostsList === 'function') renderAdminAdsAndPostsList();
      
      const citySelector = document.getElementById('adminSelectPromoCiudad');
      const activeCity = (citySelector ? citySelector.value : null) || (typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba') || 'cochabamba';
      const normCity = normalizeAdCity(activeCity);
      const displayCity = (normCity === 'global') ? 'TODAS LAS CIUDADES (GLOBAL)' : normCity.toUpperCase();
      
      if (typeof showToast === 'function') {
        showToast('✅ Propaganda Guardada', `Las 3 pestañas quedaron actualizadas para ${displayCity}.`, 'success', 4500);
      }
    } else {
      if (typeof showToast === 'function') {
        showToast('❌ Error al guardar', 'No se pudieron guardar todas las pestañas. Revisa tu conexión o permisos.', 'error', 5000);
      }
    }
  } finally {
    window.switchPromoSubTab(originalTab);
    window._isSavingAdsMutex = false;
    if (btn) btn.disabled = false;
  }
};

// ---------------------------------------------------------
// FUNCIONES DE ADMINISTRACIÓN DE ANUNCIOS E IMÁGENES
// ---------------------------------------------------------

window.previewUploadAdImage = async function(event, specificTab) {
  const pos = normalizeAdPlacement(specificTab || window.adminActivePromoTab);
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('⚠️ Imagen Pesada', 'La imagen supera los 2 MB. Elige una más ligera.', 'warning', 3000);
    return;
  }

  if (window.supabaseClient) {
    const currentAdmin = await getVerifiedAdminEmail();
    if (!currentAdmin) {
      if (typeof showToast === 'function') showToast('Sesión vencida', 'Inicia sesión nuevamente como administrador antes de subir imágenes.', 'error', 4500);
      return;
    }
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Subiendo imagen para ${pos}...`);

    const ext = file.name.split('.').pop() || 'png';
    const fileName = `banner_${pos}_${Date.now()}.${ext}`;

    const { data, error } = await window.supabaseClient.storage
      .from('anuncios-media')
      .upload(fileName, file, { upsert: false, contentType: file.type });

    if (error) {
      console.error('Error al subir imagen:', error);
      if (typeof showToast === 'function') showToast('Error', 'No se pudo subir la imagen: ' + error.message, 'error');
    } else {
      const { data: publicUrlData } = window.supabaseClient.storage.from('anuncios-media').getPublicUrl(fileName);
      const publicUrl = publicUrlData?.publicUrl || '';

      if (!window.pendingUploadUrls) {
        window.pendingUploadUrls = { mapa: null, repartidores: null, muro_avisos: null };
      }
      window.pendingUploadUrls[pos] = publicUrl;

      const preview = document.getElementById(`promoImagePreview_${pos}`);
      const box = document.getElementById(`promoImagePreviewBox_${pos}`);
      if (preview && box) {
        preview.src = publicUrl;
        box.style.display = 'flex';
      }

      if (typeof showToast === 'function') showToast('Éxito', `Imagen cargada para pestaña ${pos.toUpperCase()}.`, 'success', 3000);
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
};

window.eliminarImagenAnuncio = async function(specificTab) {
  const pos = normalizeAdPlacement(specificTab || window.adminActivePromoTab);

  if (window.pendingUploadUrls && window.pendingUploadUrls[pos] && window.supabaseClient) {
    try {
      const urlParts = window.pendingUploadUrls[pos].split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (fileName) {
        await window.supabaseClient.storage.from('anuncios-media').remove([fileName]);
      }
    } catch (_) {}
  }

  if (!window.pendingUploadUrls) {
    window.pendingUploadUrls = { mapa: null, repartidores: null, muro_avisos: null };
  }
  window.pendingUploadUrls[pos] = '__REMOVE__';

  const preview = document.getElementById(`promoImagePreview_${pos}`);
  const box = document.getElementById(`promoImagePreviewBox_${pos}`);
  const input = document.getElementById(`inputAdImageFile_${pos}`);

  if (preview) preview.src = '';
  if (box) box.style.display = 'none';
  if (input) input.value = '';

  if (typeof showToast === 'function') showToast('Eliminada', `Imagen descartada para la pestaña ${pos.toUpperCase()}.`, 'info', 3000);
};

window.borrarAnuncioLocalAdmin = async function(adId) {
  const currentAdmin = await getVerifiedAdminEmail();
  if (!currentAdmin) {
    if (typeof showToast === 'function') showToast('⛔ Acceso Restringido', 'Debes iniciar sesión con tu cuenta administradora.', 'error', 4000);
    return;
  }

  if (typeof showConfirmModal === 'function') {
    showConfirmModal('Eliminar Propaganda', '🗑️ ¿Deseas eliminar permanentemente esta propaganda local?', 'Eliminar', async () => {
      if (window.supabaseClient && adId) {
        if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Eliminando propaganda...');
        let deleted = false;
        let delError = null;

        try {
          const { data: rpcRes, error: rpcErr } = await window.supabaseClient.rpc('rpc_delete_local_ad', {
            p_ad_id: adId,
            p_admin_email: currentAdmin
          });
          if (!rpcErr && rpcRes && rpcRes.success) {
            deleted = true;
          } else if (rpcErr) {
            delError = rpcErr;
          }
        } catch (e) {
          delError = e;
        }

        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

        if (!deleted) {
          if (typeof showToast === 'function') showToast('Error', 'No se pudo eliminar: ' + (delError?.message || 'Error desconocido'), 'error', 4000);
        } else {
          if (typeof showToast === 'function') showToast('✅ Eliminada', 'Propaganda eliminada correctamente.', 'success', 3500);
          await cargarConfiguracionPublicidadEnAdmin();
          renderAdminAdsAndPostsList();
          if (typeof cargarAnunciosGuardados === 'function') await cargarAnunciosGuardados();
        }
      }
    });
  }
};

function guardarAdminConfig() {
  // Manual admin login removed - using Google JWT exclusively
}

function cerrarSesionAdminControl() {
  AppState.set('isAdmin', false);
  const btnAdmin = document.getElementById('btnAdminAccessQuick');
  if (btnAdmin) btnAdmin.style.display = 'none';
  if (typeof closeAdminModal === 'function') closeAdminModal();
  if (typeof showToast === 'function') {
    showToast('Notificación', '🔒 Sesión de Administrador cerrada correctamente.', 'info', 4000);
  } else {
    alert('🔒 Sesión de Administrador cerrada correctamente.');
  }
}

/* DESCARGA COMPLETA DE CORREOS ELECTRONICOS REGISTRADOS (.CSV DE USUARIOS) */

async function descargarListaCorreosCSV() {
  let currentAdmin = await getVerifiedAdminEmail();

  if (!currentAdmin) {
    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.", 'info', 4000); } else { alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

    return;

  }

  let emailsList = [];

  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    emailsList = [...databaseEmails];
  }
  // Correos de la base de datos se exportan directamente

  try {
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (u.gmail) {
      emailsList.push({
        gmail: u.gmail,
        role: u.role === 'repartidor' || u.role === 'chofer' ? 'Repartidor' : 'Cliente',
        fecha: new Date().toISOString().split('T')[0]
      });
    }
  } catch(e){}

  const uniqueEmailsMap = new Map();

  emailsList.forEach(item => {
    if (item.gmail && !uniqueEmailsMap.has(item.gmail.toLowerCase())) {
      uniqueEmailsMap.set(item.gmail.toLowerCase(), item);

    }

  });

  const finalEmails = Array.from(uniqueEmailsMap.values());

  if (finalEmails.length === 0) {
    if (typeof showToast === 'function') { showToast('Notificación', 'No hay correos electrónicos de usuarios registrados aún.', 'info', 4000); } else { alert('No hay correos electrónicos de usuarios registrados aún.'); };

    return;

  }

  let csvRows = ["Email,Rol,Fecha Registro"];

  finalEmails.forEach(item => {
    csvRows.push(`"${item.gmail}","${item.role || 'Cliente'}","${item.fecha || new Date().toISOString().split('T')[0]}"`);

  });

  const csvString = "\uFEFF" + csvRows.join("\n");

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.setAttribute("href", url);

  link.setAttribute("download", `lista_usuarios_notigas_${new Date().toISOString().split('T')[0]}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron ${finalEmails.length} correos electrónicos de usuarios para campañas de Email Marketing.`);
}

/* DESCARGA COMPLETA DE FICHAS DE REPARTIDORES REGISTRADOS (.CSV DE REPARTIDORES) */

async function descargarFichasRepartidoresCSV() {
  let currentAdmin = await getVerifiedAdminEmail();

  if (!currentAdmin) {
    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.", 'info', 4000); } else { alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

    return;

  }

  let driversList = [];

  if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient.from('choferes_habilitados').select('*');
      if (error) { console.error('Error cargando choferes_habilitados:', error); return; }

      if (data) driversList = data;

  }

  if (driversList.length === 0) {
    driversList = [

      { nombre_completo: "Gas GLP N° 42", telefono_whatsapp: "74123456", placa: "3842XYZ", categoria: "Gas GLP", productos: "Garrafas GLP 10kg, reguladores", zonas: "OTB Central", schedule: "07:00 a 18:00", created_at: "2026-08-01" },

      { nombre_completo: "Agua Cristallina 20L", telefono_whatsapp: "74123456", placa: "2105ABC", categoria: "Agua 20L", productos: "Botellones 20L, surtidores", zonas: "Zona Norte", schedule: "08:00 a 17:00", created_at: "2026-08-01" }

    ];

  }

  let csvRows = ["Nombre Negocio/Repartidor,WhatsApp,Placa,Categoria,Productos,Zonas Recorrido,Horarios,Fecha Registro"];

  driversList.forEach(d => {
    csvRows.push(`"${d.nombre_completo || ''}","${d.telefono_whatsapp || ''}","${d.placa || ''}","${d.categoria || ''}","${d.productos || ''}","${d.zonas || ''}","${d.schedule || ''}","${d.created_at || ''}"`);

  });

  const csvString = "\uFEFF" + csvRows.join("\n");

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.setAttribute("href", url);

  link.setAttribute("download", `fichas_repartidores_notigas_${new Date().toISOString().split('T')[0]}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron ${driversList.length} Fichas de Repartidores registradas para el panel de administración.`);
}

/* DESCARGA COMPLETA DE ESTADÍSTICAS GENERALES (.CSV) */

async function descargarEstadisticasGeneralesCSV() {
  let currentAdmin = await getVerifiedAdminEmail();

  if (!currentAdmin) {
    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.", 'info', 4000); } else { alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

    return;

  }

  const elUsers = document.getElementById('adminKpiUsers');
  const elVendors = document.getElementById('adminKpiVendors');
  const elOrders = document.getElementById('adminKpiOrders');
  const elDelivered = document.getElementById('adminKpiDelivered');
  const elCancelled = document.getElementById('adminKpiCancelled');
  const elAvisos = document.getElementById('adminKpiAvisos');
  const elReports = document.getElementById('adminKpiReports');
  const elReportedUsers = document.getElementById('adminKpiReportedUsers');

  const usersCount = elUsers ? elUsers.innerText : '0';
  const vendorsCount = elVendors ? elVendors.innerText : '0';
  const ordersCount = elOrders ? elOrders.innerText : '0';
  const deliveredCount = elDelivered ? elDelivered.innerText : '0';
  const cancelledCount = elCancelled ? elCancelled.innerText : '0';
  const avisosCount = elAvisos ? elAvisos.innerText : '0';
  const reportsCount = elReports ? elReports.innerText : '0';
  const reportedUsersCount = elReportedUsers ? elReportedUsers.innerText : '0';

  const fechaHoy = new Date().toISOString().split('T')[0];

  let csvRows = ["Metrica,Valor,Fecha"];
  csvRows.push(`"Usuarios Totales","${usersCount}","${fechaHoy}"`);
  csvRows.push(`"Repartidores Habilitados","${vendorsCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Activos","${ordersCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Entregados","${deliveredCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Cancelados","${cancelledCount}","${fechaHoy}"`);
  csvRows.push(`"Avisos Publicados","${avisosCount}","${fechaHoy}"`);
  csvRows.push(`"Denuncias Totales","${reportsCount}","${fechaHoy}"`);
  csvRows.push(`"Usuarios/Repartidores Denunciados","${reportedUsersCount}","${fechaHoy}"`);

  const csvString = "\uFEFF" + csvRows.join("\n");

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.setAttribute("href", url);

  link.setAttribute("download", `estadisticas_generales_notigas_${fechaHoy}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron las estadísticas generales del panel de administración.`);
}

async function renderAdminReports() {
  const container = document.getElementById('adminReportsContainer');

  const bannedContainer = document.getElementById('adminBannedList');

  if (!container || !bannedContainer || !window.supabaseClient) return;

  // 1. Fetch Denuncias
  const { data: reports, error: reportsError } = await window.supabaseClient
    .from('denuncias')
    .select('id, denunciado_id, motivo, detalles, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (reportsError) { console.error('Error cargando denuncias:', reportsError); return; }

  if (!reports || reports.length === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay denuncias pendientes de revisión.</div>';

  } else {
    let html = '';

    reports.forEach((rep) => {
      html += `

        <div style="background:#1E293B; padding:6px 8px; border-radius:6px; border-left:3px solid #EF4444; display:flex; justify-content:space-between; align-items:center;">

          <div>

            <strong>${escapeHtmlStr(rep.denunciado_id || 'Publicación')}</strong>: ${escapeHtmlStr(rep.motivo)}

            <div style="font-size:9px; color:#94A3B8;">${escapeHtmlStr(rep.detalles || 'Sin detalle')}</div>

          </div>

          <div style="display:flex; gap:4px;">

            <button data-action="borrarDenunciaAdmin" data-id="${rep.id}" style="background:#0288D1; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Desestimar">👍 Ok</button>

            <button data-action="banearUsuarioAdmin" data-id="${escapeHtmlStr(rep.denunciado_id)}" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Banear Usuario">🚫 Banear</button>

          </div>

        </div>

      `;

    });

    container.innerHTML = html;

  }

  // 2. Fetch Baneados
  const { data: banned, error: bannedError } = await window.supabaseClient
    .from('usuarios_baneados')
    .select('id, user_id, email, nombre, motivo, created_at')
    .limit(100);
  if (bannedError) { console.error('Error cargando usuarios_baneados:', bannedError); return; }

  if (!banned || banned.length === 0) {
    bannedContainer.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay usuarios baneados actualmente.</div>';

  } else {
    let html = '';

    banned.forEach((u) => {
      let uIdentificador = u.email || u.nombre || u.user_id || u.motivo || 'Desconocido';

      html += `

        <div style="display:flex; justify-content:space-between; align-items:center; background:#1E293B; padding:4px 8px; border-radius:4px; margin-bottom:4px;">

          <span style="font-size:11px;">🚫 ${escapeHtmlStr(uIdentificador)}</span>

          <button data-action="desbanearUsuarioAdmin" data-id="${u.id}" style="background:#00E676; color:#0F172A; border:none; padding:2px 6px; border-radius:4px; font-weight:700; font-size:9px; cursor:pointer;">Desbanear</button>

        </div>

      `;

    });

    bannedContainer.innerHTML = html;

  }
}

async function banearUsuarioAdmin(identifier) {
  const target = (identifier || document.getElementById('inputBanIdentifier')?.value || '').trim();
  if (!target || !window.supabaseClient) {
    if (!target && typeof showToast === 'function') {
      showToast('⚠️ Campo Requerido', 'Ingresa un correo, nombre o placa a banear.', 'warning', 3000);
    }
    return;
  }

  const isEmail = target.includes('@');

  if (driversList.length === 0) {
    driversList = [

      { nombre_completo: "Gas GLP N° 42", telefono_whatsapp: "74123456", placa: "3842XYZ", categoria: "Gas GLP", productos: "Garrafas GLP 10kg, reguladores", zonas: "OTB Central", schedule: "07:00 a 18:00", created_at: "2026-08-01" },

      { nombre_completo: "Agua Cristallina 20L", telefono_whatsapp: "74123456", placa: "2105ABC", categoria: "Agua 20L", productos: "Botellones 20L, surtidores", zonas: "Zona Norte", schedule: "08:00 a 17:00", created_at: "2026-08-01" }

    ];

  }

  let csvRows = ["Nombre Negocio/Repartidor,WhatsApp,Placa,Categoria,Productos,Zonas Recorrido,Horarios,Fecha Registro"];

  driversList.forEach(d => {
    csvRows.push(`"${d.nombre_completo || ''}","${d.telefono_whatsapp || ''}","${d.placa || ''}","${d.categoria || ''}","${d.productos || ''}","${d.zonas || ''}","${d.schedule || ''}","${d.created_at || ''}"`);

  });

  const csvString = "\uFEFF" + csvRows.join("\n");

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.setAttribute("href", url);

  link.setAttribute("download", `fichas_repartidores_notigas_${new Date().toISOString().split('T')[0]}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron ${driversList.length} Fichas de Repartidores registradas para el panel de administración.`);
}

/* DESCARGA COMPLETA DE ESTADÍSTICAS GENERALES (.CSV) */

async function descargarEstadisticasGeneralesCSV() {
  let currentAdmin = await getVerifiedAdminEmail();

  if (!currentAdmin) {
    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.", 'info', 4000); } else { alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

    return;

  }

  const elUsers = document.getElementById('adminKpiUsers');
  const elVendors = document.getElementById('adminKpiVendors');
  const elOrders = document.getElementById('adminKpiOrders');
  const elDelivered = document.getElementById('adminKpiDelivered');
  const elCancelled = document.getElementById('adminKpiCancelled');
  const elAvisos = document.getElementById('adminKpiAvisos');
  const elReports = document.getElementById('adminKpiReports');
  const elReportedUsers = document.getElementById('adminKpiReportedUsers');

  const usersCount = elUsers ? elUsers.innerText : '0';
  const vendorsCount = elVendors ? elVendors.innerText : '0';
  const ordersCount = elOrders ? elOrders.innerText : '0';
  const deliveredCount = elDelivered ? elDelivered.innerText : '0';
  const cancelledCount = elCancelled ? elCancelled.innerText : '0';
  const avisosCount = elAvisos ? elAvisos.innerText : '0';
  const reportsCount = elReports ? elReports.innerText : '0';
  const reportedUsersCount = elReportedUsers ? elReportedUsers.innerText : '0';

  const fechaHoy = new Date().toISOString().split('T')[0];

  let csvRows = ["Metrica,Valor,Fecha"];
  csvRows.push(`"Usuarios Totales","${usersCount}","${fechaHoy}"`);
  csvRows.push(`"Repartidores Habilitados","${vendorsCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Activos","${ordersCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Entregados","${deliveredCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos Cancelados","${cancelledCount}","${fechaHoy}"`);
  csvRows.push(`"Avisos Publicados","${avisosCount}","${fechaHoy}"`);
  csvRows.push(`"Denuncias Totales","${reportsCount}","${fechaHoy}"`);
  csvRows.push(`"Usuarios/Repartidores Denunciados","${reportedUsersCount}","${fechaHoy}"`);

  const csvString = "\uFEFF" + csvRows.join("\n");

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.setAttribute("href", url);

  link.setAttribute("download", `estadisticas_generales_notigas_${fechaHoy}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron las estadísticas generales del panel de administración.`);
}

async function renderAdminReports() {
  const container = document.getElementById('adminReportsContainer');

  const bannedContainer = document.getElementById('adminBannedList');

  if (!container || !bannedContainer || !window.supabaseClient) return;

  // 1. Fetch Denuncias
  const { data: reports, error: reportsError } = await window.supabaseClient
    .from('denuncias')
    .select('id, denunciado_id, motivo, detalles, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (reportsError) { console.error('Error cargando denuncias:', reportsError); return; }

  if (!reports || reports.length === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay denuncias pendientes de revisión.</div>';

  } else {
    let html = '';

    reports.forEach((rep) => {
      html += `

        <div style="background:#1E293B; padding:6px 8px; border-radius:6px; border-left:3px solid #EF4444; display:flex; justify-content:space-between; align-items:center;">

          <div>

            <strong>${escapeHtmlStr(rep.denunciado_id || 'Publicación')}</strong>: ${escapeHtmlStr(rep.motivo)}

            <div style="font-size:9px; color:#94A3B8;">${escapeHtmlStr(rep.detalles || 'Sin detalle')}</div>

          </div>

          <div style="display:flex; gap:4px;">

            <button data-action="borrarDenunciaAdmin" data-id="${rep.id}" style="background:#0288D1; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Desestimar">👍 Ok</button>

            <button data-action="banearUsuarioAdmin" data-id="${escapeHtmlStr(rep.denunciado_id)}" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Banear Usuario">🚫 Banear</button>

          </div>

        </div>

      `;

    });

    container.innerHTML = html;

  }

  // 2. Fetch Baneados
  const { data: banned, error: bannedError } = await window.supabaseClient
    .from('usuarios_baneados')
    .select('id, user_id, email, nombre, motivo, created_at')
    .limit(100);
  if (bannedError) { console.error('Error cargando usuarios_baneados:', bannedError); return; }

  if (!banned || banned.length === 0) {
    bannedContainer.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay usuarios baneados actualmente.</div>';

  } else {
    let html = '';

    banned.forEach((u) => {
      let uIdentificador = u.email || u.nombre || u.user_id || u.motivo || 'Desconocido';

      html += `

        <div style="display:flex; justify-content:space-between; align-items:center; background:#1E293B; padding:4px 8px; border-radius:4px; margin-bottom:4px;">

          <span style="font-size:11px;">🚫 ${escapeHtmlStr(uIdentificador)}</span>

          <button data-action="desbanearUsuarioAdmin" data-id="${u.id}" style="background:#00E676; color:#0F172A; border:none; padding:2px 6px; border-radius:4px; font-weight:700; font-size:9px; cursor:pointer;">Desbanear</button>

        </div>

      `;

    });

    bannedContainer.innerHTML = html;

  }
}

async function banearUsuarioAdmin(identifier) {
  const target = (identifier || document.getElementById('inputBanIdentifier')?.value || '').trim();
  if (!target || !window.supabaseClient) {
    if (!target && typeof showToast === 'function') {
      showToast('⚠️ Campo Requerido', 'Ingresa un correo, nombre o placa a banear.', 'warning', 3000);
    }
    return;
  }

  const isEmail = target.includes('@');

  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
    user_id: !isEmail ? target : null,
    email: isEmail ? target : null,
    nombre: !isEmail ? target : null,
    motivo: 'Baneado por Administrador'
  }]);

  if (typeof descargarBaneadosDeSupabase === 'function') await descargarBaneadosDeSupabase();

  if (!error) {
    const inputEl = document.getElementById('inputBanIdentifier');
    if (inputEl) inputEl.value = '';
    if (typeof showToast === 'function') {
      showToast('🚫 Usuario Baneado', `"${target}" ha sido restringido de publicar en NOTIGAS.`, 'error', 4000);
    } else {
      alert(`🚫 USUARIO BANEADO\nEl usuario (${target}) ha sido restringido de publicar en NOTIGAS.`);
    }
  } else {
    console.error("Error al banear:", error);
    if (typeof showToast === 'function') showToast('Error', error.message || 'No se pudo registrar el baneo.', 'error', 4000);
  }

  if (typeof renderAdminReports === 'function') renderAdminReports();
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
}

async function desbanearUsuarioAdmin(idOrEmail) {
  if (!idOrEmail || !window.supabaseClient) return;

  const target = String(idOrEmail).trim();
  const isEmail = target.includes('@');
  let query = window.supabaseClient.from('usuarios_baneados').delete();
  if (isEmail) {
    query = query.ilike('email', target);
  } else {
    query = query.or(`id.eq.${target},user_id.eq.${target}`);
  }

  const { error } = await query;

  if (typeof descargarBaneadosDeSupabase === 'function') {
    await descargarBaneadosDeSupabase();
  }

  if (!error) {
    if (typeof showToast === 'function') {
      showToast('🔓 Usuario Desbaneado', 'Se ha retirado el bloqueo correctamente.', 'success', 3500);
    } else {
      alert(`✅ USUARIO DESBANEADO\nSe ha retirado el bloqueo.`);
    }
  } else {
    console.error('Error desbaneando usuario:', error);
    if (typeof showToast === 'function') showToast('Error', 'No se pudo retirar el baneo.', 'error');
  }

  if (typeof renderAdminReports === 'function') renderAdminReports();
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
}

async function borrarDenunciaAdmin(indexId) {
  if (!window.supabaseClient) return;

  const { error } = await window.supabaseClient.from('denuncias').delete().eq('id', indexId);

  if (error) console.error(error);

  renderAdminReports();
}

/* FUNCIONALIDAD DEL MODAL DE DENUNCIAS (REPORTAR CONTENIDO / USUARIO) */

function abrirModalDenuncia(contextTitle, targetInfo, isFakeOrder = false) {
  const modal = document.getElementById('modalReport');
  const label = document.getElementById('reportTargetLabel');
  const titleText = document.getElementById('reportModalTitleText');
  const inputContext = document.getElementById('reportContext');
  const groupName = document.getElementById('groupReportPersonName');
  const inputName = document.getElementById('inputReportPersonName');
  const selectMotivo = document.getElementById('selectReportMotivo');
  const inputDetalle = document.getElementById('inputReportDetalle');

  if (inputName) {
    inputName.value = '';
    inputName.style.border = '1.5px solid #EF4444';
  }
  if (inputDetalle) inputDetalle.value = '';

  if (isFakeOrder) {
    if (titleText) titleText.textContent = '🚨 Denunciar Pedido Falso';
    if (label) label.innerText = 'Denunciar un pedido falso o ficticio a la Administración:';
    if (inputContext) inputContext.value = 'Pedido Falso';
    if (selectMotivo) selectMotivo.value = 'Pedido falso / posible fraude';
    if (groupName) groupName.style.display = 'block';
    if (inputName) {
      setTimeout(() => inputName.focus(), 150);
    }
  } else {
    if (titleText) titleText.textContent = '🚨 Denunciar Publicación o Acoso';
    if (label) label.innerText = `Reportar ${contextTitle}: "${targetInfo}"`;
    if (inputContext) inputContext.value = `${contextTitle} - ${targetInfo}`;
    if (groupName) groupName.style.display = (selectMotivo && selectMotivo.value === 'Pedido falso / posible fraude') ? 'block' : 'none';
  }

  if (modal) modal.style.display = 'flex';
}

window.abrirModalDenunciaPedidoFalso = function() {
  const modalSettings = document.getElementById('modalUserSettings');
  if (modalSettings) modalSettings.style.display = 'none';
  abrirModalDenuncia('Pedido Falso', 'Reporte desde Menú Repartidor', true);
};

function closeReportModal() {
  const modal = document.getElementById('modalReport');
  if (modal) modal.style.display = 'none';
  const groupName = document.getElementById('groupReportPersonName');
  if (groupName) groupName.style.display = 'none';
  const inputName = document.getElementById('inputReportPersonName');
  if (inputName) inputName.value = '';
}

async function enviarDenuncia() {
  const context = document.getElementById('reportContext')?.value || 'General';
  const motivo = document.getElementById('selectReportMotivo')?.value || 'Contenido Ofensivo';
  const detalle = document.getElementById('inputReportDetalle')?.value.trim() || '';
  const personNameInput = document.getElementById('inputReportPersonName');
  const personName = personNameInput ? personNameInput.value.trim() : '';

  // VALIDACIÓN ESTRICTA: Para denunciar un pedido falso DEBE nombrarse a la persona
  if (motivo === 'Pedido falso / posible fraude' || context.toLowerCase().includes('pedido falso')) {
    if (!personName) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Campo Obligatorio', 'Debes ingresar el nombre de la persona que realizó el pedido falso.', 'warning', 5000);
      } else {
        alert('Debes ingresar el nombre de la persona que realizó el pedido falso.');
      }
      if (personNameInput) {
        personNameInput.focus();
        personNameInput.style.border = '2px solid #EF4444';
      }
      return;
    }
  }

  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Sin conexión', 'No se pudo enviar la denuncia. Intenta nuevamente.', 'error', 4000);
    return;
  }

  const denunciadoIdFinal = personName ? `Persona: ${personName}` : context;
  const detalleFinal = personName ? `${detalle ? detalle + ' | ' : ''}Persona denunciada: ${personName}` : detalle;

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Enviando denuncia...');

  const { error } = await window.supabaseClient.from('denuncias').insert([{
    denunciado_id: denunciadoIdFinal,
    motivo: motivo,
    detalles: detalleFinal
  }]);

  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

  if (error) {
    console.error("Error enviando denuncia:", error);
    if (typeof showToast === 'function') showToast('Denuncia no enviada', error.message || 'No se pudo registrar la denuncia.', 'error', 4500);
    return;
  }

  closeReportModal();

  if (personNameInput) personNameInput.value = '';
  const inputDetalle = document.getElementById('inputReportDetalle');
  if (inputDetalle) inputDetalle.value = '';

  if (typeof showToast === 'function') {
    showToast('🚨 Denuncia Registrada', 'Denuncia registrada de forma segura. El equipo de administración revisará al usuario y tomará las sanciones correspondientes.', 'success', 5000);
  } else {
    alert('⚠️ Denuncia registrada de forma segura. El equipo de administración revisará al usuario.');
  }
}

// ==========================================================================
// GESTIÓN Y MODERACIÓN DE MURO DE COMENTARIOS (PESTAÑA 3) EN PANEL DE ADMINISTRACIÓN
// ==========================================================================

let _adminAvisosCache = [];

async function renderAdminAvisosFeedList(filtro = '') {
  const container = document.getElementById('adminAvisosListContainer');
  if (!container || !window.supabaseClient) return;

  container.innerHTML = '<div style="text-align:center; padding: 20px; color:#94A3B8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando avisos comunitarios...</div>';

  try {
    const { data: posts, error } = await window.supabaseClient
      .from(_ADMIN_NOTICE_TABLE)
      .select('*, comentarios_avisos(count)')
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) {
      container.innerHTML = `<div style="color:#EF4444; padding:12px; text-align:center;">Error al cargar avisos: ${error.message}</div>`;
      return;
    }

    _adminAvisosCache = posts || [];

    filtrarYRenderizarAvisosAdmin(filtro);
  } catch (err) {
    console.error('Error cargando lista de avisos admin:', err);
    container.innerHTML = `<div style="color:#EF4444; padding:12px; text-align:center;">Error interno: ${err.message}</div>`;
  }
}

function filtrarYRenderizarAvisosAdmin(filtro = '') {
  const container = document.getElementById('adminAvisosListContainer');
  if (!container) return;

  if (!_adminAvisosCache || _adminAvisosCache.length === 0) {
    container.innerHTML = '<div style="color:#94A3B8; padding:20px; text-align:center;">No hay avisos registrados en la base de datos.</div>';
    return;
  }

  const term = (filtro || '').toLowerCase().trim();
  const filtered = term ? _adminAvisosCache.filter(p => {
    const t = (p.titulo || '').toLowerCase();
    const d = (p.descripcion || '').toLowerCase();
    const a = (p.autor || '').toLowerCase();
    const c = (p.ciudad || '').toLowerCase();
    const k = (p.categoria || '').toLowerCase();
    return t.includes(term) || d.includes(term) || a.includes(term) || c.includes(term) || k.includes(term);
  }) : _adminAvisosCache;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:#94A3B8; padding:20px; text-align:center;">No se encontraron avisos que coincidan con "${escapeHtmlStr(filtro)}".</div>`;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    const commentCount = (p.comentarios_avisos && p.comentarios_avisos[0]) ? p.comentarios_avisos[0].count : 0;
    const safeTitle = encodeURIComponent(p.titulo || '').replace(/'/g, "%27");
    const safeDesc = encodeURIComponent(p.descripcion || '').replace(/'/g, "%27");
    const safeCat = encodeURIComponent(p.categoria || '').replace(/'/g, "%27");
    const timeStr = p.created_at ? new Date(p.created_at).toLocaleString('es-BO') : 'N/A';
    const isExpired = p.created_at ? ((Date.now() - new Date(p.created_at).getTime()) > 24 * 3600 * 1000) : false;

    html += `
      <div style="background:#1E293B; border-radius:8px; padding:10px 12px; border:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:10px; font-weight:800; background:rgba(245,158,11,0.2); color:#F59E0B; padding:2px 7px; border-radius:4px;">${escapeHtmlStr(p.categoria || 'AVISO')}</span>
            <span style="font-size:10px; font-weight:700; background:rgba(56,189,248,0.15); color:#38BDF8; padding:2px 7px; border-radius:4px;">📍 ${escapeHtmlStr(String(p.ciudad || 'Global').toUpperCase())}</span>
            ${isExpired ? '<span style="font-size:9.5px; background:rgba(239,68,68,0.2); color:#F87171; padding:2px 5px; border-radius:4px;">⚠️ Expirado (+24h)</span>' : ''}
          </div>
          <div style="font-size:10px; color:#94A3B8;">
            <i class="fa-regular fa-clock"></i> ${escapeHtmlStr(timeStr)}
          </div>
        </div>

        <div style="font-weight:800; font-size:12.5px; color:white;">
          ${escapeHtmlStr(p.titulo || 'Sin título')}
        </div>

        <div style="font-size:11px; color:#CBD5E1; line-height:1.4;">
          ${escapeHtmlStr(p.descripcion || '')}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:6px; margin-top:2px;">
          <div style="font-size:10.5px; color:#94A3B8; display:flex; gap:10px; align-items:center;">
            <span>👤 <strong>${escapeHtmlStr(p.autor || 'Vecino')}</strong></span>
            <span>👍 ${p.votos ?? 1} votos</span>
            <span>💬 ${commentCount} comentarios</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" data-action="abrirModalEditarPost" data-id="${p.id}" data-title="${safeTitle}" data-desc="${safeDesc}" data-cat="${safeCat}" style="background:rgba(14,165,233,0.2); color:#38BDF8; border:1px solid rgba(14,165,233,0.4); padding:4px 8px; border-radius:4px; font-size:10.5px; font-weight:700; cursor:pointer;">
              <i class="fa-solid fa-pen-to-square"></i> Editar
            </button>
            <button type="button" data-action="borrarPostForumAdmin" data-id="${p.id}" style="background:rgba(239,68,68,0.2); color:#F87171; border:1px solid rgba(239,68,68,0.4); padding:4px 8px; border-radius:4px; font-size:10.5px; font-weight:700; cursor:pointer;">
              <i class="fa-solid fa-trash"></i> Borrar
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function purgarAvisosExpiradosAdmin() {
  if (!window.supabaseClient) return;
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('Purgar Avisos', '🧹 ¿Deseas purgar y eliminar todos los avisos comunitarios con más de 24 horas de antigüedad?', 'Purgar', async () => {
      const dosDiasAtras = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      try {
        const { error } = await window.supabaseClient
          .from(_ADMIN_NOTICE_TABLE)
          .delete()
          .lt('created_at', dosDiasAtras);

        if (error) {
          if (typeof showToast === 'function') showToast('Error', 'No se pudo purgar: ' + error.message, 'error', 4000);
          return;
        }

        if (typeof showToast === 'function') showToast('🧹 Purga Completa', 'Se eliminaron los avisos vencidos (+24h).', 'success', 3500);
        renderAdminAvisosFeedList();
        if (typeof renderForumFeed === 'function') renderForumFeed();
      } catch (ex) {
        console.error(ex);
      }
    });
  }
}

// Búsqueda en vivo de avisos admin
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'adminAvisosSearchInput') {
    filtrarYRenderizarAvisosAdmin(e.target.value);
  }
});

window.renderAdminAvisosFeedList = renderAdminAvisosFeedList;
window.purgarAvisosExpiradosAdmin = purgarAvisosExpiradosAdmin;
window.filtrarYRenderizarAvisosAdmin = filtrarYRenderizarAvisosAdmin;

window.banearUsuarioAdmin = (typeof banearUsuarioAdmin !== 'undefined') ? banearUsuarioAdmin : (typeof window.banearUsuarioAdmin !== 'undefined' ? window.banearUsuarioAdmin : undefined);
window.desbanearUsuarioAdmin = (typeof desbanearUsuarioAdmin !== 'undefined') ? desbanearUsuarioAdmin : (typeof window.desbanearUsuarioAdmin !== 'undefined' ? window.desbanearUsuarioAdmin : undefined);
window.borrarDenunciaAdmin = (typeof borrarDenunciaAdmin !== 'undefined') ? borrarDenunciaAdmin : undefined;
window.limpiarTodosLosPedidosFantasmaAdmin = (typeof limpiarTodosLosPedidosFantasmaAdmin !== 'undefined') ? limpiarTodosLosPedidosFantasmaAdmin : undefined;
window.borrarPedidoFantasmaAdmin = (typeof borrarPedidoFantasmaAdmin !== 'undefined') ? borrarPedidoFantasmaAdmin : undefined;
window.renovarPedidoAdmin = (typeof renovarPedidoAdmin !== 'undefined') ? renovarPedidoAdmin : undefined;
window.desbanearRepartidorAdmin = (typeof desbanearRepartidorAdmin !== 'undefined') ? desbanearRepartidorAdmin : (typeof window.desbanearRepartidorAdmin !== 'undefined' ? window.desbanearRepartidorAdmin : undefined);
window.banearRepartidorAdmin = (typeof banearRepartidorAdmin !== 'undefined') ? banearRepartidorAdmin : (typeof window.banearRepartidorAdmin !== 'undefined' ? window.banearRepartidorAdmin : undefined);
window.borrarPostForumAdmin = (typeof borrarPostForumAdmin !== 'undefined') ? borrarPostForumAdmin : undefined;
window.abrirModalAdminDashboard = (typeof abrirModalAdminDashboard !== 'undefined') ? abrirModalAdminDashboard : undefined;
window.closeAdminModal = (typeof closeAdminModal !== 'undefined') ? closeAdminModal : undefined;
window.activarMapaCalorAdminLive = (typeof activarMapaCalorAdminLive !== 'undefined') ? activarMapaCalorAdminLive : undefined;
window.switchModalTab = (typeof switchModalTab !== 'undefined') ? switchModalTab : undefined;
window.renderAdminDashboardKPIs = (typeof renderAdminDashboardKPIs !== 'undefined') ? renderAdminDashboardKPIs : undefined;
window.renderAdminVendorsList = (typeof renderAdminVendorsList !== 'undefined') ? renderAdminVendorsList : undefined;
window.renderAdminOrdersList = (typeof renderAdminOrdersList !== 'undefined') ? renderAdminOrdersList : undefined;
window.renderAdminAdsAndPostsList = (typeof renderAdminAdsAndPostsList !== 'undefined') ? renderAdminAdsAndPostsList : undefined;
window.renderAdminReports = (typeof renderAdminReports !== 'undefined') ? renderAdminReports : undefined;
window.cerrarSesionAdminControl = (typeof cerrarSesionAdminControl !== 'undefined') ? cerrarSesionAdminControl : undefined;
window.descargarListaCorreosCSV = (typeof descargarListaCorreosCSV !== 'undefined') ? descargarListaCorreosCSV : undefined;
window.descargarFichasRepartidoresCSV = (typeof descargarFichasRepartidoresCSV !== 'undefined') ? descargarFichasRepartidoresCSV : undefined;
window.switchPromoSubTab = (typeof switchPromoSubTab !== 'undefined') ? switchPromoSubTab : undefined;
window.guardarPropagandaTab = (typeof guardarPropagandaTab !== 'undefined') ? guardarPropagandaTab : undefined;
window.previewUploadAdImage = (typeof previewUploadAdImage !== 'undefined') ? previewUploadAdImage : undefined;
window.eliminarImagenAnuncio = (typeof eliminarImagenAnuncio !== 'undefined') ? eliminarImagenAnuncio : undefined;
window.borrarAnuncioLocalAdmin = (typeof borrarAnuncioLocalAdmin !== 'undefined') ? borrarAnuncioLocalAdmin : undefined;
window.abrirModalDenuncia = (typeof abrirModalDenuncia !== 'undefined') ? abrirModalDenuncia : undefined;
window.closeReportModal = (typeof closeReportModal !== 'undefined') ? closeReportModal : undefined;
window.enviarDenuncia = (typeof enviarDenuncia !== 'undefined') ? enviarDenuncia : undefined;
