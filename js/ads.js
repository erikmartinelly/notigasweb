/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD & GOOGLE ADSENSE INTEGRATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarAnunciosGuardados();
});

function abrirAnuncioWhatsApp() {
  const savedUrl = localStorage.getItem('notigas_ad_url');
  const inputUrl = document.getElementById('inputAdUrl');
  const defaultUrl = 'https://wa.me/59170712345?text=Hola!%20Deseo%20publicar%20mi%20anuncio%20en%20NOTIGAS';
  
  const targetUrl = (savedUrl && savedUrl.trim() !== '') 
    ? savedUrl.trim() 
    : (inputUrl && inputUrl.value.trim() !== '' ? inputUrl.value.trim() : defaultUrl);
    
  window.open(targetUrl, '_blank');
}

function cargarAnunciosGuardados() {
  const savedAdsense = localStorage.getItem('notigas_adsense_id');
  const savedText = localStorage.getItem('notigas_ad_text');
  const savedUrl = localStorage.getItem('notigas_ad_url');

  if (savedAdsense) {
    const el = document.getElementById('inputAdsenseId');
    if (el) el.value = savedAdsense;
  }

  if (savedText) {
    const el = document.getElementById('inputAdText');
    if (el) el.value = savedText;
    actualizarAnunciosEnVivo(savedText, savedUrl);
  }

  if (savedUrl) {
    const el = document.getElementById('inputAdUrl');
    if (el) el.value = savedUrl;
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

  if (nuevoUrl) {
    localStorage.setItem('notigas_ad_url', nuevoUrl);
  }
}

