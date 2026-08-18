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

  const city = AppState.get('city');
  if (!city) {
    renderVendorCards(cat);
    return;
  }

  try {
    const cityNormalized = city.trim().toLowerCase();
    // Consultar exclusivamente de la vista pública autorizada
    const { data, error } = await window.supabaseClient
      .from('choferes_publicos')
      .select('*')
      .eq('ciudad', cityNormalized);

    if (error) {
      console.error("Error descargando choferes desde choferes_publicos:", error);
      AppState.set('notigas_vendors_directory', []);
    } else if (data && data.length > 0) {
      let list = [];
      data.forEach(d => {
        if (!d.estado_verificacion || d.estado_verificacion === 'aprobado') {
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
        }
      });
      AppState.set('notigas_vendors_directory', list);
    } else {
      AppState.set('notigas_vendors_directory', []);
    }
  } catch (e) {
    console.error("Error fetching local drivers:", e);
  }

  renderVendorCards(cat);
}

document.addEventListener('notigas_auth_ready', () => {
  const tab1 = document.getElementById('tab1');
  if (tab1 && tab1.classList.contains('active')) {
    descargarChoferesYRenderizar('TODOS');
  }
});

function filterVendorCategory(cat, chipElem) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (chipElem) chipElem.classList.add('active');
  renderVendorCards(cat);
}

function getStoredVendors() {
  let list = AppState.get('notigas_vendors_directory') || [];
  let deletedIds = AppState.get('notigas_deleted_vendor_ids') || [];

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

  const adInsertAfterIndex = Math.max(0, Math.ceil(filtered.length / 2) - 1);
  filtered.forEach((vendor, index) => {
    const safeVendorId = escapeHtmlStr(vendor.id || '');
    const safeVendorIcon = escapeHtmlStr(vendor.icon || getIconForCategory(vendor.category));

    html += `
      <div class="vendor-fb-card">
        <div class="vendor-fb-header">
          <div class="vendor-profile">
            <div class="vendor-avatar">${safeVendorIcon}</div>
            <div class="vendor-meta">
              <span class="vendor-name">${escapeHtmlStr(vendor.name)}</span>
              <span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${escapeHtmlStr(vendor.category)}</span>
            </div>
          </div>
          ${isAdmin ? `<button data-action="eliminarFichaAdmin" data-id="${safeVendorId}" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="ad-badge" style="background: rgba(0,230,118,0.15); color: #00E676; border-color: rgba(0,230,118,0.4);">REPARTIDOR ACTIVO</span>`}
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

    // Google AdSense va exactamente en medio de las fichas visibles.
    if (index === adInsertAfterIndex && typeof window.getAdSenseFeedMarkup === 'function') {
      html += window.getAdSenseFeedMarkup('vendors');
    }
  });

  container.innerHTML = html;
  if (typeof window.activateAdSenseIn === 'function') window.activateAdSenseIn(container);
}

document.addEventListener('notigas_ads_config_ready', () => renderVendorCards('TODOS'));

function abrirChatSoporteOficial() {
  showToast('Próximamente', 'El chat de soporte estará disponible pronto.', 'info');
}

async function eliminarFichaAdmin(vendorId) {
  if (!window.supabaseClient || !vendorId) return;
  const rowId = String(vendorId).replace(/^driver_/, '');
  const { data, error } = await window.supabaseClient
    .from('choferes_habilitados')
    .select('user_id, nombre_completo')
    .eq('id', rowId)
    .maybeSingle();

  if (error || !data?.user_id) {
    console.error('No se pudo resolver la cuenta del repartidor:', error);
    if (typeof showToast === 'function') showToast('❌ Error', 'No se encontró la cuenta real del repartidor.', 'error', 4500);
    return;
  }

  if (typeof window.borrarRepartidorPermanente === 'function') {
    await window.borrarRepartidorPermanente(vendorId, data.user_id, data.nombre_completo || 'Repartidor');
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
