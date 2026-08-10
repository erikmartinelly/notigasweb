/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD & GOOGLE ADSENSE INTEGRATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarAnunciosGuardados();
});

function abrirAnuncioWhatsApp() {
  const savedUrl = localStorage.getItem('notigas_ad_url');
  const inputUrl = document.getElementById('inputAdUrl');
  const defaultUrl = 'https://wa.me/59170000000?text=Hola';
  
  const targetUrl = (savedUrl && savedUrl.trim() !== '') 
    ? savedUrl.trim() 
    : (inputUrl && inputUrl.value.trim() !== '' ? inputUrl.value.trim() : defaultUrl);
    
  window.open(targetUrl, '_blank');
}

function previewUploadAdImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  // Validación de tamaño (máx 2 MB)
  if (file.size > window.NOTIGAS.MAX_IMAGE_SIZE_BYTES) {
    if (typeof showToast === 'function') showToast('⚠️ Imagen Pesada', 'La imagen supera los 2 MB. Elige una más ligera.', 'warning', 3000);
    return;
  }

  // FIX C-04: Subir a Supabase Storage en lugar de guardar base64 en localStorage
  if (window.supabaseClient) {
    _subirImagenAnuncioAStorage(file);
  } else {
    // Fallback: leer como Data URL solo si Supabase no está disponible
    _leerImagenComoDataUrl(file);
  }
}

/**
 * FIX C-04: Sube la imagen de anuncio a Supabase Storage bucket 'anuncios-media'.
 * Guarda únicamente la URL pública en localStorage (no el base64).
 * Elimina el riesgo de QuotaExceededError por almacenar ~2.7 MB en localStorage.
 */
async function _subirImagenAnuncioAStorage(file) {
  try {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Subiendo imagen...');

    const fileName = `banner_${Date.now()}.${file.name.split('.').pop()}`;
    const { data, error } = await window.supabaseClient.storage
      .from('anuncios-media')
      .upload(fileName, file, { upsert: true, contentType: file.type });

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (error) {
      console.error('Error al subir imagen a Storage:', error);
      // Fallback: leer como Data URL si Storage falla
      _leerImagenComoDataUrl(file);
      return;
    }

    // Obtener URL pública del archivo subido
    const { data: urlData } = window.supabaseClient.storage
      .from('anuncios-media')
      .getPublicUrl(data.path);

    const publicUrl = urlData.publicUrl;

    // Guardar solo la URL (no el base64 completo) — FIX C-04
    _guardarUrlAnuncioConSeguridad('notigas_ad_image_url', publicUrl);
    // Limpiar cualquier base64 residual antiguo
    localStorage.removeItem('notigas_ad_image_base64');

    mostrarVistaPreviaImagen(publicUrl);
    actualizarBannerConImagen(publicUrl);
    if (typeof showToast === 'function') showToast('📸 Anuncio Cargado', 'Imagen subida a la nube correctamente.', 'success', 2000);

  } catch (e) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error('Excepción al subir imagen a Storage:', e);
    _leerImagenComoDataUrl(file);
  }
}

/**
 * Fallback: lee la imagen como Data URL cuando Supabase Storage no está disponible.
 * Incluye manejo de QuotaExceededError para proteger localStorage. (FIX C-04)
 */
function _leerImagenComoDataUrl(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    // FIX C-04: Guardar con manejo de QuotaExceededError
    _guardarUrlAnuncioConSeguridad('notigas_ad_image_base64', base64Data);
    mostrarVistaPreviaImagen(base64Data);
    actualizarBannerConImagen(base64Data);
    if (typeof showToast === 'function') showToast('📸 Anuncio Cargado', 'Imagen de anuncio cargada correctamente.', 'success', 2000);
  };
  reader.readAsDataURL(file);
}

/**
 * FIX C-04: Guarda un valor en localStorage con manejo de QuotaExceededError.
 * Si localStorage está lleno, limpia la imagen base64 antigua y reintenta.
 */
function _guardarUrlAnuncioConSeguridad(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn('[ads.js] QuotaExceededError — limpiando datos de imagen antiguos...');
      // Limpiar datos de imagen grandes para liberar espacio
      localStorage.removeItem('notigas_ad_image_base64');
      localStorage.removeItem('notigas_ad_image_url');
      try {
        localStorage.setItem(key, value);
      } catch (e2) {
        console.error('[ads.js] localStorage sigue lleno después de limpiar:', e2);
        if (typeof showToast === 'function') {
          showToast('⚠️ Almacenamiento Lleno', 'No hay espacio suficiente. Borra datos del navegador e intenta de nuevo.', 'warning', 5000);
        }
      }
    }
  }
}


function mostrarVistaPreviaImagen(base64Data) {
  const box = document.getElementById('adImagePreviewBox');
  const img = document.getElementById('adImagePreview');
  if (box && img) {
    img.src = base64Data;
    box.style.display = 'flex';
  }
}

function eliminarImagenAnuncio() {
  localStorage.removeItem('notigas_ad_image_base64');
  const box = document.getElementById('adImagePreviewBox');
  const fileInput = document.getElementById('inputAdImageFile');
  if (box) box.style.display = 'none';
  if (fileInput) fileInput.value = '';
  actualizarBannerConImagen(null);
  if (typeof showToast === 'function') showToast('🗑️ Imagen Eliminada', 'Imagen de anuncio eliminada.', 'info', 1000);
}

function inyectarGoogleAdsenseScript(pubId, slotId) {
  if (!pubId || !pubId.startsWith('ca-pub-')) return;
  
  // 1. Inyectar el script de AdSense si no existe
  if (!document.getElementById('adsenseScriptTag')) {
    const script = document.createElement('script');
    script.id = 'adsenseScriptTag';
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
    console.log("🌐 Google AdSense Script inyectado con éxito:", pubId);
  }

  // 2. Renderizar el bloque de anuncio en el espacio asignado
  const localContent = document.getElementById('localAdContent');
  const adsenseContent = document.getElementById('adsenseContent');
  
  if (localContent && adsenseContent) {
    localContent.style.display = 'none';
    adsenseContent.style.display = 'block';
    adsenseContent.innerHTML = `
      <ins class="adsbygoogle"
           style="display:inline-block;width:100%;height:60px;overflow:hidden;border-radius:10px;"
           data-ad-client="${pubId}"
           ${slotId ? `data-ad-slot="${slotId}"` : ''}></ins>
    `;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch(e) {}
  }
}

async function cargarAnunciosGuardados() {
  const savedAdsense = localStorage.getItem('notigas_adsense_id') || '';
  const savedSlot = localStorage.getItem('notigas_adsense_slot_id') || '1234567890';
  const savedMode = localStorage.getItem('notigas_adsense_mode') || 'custom';
  
  if (savedMode === 'adsense' && savedAdsense) {
    inyectarGoogleAdsenseScript(savedAdsense, savedSlot);
    return;
  }

  if (window.supabaseClient) {
    try {
      const { data, error } = await window.supabaseClient.from('publicaciones').select('*').eq('tipo', 'anuncioGlobal').single();
      if (data && !error) {
        const text = data.titulo || '';
        const url = (data.comentarios && data.comentarios[0] && data.comentarios[0].url) ? data.comentarios[0].url : '';
        const image = (data.comentarios && data.comentarios[0] && data.comentarios[0].image) ? data.comentarios[0].image : '';
        
        localStorage.setItem('notigas_ad_text', text);
        localStorage.setItem('notigas_ad_url', url);
        if (image) localStorage.setItem('notigas_ad_image_base64', image);

        if (text) {
          const el = document.getElementById('inputAdText');
          if (el) el.value = text;
          actualizarAnunciosEnVivo(text, url);
        }
        if (url) {
          const el = document.getElementById('inputAdUrl');
          if (el) el.value = url;
        }
        if (image) {
          mostrarVistaPreviaImagen(image);
          actualizarBannerConImagen(image);
        }
        return;
      }
    } catch(e) {
      console.error("Error cargando anuncio global:", e);
    }
  }

  // Fallback a LocalStorage si no hay conexión
  const savedText = localStorage.getItem('notigas_ad_text');
  const savedUrl = localStorage.getItem('notigas_ad_url');
  const savedImage = localStorage.getItem('notigas_ad_image_base64');

  const elId = document.getElementById('inputAdsenseId');
  if (elId) elId.value = savedAdsense;

  const elSlot = document.getElementById('inputAdsenseSlotId');
  if (elSlot) elSlot.value = savedSlot;

  const elMode = document.getElementById('inputAdsenseMode');
  if (elMode) elMode.value = savedMode;

  if (savedText) {
    const el = document.getElementById('inputAdText');
    if (el) el.value = savedText;
    actualizarAnunciosEnVivo(savedText, savedUrl);
  }

  if (savedUrl) {
    const el = document.getElementById('inputAdUrl');
    if (el) el.value = savedUrl;
  }

  if (savedImage) {
    mostrarVistaPreviaImagen(savedImage);
    actualizarBannerConImagen(savedImage);
  }
}

function actualizarBannerConImagen(base64Data) {
  const localContent = document.getElementById('localAdContent');
  const adsenseContent = document.getElementById('adsenseContent');
  const titleText = document.getElementById('adTitleText');
  const adText = document.getElementById('adText');
  
  // Si estamos en modo manual/custom, asegurar que el contenedor local se muestre
  const savedMode = localStorage.getItem('notigas_adsense_mode') || 'custom';
  if (savedMode !== 'adsense' && localContent && adsenseContent) {
    localContent.style.display = 'flex';
    adsenseContent.style.display = 'none';
  }

  if (base64Data) {
    if (titleText) {
      titleText.style.display = 'block';
      titleText.innerHTML = `<img src="${base64Data}" style="max-height: 28px; border-radius:4px; vertical-align:middle; margin-right:6px;" alt="Sponsor">`;
    }
  } else {
    if (titleText) {
      titleText.style.display = 'none';
      titleText.innerHTML = ``;
    }
  }
}

function actualizarAnunciosEnVivo(nuevoTexto, nuevoUrl) {
  if (nuevoTexto) {
    const adText = document.getElementById('adText');
    const adShopSubtext = document.getElementById('adShopSubtext');
    const adForumDesc = document.getElementById('adForumDesc');
    const adVendorDesc = document.getElementById('adVendorDesc');

    if (adText) adText.innerText = nuevoTexto;
    if (adShopSubtext) adShopSubtext.innerText = nuevoTexto;
    if (adForumDesc) adForumDesc.innerText = nuevoTexto;
    if (adVendorDesc) adVendorDesc.innerText = nuevoTexto;
  }
}



