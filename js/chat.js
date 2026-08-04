/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO INTERNO 1-A-1 INDEPENDIENTE (PESTAÑA 4)
   Y DEPURACIÓN AUTOMÁTICA DE 48 HORAS POR PRIVACIDAD Y SEGURIDAD
   ========================================================================== */

const CHAT_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Horas en milisegundos

function getChatHistoryKey(vendorName) {
  if (vendorName === 'Soporte OTB') {
    return 'notigas_support_global_channel';
  }

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  // Si es Administrador, buscar cualquier canal de chat activo registrado para este negocio
  if (isAdmin) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`notigas_private_chat_${vendorName}_`)) {
          return key;
        }
      }
    } catch(e){}
  }

  let userGmail = "anonimo";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userGmail = u.gmail.replace(/[^a-zA-Z0-9]/g, '_');
      else if (u.nombre) userGmail = u.nombre.replace(/[^a-zA-Z0-9]/g, '_');
    }
  } catch(e){}
  return `notigas_private_chat_${vendorName}_${userGmail}`;
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
      if (sel.options[i].value === val) {
        exists = true;
        break;
      }
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
    let foundIndex = -1;
    const search = catNombre.toLowerCase();
    for (let i = 0; i < sel.options.length; i++) {
      const val = sel.options[i].value.toLowerCase();
      const txt = sel.options[i].text.toLowerCase();
      if (val.includes(search) || txt.includes(search) || search.includes(val)) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex !== -1) {
      sel.selectedIndex = foundIndex;
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
  const nowMs = Date.now();
  const timeStr = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const historyKey = getChatHistoryKey(vendorName);
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    if (raw) history = JSON.parse(raw);
  } catch(e){}

  history = depurarMensajesExpirados(history);
  localStorage.setItem(historyKey, JSON.stringify(history));

  let userAlias = "Cliente (Tú)";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) userAlias = `${u.nombre} ${u.apellido ? u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  let headerNotice = `
    <div style="font-size: 9.5px; color: #00E676; text-align: center; margin-bottom: 8px; background: rgba(0,230,118,0.08); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(0,230,118,0.2);">
      🔒 CHAT NOTIGAS 1-A-1 • MÓDULO FLOTANTE<br>⚠️ Los mensajes expiran automáticamente a las 48h.
    </div>
  `;

  if (isAdmin) {
    if (vendorName === 'Soporte OTB') {
      headerNotice = `
        <div style="font-size: 10px; color: #F59E0B; text-align: center; margin-bottom: 8px; background: rgba(245,158,11,0.15); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(245,158,11,0.4); font-weight:700;">
          👑 CANAL DIRECTO DE ATENCIÓN AL CLIENTE (MODO ADMINISTRADOR LOGUEADO)<br><span style="font-size:9px; color:#CBD5E1; font-weight:400;">Responde en vivo a las consultas enviadas por los vecinos de la OTB.</span>
        </div>
      `;
    } else {
      headerNotice = `
        <div style="font-size: 10px; color: #F59E0B; text-align: center; margin-bottom: 8px; background: rgba(245,158,11,0.15); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(245,158,11,0.4); font-weight:700;">
          👑 MONITOREO DE NEGOCIO EN VIVO (MODO ADMINISTRADOR LOGUEADO)<br><span style="font-size:9px; color:#CBD5E1; font-weight:400;">Supervisando consultas dirigidas al negocio (${vendorName}). Puedes responder como Administración.</span>
        </div>
      `;
    }
  } else if (vendorName === 'Soporte OTB') {
    headerNotice = `
      <div style="font-size: 10px; color: #38BDF8; text-align: center; margin-bottom: 8px; background: rgba(56,189,248,0.15); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(56,189,248,0.4); font-weight:700;">
        🎧 CANAL DE ATENCIÓN DIRECTA CON EL ADMINISTRADOR OTB<br><span style="font-size:9px; color:#CBD5E1; font-weight:400;">Tu mensaje llegará directamente al Administrador cuando esté logueado.</span>
      </div>
    `;
  }

  let htmlContent = `
    <div style="background: rgba(255,109,0,0.08); border: 1px dashed rgba(255,109,0,0.3); border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; font-size: 11px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="abrirAnuncioWhatsApp()">
      <span style="color: #FF6D00; font-weight: 700;"><i class="fa-solid fa-rectangle-ad"></i> Publicidad OTB / Google Ads</span>
      <span style="color: #94A3B8; font-size: 10px;">Ver anuncio <i class="fa-solid fa-chevron-right"></i></span>
    </div>
    ${headerNotice}
  `;

  if (history.length === 0) {
    let initialText = `¡Hola vecino! Estoy atendiendo tu zona en la OTB. ¿En qué te puedo colaborar hoy?`;
    let initialVendorName = `Repartidor en Ruta (${vendorName})`;

    if (vendorName === 'Soporte OTB') {
      initialVendorName = `👑 Administrador OTB (Soporte Oficial)`;
      initialText = `¡Hola vecino! Bienvenido al Soporte Oficial NOTIGAS. Escribe tu consulta aquí y el Administrador te responderá directamente.`;
    }

    const defaultVendorMsg = {
      sender: vendorName === 'Soporte OTB' ? 'admin' : 'vendor',
      name: initialVendorName,
      text: initialText,
      timeStr: timeStr,
      timestamp: nowMs
    };
    const defaultBuyerMsg = {
      sender: 'buyer',
      name: userAlias,
      text: `Hola, requiero atención para ${vendorName}.`,
      timeStr: timeStr,
      timestamp: nowMs
    };
    history.push(defaultVendorMsg, defaultBuyerMsg);
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  history.forEach(m => {
    const escapedSender = (m.name || '').replace(/'/g, "\\'");
    if (m.sender === 'admin') {
      htmlContent += `
        <div class="chat-msg vendor" style="background: linear-gradient(135deg, rgba(180,83,9,0.3), rgba(217,119,6,0.3)); border: 1px solid #FBBF24;">
          <b style="color:#FBBF24;">👑 ${m.name}:</b><br>${m.text}
          <div class="chat-msg-footer">
            <span class="chat-msg-time">${m.timeStr}</span>
          </div>
        </div>
      `;
    } else if (m.sender === 'vendor') {
      htmlContent += `
        <div class="chat-msg vendor">
          <b>🚛 ${m.name}:</b><br>${m.text}
          <div class="chat-msg-footer">
            <span class="chat-msg-time">${m.timeStr}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              <button class="btn-report" onclick="abrirModalDenuncia('Chat Repartidor', 'Mensaje de ${escapedSender}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
              ${isAdmin ? `<button onclick="banearUsuarioAdmin('${escapedSender}')" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; cursor:pointer;" title="Banear Usuario desde Chat">🚫 Banear (Admin)</button>` : ''}
            </div>
          </div>
        </div>
      `;
    } else {
      htmlContent += `
        <div class="chat-msg buyer">
          <b>🏠 ${m.name}:</b><br>${m.text}
          <div class="chat-msg-footer">
            <span class="chat-msg-time">${m.timeStr}</span>
            ${isAdmin ? `<button onclick="banearUsuarioAdmin('${escapedSender}')" style="background:#D32F2F; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; cursor:pointer; margin-left:6px;" title="Banear Usuario desde Chat">🚫 Banear (Admin)</button>` : ''}
          </div>
        </div>
      `;
    }
  });

  box.innerHTML = htmlContent;
  box.scrollTop = box.scrollHeight;
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

  let userAlias = "Cliente (Tú)";
  let senderType = 'buyer';

  if (isAdmin) {
    senderType = 'admin';
    userAlias = "👑 Administrador OTB";
  } else {
    try {
      const saved = localStorage.getItem('notigas_user_data');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.nombre) userAlias = `${u.nombre} ${u.apellido ? u.apellido[0] + '.' : ''}`;
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

  const newMsg = {
    sender: senderType,
    name: userAlias,
    text: text,
    timeStr: timeStr,
    timestamp: nowMs
  };

  history.push(newMsg);
  history = depurarMensajesExpirados(history);
  localStorage.setItem(historyKey, JSON.stringify(history));

  input.value = '';
  cambiarVendedorChat();
}

/* VERIFICACIÓN Y APERTURA AUTOMÁTICA DEL CHAT PARA CORREOS DE ADMINISTRADOR */
function verificarYActivarChatAdminAuto() {
  let userEmail = "";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userEmail = u.gmail.toLowerCase().trim();
    }
  } catch(e){}

  const adminEmails = ["erikmartinelly@gmail.com", "leonmartinelly13@gmail.com"];
  if (userEmail && adminEmails.includes(userEmail)) {
    // 1. Iniciar sesión de administración automáticamente por coincidencia de correo
    sessionStorage.setItem('notigas_admin_session', userEmail);

    // 2. Desplegar el widget de chat flotante canalizado en Soporte OTB
    setTimeout(() => {
      const selectVendor = document.getElementById('selectVendorChat');
      if (selectVendor) {
        let foundIndex = -1;
        for (let i = 0; i < selectVendor.options.length; i++) {
          if (selectVendor.options[i].value === 'Soporte OTB') {
            foundIndex = i;
            break;
          }
        }
        if (foundIndex !== -1) selectVendor.selectedIndex = foundIndex;
      }
      abrirFloatingChat();
    }, 600);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  verificarYActivarChatAdminAuto();
});
