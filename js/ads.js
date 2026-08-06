/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD & GOOGLE ADSENSE INTEGRATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarAnunciosGuardados();
});

function abrirAnuncioWhatsApp() {
  const savedUrl = localStorage.getItem('notigas_ad_url');
  const inputUrl = document.getElementById('inputAdUrl');
  const defaultUrl = 'https://wa.me/59174xxxx28?text=Hola!%20Deseo%20publicar%20mi%20anuncio%20en%20NOTIGAS';
  
  const targetUrl = (savedUrl && savedUrl.trim() !== '') 
    ? savedUrl.trim() 
    : (inputUrl && inputUrl.value.trim() !== '' ? inputUrl.value.trim() : defaultUrl);
    
  window.open(targetUrl, '_blank');
}

function previewUploadAdImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('⚠️ Imagen Pesada', 'La imagen supera los 2 MB. Elige una más ligera.', 'warning', 1000);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    localStorage.setItem('notigas_ad_image_base64', base64Data);
    mostrarVistaPreviaImagen(base64Data);
    actualizarBannerConImagen(base64Data);
    if (typeof showToast === 'function') showToast('📸 Anuncio Cargado', 'Imagen de anuncio cargada correctamente.', 'success', 1000);
  };
  reader.readAsDataURL(file);
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

function cargarAnunciosGuardados() {
  const savedAdsense = localStorage.getItem('notigas_adsense_id') || 'ca-pub-2502415561017945';
  const savedSlot = localStorage.getItem('notigas_adsense_slot_id') || '1234567890';
  const savedMode = localStorage.getItem('notigas_adsense_mode') || 'custom';
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

  if (savedMode === 'adsense' && savedAdsense) {
    inyectarGoogleAdsenseScript(savedAdsense, savedSlot);
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
      titleText.innerHTML = `<img src="${base64Data}" style="max-height: 28px; border-radius:4px; vertical-align:middle; margin-right:6px;" alt="Sponsor"> 📢 Publicidad Local NOTIGAS`;
    }
  } else {
    if (titleText) {
      titleText.innerHTML = `📢 Espacio de Publicidad Local`;
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

function guardarSubmenuAnuncios() {
  const adsenseId = (document.getElementById('inputAdsenseId')?.value || '').trim();
  const adsenseSlot = (document.getElementById('inputAdsenseSlotId')?.value || '').trim();
  const adsenseMode = (document.getElementById('inputAdsenseMode')?.value || 'custom').trim();
  const adText = (document.getElementById('inputAdText')?.value || '').trim();
  const adUrl = (document.getElementById('inputAdUrl')?.value || '').trim();

  if (adsenseId) localStorage.setItem('notigas_adsense_id', adsenseId);
  if (adsenseSlot) localStorage.setItem('notigas_adsense_slot_id', adsenseSlot);
  localStorage.setItem('notigas_adsense_mode', adsenseMode);

  if (adText) {
    localStorage.setItem('notigas_ad_text', adText);
    actualizarAnunciosEnVivo(adText, adUrl);
  }

  if (adUrl) {
    localStorage.setItem('notigas_ad_url', adUrl);
  }

  if (adsenseMode === 'adsense' && adsenseId) {
    inyectarGoogleAdsenseScript(adsenseId, adsenseSlot);
  }

  if (typeof renderAdminAdsAndPostsList === 'function') {
    renderAdminAdsAndPostsList();
  }

  if (typeof showToast === 'function') {
    showToast('💾 Configuración Guardada', 'La publicidad y datos de AdSense fueron guardados.', 'success', 1000);
  }
}

