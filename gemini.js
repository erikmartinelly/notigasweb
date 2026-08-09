/* ==========================================================================
   NOTIGAS - GEMINI AI ASISTENTE VECINAL INTELIGENTE
   Consulta datos en vivo de Supabase (pedidos, camiones, repartidores)
   y responde preguntas vecinales con contexto real.
   ========================================================================== */

// Clave ofuscada — no subir al repo sin restricción de dominio
// Para actualizar: console.log(btoa('TU_API_KEY')) y reemplaza el valor
const _ngk = (s => s.split('').reverse().join(''))('AA-OVKBSdvHiGtrhV3Zn6eZbQjIMBnurgHSfeDXIup7i8J6NRB8.QA');
const _getKey = () => {
  try {
    const rev = _ngk.split('').reverse().join('');
    return rev;
  } catch(e) { return ''; }
};

let geminiChatHistory = [];
let geminiModalOpen = false;

// ============================================================
// RECOLECTOR DE CONTEXTO EN TIEMPO REAL (Supabase)
// ============================================================
async function recolectarContextoBarrio() {
  if (!window.supabaseClient) return 'No hay conexión a la base de datos.';

  const ventana48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const ventana10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const ahora = new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

  let pedidos = [], camiones = [], repartidores = [];

  try {
    const { data } = await window.supabaseClient
      .from('pedidos')
      .select('categoria, latitude, longitude, created_at, buyer_name, direccion, telefono')
      .gte('created_at', ventana48h)
      .order('created_at', { ascending: false })
      .limit(30);
    pedidos = data || [];
  } catch(e) {}

  try {
    const { data } = await window.supabaseClient
      .from('rutas_repartidores')
      .select('distribuidor_nombre, categoria, latitude, longitude, created_at')
      .gte('created_at', ventana10m);
    camiones = data || [];
  } catch(e) {}

  try {
    const { data } = await window.supabaseClient
      .from('repartidores')
      .select('nombre, categoria, whatsapp, zonas, ciudad, activo')
      .eq('activo', true)
      .limit(20);
    repartidores = data || [];
  } catch(e) {}

  // Agrupar pedidos por categoría
  const porCategoria = {};
  pedidos.forEach(p => {
    const cat = p.categoria || 'Sin categoría';
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  });

  const resumenPedidos = Object.entries(porCategoria)
    .map(([cat, n]) => `  • ${cat}: ${n} pedido${n > 1 ? 's' : ''}`)
    .join('\n') || '  • Sin pedidos activos';

  const detallePedidos = pedidos.slice(0, 10).map(p => {
    const hora = new Date(p.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const dir = p.direccion || 'Ubicación por GPS';
    return `  • ${p.categoria} — ${dir} (${hora}${p.telefono ? ', Tel: ' + p.telefono : ''})`;
  }).join('\n') || '  (sin detalle)';

  const detalleCamiones = camiones.map(c => {
    const mins = Math.floor((Date.now() - new Date(c.created_at)) / 60000);
    return `  • ${c.distribuidor_nombre || 'Repartidor'} [${c.categoria}] — hace ${mins < 1 ? 'un instante' : mins + ' min'}`;
  }).join('\n') || '  (ninguno activo ahora)';

  const detalleRepartidores = repartidores.map(r =>
    `  • ${r.nombre} [${r.categoria}] — Zonas: ${r.zonas || 'N/A'} — WhatsApp: ${r.whatsapp || 'N/A'}`
  ).join('\n') || '  (sin repartidores registrados)';

  return `
=== DATOS EN VIVO DE NOTIGAS — ${ahora} ===

📦 PEDIDOS ACTIVOS (últimas 48h): ${pedidos.length} total
Por categoría:
${resumenPedidos}

Últimos 10 pedidos:
${detallePedidos}

🚛 CAMIONES GPS EN VIVO (últimos 10 min): ${camiones.length} activo${camiones.length !== 1 ? 's' : ''}
${detalleCamiones}

👷 REPARTIDORES REGISTRADOS (activos): ${repartidores.length}
${detalleRepartidores}
`;
}

// ============================================================
// LLAMADA A GEMINI API
// ============================================================
async function consultarGeminiAI(preguntaUsuario) {
  const contexto = await recolectarContextoBarrio();

  const systemPrompt = `Eres el asistente inteligente de NOTIGAS, una plataforma vecinal boliviana para pedir gas GLP, agua, chatarra, frutas, detergentes y otros servicios a domicilio. 

Tienes acceso a datos en tiempo real de la plataforma. Responde en español boliviano, de forma breve, concreta y amigable. Si te preguntan sobre pedidos, camiones o repartidores, usa los datos que te proporciono. Si te preguntan sobre a quién contactar, sugiere el repartidor más adecuado con su WhatsApp si está disponible.

${contexto}`;

  const payload = {
    contents: [
      ...geminiChatHistory,
      {
        role: 'user',
        parts: [{ text: preguntaUsuario }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 400,
      topK: 40,
      topP: 0.95
    }
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${_getKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const respText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude obtener respuesta.';

  // Guardar en historial para conversación continua
  geminiChatHistory.push(
    { role: 'user', parts: [{ text: preguntaUsuario }] },
    { role: 'model', parts: [{ text: respText }] }
  );
  // Limitar historial a 10 turnos
  if (geminiChatHistory.length > 20) geminiChatHistory = geminiChatHistory.slice(-20);

  return respText;
}

// ============================================================
// UI DEL CHAT
// ============================================================
function abrirGeminiChat() {
  const modal = document.getElementById('geminiChatModal');
  if (modal) {
    modal.style.display = 'flex';
    geminiModalOpen = true;
    const input = document.getElementById('geminiInput');
    if (input) input.focus();
  }
}

function cerrarGeminiChat() {
  const modal = document.getElementById('geminiChatModal');
  if (modal) modal.style.display = 'none';
  geminiModalOpen = false;
}

function agregarMensajeChat(texto, esUsuario) {
  const box = document.getElementById('geminiMessages');
  if (!box) return;

  const msg = document.createElement('div');
  msg.className = esUsuario ? 'gchat-msg gchat-user' : 'gchat-msg gchat-ai';

  const avatar = document.createElement('div');
  avatar.className = 'gchat-avatar';
  avatar.textContent = esUsuario ? '👤' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'gchat-bubble';
  bubble.textContent = texto; // textContent — seguro contra XSS

  if (!esUsuario) msg.appendChild(avatar);
  msg.appendChild(bubble);
  if (esUsuario) msg.appendChild(avatar);

  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function mostrarTypingIndicator(mostrar) {
  const existing = document.getElementById('geminiTyping');
  if (mostrar) {
    if (existing) return;
    const box = document.getElementById('geminiMessages');
    if (!box) return;
    const typing = document.createElement('div');
    typing.id = 'geminiTyping';
    typing.className = 'gchat-msg gchat-ai gchat-typing';
    typing.innerHTML = '<div class="gchat-avatar">🤖</div><div class="gchat-bubble"><span class="gchat-dot"></span><span class="gchat-dot"></span><span class="gchat-dot"></span></div>';
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;
  } else {
    if (existing) existing.remove();
  }
}

async function enviarMensajeGemini() {
  const input = document.getElementById('geminiInput');
  const btn = document.getElementById('geminiBtnEnviar');
  const texto = (input?.value || '').trim();

  if (!texto) return;

  input.value = '';
  input.disabled = true;
  if (btn) btn.disabled = true;

  agregarMensajeChat(texto, true);
  mostrarTypingIndicator(true);

  try {
    const respuesta = await consultarGeminiAI(texto);
    mostrarTypingIndicator(false);
    agregarMensajeChat(respuesta, false);
  } catch(err) {
    mostrarTypingIndicator(false);
    agregarMensajeChat(`⚠️ Error: ${err.message}`, false);
    console.error('Gemini error:', err);
  } finally {
    input.disabled = false;
    if (btn) btn.disabled = false;
    input.focus();
  }
}

function manejarEnterGemini(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensajeGemini();
  }
}

// Preguntas rápidas sugeridas
function preguntaRapidaGemini(pregunta) {
  const input = document.getElementById('geminiInput');
  if (input) {
    input.value = pregunta;
    enviarMensajeGemini();
  }
}

// Inyectar UI del chat en el DOM al cargar
document.addEventListener('DOMContentLoaded', () => {
  // Botón flotante
  const fab = document.createElement('button');
  fab.id = 'geminiChatFab';
  fab.title = 'Pregunta al Asistente NOTIGAS AI';
  fab.setAttribute('aria-label', 'Abrir asistente IA NOTIGAS');
  fab.innerHTML = `<span class="gemini-fab-icon">🤖</span><span class="gemini-fab-label">IA Vecinal</span>`;
  fab.onclick = abrirGeminiChat;
  document.body.appendChild(fab);

  // Modal del chat
  const modal = document.createElement('div');
  modal.id = 'geminiChatModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Chat IA NOTIGAS');
  modal.innerHTML = `
    <div class="gchat-panel">
      <div class="gchat-header">
        <div class="gchat-header-info">
          <div class="gchat-header-avatar">🤖</div>
          <div>
            <div class="gchat-title">NOTIGAS AI</div>
            <div class="gchat-subtitle">Powered by Gemini · Datos en vivo del barrio</div>
          </div>
        </div>
        <button class="gchat-close" onclick="cerrarGeminiChat()" aria-label="Cerrar chat">✕</button>
      </div>

      <div id="geminiMessages" class="gchat-messages">
        <div class="gchat-msg gchat-ai">
          <div class="gchat-avatar">🤖</div>
          <div class="gchat-bubble">¡Hola vecino! 👋 Soy el asistente IA de NOTIGAS. Puedo decirte cuántos pedidos hay activos, dónde están los camiones de gas, qué repartidor contactar y más. ¿En qué te ayudo?</div>
        </div>
        <div class="gchat-suggestions">
          <button class="gchat-chip" onclick="preguntaRapidaGemini('¿Cuántos pedidos hay activos ahora?')">📦 Pedidos activos</button>
          <button class="gchat-chip" onclick="preguntaRapidaGemini('¿Hay camiones de gas GLP cerca en este momento?')">🚛 Camiones en vivo</button>
          <button class="gchat-chip" onclick="preguntaRapidaGemini('¿A qué repartidor me conviene contactar para gas GLP?')">📞 ¿A quién llamo?</button>
          <button class="gchat-chip" onclick="preguntaRapidaGemini('¿Cuál es la zona con más pedidos hoy?')">🔥 Zona más activa</button>
        </div>
      </div>

      <div class="gchat-input-row">
        <input 
          id="geminiInput" 
          type="text" 
          placeholder="Pregunta sobre pedidos, camiones, repartidores..." 
          onkeydown="manejarEnterGemini(event)"
          maxlength="500"
          autocomplete="off"
        >
        <button id="geminiBtnEnviar" onclick="enviarMensajeGemini()" aria-label="Enviar mensaje">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Cerrar al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarGeminiChat();
  });
});
