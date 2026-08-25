/* ==========================================================================
   NOTIGAS - MÓDULO DE PROPAGANDA LOCAL (3 PESTAÑAS INDEPENDIENTES)
   Espacios Habilitados:
   1. Pestaña 1 (Mapa en Vivo): Banner Inferior Fijo (#localPromoContent)
   2. Pestaña 2 (Repartidores): Tarjeta Patrocinador en Feed de Repartidores
   3. Pestaña 3 (Muro de Comentarios): Tarjeta Patrocinador en Feed de Muro de Comentarios
   ========================================================================== */

const _ADS_AD_TABLE = window.NOTIGAS?.AD_TABLE || 'anuncios_globales';
const _ADS_PLACEMENTS = window.NOTIGAS?.AD_PLACEMENTS || Object.freeze({
  MAPA: 'mapa',
  REPARTIDORES: 'repartidores',
  MURO_AVISOS: 'muro_avisos'
});

function normalizeStoredAdPlacement(value) {
  const normalized = String(value || _ADS_PLACEMENTS.MAPA).toLowerCase().trim();
  if (normalized === 'avisos') return _ADS_PLACEMENTS.MURO_AVISOS;
  return Object.values(_ADS_PLACEMENTS).includes(normalized) ? normalized : _ADS_PLACEMENTS.MAPA;
}

window.ADS_CONFIG = {
  mode: 'local',
  adSenseLoaded: false
};

window.adsSubscriptionChannel = null;
window._localAds = {
  mapa: null,
  repartidores: null,
  muro_avisos: null
};
window._currentLocalAdData = null; // Retrocompatibilidad
let currentAdUrl = 'https://wa.me/59170000000?text=Hola';

function formatExternalUrl(value) {
  if (!value || typeof value !== 'string') return '';
  let str = value.trim();
  if (!str) return '';

  // Si es un número telefónico (e.g. 70000000 o 59170000000)
  const digitsOnly = str.replace(/[^0-9]/g, '');
  if (/^(\+?591)?[67][0-9]{7}$/.test(str) || (/^[0-9]{8,12}$/.test(digitsOnly) && !str.includes('.') && !str.includes('/'))) {
    const cleanNum = digitsOnly.startsWith('591') ? digitsOnly : ('591' + digitsOnly);
    return `https://wa.me/${cleanNum}`;
  }

  // Si ya tiene protocolo http/https
  if (/^https?:\/\//i.test(str)) {
    return str;
  }

  // Si empieza con //
  if (str.startsWith('//')) {
    return 'https:' + str;
  }

  // Si empieza con wa.me, t.me, api.whatsapp.com, www., o cualquier dominio
  return 'https://' + str;
}
window.formatExternalUrl = formatExternalUrl;

function getSafeExternalUrl(value) {
  if (!value) return '';
  const formatted = formatExternalUrl(value);
  try {
    const parsed = new URL(formatted);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '';
  } catch (_) {
    return '';
  }
}
window.getSafeExternalUrl = getSafeExternalUrl;

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
async function iniciarSuscripcionAnuncios() {
  if (!window.supabaseClient) return;
  const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
  if (!activeCity) return;

  if (window.adsSubscriptionChannel) {
    try { await window.supabaseClient.removeChannel(window.adsSubscriptionChannel); } catch(e){}
    window.adsSubscriptionChannel = null;
  }

  window.adsSubscriptionChannel = window.supabaseClient.channel('custom-all-channel-ads-' + activeCity)
    .on('postgres_changes', { event: '*', schema: 'public', table: _ADS_AD_TABLE }, () => {
        // Skip reload if the admin is actively saving (prevents race condition with form fields)
        if (window._isSavingAdsMutex) return;
        const adminModal = document.getElementById('modalAdmin');
        if (adminModal && adminModal.style.display === 'flex') return;
        cargarAnunciosGuardados();
    })
    .subscribe();
}

/**
 * Abrir enlace o WhatsApp del anuncio local según la posición / pestaña
 */
function abrirAnuncioWhatsApp(posicion) {
  let targetUrl = null;
  if (posicion && window._localAds && window._localAds[posicion]) {
    targetUrl = window._localAds[posicion].url;
  } else if (window._localAds && window._localAds.mapa) {
    targetUrl = window._localAds.mapa.url;
  } else if (window._currentLocalAdData && window._currentLocalAdData.url) {
    targetUrl = window._currentLocalAdData.url;
  } else {
    targetUrl = currentAdUrl;
  }

  const safeUrl = getSafeExternalUrl(targetUrl);
  if (safeUrl) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  } else if (typeof showToast === 'function') {
    showToast('Enlace no disponible', 'El anuncio no tiene un enlace web o de WhatsApp configurado.', 'warning', 3000);
  }
}
window.abrirAnuncioWhatsApp = abrirAnuncioWhatsApp;

/**
 * Cargar las 3 propagandas locales desde Supabase
 */
async function cargarAnunciosGuardados() {
  const mode = window.ADS_CONFIG.mode || 'local';

  const localPromoContent = document.getElementById('localPromoContent');
  const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : 'cochabamba';
  const normCity = String(activeCity || 'cochabamba').toLowerCase().trim();
  if (mode === 'disabled') {
    if (localPromoContent) localPromoContent.style.display = 'none';
    window._localAds = {
      mapa: { activo: false },
      repartidores: { activo: false },
      muro_avisos: { activo: false }
    };
    window._currentLocalAdData = window._localAds.mapa;
    return;
  }

  if (!window.supabaseClient) {
    window._localAds = {
      mapa: { activo: false },
      repartidores: { activo: false },
      muro_avisos: { activo: false }
    };
    window._currentLocalAdData = window._localAds.mapa;
    if (localPromoContent) localPromoContent.style.display = 'none';
    return;
  }

  try {
    const citiesToQuery = (normCity && normCity !== 'global') ? [normCity, 'global'] : ['global'];
    let { data, error } = await window.supabaseClient
      .from(_ADS_AD_TABLE)
      .select('id, titulo, descripcion, url, image_url, ciudad, posicion, activo, created_at')
      .in('ciudad', citiesToQuery)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const cityAds = data.filter(a => String(a.ciudad || '').toLowerCase().trim() === normCity);
      const globalAds = data.filter(a => String(a.ciudad || '').toLowerCase().trim() === 'global');

      const resolveAdForPos = (pos) => {
        // 1. Prioridad: Anuncio de la ciudad específica para esta posición
        const cityAd = cityAds.find(a => normalizeStoredAdPlacement(a.posicion) === pos);
        if (cityAd) return cityAd;

        // 2. Fallback: Anuncio global para esta posición
        const globalAd = globalAds.find(a => normalizeStoredAdPlacement(a.posicion) === pos);
        if (globalAd) return globalAd;

        return null;
      };

      window._localAds = {
        mapa: resolveAdForPos('mapa'),
        repartidores: resolveAdForPos('repartidores'),
        muro_avisos: resolveAdForPos(_ADS_PLACEMENTS.MURO_AVISOS)
      };
    } else {
      // Error o sin conexión a Supabase, ocultar todo
      window._localAds = {
        mapa: { activo: false, posicion: 'mapa' },
        repartidores: { activo: false, posicion: 'repartidores' },
        muro_avisos: { activo: false, posicion: _ADS_PLACEMENTS.MURO_AVISOS }
      };
    }

    window._currentLocalAdData = window._localAds.mapa;

    // Actualizar Banner Inferior para Pestaña 1 (Mapa)
    if (window._localAds.mapa && window._localAds.mapa.activo) {
      actualizarAnunciosEnVivo(window._localAds.mapa.titulo, window._localAds.mapa.url);
      actualizarBannerConImagen(window._localAds.mapa.image_url);
      currentAdUrl = getSafeExternalUrl(window._localAds.mapa.url) || currentAdUrl;
      if (localPromoContent) localPromoContent.style.display = 'flex';
    } else {
      if (localPromoContent) localPromoContent.style.display = 'none';
    }

    // Refrescar feeds si ya estaban cargados
    if (typeof renderVendorCards === 'function') renderVendorCards();
    if (typeof renderForumFeed === 'function') renderForumFeed();

  } catch (e) {
    console.error("Error cargando anuncios desde Supabase:", e);
    window._localAds = {
      mapa: null,
      repartidores: null,
      muro_avisos: null
    };
    window._currentLocalAdData = null;
    if (localPromoContent) {
      localPromoContent.style.display = 'none';
    }
  }
}
window.cargarAnunciosGuardados = cargarAnunciosGuardados;

/**
 * Actualizar textos dinámicos del banner local de Mapa
 */
function actualizarAnunciosEnVivo(texto, url) {
  if (texto) {
    const promoTextEl = document.getElementById('promoText');
    if (promoTextEl) promoTextEl.innerText = texto;
  }
  if (url) {
    currentAdUrl = getSafeExternalUrl(url) || currentAdUrl;
  }
}

/**
 * Actualizar imagen de fondo del banner local inferior
 */
function actualizarBannerConImagen(imageUrl) {
  const localPromoContent = document.getElementById('localPromoContent');
  if (!localPromoContent) return;

  if (window.ADS_CONFIG.mode === 'disabled' || (window._localAds && window._localAds.mapa && !window._localAds.mapa.activo)) {
    localPromoContent.style.display = 'none';
    return;
  }

  const safeImageUrl = getSafeAdImageUrl(imageUrl);
  if (safeImageUrl) {
    localPromoContent.style.backgroundImage = `url("${safeImageUrl.replace(/"/g, '%22')}")`;
    localPromoContent.style.backgroundSize = 'cover';
    localPromoContent.style.backgroundPosition = 'center';
    localPromoContent.style.display = 'flex';
    const sub = localPromoContent.querySelector('.ad-subtext');
    if (sub) {
      sub.style.background = 'rgba(0,0,0,0.72)';
      sub.style.padding = '4px 8px';
      sub.style.borderRadius = '4px';
    }
  } else {
    localPromoContent.style.backgroundImage = 'none';
    localPromoContent.style.display = 'flex';
    const sub = localPromoContent.querySelector('.ad-subtext');
    if (sub) {
      sub.style.background = 'transparent';
      sub.style.padding = '0';
    }
  }
}

/**
 * Redirige al telegram de soporte/ventas guardado en los anuncios
 */
window.abrirContactoPublicidad = function() {
  let url = '';
  // Intenta sacar la url de Telegram guardada en algún anuncio activo localmente
  if (window._localAds) {
    if (window._localAds.mapa && window._localAds.mapa.url && window._localAds.mapa.url.includes('t.me')) url = window._localAds.mapa.url;
    else if (window._localAds.repartidores && window._localAds.repartidores.url && window._localAds.repartidores.url.includes('t.me')) url = window._localAds.repartidores.url;
    else if (window._localAds.muro_avisos && window._localAds.muro_avisos.url && window._localAds.muro_avisos.url.includes('t.me')) url = window._localAds.muro_avisos.url;
  }
  // Fallback si no hay url t.me pero hay alguna url de anuncio
  if (!url && window._localAds?.mapa?.url) url = window._localAds.mapa.url;
  // Fallback final
  if (!url) url = 'https://t.me/NotiGas_Soporte';
  
  window.open(url, '_blank');
};

/**
 * Generador de tarjeta independiente para los feeds (Repartidores y Muro de Comentarios)
 */
window.getAdSenseFeedMarkup = function(placement) {
  const mode = window.ADS_CONFIG.mode || 'local';
  if (mode === 'disabled') return '';

  let ad = null;
  let placementTitle = 'PROPAGANDA LOCAL';

  if (placement === 'vendors') {
    ad = window._localAds?.repartidores;
    placementTitle = 'PROPAGANDA LOCAL • REPARTIDORES';
  } else if (placement === 'forum') {
    ad = window._localAds?.muro_avisos;
    placementTitle = 'ANUNCIO PUBLICITARIO • MURO DE AVISOS';
  } else {
    ad = window._localAds?.mapa || window._currentLocalAdData;
  }

  if (!ad || ad.activo === false) {
    return '';
  }

  const safeTitle = (typeof window.escapeHtmlStr === 'function')
    ? window.escapeHtmlStr(ad.titulo || 'Espacio Publicitario Disponible')
    : (ad.titulo || 'Espacio Publicitario Disponible');
  const safeCity = (typeof window.escapeHtmlStr === 'function')
    ? window.escapeHtmlStr(String(ad.ciudad || (typeof AppState !== 'undefined' ? AppState.get('city') : 'Local') || 'Local').toUpperCase())
    : String(ad.ciudad || 'Local').toUpperCase();
  const safeUrl = getSafeExternalUrl(ad.url) || 'https://wa.me/59170000000?text=Hola';
  const safeImg = getSafeAdImageUrl(ad.image_url);

  const bgStyle = safeImg
    ? `background-image: linear-gradient(180deg, rgba(15,23,42,0.85), rgba(15,23,42,0.92)), url('${safeImg.replace(/'/g, "\\'")}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, #1E293B, #0F172A);`;

  return `
    <div class="local-propaganda-feed-card" data-ad-placement="${placement}" style="${bgStyle}">
      <div class="local-ad-header">
        <span class="local-promo-badge"><i class="fa-solid fa-bullhorn"></i> ${placementTitle}</span>
        <span class="local-ad-city">📍 ${safeCity}</span>
      </div>
      <div class="local-ad-body">
        <h4 class="local-ad-title">${safeTitle}</h4>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn-local-ad-action">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Contactar / Ver Información
        </a>
      </div>
    </div>`;
};

window.activateAdSenseIn = function(container) {
  // No-op para compatibilidad de interfaces
};

let _adsInitializationPromise = null;
let _adsInitialized = false;

async function cargarConfiguracionPublicidadGlobal() {
  if (!window.supabaseClient) return false;
  try {
    const { data, error } = await window.supabaseClient
      .from('configuracion_publicidad')
      .select('modo')
      .eq('id', 1)
      .maybeSingle();
      
    if (error) throw error;
    if (data?.modo) {
      window.ADS_CONFIG.mode = data.modo;
    }
  } catch (error) {
    console.warn('No se pudo cargar configuracion_publicidad:', error);
  }
  await cargarAnunciosGuardados();
  return true;
}

async function initializeAdsModule() {
  if (_adsInitialized) {
    await cargarAnunciosGuardados();
    return true;
  }
  if (_adsInitializationPromise) {
    return _adsInitializationPromise;
  }
  _adsInitializationPromise = (async () => {
    if (!window.supabaseClient) return false;
    await cargarConfiguracionPublicidadGlobal();
    await iniciarSuscripcionAnuncios();
    _adsInitialized = true;
    document.dispatchEvent(
      new CustomEvent('notigas_ads_config_ready', {
        detail: { city: typeof AppState !== 'undefined' ? AppState.get('city') : 'cochabamba' }
      })
    );
    return true;
  })();
  try {
    return await _adsInitializationPromise;
  } finally {
    _adsInitializationPromise = null;
  }
}

window.cargarConfiguracionPublicidadGlobal = cargarConfiguracionPublicidadGlobal;
window.initializeAdsModule = initializeAdsModule;

function requestAdsInitialization() {
  initializeAdsModule().catch((error) => {
    console.error('Error inicializando anuncios publicitarios:', error);
  });
}

document.addEventListener('notigas_auth_ready', requestAdsInitialization);

/*
 * ads.js se carga de forma diferida. Para entonces DOMContentLoaded
 * y notigas_auth_ready pueden haber ocurrido, por eso se inicializa
 * inmediatamente cuando Supabase ya está disponible.
 */
if (window.supabaseClient) {
  requestAdsInitialization();
} else {
  document.addEventListener('supabase_ready', requestAdsInitialization, { once: true });
}
