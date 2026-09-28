/* NOTIGAS - Panel administrativo de pagos (retirado: NOTIGAS no cobra) */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  };

  /* Reetiqueta la pestaña 4 del admin, que historicamente fue "Suscripciones
     PRO/VIP" y luego "Pagos con Yape Remesas". Ahora solo informa que
     NOTIGAS no cobra. */
  function normalizarEtiquetasPanelPagos() {
    const buttons = Array.from(document.querySelectorAll('.modal-tab-btn'));
    if (buttons[3]) {
      buttons[3].innerHTML = '<i class="fa-solid fa-qrcode"></i> QR local';
      buttons[3].title = 'Medio de pago local. NOTIGAS no cobra comisiones.';
    }
    const panes = Array.from(document.querySelectorAll('.modal-tab-pane'));
    const pane = panes[3];
    if (!pane) return;
    pane.querySelectorAll('h2,h3,h4,p').forEach((el) => {
      const text = String(el.textContent || '').trim();
      if (/premium|vip|suscripci[oó]n|yape|comisi[oó]n|remesa/i.test(text)) {
        if (/^H[234]$/.test(el.tagName)) el.textContent = 'Medio de pago';
        else el.textContent = 'NOTIGAS no cobra ni custodia fondos. No hay comisiones, vouchers ni cobros que revisar. El pago se acuerda directamente entre comprador y recolector por QR local (Simple / Banesco QR), destino Bolivia.';
      }
    });
  }

  /* Las tres acciones quedan como no-op informativas. Antes llamaban a
     rpc_admin_review_commission_voucher, que fue eliminada junto con el
     sistema de comisiones, por lo que ya no hay nada que revisar. */
  function accionRetirada() {
    if (typeof showToast === 'function') {
      showToast('Función retirada', 'NOTIGAS no cobra comisiones ni procesa pagos. No hay nada que confirmar, revertir ni observar.', 'info', 4000);
    }
  }

  async function renderAdminPaymentsReview() {
    normalizarEtiquetasPanelPagos();
    const container = document.getElementById('adminPremiumSubscriptionsContainer');
    if (!container) return;
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:#94A3B8;">
        <div style="font-size:40px;margin-bottom:10px;"><i class="fa-solid fa-qrcode"></i></div>
        <div style="font-size:15px;font-weight:800;color:#16A34A;margin-bottom:8px;">SIN COBROS · SIN COMISIONES</div>
        <div style="max-width:520px;margin:0 auto;font-size:12px;line-height:1.7;">
          NOTIGAS no cobra, no liquida comisiones y no custodia fondos. Las tablas
          <code>pagos_comisiones</code> y <code>registro_comisiones</code> y sus RPCs
          fueron eliminadas de la base de datos.
          <br><br>
          El pago se acuerda directamente entre comprador y recolector por
          <strong>QR local (Simple / Banesco QR)</strong>, destino Bolivia.
        </div>
      </div>`;
  }

  window.confirmarRecepcionPagoAdmin = accionRetirada;
  window.marcarPagoNoRecibidoAdmin = accionRetirada;
  window.banearPorFraudePagoAdmin = accionRetirada;
  window.renderAdminPaymentsReview = renderAdminPaymentsReview;
  window.renderAdminPremiumSubscriptions = renderAdminPaymentsReview;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizarEtiquetasPanelPagos, { once: true });
  else normalizarEtiquetasPanelPagos();
})();
