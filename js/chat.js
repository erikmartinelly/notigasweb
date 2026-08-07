/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO 1-A-1 (Supabase Realtime)
   Cada usuario tiene su propio canal privado con el admin y con repartidores.
   Solo el dueño del chat y el Administrador logueado pueden ver los mensajes.
   ========================================================================== */

let globalChatSubscription = null;

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

function getUserProfile() {
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) return JSON.parse(saved);
  } catch(e){}
  return {};
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

function reproducirSonidoNotificacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

async function cambiarVendedorChat() {
  const selectVendor = document.getElementById('selectVendorChat');
  const box = document.getElementById('chatMessagesBox');
  if (!selectVendor || !box || !window.supabaseClient) return;

  const vendorName = selectVendor.value;
  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));
  const profile = getUserProfile();
  const isDriver = profile.role === 'repartidor';

  // Lógica reparada de emparejamiento de salas
  let roomUserEmail = getCurrentUserEmail();
  let roomCategoria = vendorName;

  if (isAdmin) {
    if (vendorName !== 'Soporte OTB') {
      // Como admin, al seleccionar un repartidor, queremos ver TODOS sus chats
      // Usaremos un comodín o simplemente consultaremos por categoría
      roomUserEmail = null; // No filtramos por comprador, vemos todo
    }
  } else if (isDriver && vendorName !== 'Soporte OTB') {
    // Si soy repartidor y no hablo con soporte, 'vendorName' contiene el correo/nombre del comprador
    roomUserEmail = vendorName; 
    roomCategoria = profile.categoria || 'Gas GLP'; 
  }

  box.innerHTML = `<div style="text-align:center; padding:20px; color:#94A3B8;">Cargando mensajes...</div>`;

  // Construir consulta dinámica
  let query = window.supabaseClient.from('mensajes_chat_privados')
    .select('*')
    .eq('categoria_servicio', roomCategoria)
    .order('timestamp', { ascending: true });

  if (roomUserEmail) {
    query = query.eq('barrio_otb', roomUserEmail);
  }

  const { data, error } = await query;
  renderizarMensajes(data || [], box, vendorName);
}

function renderizarMensajes(history, box, vendorName) {
  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const headerNotice = vendorName === 'Soporte OTB'
    ? `<div style="font-size:10px; color:#38BDF8; text-align:center; margin-bottom:8px; background:rgba(56,189,248,0.15); padding:8px 10px; border-radius:10px; border:1px solid rgba(56,189,248,0.4); font-weight:700;">
        🎧 CANAL DE ATENCIÓN DIRECTA CON EL ADMINISTRADOR NOTIGAS<br>
        <span style="font-size:9.5px; color:#CBD5E1; font-weight:400;">Tus mensajes son privados. Solo tú y el Administrador pueden verlos.</span>
       </div>`
    : `<div style="font-size:10px; color:#FF1744; text-align:center; margin-bottom:8px; background:rgba(255,23,68,0.1); padding:8px 10px; border-radius:10px; border:1px solid rgba(255,23,68,0.3); font-weight:800; text-transform:uppercase;">
        ⚠️ ESTA CONVERSACIÓN ES MONITOREADA POR LA OTB POR MOTIVOS DE SEGURIDAD Y CALIDAD (COMO UNA LLAMADA TELEFÓNICA).<br>
        <span style="font-size:9.5px; color:#94A3B8; font-weight:400; text-transform:none;">Canal directo con <strong>${escapeHtmlStr(vendorName)}</strong>. Expiración automática.</span>
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
  const isAdmin = getVerifiedAdminEmail() != null;

  let html = '';
  // En modo admin mostramos el correo original para trazabilidad
  const extraInfo = isAdmin ? `<br><span style="font-size:8px; color:#64748B;">ID: ${escapeHtmlStr(m.barrio_otb)}</span>` : '';

  if (m.autor_role === 'admin') {
    html = `
      <div class="chat-msg vendor" style="background:linear-gradient(135deg,rgba(180,83,9,0.3),rgba(217,119,6,0.3));border:1px solid #FBBF24;">
        <b style="color:#FBBF24;">👑 ${safeName}:</b><br>${safeText}
        <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
      </div>`;
  } else if (m.autor_role === 'repartidor') {
    html = `
      <div class="chat-msg vendor">
        <b>🚛 ${safeName}:</b>${extraInfo}<br>${safeText}
        <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
      </div>`;
  } else {
    html = `
      <div class="chat-msg buyer">
        <b>🏠 ${safeName}:</b>${extraInfo}<br>${safeText}
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

  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));
  const profile = getUserProfile();

  let userAlias = 'Cliente (Tú)';
  let senderRole = 'comprador';

  if (isAdmin) {
    senderRole = 'admin';
    userAlias = '👑 Administrador NOTIGAS';
  } else {
    if (profile.nombre) userAlias = `${profile.nombre}${profile.apellido ? ' ' + profile.apellido[0] + '.' : ''}`;
    if (profile.role === 'repartidor') senderRole = 'repartidor';
  }

  let roomUserEmail = getCurrentUserEmail();
  let roomCategoria = vendorName;

  if (isAdmin && vendorName !== 'Soporte OTB') {
     // Admin respondiendo a un canal de repartidor. Usará el ID que esté visualizando o global
     roomCategoria = vendorName;
     roomUserEmail = 'Supervision'; // Idealmente debería responder al buyerEmail específico, pero lo mantenemos simple para el demo
  } else if (senderRole === 'repartidor' && vendorName !== 'Soporte OTB') {
     roomUserEmail = vendorName; // buyer email
     roomCategoria = profile.categoria || 'Gas GLP';
  }

  input.value = '';

  const { error } = await window.supabaseClient.from('mensajes_chat_privados').insert([{
    categoria_servicio: roomCategoria,
    barrio_otb: roomUserEmail,
    autor_email: getCurrentUserEmail(),
    autor_role: senderRole,
    alias_protegido: userAlias,
    texto: text
  }]);

  if (error) console.error("Error enviando mensaje:", error);
}

function iniciarEscuchaGlobalChat() {
  if (!window.supabaseClient) return;
  
  // Limpiar anterior si existe
  if (globalChatSubscription) {
    window.supabaseClient.removeChannel(globalChatSubscription);
  }

  // Canal dinámico único
  const channelName = 'chat_global_' + Math.random().toString(36).substr(2, 9);
  
  globalChatSubscription = window.supabaseClient.channel(channelName)
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'mensajes_chat_privados'
    }, payload => {
        procesarMensajeEntrante(payload.new);
    })
    .subscribe();
}

function procesarMensajeEntrante(msg) {
  const myEmail = getCurrentUserEmail();
  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin != null;
  const profile = getUserProfile();
  const isDriver = profile.role === 'repartidor';
  
  // No reaccionar a mis propios mensajes
  if (msg.autor_email === myEmail && !isAdmin) return;

  let isForMe = false;
  let senderId = msg.autor_email; // Por defecto
  
  if (isAdmin) {
    // El admin ve TODO (Supervisión total)
    isForMe = true;
  } else if (isDriver) {
    // Si soy repartidor, me interesan los mensajes dirigidos a mi categoría
    if (msg.categoria_servicio === profile.categoria) {
      isForMe = true;
      senderId = msg.barrio_otb; // El comprador
    } else if (msg.categoria_servicio === 'Soporte OTB' && msg.barrio_otb === myEmail) {
      isForMe = true;
      senderId = 'Soporte OTB';
    }
  } else {
    // Si soy comprador, me interesan los mensajes donde el barrio_otb es mi email
    if (msg.barrio_otb === myEmail) {
      isForMe = true;
      senderId = msg.categoria_servicio; // El repartidor
    }
  }

  if (isForMe) {
    // Reproducir Sonido y Auto-Desplegar
    reproducirSonidoNotificacion();

    const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
    const isClosed = !modal || modal.style.display === 'none' || modal.style.display === '';
    
    if (isClosed) {
      // Auto desplegar y cargar el chat
      abrirChatPrivadoConComprador(senderId); // Esto abrirá el dropdown en el senderId correcto
    } else {
      // Ya está abierto, verificar si estamos en la sala correcta para inyectar
      const sel = document.getElementById('selectVendorChat');
      if (sel) {
        let currentTarget = sel.value;
        let isCurrentRoom = false;
        
        if (isAdmin) {
          isCurrentRoom = (currentTarget === msg.categoria_servicio);
        } else if (isDriver) {
           isCurrentRoom = (currentTarget === msg.barrio_otb) || (currentTarget === msg.categoria_servicio);
        } else {
           isCurrentRoom = (currentTarget === msg.categoria_servicio);
        }

        if (isCurrentRoom) {
          const box = document.getElementById('chatMessagesBox');
          if (box) appendMensaje(msg, box);
        } else {
           // Notificación sutil de que hay mensaje en otra sala (opcional)
           if (typeof showToast === 'function') {
             showToast('Nuevo Mensaje', `Has recibido un mensaje de ${escapeHtmlStr(msg.alias_protegido)}`, 'info', 3000);
           }
        }
      }
    }
  }
}

function verificarYActivarChatAdminAuto() {
  const email = getCurrentUserEmail();
  const adminEmails = ['erikmartinelly@gmail.com', 'leonmartinelly13@gmail.com'];
    if (email && adminEmails.includes(email.toLowerCase())) {
      // Legacy session variable removed; rely on Google JWT token logic in admin.js
    }
}

function abrirChatPrivadoConComprador(encodedBuyerName) {
  const buyerName = decodeURIComponent(encodedBuyerName || 'Comprador Vecinal');
  const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
  if (modal) {
    poblarSelectorVendedoresChat();
    modal.style.display = 'flex';
  }

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
      opt.text = `👤 ${buyerName} (Contacto)`;
      sel.appendChild(opt);
      sel.value = buyerName;
    }
  }
  cambiarVendedorChat();
}

document.addEventListener('DOMContentLoaded', () => {
  verificarYActivarChatAdminAuto();
  // Retrasar 2 segundos para asegurar que Supabase Client esté listo
  setTimeout(iniciarEscuchaGlobalChat, 2000);
});
