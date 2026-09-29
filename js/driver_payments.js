/* ==========================================================================
   NOTIGAS - PAGOS DEL REPARTIDOR (BOLIVIA · SIN COMISIÓN)
   - NOTIGAS no cobra comisión, cuota ni ciclo de crédito.
   - El pago se acuerda directo entre comprador y repartidor, en bolivianos.
   - Único medio admitido: QR local (Simple / Banesco QR).
   - NOTIGAS no registra pagos ni guarda historial de vouchers.
   - El voucher se procesa localmente; la imagen NO se persiste.
   ========================================================================== */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const money = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `Bs ${n.toFixed(2)}` : '—';
  };
  const fecha = (value) => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('es-BO', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch (_) { return String(value); }
  };

  function isDriver() {
    const role = typeof AppState !== 'undefined' ? AppState.get('userRole') : null;
    const mode = typeof AppState !== 'undefined' ? AppState.get('appMode') : null;
    const user = typeof AppState !== 'undefined' ? AppState.get('userData') : null;
    return role === 'repartidor' || mode === 'driver' || user?.role === 'repartidor';
  }

  function ensurePaymentsModal() {
    let modal = document.getElementById('modalDriverPayments');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'modalDriverPayments';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="modal-content" style="max-width:720px;max-height:90vh;overflow:auto;">
      <div class="modal-title"><span id="driverPaymentsModalTitle"><i class="fa-solid fa-qrcode"></i> Pago con QR local</span>
      <button type="button" class="btn-close" id="btnCloseDriverPayments">✖</button></div>
      <div id="driverPaymentsModalBody"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#btnCloseDriverPayments')?.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.style.display = 'none'; });
    return modal;
  }

  function openPaymentsModal(title, html) {
    const modal = ensurePaymentsModal();
    const titleEl = modal.querySelector('#driverPaymentsModalTitle');
    const body = modal.querySelector('#driverPaymentsModalBody');
    if (titleEl) titleEl.innerHTML = title;
    if (body) body.innerHTML = html;
    modal.style.display = 'flex';
    return { modal, body };
  }

  function syncDriverMenuVisibility() {
    const visible = isDriver();
    const paymentMenu = document.getElementById('driverPaymentsMenu');
    const driverConfig = document.getElementById('driverConfigMenu');
    if (paymentMenu) paymentMenu.style.display = visible ? 'block' : 'none';
    if (driverConfig) driverConfig.style.display = visible ? 'block' : 'none';
    const commonConfigButton = document.getElementById('btnCambiarCiudadPref');
    const commonConfig = typeof commonConfigButton?.closest === 'function' ? commonConfigButton.closest('details') : null;
    const commonDelete = document.getElementById('btnDeleteMyAccount');
    const driverPrivacy = document.getElementById('btnPrivacyPolicyDriver');
    if (commonConfig) commonConfig.style.display = visible ? 'none' : '';
    if (commonDelete && visible) commonDelete.style.display = 'none';
    if (driverPrivacy) driverPrivacy.style.display = visible ? 'none' : '';
  }

  function ensureDriverMenu() {
    const section = document.getElementById('settingsDriverSection');
    if (!section) return;
    if (!document.getElementById('driverPaymentsMenu')) {
      const payments = document.createElement('details');
      payments.id = 'driverPaymentsMenu';
      payments.style.cssText = 'margin-top:12px;background:rgba(15,23,42,.85);border:1.5px solid rgba(16,185,129,.45);border-radius:12px;padding:10px 14px;';
      payments.innerHTML = `<summary style="font-size:13px;font-weight:900;color:#10B981;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
        <span><i class="fa-solid fa-qrcode"></i> PAGOS CON QR LOCAL</span><span style="font-size:10px;color:#94A3B8;">(Desplegar)</span></summary>
        <div style="display:grid;gap:9px;margin-top:10px;">
          <div style="font-size:11px;color:#CBD5E1;line-height:1.45;padding:8px;border-radius:8px;background:#0F172A;">
            <strong>No pagas nada por usar NOTIGAS.</strong> No hay comisión, cuota mensual, saldo pendiente ni bloqueo por monto. El pago del pedido se acuerda <strong>directo con el comprador</strong> en bolivianos, únicamente por <strong>QR local (Simple / Banesco QR)</strong>. <strong>NOTIGAS no cobra, no procesa y no custodia fondos.</strong>
          </div>
          <button type="button" id="btnDriverPaymentsHistory" style="width:100%;background:#1E293B;color:#E2E8F0;border:1px solid #475569;padding:10px;border-radius:10px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-circle-info"></i> Cómo se realiza el pago</button>
        </div>`;
      section.appendChild(payments);
      payments.querySelector('#btnDriverPaymentsHistory')?.addEventListener('click', verMisPagos);
    }
    if (!document.getElementById('driverConfigMenu')) {
      const config = document.createElement('details');
      config.id = 'driverConfigMenu';
      config.style.cssText = 'margin-top:12px;background:rgba(15,23,42,.85);border:1.5px solid rgba(255,109,0,.4);border-radius:12px;padding:10px 14px;';
      config.innerHTML = `<summary style="font-size:13px;font-weight:900;color:#FF6D00;cursor:pointer;display:flex;align-items:center;justify-content:space-between;"><span><i class="fa-solid fa-gear"></i> CONFIGURACIÓN</span><span style="font-size:10px;color:#94A3B8;">(Desplegar)</span></summary>
      <div style="display:grid;gap:9px;margin-top:10px;">
        <button type="button" id="btnDriverProxyCity" style="width:100%;background:#0369A1;color:white;border:0;padding:9px;border-radius:9px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-map-location-dot"></i> Cambiar mi ciudad</button>
        <button type="button" id="btnDriverProxyRules" style="width:100%;background:#EA580C;color:white;border:0;padding:9px;border-radius:9px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-scroll"></i> Reglas y normas de uso</button>
        <button type="button" id="btnDriverPrivacyPolicy" style="width:100%;background:#334155;color:white;border:0;padding:9px;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-shield-halved"></i> Legal y privacidad</button>
        <button type="button" id="btnDriverDeleteAccount" style="width:100%;background:#991B1B;color:white;border:0;padding:9px;border-radius:8px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-trash-can"></i> Eliminar totalmente mi cuenta</button>
      </div>`;
      section.appendChild(config);
      config.querySelector('#btnDriverProxyCity')?.addEventListener('click', () => document.getElementById('btnCambiarCiudadPref')?.click());
      config.querySelector('#btnDriverProxyRules')?.addEventListener('click', () => {
        if (typeof window.abrirModalReglasApp === 'function') window.abrirModalReglasApp(); else document.getElementById('btnVerReglasApp')?.click();
      });
      config.querySelector('#btnDriverPrivacyPolicy')?.addEventListener('click', () => {
        if (typeof window.abrirModalPoliticaPrivacidad === 'function') window.abrirModalPoliticaPrivacidad(); else document.getElementById('btnPrivacyPolicyDriver')?.click();
      });
      config.querySelector('#btnDriverDeleteAccount')?.addEventListener('click', () => document.getElementById('btnDeleteMyAccount')?.click());
    }
    syncDriverMenuVisibility();
  }

  async function verMisPagos() {
    if (!window.supabaseClient) return;
    const { body } = openPaymentsModal('<i class="fa-solid fa-circle-info"></i> NOTIGAS no registra pagos', `
      <div style="padding:24px;text-align:center;color:#94A3B8;line-height:1.6;">
        <div style="font-size:15px;font-weight:800;color:#E2E8F0;margin-bottom:10px;">NOTIGAS no registra ni cobra pagos</div>
        No hay historial de vouchers ni comprobantes de comisión porque <strong>NOTIGAS no cobra nada</strong> al repartidor.
        <br><span style="font-size:11px;">El pago del pedido se acuerda directo con el comprador, en bolivianos, únicamente por <strong>QR local (Simple / Banesco QR)</strong>. El voucher se procesa localmente y no se almacena.</span>
      </div>`);
    return body;
  }

  function infoSinCobro() {
    if (!window.supabaseClient) return;
    const { body } = openPaymentsModal('<i class="fa-solid fa-circle-info"></i> No hay nada que pagar', `
      <div style="padding:20px;color:#E2E8F0;line-height:1.6;">
        <div style="background:#0F172A;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:12px;">
          <strong>NOTIGAS no cobra comisiones en Bolivia.</strong> No hay cuota mensual, ni saldo pendiente, ni ciclo de crédito, ni bloqueo por monto adeudado.
        </div>
        <div style="background:#0F172A;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:12px;">
          <strong>El pago del pedido es entre comprador y repartidor</strong>, en bolivianos. Único medio admitido:
          <ul style="margin:8px 0 0 18px;padding:0;font-size:12px;color:#CBD5E1;line-height:1.7;">
            <li>QR local <strong>Simple</strong> o QR local <strong>Banesco QR</strong></li>
          </ul>
        </div>
        <div style="background:#172554;border:1px solid #60A5FA;border-radius:12px;padding:12px;color:#DBEAFE;font-size:12px;line-height:1.55;">
          NOTIGAS actúa solo como intermediario tecnológico: no procesa, no recauda y no custodia fondos. El comprobante (voucher) del pago acordado se sube desde la sección de pedidos, solo para dar fe de la entrega.
        </div>
      </div>`);
    return body;
  }

  window.verMisPagos = verMisPagos;
  window.infoSinCobro = infoSinCobro;
  window.nuevoPago = infoSinCobro;
  window.ensureDriverPaymentsMenu = ensureDriverMenu;
  const run = () => { ensureDriverMenu(); syncDriverMenuVisibility(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true }); else run();
  document.getElementById('btnOpenUserSettings')?.addEventListener('click', () => setTimeout(run, 0));
  if (typeof AppState !== 'undefined' && typeof AppState.on === 'function') { AppState.on('userRole', run); AppState.on('appMode', run); }
})();
