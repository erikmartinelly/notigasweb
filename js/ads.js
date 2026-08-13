/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD (ARQUITECTURA NUEVA)
   ========================================================================== */

document.addEventListener('notigas_auth_ready', () => {
  cargarAnunciosGuardados();
  
  if (window.supabaseClient && !window.adsSubscriptionActive) {
    window.adsSubscriptionActive = true;
    const activeCity = AppState.get('city') || 'santacruz';
    window.supabaseClient.channel('custom-all-channel-ads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anuncios_globales', filter: `ciudad=eq.${activeCity}` }, payload => {
          cargarAnunciosGuardados();
      })
      .subscribe();
  }
});

let currentAdUrl = 'https://wa.me/59170000000?text=Hola';

function abrirAnuncioWhatsApp() {
  window.open(currentAdUrl, '_blank');
}

async function cargarAnunciosGuardados() {
  if (!window.supabaseClient) return;
  const activeCity = AppState.get('city') || 'santacruz';

  try {
    const { data, error } = await window.supabaseClient
      .from('anuncios_globales')
      .select('titulo, url, image_url')
      .eq('ciudad', activeCity)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      actualizarAnunciosEnVivo(data.titulo, data.url);
      actualizarBannerConImagen(data.image_url);
      currentAdUrl = data.url || currentAdUrl;
    } else {
      // Hide ads if none exist for this city
      const adContent = document.getElementById('localAdContent');
      if (adContent) adContent.style.display = 'none';
      const mapAd = document.getElementById('mapLocalAdBanner');
      if (mapAd) mapAd.style.display = 'none';
    }
  } catch (e) {
    console.error("Error cargando anuncios globales:", e);
  }
}

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

function actualizarBannerConImagen(imageUrl) {
  const localAdContent = document.getElementById('localAdContent');
  const mapLocalAdBanner = document.getElementById('mapLocalAdBanner');

  if (imageUrl) {
    if (localAdContent) {
      localAdContent.style.backgroundImage = `url('${imageUrl}')`;
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

