/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */

const defaultVendorsList = []; // LIMPIO SIN EJEMPLOS DUMMY PREDETERMINADOS

document.addEventListener('DOMContentLoaded', () => {
  renderVendorCards('TODOS');
});

function filterVendorCategory(cat, chipElem) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (chipElem) chipElem.classList.add('active');
  renderVendorCards(cat);
}

function getStoredVendors() {
  let list = [];
  let deletedIds = [];
  try {
    const deletedRaw = localStorage.getItem('notigas_deleted_vendor_ids');
    if (deletedRaw) deletedIds = JSON.parse(deletedRaw);
  } catch(e){}

  try {
    const raw = localStorage.getItem('notigas_vendors_directory');
    if (raw) list = JSON.parse(raw);
  } catch(e){}
  
  // Agregar también la ficha del repartidor actual si existe y no ha sido eliminada por admin
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor' && u.nombre) {
        const myId = `vendor_my_profile`;
        if (!deletedIds.includes(myId) && !list.some(v => v.id === myId || v.name === u.nombre)) {
          list.unshift({
            id: myId,
            name: u.nombre,
            category: u.categoria || "Gas GLP",
            icon: getIconForCategory(u.categoria),
            plate: `${u.placa || 'Placa registrada'} (Repartidor Activo)`,
            products: u.productos || "Servicios de reparto a domicilio",
            zones: u.zonas || "OTB Central y zonas aledañas",
            schedule: u.schedule || "Lunes a Sábado: 08:00 a 18:00",
            active: true
          });
        }
      }
    }
  } catch(e){}

  return list.filter(v => !deletedIds.includes(v.id));
}

function renderVendorCards(filterCat) {
  const container = document.getElementById('vendorGridContainer');
  if (!container) return;

  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const allVendors = getStoredVendors();

  const filtered = (filterCat === 'TODOS') 
    ? allVendors 
    : allVendors.filter(v => v.category.toLowerCase().includes(filterCat.toLowerCase()) || filterCat.toLowerCase().includes(v.category.toLowerCase()));

  // TARJETA OFICIAL DE SERVICIO AL CLIENTE & SOPORTE OTB AL INICIO DEL FEED
  let html = `
    <div class="vendor-fb-card" style="border: 1px solid rgba(0, 230, 118, 0.4); background: linear-gradient(135deg, rgba(15,23,42,0.9), rgba(0,230,118,0.05));">
      <div class="vendor-fb-header">
        <div class="vendor-profile">
          <div class="vendor-avatar" style="background: rgba(0, 230, 118, 0.2); color: #00E676;">🎧</div>
          <div class="vendor-meta">
            <span class="vendor-name" style="color: #00E676;">Servicio al Cliente & Soporte OTB</span>
            <span class="vendor-badge-cat" style="background: rgba(0,230,118,0.2); color: #00E676;"><i class="fa-solid fa-headset"></i> Soporte Oficial NOTIGAS</span>
          </div>
        </div>
        <span class="ad-badge" style="background: rgba(0,230,118,0.2); color: #00E676;">24/7 EN VIVO</span>
      </div>

      <div class="vendor-fb-body">
        <div class="vendor-field"><strong>💁 ATENCIÓN AL VECINO:</strong> Consultas sobre el recorrido de camiones, dudas de uso y asistencia técnica en tu OTB.</div>
        <div class="vendor-field"><strong>🔒 PRIVACIDAD:</strong> Chat privado 1-a-1 encriptado con expiración automática de mensajes a las 48h.</div>
      </div>

      <div class="vendor-fb-footer">
        <button class="btn-vendor-chat" style="width: 100%; background: linear-gradient(135deg, #00E676, #00C853); color: #0F172A; font-weight: 900;" onclick="abrirChatSoporteOficial()"><i class="fa-solid fa-comments"></i> 💬 ABRIR CHAT PRIVADO CON SERVICIO AL CLIENTE</button>
      </div>
    </div>
  `;

  if (filtered.length === 0) {
    container.innerHTML = html + `
      <div style="text-align:center; color:#94A3B8; padding:40px 14px; font-size:13px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.15); margin-top: 14px;">
        <i class="fa-solid fa-store-slash" style="font-size:32px; color:#FF6D00; margin-bottom:10px;"></i><br>
        <strong>Aún no hay Fichas de Repartidores registradas en esta categoría.</strong><br>
        <span style="font-size: 11px; color: #64748B;">¿Eres repartidor? Registra tu ficha de negocio gratis y conéctate con los vecinos de tu OTB.</span><br><br>
        <button class="btn-driver" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" onclick="document.getElementById('modalDriver').style.display='flex'">➕ Publicar Mi Mini Página de Negocio</button>
      </div>
    `;
    return;
  }

  filtered.forEach((vendor, index) => {
    const escapedName = (vendor.name || '').replace(/'/g, "\\'");
    const escapedCat = (vendor.category || '').replace(/'/g, "\\'");

    html += `
      <div class="vendor-fb-card">
        <div class="vendor-fb-header">
          <div class="vendor-profile">
            <div class="vendor-avatar">${vendor.icon || getIconForCategory(vendor.category)}</div>
            <div class="vendor-meta">
              <span class="vendor-name">${vendor.name}</span>
              <span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${vendor.category}</span>
            </div>
          </div>
          ${isAdmin ? `<button onclick="eliminarFichaAdmin('${vendor.id}')" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="ad-badge" style="background: rgba(0,230,118,0.15); color: #00E676; border-color: rgba(0,230,118,0.4);">REPARTIDOR VERIFICADO</span>`}
        </div>

        <div class="vendor-fb-body">
          <div class="vendor-field"><strong>🚘 Vehículo/Placa:</strong> ${vendor.plate}</div>
          <div class="vendor-field"><strong>📦 ¿Qué Vende/Oferta?:</strong> ${vendor.products}</div>
          <div class="vendor-field"><strong>🗺️ Zonas de Recorrido:</strong> ${vendor.zones}</div>
          <div class="vendor-field"><strong>📅 Días y Horarios:</strong> ${vendor.schedule}</div>
        </div>

        <div class="vendor-fb-footer">
          <button class="btn-vendor-chat" onclick="abrirChatConRepartidor('${escapedName}', '${escapedCat}')"><i class="fa-solid fa-comments"></i> 💬 CHAT PRIVADO INTERNO</button>
          <button class="btn-vendor-order" onclick="seleccionarYPedirDirecto('${escapedCat}')"><i class="fa-solid fa-cart-plus"></i> Pedir Producto</button>
        </div>
      </div>
    `;

    // ANUNCIO PATROCINADO INTERCALADO AL MEDIO DEL FEED
    if (index === 0) {
      html += `
        <div class="ad-facebook-feed-card" onclick="abrirAnuncioWhatsApp()" style="cursor:pointer;">
          <div class="ad-fb-header">
            <div class="ad-fb-profile">
              <div class="ad-fb-icon"><i class="fa-solid fa-bullhorn"></i></div>
              <div class="ad-fb-info">
                <div class="ad-fb-name" id="adVendorTitle">🏢 Servicios Barriales, Comercio Local & Anuncios OTB</div>
                <div class="ad-fb-sub"><i class="fa-solid fa-earth-americas"></i> PUBLICIDAD PATROCINADA EN EL FEED REPARTIDORES</div>
              </div>
            </div>
            <span class="ad-badge">SPONSOR</span>
          </div>
          <div class="ad-fb-body" id="adVendorDesc">
            ¿Tienes un negocio en el barrio o deseas ofrecer tu servicio profesional? Anúnciate aquí y llega a toda tu OTB.
          </div>
          <div class="ad-fb-media">
            <div>
              <div class="ad-fb-media-title">Destaca tu Negocio o Servicio</div>
              <div class="ad-fb-media-desc">Espacio publicitario disponible en NOTIGAS</div>
            </div>
            <button class="btn-ad-contact" onclick="event.stopPropagation(); abrirAnuncioWhatsApp()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Anunciar</button>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

function abrirChatSoporteOficial() {
  if (typeof abrirFloatingChat === 'function') abrirFloatingChat();
  const select = document.getElementById('selectVendorChat');
  if (select) {
    select.value = "Soporte OTB";
    if (typeof cambiarVendedorChat === 'function') cambiarVendedorChat();
  }
}

function eliminarFichaAdmin(vendorId) {
  if (confirm("🗑️ ¿Deseas eliminar permanentemente esta Ficha de Repartidor?")) {
    let deletedIds = [];
    try {
      const deletedRaw = localStorage.getItem('notigas_deleted_vendor_ids');
      if (deletedRaw) deletedIds = JSON.parse(deletedRaw);
    } catch(e){}

    if (!deletedIds.includes(vendorId)) {
      deletedIds.push(vendorId);
      localStorage.setItem('notigas_deleted_vendor_ids', JSON.stringify(deletedIds));
    }

    let list = getStoredVendors();
    list = list.filter(v => v.id !== vendorId);
    localStorage.setItem('notigas_vendors_directory', JSON.stringify(list));

    renderVendorCards('TODOS');
    alert("🗑️ Ficha de Repartidor eliminada con éxito.");
  }
}

function getIconForCategory(cat) {
  if (!cat) return '📦';
  const c = cat.toLowerCase();
  if (c.includes('gas')) return '🔥';
  if (c.includes('agua')) return '💧';
  if (c.includes('chatarra')) return '♻️';
  if (c.includes('papel')) return '📄';
  if (c.includes('frutas') || c.includes('verduras')) return '🍎';
  if (c.includes('detergente') || c.includes('limpieza')) return '🧼';
  if (c.includes('carbón') || c.includes('leña')) return '🪵';
  return '📦';
}

function abrirChatConRepartidor(vendorName, vendorCat) {
  if (typeof abrirFloatingChat === 'function') abrirFloatingChat();
  const select = document.getElementById('selectVendorChat');
  if (select) {
    let found = false;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].text.includes(vendorName) || select.options[i].value.includes(vendorName)) {
        select.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement('option');
      opt.value = vendorName;
      opt.text = `💬 ${vendorName} (${vendorCat})`;
      select.appendChild(opt);
      select.value = opt.value;
    }
    if (typeof cambiarVendedorChat === 'function') cambiarVendedorChat();
  }
}
