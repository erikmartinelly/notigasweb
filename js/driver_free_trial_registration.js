/* ==========================================================================
   NOTIGAS - REGISTRO DE REPARTIDOR: PRUEBA GRATIS
   - Existe una sola modalidad operativa: credito.
   - Los primeros 50 pedidos confirmados no generan comision.
   - Desde el pedido 51 se cobra S/ 0,20 por pedido.
   ========================================================================== */
(function () {
  'use strict';

  const TRIAL_COPY = 'Los primeros 50 pedidos son gratis. Desde el pedido 51 en adelante se cobra S/ 0,20 por pedido.';

  function renderDriverFreeTrialRegistration() {
    const container = document.getElementById('driverPlanSelectorContainer');
    if (!container) return;

    container.setAttribute('aria-label', 'Prueba gratis para repartidores');
    container.style.border = '1.5px solid rgba(16,185,129,.55)';
    container.style.background = 'linear-gradient(135deg, rgba(16,185,129,.12), rgba(15,23,42,.96))';
    container.style.padding = '14px';

    container.innerHTML = `
      <input type="hidden" id="inputDriverPlanTipo" value="credito">
      <div id="driverFreeTrialCard" style="border:1.5px solid #10B981;background:#0F172A;border-radius:12px;padding:14px 12px;box-shadow:0 8px 22px rgba(0,0,0,.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <strong style="color:#6EE7B7;font-size:15px;letter-spacing:.2px;">🎁 PRUEBA GRATIS</strong>
          <span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.45);color:#A7F3D0;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;white-space:nowrap;">50 PEDIDOS</span>
        </div>
        <p id="driverFreeTrialCopy" style="margin:0;color:#F8FAFC;font-size:12px;line-height:1.55;font-weight:700;">${TRIAL_COPY}</p>
        <p style="margin:8px 0 0;color:#94A3B8;font-size:10.5px;line-height:1.45;">Sin suscripción ni pago inicial.</p>
      </div>`;

    // Retirar del DOM cualquier resto del selector PRO/Gratuito heredado.
    for (const id of [
      'driverPremiumGratuitoContent',
      'driverPremiumProContent',
      'driverPremiumPaymentSection',
      'driverPremiumStatusBadge',
      'driverPremiumActiveAlert',
      'driverPremiumPendingAlert'
    ]) {
      document.getElementById(id)?.remove();
    }
  }

  window.renderDriverFreeTrialRegistration = renderDriverFreeTrialRegistration;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDriverFreeTrialRegistration, { once: true });
  } else {
    renderDriverFreeTrialRegistration();
  }

  // Auth puede restaurar una ficha después del primer render. Reaplicar garantiza
  // que ningún estado heredado vuelva a mostrar un selector de planes.
  document.addEventListener('notigas_auth_ready', renderDriverFreeTrialRegistration);
})();
