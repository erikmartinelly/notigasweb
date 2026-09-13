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
    const cityKeys = typeof window.getCityMetroKeys === 'function' ? window.getCityMetroKeys(cityNormalized) : [cityNormalized];

    // Consultar exclusivamente de la vista pública autorizada
    const { data, error } = await window.supabaseClient
      .from('choferes_publicos')
      .select('id, nombre_completo, categoria, ciudad, telefono, descripcion, foto_url, estado_verificacion, created_at, color_camion, precio_balon_10kg, es_premium')
      .in('ciudad', cityKeys);

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
            zones: d.zonas || 'zona local',
            schedule: d.schedule || 'Lunes a Sábado',
            color_camion: d.color_camion || '',
            precio_balon_10kg: d.precio_balon_10kg || null,
            es_premium: false, // campo legado: no produce prioridad ni distintivos
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

  // El estado de administrador proviene exclusivamente de la verificación de sesión
  // que actualiza AppState; no se infiere a partir de la presencia de un email.
  const isAdmin = typeof AppState !== 'undefined' && AppState.get('isAdmin') === true;

  return list.filter(v => !deletedIds.includes(v.id) && (v.active || isAdmin));
}

function renderVendorCards(filterCat) {
  const container = document.getElementById('vendorGridContainer');
  if (!container) return;

  const isAdmin = typeof AppState !== 'undefined' && AppState.get('isAdmin') === true;

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
        <span style="font-size: 11px; color: #64748B;">¿Eres repartidor? Registra tu ficha de negocio gratis y conéctate con los vecinos de tu zona.</span><br><br>
        <button class="btn-driver" style="margin: 0 auto; padding: 10px 16px; font-size: 12px;" data-action="abrirModalDriver">🚚 Publicar Mi Mini Página de Negocio</button>
      </div>
    `;
    const adMarkup = typeof window.getAdSenseFeedMarkup === 'function' ? window.getAdSenseFeedMarkup('vendors') : '';
    if (adMarkup) {
      container.insertAdjacentHTML('afterbegin', adMarkup);
    }
    return;
  }

  const adInsertAfterIndex = Math.max(0, Math.ceil(filtered.length / 2) - 1);
  filtered.forEach((vendor, index) => {
    const safeVendorId = escapeHtmlStr(vendor.id || '');
    const isVip = false; // no existe categoría VIP/PRO
    const safeVendorIcon = (typeof window.crearAvatarCamionChoferHtml === 'function')
      ? window.crearAvatarCamionChoferHtml(vendor.name, {
          category: vendor.category,
          color: vendor.color_camion,
          price: vendor.precio_balon_10kg,
          es_premium: isVip
        })
      : escapeHtmlStr(vendor.icon || getIconForCategory(vendor.category));

    let price10kgHtml = '';
    if (vendor.precio_balon_10kg && !isNaN(Number(vendor.precio_balon_10kg)) && Number(vendor.precio_balon_10kg) > 0) {
      price10kgHtml = `
        <div class="vendor-field vendor-field-price" style="background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.35); padding:6px 10px; border-radius:8px; margin:2px 0;">
          <strong style="color:#A7F3D0; font-size:12px;">🔥 Balón 10 Kg:</strong>
          <span class="vendor-price-highlight" style="color:#22C55E; font-size:14.5px; font-weight:900; margin-left:auto;">S/ ${Number(vendor.precio_balon_10kg).toFixed(2)}</span>
        </div>
      `;
    }

    const vipHeaderBadge = isVip
      ? `<span class="vip-premium-badge" style="background:linear-gradient(135deg, #F59E0B, #D97706); color:#FFFFFF; border:1px solid #FDE68A; border-radius:12px; font-size:10px; font-weight:900; padding:3px 8px; letter-spacing:0.5px; box-shadow:0 2px 6px rgba(245,158,11,0.4);"><i class="fa-solid fa-crown"></i> VIP PREMIUM</span>`
      : '';

    html += `
      <div class="vendor-fb-card ${isVip ? 'vendor-fb-card-vip' : ''}">
        <div class="vendor-fb-header">
          <div class="vendor-profile">
            <div class="vendor-avatar" style="background:transparent; border:none; width:auto; height:auto; padding:0; overflow:visible;">${safeVendorIcon}</div>
            <div class="vendor-meta">
              <span class="vendor-name">${escapeHtmlStr(vendor.name)}</span>
              <span class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> ${escapeHtmlStr(vendor.category)}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${vipHeaderBadge}
            ${isAdmin ? `<button data-action="eliminarFichaAdmin" data-id="${safeVendorId}" style="background:#D32F2F; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" title="Borrar como Admin"><i class="fa-solid fa-trash"></i> Borrar (Admin)</button>` : `<span class="promo-badge" style="background: rgba(0,230,118,0.15); color: #00E676; border-color: rgba(0,230,118,0.4);">REPARTIDOR ACTIVO</span>`}
          </div>
        </div>

        <div class="vendor-fb-body">
          ${price10kgHtml}
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
