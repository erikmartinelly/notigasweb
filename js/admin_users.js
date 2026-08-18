/* ADMIN USER MODERATION LOGIC */
// Lista global para la renderización síncrona
window.globalBannedList = window.globalBannedList || [];

async function descargarBaneadosDeSupabase() {
  if (!window.supabaseClient) return;
  const isAdmin = (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true) || (typeof getVerifiedAdminEmail === 'function' && !!getVerifiedAdminEmail());
  if (!isAdmin) return; // Sólo los administradores pueden consultar usuarios_baneados

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

// Llamar al confirmar permisos admin
document.addEventListener('notigas_auth_ready', () => {
  if (typeof AppState !== 'undefined' && AppState.get('isAdmin')) {
    descargarBaneadosDeSupabase();
  }
});

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

window.borrarRepartidorPermanente = function(vendorId, vendorUserId, vendorName, vendorEmail = '') {
  const safeName = vendorName || vendorEmail || 'este repartidor';
  const cleanDriverId = String(vendorId || '').replace(/^driver_/, '');

  const doDelete = async () => {
    if (!window.supabaseClient) {
      if (typeof showToast === 'function') showToast('❌ Error', 'No hay conexión con Supabase.', 'error', 4000);
      return;
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Eliminando repartidor...');

    let deleted = false;
    let lastError = null;

    // 1. Intentar borrar con rpc_admin_delete_user usando ID o email
    if (vendorUserId || vendorEmail) {
      const { error } = await window.supabaseClient.rpc('rpc_admin_delete_user', { 
        p_user_id: vendorUserId || '',
        p_email: vendorEmail || null
      });
      if (!error) {
        deleted = true;
      } else {
        lastError = error;
      }
    }

    // 2. Si no se pudo o no tenía vendorUserId, borrar por ID de chofer
    if (!deleted && cleanDriverId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanDriverId)) {
      const { error: rpcErr } = await window.supabaseClient.rpc('rpc_admin_delete_driver_by_id', { p_driver_id: cleanDriverId });
      if (!rpcErr) {
        deleted = true;
      } else {
        const { error: delErr } = await window.supabaseClient.from('choferes_habilitados').delete().eq('id', cleanDriverId);
        if (!delErr) deleted = true;
        else lastError = delErr;
      }
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (deleted) {
      // Limpiar caché local
      try {
        if (vendorId) {
          const list = (AppState.get('notigas_vendors_directory') || []).filter(v => v.id !== vendorId && v.id !== cleanDriverId);
          AppState.set('notigas_vendors_directory', list);
        }
      } catch(e){}

      await descargarBaneadosDeSupabase();
      if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
      if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
      if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');
      if (typeof showToast === 'function') {
        showToast('🗑️ Repartidor Eliminado', `La ficha y cuenta de "${safeName}" fue eliminada definitivamente.`, 'success', 5000);
      }
    } else {
      console.error('Error al eliminar repartidor:', lastError);
      if (typeof showToast === 'function') {
        showToast('❌ Error al Eliminar', lastError?.message || 'No se pudo eliminar el repartidor.', 'error', 5000);
      }
    }
  };

  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🗑️', `¿Eliminar permanentemente a ${safeName}?`, 'Se borrarán de forma definitiva la ficha de negocio, la cuenta de acceso y todos sus datos en el sistema.', 'Sí, eliminar definitivamente', doDelete);
  } else if (confirm(`⚠️ ¿Eliminar permanentemente la cuenta y todos los datos de ${safeName}? Esta acción no se puede deshacer.`)) {
    doDelete();
  }
};

window.banearCompradorAdmin = async function(userId, email, nombre) {
  if (!userId && !email) {
    if (typeof showToast === 'function') showToast('❌ Error', 'Falta el identificador del comprador.', 'error', 4500);
    return;
  }

  if (!window.supabaseClient) return;

  const { error } = await window.supabaseClient.from('usuarios_baneados').insert([{
    user_id: userId || email,
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
  if (typeof showToast === 'function') showToast('🚫 Comprador Baneado', `Se bloqueó el acceso de "${nombre || email}".`, 'success', 4000);
};

window.borrarCompradorPermanente = function(userId, gmail, nombre) {
  const safeName = nombre || gmail || 'este comprador';
  if (!userId && !gmail) {
    if (typeof showToast === 'function') showToast('❌ Error', 'Falta el identificador o correo del usuario comprador.', 'error', 4500);
    return;
  }

  const doDelete = async () => {
    await ejecutarBorradoUsuarioCompleto(userId, safeName, 'comprador', '', gmail);
  };

  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🗑️', `¿Eliminar permanentemente al comprador ${safeName}?`, 'Se eliminarán su cuenta de acceso, pedidos, avisos, comentarios y registros. Esta acción no se puede deshacer.', 'Eliminar definitivamente', doDelete);
  } else if (confirm(`⚠️ ¿Eliminar permanentemente la cuenta y todos los datos de ${safeName}?`)) {
    doDelete();
  }
};

async function ejecutarBorradoUsuarioCompleto(userId, nombre, tipo, vendorId = '', email = '') {
  if (!window.supabaseClient) return;

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Eliminando usuario...');

  const { error } = await window.supabaseClient.rpc('rpc_admin_delete_user', { 
    p_user_id: userId || '',
    p_email: email || null
  });

  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

  if (error) {
    console.error('Error al eliminar usuario:', error);
    if (typeof showToast === 'function') {
      showToast('❌ No se pudo eliminar', error.message || 'No se pudo eliminar el usuario de Supabase.', 'error', 6000);
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
    showToast('🗑️ Usuario Eliminado', `El ${tipo} "${nombre}" y todos sus datos fueron eliminados definitivamente.`, 'success', 5000);
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
