/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */

// Fallback de seguridad: si state.js no cargó a tiempo
const escapeHtmlStr = window.escapeHtmlStr || function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const defaultVendorsList = []; // LIMPIO SIN EJEMPLOS DUMMY PREDETERMINADOS

async function descargarChoferesYRenderizar(cat = 'TODOS') {
  if (!window.supabaseClient) {
    renderVendorCards(cat);
    return;
  }
  
  const citySelect = document.getElementById('selectCiudadCapital');
  const city = citySelect ? citySelect.value : 'santacruz';

  try {
    // Solo traemos choferes de la ciudad actual que estén pendientes o aprobados.
    // (Por ahora traemos todos y el admin ya los banea o aprueba).
    const { data, error } = await window.supabaseClient
      .from('choferes_habilitados')
      .select('*')
      .eq('ciudad', city);

    if (error) {
      console.error("Error descargando choferes de Supabase:", error);
      // Continuar con los datos locales en caché
    } else if (data && data.length > 0) {
      let list = [];
      data.forEach(d => {
        list.push({
          id: `driver_${d.id}`,
          name: d.nombre_completo,
          category: d.categoria || 'Gas GLP',
          icon: typeof getIconForCategory === 'function' ? getIconForCategory(d.categoria) : '🚛',
          plate: d.placa || 'Placa registrada',
          products: d.productos || 'Servicios de reparto a domicilio',
          zones: d.zonas || 'OTB local',
          schedule: d.schedule || 'Lunes a Sábado',
          active: d.estado_verificacion === 'aprobado'
        });
      });
      localStorage.setItem('notigas_vendors_directory', JSON.stringify(list));
    } else {
      localStorage.setItem('notigas_vendors_directory', JSON.stringify([]));
    }
  } catch (e) {
    console.error("Error fetching local drivers:", e);
  }
  
  renderVendorCards(cat);
}

document.addEventListener('DOMContentLoaded', () => {
  descargarChoferesYRenderizar('TODOS');
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

  const currentAdmin = getVerifiedAdminEmail();
  const isAdmin = currentAdmin && (currentAdmin.includes('erikmartinelly') || currentAdmin.includes('leonmartinelly'));

  const allVendors = getStoredVendors();

  const filtered = (filterCat === 'TODOS') 
    ? allVendors 
    : allVendors.filter(v => v.category.toLowerCase().includes(filterCat.toLowerCase()) || filterCat.toLowerCase().includes(v.category.toLowerCase()));

  let html = '';

  // SECCIÓN DESTACADA: PEDIDOS VECINALES EN VIVO SOLICITADOS POR COMPRADORES
  const activeOrderRaw = localStorage.getItem('notigas_active_order');
  if (activeOrderRaw) {
    try {
      const activeOrder = JSON.parse(activeOrderRaw);
      if (typeof isOrderCategoryMatchingDriver !== 'function' || isOrderCategoryMatchingDriver(activeOrder.categoria)) {
        const iconHtml = (typeof obtenerIconoHtmlPorCategoria === 'function') ? obtenerIconoHtmlPorCategoria(activeOrder.categoria) : '📦';
        const mins = Math.floor((Date.now() - (activeOrder.timestamp || Date.now())) / 60000);
        
        html += `
          <div class="vendor-fb-card" style="border: 2px solid #FF6D00; background: linear-gradient(135deg, rgba(255,109,0,0.18), rgba(15,23,42,0.95)); box-shadow: 0 6px 20px rgba(255,109,0,0.35); margin-bottom: 14px;">
            <div class="vendor-fb-header">
              <div class="vendor-profile">
                <div class="vendor-avatar" style="background: rgba(255,109,0,0.25); color: #FF6D00;">🛒</div>
                <div class="vendor-meta">
                  <span class="vendor-name" style="color: #FF8F00; font-size: 13.5px; font-weight: 900;">🚨 PEDIDO DE COMPRADOR EN VIVO</span>
                  <span class="vendor-badge-cat" style="background: rgba(255,109,0,0.25); color: #FF8F00; font-weight: 800;">${iconHtml} ${escapeHtmlStr(activeOrder.categoria)}</span>
                </div>
              </div>
              <span class="ad-badge" style="background: rgba(239,68,68,0.2); color: #EF4444; border-color: #EF4444; animation: pulse 1.5s infinite; font-weight: 800;">⏱️ HACE ${mins} MIN</span>
            </div>

            <div class="vendor-fb-body">
              <div class="vendor-field"><strong>📦 Producto Solicitado:</strong> <span style="color:white; font-weight:800;">${escapeHtmlStr(activeOrder.categoria)} (${escapeHtmlStr(activeOrder.cantidad || '1 unidad')})</span></div>
              <div class="vendor-field"><strong>🏠 Dirección de Entrega:</strong> <span style="color:#F59E0B; font-weight:800;">${escapeHtmlStr(activeOrder.callePrincipal || 'Ubicación georeferenciada')}</span></div>
              ${activeOrder.telefono ? `<div class="vendor-field"><strong>📞 Teléfono Contacto:</strong> <a href="tel:${activeOrder.telefono.replace(/[^0-9+]/g, '')}" style="color:#00E676; font-weight:800; text-decoration:none;">${escapeHtmlStr(activeOrder.telefono)} 📞 Llamar</a></div>` : ''}
              <div class="vendor-field"><strong>💬 Coordinación:</strong> Chat Privado Interno 1-a-1 encriptado</div>
            </div>

            <div class="vendor-fb-footer" style="display:flex; gap:8px;">
              <button class="btn-vendor-chat" style="flex:1;" onclick="abrirChatConRepartidor('Comprador Vecinal', decodeURIComponent('${encodeURIComponent(activeOrder.categoria)}'))"><i class="fa-solid fa-comments"></i> 💬 CHAT PRIVADO INTERNO</button>
              <button class="btn-vendor-order" style="flex:1; background: linear-gradient(135deg, #FF6D00, #E65100); color:white; border:none; border-radius:8px; font-weight:900; cursor:pointer;" onclick="aceptarPedidoRepartidor(decodeURIComponent('${encodeURIComponent(activeOrder.categoria)}'))"><i class="fa-solid fa-circle-check"></i> ✅ Aceptar Pedido</button>
            </div>
          </div>
        `;
      }
    } catch(e){
      console.error("Error al renderizar pedido activo en pestaña repartidores:", e);
    }
  }

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
              <span class="vendor-name">${escapeHtmlStr(vendor.name)}</span>
              <span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${escapeHtmlStr(vendor.category)}</span>
            </div>
          </div>
          ${isAdmin ? `<button onclick="eliminarFichaAdmin('${vendor.id}')" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="ad-badge" style="background: rgba(0,230,118,0.15); color: #00E676; border-color: rgba(0,230,118,0.4);">REPARTIDOR VERIFICADO</span>`}
        </div>

        <div class="vendor-fb-body">
          <div class="vendor-field"><strong>🚘 Vehículo/Placa:</strong> ${escapeHtmlStr(vendor.plate)}</div>
          <div class="vendor-field"><strong>📦 ¿Qué Vende/Oferta?:</strong> ${escapeHtmlStr(vendor.products)}</div>
          <div class="vendor-field"><strong>🗺️ Zonas de Recorrido:</strong> ${escapeHtmlStr(vendor.zones)}</div>
        </div>

        <div class="vendor-fb-footer">
          <button class="btn-vendor-chat" onclick="abrirChatConRepartidor(decodeURIComponent('${encodeURIComponent(vendor.name)}'), decodeURIComponent('${encodeURIComponent(vendor.category)}'))"><i class="fa-solid fa-comments"></i> 💬 CHAT PRIVADO INTERNO</button>
          <button class="btn-vendor-order" onclick="seleccionarYPedirDirecto(decodeURIComponent('${encodeURIComponent(vendor.category)}'))"><i class="fa-solid fa-cart-plus"></i> Pedir Producto</button>
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
  abrirChatConRepartidor('Soporte OTB', 'Soporte');
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

    let list = getStoredVendors().filter(v => v.id !== vendorId && v.id !== 'vendor_my_profile');
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
  const modal = document.getElementById('modalChat') || document.getElementById('floatingChatWidget');
  if (!modal) return;

  if (typeof poblarSelectorVendedoresChat === 'function') {
    poblarSelectorVendedoresChat();
  }

  const select = document.getElementById('selectVendorChat');
  if (select && vendorName) {
    let found = false;
    const searchTarget = vendorName.toLowerCase().trim();

    for (let i = 0; i < select.options.length; i++) {
      const optVal = (select.options[i].value || '').toLowerCase();
      const optText = (select.options[i].text || '').toLowerCase();
      if (optVal.includes(searchTarget) || optText.includes(searchTarget) || searchTarget.includes(optVal)) {
        select.selectedIndex = i;
        found = true;
        break;
      }
    }

    if (!found) {
      const opt = document.createElement('option');
      opt.value = vendorName;
      opt.text = `💬 ${vendorName} (${vendorCat || 'Repartidor'})`;
      select.appendChild(opt);
      select.value = vendorName;
    }
  }

  modal.style.display = 'flex';

  if (typeof cambiarVendedorChat === 'function') {
    cambiarVendedorChat();
  }
}
