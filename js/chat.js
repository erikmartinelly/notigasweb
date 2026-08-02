/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT PRIVADO 1-A-1 (CLIENTE ↔ REPARTIDOR)
   Y DEPURACIÓN AUTOMÁTICA DE 48 HORAS
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

function abrirChatDirectoVendedor(catNombre) {
  if (typeof switchTab === 'function') switchTab(2);
  if (typeof switch3rdTabMode === 'function') switch3rdTabMode('direct');

  const sel = document.getElementById('selectVendorChat');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.includes(catNombre)) {
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

    <div style="font-size: 9px; color: #00E676; text-align: center; margin-bottom: 8px; background: rgba(0,230,118,0.08); padding: 6px; border-radius: 8px; border: 1px solid rgba(0,230,118,0.2);">
      🔒 CHAT PRIVADO Y CONFIDENCIAL 1-A-1 ENTRE TÚ Y EL REPARTIDOR.<br>Tus mensajes y datos compartidos solo se ven en esta sesión y expiran en 48h.
    </div>
  `;

  if (history.length === 0) {
    const defaultVendorMsg = {
      sender: 'vendor',
      name: `Repartidor en Ruta (${vendorName})`,
      text: `¡Hola vecino! Estoy atendiendo tu zona en la OTB. ¿Cuántas unidades de ${vendorName} necesitas?`,
      timeStr: timeStr,
      timestamp: nowMs
    };
    const defaultBuyerMsg = {
      sender: 'buyer',
      name: userAlias,
      text: `Hola, necesito atención para ${vendorName}. Mi ubicación exacta está en el mapa.`,
      timeStr: timeStr,
      timestamp: nowMs
    };
    history.push(defaultVendorMsg, defaultBuyerMsg);
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  history.forEach(m => {
    if (m.sender === 'vendor') {
      htmlContent += `
        <div class="chat-msg vendor">
          <b>🚛 ${m.name}:</b><br>${m.text}
          <div class="chat-msg-footer">
            <span class="chat-msg-time">${m.timeStr}</span>
            <button class="btn-report" onclick="abrirModalDenuncia('Chat Repartidor', 'Mensaje de Repartidor')"><i class="fa-solid fa-flag"></i> Denunciar</button>
          </div>
        </div>
      `;
    } else {
      htmlContent += `
        <div class="chat-msg buyer">
          <b>🏠 ${m.name}:</b><br>${m.text}
          <div class="chat-msg-footer">
            <span class="chat-msg-time">${m.timeStr}</span>
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
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.nombre) userAlias = `${u.nombre} ${u.apellido ? u.apellido[0] + '.' : ''}`;
    }
  } catch(e){}

  const historyKey = getChatHistoryKey(vendorName);
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    if (raw) history = JSON.parse(raw);
  } catch(e){}

  history = depurarMensajesExpirados(history);

  const newBuyerMsg = {
    sender: 'buyer',
    name: userAlias,
    text: text,
    timeStr: timeStr,
    timestamp: nowMs
  };

  history.push(newBuyerMsg);
  localStorage.setItem(historyKey, JSON.stringify(history));

  input.value = '';
  cambiarVendedorChat();

  setTimeout(() => {
    const vendorReply = {
      sender: 'vendor',
      name: `Repartidor en Ruta (${vendorName})`,
      text: `Entendido, pedido recibido de forma privada. Me dirijo a tu ubicación fijada en el mapa.`,
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };
    
    let currentHist = [];
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) currentHist = JSON.parse(raw);
    } catch(e){}

    currentHist.push(vendorReply);
    localStorage.setItem(historyKey, JSON.stringify(currentHist));
    cambiarVendedorChat();
  }, 1000);
}
