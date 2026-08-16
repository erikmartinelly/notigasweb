/* ==========================================================================
   NOTIGAS - MÓDULO INTEGRADO DE PUBLICIDAD (GOOGLE ADSENSE & ANUNCIOS LOCALES)
   ========================================================================== */

// Configuración global de Publicidad y Google AdSense
window.ADS_CONFIG = {
  mode: localStorage.getItem('notigas_ads_mode') || 'hybrid', // 'hybrid' | 'adsense' | 'local'
  publisherId: localStorage.getItem('notigas_adsense_pub_id') || '', // ej: 'ca-pub-XXXXXXXXXXXXXXXX'
  slotFooter: localStorage.getItem('notigas_adsense_slot_footer') || '',
  slotForum: localStorage.getItem('notigas_adsense_slot_forum') || '',
  slotMap: localStorage.getItem('notigas_adsense_slot_map') || '',
  adSenseLoaded: false
};

window.adsSubscriptionChannel = null;
let currentAdUrl = 'https://wa.me/59170000000?text=Hola';

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
  if (currentAdUrl) {
    window.open(currentAdUrl, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Cargar anuncios locales desde Supabase
 */
async function cargarAnunciosGuardados() {
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
      currentAdUrl = data.url || currentAdUrl;
    } else {
      // Si no hay anuncio local activo, ocultar si el modo es estrictamente local
      if (window.ADS_CONFIG.mode === 'local') {
        const adContent = document.getElementById('localAdContent');
        if (adContent) adContent.style.display = 'none';
        const mapAd = document.getElementById('mapLocalAdBanner');
        if (mapAd) mapAd.style.display = 'none';
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
    const adTextEl2 = document.getElementById('adText2');
    if (adTextEl) adTextEl.innerText = texto;
    if (adTextEl2) adTextEl2.innerText = texto;
  }
  if (url) {
    currentAdUrl = url;
  }
}

/**
 * Actualizar imagen de fondo del banner local
 */
function actualizarBannerConImagen(imageUrl) {
  const localAdContent = document.getElementById('localAdContent');
  const mapLocalAdBanner = document.getElementById('mapLocalAdBanner');

  if (imageUrl) {
    if (localAdContent) {
      localAdContent.style.backgroundImage = `url('${imageUrl}')`;
      localAdContent.style.backgroundSize = 'cover';
      localAdContent.style.backgroundPosition = 'center';
      if (window.ADS_CONFIG.mode !== 'adsense') {
        localAdContent.style.display = 'flex';
      }
      const sub = localAdContent.querySelector('.ad-subtext');
      if (sub) {
        sub.style.background = 'rgba(0,0,0,0.6)';
        sub.style.padding = '4px 8px';
        sub.style.borderRadius = '4px';
      }
    }
    if (mapLocalAdBanner) {
      mapLocalAdBanner.style.backgroundImage = `url('${imageUrl}')`;
      mapLocalAdBanner.style.backgroundSize = 'cover';
      mapLocalAdBanner.style.backgroundPosition = 'center';
      mapLocalAdBanner.style.display = 'flex';
      const sub2 = mapLocalAdBanner.querySelector('.ad-subtext');
      if (sub2) {
        sub2.style.background = 'rgba(0,0,0,0.6)';
        sub2.style.padding = '4px 8px';
        sub2.style.borderRadius = '4px';
      }
    }
  }
}

/**
 * Inicializar y renderizar Google AdSense en los slots designados
 */
function inicializarGoogleAdSense() {
  const pubId = (window.ADS_CONFIG.publisherId || '').trim();
  const isAdSenseActive = (window.ADS_CONFIG.mode === 'adsense' || window.ADS_CONFIG.mode === 'hybrid') && pubId !== '';

  const localAdContent = document.getElementById('localAdContent');
  const adsenseContent = document.getElementById('adsenseContent');

  if (!isAdSenseActive) {
    // Modo solo local o sin Publisher ID configurado: mostrar banner local
    if (adsenseContent) adsenseContent.style.display = 'none';
    if (localAdContent) localAdContent.style.display = 'flex';
    return;
  }

  // 1. Inyectar script de Google AdSense si aún no existe
  if (!window.ADS_CONFIG.adSenseLoaded) {
    const existingScript = document.querySelector('script[src*="pagead2.googlesyndication.com"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(pubId)}`;
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        console.warn('⚠️ Google AdSense no pudo cargar (posible AdBlock). Realizando fallback a anuncios locales.');
        if (localAdContent) localAdContent.style.display = 'flex';
        if (adsenseContent) adsenseContent.style.display = 'none';
      };
      document.head.appendChild(script);
    }
    window.ADS_CONFIG.adSenseLoaded = true;
  }

  // 2. Renderizar Slot Inferior / Footer
  if (adsenseContent) {
    const footerSlotId = window.ADS_CONFIG.slotFooter || '';
    adsenseContent.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block; width:100%; height:60px;"
           data-ad-client="${pubId}"
           ${footerSlotId ? `data-ad-slot="${footerSlotId}"` : ''}
           data-ad-format="horizontal"
           data-full-width-responsive="true"></ins>
    `;
    adsenseContent.style.display = 'block';
    if (localAdContent) localAdContent.style.display = 'none';

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch(e) {
      console.warn('Error al activar AdSense en footer:', e);
    }
  }

  // 3. Renderizar Slot en Muro Comunitario / Foro
  const forumSlotContainer = document.getElementById('adsenseForumSlot');
  if (forumSlotContainer) {
    const forumSlotId = window.ADS_CONFIG.slotForum || '';
    forumSlotContainer.innerHTML = `
      <div class="adsense-slot-wrapper" style="margin: 10px 0; padding: 6px; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; text-align: center;">
        <div style="font-size: 9px; color: #64748B; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Publicidad Patrocinada</div>
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${pubId}"
             ${forumSlotId ? `data-ad-slot="${forumSlotId}"` : ''}
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
    `;
    forumSlotContainer.style.display = 'block';
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch(e) {
      console.warn('Error al activar AdSense en foro:', e);
    }
  }

  // 4. Renderizar Slot Superior en Mapa
  const mapSlotContainer = document.getElementById('adsenseMapSlot');
  if (mapSlotContainer && window.ADS_CONFIG.slotMap) {
    mapSlotContainer.innerHTML = `
      <div class="adsense-map-wrapper" style="width: 100%; max-width: 480px; margin: 0 auto; text-align: center;">
        <ins class="adsbygoogle"
             style="display:inline-block; width:320px; height:50px"
             data-ad-client="${pubId}"
             data-ad-slot="${window.ADS_CONFIG.slotMap}"></ins>
      </div>
    `;
    mapSlotContainer.style.display = 'block';
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch(e) {
      console.warn('Error al activar AdSense en mapa:', e);
    }
  }
}

/**
 * Guardar y aplicar configuración de anuncios (AdSense & Local)
 */
function guardarConfiguracionPublicidad(config) {
  if (!config) return;

  if (config.mode) {
    window.ADS_CONFIG.mode = config.mode;
    localStorage.setItem('notigas_ads_mode', config.mode);
  }
  if (config.publisherId !== undefined) {
    window.ADS_CONFIG.publisherId = config.publisherId.trim();
    localStorage.setItem('notigas_adsense_pub_id', window.ADS_CONFIG.publisherId);
  }
  if (config.slotFooter !== undefined) {
    window.ADS_CONFIG.slotFooter = config.slotFooter.trim();
    localStorage.setItem('notigas_adsense_slot_footer', window.ADS_CONFIG.slotFooter);
  }
  if (config.slotForum !== undefined) {
    window.ADS_CONFIG.slotForum = config.slotForum.trim();
    localStorage.setItem('notigas_adsense_slot_forum', window.ADS_CONFIG.slotForum);
  }
  if (config.slotMap !== undefined) {
    window.ADS_CONFIG.slotMap = config.slotMap.trim();
    localStorage.setItem('notigas_adsense_slot_map', window.ADS_CONFIG.slotMap);
  }

  inicializarGoogleAdSense();
  cargarAnunciosGuardados();
}

// Escuchar inicio de sesión y autenticación
document.addEventListener('notigas_auth_ready', () => {
  cargarAnunciosGuardados();
  iniciarSuscripcionAnuncios();
  inicializarGoogleAdSense();
});

// Inicialización temprana al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  inicializarGoogleAdSense();
});
