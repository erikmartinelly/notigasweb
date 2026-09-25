/* ADMIN USER MODERATION LOGIC */
// Lista global para la renderización síncrona
window.globalBannedList = window.globalBannedList || [];

async function descargarBaneadosDeSupabase() {
  if (!window.supabaseClient) return;
  const isAdmin = (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true) || (typeof getVerifiedAdminEmail === 'function' && !!(await getVerifiedAdminEmail()));
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

// esRepartidorBaneado se define de forma única en auth.js (requerida por flujos
// no-admin, como el registro de repartidores, antes de cargar este módulo).

async function banearRepartidorAdmin(vendorUserId, vendorName, plate = '', whatsapp = '') {
  // vendorUserId debe ser el auth.uid() real del chofer.
  if (!vendorUserId) {
    console.error('banearRepartidorAdmin: falta vendorUserId (auth.uid real del chofer)');
    if (typeof showToast === 'function') {
      showToast('❌ Error', 'No se pudo suspender: falta el identificador real del usuario.', 'error', 5000);
    }
    return;
  }

  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('❌ Error', 'No hay conexión con Supabase.', 'error', 4500);
    return;
  }

  // Única vía autorizada: RPC atómica y protegida en backend. No hacer fallback
  // directo a usuarios_baneados porque omitiría la sincronización de estado,
  // identificadores y reglas de autorización.
  const { error: rpcError } = await window.supabaseClient.rpc('rpc_banear_repartidor_completo', {
    p_user_id: vendorUserId,
    p_motivo: 'Suspensión administrativa'
  });

  if (rpcError) {
    console.error('Error en rpc_banear_repartidor_completo:', rpcError);
    if (typeof showToast === 'function') {
      showToast('❌ Error al suspender', rpcError.message || 'No se pudo registrar la suspensión en la base de datos.', 'error', 5000);
    }
    return;
  }

  await descargarBaneadosDeSupabase();
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🚫 Repartidor suspendido', `Se suspendió a "${vendorName}" y se bloquearon los identificadores asociados.`, 'error', 6000);
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

    // Desbloquear también en choferes_habilitados y restaurar el servicio.
    await window.supabaseClient.from('choferes_habilitados')
      .update({ bloqueado: false, motivo_bloqueo: null, estado_verificacion: 'aprobado', estado_servicio: 'activo' })
      .not('id', 'is', null);

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
  // vendorUserId debe ser el auth.uid() real.
  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('usuarios_baneados').delete().eq('user_id', vendorUserId);
    if (error) {
      console.error('Error al desbanear repartidor:', error);
      if (typeof showToast === 'function') {
        showToast('❌ Error', 'No se pudo desbanear al repartidor.', 'error', 5000);
      }
      return;
    }

    // Desbloquear y restaurar el estado operativo.
    const { error: driverError } = await window.supabaseClient.from('choferes_habilitados')
      .update({ bloqueado: false, motivo_bloqueo: null, estado_verificacion: 'aprobado', estado_servicio: 'activo' })
      .eq('user_id', vendorUserId);
    if (driverError) {
      console.error('Error restaurando estado del repartidor:', driverError);
      if (typeof showToast === 'function') showToast('❌ Error', 'Se retiró el baneo, pero no se pudo restaurar el estado operativo.', 'error', 5000);
      return;
    }

    await descargarBaneadosDeSupabase();
  }

  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
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

  const safeName = nombre || email || 'este comprador';
  const doBan = async () => {
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

  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🚫', `¿Banear al comprador ${safeName}?`, 'El usuario no podrá hacer pedidos y su acceso será bloqueado.', 'Sí, Banear', doBan);
  } else if (confirm(`¿Banear al comprador ${safeName}?`)) {
    doBan();
  }
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
    const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    if (!u.nombre && !u.gmail && !u.placa) return;

    const isBanned = (typeof esRepartidorBaneado === 'function')
      ? esRepartidorBaneado(u.nombre, u.placa, u.whatsapp, u.gmail)
      : false;

    if (isBanned) {
      activarBloqueoPantallaCompletaApp();
    }
  } catch(e){}
}

// ==========================================
// CONTROL FINANCIERO: NOTIGAS NO COBRA COMISIONES
// ==========================================

window.liquidarComisionesAdmin = async function(userId, name, currentSaldo) {
  if (typeof showToast === 'function') {
    showToast('Notificación', 'NOTIGAS no cobra comisiones ni saldos a los repartidores. No hay nada que liquidar.', 'info', 5000);
  } else {
    alert('NOTIGAS no cobra comisiones ni saldos a los repartidores. No hay nada que liquidar.');
  }
  return;
};
// Compatibilidad con botones heredados del HTML: el modelo financiero de NOTIGAS
// no contempla comisiones, cortes, mora ni saldos para los repartidores.
window.ejecutarCorteSemanalManualAdmin = function() {
  if (typeof showToast === 'function') {
    showToast('Proceso retirado', 'NOTIGAS no cobra comisiones ni aplica cortes por mora. No existe este proceso.', 'info', 5500);
  }
};

window.ejecutarBaneoSemanalManualAdmin = function() {
  if (typeof showToast === 'function') {
    showToast('Proceso retirado', 'NOTIGAS no aplica baneos por mora ni saldo pendiente. Solo hay sanciones administrativas.', 'info', 6000);
  }
};