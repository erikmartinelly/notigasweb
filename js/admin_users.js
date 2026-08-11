/* ADMIN USER MODERATION LOGIC */
// Lista global para la renderización síncrona
window.globalBannedList = window.globalBannedList || [];

async function descargarBaneadosDeSupabase() {
  if (window.supabaseClient) {
    try {
      const { data, error } = await window.supabaseClient.from('usuarios_baneados').select('*');
      if (!error && data) {
        window.globalBannedList = data.map(d => String(d.motivo).toLowerCase().trim());
      }
    } catch(e) {
      console.error('Error al descargar baneados', e);
    }
  }
}

// Llamar al cargar para tener los baneos listos para el render sincrónico
document.addEventListener('DOMContentLoaded', descargarBaneadosDeSupabase);

function esRepartidorBaneado(nombre, placa, whatsapp, gmail) {
  const checkList = [nombre, placa, whatsapp, gmail].filter(Boolean).map(s => String(s).toLowerCase().trim());
  for (const b of window.globalBannedList) {
    if (b && checkList.some(c => c.includes(b) || b.includes(c))) return true;
  }
  return false;
}
async function banearRepartidorAdmin(vendorId, vendorName, plate = '', whatsapp = '') {
  if (window.supabaseClient) {
    const motivoText = [vendorName, plate, whatsapp].filter(Boolean).join(' | ');
    await window.supabaseClient.from('usuarios_baneados').insert([{
      user_id: vendorId,
      motivo: motivoText
    }]);
    await descargarBaneadosDeSupabase();
  }

  renderAdminVendorsList();
  renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🚫 Repartidor Baneado', `Se suspendió el acceso e ingreso de "${vendorName}".`, 'error', 5000);
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
async function desbanearRepartidorAdmin(vendorId, vendorName) {
  if (window.supabaseClient) {
    await window.supabaseClient.from('usuarios_baneados').delete().eq('user_id', vendorId);
    await descargarBaneadosDeSupabase();
  }

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
async function ejecutarBorradoRepartidor(vendorId, vendorName) {
  // 1. Eliminar de lista de repartidores en Supabase
  if (window.supabaseClient) {
      const realId = vendorId.replace('driver_', '');
      await window.supabaseClient.from('choferes_habilitados').delete().eq('id', realId);
  }

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
