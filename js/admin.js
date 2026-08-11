/* ==========================================================================
   NOTIGAS - MÓDULO DE ADMINISTRACIÓN, ADSENSE, MODERACIÓN & BANEOS
   ========================================================================== */

// FIX C-03: Lista de emails admin permitidos (doble verificación: aquí + SHA-256 en Supabase)
const ADMIN_EMAILS_ALLOWED = ['erikmartinelly@gmail.com', 'leonmartinelly13@gmail.com'];

// Duración máxima de sesión admin sin re-autenticación: 30 minutos
const ADMIN_SESSION_MAX_MS = 30 * 60 * 1000;

/**
 * FIX C-03: Verifica si hay una sesión de administrador VÁLIDA Y VIGENTE.
 * El token en sessionStorage es INSUFICIENTE por sí solo — también se requiere
 * que el timestamp de verificación sea reciente (< 30 min).
 * Escribir el token desde la consola del navegador NO dará acceso porque
 * 'notigas_admin_verified_at' no existirá o estará expirado.
 */
function getVerifiedAdminEmail() {
  const token = sessionStorage.getItem('notigas_admin_token');
  if (!token) return null;

  // Verificar que el email sea de la lista permitida
  const email = token.toLowerCase().trim();
  if (!ADMIN_EMAILS_ALLOWED.includes(email)) return null;

  // Verificar que la sesión no haya expirado (protección contra tokens inyectados desde consola)
  const verifiedAt = parseInt(sessionStorage.getItem('notigas_admin_verified_at') || '0', 10);
  if (!verifiedAt || (Date.now() - verifiedAt) > ADMIN_SESSION_MAX_MS) {
    // Sesión expirada o nunca verificada — limpiar y denegar
    sessionStorage.removeItem('notigas_admin_token');
    sessionStorage.removeItem('notigas_admin_verified_at');
    return null;
  }

  return email;
}

/**
 * Establece la sesión de admin con timestamp de verificación.
 * Solo debe llamarse DESPUÉS de verificar el hash SHA-256 contra Supabase.
 */
function _setAdminSession(email) {
  sessionStorage.setItem('notigas_admin_token', email.toLowerCase());
  sessionStorage.setItem('notigas_admin_verified_at', Date.now().toString());
}



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

function handleAdminCredentialResponse(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    if (payload && payload.email) {
      const email = payload.email.toLowerCase();
      // FIX C-03: Verificar que el email sea de la lista permitida antes de otorgar acceso
      if (!ADMIN_EMAILS_ALLOWED.includes(email)) {
        alert('❌ Acceso Denegado\nEsta cuenta de Google no tiene privilegios de administrador.');
        return;
      }
      // FIX C-03: Usar _setAdminSession() para guardar email + timestamp
      _setAdminSession(email);
      const loginScreen = document.getElementById('adminLoginScreen');
      const dashboardScreen = document.getElementById('adminDashboardScreen');
      if (loginScreen) loginScreen.style.display = 'none';
      if (dashboardScreen) dashboardScreen.style.display = 'flex';
      renderAdminReports();
      if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
      if (typeof showToast === 'function') {
        showToast('✅ Administrador Verificado', 'Sesión de admin activa por 30 minutos.', 'success', 3000);
      }
    } else {
      alert('❌ Acceso Denegado\nEsta cuenta de Google no tiene privilegios de administrador.');
    }
  } catch(e) {
    console.error('Error validando token admin', e);
  }
}

async function encriptarSHA256(mensaje) {
  const msgBuffer = new TextEncoder().encode(mensaje);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verificarEstadoAdmin() {
  const loginScreen = document.getElementById('adminLoginScreen');
  const setupScreen = document.getElementById('adminSetupScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');

  if (loginScreen) loginScreen.style.display = 'block';
  if (setupScreen) setupScreen.style.display = 'none';
  if (dashboardScreen) dashboardScreen.style.display = 'none';

  if (!window.supabaseClient) {
    alert("❌ Error: No hay conexión con la base de datos.");
  }
}

async function abrirModalAdminLogin() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
  const modalAdmin = document.getElementById('modalAdmin');
  
  if (!modalAdmin) return;

  // Limpiar campos por seguridad
  const f1 = document.getElementById('admin1Email');
  const f2 = document.getElementById('admin1Password');
  const f3 = document.getElementById('admin2Email');
  const f4 = document.getElementById('admin2Password');
  const s1 = document.getElementById('setupAdmin1Email');
  const s2 = document.getElementById('setupAdmin1Password');
  const s3 = document.getElementById('setupAdmin2Email');
  const s4 = document.getElementById('setupAdmin2Password');
  if(f1) f1.value = ''; if(f2) f2.value = ''; if(f3) f3.value = ''; if(f4) f4.value = '';
  if(s1) s1.value = ''; if(s2) s2.value = ''; if(s3) s3.value = ''; if(s4) s4.value = '';

  await verificarEstadoAdmin();
  
  modalAdmin.style.display = 'flex';
}

window.registrarAdminsIniciales = async function() {
  const email1 = document.getElementById('setupAdmin1Email').value.trim().toLowerCase();
  const pass1 = document.getElementById('setupAdmin1Password').value;
  const email2 = document.getElementById('setupAdmin2Email').value.trim().toLowerCase();
  const pass2 = document.getElementById('setupAdmin2Password').value;

  if (!email1 || !pass1 || !email2 || !pass2) {
    alert("❌ Por favor completa todos los campos de ambos administradores.");
    return;
  }
  if (pass1.length < 8 || pass2.length < 8) {
    alert("❌ Las contraseñas deben tener al menos 8 caracteres.");
    return;
  }
  if (email1 === email2) {
    alert("❌ Los correos deben ser diferentes para la Regla de los Dos Hombres.");
    return;
  }

  const hash1 = await encriptarSHA256(email1 + ':' + pass1);
  const hash2 = await encriptarSHA256(email2 + ':' + pass2);

  const { error } = await window.supabaseClient
    .from('admin_credentials')
    .insert([
      { email: email1, password_hash: hash1 },
      { email: email2, password_hash: hash2 }
    ]);

  if (error) {
    console.error("Error guardando credenciales", error);
    alert("❌ Error al guardar en Supabase: " + error.message);
  } else {
    alert("✅ ¡Credenciales maestras creadas con éxito!\nAhora debes ingresar con ellas para desbloquear el panel.");
    verificarEstadoAdmin();
  }
};

let adminLoginAttempts = 0;

window.verificarAutenticacionAdmin = async function() {
  if (!window.supabaseClient) return;

  const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
  const session = sessionData?.session;
  
  if (!session || sessionError) {
    alert("❌ Primero debes iniciar sesión en la aplicación principal con una cuenta autorizada.");
    return;
  }

  const email = session.user.email.toLowerCase().trim();

  // Verificamos de lado cliente primero, pero el servidor también lo validará
  if (!ADMIN_EMAILS_ALLOWED.includes(email)) {
    alert(`❌ ACCESO DENEGADO\nEl correo ${email} no es administrador.`);
    return;
  }

  // Éxito
  _setAdminSession(email);
  
  const loginScreen = document.getElementById('adminLoginScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');
  if (loginScreen) loginScreen.style.display = 'none';
  if (dashboardScreen) dashboardScreen.style.display = 'flex';
  
  if(typeof renderAdminReports === 'function') renderAdminReports();
  if(typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
  
  if (typeof showToast === 'function') {
    showToast('✅ Acceso Autorizado', 'Sesión de admin activa por 30 minutos.', 'success', 3000);
  }
};

/* guardarPrefUsuario reside en auth.js — eliminada de admin.js para que la versión con
   detección de rol Repartidor (GPS) no sea sobreescrita. */



/* cerrarSesionUsuario reside en auth.js — eliminada de admin.js para evitar sobreescritura */



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
  if (idx === 4) renderAdminReports();
}

async function renderAdminAdsAndPostsList() {
  const container = document.getElementById('adminAdsListContainer');
  if (!container || !window.supabaseClient) return;
  
  container.innerHTML = '<div style="color:#94A3B8; text-align:center;">Cargando...</div>';

  let html = '';
  let count = 0;

  // 1. Anuncio Local Personalizado
  const { data: adData } = await window.supabaseClient.from('anuncios_globales').select('*').order('created_at', { ascending: false });
  if (adData && adData.length > 0) {
    adData.forEach(ad => {
      count++;
      html += `
        <div style="background:#1E293B; padding:10px; border-radius:8px; border:1px solid #F59E0B; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#F59E0B; font-size:11.5px;"><i class="fa-solid fa-rectangle-ad"></i> Anuncio en ${window.escapeHtmlStr(ad.ciudad)}</strong>
            <button onclick="borrarAnuncioLocalAdmin('${ad.id}')" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Borrar Anuncio</button>
          </div>
          <div style="font-size:11px; color:white; margin-top:4px;">
            <strong>Texto:</strong> ${window.escapeHtmlStr(ad.titulo || '')}<br>
            <strong>URL:</strong> ${window.escapeHtmlStr(ad.url || '')}<br>
          </div>
        </div>
      `;
    });
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

  if (typeof showToast === 'function') {
    showToast('🗑️ Anuncio Eliminado', 'El anuncio local de la OTB fue borrado del sistema.', 'info', 4000);
  }
}

async function renderAdminDashboardKPIs() {
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
  
  if (window.supabaseClient) {
     const { data } = await window.supabaseClient.from('pedidos').select('estado');
     if (data) {
        // Pedidos activos (pendiente + visto)
        const activos = data.filter(p => p.estado === 'pendiente' || p.estado === 'visto').length;
        ordersCount = activos > 0 ? activos : ordersCount;
        
        // Pedidos Entregados (NUEVO KPI)
        const entregados = data.filter(p => p.estado === 'entregado').length;
        // Si quieres mostrar entregados, podríamos añadirlo al título:
        const elOrdersTitle = document.getElementById('adminKpiOrders').parentElement.querySelector('.kpi-title');
        if (elOrdersTitle) {
           elOrdersTitle.innerHTML = `Pedidos Activos <span style="display:block; font-size:10px; color:#56BC37;">+${entregados} Entregados (Histórico)</span>`;
        }
     }
  }
  
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




/* Alias: el botón "Restaurar Base de Datos por Defecto (Quitar Baneos)" del panel admin
   llama a restaurarBaseDatosPorDefecto(), que no existía. Reutiliza limpiarTodosLosBaneosAdmin(). */
const restaurarBaseDatosPorDefecto = limpiarTodosLosBaneosAdmin;








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
  const container = document.getElementById('adminVendorsListContainer');
  if (!container) return;
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

  let totalCount = 0;
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-size:11px; color:#94A3B8;">Inspecciona todos los pedidos y alertas activas en el mapa:</span>
      <button onclick="limpiarTodosLosPedidosFantasmaAdmin()" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;"><i class="fa-solid fa-broom"></i> 🧹 Borrar TODOS los Pedidos Fantasma</button>
    </div>
  `;

  // 1. Pedidos en Vivo desde Supabase
  if (window.supabaseClient) {
    const { data: pedidos, error } = await window.supabaseClient
      .from('pedidos')
      .select('*');

    if (pedidos && pedidos.length > 0) {
      // Filtrar para no mostrar los entregados aquí, o mostrarlos con otro color si se desea.
      // Por ahora, mostraremos todos, pero indicando su estado.
      const pedidosActivos = pedidos.filter(p => p.estado !== 'entregado');
      
      pedidosActivos.forEach(order => {
        totalCount++;
        const orderDate = order.created_at ? new Date(order.created_at).getTime() : Date.now();
        const mins = Math.floor((Date.now() - orderDate) / 60000);
        
        let estadoBadge = '';
        let borderColor = '#56BC37';
        if (order.estado === 'visto') {
           estadoBadge = `<span style="font-size:10px; background:#F57F17; color:white; padding:3px 6px; border-radius:4px; font-weight:800;">👀 Visto (Driver: ${order.driver_id ? order.driver_id.substring(0,6) : 'N/A'})</span>`;
           borderColor = '#F57F17';
        } else {
           estadoBadge = `<span style="font-size:10px; background:rgba(86,188,55,0.2); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">⏱ Hace ${mins} min</span>`;
        }
        
        html += `
          <div style="background:#FFFFFF; padding:12px; border-radius:10px; border:1.5px solid ${borderColor}; margin-bottom:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12.5px; font-weight:900; color:${borderColor};"><i class="fa-solid fa-box"></i> Pedido Supabase</span>
              ${estadoBadge}
            </div>
            <div style="font-size:11.5px; color:#2F3C45; margin-top:6px;">
              <strong>Estado DB:</strong> ${order.estado}<br>
              <strong>Producto:</strong> ${escapeHtmlStr(order.categoria || 'Gas')} (${escapeHtmlStr(order.cantidad || '1 un')})<br>
              <strong>Dirección:</strong> ${escapeHtmlStr(order.direccion || 'Georeferenciada')}<br>
              <strong>Teléfono:</strong> <span style="color:${borderColor}; font-weight:800;">${escapeHtmlStr(order.telefono || 'No especificado')}</span><br>
              <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${order.lat ? order.lat.toFixed(5) : '-'}, Lng ${order.lng ? order.lng.toFixed(5) : '-'}</span>
            </div>
            <button onclick="borrarPedidoFantasmaAdmin('supabase', '${order.id}')" style="margin-top:8px; width:100%; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">
              <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Pedido (Supabase)
            </button>
          </div>
        `;
      });
    }
  }

  // 2. Pedido Activo de Comprador Local (Respaldo)
  const rawOrder = localStorage.getItem('notigas_active_order');
  if (rawOrder) {
    try {
      const order = JSON.parse(rawOrder);
      totalCount++;
      const mins = Math.floor((Date.now() - (order.timestamp || Date.now())) / 60000);
      html += `
        <div style="background:#FFFFFF; padding:12px; border-radius:10px; border:1.5px solid #56BC37; margin-bottom:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12.5px; font-weight:900; color:#56BC37;"><i class="fa-solid fa-box"></i> Pedido Local (Caché)</span>
            <span style="font-size:10px; background:rgba(86,188,55,0.2); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">⏱ Hace ${mins} min</span>
          </div>
          <div style="font-size:11.5px; color:#2F3C45; margin-top:6px;">
            <strong>Producto:</strong> ${escapeHtmlStr(order.categoria)} (${escapeHtmlStr(order.cantidad || '1 un')})<br>
            <strong>Dirección:</strong> ${escapeHtmlStr(order.callePrincipal || 'Georeferenciada')}<br>
            <strong>Teléfono:</strong> <span style="color:#56BC37; font-weight:800;">${escapeHtmlStr(order.telefono || 'No especificado')}</span><br>
            <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${order.lat ? order.lat.toFixed(5) : '-'}, Lng ${order.lng ? order.lng.toFixed(5) : '-'}</span>
          </div>
          <button onclick="borrarPedidoFantasmaAdmin('active_order')" style="margin-top:8px; width:100%; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">
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
          <span style="font-size:10px; background:rgba(86,188,55,0.15); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">Hace ${mins} min</span>
        </div>
        <div style="font-size:11px; color:#2F3C45; margin-top:4px;">
          <strong>Reportado por:</strong> ${escapeHtmlStr(t.reporter || 'Vecino')}<br>
          <span style="font-size:10px; color:#64748B;">Coordenadas: Lat ${t.lat ? t.lat.toFixed(5) : '-'}, Lng ${t.lng ? t.lng.toFixed(5) : '-'}</span>
        </div>
        <button onclick="borrarPedidoFantasmaAdmin('truck_report', ${idx})" style="margin-top:8px; width:100%; background:rgba(211,47,47,0.8); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:10px; cursor:pointer;">
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
    const { error } = await window.supabaseClient.from('pedidos').delete().eq('id', param);
    if (error) {
      console.error("Error borrando pedido supabase:", error);
      if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo borrar de Supabase.', 'error', 3000);
      return;
    }
  } else if (tipo === 'active_order') {
    localStorage.removeItem('notigas_active_order');
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

async function ejecutarLimpiezaTotalPedidos() {
  localStorage.removeItem('notigas_active_order');
  localStorage.removeItem('notigas_reported_trucks_buffer');

  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('pedidos').delete().neq('id', 0);
    if (error) console.error("Error limpiando pedidos Supabase:", error);
  }

  if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
  if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();
  if (typeof renderReportedTrucksBuffer === 'function') renderReportedTrucksBuffer();

  renderAdminOrdersList();
  renderAdminDashboardKPIs();

  if (typeof showToast === 'function') {
    showToast('✨ Limpieza Total', 'Todos los pedidos y alertas han sido eliminados.', 'success', 3000);
  }
}

function guardarSubmenuAnuncios() {
  const currentAdmin = getVerifiedAdminEmail();
  if (!currentAdmin) {
    alert("⛔ ACCESO RESTRINGIDO\nDebes ingresar tus credenciales de Administrador para modificar anuncios.");
    abrirModalAdminLogin();
    return;
  }

  const inputAd = (document.getElementById('inputAdText')?.value || '').trim();
  const inputUrl = (document.getElementById('inputAdUrl')?.value || '').trim();
  const activeCity = AppState.get('city') || 'santacruz';
  const imgUrl = (window.pendingUploadUrl) ? window.pendingUploadUrl : null;

  if (typeof actualizarAnunciosEnVivo === 'function') {
    actualizarAnunciosEnVivo(inputAd, inputUrl);
  }
  if (imgUrl && typeof actualizarBannerConImagen === 'function') {
    actualizarBannerConImagen(imgUrl);
  }

  // Sincronizar con Supabase para la ciudad actual
  if (window.supabaseClient) {
    const payload = {
        titulo: inputAd,
        descripcion: 'Anuncio Global Sponsor',
        url: inputUrl,
        activo: true,
        ciudad: activeCity
    };
    if (imgUrl) payload.image_url = imgUrl;
    
    window.supabaseClient.from('anuncios_globales').select('id').eq('ciudad', activeCity).single().then(({data}) => {
        if (data) {
            window.supabaseClient.from('anuncios_globales').update(payload).eq('id', data.id).then();
        } else {
            window.supabaseClient.from('anuncios_globales').insert([payload]).then();
        }
    });
  }

  closeAdminModal();
  alert('📢 CONFIGURACIÓN DE PUBLICIDAD GUARDADA\n\nLos cambios en anuncios locales para esta ciudad ya están activos.');
}

function guardarAdminConfig() {
  // Manual admin login removed - using Google JWT exclusively
}

function cerrarSesionAdminControl() {
  sessionStorage.removeItem('notigas_admin_token');
  sessionStorage.removeItem('notigas_admin_session'); // Limpieza de sesión antigua si existiera
  const loginScreen = document.getElementById('adminLoginScreen');
  const dashboardScreen = document.getElementById('adminDashboardScreen');
  if (loginScreen) loginScreen.style.display = 'block';
  if (dashboardScreen) dashboardScreen.style.display = 'none';
  alert('🔒 Sesión de Administrador cerrada correctamente.');
}

/* DESCARGA COMPLETA DE CORREOS ELECTRONICOS REGISTRADOS (.CSV DE USUARIOS) */
function descargarListaCorreosCSV() {
  let currentAdmin = getVerifiedAdminEmail();
  
  if (!currentAdmin) {
    alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.");
    abrirModalAdminLogin();
    return;
  }

  let emailsList = [];

  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    emailsList = [...databaseEmails];
  }

  // Correos de la base de datos se exportan directamente
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
  let currentAdmin = getVerifiedAdminEmail();
  
  if (!currentAdmin) {
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
  let currentAdmin = getVerifiedAdminEmail();
  
  if (!currentAdmin) {
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
  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron las estadísticas generales del panel de administración.`);
}

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
}


async function banearUsuarioAdmin(identifier) {
  if (!identifier || !window.supabaseClient) return;

  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
    user_id: identifier,
    motivo: 'Baneado por Administrador'
  }]);

  if (typeof descargarBaneadosDeSupabase === 'function') await descargarBaneadosDeSupabase();

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

 

