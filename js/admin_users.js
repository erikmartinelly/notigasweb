/* ADMIN USER MODERATION LOGIC */
// Lista global para la renderización síncrona
window.globalBannedList = window.globalBannedList || [];

async function descargarBaneadosDeSupabase() {
  if (window.supabaseClient) {
    try {
      const { data, error } = await window.supabaseClient.from('usuarios_baneados').select('*');
      if (!error && data) {
        window.globalBannedList = [];
        data.forEach(d => {
          if (d.user_id) window.globalBannedList.push(String(d.user_id).toLowerCase().trim());
          if (d.email) window.globalBannedList.push(String(d.email).toLowerCase().trim());
          if (d.nombre) window.globalBannedList.push(String(d.nombre).toLowerCase().trim());
          if (d.placa) window.globalBannedList.push(String(d.placa).toLowerCase().trim());
          if (d.telefono) window.globalBannedList.push(String(d.telefono).toLowerCase().trim());
        });
        if (typeof verificarBloqueoAppUsuario === 'function') verificarBloqueoAppUsuario();
      }
    } catch(e) {
      console.error('Error al descargar baneados', e);
    }
  }
}

// Llamar al cargar para tener los baneos listos para el render sincrónico
document.addEventListener('DOMContentLoaded', descargarBaneadosDeSupabase);

function esRepartidorBaneado(nombre, placa, whatsapp, gmail) {
  if (!window.globalBannedList || window.globalBannedList.length === 0) return false;

  const n = nombre ? String(nombre).toLowerCase().trim() : '';
  const p = placa ? String(placa).toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';
  const w = whatsapp ? String(whatsapp).toLowerCase().trim().replace(/[^0-9]/g, '') : '';
  const g = gmail ? String(gmail).toLowerCase().trim() : '';

  for (const b of window.globalBannedList) {
    if (!b) continue;
    const bClean = String(b).toLowerCase().trim();
    const bDigits = bClean.replace(/[^0-9]/g, '');
    const bAlphanum = bClean.replace(/[^a-z0-9]/g, '');

    // Coincidencia exacta por correo o ID
    if (g && bClean === g) return true;
    // Coincidencia exacta por placa
    if (p && bAlphanum && p === bAlphanum) return true;
    // Coincidencia exacta por teléfono (mínimo 7 dígitos)
    if (w && w.length >= 7 && bDigits && w === bDigits) return true;
    // Coincidencia por nombre (estricta, mínimo 4 caracteres)
    if (n && n.length >= 4 && (n === bClean || (bClean.length >= 6 && n.includes(bClean)))) return true;
  }
  return false;
}
async function banearRepartidorAdmin(vendorUserId, vendorName, plate = '', whatsapp = '') {
  // IMPORTANTE: vendorUserId debe ser el auth.uid() real del chofer (viene de
  // choferes_habilitados.user_id vía data-user-id), NO el id de la fila
  // choferes_habilitados.id. Antes se guardaba "driver_<id-de-fila>" en
  // usuarios_baneados.user_id, que nunca coincidía con auth.uid(), así que
  // is_banned() jamás detectaba el baneo a nivel de base de datos.
  if (!vendorUserId) {
    console.error('banearRepartidorAdmin: falta vendorUserId (auth.uid real del chofer)');
    if (typeof showToast === 'function') {
      showToast('❌ Error', 'No se pudo banear: falta el identificador real del usuario.', 'error', 5000);
    }
    return;
  }

  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
      user_id: vendorUserId,
      nombre: vendorName,
      placa: plate,
      telefono: whatsapp,
      motivo: 'Baneado por Administrador'
    }]);

    if (error) {
      console.error('Error al banear repartidor:', error);
      if (typeof showToast === 'function') {
        showToast('❌ Error al Banear', error.message || 'No se pudo registrar el baneo en la base de datos.', 'error', 5000);
      }
      return; // No refrescar como si hubiera funcionado
    }

    await descargarBaneadosDeSupabase();
  }

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🚫 Repartidor Baneado', `Se suspendió el acceso e ingreso de "${vendorName}".`, 'error', 5000);
  }
}
async function limpiarTodosLosBaneosAdmin() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('⚠️', '¿Eliminar todos los bloqueos?', 'Se borrarán de forma permanente todos los registros de baneos de la base de datos.', 'Sí, borrar todo', ejecutarLimpiezaBaneos);
  } else {
    if (confirm('⚠️ ¿Eliminar todos los bloqueos de la base de datos?')) {
      ejecutarLimpiezaBaneos();
    }
  }
}

async function ejecutarLimpiezaBaneos() {
  try {
    AppState.set('notigas_banned_users', []);
    AppState.set('notigas_deleted_vendor_ids', []);
  } catch(e){}

  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('usuarios_baneados').delete().not('id', 'is', null);
    if (error) console.error("Error limpiando baneos en Supabase:", error);
    await descargarBaneadosDeSupabase();
  }

  const overlay = document.getElementById('appLockoutOverlay');
  if (overlay) overlay.style.display = 'none';

  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🔓 Todos los Bloqueos Eliminados', 'Se eliminaron todos los baneos y bloqueos de la base de datos.', 'info', 4500);
  }
}
async function desbanearRepartidorAdmin(vendorUserId, vendorName) {
  // IMPORTANTE: vendorUserId debe ser el auth.uid() real (ver nota en banearRepartidorAdmin).
  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('usuarios_baneados').delete().eq('user_id', vendorUserId);
    if (error) {
      console.error('Error al desbanear repartidor:', error);
      if (typeof showToast === 'function') {
        showToast('❌ Error', 'No se pudo desbanear al repartidor.', 'error', 5000);
      }
      return;
    }
    await descargarBaneadosDeSupabase();
  }

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🔓 Repartidor Desbaneado', `Se restauró la cuenta e ingreso de "${vendorName}".`, 'success', 4000);
  }
}

window.borrarRepartidorPermanente = async function(vendorId, vendorUserId, vendorName) {
  if (!vendorUserId) {
    if (typeof showToast === 'function') showToast('❌ Error', 'El repartidor no tiene un usuario de acceso asociado.', 'error', 4500);
    return;
  }
  if (confirm(`⚠️ ¿Eliminar permanentemente la cuenta y todos los datos de ${vendorName}? Esta acción no se puede deshacer.`)) {
    await ejecutarBorradoUsuarioCompleto(vendorUserId, vendorName, 'repartidor', vendorId);
  }
}

window.banearCompradorAdmin = async function(userId, email, nombre) {
  if (!userId || !window.supabaseClient) {
    if (typeof showToast === 'function') showToast('❌ Error', 'Falta el identificador real del comprador.', 'error', 4500);
    return;
  }

  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
    user_id: userId,
    email: email || null,
    nombre: nombre || null,
    motivo: 'Baneado por Administrador'
  }]);
  if (error) {
    console.error('Error al banear comprador:', error);
    if (typeof showToast === 'function') showToast('❌ Error', error.message || 'No se pudo bloquear al comprador.', 'error', 5000);
    return;
  }

  await descargarBaneadosDeSupabase();
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof showToast === 'function') showToast('🚫 Comprador Baneado', `Se bloqueó el acceso de "${nombre}".`, 'success', 4000);
}

window.borrarCompradorPermanente = function(userId, gmail, nombre) {
  if (!userId) {
    if (typeof showToast === 'function') showToast('❌ Error', 'Falta el identificador real del comprador.', 'error', 4500);
    return;
  }
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('⚠️', `¿Eliminar permanentemente al usuario ${nombre}?`, 'Se eliminarán su cuenta de acceso, pedidos, avisos, comentarios, votos y bloqueos. Esta acción no se puede deshacer.', 'Eliminar definitivamente', () => {
      ejecutarBorradoUsuarioCompleto(userId, nombre, 'comprador');
    });
  } else {
    if(confirm(`⚠️ ¿Eliminar permanentemente la cuenta y todos los datos de ${nombre}?`)) {
      ejecutarBorradoUsuarioCompleto(userId, nombre, 'comprador');
    }
  }
}

async function ejecutarBorradoUsuarioCompleto(userId, nombre, tipo, vendorId = '') {
  if (!window.supabaseClient) return;
  const { error } = await window.supabaseClient.rpc('rpc_admin_delete_user', { p_user_id: userId });
  if (error) {
    console.error('Error al eliminar usuario:', error);
    if (typeof showToast === 'function') {
      showToast('❌ No se pudo eliminar', error.message || 'Verifica que la migración 044 esté aplicada en Supabase.', 'error', 6000);
    }
    return;
  }

  if (vendorId) {
    try {
      const list = (AppState.get('notigas_vendors_directory') || []).filter(v => v.id !== vendorId);
      AppState.set('notigas_vendors_directory', list);
    } catch(e){}
  }

  await descargarBaneadosDeSupabase();
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');
  if (typeof showToast === 'function') {
    showToast('🗑️ Cuenta eliminada', `${tipo === 'repartidor' ? 'El repartidor' : 'El comprador'} "${nombre}" y sus datos fueron eliminados.`, 'success', 5000);
  }
}
function verificarBloqueoAppUsuario() {
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
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
