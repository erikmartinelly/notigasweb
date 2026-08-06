/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO 1-A-1 (Supabase Realtime)
   Cada usuario tiene su propio canal privado con el admin y con repartidores.
   Solo el dueño del chat y el Administrador logueado pueden ver los mensajes.
   ========================================================================== */

let currentChatSubscription = null;

function getCurrentUserEmail() {
  let userEmail = 'anonimo@notigas.com';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userEmail = u.gmail;
      else if (u.nombre) userEmail = u.nombre.replace(/[^a-zA-Z0-9]/g, '_') + "@notigas.com";
    }
  } catch(e){}
  return userEmail;
}

function getChatRoomId(vendorName) {
  return getCurrentUserEmail(); // Usamos el email del comprador como ID de sala (barrio_otb)
}

function poblarSelectorVendedoresChat() {
  const sel = document.getElementById('selectVendorChat');
  if (!sel) return;

  const currentVal = sel.value;
  let registeredDrivers = [];
  try {
    const raw = localStorage.getItem('notigas_registered_drivers_list');
    if (raw) registeredDrivers = JSON.parse(raw);
  } catch(e){}

  registeredDrivers.forEach(d => {
    const val = d.nombre;
    let exists = false;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val) { exists = true; break; }
    }
    if (!exists && val) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.text = `🚛 ${val} (${d.categoria || 'Repartidor'})`;
      sel.appendChild(opt);
    }
  });

  if (currentVal) sel.value = currentVal;
}

function abrirFloatingChat() {
  const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
  if (modal) {
    poblarSelectorVendedoresChat();
    modal.style.display = 'flex';
    cambiarVendedorChat();
  }
}

function cerrarFloatingChat() {
  const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
  if (modal) modal.style.display = 'none';
  if (currentChatSubscription && window.supabaseClient) {
    window.supabaseClient.removeChannel(currentChatSubscription);
    currentChatSubscription = null;
  }
}

function minimizarFloatingChat() {
  cerrarFloatingChat();
}

function toggleFloatingChat() {
  const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
  if (modal) {
    if (modal.style.display === 'none' || !modal.style.display) {
      abrirFloatingChat();
    } else {
      cerrarFloatingChat();
    }
  }
}

function abrirChatSoporteOficial() {
  abrirFloatingChat();
  const sel = document.getElementById('selectVendorChat');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === 'Soporte OTB' || sel.options[i].text.includes('Administrador') || sel.options[i].text.includes('Soporte')) {
        sel.selectedIndex = i;
        break;
      }
    }
  }
  cambiarVendedorChat();
}

function abrirChatDirectoVendedor(catNombre) {
  abrirFloatingChat();
  const sel = document.getElementById('selectVendorChat');
  if (sel && catNombre) {
    const search = catNombre.toLowerCase();
    for (let i = 0; i < sel.options.length; i++) {
      const val = sel.options[i].value.toLowerCase();
      const txt = sel.options[i].text.toLowerCase();
      if (val.includes(search) || txt.includes(search) || search.includes(val)) {
        sel.selectedIndex = i;
        break;
      }
    }
  }
  cambiarVendedorChat();
}

function escapeHtmlStr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function cambiarVendedorChat() {
  const selectVendor = document.getElementById('selectVendorChat');
  const box = document.getElementById('chatMessagesBox');
  if (!selectVendor || !box || !window.supabaseClient) return;

  const vendorName = selectVendor.value;
  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  // TODO: Panel de Admin completo requiere listar todos los chats de Supabase, lo simplificaremos por ahora a ver el chat seleccionado
  const roomUserEmail = isAdmin && sessionStorage.getItem('notigas_admin_viewing_user') 
                        ? sessionStorage.getItem('notigas_admin_viewing_user') 
                        : getChatRoomId(vendorName);

  box.innerHTML = `<div style="text-align:center; padding:20px; color:#94A3B8;">Cargando mensajes...</div>`;

  // Limpiar suscripción anterior
  if (currentChatSubscription) {
    window.supabaseClient.removeChannel(currentChatSubscription);
  }

  // Cargar historial
  const { data, error } = await window.supabaseClient.from('mensajes_chat_privados')
    .select('*')
    .eq('categoria_servicio', vendorName)
    .eq('barrio_otb', roomUserEmail)
    .order('timestamp', { ascending: true });
    
  renderizarMensajes(data || [], box, vendorName);

  // Suscribirse a nuevos mensajes
  currentChatSubscription = window.supabaseClient.channel('chat_room')
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'mensajes_chat_privados',
        filter: `categoria_servicio=eq.${vendorName}` 
    }, payload => {
        if (payload.new.barrio_otb === roomUserEmail) {
            appendMensaje(payload.new, box);
        }
    })
    .subscribe();
}

function renderizarMensajes(history, box, vendorName) {
  const headerNotice = vendorName === 'Soporte OTB'
    ? `<div style="font-size:10px; color:#38BDF8; text-align:center; margin-bottom:8px; background:rgba(56,189,248,0.15); padding:8px 10px; border-radius:10px; border:1px solid rgba(56,189,248,0.4); font-weight:700;">
        🎧 CANAL DE ATENCIÓN DIRECTA CON EL ADMINISTRADOR NOTIGAS<br>
        <span style="font-size:9.5px; color:#CBD5E1; font-weight:400;">Tus mensajes son privados. Solo tú y el Administrador pueden verlos.</span>
       </div>`
    : `<div style="font-size:10px; color:#FF8F00; text-align:center; margin-bottom:8px; background:rgba(255,109,0,0.14); padding:8px 10px; border-radius:10px; border:1px solid rgba(255,109,0,0.35); font-weight:800;">
        🛡️ CHAT MONITOREADO POR LA ADMINISTRACIÓN<br>
        <span style="font-size:9.5px; color:#CBD5E1; font-weight:400;">Canal directo con <strong>${escapeHtmlStr(vendorName)}</strong>. Expiración automática a los 7 días.</span>
       </div>`;

  let htmlContent = headerNotice;

  if (history.length === 0) {
    htmlContent += `<div style="text-align:center; color:#94A3B8; padding:20px 10px; font-size:11px; background:rgba(30,41,59,0.5); border-radius:10px; margin-top:10px;">
      💬 Aún no hay mensajes. Escribe abajo para iniciar la conversación privada.
    </div>`;
    box.innerHTML = htmlContent;
    return;
  }

  box.innerHTML = htmlContent;
  history.forEach(m => appendMensaje(m, box, false));
  box.scrollTop = box.scrollHeight;
}

function appendMensaje(m, box, scroll = true) {
  const safeName = escapeHtmlStr(m.alias_protegido || 'Usuario');
  const safeText = escapeHtmlStr(m.texto || '');
  const date = new Date(m.timestamp);
  const safeTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let html = '';
  if (m.autor_role === 'admin') {
    html = `
      <div class="chat-msg vendor" style="background:linear-gradient(135deg,rgba(180,83,9,0.3),rgba(217,119,6,0.3));border:1px solid #FBBF24;">
        <b style="color:#FBBF24;">👑 ${safeName}:</b><br>${safeText}
        <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
      </div>`;
  } else if (m.autor_role === 'repartidor') {
    html = `
      <div class="chat-msg vendor">
        <b>🚛 ${safeName}:</b><br>${safeText}
        <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
      </div>`;
  } else {
    html = `
      <div class="chat-msg buyer">
        <b>🏠 ${safeName}:</b><br>${safeText}
        <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
      </div>`;
  }
  
  box.insertAdjacentHTML('beforeend', html);
  if (scroll) box.scrollTop = box.scrollHeight;
}

async function enviarMensajeDirecto() {
  const selectVendor = document.getElementById('selectVendorChat');
  const input = document.getElementById('inputDirectMessage');
  if (!selectVendor || !input || !window.supabaseClient) return;

  const vendorName = selectVendor.value;
  const text = input.value.trim();
  if (!text) return;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  let userAlias = 'Cliente (Tú)';
  let senderRole = 'comprador';

  if (isAdmin) {
    senderRole = 'admin';
    userAlias = '👑 Administrador NOTIGAS';
  } else {
    try {
      const saved = localStorage.getItem('notigas_user_data');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.nombre) userAlias = `${u.nombre}${u.apellido ? ' ' + u.apellido[0] + '.' : ''}`;
        if (u.role === 'repartidor') senderRole = 'repartidor';
      }
    } catch(e){}
    if (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') {
      senderRole = 'repartidor';
    }
  }

  const roomUserEmail = isAdmin && sessionStorage.getItem('notigas_admin_viewing_user') 
                        ? sessionStorage.getItem('notigas_admin_viewing_user') 
                        : getChatRoomId(vendorName);

  input.value = '';

  const { error } = await window.supabaseClient.from('mensajes_chat_privados').insert([{
    categoria_servicio: vendorName,
    barrio_otb: roomUserEmail,
    autor_email: getCurrentUserEmail(),
    autor_role: senderRole,
    alias_protegido: userAlias,
    texto: text
  }]);

  if (error) console.error("Error enviando mensaje:", error);
}

function verificarYActivarChatAdminAuto() {
  const email = getCurrentUserEmail();
  const adminEmails = ['erikmartinelly@gmail.com', 'leonmartinelly13@gmail.com'];
  if (email && adminEmails.includes(email.toLowerCase())) {
    sessionStorage.setItem('notigas_admin_session', email);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  verificarYActivarChatAdminAuto();
});

function abrirChatPrivadoConComprador(encodedBuyerName) {
  const buyerName = decodeURIComponent(encodedBuyerName || 'Comprador Vecinal');
  abrirFloatingChat();
  const sel = document.getElementById('selectVendorChat');
  if (sel) {
    let found = false;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === buyerName || sel.options[i].text.includes(buyerName)) {
        sel.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement('option');
      opt.value = buyerName;
      opt.text = `🏠 ${buyerName} (Comprador)`;
      sel.appendChild(opt);
      sel.value = buyerName;
    }
  }
  cambiarVendedorChat();
}
