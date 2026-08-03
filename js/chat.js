/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO INTERNO 1-A-1 INDEPENDIENTE (PESTAÑA 4)
   Y DEPURACIÓN AUTOMÁTICA DE 48 HORAS POR PRIVACIDAD Y SEGURIDAD
   ========================================================================== */

const CHAT_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Horas en milisegundos

function getChatHistoryKey(vendorName) {
  let userGmail = "anonimo";
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) userGmail = u.gmail.replace(/[^a-zA-Z0-9]/g, '_');
    }
  } catch(e){}
  return `notigas_private_chat_${vendorName}_${userGmail}`;
}

function abrirFloatingChat() {
  const widget = document.getElementById('floatingChatWidget');
  const body = document.getElementById('chatPopupBody');
  if (widget) {
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

  // Clave privada aislada por usuario y por repartidor
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

  let htmlContent = `
    <div style="background: rgba(255,109,0,0.08); border: 1px dashed rgba(255,109,0,0.3); border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; font-size: 11px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="abrirAnuncioWhatsApp()">
      <span style="color: #FF6D00; font-weight: 700;"><i class="fa-solid fa-rectangle-ad"></i> Publicidad OTB / Google Ads</span>
      <span style="color: #94A3B8; font-size: 10px;">Ver anuncio <i class="fa-solid fa-chevron-right"></i></span>
    </div>

    <div style="font-size: 9.5px; color: #00E676; text-align: center; margin-bottom: 8px; background: rgba(0,230,118,0.08); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(0,230,118,0.2);">
      🔒 CHAT NOTIGAS 1-A-1 • MÓDULO FLOTANTE<br>⚠️ Por tu seguridad y rendimiento del sistema, los mensajes duran 48h y son eliminados automáticamente.
    </div>
  `;

  if (history.length === 0) {
    let initialText = `¡Hola vecino! Estoy atendiendo tu zona en la OTB. ¿En qué te puedo colaborar hoy?`;
    let initialVendorName = `Repartidor en Ruta (${vendorName})`;

    if (vendorName === 'Soporte OTB') {
      initialVendorName = `🎧 Servicio al Cliente OTB`;
      initialText = `¡Hola vecino! Bienvenido a Servicio al Cliente & Soporte OTB. ¿Tienes dudas sobre el recorrido de camiones o la aplicación? Escríbenos aquí.`;
    }

    const defaultVendorMsg = {
      sender: 'vendor',
      name: initialVendorName,
      text: initialText,
      timeStr: timeStr,
      timestamp: nowMs
    };
    const defaultBuyerMsg = {
      sender: 'buyer',
      name: userAlias,
      text: `Hola, requiero atención para ${vendorName}. Mi ubicación exacta está disponible.`,
      timeStr: timeStr,
      timestamp: nowMs
    };
    history.push(defaultVendorMsg, defaultBuyerMsg);
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  history.forEach(m => {
    const escapedSender = (m.name || '').replace(/'/g, "\\'");
    if (m.sender === 'vendor') {
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

  let userAlias = "Cliente (Tú)";
  let isVendorSender = false;
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) userAlias = `${u.nombre} ${u.apellido ? u.apellido[0] + '.' : ''}`;
      if (u.role === 'repartidor') isVendorSender = true;
    }
  } catch(e){}

  if (typeof currentAppMode !== 'undefined' && currentAppMode === 'driver') {
    isVendorSender = true;
  }

  const historyKey = getChatHistoryKey(vendorName);
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    if (raw) history = JSON.parse(raw);
  } catch(e){}

  const newMsg = {
    sender: isVendorSender ? 'vendor' : 'buyer',
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
