/* ==========================================================================

   NOTIGAS - MÓDULO DE ADMINISTRACIÓN, ADSENSE, MODERACIÓN & BANEOS

   ========================================================================== */



// La lista quemada de emails ha sido eliminada. La validación se hace contra Supabase `admin_credentials`.

// Duración máxima de sesión admin sin re-autenticación: 30 minutos

const ADMIN_SESSION_MAX_MS = 30 * 60 * 1000;











/* closeUserSettingsModal, guardarPrefUsuario y cerrarSesionUsuario residen en auth.js (que carga primero).

   Se eliminan aquí para evitar que admin.js sobreescriba las versiones correctas con soporte de rol Repartidor. */



window.getVerifiedAdminEmail = function() {

  try {

    const data = AppState.get('userData');

    const isAdmin = AppState.get('isAdmin') === true;

    if (!isAdmin) return null;

    return data && data.gmail ? data.gmail.toLowerCase().trim() : null;

  } catch(e) { return null; }

};



window.abrirModalAdminDashboard = async function() {

  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();

  const modalAdmin = document.getElementById('modalAdmin');

  if (!modalAdmin) return;

  

  try {

    const data = AppState.get('userData');

    const email = data && data.gmail ? data.gmail.toLowerCase().trim() : '';

    if (!email) throw new Error("No email in local storage");

    

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Verificando credenciales...');

    

    const { data: adminData, error } = await window.supabaseClient

      .from('admin_credentials')

      .select('email')

      .eq('email', email)
      .limit(1)
      .maybeSingle();

      

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    

    if (error || !adminData) {

      if (typeof showToast === 'function') { showToast('Notificación', "❌ Acceso Denegado. Solo administradores autorizados.", 'info', 4000); } else { alert("❌ Acceso Denegado. Solo administradores autorizados."); };

      return;

    }

    

    // Si llegamos aquí, es administrador legítimo

    AppState.set('isAdmin', true);

    

  } catch (e) {

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (typeof showToast === 'function') { showToast('Notificación', "❌ Acceso Denegado. Solo administradores autorizados.", 'info', 4000); } else { alert("❌ Acceso Denegado. Solo administradores autorizados."); };

    return;

  }

  

  modalAdmin.style.display = 'flex';

  renderAdminReports();

}



function cerrarSesionRepartidorActivarComprador() {

  if (typeof showConfirmModal === 'function') {

    showConfirmModal('🔄', '¿Cambiar a Modo Comprador?', 'Tu ficha de negocio se mantendrá guardada. Solo se cambiará tu modo de ingreso.', 'Sí, cambiar', () => {

      AppState.set('userData', null);

      AppState.set('driverGpsLive', 'on');

      if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();

      if (typeof setAppMode === 'function') setAppMode('buyer');

      const modalAuth = document.getElementById('modalWelcomeAuth');

      if (modalAuth) modalAuth.style.display = 'flex';

      if (typeof showToast === 'function') showToast('🛒 Modo Comprador', 'Modo Repartidor cerrado. Puedes ingresar como Comprador.', 'info', 2000);

    });

  }

}



















;



let adminLoginAttempts = 0;



;



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

  const { data: adData, error } = await window.supabaseClient.from('anuncios_globales').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Error cargando anuncios_globales:', error); return; }

  if (adData && adData.length > 0) {

    adData.forEach(ad => {

      count++;

      html += `

        <div style="background:#1E293B; padding:10px; border-radius:8px; border:1px solid #F59E0B; margin-bottom:8px;">

          <div style="display:flex; justify-content:space-between; align-items:center;">

            <strong style="color:#F59E0B; font-size:11.5px;"><i class="fa-solid fa-rectangle-ad"></i> Anuncio en ${window.escapeHtmlStr(ad.ciudad)}</strong>

            <button data-action="borrarAnuncioLocalAdmin" data-id="${ad.id}" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Borrar Anuncio</button>

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

  const { data: localPosts, error } = await window.supabaseClient.from('avisos').select('*');
  if (error) { console.error('Error cargando avisos:', error); return; }

  

  if (localPosts && localPosts.length > 0) {

    localPosts.forEach(p => {

      count++;

      html += `

        <div style="background:#1E293B; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">

          <div>

            <span style="font-size:9px; background:rgba(255,109,0,0.2); color:#FF8F00; padding:1px 5px; border-radius:4px; font-weight:700;">${escapeHtmlStr(p.categoria || 'Aviso')}</span>

            <strong style="color:white; font-size:11px; margin-left:4px;">${escapeHtmlStr(p.titulo || 'Sin Título')}</strong>

          </div>

          <button data-action="borrarPostForumAdmin" data-id="${p.id}" style="background:#D32F2F; color:white; border:none; padding:3px 8px; border-radius:4px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Borrar</button>

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



async function renderAdminDashboardKPIs() {

  const elUsers = document.getElementById('adminKpiUsers');

  const elVendors = document.getElementById('adminKpiVendors');

  const elOrders = document.getElementById('adminKpiOrders');

  const elReports = document.getElementById('adminKpiReports');



  let usersCount = 0;

  let vendorsCount = 0;

  let ordersCount = 0;

  let reportsCount = 0;



  if (window.supabaseClient) {

    try {

      const { count: cVendors } = await window.supabaseClient.from('choferes_habilitados').select('*', { count: 'exact', head: true });

      vendorsCount = cVendors || 0;



      // Unique users from orders + localStorage/databaseEmails as a proxy for users count

      const { data: pedidosData, error } = await window.supabaseClient.from('pedidos').select('user_id');
      if (error) { console.error('Error cargando pedidos:', error); return; }

      const uniqueUsers = new Set();

      if (pedidosData) {

        pedidosData.forEach(p => { if (p.user_id) uniqueUsers.add(p.user_id); });

      }

      if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {

        databaseEmails.forEach(e => { if (e.gmail) uniqueUsers.add(e.gmail); });

      }

      try {

        const saved = JSON.stringify(AppState.get('userData') || {});

        if (saved) {

          const u = JSON.parse(saved);

          if (u.gmail) uniqueUsers.add(u.gmail);

        }

      } catch(e){}

      usersCount = uniqueUsers.size;



      const { data, error } = await window.supabaseClient.from('pedidos').select('estado, created_at');
      if (error) { console.error('Error cargando pedidos:', error); return; }

      if (data) {

        const activos = data.filter(p => p.estado === 'pendiente' || p.estado === 'asignado').length;

        ordersCount = activos;

        

        const hoyStr = new Date().toISOString().split('T')[0];

        const creadosHoy = data.filter(p => p.created_at && p.created_at.startsWith(hoyStr)).length;

        const entregadosHoy = data.filter(p => p.estado === 'entregado' && p.created_at && p.created_at.startsWith(hoyStr)).length;



        const elOrdersTitle = document.getElementById('adminKpiOrders').parentElement.querySelector('.kpi-title');

        if (elOrdersTitle) {

           elOrdersTitle.innerHTML = `Pedidos Activos <span style="display:block; font-size:10px; color:#56BC37;">${creadosHoy} Totales Hoy • ${entregadosHoy} Entregados</span>`;

        }

      }



      const { count: cReports } = await window.supabaseClient.from('denuncias').select('*', { count: 'exact', head: true });

      reportsCount = cReports || 0;

    } catch(e) {}

  }



  if (elUsers) elUsers.innerText = usersCount;

  if (elVendors) elVendors.innerText = vendorsCount;

  if (elOrders) elOrders.innerText = ordersCount;

  if (elReports) elReports.innerText = reportsCount;

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
      .from('avisos')
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
    showConfirmModal('🧹', '¿Ejecutar Purga de Base de Datos?', 'Se eliminarán de PostgreSQL pedidos mayores a 48h y avisos mayores a 72h, además de limpiar el caché local.', 'Sí, purgar BD', async () => {
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

















function renderAdminVendorsList() {

  const container = document.getElementById('adminVendorsListContainer');

  if (!container) return;



  let deletedIds = [];

  try {

    const raw = localStorage.getItem('notigas_deleted_vendor_ids');

    if (raw) deletedIds = JSON.parse(raw);

  } catch(e){}



  const defaultVendors = [];



  if (window.supabaseClient) {

      window.supabaseClient.from('choferes_habilitados').select('*').then(({ data, error }) => {
          if (error) { console.error('Error cargando choferes_habilitados:', error); return; }

          if (data && data.length > 0) {

              data.forEach(d => {

                  defaultVendors.unshift({

                      id: `driver_${d.id}`,

                      name: d.nombre_completo,

                      category: d.categoria || 'Gas GLP',

                      plate: d.placa || 'Placa registrada',

                      verified: d.estado_verificacion === 'aprobado'

                  });

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

    const safeName = encodeURIComponent(v.name || '').replace(/'/g, "%27");

    const safePlate = encodeURIComponent(v.plate || '').replace(/'/g, "%27");

    html += `

      <div style="background:#1E293B; padding:10px 12px; border-radius:10px; border:1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; display:flex; justify-content:space-between; align-items:center; opacity: ${isBanned ? '0.7' : '1'}; margin-bottom:6px;">

        <div>

          <strong style="color:${isBanned ? '#EF4444' : '#FF6D00'}; font-size:12px;">${isBanned ? '🚫 [BLOQUEADO/BANEADO] ' : (v.verified ? '👑 ' : '')}${escapeHtmlStr(v.name)}</strong>

          <span style="font-size:10.5px; color:#CBD5E1;"> (${escapeHtmlStr(v.category)})</span>

          <div style="font-size:10px; color:#94A3B8; margin-top:2px;">Placa: ${escapeHtmlStr(v.plate)} • Estado: ${isBanned ? '<span style="color:#EF4444; font-weight:700;">ACCESO BLOQUEADO</span>' : (v.verified ? '<span style="color:#00B0FF; font-weight:700;">ACTIVO/APROBADO</span>' : '<span style="color:#F57F17; font-weight:700;">PENDIENTE</span>')}</div>

        </div>

        <div style="display:flex; gap:4px;">

          ${!v.verified && !isBanned ? `

            <button data-action="aprobarRepartidorAdmin" data-id="${v.id}" style="background:#4CAF50; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-check"></i> Aprobar</button>

          ` : ''}

          ${isBanned ? `

            <button data-action="desbanearRepartidorAdmin" data-id="${v.id}" data-name="${safeName}" style="background:#0288D1; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-lock-open"></i> Desbanear</button>

          ` : `

            <button data-action="banearRepartidorAdmin" data-id="${v.id}" data-name="${safeName}" data-plate="${safePlate}" style="background:#E65100; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-user-slash"></i> Banear</button>

          `}

          <button data-action="borrarRepartidorPermanente" data-id="${v.id}" data-name="${safeName}" style="background:#D32F2F; color:white; border:none; padding:5px 8px; border-radius:6px; font-weight:800; font-size:9.5px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>

        </div>

      </div>

    `;

  });



  // SECCIÓN COMPRADORES REGISTRADOS

  html += `<div style="font-weight:900; color:#38BDF8; margin:12px 0 6px; font-size:11.5px;"><i class="fa-solid fa-users"></i> 👤 COMPRADORES Y USUARIOS VECINALES:</div>`;



  let buyersList = [];

  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {

    buyersList = databaseEmails.filter(e => e.role === 'Cliente' || e.role === 'vecino' || !e.role);

  }



  try {

    const saved = JSON.stringify(AppState.get('userData') || {});

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

            <button data-action="banearUsuarioAdmin" data-gmail="${escapeHtmlStr(b.gmail)}" style="background:${isBanned ? '#0288D1' : '#E65100'}; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;">${isBanned ? '🔓 Desbanear' : '🚫 Banear'}</button>

            <button data-action="borrarCompradorPermanente" data-gmail="${escapeHtmlStr(b.gmail)}" data-name="${escapeHtmlStr(b.nombre || b.gmail)}" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:800; font-size:9px; cursor:pointer;"><i class="fa-solid fa-trash"></i> Eliminar</button>

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

      <button data-action="limpiarTodosLosPedidosFantasmaAdmin" style="background:#D32F2F; color:white; border:none; padding:5px 10px; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer;"><i class="fa-solid fa-broom"></i> 🧹 Limpiar Pedidos de Prueba/Caché</button>

    </div>

  `;



  // 1. Pedidos en Vivo desde Supabase

  if (window.supabaseClient) {

    const { data: pedidos, error } = await window.supabaseClient

      .from('pedidos')

      .select('*').order('created_at', { ascending: false }).limit(500);



    if (pedidos && pedidos.length > 0) {

      const pedidosActivos = pedidos.filter(p => p.estado !== 'entregado');

      

      pedidosActivos.forEach(order => {

        totalCount++;

        const orderDate = order.created_at ? new Date(order.created_at).getTime() : Date.now();

        const mins = Math.floor((Date.now() - orderDate) / 60000);

        

        let estadoBadge = '';

        let borderColor = '#56BC37';

        if (order.estado === 'asignado') {

           estadoBadge = `<span style="font-size:10px; background:#F57F17; color:white; padding:3px 6px; border-radius:4px; font-weight:800;">👀 Visto (Driver: ${order.driver_id ? order.driver_id.substring(0,6) : 'N/A'})</span>`;

           borderColor = '#F57F17';

        } else {

           estadoBadge = `<span style="font-size:10px; background:rgba(86,188,55,0.2); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">⏱ Hace ${mins} min</span>`;

        }

        

        const isFantasmaOrExpired = order.estado === 'fantasma' || mins > 120;

        

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

            ${isFantasmaOrExpired ? `

            <button data-action="borrarPedidoFantasmaAdmin" data-type="supabase" data-id="${order.id}" style="margin-top:8px; width:100%; background:linear-gradient(135deg, #D32F2F, #B71C1C); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">

              <i class="fa-solid fa-trash-can"></i> 🗑️ Borrar Pedido Corrupto/Expirado

            </button>

            ` : ''}

          </div>

        `;

      });

    }

  }



  // 2. Pedido Activo de Comprador Local (Respaldo)

  const rawOrder = JSON.stringify(AppState.get('activeOrder'));

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

          <span style="font-size:10px; background:rgba(86,188,55,0.15); color:#56BC37; padding:2px 6px; border-radius:4px; font-weight:700;">Hace ${mins} min</span>

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

    const { error } = await window.supabaseClient.from('pedidos').delete().eq('id', param);

    if (error) {

      console.error("Error borrando pedido supabase:", error);

      if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo borrar de Supabase.', 'error', 3000);

      return;

    }

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

    showToast('✨ Limpieza Total', 'Todos los pedidos y alertas han sido eliminados.', 'success', 3000);

  }

}



async function guardarSubmenuAnuncios() {

  const currentAdmin = getVerifiedAdminEmail();

  if (!currentAdmin) {

    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO RESTRINGIDO\nDebes ingresar tus credenciales de Administrador para modificar anuncios.", 'info', 4000); } else { alert("⛔ ACCESO RESTRINGIDO\nDebes ingresar tus credenciales de Administrador para modificar anuncios."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

    return;

  }



  const inputAd = (document.getElementById('inputAdText')?.value || '').trim();

  const inputUrl = (document.getElementById('inputAdUrl')?.value || '').trim();

  const activeCity = AppState.get('city');
  if (!activeCity) {
    if (typeof showToast === 'function') showToast('⚠️ Ciudad Requerida', 'Debes seleccionar una ciudad activa antes de guardar el anuncio.', 'warning', 3000);
    return;
  }

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

    

    try {

      const { data, error: findError } = await window.supabaseClient

        .from('anuncios_globales')

        .select('id')

        .eq('ciudad', activeCity)

        .limit(1);

        

      if (findError) throw findError;

      

      let opError = null;

      if (data && data.length > 0) {

          const { error } = await window.supabaseClient.from('anuncios_globales').update(payload).eq('id', data[0].id);

          opError = error;

      } else {

          const { error } = await window.supabaseClient.from('anuncios_globales').insert([payload]);

          opError = error;

      }



      if (opError) {

          throw opError;

      }

      

      closeAdminModal();

      if (typeof showToast === 'function') { showToast('Notificación', '📢 CONFIGURACIÓN DE PUBLICIDAD GUARDADA\n\nLos cambios en anuncios locales para esta ciudad ya están activos.', 'info', 4000); } else { alert('📢 CONFIGURACIÓN DE PUBLICIDAD GUARDADA\n\nLos cambios en anuncios locales para esta ciudad ya están activos.'); };

    } catch (e) {

      console.error("Error al guardar anuncio:", e);

      if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo guardar la configuración de anuncios.', 'error');

    }

  } else {

      closeAdminModal();

      if (typeof showToast === 'function') { showToast('Notificación', '📢 CONFIGURACIÓN DE PUBLICIDAD GUARDADA\n\nLos cambios en anuncios locales para esta ciudad ya están activos (Solo caché).', 'info', 4000); } else { alert('📢 CONFIGURACIÓN DE PUBLICIDAD GUARDADA\n\nLos cambios en anuncios locales para esta ciudad ya están activos (Solo caché).'); };

  }

}



// ---------------------------------------------------------

// FUNCIONES DE ADMINISTRACIÓN DE ANUNCIOS

// ---------------------------------------------------------



window.pendingUploadUrl = null;



window.previewUploadAdImage = async function(event) {

  const file = event.target.files && event.target.files[0];

  if (!file) return;



  if (file.size > 2 * 1024 * 1024) {

    if (typeof showToast === 'function') showToast('⚠️ Imagen Pesada', 'La imagen supera los 2 MB. Elige una más ligera.', 'warning', 3000);

    return;

  }



  if (window.supabaseClient) {

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Subiendo imagen...');

    const fileName = `banner_${Date.now()}.${file.name.split('.').pop()}`;

    const { data, error } = await window.supabaseClient.storage

      .from('anuncios-media')

      .upload(fileName, file, { upsert: true, contentType: file.type });



    if (error) {

      console.error('Error al subir imagen:', error);

      if (typeof showToast === 'function') showToast('Error', 'No se pudo subir la imagen.', 'error');

    } else {

      const { data: publicUrlData } = window.supabaseClient.storage.from('anuncios-media').getPublicUrl(fileName);

      window.pendingUploadUrl = publicUrlData.publicUrl;

      

      const preview = document.getElementById('adImagePreview');

      const box = document.getElementById('adImagePreviewBox');

      if (preview && box) {

        preview.src = window.pendingUploadUrl;

        box.style.display = 'flex';

      }

      if (typeof showToast === 'function') showToast('Éxito', 'Imagen subida al servidor.', 'success');

    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

  }

};



window.eliminarImagenAnuncio = async function() {

  // Try to delete from storage if there is a pending URL

  if (window.pendingUploadUrl && window.supabaseClient) {

     const urlParts = window.pendingUploadUrl.split('/');

     const fileName = urlParts[urlParts.length - 1];

     await window.supabaseClient.storage.from('anuncios-media').remove([fileName]);

  }

  

  window.pendingUploadUrl = null;

  const preview = document.getElementById('adImagePreview');

  const box = document.getElementById('adImagePreviewBox');

  const input = document.getElementById('inputAdImageFile');

  if (preview) preview.src = '';

  if (box) box.style.display = 'none';

  if (input) input.value = '';

  if (typeof showToast === 'function') showToast('Eliminada', 'La imagen ha sido descartada.', 'info');

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

function descargarListaCorreosCSV() {

  let currentAdmin = getVerifiedAdminEmail();

  

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

    const saved = JSON.stringify(AppState.get('userData') || {});

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

  let currentAdmin = getVerifiedAdminEmail();

  

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

function descargarEstadisticasGeneralesCSV() {

  let currentAdmin = getVerifiedAdminEmail();

  

  if (!currentAdmin) {

    if (typeof showToast === 'function') { showToast('Notificación', "⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña.", 'info', 4000); } else { alert("⛔ ACCESO DENEGADO\nDebes desbloquear el Área de Administración con tu usuario y contraseña."); };

    if (typeof showToast === 'function') showToast('Acceso Denegado', 'Inicia sesión con tu cuenta de administrador Google para realizar esta acción.', 'error');

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

  const { data: reports, error: reportsError } = await window.supabaseClient.from('denuncias').select('*').order('created_at', { ascending: false });
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

  const { data: banned, error: bannedError } = await window.supabaseClient.from('usuarios_baneados').select('*');
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

  if (!identifier || !window.supabaseClient) return;

  

  const isEmail = identifier.includes('@');



  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{

    user_id: !isEmail ? identifier : null,

    email: isEmail ? identifier : null,

    nombre: !isEmail ? identifier : null,

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

      denunciado_id: context,

      motivo: motivo,

      detalles: detalle

    }]);

    if (error) console.error("Error enviando denuncia:", error);

  }



  closeReportModal();

  const inputDetalle = document.getElementById('inputReportDetalle');

  if (inputDetalle) inputDetalle.value = '';



  if (typeof showToast === 'function') { showToast('Notificación', '⚠️ Denuncia registrada de forma segura. El equipo de moderación revisará el elemento reportado.', 'info', 4000); } else { alert('⚠️ Denuncia registrada de forma segura. El equipo de moderación revisará el elemento reportado.'); };

}



window.borrarAnuncioLocalAdmin = async function(adId) {

  if (!confirm('¿Estás seguro de que deseas borrar este anuncio definitivamente?')) return;



  try {

    // 1. Obtener la URL de la imagen del anuncio

    const { data: adData, error: fetchError } = await window.supabaseClient

      .from('anuncios_globales')

      .select('image_url')

      .eq('id', adId)
      .limit(1)
      .maybeSingle();



    if (fetchError) {

      console.error('Error buscando anuncio:', fetchError);

      if (typeof showToast === 'function') showToast('Error', 'No se encontró el anuncio.', 'error');

      return;

    }



    // 2. Si tiene imagen en storage, borrarla

    if (adData && adData.image_url && adData.image_url.includes('anuncios-media')) {

      const urlParts = adData.image_url.split('/');

      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {

        await window.supabaseClient.storage.from('anuncios-media').remove([fileName]);

      }

    }



    // 3. Borrar el registro de la BD

    const { error: deleteError } = await window.supabaseClient

      .from('anuncios_globales')

      .delete()

      .eq('id', adId);



    if (deleteError) throw deleteError;



    if (typeof showToast === 'function') showToast('Eliminado', 'Anuncio y su imagen borrados correctamente.', 'success');

    

    // 4. Recargar vista

    const container = document.getElementById('adminAdsListContainer');

    if (container) {

      renderAdminAdsAndPostsList(container);

    }

  } catch (error) {

    console.error('Error al borrar anuncio:', error);

    if (typeof showToast === 'function') showToast('Error', 'No se pudo borrar el anuncio.', 'error');

  }

};



