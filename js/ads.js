/* ==========================================================================
   NOTIGAS - MÓDULO INTEGRADO DE PUBLICIDAD (GOOGLE ADSENSE & ANUNCIOS LOCALES)
   ========================================================================== */

// Configuración global de Publicidad y Google AdSense
window.ADS_CONFIG = {
  mode: localStorage.getItem('notigas_ads_mode') || 'hybrid', // 'adsense' | 'local' | 'hybrid' | 'disabled'
  publisherId: localStorage.getItem('notigas_adsense_pub_id') || 'ca-pub-2502415561017945',
  slotVendors: localStorage.getItem('notigas_adsense_slot_vendors') || localStorage.getItem('notigas_adsense_slot_footer') || '',
  slotForum: localStorage.getItem('notigas_adsense_slot_forum') || '',
  adSenseLoaded: false
};

window.adsSubscriptionChannel = null;
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
    return parsed.protocol === 'https:' ? parsed.href : '';
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'anuncios_globales', filter: `ciudad=eq.${activeCity}` }, payload => {
        cargarAnunciosGuardados();
    })
    .subscribe();
}

/**
 * Abrir enlace o WhatsApp del anuncio local
 */
function abrirAnuncioWhatsApp() {
  const safeUrl = getSafeExternalUrl(currentAdUrl);
  if (safeUrl) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  } else if (typeof showToast === 'function') {
    showToast('Enlace no disponible', 'El anuncio no tiene un enlace web seguro.', 'warning', 3000);
  }
}

/**
 * Cargar anuncios locales desde Supabase
 */
async function cargarAnunciosGuardados() {
  if (window.ADS_CONFIG.mode === 'disabled') {
    const localAdContent = document.getElementById('localAdContent');
    if (localAdContent) localAdContent.style.display = 'none';
    return;
  }

  if (!window.supabaseClient) return;
  const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
  if (!activeCity) return;

  try {
    const { data, error } = await window.supabaseClient
      .from('anuncios_globales')
      .select('titulo, url, image_url')
      .eq('ciudad', activeCity)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      actualizarAnunciosEnVivo(data.titulo, data.url);
      actualizarBannerConImagen(data.image_url);
      currentAdUrl = getSafeExternalUrl(data.url) || currentAdUrl;
    } else {
      // Si no hay anuncio local activo y estamos en modo solo local
      if (window.ADS_CONFIG.mode === 'local') {
        const adContent = document.getElementById('localAdContent');
        if (adContent) adContent.style.display = 'flex';
      }
    }
  } catch (e) {
    console.error("Error cargando anuncios locales:", e);
  }
}

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
 * Actualizar imagen de fondo del banner local
 */
function actualizarBannerConImagen(imageUrl) {
  const localAdContent = document.getElementById('localAdContent');
  const safeImageUrl = getSafeAdImageUrl(imageUrl);

  if (window.ADS_CONFIG.mode === 'disabled') {
    if (localAdContent) localAdContent.style.display = 'none';
    return;
  }

  if (safeImageUrl) {
    if (localAdContent) {
      localAdContent.style.backgroundImage = `url("${safeImageUrl.replace(/"/g, '%22')}")`;
      localAdContent.style.backgroundSize = 'cover';
      localAdContent.style.backgroundPosition = 'center';
      localAdContent.style.display = 'flex';
      const sub = localAdContent.querySelector('.ad-subtext');
      if (sub) {
        sub.style.background = 'rgba(0,0,0,0.6)';
        sub.style.padding = '4px 8px';
        sub.style.borderRadius = '4px';
      }
    }
  }
}

function isValidPublisherId(value) {
  return /^ca-pub-\d{10,20}$/.test(String(value || '').trim());
}

function isValidAdSlotId(value) {
  return /^\d{6,20}$/.test(String(value || '').trim());
}

function applyAdsConfig(config) {
  if (!config) return;
  const allowedModes = ['adsense', 'local', 'hybrid', 'disabled'];
  const mode = allowedModes.includes(config.mode) ? config.mode : window.ADS_CONFIG.mode;
  const publisherId = String(config.publisherId || '').trim();
  const slotVendors = String(config.slotVendors || '').trim();
  const slotForum = String(config.slotForum || '').trim();

  window.ADS_CONFIG.mode = mode;
  if (isValidPublisherId(publisherId)) window.ADS_CONFIG.publisherId = publisherId;
  window.ADS_CONFIG.slotVendors = isValidAdSlotId(slotVendors) ? slotVendors : '';
  window.ADS_CONFIG.slotForum = isValidAdSlotId(slotForum) ? slotForum : '';

  localStorage.setItem('notigas_ads_mode', window.ADS_CONFIG.mode);
  localStorage.setItem('notigas_adsense_pub_id', window.ADS_CONFIG.publisherId);
  localStorage.setItem('notigas_adsense_slot_vendors', window.ADS_CONFIG.slotVendors);
  localStorage.setItem('notigas_adsense_slot_forum', window.ADS_CONFIG.slotForum);
}

async function cargarConfiguracionPublicidadGlobal() {
  if (!window.supabaseClient) return;
  const { data, error } = await window.supabaseClient
    .from('configuracion_publicidad')
    .select('modo, publisher_id, slot_repartidores, slot_avisos')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.warn('Configuración global de publicidad no disponible. Aplica la migración 044.', error.message);
    return;
  }
  if (data) {
    applyAdsConfig({
      mode: data.modo,
      publisherId: data.publisher_id,
      slotVendors: data.slot_repartidores,
      slotForum: data.slot_avisos
    });
  }
  inicializarGoogleAdSense();
  document.dispatchEvent(new Event('notigas_ads_config_ready'));
}

window.getAdSenseFeedMarkup = function(placement) {
  const mode = window.ADS_CONFIG.mode || 'hybrid';
  if (mode === 'disabled' || mode === 'local') return '';

  const publisherId = String(window.ADS_CONFIG.publisherId || '').trim();
  const slotId = placement === 'vendors'
    ? String(window.ADS_CONFIG.slotVendors || '').trim()
    : String(window.ADS_CONFIG.slotForum || '').trim();
  if (!isValidPublisherId(publisherId) || !isValidAdSlotId(slotId)) return '';

  return `
    <div class="adsense-feed-slot" data-adsense-placement="${placement}">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${publisherId}"
           data-ad-slot="${slotId}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>`;
};

window.activateAdSenseIn = function(container) {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (!rect || rect.width <= 0) return;
  container.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn('AdSense no pudo activar una unidad del feed:', error);
    }
  });
};

function inicializarGoogleAdSense() {
  const localAdContent = document.getElementById('localAdContent');
  if (localAdContent) {
    localAdContent.style.display = window.ADS_CONFIG.mode === 'disabled' ? 'none' : 'flex';
  }

  if (window.ADS_CONFIG.mode === 'disabled' || window.ADS_CONFIG.mode === 'local') return;
  const pubId = String(window.ADS_CONFIG.publisherId || '').trim();
  if (!isValidPublisherId(pubId)) return;

  if (!document.querySelector('script[src*="pagead2.googlesyndication.com"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(pubId)}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }
  window.ADS_CONFIG.adSenseLoaded = true;
}

async function guardarConfiguracionPublicidad(config) {
  if (!config) return { ok: false, error: 'Configuración ausente' };
  const allowedModes = ['adsense', 'local', 'hybrid', 'disabled'];
  const mode = allowedModes.includes(config.mode) ? config.mode : 'hybrid';
  const publisherId = String(config.publisherId || '').trim();
  const slotVendors = String(config.slotVendors || '').trim();
  const slotForum = String(config.slotForum || '').trim();

  if (!isValidPublisherId(publisherId)) {
    return { ok: false, error: 'El Publisher ID debe tener el formato ca-pub- seguido de números.' };
  }
  if (slotVendors && !isValidAdSlotId(slotVendors)) {
    return { ok: false, error: 'El Slot ID de Repartidores debe contener solo números.' };
  }
  if (slotForum && !isValidAdSlotId(slotForum)) {
    return { ok: false, error: 'El Slot ID de Avisos debe contener solo números.' };
  }
  if (mode !== 'local' && mode !== 'disabled' && (!slotVendors || !slotForum)) {
    return { ok: false, error: 'Para mostrar Google AdSense debes ingresar los dos Slot ID: Repartidores y Avisos Gratis.' };
  }

  if (!window.supabaseClient) {
    return { ok: false, error: 'No hay conexión con Supabase para guardar la configuración global.' };
  }

  const { error } = await window.supabaseClient.from('configuracion_publicidad').upsert({
      id: 1,
      modo: mode,
      publisher_id: publisherId,
      slot_repartidores: slotVendors,
      slot_avisos: slotForum,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };

  applyAdsConfig({ mode, publisherId, slotVendors, slotForum });

  inicializarGoogleAdSense();
  document.dispatchEvent(new Event('notigas_ads_config_ready'));
  cargarAnunciosGuardados();
  return { ok: true };
}

document.addEventListener('notigas_auth_ready', async () => {
  await cargarConfiguracionPublicidadGlobal();
  cargarAnunciosGuardados();
  iniciarSuscripcionAnuncios();
});

document.addEventListener('DOMContentLoaded', inicializarGoogleAdSense);
