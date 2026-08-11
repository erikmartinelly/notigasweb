/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD (ARQUITECTURA NUEVA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarAnunciosGuardados();
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

// ---------------------------------------------------------
// FUNCIONES DE ADMINISTRACIÓN
// ---------------------------------------------------------

let pendingUploadUrl = null;

window.previewUploadAdImage = async function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('⚠️ Imagen Pesada', 'La imagen supera los 2 MB. Elige una más ligera.', 'warning', 3000);
    return;
  }

  if (window.supabaseClient) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Subiendo imagen...');
    const fileName = `banner_${Date.now()}.${file.name.split('.').pop()}`;
    const { data, error } = await window.supabaseClient.storage
      .from('anuncios-media')
      .upload(fileName, file, { upsert: true, contentType: file.type });

    if (error) {
      console.error('Error al subir imagen:', error);
      if (typeof showToast === 'function') showToast('Error', 'No se pudo subir la imagen.', 'error');
    } else {
      const { data: publicUrlData } = window.supabaseClient.storage.from('anuncios-media').getPublicUrl(fileName);
      pendingUploadUrl = publicUrlData.publicUrl;
      
      const preview = document.getElementById('adImagePreview');
      const box = document.getElementById('adImagePreviewBox');
      if (preview && box) {
        preview.src = pendingUploadUrl;
        box.style.display = 'flex';
      }
      if (typeof showToast === 'function') showToast('Éxito', 'Imagen subida al servidor.', 'success');
    }
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
};

window.eliminarImagenAnuncio = async function() {
  // Try to delete from storage if there is a pending URL
  if (pendingUploadUrl && window.supabaseClient) {
     const urlParts = pendingUploadUrl.split('/');
     const fileName = urlParts[urlParts.length - 1];
     await window.supabaseClient.storage.from('anuncios-media').remove([fileName]);
  }
  
  pendingUploadUrl = null;
  const preview = document.getElementById('adImagePreview');
  const box = document.getElementById('adImagePreviewBox');
  const input = document.getElementById('inputAdImageFile');
  if (preview) preview.src = '';
  if (box) box.style.display = 'none';
  if (input) input.value = '';
  if (typeof showToast === 'function') showToast('Eliminada', 'La imagen ha sido descartada.', 'info');
};
