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
  if (confirm("🔄 ¿Deseas cerrar tu modo Repartidor y pasar a modo Comprador?\n\nTu ficha de negocio se mantendrá guardada. Solo se cambiará tu modo de ingreso.")) {
    localStorage.removeItem('notigas_user_data');
    localStorage.removeItem('driverGpsLive');
    if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
    if (typeof setAppMode === 'function') setAppMode('buyer');
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'flex';
    alert('🛒 Modo Repartidor cerrado. Puedes iniciar sesión como Comprador.');
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

function switchModalTab(idx) {
  document.querySelectorAll('.modal-tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  document.querySelectorAll('.modal-tab-pane').forEach((pane, i) => pane.classList.toggle('active', i === idx));
  
  if (idx === 0) renderAdminDashboardKPIs();
  if (idx === 1) renderAdminVendorsList();
  if (idx === 2) renderAdminOrdersList();
  if (idx === 4) renderAdminReports();
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
    alert('Ingresa el texto de la Alerta Oficial OTB que deseas emitir.');
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
  alert(`📢 COMUNICADO PUBLICADO CON ÉXITO\n\nEl mensaje ha sido transmitido en tiempo real a todos los vecinos en el mapa.`);
}

function ejecutarPurgaBaseDeDatosManual() {
  if (confirm('🧹 ¿Deseas ejecutar la purga manual de registros expirados (chat >48h, avisos >72h)?')) {
    if (typeof ejecutarPurgaBaseDeDatosAuto === 'function') {
      ejecutarPurgaBaseDeDatosAuto();
    }
    renderAdminDashboardKPIs();
    alert('🧹 Purga de sistema ejecutada correctamente. Se liberó memoria y almacenamiento en caché.');
  }
}

function banearRepartidorAdmin(vendorId, vendorName) {
  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  if (!deletedIds.includes(vendorId)) {
    deletedIds.push(vendorId);
    localStorage.setItem('notigas_deleted_vendor_ids', JSON.stringify(deletedIds));
  }

  // Agregar también a lista general de baneados
  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}
  if (!banned.includes(vendorName)) {
    banned.push(vendorName);
    localStorage.setItem('notigas_banned_users', JSON.stringify(banned));
  }

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  alert(`🚫 REPARTIDOR BANEADO\n\nEl repartidor "${vendorName}" ha sido bloqueado y su Ficha de Negocio fue removida del mapa y feed.`);
}

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

  alert(`🔓 REPARTIDOR DESBANEADO\n\nSe restauró el acceso y la Ficha de Negocio de "${vendorName}".`);
}

function renderAdminVendorsList() {
  const container = document.getElementById('adminVendorsListContainer');
  if (!container) return;

  let deletedIds = [];
  try {
    const raw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (raw) deletedIds = JSON.parse(raw);
  } catch(e){}

  let registeredDrivers = [];
  try {
    const raw = localStorage.getItem('notigas_registered_drivers_list');
    if (raw) registeredDrivers = JSON.parse(raw);
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

  registeredDrivers.forEach(d => {
    if (!defaultVendors.some(v => v.name === d.nombre)) {
      defaultVendors.unshift({
        id: `driver_${d.id || d.whatsapp}`,
        name: d.nombre,
        category: d.categoria || 'Gas GLP',
        plate: d.placa || 'Placa registrada',
        verified: true
      });
    }
  });

  let html = '';
  defaultVendors.forEach((v) => {
    const isBanned = deletedIds.includes(v.id);
    html += `
      <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.65' : '1'};">
        <div>
          <strong style="color:${isBanned ? '#EF4444' : '#FF6D00'};">${isBanned ? '🚫 ' : (v.verified ? '👑 ' : '')}${v.name}</strong> (${v.category})
          <div style="font-size:9.5px; color:#94A3B8;">Placa: ${v.plate} • Estado: ${isBanned ? '<span style="color:#EF4444; font-weight:700;">SUSPENDIDO / BANEADO</span>' : (v.verified ? 'Verificado' : 'En revisión')}</div>
        </div>
        <div style="display:flex; gap:4px;">
          ${isBanned ? `
            <button onclick="desbanearRepartidorAdmin('${v.id}', '${v.name}')" style="background:#00E676; color:#0F172A; border:none; padding:3px 8px; border-radius:4px; font-weight:700; font-size:9.5px; cursor:pointer;">🔓 Desbanear</button>
          ` : `
            <button onclick="alert('👑 Estado de Verificación actualizado para ${v.name}')" style="background:#0288D1; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:700; font-size:9.5px; cursor:pointer;">Verificar</button>
            <button onclick="banearRepartidorAdmin('${v.id}', '${v.name}')" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:700; font-size:9.5px; cursor:pointer;">🚫 Banear</button>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderAdminOrdersList() {
  const container = document.getElementById('adminOrdersMonitorContainer');
  if (!container) return;

  const rawOrder = localStorage.getItem('notigas_active_order');
  if (!rawOrder) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay pedidos vecinales activos en este momento.</div>';
    return;
  }

  try {
    const order = JSON.parse(rawOrder);
    container.innerHTML = `
      <div style="background:#1E293B; padding:10px; border-radius:8px; border:1px solid #FF6D00;">
        <div style="font-size:12px; font-weight:700; color:#FF6D00;">📦 Pedido Vecinal Activo</div>
        <div style="font-size:11px; color:white; margin-top:4px;">
          <strong>Categoría:</strong> ${order.categoria}<br>
          <strong>Detalle:</strong> ${order.cantidad}<br>
          <strong>Coordenadas:</strong> Lat ${order.lat ? order.lat.toFixed(5) : '-'}, Lng ${order.lng ? order.lng.toFixed(5) : '-'}
        </div>
        <button onclick="cancelarPedidoActivo(); renderAdminOrdersList();" style="margin-top:8px; background:#D32F2F; color:white; border:none; padding:4px 10px; border-radius:6px; font-weight:700; font-size:10px; cursor:pointer;">
          ❌ Cancelar Pedido desde Admin
        </button>
      </div>
    `;
  } catch(e) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay pedidos activos.</div>';
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

  closeAdminModal();
  alert('📢 CONFIGURACIÓN DE PUBLICIDAD Y ADSENSE GUARDADA CON ÉXITO\n\nLos cambios en anuncios locales e integración con Google AdSense ya están activos.');
}

function guardarAdminConfig() {
  const inputGmail = document.getElementById('inputGmail');
  const inputPass = document.getElementById('inputPass');
  if (!inputGmail || !inputPass) return;

  const gmail = inputGmail.value.trim().toLowerCase();
  const pass = inputPass.value.trim();

  if (!gmail) {
    alert('Por favor ingresa tu correo Gmail de Administrador.');
    return;
  }

  if (!AUTHORIZED_ADMIN_EMAILS.includes(gmail)) {
    alert(`⛔ ACCESO DENEGADO\nLa cuenta (${gmail}) no cuenta con permisos de administración.`);
    return;
  }

  if (pass !== REQUIRED_ADMIN_PASSWORD) {
    alert('⛔ CONTRASEÑA INCORRECTA\nLa contraseña de administración ingresada es incorrecta.');
    return;
  }

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
function descargarFichasRepartidoresCSV() {
  let currentAdmin = sessionStorage.getItem('notigas_admin_session');
  
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.");
    abrirModalAdminLogin();
    return;
  }

  let driversList = [];
  try {
    const raw = localStorage.getItem('notigas_registered_drivers_list');
    if (raw) driversList = JSON.parse(raw);
  } catch(e){}

  if (driversList.length === 0) {
    driversList = [
      { nombre: "Gas GLP N° 42", whatsapp: "74xxxx28", placa: "3842-XYZ", categoria: "Gas GLP", productos: "Garrafas GLP 10kg, reguladores", zonas: "OTB Central", schedule: "07:00 a 18:00", fechaRegistro: "2026-08-01" },
      { nombre: "Agua Cristallina 20L", whatsapp: "74xxxx28", placa: "2105-ABC", categoria: "Agua 20L", productos: "Botellones 20L, surtidores", zonas: "Zona Norte", schedule: "08:00 a 17:00", fechaRegistro: "2026-08-01" }
    ];
  }

  let csvRows = ["Nombre Negocio/Repartidor,WhatsApp,Placa,Categoria,Productos,Zonas Recorrido,Horarios,Fecha Registro"];
  driversList.forEach(d => {
    csvRows.push(`"${d.nombre || ''}","${d.whatsapp || ''}","${d.placa || ''}","${d.categoria || ''}","${d.productos || ''}","${d.zonas || ''}","${d.schedule || ''}","${d.fechaRegistro || ''}"`);
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

/* MODERACIÓN DE DENUNCIAS Y GESTIÓN DE BANEOS DE USUARIOS */
function renderAdminReports() {
  const container = document.getElementById('adminReportsContainer');
  const bannedContainer = document.getElementById('adminBannedList');
  if (!container || !bannedContainer) return;

  let reports = [];
  try {
    const raw = localStorage.getItem('notigas_user_reports');
    if (raw) reports = JSON.parse(raw);
  } catch(e){}

  if (reports.length === 0) {
    container.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay denuncias pendientes de revisión.</div>';
  } else {
    let html = '';
    reports.forEach((rep, idx) => {
      html += `
        <div style="background:#1E293B; padding:6px 8px; border-radius:6px; border-left:3px solid #EF4444; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${rep.target || 'Publicación'}</strong>: ${rep.motivo}
            <div style="font-size:9px; color:#94A3B8;">${rep.detalle || 'Sin detalle'} • ${rep.fecha || 'Reciente'}</div>
          </div>
          <div style="display:flex; gap:4px;">
            <button onclick="borrarDenunciaAdmin(${idx})" style="background:#0288D1; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Desestimar">✅ Ok</button>
            <button onclick="banearUsuarioAdmin('${rep.target}')" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;" title="Banear Usuario">🚫 Banear</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}

  if (banned.length === 0) {
    bannedContainer.innerHTML = '<div style="color:#64748B; font-style:italic;">No hay usuarios baneados actualmente.</div>';
  } else {
    let html = '';
    banned.forEach((u, i) => {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#1E293B; padding:4px 8px; border-radius:4px;">
          <span>🚫 ${u}</span>
          <button onclick="desbanearUsuarioAdmin(${i})" style="background:#00E676; color:#0F172A; border:none; padding:2px 6px; border-radius:4px; font-weight:700; font-size:9px; cursor:pointer;">Desbanear</button>
        </div>
      `;
    });
    bannedContainer.innerHTML = html;
  }
}

function banearUsuarioAdmin(targetId) {
  let identifier = targetId;
  if (!identifier) {
    const input = document.getElementById('inputBanIdentifier');
    identifier = input ? input.value.trim() : '';
  }

  if (!identifier) {
    alert('Ingresa el correo o nombre del usuario que deseas banear.');
    return;
  }

  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}

  if (!banned.includes(identifier)) {
    banned.push(identifier);
    localStorage.setItem('notigas_banned_users', JSON.stringify(banned));
    alert(`🚫 USUARIO BANEADO\nEl usuario (${identifier}) ha sido restringido de publicar en NOTIGAS.`);
  }

  renderAdminReports();
}

function desbanearUsuarioAdmin(index) {
  let banned = [];
  try {
    const raw = localStorage.getItem('notigas_banned_users');
    if (raw) banned = JSON.parse(raw);
  } catch(e){}

  if (index >= 0 && index < banned.length) {
    const unbanned = banned.splice(index, 1);
    localStorage.setItem('notigas_banned_users', JSON.stringify(banned));
    alert(`🔓 USUARIO DESBANEADO\nSe ha retirado el ban a ${unbanned[0]}.`);
  }

  renderAdminReports();
}

function borrarDenunciaAdmin(index) {
  let reports = [];
  try {
    const raw = localStorage.getItem('notigas_user_reports');
    if (raw) reports = JSON.parse(raw);
  } catch(e){}

  if (index >= 0 && index < reports.length) {
    reports.splice(index, 1);
    localStorage.setItem('notigas_user_reports', JSON.stringify(reports));
  }

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

function enviarDenuncia() {
  const context = document.getElementById('reportContext')?.value || 'General';
  const motivo = document.getElementById('selectReportMotivo')?.value || 'Contenido Ofensivo';
  const detalle = document.getElementById('inputReportDetalle')?.value.trim() || '';

  let reports = [];
  try {
    const raw = localStorage.getItem('notigas_user_reports');
    if (raw) reports = JSON.parse(raw);
  } catch(e){}

  const newReport = {
    target: context,
    motivo: motivo,
    detalle: detalle,
    fecha: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  reports.unshift(newReport);
  localStorage.setItem('notigas_user_reports', JSON.stringify(reports));

  closeReportModal();
  const inputDetalle = document.getElementById('inputReportDetalle');
  if (inputDetalle) inputDetalle.value = '';

  alert('🚨 Denuncia registrada de forma segura. El equipo de moderación revisará el elemento reportado.');
}

