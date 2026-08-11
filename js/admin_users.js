/* ADMIN USER MODERATION LOGIC */
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
