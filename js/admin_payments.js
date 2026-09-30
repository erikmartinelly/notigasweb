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
        else el.textContent = 'NOTIGAS no cobra ni custodia fondos. No hay comisiones, vouchers ni cobros que revisar. El pago se acuerda directamente entre comprador y repartidor por QR local (Simple / Banesco QR), destino Bolivia.';
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
          El pago se acuerda directamente entre comprador y repartidor por
          <strong>QR local (Simple / Banesco QR)</strong>, destino Bolivia.
        </div>
      </div>
      <div style="margin-top:10px;border-top:1px solid rgba(148,163,184,.25);padding-top:14px;">
        <div id="adminPublicidadPagaContainer"></div>
      </div>`;
    renderAdminPublicidadPaga();
  }

  /* ---------------------------------------------------------------------
     Revisión de ANUNCIOS PUBLICITARIOS PAGADOS.
     Cada anuncio se publica al instante al validarse su voucher por OCR; el
     admin puede revisar el comprobante y retirar lo que no corresponda.
     --------------------------------------------------------------------- */
  async function renderAdminPublicidadPaga() {
    const cont = document.getElementById('adminPublicidadPagaContainer');
    if (!cont) return;
    if (!window.supabaseClient) {
      cont.innerHTML = '<div style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">Sin conexión a Supabase.</div>';
      return;
    }
    cont.innerHTML = '<div style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">Cargando anuncios pagados...</div>';
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_anuncios_publicitarios', { p_limite: 100 });
      if (error) throw error;
      if (!data || data.ok !== true) {
        const esAdmin = data && data.codigo === 'no_admin';
        cont.innerHTML = `<div style="padding:14px;text-align:center;color:#FCA5A5;font-size:12px;">${esc((data && data.mensaje) || 'No se pudieron cargar los anuncios.')}${esAdmin ? '' : ''}</div>`;
        return;
      }
      const lista = Array.isArray(data.anuncios) ? data.anuncios : [];
      const pendientes = lista.filter(a => a.revision_pendiente).length;
      const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:13px;color:#F1F5F9;">Anuncios pagados (${lista.length})${pendientes ? ' · ' + pendientes + ' por revisar' : ''}</strong>
          <button type="button" class="btn-submit" style="width:auto;padding:6px 10px;font-size:11px;" onclick="if(window.renderAdminPublicidadPaga) window.renderAdminPublicidadPaga();"><i class="fa-solid fa-rotate"></i> Actualizar</button>
        </div>`;
      if (!lista.length) {
        cont.innerHTML = header + '<div style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">Todavía no hay anuncios pagados.</div>';
        return;
      }
      cont.innerHTML = header + lista.map(renderPubAdminCard).join('');
    } catch (e) {
      cont.innerHTML = `<div style="padding:14px;text-align:center;color:#FCA5A5;font-size:12px;">Error al cargar: ${esc(e && e.message)}</div>`;
    }
  }
  window.renderAdminPublicidadPaga = renderAdminPublicidadPaga;

  function renderPubAdminCard(a) {
    const vigente = a.estado === 'activo' && a.expira_en && new Date(a.expira_en) > new Date();
    const estado = a.estado === 'retirado' ? 'RETIRADO' : (vigente ? 'ACTIVO' : 'VENCIDO');
    const colorEstado = a.estado === 'retirado' ? '#FCA5A5' : (vigente ? '#34D399' : '#CBD5E1');
    const flags = [];
    if (a.sospechoso) flags.push('<span style="background:rgba(239,68,68,.18);color:#FCA5A5;border:1px solid rgba(239,68,68,.5);border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">SOSPECHOSO</span>');
    if (a.revision_pendiente) flags.push('<span style="background:rgba(251,191,36,.18);color:#FBBF24;border:1px solid rgba(251,191,36,.5);border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">POR REVISAR</span>');
    const exp = a.expira_en ? new Date(a.expira_en).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const voucherBtn = a.voucher_imagen_path
      ? `<button type="button" class="btn-submit" style="width:auto;padding:6px 10px;font-size:11px;" onclick="if(window.verVoucherPublicidad) window.verVoucherPublicidad('${esc(a.voucher_imagen_path)}');"><i class="fa-solid fa-image"></i> Ver comprobante</button>`
      : '<span style="opacity:.6;font-size:11px;">Sin imagen</span>';
    const retirarBtn = a.estado !== 'retirado'
      ? `<button type="button" class="btn-submit" style="width:auto;padding:6px 10px;font-size:11px;background:#7F1D1D;border:1px solid #B91C1C;" onclick="if(window.retirarAnuncioPublicidad) window.retirarAnuncioPublicidad('${esc(a.id)}');"><i class="fa-solid fa-ban"></i> Retirar</button>`
      : '';
    const motivo = a.motivo_retiro ? `<div style="opacity:.8;margin-top:3px;">Motivo: ${esc(a.motivo_retiro)}</div>` : '';

    return `<div style="background:rgba(15,23,42,.6);border:1px solid #334155;border-radius:10px;padding:10px;margin-bottom:8px;font-size:12px;color:#CBD5E1;">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">
        <strong style="color:#F1F5F9;font-size:12.5px;">${esc(a.titulo || '')}</strong>
        <span style="background:rgba(148,163,184,.12);color:${colorEstado};border:1px solid ${colorEstado}55;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">${estado}</span>
      </div>
      <div style="opacity:.85;margin-top:3px;">${esc(String(a.posicion || '').toUpperCase())} · ${esc(String(a.ciudad || '').toUpperCase())}${exp ? ' · hasta ' + esc(exp) : ''}</div>
      ${(flags.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">' + flags.join('') + '</div>' : '')}
      <div style="margin-top:6px;opacity:.9;">Bs ${esc(a.monto_esperado)} · ${esc(a.dias)} día(s) · op. ${esc(a.voucher_operacion || '—')} · ${esc(a.voucher_canal || '—')} · ${esc(a.voucher_pais || '—')}</div>
      ${a.anunciante_nombre ? `<div style="opacity:.8;margin-top:2px;">Anunciante: ${esc(a.anunciante_nombre)}${a.anunciante_contacto ? ' · ' + esc(a.anunciante_contacto) : ''}</div>` : ''}
      ${motivo}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${voucherBtn}${retirarBtn}</div>
    </div>`;
  }

  window.verVoucherPublicidad = async function (path) {
    if (!path || !window.supabaseClient) return;
    try {
      const { data, error } = await window.supabaseClient.storage.from('vouchers-publicidad').createSignedUrl(path, 300);
      if (error || !data || !data.signedUrl) throw error || new Error('No se pudo firmar la imagen.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Error', 'No se pudo abrir el comprobante: ' + (e && e.message ? e.message : ''), 'error', 4000);
    }
  };

  window.retirarAnuncioPublicidad = async function (id) {
    if (!id || !window.supabaseClient) return;
    if (typeof confirm === 'function' && !confirm('¿Retirar este anuncio pagado? Dejará de mostrarse de inmediato.')) return;
    try {
      const { data, error } = await window.supabaseClient.rpc('rpc_admin_retirar_anuncio_publicitario', { p_id: id, p_motivo: 'Retirado por el administrador' });
      if (error) throw error;
      if (!data || data.ok !== true) throw new Error((data && data.mensaje) || 'No se pudo retirar el anuncio.');
      if (typeof showToast === 'function') showToast('Anuncio retirado', 'El anuncio pagado ya no se mostrará.', 'success', 3500);
      renderAdminPublicidadPaga();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Error', (e && e.message) || 'No se pudo retirar el anuncio.', 'error', 4000);
    }
  };

  window.confirmarRecepcionPagoAdmin = accionRetirada;
  window.marcarPagoNoRecibidoAdmin = accionRetirada;
  window.banearPorFraudePagoAdmin = accionRetirada;
  window.renderAdminPaymentsReview = renderAdminPaymentsReview;
  window.renderAdminPremiumSubscriptions = renderAdminPaymentsReview;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizarEtiquetasPanelPagos, { once: true });
  else normalizarEtiquetasPanelPagos();
})();
