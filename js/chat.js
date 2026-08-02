/* ==========================================================================
   NOTIGAS - MÓDULO DE CHAT DIRECTO COMPRADOR ↔ VENDEDOR
   ========================================================================== */

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

function cambiarVendedorChat() {
  const selectVendor = document.getElementById('selectVendorChat');
  const box = document.getElementById('chatMessagesBox');
  if (!selectVendor || !box) return;

  const vendorName = selectVendor.value;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  box.innerHTML = `
    <div style="background: rgba(255,109,0,0.08); border: 1px dashed rgba(255,109,0,0.3); border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; font-size: 11px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="abrirAnuncioWhatsApp()">
      <span style="color: #FF6D00; font-weight: 700;"><i class="fa-solid fa-rectangle-ad"></i> Publicidad OTB / Google Ads</span>
      <span style="color: #94A3B8; font-size: 10px;">Ver anuncio <i class="fa-solid fa-chevron-right"></i></span>
    </div>
    <div class="chat-msg vendor">
      <b>🚛 Vendedor de ${vendorName}:</b><br>¡Hola vecino! Estoy atendiendo la zona de tu OTB para ${vendorName}. ¿Dónde deseas la entrega?
      <div class="chat-msg-time">${now}</div>
    </div>
    <div class="chat-msg buyer">
      <b>🏠 Tú (Comprador):</b><br>Hola, mi ubicación exacta de entrega está fijada en el mapa interactivo de NOTIGAS.
      <div class="chat-msg-time">${now}</div>
    </div>
  `;
}

function enviarMensajeDirecto() {
  const input = document.getElementById('inputDirectMessage');
  const box = document.getElementById('chatMessagesBox');
  if (!input || !box) return;

  const text = input.value.trim();
  if (!text) return;

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const buyerMsg = document.createElement('div');
  buyerMsg.className = 'chat-msg buyer';
  buyerMsg.innerHTML = `<b>🏠 Tú (Comprador):</b><br>${text}<div class="chat-msg-time">${now}</div>`;
  box.appendChild(buyerMsg);

  input.value = '';
  box.scrollTop = box.scrollHeight;

  setTimeout(() => {
    const vendorMsg = document.createElement('div');
    vendorMsg.className = 'chat-msg vendor';
    vendorMsg.innerHTML = `<b>🚛 Vendedor en Ruta:</b><br>Entendido, recibido. Me aproximo a tu ubicación fijada en el mapa.<div class="chat-msg-time">${now}</div>`;
    box.appendChild(vendorMsg);
    box.scrollTop = box.scrollHeight;
  }, 1000);
}
