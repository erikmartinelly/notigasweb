/* NOTIGAS - Configuración administrativa del receptor Yape (sin secretos en Git) */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  };
  const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

  function ensurePanel() {
    const list = document.getElementById('adminPremiumSubscriptionsContainer');
    if (!list || document.getElementById('adminPaymentConfigPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'adminPaymentConfigPanel';
    panel.style.cssText = 'margin-bottom:14px;padding:14px;border:1px solid #334155;border-radius:12px;background:#0F172A;color:#E2E8F0;';
    panel.innerHTML = '<div style="color:#94A3B8;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando configuración Yape...</div>';
    list.parentNode.insertBefore(panel, list);
  }

  async function loadConfig() {
    ensurePanel();
    const panel = document.getElementById('adminPaymentConfigPanel');
    if (!panel || !window.supabaseClient) return;
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_get_payment_config');
      if (error) throw error;
      const yape = digits(data?.numero_cuenta);
      const configured = Boolean(data?.beneficiario_nombre && /^9[0-9]{8}$/.test(yape));
      panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
          <strong><i class="fa-solid fa-wallet"></i> Receptor de pagos Yape</strong>
          <span style="font-size:11px;font-weight:800;color:${configured ? '#16A34A' : '#DC2626'};">${configured ? '✓ CONFIGURADO' : '⚠ CONFIGURACIÓN REQUERIDA'}</span>
        </div>
        <div style="font-size:11px;color:#94A3B8;margin-bottom:10px;">Estos datos se guardan únicamente en Supabase. No se escriben en el código público de GitHub.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
          <label style="font-size:11px;color:#CBD5E1;">Beneficiario
            <input id="adminPaymentBeneficiary" value="${esc(data?.beneficiario_nombre || '')}" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
          <label style="font-size:11px;color:#CBD5E1;">Número Yape
            <input id="adminPaymentYape" value="${esc(yape)}" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="9XXXXXXXX" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
          <label style="font-size:11px;color:#CBD5E1;grid-column:1/-1;">Documento del beneficiario (opcional)
            <input id="adminPaymentDocument" value="${esc(data?.beneficiario_documento || '')}" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
        </div>
        <button type="button" id="btnSaveAdminPaymentConfig" style="margin-top:10px;background:#16A34A;color:white;border:0;padding:9px 13px;border-radius:8px;font-weight:900;cursor:pointer;">Guardar receptor Yape</button>`;

      panel.querySelector('#btnSaveAdminPaymentConfig')?.addEventListener('click', saveConfig);
    } catch (err) {
      panel.innerHTML = `<div style="color:#EF4444;">No se pudo leer la configuración Yape: ${esc(err.message || err)}</div>`;
    }
  }

  async function saveConfig() {
    const panel = document.getElementById('adminPaymentConfigPanel');
    const name = String(panel?.querySelector('#adminPaymentBeneficiary')?.value || '').trim();
    const yape = digits(panel?.querySelector('#adminPaymentYape')?.value);
    const doc = String(panel?.querySelector('#adminPaymentDocument')?.value || '').trim() || null;
    if (name.length < 3) {
      if (typeof showToast === 'function') showToast('Dato inválido', 'Ingresa el nombre completo del beneficiario.', 'warning', 3500);
      return;
    }
    if (!/^9[0-9]{8}$/.test(yape)) {
      if (typeof showToast === 'function') showToast('Dato inválido', 'El Yape receptor debe tener 9 dígitos y comenzar con 9.', 'warning', 3500);
      return;
    }
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_set_payment_config', {
        p_beneficiario_nombre: name,
        p_numero_cuenta: yape,
        p_beneficiario_documento: doc
      });
      if (error) throw error;
      if (!data?.ok) throw new Error('Supabase no confirmó la actualización');
      if (typeof showToast === 'function') showToast('Yape actualizado', 'El receptor de pagos quedó configurado.', 'success', 3500);
      await loadConfig();
    } catch (err) {
      if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo guardar el receptor Yape.', 'error', 4500);
      else alert(err.message || 'No se pudo guardar el receptor Yape.');
    }
  }

  function wrapPaymentsRender() {
    const original = window.renderAdminPaymentsReview;
    if (typeof original !== 'function' || original.__paymentConfigWrapped) return;
    const wrapped = async function (...args) {
      ensurePanel();
      await loadConfig();
      return original.apply(this, args);
    };
    wrapped.__paymentConfigWrapped = true;
    window.renderAdminPaymentsReview = wrapped;
  }

  window.ensureAdminPaymentConfigPanel = ensurePanel;
  window.loadAdminPaymentConfig = loadConfig;
  window.wrapAdminPaymentsWithConfig = wrapPaymentsRender;
  wrapPaymentsRender();
})();
