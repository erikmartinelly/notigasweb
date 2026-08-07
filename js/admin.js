/* ==========================================================================
   NOTIGAS - MÓDULO DE ADMINISTRACIÓN, ADSENSE, MODERACIÓN & BANEOS
   ========================================================================== */

const AUTHORIZED_ADMIN_EMAILS = [
  "erikmartinelly@gmail.com",
  "leonmartinelly13@gmail.com"
];

const REQUIRED_ADMIN_PASSWORD = "Tiquipaya428";

/* closeUserSettingsModal, guardarPrefUsuario y cerrarSesionUsuario residen en auth.js (que carga primero).
   Se eliminan aquí para evitar que admin.js sobreescriba las versiones correctas con soporte de rol Repartidor. */

function cerrarSesionRepartidorActivarComprador() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🔄', '¿Cambiar a Modo Comprador?', 'Tu ficha de negocio se mantendrá guardada. Solo se cambiará tu modo de ingreso.', 'Sí, cambiar', () => {
      localStorage.removeItem('notigas_user_data');
      localStorage.removeItem('driverGpsLive');
      if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
      if (typeof setAppMode === 'function') setAppMode('buyer');
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
      if (typeof showToast === 'function') showToast('🛒 Modo Comprador', 'Modo Repartidor cerrado. Puedes ingresar como Comprador.', 'info', 2000);
    });
  }
}

function abrirModalAdminLogin() {
  closeUserSettingsModal();
  const modalAdmin = document.getElementById('modalAdmin');
  const loginScreen = document.getElementById('adminLoginScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');

  if (!modalAdmin) return;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  if (currentAdmin && AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboardScreen) dashboardScreen.style.display = 'block';
    renderAdminReports();
    if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
  } else {
    if (loginScreen) loginScreen.style.display = 'block';
    if (dashboardScreen) dashboardScreen.style.display = 'none';
  }

  modalAdmin.style.display = 'flex';
}

/* guardarPrefUsuario reside en auth.js — eliminada de admin.js para que la versión con
   detección de rol Repartidor (GPS) no sea sobreescrita. */



/* cerrarSesionUsuario reside en auth.js — eliminada de admin.js para evitar sobreescritura */



/* GESTIÓN DEL MODAL EXCLUSIVO DE ADMINISTRADOR */
function closeAdminModal() { 
  const modalAdmin = document.getElementById('modalAdmin');
  if (modalAdmin) modalAdmin.style.display = 'none'; 
}

function activarMapaCalorAdminLive() {
  closeAdminModal();
  if (typeof switchTab === 'function') switchTab(0);
  window.isHeatmapActive = true;
  if (typeof renderHeatmapOverlay === 'function') renderHeatmapOverlay();
  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();

  const btn = document.getElementById('btnDriverHeatmap');
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
  if (idx === 3) renderAdminAdsAndPostsList();
  if (idx === 4async function renderAdminAdsAndPostsList() {
  const container = document.getElementById('adminAdsListContainer');
  if (!container || !window.supabaseClient) return;
  
  container.innerHTML = '<div style="color:#94A3B8; text-align:center;">Cargando...</div>';

  let html = '';
  let count = 0;

  // 1. Anuncio Local Personalizado
  const { data: adData } = await window.supabaseClient.from('publicaciones').select('*').eq('tipo', 'anuncioGlobal').single();
  if (adData) {
    count++;
    html += `
      <div style="background:#1E293B; padding:10px; border-radius:8px; border:1px solid #F59E0B; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:#F59E0B; font-size:11.5px;"><i class="fa-solid fa-rectangle-ad"></i> Anuncio Local Banner OTB</strong>
          <button onclick="borrarAnuncioLocalAdmin('${adData.id}')" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Borrar Anuncio</button>
        </div>
        <div style="font-size:11px; color:white; margin-top:4px;">
          ${adData.titulo ? `<strong>Texto:</strong> "${escapeHtmlStr(adData.titulo)}"` : 'Banner con Imagen activa'}
        </div>
      </div>
    `;
  }

  // 2. Avisos y Noticias de la OTB
  const { data: localPosts } = await window.supabaseClient.from('publicaciones').select('*').neq('tipo', 'anuncioGlobal');
  
  if (localPosts && localPosts.length > 0) {
    localPosts.forEach(p => {
      count++;
      html += `
        <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:9px; background:rgba(255,109,0,0.2); color:#FF8F00; padding:1px 5px; border-radius:4px; font-weight:700;">${escapeHtmlStr(p.categoria || 'Aviso')}</span>
            <strong style="color:white; font-size:11px; margin-left:4px;">${escapeHtmlStr(p.titulo || 'Sin Título')}</strong>
          </div>
          <button onclick="borrarPostForumAdmin('${p.id}')" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Borrar</button>
        </div>
      `;
    });
  }

  if (count === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic; font-size:11px; text-align:center; padding:12px;">No hay anuncios ni publicaciones activas en Tab 3.</div>';
    return;
  }

  container.innerHTML = html;
}

async function borrarAnuncioLocalAdmin(id) {
  if (!window.supabaseClient) return;
  const { error } = await window.supabaseClient.from('publicaciones').delete().eq('id', id);
  if (error) console.error(error);

  localStorage.removeItem('notigas_ad_text');
  localStorage.removeItem('notigas_ad_url');
  localStorage.removeItem('notigas_ad_image_base64');

  if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
  renderAdminAdsAndPostsList();
}cargarAnunciosGuardados();
  renderAdminAdsAndPostsList();

  if (typeof showToast === 'function') {
    showToast('🗑️ Anuncio Eliminado', 'El anuncio local de la OTB fue borrado del sistema.', 'info', 4000);
  }
}

function renderAdminDashboardKPIs() {
  const elUsers = document.getElementById('adminKpiUsers');
  const elVendors = document.getElementById('adminKpiVendors');
  const elOrders = document.getElementById('adminKpiOrders');
  const elReports = document.getElementById('adminKpiReports');

  let usersCount = 2; // Usuarios base demostración
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) usersCount++;
  } catch(e){}
  if (elUsers) elUsers.innerText = usersCount;

  let vendorsCount = 8; // Vendedores base de la OTB
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor') vendorsCount++;
    }
  } catch(e){}
  if (elVendors) elVendors.innerText = vendorsCount;

  let ordersCount = 0;
  const activeOrder = localStorage.getItem('notigas_active_order');
  if (activeOrder) ordersCount = 1;
  if (elOrders) elOrders.innerText = ordersCount;

  let reportsCount = 0;
  try {
    const reports = JSON.parse(localStorage.getItem('notigas_user_reports') || '[]');
    reportsCount = reports.length;
  } catch(e){}
  if (elReports) elReports.innerText = reportsCount;
}

function emitirAlertaOficialAdmin() {
  const input = document.getElementById('inputAdminBroadcastMsg');
  const text = (input?.value || '').trim();

  if (!text) {
    if (typeof showToast === 'function') showToast('⚠️ Texto Requerido', 'Ingresa el texto de la Alerta Oficial OTB.', 'warning', 2000);
    return;
  }

  const broadcastData = {
    message: text,
    timestamp: Date.now()
  };

  localStorage.setItem('notigas_admin_broadcast', JSON.stringify(broadcastData));
  
  if (typeof mostrarPopupAlertaRepartidor === 'function') {
    mostrarPopupAlertaRepartidor(`👑 <strong>COMUNICADO OFICIAL ADMINISTRACIÓN OTB:</strong><br>${text}`);
  }

  input.value = '';
  if (typeof showToast === 'function') showToast('📢 Comunicado Emitido', 'Mensaje transmitido a todos los vecinos en el mapa.', 'success', 2000);
}

function ejecutarPurgaBaseDeDatosManual() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🧹', '¿Ejecutar Purga de Sistema?', 'Se limpiará el caché y los registros de chat >48h y avisos >72h.', 'Sí, purgar', () => {
      if (typeof ejecutarPurgaBaseDeDatosAuto === 'function') {
        ejecutarPurgaBaseDeDatosAuto();
      }
      renderAdminDashboardKPIs();
      if (typeof showToast === 'function') showToast('🧹 Purga Completada', 'Se liberó almacenamiento y memoria en caché.', 'info', 2000);
    });
  }
}

function esRepartidorBaneado(nombre, placa, whatsapp, gmail) {
  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}

  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  const checkList = [nombre, placa, whatsapp, gmail].filter(Boolean).map(s => String(s).toLowerCase().trim());

  for (const b of banned) {
    const cleanB = String(b).toLowerCase().trim();
    if (cleanB && checkList.some(c => c.includes(cleanB) || cleanB.includes(c))) return true;
  }

  for (const id of deletedIds) {
    const cleanId = String(id).toLowerCase().trim();
    if (cleanId && checkList.some(c => c.includes(cleanId) || cleanId.includes(c))) return true;
  }

  return false;
}

function banearRepartidorAdmin(vendorId, vendorName, plate = '', whatsapp = '') {
  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  if (!deletedIds.includes(vendorId)) {
    deletedIds.push(vendorId);
    localStorage.setItem('notigas_deleted_vendor_ids', JSON.stringify(deletedIds));
  }

  // Agregar a la lista de prohibición de acceso
  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}

  [vendorName, plate, whatsapp].filter(Boolean).forEach(item => {
    if (!banned.includes(item)) banned.push(item);
  });

  localStorage.setItem('notigas_banned_users', JSON.stringify(banned));

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🚫 Repartidor Baneado', `Se suspendió el acceso e ingreso de "${vendorName}". Su ficha ha sido bloqueada.`, 'error', 5000);
  }
}

function limpiarTodosLosBaneosAdmin() {
  try {
    localStorage.removeItem('notigas_banned_users');
    localStorage.removeItem('notigas_deleted_vendor_ids');
  } catch(e){}

  const overlay = document.getElementById('appLockoutOverlay');
  if (overlay) overlay.style.display = 'none';

  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🔓 Todos los Bloqueos Eliminados', 'Se eliminaron todos los baneos y bloqueos de la base de datos.', 'info', 4500);
  }
}

// Purga automática inmediata de bloqueos de la base de datos
try {
  localStorage.removeItem('notigas_banned_users');
  localStorage.removeItem('notigas_deleted_vendor_ids');
} catch(e){}

function desbanearRepartidorAdmin(vendorId, vendorName) {
  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  deletedIds = deletedIds.filter(id => id !== vendorId);
  localStorage.setItem('notigas_deleted_vendor_ids', JSON.stringify(deletedIds));

  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}
  banned = banned.filter(b => b !== vendorName);
  localStorage.setItem('notigas_banned_users', JSON.stringify(banned));

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🔓 Repartidor Desbaneado', `Se restauró la cuenta e ingreso de "${vendorName}".`, 'success', 4000);
  }
}

function borrarRepartidorPermanente(vendorId, vendorName) {
  if (vendorId === 'driver_undefined' || !vendorId) {
    if (confirm(`⚠️ ¿Eliminar permanentemente a ${vendorName}?`)) {
      ejecutarBorradoRepartidor(vendorId, vendorName);
      if (typeof showToast === 'function') showToast('🗑️ Eliminado', `El repartidor ${vendorName} ha sido borrado exitosamente.`, 'success', 2000);
      renderAdminVendorsList();
    }
  } else {
    if (confirm(`⚠️ ¿Eliminar permanentemente a ${vendorName}?`)) {
      ejecutarBorradoRepartidor(vendorId, vendorName);
      if (typeof showToast === 'function') showToast('🗑️ Eliminado', `El repartidor ${vendorName} ha sido borrado exitosamente.`, 'success', 2000);
      renderAdminVendorsList();
    }
  }
}

function ejecutarBorradoRepartidor(vendorId, vendorName) {
  // 1. Eliminar de lista de repartidores en Supabase
  if (window.supabaseClient) {
      const realId = vendorId.replace('driver_', '');
      window.supabaseClient.from('choferes_habilitados').delete().eq('id', realId).then(({ error }) => {
          if (error) console.error("Error borrando de Supabase:", error);
      });
  }

  // 3. Añadir a lista negra de borrados para ocultar repartidores por defecto (hardcodeados)
  try {
    let deletedIds = [];
    const rawDeleted = localStorage.getItem('notigas_deleted_vendor_ids');
    if (rawDeleted) deletedIds = JSON.parse(rawDeleted);
    
    if (!deletedIds.includes(vendorId)) {
      deletedIds.push(vendorId);
      localStorage.setItem('notigas_deleted_vendor_ids', JSON.stringify(deletedIds));
    }
  } catch(e){}

  // 3. Limpiar notigas_user_data si coincide con el usuario activo
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre === vendorName) {
        localStorage.removeItem('notigas_user_data');
      }
    }
  } catch(e){}

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🗑️ Ficha Eliminada', `La Ficha de Repartidor "${vendorName}" fue eliminada permanentemente.`, 'info', 4000);
  }
}

function borrarCompradorPermanente(gmail, nombre) {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🗑️', `¿Eliminar Comprador ${nombre || gmail}?`, `Esta acción borrará la cuenta del comprador del sistema.`, 'Sí, eliminar', () => {
      ejecutarBorradoComprador(gmail, nombre);
    });
  } else {
    if (confirm(`🗑️ ¿Eliminar comprador ${nombre || gmail}?`)) {
      ejecutarBorradoComprador(gmail, nombre);
    }
  }
}

function ejecutarBorradoComprador(gmail, nombre) {
  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    databaseEmails = databaseEmails.filter(e => e.gmail !== gmail);
  }

  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail === gmail || u.nombre === nombre) {
        localStorage.removeItem('notigas_user_data');
      }
    }
  } catch(e){}

  renderAdminVendorsList();
  renderAdminDashboardKPIs();

  if (typeof showToast === 'function') {
    showToast('🗑️ Comprador Eliminado', `La cuenta de "${nombre || gmail}" fue eliminada del sistema.`, 'info', 4000);
  }
}

function renderAdminVendorsList() {
  const container = document.getElementById('adminVendorsListContainer');
  if (!container) return;

  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  const defaultVendors = [
    { id: "vendor_1", name: "Gas GLP N° 42", category: "Gas GLP", plate: "3842-XYZ", verified: true },
    { id: "vendor_2", name: "Agua Cristallina 20L", category: "Agua 20L", plate: "2105-ABC", verified: true },
    { id: "vendor_3", name: "Chatarra El Vecino", category: "Chatarra", plate: "1892-DFG", verified: false },
    { id: "vendor_4", name: "EcoReciclaje Papel", category: "Papel", plate: "4412-KLS", verified: true },
    { id: "vendor_5", name: "Camión Agrícola Frutas", category: "Frutas", plate: "5011-BTR", verified: false },
    { id: "vendor_6", name: "Detergentes Limpieza", category: "Detergentes", plate: "1098-MMN", verified: true },
    { id: "vendor_7", name: "Carbonería El Fuego", category: "Carbón", plate: "2389-ZXP", verified: true }
  ];

  if (window.supabaseClient) {
      window.supabaseClient.from('choferes_habilitados').select('*').then(({ data }) => {
          if (data && data.length > 0) {
              data.forEach(d => {
                  if (!defaultVendors.some(v => v.name === d.nombre_completo)) {
                      defaultVendors.unshift({
                          id: `driver_${d.id}`,
                          name: d.nombre_completo,
                          category: d.categoria || 'Gas GLP',
                          plate: d.placa || 'Placa registrada',
                          verified: d.estado_verificacion === 'aprobado'
                      });
                  }
              });
          }
          renderFinalVendors(defaultVendors, deletedIds);
      });
  } else {
      renderFinalVendors(defaultVendors, deletedIds);
  }
}

function renderFinalVendors(defaultVendors, deletedIds) {
  const finalVendors = defaultVendors.filter(v => !deletedIds.includes(v.id));

  let html = `<div style="font-weight:900; color:#FF6D00; margin-bottom:6px; font-size:11.5px;"><i class="fa-solid fa-truck-fast"></i> 🚛 REPARTIDORES Y NEGOCIOS DEL SISTEMA:</div>`;

  finalVendors.forEach((v) => {
    const isBanned = esRepartidorBaneado(v.name, v.plate, v.whatsapp);
    html += `
      <div style="background:#1E293B; padding:10px 12px; border-radius:10px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.7' : '1'}; margin-bottom:6px;">
        <div>
          <strong style="color:${isBanned ? '#EF4444' : '#FF6D00'}; font-size:12px;">${isBanned ? '🚫 [BLOQUEADO/BANEADO] ' : (v.verified ? '👑 ' : '')}${escapeHtmlStr(v.name)}</strong>
          <span style="font-size:10.5px; color:#CBD5E1;"> (${escapeHtmlStr(v.category)})</span>
          <div style="font-size:10px; color:#94A3B8; margin-top:2px;">Placa: ${escapeHtmlStr(v.plate)} • Estado: ${isBanned ? '<span style="color:#EF4444; font-weight:700;">ACCESO BLOQUEADO</span>' : '<span style="color:#00B0FF; font-weight:700;">ACTIVO</span>'}</div>
        </div>
        <div style="display:flex; gap:4px;">
          ${isBanned ? `
            <button onclick="desbanearRepartidorAdmin('${v.id}', '${v.name}')" style="background:#0288D1; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-lock-open"></i> Desbanear</button>
          ` : `
            <button onclick="banearRepartidorAdmin('${v.id}', '${v.name}', '${v.plate}')" style="background:#E65100; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-user-slash"></i> Banear</button>
          `}
          <button onclick="borrarRepartidorPermanente('${v.id}', '${v.name}')" style="background:#D32F2F; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>
        </div>
      </div>
    `;
  });

  // SECCIÓN COMPRADORES REGISTRADOS
  html += `<div style="font-weight:900; color:#38BDF8; margin:12px 0 6px; font-size:11.5px;"><i class="fa-solid fa-users"></i> 🛍️ COMPRADORES Y USUARIOS VECINALES:</div>`;

  let buyersList = [];
  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    buyersList = databaseEmails.filter(e => e.role === 'Cliente' || e.role === 'vecino' || !e.role);
  }

  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role !== 'repartidor' && u.gmail && !buyersList.some(b => b.gmail === u.gmail)) {
        buyersList.unshift({ gmail: u.gmail, role: 'Comprador Vecinal', nombre: u.nombre || 'Usuario' });
      }
    }
  } catch(e){}

  if (buyersList.length === 0) {
    html += '<div style="color:#64748B; font-style:italic; font-size:10.5px;">No hay compradores registrados aún.</div>';
  } else {
    buyersList.forEach(b => {
      const isBanned = esRepartidorBaneado(b.nombre || '', '', '', b.gmail);
      html += `
        <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.7' : '1'}; margin-bottom:4px;">
          <div>
            <strong style="color:${isBanned ? '#EF4444' : '#38BDF8'}; font-size:11.5px;">${isBanned ? '🚫 [BLOQUEADO] ' : '👤 '}${escapeHtmlStr(b.nombre || b.gmail)}</strong>
            <div style="font-size:9.5px; color:#94A3B8;">${escapeHtmlStr(b.gmail)} • ${isBanned ? '<span style="color:#EF4444; font-weight:700;">ACCESO BLOQUEADO</span>' : '<span style="color:#00B0FF;">Activo</span>'}</div>
          </div>
          <div style="display:flex; gap:4px;">
            <button onclick="banearUsuarioAdmin('${escapeHtmlStr(b.gmail)}')" style="background:${isBanned ? '#0288D1' : '#E65100'}; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;">${isBanned ? '🔓 Desbanear' : '🚫 Banear'}</button>
            <button onclick="borrarCompradorPermanente('${escapeHtmlStr(b.gmail)}', '${escapeHtmlStr(b.nombre || b.gmail)}')" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function verificarBloqueoAppUsuario() {
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (!saved) return;
    const u = JSON.parse(saved);

    const isBanned = (typeof esRepartidorBaneado === 'function') 
      ? esRepartidorBaneado(u.nombre, u.placa, u.whatsapp, u.gmail)
      : false;

    if (isBanned) {
      activarBloqueoPantallaCompletaApp();
    }
  } catch(e){}
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
function renderAdminOrdersList() {
  const container = document.getElementById('adminOrdersMonitorContainer');
  if (!container) return;

  let totalCount = 0;
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-size:11px; color:#94A3B8;">Inspecciona todos los pedidos y alertas activas en el mapa:</span>
      <button onclick="limpiarTodosLosPedidosFantasmaAdmin()" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;"><i class="fa-solid fa-broom"></i> 🧹 Borrar TODOS los Pedidos Fantasma</button>
    </div>
  `;

  // 1. Pedido Activo de Comprador
  const rawOrder = localStorage.getItem('notigas_active_order');
  if (rawOrder) {
    try {
      const order = JSON.parse(rawOrder);
      totalCount++;
      const mins = Math.floor((Date.now() - (order.timestamp || Date.now())) / 60000);
      html += `
        <div style="background:#1E293B; padding:12px; border-radius:10px; border:1.5px solid #FF6D00; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12.5px; font-weight:900; color:#FF6D00;"><i class="fa-solid fa-box"></i> Pedido Vecinal Activo en Mapa</span>
            <span style="font-size:10px; background:rgba(255,109,0,0.2); color:#FF8F00; padding:2px 6px; border-radius:4px; font-weight:700;">⏱ Hace ${mins} min</span>
          </div>
          <div style="font-size:11.5px; color:white; margin-top:6px;">
            <strong>Producto:</strong> ${escapeHtmlStr(order.categoria)} (${escapeHtmlStr(order.cantidad || '1 un')})<br>
            <strong>Dirección:</strong> ${escapeHtmlStr(order.callePrincipal || 'Georeferenciada')}<br>
            <strong>Teléfono:</strong> <span style="color:#00E676; font-weight:800;">${escapeHtmlStr(order.telefono || 'No especificado')}</span><br>
            <span style="font-size:10px; color:#94A3B8;">Coordenadas: Lat ${order.lat ? order.lat.toFixed(5) : '-'}, Lng ${order.lng ? order.lng.toFixed(5) : '-'}</span>
          </div>
          <button onclick="borrarPedidoFantasmaAdmin('active_order')" style="margin-top:8px; width:100%; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">
            <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Pedido Fantasma
          </button>
        </div>
      `;
    } catch(e){}
  }

  // 2. Alertas de Camión / Pánico reportadas por vecinos
  let truckBuffer = [];
  try {
    const raw = localStorage.getItem('notigas_reported_trucks_buffer');
    if (raw) truckBuffer = JSON.parse(raw);
  } catch(e){}

  truckBuffer.forEach((t, idx) => {
    totalCount++;
    const mins = Math.floor((Date.now() - (t.timestamp || Date.now())) / 60000);
    html += `
      <div style="background:#1E293B; padding:12px; border-radius:10px; border:1px solid rgba(0,230,118,0.4); margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:800; color:#00E676;"><i class="fa-solid fa-bell"></i> Alerta Camión Oído / Visto (Reporte Vecinal)</span>
          <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00E676; padding:2px 6px; border-radius:4px; font-weight:700;">Hace ${mins} min</span>
        </div>
        <div style="font-size:11px; color:white; margin-top:4px;">
          <strong>Reportado por:</strong> ${escapeHtmlStr(t.reporter || 'Vecino')}<br>
          <span style="font-size:10px; color:#94A3B8;">Coordenadas: Lat ${t.lat ? t.lat.toFixed(5) : '-'}, Lng ${t.lng ? t.lng.toFixed(5) : '-'}</span>
        </div>
        <button onclick="borrarPedidoFantasmaAdmin('truck_report', ${idx})" style="margin-top:8px; width:100%; background:rgba(211,47,47,0.8); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:10px; cursor:pointer;">
          <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Alerta Fantasma
        </button>
      </div>
    `;
  });

  if (totalCount === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 12px; color:#94A3B8; font-size:12px; background:#1E293B; border-radius:10px; border:1px dashed rgba(255,255,255,0.15);">
        <i class="fa-solid fa-box-open" style="font-size:28px; color:#00E676; margin-bottom:8px;"></i><br>
        <strong style="color:white;">No hay pedidos activos ni alertas en el mapa.</strong><br>
        <span style="font-size:10px; color:#64748B;">El mapa está limpio. Todos los pedidos solicitados se mostrarán aquí para su inspección.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = html;
}

function borrarPedidoFantasmaAdmin(tipo, index = null) {
  if (tipo === 'active_order') {
    localStorage.removeItem('notigas_active_order');
  } else if (tipo === 'truck_report' && index !== null) {
    try {
      const raw = localStorage.getItem('notigas_reported_trucks_buffer');
      if (raw) {
        let buffer = JSON.parse(raw);
        buffer.splice(index, 1);
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
    showToast('🗑️ Pedido Fantasma Removido', 'El pedido fue purgado y eliminado del mapa en tiempo real.', 'info', 4000);
  }
}

function limpiarTodosLosPedidosFantasmaAdmin() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🧹', '¿Borrar TODOS los Pedidos Fantasma?', 'Se eliminarán de inmediato todos los pedidos activos y reportes del mapa.', 'Sí, limpiar todo', () => {
      ejecutarLimpiezaTotalPedidos();
    });
  } else {
    if (confirm('🧹 ¿Borrar TODOS los pedidos y reportes del mapa?')) {
      ejecutarLimpiezaTotalPedidos();
    }
  }
}

function ejecutarLimpiezaTotalPedidos() {
  localStorage.removeItem('notigas_active_order');
  localStorage.removeItem('notigas_reported_trucks_buffer');

  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
  if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();

  renderAdminOrdersList();
  renderAdminDashboardKPIs();

  if (typeof showToast === 'function') {
    showToast('🧹 Limpieza Total Ejecutada', 'Todos los pedidos e indicadores del mapa fueron eliminados.', 'success', 4000);
  }
}

function guardarSubmenuAnuncios() {
  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO RESTRINGIDO\nDebes ingresar tus credenciales de Administrador para modificar anuncios.");
    abrirModalAdminLogin();
    return;
  }

  const adsenseId = (document.getElementById('inputAdsenseId')?.value || '').trim();
  const adsenseSlot = (document.getElementById('inputAdsenseSlotId')?.value || '').trim();
  const adsenseMode = (document.getElementById('inputAdsenseMode')?.value || '').trim();
  const inputAd = (document.getElementById('inputAdText')?.value || '').trim();
  const inputUrl = (document.getElementById('inputAdUrl')?.value || '').trim();

  localStorage.setItem('notigas_adsense_id', adsenseId);
  localStorage.setItem('notigas_adsense_slot_id', adsenseSlot);
  localStorage.setItem('notigas_adsense_mode', adsenseMode);
  localStorage.setItem('notigas_ad_text', inputAd);
  localStorage.setItem('notigas_ad_url', inputUrl);

  if (adsenseMode === 'adsense' && adsenseId && typeof inyectarGoogleAdsenseScript === 'function') {
    inyectarGoogleAdsenseScript(adsenseId);
  }

  if (typeof actualizarAnunciosEnVivo === 'function') {
    actualizarAnunciosEnVivo(inputAd, inputUrl);
  }

  // Sincronizar con Supabase para que los clientes web y móviles lo vean
  if (window.supabaseClient) {
    const base64Img = localStorage.getItem('notigas_ad_image_base64') || '';
    const payload = {
        tipo: 'anuncioGlobal',
        titulo: inputAd,
        descripcion: 'Anuncio Global Sponsor',
        comentarios: [{ url: inputUrl, image: base64Img }], // Usamos comentarios como JSON storage
        categoria: 'Publicidad',
        user_email: 'admin@notigas.com',
        user_role: 'admin',
        ciudad: 'Global',
        barrio_otb: 'Global'
    };
    
    window.supabaseClient.from('publicaciones').select('id').eq('tipo', 'anuncioGlobal').single().then(({data}) => {
        if (data) {
            window.supabaseClient.from('publicaciones').update(payload).eq('id', data.id).then();
        } else {
            window.supabaseClient.from('publicaciones').insert([payload]).then();
        }
    });
  }

  closeAdminModal();
  alert('📢 CONFIGURACIÓN DE PUBLICIDAD Y ADSENSE GUARDADA CON ÉXITO\n\nLos cambios en anuncios locales e integración con Google AdSense ya están activos.');
}

function guardarAdminConfig() {
  const inputGmail = document.getElementById('inputGmail');
  const inputPass = document.getElementById('inputPass');
  if (!inputGmail || !inputPass) return;

  // Rate Limiting Check
  let attempts = parseInt(localStorage.getItem('notigas_admin_login_attempts') || '0');
  let lockoutUntil = parseInt(localStorage.getItem('notigas_admin_lockout_until') || '0');

  if (Date.now() < lockoutUntil) {
    const minutesLeft = Math.ceil((lockoutUntil - Date.now()) / 60000);
    alert(`⛔ BLOQUEO DE SEGURIDAD\nDemasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minutos.`);
    return;
  }

  const gmail = inputGmail.value.trim().toLowerCase();
  const pass = inputPass.value.trim();

  if (!gmail) {
    alert('Por favor ingresa tu correo Gmail de Administrador.');
    return;
  }

  if (!AUTHORIZED_ADMIN_EMAILS.includes(gmail) || pass !== REQUIRED_ADMIN_PASSWORD) {
    attempts++;
    if (attempts >= 3) {
      localStorage.setItem('notigas_admin_lockout_until', (Date.now() + 15 * 60000).toString());
      localStorage.setItem('notigas_admin_login_attempts', '0');
      alert(`⛔ BLOQUEO DE SEGURIDAD\nHas fallado 3 veces. El acceso ha sido bloqueado por 15 minutos.`);
    } else {
      localStorage.setItem('notigas_admin_login_attempts', attempts.toString());
      alert(`⛔ CREDENCIALES INCORRECTAS\nTe quedan ${3 - attempts} intentos antes de ser bloqueado.`);
    }
    return;
  }

  // Reset attempts on success
  localStorage.setItem('notigas_admin_login_attempts', '0');
  localStorage.removeItem('notigas_admin_lockout_until');

  sessionStorage.setItem('notigas_admin_session', gmail);
  
  const loginScreen = document.getElementById('adminLoginScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');
  if (loginScreen) loginScreen.style.display = 'none';
  if (dashboardScreen) dashboardScreen.style.display = 'block';

  switchModalTab(0);
  renderAdminReports();
  renderAdminDashboardKPIs();
  alert(`🔐 ACCESO DE ADMINISTRADOR DESBLOQUEADO\n\nBienvenido Administrador (${gmail}). Menús de administración activados.`);
}

function cerrarSesionAdminControl() {
  sessionStorage.removeItem('notigas_admin_session');
  const loginScreen = document.getElementById('adminLoginScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');
  if (loginScreen) loginScreen.style.display = 'block';
  if (dashboardScreen) dashboardScreen.style.display = 'none';
  alert('🔒 Sesión de Administrador cerrada correctamente.');
}

/* DESCARGA COMPLETA DE CORREOS ELECTRONICOS REGISTRADOS (.CSV DE USUARIOS) */
function descargarListaCorreosCSV() {
  let currentAdmin = sessionStorage.getItem('notigas_admin_session');
  
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.");
    abrirModalAdminLogin();
    return;
  }

  let emailsList = [];

  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    emailsList = [...databaseEmails];
  }

  AUTHORIZED_ADMIN_EMAILS.forEach(email => {
    emailsList.push({
      gmail: email,
      role: 'Administrador',
      fecha: new Date().toISOString().split('T')[0]
    });
  });

  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) {
        emailsList.push({
          gmail: u.gmail,
          role: u.role === 'repartidor' || u.role === 'chofer' ? 'Repartidor' : 'Cliente',
          fecha: new Date().toISOString().split('T')[0]
        });
      }
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
    alert('No hay correos electrónicos de usuarios registrados aún.');
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
  let currentAdmin = sessionStorage.getItem('notigas_admin_session');
  
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.");
    abrirModalAdminLogin();
    return;
  }

  let driversList = [];
  if (window.supabaseClient) {
      const { data } = await window.supabaseClient.from('choferes_habilitados').select('*');
      if (data) driversList = data;
  }

  if (driversList.length === 0) {
    driversList = [
      { nombre_completo: "Gas GLP N° 42", telefono_whatsapp: "74xxxx28", placa: "3842-XYZ", categoria: "Gas GLP", productos: "Garrafas GLP 10kg, reguladores", zonas: "OTB Central", schedule: "07:00 a 18:00", created_at: "2026-08-01" },
      { nombre_completo: "Agua Cristallina 20L", telefono_whatsapp: "74xxxx28", placa: "2105-ABC", categoria: "Agua 20L", productos: "Botellones 20L, surtidores", zonas: "Zona Norte", schedule: "08:00 a 17:00", created_at: "2026-08-01" }
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
function descargarEstadisticasGeneralesCSV() {
  let currentAdmin = sessionStorage.getItem('notigas_admin_session');
  
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.");
    abrirModalAdminLogin();
    return;
  }

  const elUsers = document.getElementById('adminKpiUsers');
  const elVendors = document.getElementById('adminKpiVendors');
  const elOrders = document.getElementById('adminKpiOrders');
  const elReports = document.getElementById('adminKpiReports');

  const usersCount = elUsers ? elUsers.innerText : '0';
  const vendorsCount = elVendors ? elVendors.innerText : '0';
  const ordersCount = elOrders ? elOrders.innerText : '0';
  const reportsCount = elReports ? elReports.innerText : '0';
  const fechaHoy = new Date().toISOString().split('T')[0];

  let csvRows = ["Metrica,Valor,Fecha"];
  csvRows.push(`"Usuarios Totales","${usersCount}","${fechaHoy}"`);
  csvRows.push(`"Repartidores Activos","${vendorsCount}","${fechaHoy}"`);
  csvRows.push(`"Pedidos del Dia","${ordersCount}","${fechaHoy}"`);
  csvRows.push(`"Denuncias Emitidas","${reportsCount}","${fechaHoy}"`);

  const csvString = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `estadisticas_generales_notigas_${fechaHoy}.csv`);
  document.body.appendChild(link);
  link.click();
async function renderAdminReports() {
  const container = document.getElementById('adminReportsContainer');
  const bannedContainer = document.getElementById('adminBannedList');
  if (!container || !bannedContainer || !window.supabaseClient) return;

  // 1. Fetch Denuncias
  const { data: reports } = await window.supabaseClient.from('denuncias').select('*').order('created_at', { ascending: false });
  
  if (!reports || reports.length === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay denuncias pendientes de revisión.</div>';
  } else {
    let html = '';
    reports.forEach((rep) => {
      html += `
        <div style="background:#1E293B; padding:6px 8px; border-radius:6px; border-left:3px solid #EF4444; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${escapeHtmlStr(rep.target || 'Publicación')}</strong>: ${escapeHtmlStr(rep.motivo)}
            <div style="font-size:9px; color:#94A3B8;">${escapeHtmlStr(rep.detalle || 'Sin detalle')}</div>
          </div>
          <div style="display:flex; gap:4px;">
            <button onclick="borrarDenunciaAdmin('${rep.id}')" style="background:#0288D1; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Desestimar">👍 Ok</button>
            <button onclick="banearUsuarioAdmin('${escapeHtmlStr(rep.target)}')" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Banear Usuario">🚫 Banear</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // 2. Fetch Baneados
  const { data: banned } = await window.supabaseClient.from('usuarios_baneados').select('*');

  if (!banned || banned.length === 0) {
    bannedContainer.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay usuarios baneados actualmente.</div>';
  } else {
    let html = '';
    banned.forEach((u) => {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#1E293B; padding:4px 8px; border-radius:4px;">
          <span>🚫 ${escapeHtmlStr(u.identificador)}</span>
          <button onclick="desbanearUsuarioAdmin('${u.id}')" style="background:#00E676; color:#0F172A; border:none; padding:2px 6px; border-radius:4px; font-weight:700; font-size:9px; cursor:pointer;">Desbanear</button>
        </div>
      `;
    });
    bannedContainer.innerHTML = html;
  }

  renderAdminChatInspector();
}2px 6px; border-radius:4px; font-weight:700; font-size:9px; cursor:pointer;">Desbanear</button>
        </div>
      `;
    });
    bannedContainer.innerHTML = html;
  }

  // Renderizar también la sección de Inspección de Chats Privados
  renderAdminChatInspector();
}

function renderAdminChatInspector() {
  const container = document.getElementById('adminChatInspectorContainer');
  if (!container) return;

  const activeChats = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('notigas_private_chat_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const msgs = JSON.parse(raw);
          if (msgs.length > 0) {
            const parts = key.split('notigas_private_chat_')[1]?.split('_') || [];
            const vendorName = parts[0] || 'Repartidor';
            const userName = parts.slice(1).join(' ') || 'Cliente';
            const lastMsg = msgs[msgs.length - 1];
            activeChats.push({ key, vendorName, userName, lastMsg, count: msgs.length });
          }
        }
      }
    }
  } catch(e){}

  if (activeChats.length === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic; font-size:10.5px;">No hay conversaciones privadas activas registradas.</div>';
    return;
  }

  let html = '';
  activeChats.forEach(c => {
    const snippet = escapeHtmlStr((c.lastMsg?.text || '').substring(0, 50));
    html += `
      <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:#38BDF8; font-size:11px;">💬 Chat: ${escapeHtmlStr(c.userName)} ↔ ${escapeHtmlStr(c.vendorName)}</strong>
          <div style="font-size:10px; color:#94A3B8; margin-top:2px;">"${snippet}${(c.lastMsg?.text || '').length > 50 ? '...' : ''}" • <span style="color:#CBD5E1;">${c.count} msgs</span></div>
        </div>
        <div style="display:flex; gap:4px;">
          <button onclick="abrirInspectorChatAdmin('${encodeURIComponent(c.vendorName)}', '${encodeURIComponent(c.key)}')" style="background:#FF6D00; color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-eye"></i> Inspeccionar</button>
          <button onclick="purgaChatEspecificoAdmin('${encodeURIComponent(c.key)}')" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Purgar</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function abrirInspectorChatAdmin(encodedVendor, encodedKey) {
  const vendorName = decodeURIComponent(encodedVendor || '');
  const key = decodeURIComponent(encodedKey || '');

  closeAdminModal();
  if (typeof abrirFloatingChat === 'function') abrirFloatingChat();

  const sel = document.getElementById('selectVendorChat');
  if (sel && vendorName) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.toLowerCase().includes(vendorName.toLowerCase())) {
        sel.selectedIndex = i;
        break;
      }
    }
  }

  if (key) {
    sessionStorage.setItem('notigas_admin_viewing_user', key);
  }

  if (typeof cambiarVendedorChat === 'function') cambiarVendedorChat();
}

function purgaChatEspecificoAdmin(encodedKey) {
  const key = decodeURIComponent(encodedKey || '');
  if (key) {
    localStorage.removeItem(key);
    renderAdminChatInspector();
    if (typeof showToast === 'function') {
      showToast('🗑️ Chat Purgado', 'La conversación privada seleccionada fue eliminada permanentemente.', 'info', 4000);
    }
  }
}

async function banearUsuarioAdmin(identifier) {
  if (!identifier || !window.supabaseClient) return;

  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
    identificador: identifier,
    motivo: 'Baneado por Administrador'
  }]);

  if (!error) {
    alert(`🚫 USUARIO BANEADO\nEl usuario (${identifier}) ha sido restringido de publicar en NOTIGAS.`);
  }

  renderAdminReports();
}

async function desbanearUsuarioAdmin(id) {
  if (!id || !window.supabaseClient) return;

  const { error } = await window.supabaseClient.from('usuarios_baneados').delete().eq('id', id);

  if (!error) {
    alert(`✅ USUARIO DESBANEADO\nSe ha retirado el ban.`);
  }

  renderAdminReports();
}

async function borrarDenunciaAdmin(indexId) {
  if (!window.supabaseClient) return;
  const { error } = await window.supabaseClient.from('denuncias').delete().eq('id', indexId);
  if (error) console.error(error);
  renderAdminReports();
}

/* FUNCIONALIDAD DEL MODAL DE DENUNCIAS (REPORTAR CONTENIDO / USUARIO) */
function abrirModalDenuncia(contextTitle, targetInfo) {
  const modal = document.getElementById('modalReport');
  const label = document.getElementById('reportTargetLabel');
  const inputContext = document.getElementById('reportContext');

  if (label) label.innerText = `Reportar ${contextTitle}: "${targetInfo}"`;
  if (inputContext) inputContext.value = `${contextTitle} - ${targetInfo}`;

  if (modal) modal.style.display = 'flex';
}

function closeReportModal() {
  const modal = document.getElementById('modalReport');
  if (modal) modal.style.display = 'none';
}

async function enviarDenuncia() {
  const context = document.getElementById('reportContext')?.value || 'General';
  const motivo = document.getElementById('selectReportMotivo')?.value || 'Contenido Ofensivo';
  const detalle = document.getElementById('inputReportDetalle')?.value.trim() || '';

  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('denuncias').insert([{
      target: context,
      motivo: motivo,
      detalle: detalle
    }]);
    if (error) console.error("Error enviando denuncia:", error);
  }

  closeReportModal();
  const inputDetalle = document.getElementById('inputReportDetalle');
  if (inputDetalle) inputDetalle.value = '';

  alert('🛡️ Denuncia registrada de forma segura. El equipo de moderación revisará el elemento reportado.');
}

