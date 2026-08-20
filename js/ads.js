/* ==========================================================================
   NOTIGAS - MÓDULO DE PROPAGANDA LOCAL & PATROCINADORES OTB (3 LUGARES)
   Espacios Habilitados:
   1. Banner Inferior Fijo (#localAdContent)
   2. Tarjeta Patrocinador en Feed de Repartidores
   3. Tarjeta Patrocinador en Feed de Avisos Gratis
   ========================================================================== */

window.ADS_CONFIG = {
  mode: localStorage.getItem('notigas_ads_mode') || 'local', // 'local' | 'disabled'
  adSenseLoaded: false
};

window.adsSubscriptionChannel = null;
window._currentLocalAdData = null;
let currentAdUrl = 'https://wa.me/59170000000?text=Hola';

function getSafeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim(), window.location.origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function getSafeAdImageUrl(value) {
  const safe = getSafeExternalUrl(value);
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * Inicializar suscripción Realtime para anuncios locales por ciudad
 */
function iniciarSuscripcionAnuncios() {
  if (!window.supabaseClient) return;
  const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
  if (!activeCity) return;

  if (window.adsSubscriptionChannel) {
    try { window.supabaseClient.removeChannel(window.adsSubscriptionChannel); } catch(e){}
    window.adsSubscriptionChannel = null;
  }

  window.adsSubscriptionChannel = window.supabaseClient.channel('custom-all-channel-ads-' + activeCity)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'anuncios_globales' }, () => {
        cargarAnunciosGuardados();
    })
    .subscribe();
}

/**
 * Abrir enlace o WhatsApp del anuncio local
 */
function abrirAnuncioWhatsApp() {
  const targetUrl = (window._currentLocalAdData && window._currentLocalAdData.url)
    ? window._currentLocalAdData.url
    : currentAdUrl;
  const safeUrl = getSafeExternalUrl(targetUrl);
  if (safeUrl) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  } else if (typeof showToast === 'function') {
    showToast('Enlace no disponible', 'El anuncio no tiene un enlace web o de WhatsApp configurado.', 'warning', 3000);
  }
}
window.abrirAnuncioWhatsApp = abrirAnuncioWhatsApp;

/**
 * Cargar anuncios locales desde Supabase
 */
async function cargarAnunciosGuardados() {
  const mode = localStorage.getItem('notigas_ads_mode') || window.ADS_CONFIG.mode || 'local';
  window.ADS_CONFIG.mode = mode;

  const localAdContent = document.getElementById('localAdContent');
  if (mode === 'disabled') {
    if (localAdContent) localAdContent.style.display = 'none';
    window._currentLocalAdData = null;
    return;
  }

  if (!window.supabaseClient) {
    if (localAdContent) localAdContent.style.display = 'flex';
    return;
  }

  const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
  if (!activeCity) return;

  try {
    const normCity = String(activeCity).toLowerCase().trim();
    const { data, error } = await window.supabaseClient
      .from('anuncios_globales')
      .select('id, titulo, descripcion, url, image_url, ciudad, activo')
      .eq('ciudad', normCity)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      window._currentLocalAdData = data;
      actualizarAnunciosEnVivo(data.titulo, data.url);
      actualizarBannerConImagen(data.image_url);
      currentAdUrl = getSafeExternalUrl(data.url) || currentAdUrl;
      if (localAdContent) localAdContent.style.display = 'flex';
    } else {
      window._currentLocalAdData = {
        titulo: 'Promociona tu negocio o servicio profesional directamente en tu OTB',
        url: 'https://wa.me/59170000000?text=Hola%20quiero%20anunciar%20en%20NOTIGAS',
        image_url: null,
        ciudad: normCity
      };
      actualizarAnunciosEnVivo(window._currentLocalAdData.titulo, window._currentLocalAdData.url);
      actualizarBannerConImagen(null);
      if (localAdContent) localAdContent.style.display = 'flex';
    }
  } catch (e) {
    console.error("Error cargando anuncios locales:", e);
    if (localAdContent) localAdContent.style.display = 'flex';
  }
}
window.cargarAnunciosGuardados = cargarAnunciosGuardados;

/**
 * Actualizar textos dinámicos del banner local
 */
function actualizarAnunciosEnVivo(texto, url) {
  if (texto) {
    const adTextEl = document.getElementById('adText');
    if (adTextEl) adTextEl.innerText = texto;
  }
  if (url) {
    currentAdUrl = getSafeExternalUrl(url) || currentAdUrl;
  }
}

/**
 * Actualizar imagen de fondo del banner local inferior
 */
function actualizarBannerConImagen(imageUrl) {
  const localAdContent = document.getElementById('localAdContent');
  if (!localAdContent) return;

  if (window.ADS_CONFIG.mode === 'disabled') {
    localAdContent.style.display = 'none';
    return;
  }

  const safeImageUrl = getSafeAdImageUrl(imageUrl);
  if (safeImageUrl) {
    localAdContent.style.backgroundImage = `url("${safeImageUrl.replace(/"/g, '%22')}")`;
    localAdContent.style.backgroundSize = 'cover';
    localAdContent.style.backgroundPosition = 'center';
    localAdContent.style.display = 'flex';
    const sub = localAdContent.querySelector('.ad-subtext');
    if (sub) {
      sub.style.background = 'rgba(0,0,0,0.65)';
      sub.style.padding = '4px 8px';
      sub.style.borderRadius = '4px';
    }
  } else {
    localAdContent.style.backgroundImage = 'none';
    localAdContent.style.display = 'flex';
    const sub = localAdContent.querySelector('.ad-subtext');
    if (sub) {
      sub.style.background = 'transparent';
      sub.style.padding = '0';
    }
  }
}

/**
 * Generador de tarjeta para los 2 feeds (Repartidores y Avisos Gratis)
 */
window.getAdSenseFeedMarkup = function(placement) {
  const mode = window.ADS_CONFIG.mode || localStorage.getItem('notigas_ads_mode') || 'local';
  if (mode === 'disabled') return '';

  const ad = window._currentLocalAdData || {
    titulo: 'Promociona tu negocio o servicio profesional directamente en tu OTB',
    url: 'https://wa.me/59170000000?text=Hola%20quiero%20anunciar%20en%20NOTIGAS',
    image_url: null,
    ciudad: (typeof AppState !== 'undefined' ? AppState.get('city') : 'Tu Ciudad') || 'Tu Ciudad'
  };

  const safeTitle = (typeof window.escapeHtmlStr === 'function')
    ? window.escapeHtmlStr(ad.titulo || 'Espacio Publicitario Disponible')
    : (ad.titulo || 'Espacio Publicitario Disponible');
  const safeCity = (typeof window.escapeHtmlStr === 'function')
    ? window.escapeHtmlStr(String(ad.ciudad || 'Local').toUpperCase())
    : String(ad.ciudad || 'Local').toUpperCase();
  const safeUrl = getSafeExternalUrl(ad.url) || 'https://wa.me/59170000000?text=Hola';
  const safeImg = getSafeAdImageUrl(ad.image_url);

  const bgStyle = safeImg
    ? `background-image: linear-gradient(180deg, rgba(15,23,42,0.85), rgba(15,23,42,0.92)), url('${safeImg.replace(/'/g, "\\'")}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, #1E293B, #0F172A);`;

  return `
    <div class="local-propaganda-feed-card" data-ad-placement="${placement}" style="${bgStyle}">
      <div class="local-ad-header">
        <span class="local-ad-badge"><i class="fa-solid fa-bullhorn"></i> PROPAGANDA LOCAL</span>
        <span class="local-ad-city">📍 ${safeCity}</span>
      </div>
      <div class="local-ad-body">
        <h4 class="local-ad-title">${safeTitle}</h4>
        <p class="local-ad-sub">Comercio & Servicios de Barrio Verificados • Apoya lo local</p>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn-local-ad-action">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Contactar / Ver Información
        </a>
      </div>
    </div>`;
};

window.activateAdSenseIn = function(container) {
  // No-op para compatibilidad de interfaces
};

function inicializarGoogleAdSense() {
  cargarAnunciosGuardados();
}

async function cargarConfiguracionPublicidadGlobal() {
  if (!window.supabaseClient) return;
  try {
    const { data } = await window.supabaseClient
      .from('configuracion_publicidad')
      .select('modo')
      .eq('id', 1)
      .maybeSingle();

    if (data && data.modo) {
      window.ADS_CONFIG.mode = data.modo;
      localStorage.setItem('notigas_ads_mode', data.modo);
    }
  } catch(_) {}
  cargarAnunciosGuardados();
}

document.addEventListener('notigas_auth_ready', async () => {
  await cargarConfiguracionPublicidadGlobal();
  iniciarSuscripcionAnuncios();
});

document.addEventListener('DOMContentLoaded', () => {
  cargarAnunciosGuardados();
});
