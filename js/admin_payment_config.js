/* NOTIGAS - Configuración administrativa de remesas Yape a Bolivia */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  };
  const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

  const freshAdminVerifier = (typeof window.getVerifiedAdminEmail === 'function') ? window.getVerifiedAdminEmail : null;
  if (freshAdminVerifier && freshAdminVerifier.constructor?.name === 'AsyncFunction') window.verifyAdminSessionEmail = freshAdminVerifier;
  window.getVerifiedAdminEmail = function () {
    try {
      const isAdmin = typeof AppState !== 'undefined' && AppState.get('isAdmin') === true;
      if (!isAdmin) return null;
      const verified = window._verifiedAdminEmail || window._cachedAdminEmail || '';
      return verified ? String(verified).toLowerCase().trim() : null;
    } catch (_) { return null; }
  };

  function ensurePanel() {
    const list = document.getElementById('adminPremiumSubscriptionsContainer');
    if (!list || document.getElementById('adminPaymentConfigPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'adminPaymentConfigPanel';
    panel.style.cssText = 'margin-bottom:14px;padding:14px;border:1px solid #334155;border-radius:12px;background:#0F172A;color:#E2E8F0;';
    panel.innerHTML = '<div style="color:#94A3B8;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando configuración de remesas...</div>';
    list.parentNode.insertBefore(panel, list);
  }

  async function loadConfig() {
    ensurePanel();
    const panel = document.getElementById('adminPaymentConfigPanel');
    if (!panel || !window.supabaseClient) return;
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_get_payment_config');
      if (error) throw error;
      const account = digits(data?.numero_cuenta);
      const doc = digits(data?.beneficiario_documento);
      const configured = Boolean(data?.beneficiario_nombre && doc && account.length >= 6 && account.length <= 20);
      panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
          <strong><i class="fa-solid fa-earth-americas"></i> Yape Remesas → Bolivia</strong>
          <span style="font-size:11px;font-weight:800;color:${configured ? '#16A34A' : '#DC2626'};">${configured ? '✓ CONFIGURADO' : '⚠ CONFIGURACIÓN REQUERIDA'}</span>
        </div>
        <div style="font-size:11px;color:#94A3B8;margin-bottom:10px;">Único medio aceptado para comisiones: Yape, opción Remesas, destino Bolivia. Los datos sensibles se guardan en Supabase y no se escriben en el código público.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
          <label style="font-size:11px;color:#CBD5E1;">Beneficiario
            <input id="adminPaymentBeneficiary" value="${esc(data?.beneficiario_nombre || '')}" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
          <label style="font-size:11px;color:#CBD5E1;">Cuenta de destino
            <input id="adminPaymentYape" value="${esc(account)}" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Cuenta de remesa" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
          <label style="font-size:11px;color:#CBD5E1;grid-column:1/-1;">Documento de identidad del beneficiario
            <input id="adminPaymentDocument" value="${esc(data?.beneficiario_documento || '')}" inputmode="numeric" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #475569;background:#111827;color:white;">
          </label>
        </div>
        <button type="button" id="btnSaveAdminPaymentConfig" style="margin-top:10px;background:#16A34A;color:white;border:0;padding:9px 13px;border-radius:8px;font-weight:900;cursor:pointer;">Guardar datos de remesa</button>`;
      panel.querySelector('#btnSaveAdminPaymentConfig')?.addEventListener('click', saveConfig);
    } catch (err) {
      panel.innerHTML = `<div style="color:#EF4444;">No se pudo leer la configuración de remesas: ${esc(err.message || err)}</div>`;
    }
  }

  async function saveConfig() {
    const panel = document.getElementById('adminPaymentConfigPanel');
    const name = String(panel?.querySelector('#adminPaymentBeneficiary')?.value || '').trim();
    const account = digits(panel?.querySelector('#adminPaymentYape')?.value);
    const doc = digits(panel?.querySelector('#adminPaymentDocument')?.value);
    if (name.length < 3) { if (typeof showToast === 'function') showToast('Dato inválido', 'Ingresa el nombre completo del beneficiario.', 'warning', 3500); return; }
    if (!doc || doc.length < 5 || doc.length > 20) { if (typeof showToast === 'function') showToast('Dato inválido', 'Ingresa un documento de identidad válido.', 'warning', 3500); return; }
    if (!account || account.length < 6 || account.length > 20) { if (typeof showToast === 'function') showToast('Dato inválido', 'La cuenta de destino debe tener entre 6 y 20 dígitos.', 'warning', 3500); return; }
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_set_payment_config', {
        p_beneficiario_nombre: name,
        p_numero_cuenta: account,
        p_beneficiario_documento: doc
      });
      if (error) throw error;
      if (!data?.ok) throw new Error('Supabase no confirmó la actualización');
      if (typeof showToast === 'function') showToast('Remesa actualizada', 'Los datos de Yape Remesas a Bolivia quedaron configurados.', 'success', 3500);
      await loadConfig();
    } catch (err) {
      if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo guardar la configuración.', 'error', 4500);
      else alert(err.message || 'No se pudo guardar la configuración.');
    }
  }

  function wrapPaymentsRender() {
    const original = window.renderAdminPaymentsReview;
    if (typeof original !== 'function' || original.__paymentConfigWrapped) return;
    const wrapped = async function (...args) { ensurePanel(); await loadConfig(); return original.apply(this, args); };
    wrapped.__paymentConfigWrapped = true;
    window.renderAdminPaymentsReview = wrapped;
  }

  function disableLegacyPremiumAdmin() {
    if (typeof window.renderAdminPaymentsReview === 'function') window.renderAdminPremiumSubscriptions = window.renderAdminPaymentsReview;
    const retired = function () {
      if (typeof showToast === 'function') showToast('Función retirada', 'Las suscripciones PRO/VIP ya no existen. Usa el módulo Pagos.', 'info', 3000);
      if (typeof window.renderAdminPaymentsReview === 'function') return window.renderAdminPaymentsReview();
      return null;
    };
    window.aprobarSuscripcionPremiumAdmin = retired;
    window.rechazarSuscripcionPremiumAdmin = retired;
    window.revocarSuscripcionPremiumAdmin = retired;
    window.banearRepartidorDesdePremium = retired;
  }

  window.ensureAdminPaymentConfigPanel = ensurePanel;
  window.loadAdminPaymentConfig = loadConfig;
  window.wrapAdminPaymentsWithConfig = wrapPaymentsRender;
  wrapPaymentsRender();
  disableLegacyPremiumAdmin();
})();
