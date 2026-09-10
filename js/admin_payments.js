/* ==========================================================================
   NOTIGAS - PANEL ADMINISTRATIVO DE PAGOS
   Flujo:
   OCR automático -> pendiente_verificacion_recepcion -> verificación humana
   -> confirmado / no_recibido / fraude_confirmado.
   ========================================================================== */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const fmtMoney = (value, currency) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${currency} ${n.toFixed(2)}`;
  };

  const fmtDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('es-PE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return String(value);
    }
  };

  const boolBadge = (value, okText, failText, unknownText = 'No disponible') => {
    if (value === true) return `<span style="color:#16A34A;font-weight:800;">✓ ${esc(okText)}</span>`;
    if (value === false) return `<span style="color:#DC2626;font-weight:800;">✕ ${esc(failText)}</span>`;
    return `<span style="color:#94A3B8;">• ${esc(unknownText)}</span>`;
  };

  function estadoBadge(estado) {
    const e = String(estado || '').toLowerCase();
    const map = {
      pendiente_verificacion_recepcion: ['#F59E0B', 'Validado automáticamente · verificar recepción'],
      confirmado: ['#16A34A', 'Pago recibido · confirmado'],
      no_recibido: ['#64748B', 'Dinero no recibido'],
      fraude_confirmado: ['#DC2626', 'Fraude confirmado · baneado'],
      ocr_no_valido: ['#DC2626', 'OCR no válido'],
      generado: ['#2563EB', 'Cobro generado'],
      pendiente: ['#F59E0B', 'Pendiente']
    };
    const [color, label] = map[e] || ['#64748B', e || 'Sin estado'];
    return `<span style="display:inline-block;border:1px solid ${color};color:${color};padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;">${esc(label)}</span>`;
  }

  function normalizarEtiquetasPanelPagos() {
    const buttons = Array.from(document.querySelectorAll('.modal-tab-btn'));
    if (buttons[3]) {
      buttons[3].innerHTML = '<i class="fa-solid fa-money-check-dollar"></i> Pagos';
      buttons[3].title = 'Pagos y verificación de remesas';
    }

    const panes = Array.from(document.querySelectorAll('.modal-tab-pane'));
    const pane = panes[3];
    if (pane) {
      pane.querySelectorAll('h2,h3,h4,p').forEach(el => {
        const txt = String(el.textContent || '').trim();
        if (/premium|vip|suscripci[oó]n/i.test(txt)) {
          if (/h2|h3|h4/i.test(el.tagName)) el.textContent = 'Pagos de repartidores';
          else el.textContent = 'Comprobantes validados automáticamente pendientes de verificar la recepción efectiva del dinero.';
        }
      });
    }
  }

  async function llamarRevision(pagoId, action, observacion) {
    if (!window.supabaseClient) throw new Error('Sin conexión con Supabase');
    const { data, error } = await window.supabaseClient.rpc('rpc_admin_review_commission_voucher', {
      p_pago_id: pagoId,
      p_action: action,
      p_observacion: observacion || null
    });
    if (error) throw error;
    return data;
  }

  async function confirmarRecepcionPagoAdmin(pagoId) {
    const ejecutar = async () => {
      try {
        if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Confirmando recepción del dinero...');
        const data = await llamarRevision(pagoId, 'confirmar_recepcion', 'Dinero recibido y verificado por administración');
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (typeof showToast === 'function') {
          showToast('Pago confirmado', data?.mensaje || 'Recepción confirmada y cuenta regularizada.', 'success', 4500);
        }
        await renderAdminPaymentsReview();
      } catch (err) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        console.error('Error confirmando recepción:', err);
        if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo confirmar la recepción.', 'error', 4500);
        else alert(err.message || 'No se pudo confirmar la recepción.');
      }
    };

    if (typeof showConfirmModal === 'function') {
      showConfirmModal(
        '💰',
        'Confirmar recepción',
        'Confirma solo si verificaste que el dinero llegó efectivamente a Yape Bolivia. La cuenta se reactivará automáticamente si estaba suspendida únicamente por deuda.',
        'Confirmar recepción',
        ejecutar
      );
    } else if (confirm('¿Confirmas que el dinero llegó efectivamente?')) {
      ejecutar();
    }
  }

  async function marcarPagoNoRecibidoAdmin(pagoId) {
    const ejecutar = async () => {
      try {
        if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Registrando verificación...');
        const data = await llamarRevision(pagoId, 'no_recibido', 'No se verificó la llegada efectiva del dinero');
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (typeof showToast === 'function') showToast('No recibido', data?.mensaje || 'Pago marcado como no recibido.', 'warning', 4000);
        await renderAdminPaymentsReview();
      } catch (err) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        console.error('Error marcando pago no recibido:', err);
        if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo actualizar el pago.', 'error', 4500);
      }
    };

    if (typeof showConfirmModal === 'function') {
      showConfirmModal('⚠️', 'Dinero no recibido', 'Marca esta opción cuando el voucher pasó el OCR pero la remesa no aparece en la cuenta receptora.', 'Marcar no recibido', ejecutar);
    } else if (confirm('¿Marcar este pago como no recibido?')) {
      ejecutar();
    }
  }

  async function banearPorFraudePagoAdmin(pagoId) {
    const ejecutar = async () => {
      try {
        if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Aplicando baneo por fraude...');
        const data = await llamarRevision(pagoId, 'fraude', 'Comprobante de remesa falsificado o manipulado');
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (typeof showToast === 'function') showToast('Repartidor baneado', data?.mensaje || 'Baneo permanente aplicado por fraude.', 'error', 5500);
        await renderAdminPaymentsReview();
      } catch (err) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        console.error('Error aplicando baneo por fraude:', err);
        if (typeof showToast === 'function') showToast('Error', err.message || 'No se pudo aplicar el baneo.', 'error', 4500);
      }
    };

    const texto = 'Esta acción marcará el pago como fraude y bloqueará la cuenta, DNI y dispositivos asociados. Un pago posterior no levantará este baneo.';
    if (typeof showConfirmModal === 'function') {
      showConfirmModal('⛔', 'Banear por comprobante falsificado', texto, 'Banear por fraude', ejecutar);
    } else if (confirm(texto)) {
      ejecutar();
    }
  }

  function accionesPago(row) {
    const estado = String(row.estado || '').toLowerCase();
    const id = esc(row.pago_id);

    if (estado === 'pendiente_verificacion_recepcion') {
      return `
        <div style="display:grid;gap:6px;min-width:190px;">
          <button type="button" onclick="window.confirmarRecepcionPagoAdmin('${id}')" style="background:#16A34A;color:white;border:0;padding:8px 10px;border-radius:8px;font-weight:800;cursor:pointer;">✓ Confirmar recepción</button>
          <button type="button" onclick="window.marcarPagoNoRecibidoAdmin('${id}')" style="background:#475569;color:white;border:0;padding:8px 10px;border-radius:8px;font-weight:700;cursor:pointer;">No recibido</button>
          <button type="button" onclick="window.banearPorFraudePagoAdmin('${id}')" style="background:#DC2626;color:white;border:0;padding:8px 10px;border-radius:8px;font-weight:800;cursor:pointer;">⛔ Banear por fraude</button>
        </div>`;
    }

    if (estado === 'ocr_no_valido' || estado === 'no_recibido') {
      return `<button type="button" onclick="window.banearPorFraudePagoAdmin('${id}')" style="background:#DC2626;color:white;border:0;padding:8px 10px;border-radius:8px;font-weight:800;cursor:pointer;">⛔ Banear por fraude</button>`;
    }

    return '<span style="color:#94A3B8;font-size:12px;">Sin acciones pendientes</span>';
  }

  async function renderAdminPaymentsReview() {
    normalizarEtiquetasPanelPagos();
    const container = document.getElementById('adminPremiumSubscriptionsContainer');
    if (!container || !window.supabaseClient) return;

    container.innerHTML = '<div style="color:#94A3B8;text-align:center;padding:24px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando pagos...</div>';

    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_list_commission_vouchers');
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];

      const pending = rows.filter(r => r.estado === 'pendiente_verificacion_recepcion').length;
      const confirmed = rows.filter(r => r.estado === 'confirmado').length;
      const fraud = rows.filter(r => r.estado === 'fraude_confirmado').length;

      let html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;">
          <div style="background:#1E293B;border:1px solid #F59E0B;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#CBD5E1;">Por verificar recepción</div><div style="font-size:24px;font-weight:900;color:#F59E0B;">${pending}</div></div>
          <div style="background:#1E293B;border:1px solid #16A34A;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#CBD5E1;">Confirmados</div><div style="font-size:24px;font-weight:900;color:#16A34A;">${confirmed}</div></div>
          <div style="background:#1E293B;border:1px solid #DC2626;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#CBD5E1;">Fraudes baneados</div><div style="font-size:24px;font-weight:900;color:#DC2626;">${fraud}</div></div>
        </div>`;

      if (!rows.length) {
        html += '<div style="padding:28px;text-align:center;color:#94A3B8;">No hay pagos registrados.</div>';
        container.innerHTML = html;
        return;
      }

      html += `
        <div style="overflow:auto;border:1px solid #334155;border-radius:10px;">
          <table style="width:100%;border-collapse:collapse;min-width:1250px;font-size:12px;">
            <thead style="background:#0F172A;color:#CBD5E1;text-align:left;">
              <tr>
                <th style="padding:10px;">Estado</th>
                <th style="padding:10px;">Repartidor</th>
                <th style="padding:10px;">Operación</th>
                <th style="padding:10px;">Importes</th>
                <th style="padding:10px;">Fecha / hora</th>
                <th style="padding:10px;">Destinatario</th>
                <th style="padding:10px;">Remitente / identidad</th>
                <th style="padding:10px;">Validación automática</th>
                <th style="padding:10px;">Acciones</th>
              </tr>
            </thead><tbody>`;

      for (const row of rows) {
        const validation = [
          boolBadge(row.ocr_valido, 'OCR', 'OCR'),
          boolBadge(row.monto_valido, 'Monto', 'Monto'),
          boolBadge(row.fecha_valida, 'Fecha', 'Fecha'),
          boolBadge(row.transaccion_unica, 'Operación única', 'Operación repetida'),
          boolBadge(row.destinatario_nombre_coincide, 'Destinatario', 'Destinatario distinto'),
          boolBadge(row.destinatario_yape_coincide, 'Yape destino', 'Yape destino distinto')
        ].join('<br>');

        const enviadoPen = row.monto_enviado_pen ?? row.monto;
        html += `
          <tr style="border-top:1px solid #334155;vertical-align:top;color:#E2E8F0;">
            <td style="padding:10px;">${estadoBadge(row.estado)}<div style="margin-top:6px;color:#94A3B8;font-size:10px;">Auto: ${fmtDate(row.validado_automaticamente_at)}</div></td>
            <td style="padding:10px;"><strong>${esc(row.driver_nombre)}</strong><br><span style="color:#94A3B8;">DNI ${esc(row.driver_dni || '—')} · ${esc(row.driver_placa || '—')}</span><br><span style="color:#94A3B8;">${esc(row.driver_telefono || '')}</span></td>
            <td style="padding:10px;"><strong>${esc(row.numero_transaccion || '—')}</strong><br><span style="color:#94A3B8;">${esc(row.metodo || 'remesa')}</span></td>
            <td style="padding:10px;"><strong>${fmtMoney(enviadoPen, 'S/')}</strong><br><span style="color:#94A3B8;">Recibe: ${fmtMoney(row.monto_recibido_bob, 'Bs')}</span></td>
            <td style="padding:10px;">${fmtDate(row.pago_fecha)}<br><span style="color:#94A3B8;">Cobro generado: ${fmtDate(row.cobro_generado_at)}</span></td>
            <td style="padding:10px;"><strong>${esc(row.destinatario_nombre || '—')}</strong><br><span style="color:#94A3B8;">Yape Bolivia: ${esc(row.destinatario_yape || '—')}</span></td>
            <td style="padding:10px;"><strong>${esc(row.remitente_nombre || '—')}</strong><br><span style="color:#94A3B8;">DNI: ${esc(row.remitente_dni || '—')} · Yape: ${esc(row.remitente_yape || '—')}</span><br><span style="color:#94A3B8;">Dispositivo: ${esc(row.device_id || '—')}</span></td>
            <td style="padding:10px;line-height:1.55;">${validation}${row.ocr_confianza != null ? `<br><span style="color:#94A3B8;">Confianza OCR: ${Number(row.ocr_confianza).toFixed(0)}%</span>` : ''}</td>
            <td style="padding:10px;">${accionesPago(row)}</td>
          </tr>`;
      }

      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      console.error('Error cargando pagos de administración:', err);
      container.innerHTML = `<div style="color:#EF4444;padding:20px;text-align:center;">Error cargando pagos: ${esc(err.message || err)}</div>`;
    }
  }

  window.renderAdminPaymentsReview = renderAdminPaymentsReview;
  window.renderAdminPremiumSubscriptions = renderAdminPaymentsReview;
  window.confirmarRecepcionPagoAdmin = confirmarRecepcionPagoAdmin;
  window.marcarPagoNoRecibidoAdmin = marcarPagoNoRecibidoAdmin;
  window.banearPorFraudePagoAdmin = banearPorFraudePagoAdmin;

  // Compatibilidad con el panel heredado: acepta "pagos" como nombre de pestaña y
  // fuerza el render nuevo después de que admin.js cambie de tab.
  const legacySwitchModalTab = window.switchModalTab;
  if (typeof legacySwitchModalTab === 'function' && !window._notigasPaymentsSwitchWrapped) {
    window._notigasPaymentsSwitchWrapped = true;
    window.switchModalTab = function(target) {
      const normalized = (typeof target === 'string' && target.toLowerCase() === 'pagos') ? 3 : target;
      const result = legacySwitchModalTab(normalized);
      const idx = (typeof normalized === 'number') ? normalized : parseInt(normalized, 10);
      if (idx === 3) {
        Promise.resolve().then(() => renderAdminPaymentsReview());
      }
      return result;
    };
  }

  normalizarEtiquetasPanelPagos();
})();