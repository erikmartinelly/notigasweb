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
          if (d.motivo) window.globalBannedList.push(String(d.motivo).toLowerCase().trim());
          if (d.email) window.globalBannedList.push(String(d.email).toLowerCase().trim());
          if (d.nombre) window.globalBannedList.push(String(d.nombre).toLowerCase().trim());
          if (d.placa) window.globalBannedList.push(String(d.placa).toLowerCase().trim());
          if (d.telefono) window.globalBannedList.push(String(d.telefono).toLowerCase().trim());
        });
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
    await window.supabaseClient.from('usuarios_baneados').insert([{
      user_id: vendorId,
      nombre: vendorName,
      placa: plate,
      telefono: whatsapp,
      motivo: 'Baneado por Administrador'
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
    localStorage.removeItem('notigas_banned_users');
    localStorage.removeItem('notigas_deleted_vendor_ids');
  } catch(e){}

  if (window.supabaseClient) {
    const { error } = await window.supabaseClient.from('usuarios_baneados').delete().neq('id', 0);
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

async function aprobarRepartidorAdmin(idStr) {
  if (!window.supabaseClient) return;
  const dbId = idStr.replace('driver_', '');
  const { error } = await window.supabaseClient
    .from('choferes_habilitados')
    .update({ estado_verificacion: 'aprobado' })
    .eq('id', dbId);
  if (error) {
    if (typeof showToast === 'function') showToast('Error', 'No se pudo aprobar el repartidor', 'error');
  } else {
    if (typeof showToast === 'function') showToast('Éxito', 'Repartidor aprobado correctamente', 'success');
    if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
    if (typeof descargarChoferesYRenderizar === 'function') descargarChoferesYRenderizar('TODOS');
  }
}
window.borrarRepartidorPermanente = async function(vendorId, vendorName) {
  if (vendorId === 'driver_undefined' || !vendorId) {
    if (confirm(`⚠️ ¿Eliminar permanentemente a ${vendorName}?`)) {
      await ejecutarBorradoRepartidor(vendorId, vendorName);
    }
  } else {
    if (confirm(`⚠️ ¿Eliminar permanentemente a ${vendorName}?`)) {
      await ejecutarBorradoRepartidor(vendorId, vendorName);
    }
  }
}
async function ejecutarBorradoRepartidor(vendorId, vendorName) {
  // 1. Eliminar de lista de repartidores en Supabase
  if (window.supabaseClient) {
      try {
        const realId = vendorId.replace('driver_', '');
        const { error } = await window.supabaseClient.from('choferes_habilitados').delete().eq('id', realId);
        if (error) {
          console.error("Error al borrar de Supabase:", error);
          if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo eliminar el repartidor.', 'error', 3000);
          return;
        }
      } catch (err) {
        console.error("Error inesperado al borrar:", err);
      }
  }

  // 2. Limpiar notigas_user_data si coincide con el usuario activo
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre === vendorName) {
        localStorage.removeItem('notigas_user_data');
      }
    }
  } catch(e){}

  // 3. Remover del directorio local para refrescar la UI inmediatamente
  try {
    const dir = localStorage.getItem('notigas_vendors_directory');
    if (dir) {
      let list = JSON.parse(dir);
      list = list.filter(v => v.id !== vendorId);
      localStorage.setItem('notigas_vendors_directory', JSON.stringify(list));
    }
  } catch(e){}

  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  if (typeof renderAdminDashboardKPIs === 'function') renderAdminDashboardKPIs();
  if (typeof renderVendorCards === 'function') renderVendorCards('TODOS');

  if (typeof showToast === 'function') {
    showToast('🗑️ Eliminado', `La Ficha de Repartidor "${vendorName}" ha sido borrada exitosamente.`, 'success', 4000);
  }
}
window.borrarCompradorPermanente = function(gmail, nombre) {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('⚠️', `¿Bloquear permanentemente al usuario ${nombre}?`, 'Por reglas de Supabase, la cuenta no se puede eliminar completamente desde aquí, pero se bloqueará su acceso a la app.', 'Bloquear', () => {
      ejecutarBloqueoComprador(gmail, nombre);
    });
  } else {
    if(confirm(`⚠️ ¿Bloquear permanentemente al usuario ${nombre}?`)) {
      ejecutarBloqueoComprador(gmail, nombre);
    }
  }
}
async function ejecutarBloqueoComprador(gmail, nombre) {
  if (window.supabaseClient) {
    await window.supabaseClient.from('usuarios_baneados').insert([{
      email: gmail,
      nombre: nombre,
      motivo: 'Bloqueado Permanentemente'
    }]);
    await descargarBaneadosDeSupabase();
  }
  
  if (typeof renderAdminVendorsList === 'function') renderAdminVendorsList();
  
  if (typeof showToast === 'function') {
    showToast('🚫 Comprador Bloqueado', `El usuario ${nombre} ha sido bloqueado exitosamente.`, 'success', 4000);
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
