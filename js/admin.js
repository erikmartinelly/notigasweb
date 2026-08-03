/* ==========================================================================
   NOTIGAS - MÓDULO DE ADMINISTRACIÓN, ADSENSE, MODERACIÓN & BANEOS
   ========================================================================== */

const AUTHORIZED_ADMIN_EMAILS = [
  "erikmartinelly@gmail.com",
  "leonmartinelly13@gmail.com"
];

const REQUIRED_ADMIN_PASSWORD = "Tiquipaya428";

/* GESTIÓN DE MODAL DE CONFIGURACIÓN DE USUARIO (⚙️ HEADER) */
function closeUserSettingsModal() {
  const modal = document.getElementById('modalUserSettings');
  if (modal) modal.style.display = 'none';
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

function guardarPrefUsuario() {
  const prefStyle = document.getElementById('userPrefMapStyle')?.value || 'googleStatic';
  const prefSound = document.getElementById('userPrefSound')?.value || 'enabled';

  localStorage.setItem('notigas_pref_map_style', prefStyle);
  localStorage.setItem('notigas_pref_sound', prefSound);

  if (typeof setMapStyle === 'function') {
    const btn = document.querySelector(`.map-style-btn[onclick*="${prefStyle}"]`);
    setMapStyle(btn, prefStyle);
  }

  closeUserSettingsModal();
  alert('⚙️ Preferencias de usuario guardadas con éxito.');
}

function cerrarSesionUsuario() {
  if (confirm("🚪 ¿Deseas cerrar la sesión activa de NOTIGAS?")) {
    localStorage.removeItem('notigas_user_data');
    sessionStorage.removeItem('notigas_admin_session');
    
    closeUserSettingsModal();
    
    const modalWelcome = document.getElementById('modalWelcomeAuth');
    if (modalWelcome) modalWelcome.style.display = 'flex';
    
    alert("🚪 Sesión cerrada correctamente. Puedes ingresar nuevamente como Comprador o Repartidor.");
  }
}

/* GESTIÓN DEL MODAL EXCLUSIVO DE ADMINISTRADOR */
function closeAdminModal() { 
  const modalAdmin = document.getElementById('modalAdmin');
  if (modalAdmin) modalAdmin.style.display = 'none'; 
}

function switchModalTab(idx) {
  document.querySelectorAll('.modal-tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  document.querySelectorAll('.modal-tab-pane').forEach((pane, i) => pane.classList.toggle('active', i === idx));
  if (idx === 2) renderAdminReports();
}

function guardarSubmenuAnuncios() {
  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    alert("⛔ ACCESO RESTRINGIDO\nDebes ingresar tus credenciales de Administrador para modificar anuncios.");
    abrirModalAdminLogin();
    return;
  }

  const adsenseId = document.getElementById('inputAdsenseId')?.value.trim();
  const inputAd = document.getElementById('inputAdText')?.value.trim();
  const inputUrl = document.getElementById('inputAdUrl')?.value.trim();

  if (adsenseId) {
    localStorage.setItem('notigas_adsense_id', adsenseId);
  }

  if (inputAd) {
    localStorage.setItem('notigas_ad_text', inputAd);
  }

  if (inputUrl) {
    localStorage.setItem('notigas_ad_url', inputUrl);
  }

  if (typeof actualizarAnunciosEnVivo === 'function') {
    actualizarAnunciosEnVivo(inputAd, inputUrl);
  }

  closeAdminModal();
  alert('📢 Configuración de Anuncios Google AdSense y Anuncios Nativos guardada con éxito.');
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

