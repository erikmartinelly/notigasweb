/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO 1-A-1
   Cada usuario tiene su propio canal privado con el admin y con repartidores.
   Solo el dueño del chat y el Administrador logueado pueden ver los mensajes.
   ========================================================================== */

const CHAT_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Horas en milisegundos

/* Devuelve la clave de localStorage para este chat.
   - Canal admin (Soporte OTB): clave PRIVADA por usuario, no global.
   - Admin logueado: puede iterar todos los canales para responder.
*/
function getChatHistoryKey(vendorName) {
  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  // Obtener identificador único del usuario actual
  let userGmail = 'anonimo';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userGmail = u.gmail.replace(/[^a-zA-Z0-9]/g, '_');
      else if (u.nombre) userGmail = u.nombre.replace(/[^a-zA-Z0-9]/g, '_');
    }
  } catch(e){}

  // Todos los canales (incluyendo Soporte OTB) son privados por usuario
  const prefix = `notigas_private_chat_${vendorName}_`;

  if (isAdmin) {
    // El admin ve el canal del usuario actualmente seleccionado en la lista
    const selectedUserKey = sessionStorage.getItem('notigas_admin_viewing_user');
    if (selectedUserKey) return selectedUserKey;
    // Si no hay usuario seleccionado, buscar el primer canal activo de este vendedor
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) return key;
      }
    } catch(e){}
    return `${prefix}sin_mensajes`;
  }

  return `${prefix}${userGmail}`;
}

/* Devuelve todos los canales activos de un vendedor (solo para admin) */
function obtenerCanalesActivosAdmin(vendorName) {
  const prefix = `notigas_private_chat_${vendorName}_`;
  const canales = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const msgs = JSON.parse(raw);
          if (msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            const userName = key.replace(prefix, '').replace(/_/g, ' ');
            canales.push({ key, userName, lastMsg });
          }
        }
      }
    }
  } catch(e){}
  return canales;
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
  const widget = document.getElementById('floatingChatWidget');
  const body = document.getElementById('chatPopupBody');
  if (widget) {
    poblarSelectorVendedoresChat();
    widget.style.display = 'flex';
    if (body) body.style.display = 'flex';
    cambiarVendedorChat();
  }
}

function cerrarFloatingChat() {
  const widget = document.getElementById('floatingChatWidget');
  if (widget) widget.style.display = 'none';
}

function minimizarFloatingChat() {
  const body = document.getElementById('chatPopupBody');
  if (body) {
    body.style.display = (body.style.display === 'none') ? 'flex' : 'none';
  }
}

function toggleFloatingChat() {
  const widget = document.getElementById('floatingChatWidget');
  if (widget) {
    if (widget.style.display === 'none' || !widget.style.display) {
      abrirFloatingChat();
    } else {
      cerrarFloatingChat();
    }
  }
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

function depurarMensajesExpirados(chatHistory) {
  const now = Date.now();
  return chatHistory.filter(msg => (now - msg.timestamp) < CHAT_EXPIRATION_MS);
}

function cambiarVendedorChat() {
  const selectVendor = document.getElementById('selectVendorChat');
  const box = document.getElementById('chatMessagesBox');
  if (!selectVendor || !box) return;

  const vendorName = selectVendor.value;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  // --- PANEL DEL ADMIN: mostrar lista de conversaciones activas ---
  if (isAdmin) {
    renderAdminChatPanel(vendorName, box);
    return;
  }

  // --- USUARIO NORMAL: solo ve su propio chat privado ---
  const historyKey = getChatHistoryKey(vendorName);
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    if (raw) history = JSON.parse(raw);
  } catch(e){}
  history = depurarMensajesExpirados(history);
  localStorage.setItem(historyKey, JSON.stringify(history));

  let userAlias = 'Cliente (Tú)';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) userAlias = `${u.nombre}${u.apellido ? ' ' + u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  const headerNotice = vendorName === 'Soporte OTB'
    ? `<div style="font-size:10px; color:#38BDF8; text-align:center; margin-bottom:8px; background:rgba(56,189,248,0.15); padding:6px 10px; border-radius:8px; border:1px solid rgba(56,189,248,0.4); font-weight:700;">
        🎧 CANAL DE ATENCIÓN DIRECTA CON EL ADMINISTRADOR NOTIGAS<br>
        <span style="font-size:9px; color:#CBD5E1; font-weight:400;">Tus mensajes son privados. Solo tú y el Administrador pueden verlos.</span>
       </div>`
    : `<div style="font-size:9.5px; color:#00E676; text-align:center; margin-bottom:8px; background:rgba(0,230,118,0.08); padding:6px 10px; border-radius:8px; border:1px solid rgba(0,230,118,0.2);">
        🔒 Chat privado con <strong>${escapeHtmlStr(vendorName)}</strong><br>
        <span style="font-size:9px; color:#CBD5E1;">Solo tú y el repartidor pueden ver estos mensajes. Expiran en 48h.</span>
       </div>`;

  let htmlContent = headerNotice;

  if (history.length === 0) {
    htmlContent += `<div style="text-align:center; color:#94A3B8; padding:20px 10px; font-size:11px; background:rgba(30,41,59,0.5); border-radius:10px; margin-top:10px;">
      💬 Aún no hay mensajes. Escribe abajo para iniciar la conversación privada.
    </div>`;
  }

  history.forEach(m => {
    const safeName = escapeHtmlStr(m.name || 'Usuario');
    const safeText = escapeHtmlStr(m.text || '');
    const safeTime = escapeHtmlStr(m.timeStr || '');

    if (m.sender === 'admin') {
      htmlContent += `
        <div class="chat-msg vendor" style="background:linear-gradient(135deg,rgba(180,83,9,0.3),rgba(217,119,6,0.3));border:1px solid #FBBF24;">
          <b style="color:#FBBF24;">👑 ${safeName}:</b><br>${safeText}
          <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
        </div>`;
    } else if (m.sender === 'vendor') {
      htmlContent += `
        <div class="chat-msg vendor">
          <b>🚛 ${safeName}:</b><br>${safeText}
          <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span>
            <button class="btn-report" onclick="abrirModalDenuncia('Chat Repartidor','Mensaje de ${safeName}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
          </div>
        </div>`;
    } else {
      htmlContent += `
        <div class="chat-msg buyer">
          <b>🏠 ${safeName}:</b><br>${safeText}
          <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
        </div>`;
    }
  });

  box.innerHTML = htmlContent;
  box.scrollTop = box.scrollHeight;
}

/* Renderiza el panel del administrador: lista de conversaciones activas */
function renderAdminChatPanel(vendorName, box) {
  const canales = obtenerCanalesActivosAdmin(vendorName);
  const selectedKey = sessionStorage.getItem('notigas_admin_viewing_user');

  // Si hay un canal seleccionado por el admin, mostrar esa conversación
  if (selectedKey) {
    let history = [];
    try {
      const raw = localStorage.getItem(selectedKey);
      if (raw) history = JSON.parse(raw);
    } catch(e){}
    history = depurarMensajesExpirados(history);

    const userName = selectedKey.split(`notigas_private_chat_${vendorName}_`)[1]?.replace(/_/g, ' ') || 'Usuario';

    let html = `
      <div style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:6px 10px; margin-bottom:8px; font-size:10px; color:#F59E0B; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
        <span>👑 ADMIN — Conversación con: <strong style="color:#FFF;">${escapeHtmlStr(userName)}</strong></span>
        <button onclick="sessionStorage.removeItem('notigas_admin_viewing_user'); cambiarVendedorChat();" style="background:rgba(255,255,255,0.1); border:none; color:#CBD5E1; padding:2px 8px; border-radius:4px; cursor:pointer; font-size:10px;">← Volver</button>
      </div>`;

    if (history.length === 0) {
      html += `<div style="text-align:center; color:#94A3B8; padding:20px 10px; font-size:11px;">Sin mensajes aún.</div>`;
    }

    history.forEach(m => {
      const safeName = escapeHtmlStr(m.name || 'Usuario');
      const safeText = escapeHtmlStr(m.text || '');
      const safeTime = escapeHtmlStr(m.timeStr || '');
      if (m.sender === 'admin') {
        html += `<div class="chat-msg vendor" style="background:linear-gradient(135deg,rgba(180,83,9,0.3),rgba(217,119,6,0.3));border:1px solid #FBBF24;">
          <b style="color:#FBBF24;">👑 ${safeName}:</b><br>${safeText}
          <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span></div>
        </div>`;
      } else {
        html += `<div class="chat-msg buyer">
          <b>🏠 ${safeName}:</b><br>${safeText}
          <div class="chat-msg-footer"><span class="chat-msg-time">${safeTime}</span>
            <button onclick="banearUsuarioAdmin('${safeName}')" style="background:#D32F2F;color:white;border:none;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;cursor:pointer;margin-left:6px;">🚫 Banear</button>
          </div>
        </div>`;
      }
    });

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    return;
  }

  // Panel inicial del admin: lista de todas las conversaciones activas
  let html = `
    <div style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:10px; color:#F59E0B; font-weight:700; text-align:center;">
      👑 PANEL ADMINISTRADOR NOTIGAS<br>
      <span style="font-size:9px; color:#CBD5E1; font-weight:400;">Conversaciones privadas activas con usuarios</span>
    </div>`;

  if (canales.length === 0) {
    html += `<div style="text-align:center; color:#94A3B8; padding:20px 10px; font-size:11px; background:rgba(30,41,59,0.5); border-radius:10px;">
      📭 No hay conversaciones activas con <strong>${escapeHtmlStr(vendorName)}</strong> aún.
    </div>`;
  } else {
    canales.forEach(c => {
      const lastText = escapeHtmlStr((c.lastMsg?.text || '').substring(0, 60));
      const lastSender = c.lastMsg?.sender === 'admin' ? '👑 Admin' : '🏠 ' + escapeHtmlStr(c.lastMsg?.name || 'Usuario');
      html += `
        <div onclick="sessionStorage.setItem('notigas_admin_viewing_user','${c.key}'); cambiarVendedorChat();"
             style="background:rgba(30,41,59,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px 12px; margin-bottom:8px; cursor:pointer; transition:background 0.2s;"
             onmouseover="this.style.background='rgba(245,158,11,0.12)'" onmouseout="this.style.background='rgba(30,41,59,0.8)'">
          <div style="font-size:11px; font-weight:700; color:#E2E8F0; margin-bottom:4px;">👤 ${escapeHtmlStr(c.userName)}</div>
          <div style="font-size:10px; color:#94A3B8;"><span style="color:#CBD5E1; font-weight:600;">${lastSender}:</span> ${lastText}${(c.lastMsg?.text || '').length > 60 ? '...' : ''}</div>
          <div style="font-size:9px; color:#64748B; margin-top:3px;">⏱ ${c.lastMsg?.timeStr || ''}</div>
        </div>`;
    });
  }

  box.innerHTML = html;
}

function enviarMensajeDirecto() {
  const selectVendor = document.getElementById('selectVendorChat');
  const input = document.getElementById('inputDirectMessage');
  const box = document.getElementById('chatMessagesBox');
  if (!selectVendor || !input || !box) return;

  const vendorName = selectVendor.value;
  const text = input.value.trim();
  if (!text) return;

  const nowMs = Date.now();
  const timeStr = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  let userAlias = 'Cliente (Tú)';
  let senderType = 'buyer';

  if (isAdmin) {
    senderType = 'admin';
    userAlias = '👑 Administrador NOTIGAS';
  } else {
    try {
      const saved = localStorage.getItem('notigas_user_data');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.nombre) userAlias = `${u.nombre}${u.apellido ? ' ' + u.apellido[0] + '.' : ''}`;
        if (u.role === 'repartidor') senderType = 'vendor';
      }
    } catch(e){}
    if (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') {
      senderType = 'vendor';
    }
  }

  const historyKey = getChatHistoryKey(vendorName);
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    if (raw) history = JSON.parse(raw);
  } catch(e){}

  history.push({ sender: senderType, name: userAlias, text, timeStr, timestamp: nowMs });
  history = depurarMensajesExpirados(history);
  localStorage.setItem(historyKey, JSON.stringify(history));

  input.value = '';
  cambiarVendedorChat();
}

/* VERIFICACIÓN Y APERTURA AUTOMÁTICA DEL CHAT PARA CORREOS DE ADMINISTRADOR */
function verificarYActivarChatAdminAuto() {
  let userEmail = '';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userEmail = u.gmail.toLowerCase().trim();
    }
  } catch(e){}

  const adminEmails = ['erikmartinelly@gmail.com', 'leonmartinelly13@gmail.com'];
  if (userEmail && adminEmails.includes(userEmail)) {
    sessionStorage.setItem('notigas_admin_session', userEmail);
    setTimeout(() => {
      const selectVendor = document.getElementById('selectVendorChat');
      if (selectVendor) {
        for (let i = 0; i < selectVendor.options.length; i++) {
          if (selectVendor.options[i].value === 'Soporte OTB') {
            selectVendor.selectedIndex = i;
            break;
          }
        }
      }
      abrirFloatingChat();
    }, 600);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  verificarYActivarChatAdminAuto();
});

/* escapeHtmlStr está definida en forum.js (que carga primero) — se elimina aquí para evitar
   sobreescritura con la versión ligeramente distinta de chat.js. */
