/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */

// (escapeHtmlStr is handled by state.js)

const defaultVendorsList = []; // LIMPIO SIN EJEMPLOS DUMMY PREDETERMINADOS

async function descargarChoferesYRenderizar(cat = 'TODOS') {
  if (!window.supabaseClient) {
    renderVendorCards(cat);
    return;
  }
  
  const city = AppState.get('city') || 'santacruz';

  try {
    // Solo traemos choferes de la ciudad actual que estén pendientes o aprobados.
    // (Por ahora traemos todos y el admin ya los banea o aprueba).
    const cityNormalized = city.trim().toLowerCase();
    const { data, error } = await window.supabaseClient
      .from('choferes_habilitados')
      .select('*')
      .eq('ciudad', cityNormalized)
      .eq('estado_verificacion', 'aprobado');

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
          active: true // Fichas publicadas automáticamente
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

document.addEventListener('notigas_auth_ready', () => {
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
  
  // FIX: Ya no inyectamos al usuario actual automáticamente con "active: true".
  // Su estado real vendrá de la tabla choferes_habilitados de Supabase.

  const currentAdmin = typeof getVerifiedAdminEmail === 'function' ? getVerifiedAdminEmail() : null;
  const isAdmin = !!currentAdmin;

  return list.filter(v => !deletedIds.includes(v.id) && (v.active || isAdmin));
}

function renderVendorCards(filterCat) {
  const container = document.getElementById('vendorGridContainer');
  if (!container) return;

  const currentAdmin = typeof getVerifiedAdminEmail === 'function' ? getVerifiedAdminEmail() : null;
  const isAdmin = !!currentAdmin;

  const allVendors = getStoredVendors();

  const filtered = (filterCat === 'TODOS') 
    ? allVendors 
    : allVendors.filter(v => v.category.toLowerCase().includes(filterCat.toLowerCase()) || filterCat.toLowerCase().includes(v.category.toLowerCase()));

  let html = '';

  // (El pedido destacado vecinal ya se maneja en Tab 1 con datos en tiempo real de Supabase)

  if (filtered.length === 0) {
    container.innerHTML = html + `
      <div style="text-align:center; color:#94A3B8; padding:40px 14px; font-size:13px; background: #1E293B; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.15); margin-top: 14px;">
        <i class="fa-solid fa-store-slash" style="font-size:32px; color:#FF6D00; margin-bottom:10px;"></i><br>
        <strong>Aún no hay Fichas de Repartidores registradas en esta categoría.</strong><br>
        <span style="font-size: 11px; color: #64748B;">¿Eres repartidor? Registra tu ficha de negocio gratis y conéctate con los vecinos de tu OTB.</span><br><br>
        <button class="btn-driver" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" data-action="abrirModalDriver">🚚 Publicar Mi Mini Página de Negocio</button>
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
          ${isAdmin ? `<button data-action="eliminarFichaAdmin" data-id="${vendor.id}" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="ad-badge" style="background: rgba(0,230,118,0.15); color: #00E676; border-color: rgba(0,230,118,0.4);">REPARTIDOR VERIFICADO</span>`}
        </div>

        <div class="vendor-fb-body">
          <div class="vendor-field"><strong>🚘 Vehículo/Placa:</strong> ${escapeHtmlStr(vendor.plate)}</div>
          <div class="vendor-field"><strong>📦 ¿Qué Vende/Oferta?:</strong> ${escapeHtmlStr(vendor.products)}</div>
          <div class="vendor-field"><strong>🗺️ Zonas de Recorrido:</strong> ${escapeHtmlStr(vendor.zones)}</div>
        </div>

        <div class="vendor-fb-footer">

          <button class="btn-vendor-order" data-action="seleccionarYPedirDirecto" data-cat="${encodeURIComponent(vendor.category)}"><i class="fa-solid fa-cart-plus"></i> Pedir Producto</button>
        </div>
      </div>
    `;

    // ANUNCIO PATROCINADO INTERCALADO AL MEDIO DEL FEED
    if (index === 0) {
      html += `
        <div class="ad-facebook-feed-card" data-action="abrirAnuncioWhatsApp" style="cursor:pointer;">
          <div class="ad-fb-header">
            <div class="ad-fb-profile">
              <div class="ad-fb-icon"><i class="fa-solid fa-bullhorn"></i></div>
              <div class="ad-fb-info">
                <div class="ad-fb-name" id="adVendorTitle">🏢 Servicios Barriales, Comercio Local & Anuncios OTB</div>
                <div class="ad-fb-sub"><i class="fa-solid fa-earth-americas"></i> PUBLICIDAD PATROCINADA EN EL FEED REPARTIDORES</div>
              </div>
            </div>
            <span class="ad-badge">AD</span>
          </div>
          <div class="ad-fb-body" id="adVendorDesc">
            ¿Tienes un negocio en el barrio o deseas ofrecer tu servicio profesional? Anúnciate aquí y llega a toda tu OTB.
          </div>
          <div class="ad-fb-media">
            <div>
              <div class="ad-fb-media-title">Destaca tu Negocio o Servicio</div>
              <div class="ad-fb-media-desc">Espacio publicitario disponible en NOTIGAS</div>
            </div>
            <button class="btn-ad-contact" data-action="abrirAnuncioWhatsApp"><i class="fa-solid fa-arrow-up-right-from-square"></i> Anunciar</button>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

function abrirChatSoporteOficial() {

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


