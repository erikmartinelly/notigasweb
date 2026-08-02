/* ==========================================================================
   NOTIGAS - MÓDULO DE PUBLICIDAD & GOOGLE ADSENSE INTEGRATION
   ========================================================================== */

function abrirAnuncioWhatsApp() {
  const inputUrl = document.getElementById('inputAdUrl');
  const targetUrl = inputUrl ? inputUrl.value : 'https://wa.me/59170712345?text=Hola!%20Deseo%20publicar%20anuncio';
  window.open(targetUrl, '_blank');
}

function actualizarAnunciosEnVivo(nuevoTexto) {
  const adText = document.getElementById('adText');
  const adShopSubtext = document.getElementById('adShopSubtext');
  const adForumDesc = document.getElementById('adForumDesc');

  if (adText) adText.innerText = nuevoTexto;
  if (adShopSubtext) adShopSubtext.innerText = nuevoTexto;
  if (adForumDesc) adForumDesc.innerText = nuevoTexto;
}
