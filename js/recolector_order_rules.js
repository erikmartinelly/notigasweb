/* ==========================================================================
   NOTIGAS - REGLAS OPERATIVAS DEL RECOLECTOR (BOLIVIA)
   - Sin suscripción, VIP, ventajas temporales ni comisión alguna.
   - NOTIGAS no cobra, no procesa fondos y no aplica bloqueo por monto.
   - Los pagos se acuerdan directo entre comprador y recolector,
     en bolivianos, por QR local (Simple / Banesco QR) u otro medio local.
   - Liberar un pedido no entregado no genera ningún cobro.
   - "No entregué" registra la declaración; si el comprador confirma recepción,
     la confirmación del comprador prevalece y la entrega se contabiliza.
   ========================================================================== */
(function () {
  'use strict';

  let notificationChannel = null;
  let pollTimer = null;
  let observerInstalled = false;
  let visibilityListenerInstalled = false;

  function toast(title, message, type = 'info', duration = 4500) {
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, type, duration);
    } else {
      console.log(`[${title}] ${message}`);
    }
  }

  async function liberarPedidoRecolector(orderId) {
    if (!window.supabaseClient || !orderId) return;

    const msg = 'Este pedido ya fue tomado por ti. Si lo liberas volverá a quedar disponible para otros recolectores. Como no fue entregado, no genera ningún cobro.';

    const execute = async () => {
      if (typeof window.showLoadingOverlay === 'function') {
        window.showLoadingOverlay('Liberando pedido...');
      }

      try {
        const { data, error } = await window.supabaseClient.rpc('rpc_driver_release_order', {
          p_order_id: orderId,
          p_motivo: 'Recolector liberó un pedido no entregado'
        });

        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();

        if (error) {
          console.error('Error liberando pedido:', error);
          toast('Error', error.message || 'No se pudo liberar el pedido.', 'error', 4500);
          return;
        }

        toast(
          'Pedido liberado',
          data?.message || 'El pedido volvió a estar disponible. No se aplicó ningún cobro.',
          'info',
          4500
        );

        if (typeof window.renderRecolectorOrdersList === 'function') window.renderRecolectorOrdersList();
        if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
        if (typeof window.map !== 'undefined' && window.map?.closePopup) window.map.closePopup();
      } catch (err) {
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        console.error('Error inesperado liberando pedido:', err);
        toast('Error', 'No se pudo liberar el pedido.', 'error', 4500);
      }
    };

    if (typeof window.showConfirmModal === 'function') {
      window.showConfirmModal(
        '↩️',
        'Liberar pedido tomado',
        msg,
        'Liberar pedido',
        execute,
        'Mantener pedido'
      );
    } else if (window.confirm(`${msg}\n\n¿Deseas continuar?`)) {
      execute();
    }
  }

  async function reportarNoEntregadoPedido(orderId) {
    if (!window.supabaseClient || !orderId) return;

    const msg = 'Registra esta opción solo si finalmente no realizaste la entrega. El pedido no se contabilizará por esta declaración. Si el comprador confirma que sí recibió el pedido, su confirmación tendrá prioridad y la entrega entrará en tu contabilidad.';

    const execute = async () => {
      if (typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay('Registrando resultado...');
      try {
        const { data, error } = await window.supabaseClient.rpc('rpc_driver_report_not_delivered', {
          p_order_id: orderId
        });
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        if (error) {
          toast('Error', error.message || 'No se pudo registrar que el pedido no fue entregado.', 'error', 4500);
          return;
        }
        toast('Resultado registrado', data?.message || 'Se registró que no realizaste la entrega.', 'info', 5000);
        if (typeof window.renderRecolectorOrdersList === 'function') window.renderRecolectorOrdersList();
        if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
      } catch (err) {
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        toast('Error', 'No se pudo registrar el resultado de la entrega.', 'error', 4500);
      }
    };

    if (typeof window.showConfirmModal === 'function') {
      window.showConfirmModal('📦', 'No entregué el pedido', msg, 'Confirmar: no entregué', execute, 'Volver');
    } else if (window.confirm(`${msg}\n\n¿Confirmas que no entregaste el pedido?`)) {
      execute();
    }
  }

  function ensureNotDeliveredButtons(root = document) {
    const deliveredButtons = root.querySelectorAll?.('button[data-action="confirmarEntregaPedido"]') || [];
    deliveredButtons.forEach((deliveredBtn) => {
      const orderId = deliveredBtn.getAttribute('data-id');
      if (!orderId) return;

      const parent = deliveredBtn.parentElement;
      if (!parent) return;
      const escapedId = window.CSS?.escape ? CSS.escape(orderId) : orderId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (parent.querySelector(`button[data-not-delivered-for="${escapedId}"]`)) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-not-delivered-for', orderId);
      btn.className = 'btn-action btn-recolector-not-delivered';
      btn.style.cssText = 'background:#475569;color:#F8FAFC;border:1px solid #64748B;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;';
      btn.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> No entregué';
      btn.title = 'Registrar que finalmente no realizaste esta entrega';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        reportarNoEntregadoPedido(orderId);
      });
      parent.appendChild(btn);
    });
  }

  function normalizeLegacyFinancialCopy(root = document) {
    const scope = root && root.nodeType ? root : document;
    const legacyRx = /Corte\s+Dom|Corte\s+Semanal|Baneo\s+Lun|Baneo\s+Semanal|Comisi[oó]n\s+fija|Ciclo\s+fijo|L[ií]mite\s+de\s+Cr[eé]dito|[Rr]emesa|[Pp]edidos?\s+gratis/i;

    const buttons = scope.querySelectorAll?.('button') || [];
    buttons.forEach((button) => {
      if (legacyRx.test(String(button.textContent || ''))) {
        button.style.display = 'none';
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
      }
    });

    const doc = scope.ownerDocument || document;
    const startNode = scope === document ? document.body : scope;
    if (startNode && typeof doc.createTreeWalker === 'function' && typeof NodeFilter !== 'undefined') {
      const walker = doc.createTreeWalker(startNode, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach((node) => {
        let text = node.nodeValue || '';
        if (!text) return;
        const original = text;
        text = text
          .replace(/Comisi[oó]n\s+fija\s+de\s+S\/\s*1\.00\s+por\s+bal[oó]n\s+entregado/gi, 'Sin comisión por balón entregado')
          .replace(/Comisi[oó]n\s+de\s+S\/\s*0\.\d{2}\s+por\s+bal[oó]n(\s+entregado|\s+confirmado)?/gi, 'Sin comisión por balón entregado')
          .replace(/l[ií]mite\s+de\s+cr[eé]dito\s+de\s+S\/\s*50\.00/gi, 'acceso gratuito sin cobros')
          .replace(/ciclo\s+fijo\s+de\s+cr[eé]dito\s+de\s+250\s+balones\s*\(?S\/\s*50\)?/gi, 'acceso gratuito sin cobros')
          .replace(/Ciclo\s+fijo:?\s*250\s+balones\s*=\s*S\/\s*50/gi, 'Sin cobros')
          .replace(/corte\s+semanal\s+los\s+domingos\s+11:59\s*PM\s+y\s+baneo\s+definitivo\s+por\s+hardware\s+en\s+caso\s+de\s+incumplimiento/gi, 'sin cortes por deuda ni baneos por monto')
          .replace(/Los\s+primeros\s+20\s+pedidos\s+confirmados\s+no\s+generan\s+comisi[oó]n\.\s*Despu[eé]s:\s*/gi, '')
          .replace(/primeros\s+100\s+pedidos\s+confirmados\s+son\s+(?:gratis|gratuitos|tot gratuitamente\s+gratis)[^.]*\./gi, '')
          .replace(/cr[eé]dito\s+hasta\s+100\s+unidades\s+entregadas/gi, 'acceso gratuito');
        if (text !== original) node.nodeValue = text;
      });
    }

    const deepestSummary = Array.from(scope.querySelectorAll?.('div') || []).filter((el) => {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/Comisi[oó]n fija:.*S\/\s*1\.00.*S\/\s*50\.00.*Corte:.*Baneo:/i.test(text)) return false;
      return !Array.from(el.children || []).some((child) => /Comisi[oó]n fija:.*S\/\s*1\.00.*S\/\s*50\.00.*Corte:.*Baneo:/i.test(String(child.textContent || '')));
    });
    deepestSummary.forEach((el) => {
      el.textContent = 'Sin comisión • Sin ciclo de crédito • NOTIGAS no cobra ni procesa fondos';
    });
  }

  function normalizeLegacyOrderBanners(root = document) {
    const banners = root.querySelectorAll?.('.recolector-plan-banner') || [];
    banners.forEach((banner) => {
      banner.innerHTML = '<strong style="color:#FFFFFF;">🇧🇴 Bolivia · Acceso gratuito sin comisión</strong> · NOTIGAS no cobra por pedido ni por generar o escanear un QR local.';
    });
  }

  async function syncRecolectorCreditCard() {
    if (!window.supabaseClient) return;
    const card = document.querySelector('.recolector-financial-card');
    if (!card) return;

    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;

      const { data: recolector, error } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('estado_servicio,bloqueado')
        .eq('user_id', uid)
        .maybeSingle();
      if (error || !recolector) return;

      const suspended = Boolean(recolector.bloqueado || recolector.estado_servicio === 'baneado');

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:800;color:#E2E8F0;">🇧🇴 Acceso gratuito</span>
          <span style="font-size:11px;font-weight:900;color:${suspended ? '#EF4444' : '#10B981'};">${suspended ? 'Suspendido' : 'Sin cobros'}</span>
        </div>
        <div style="background:#0F172A;border-radius:6px;height:8px;width:100%;overflow:hidden;border:1px solid #334155;"><div style="background:${suspended ? '#EF4444' : '#10B981'};height:100%;width:100%;"></div></div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:9.5px;color:#94A3B8;">
          <span>Comisión por pedido: Bs 0,00</span>
          <span>NOTIGAS no procesa fondos</span>
        </div>`;
    } catch (err) {
      console.warn('No se pudo sincronizar el estado del recolector:', err);
    }
  }

  async function confirmarEntregaPedidoActual(orderId) {
    if (!window.supabaseClient || !orderId) return;

    const execute = async () => {
      if (typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay('Confirmando entrega...');
      try {
        const { data, error } = await window.supabaseClient.rpc('rpc_driver_confirm_delivery', { p_order_id: orderId });
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        if (error) {
          toast('Error', error.message || 'No se pudo confirmar la entrega.', 'error', 5000);
          return;
        }

        const suspended = Boolean(data?.suspendido ?? false);

        if (suspended) {
          toast('⚠️ Cuenta suspendida', 'Entrega registrada. Tu cuenta está suspendida por una sanción administrativa.', 'warning', 8000);
        } else {
          toast('¡Entrega confirmada! 🎉', 'Entrega registrada. Sin comisión y sin saldo pendiente. El pago se coordina directo con el comprador (QR local Simple o Banesco QR).', 'success', 5000);
        }

        if (typeof window.renderRecolectorOrdersList === 'function') await window.renderRecolectorOrdersList();
        if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
        await syncRecolectorCreditCard();
      } catch (err) {
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        toast('Error', err.message || 'No se pudo confirmar la entrega.', 'error', 5000);
      }
    };

    const message = '¿El comprador ya recibió su pedido? NOTIGAS no cobra comisión: confirma la entrega para que el comprador pueda coordinarse contigo.';
    if (typeof window.showConfirmModal === 'function') {
      window.showConfirmModal('🏁', 'Confirmar entrega', message, 'Sí, ya entregué el pedido', execute, 'Volver');
    } else if (window.confirm(message)) {
      execute();
    }
  }

  function installOrderRuntimePatch() {
    window.confirmarEntregaPedido = confirmarEntregaPedidoActual;

    const original = window.renderRecolectorOrdersList;
    if (typeof original === 'function' && !original.__notigasCreditContractPatched) {
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        normalizeLegacyFinancialCopy(document);
        normalizeLegacyOrderBanners(document);
        await syncRecolectorCreditCard();
        return result;
      };
      wrapped.__notigasCreditContractPatched = true;
      wrapped.__notigasOriginal = original;
      window.renderRecolectorOrdersList = wrapped;
    }
  }

  function observeOrderButtons() {
    ensureNotDeliveredButtons(document);
    normalizeLegacyFinancialCopy(document);
    normalizeLegacyOrderBanners(document);
    if (observerInstalled || !document.body || typeof MutationObserver !== 'function') return;
    observerInstalled = true;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (typeof Element !== 'undefined' && !(node instanceof Element)) return;
          normalizeLegacyFinancialCopy(node);
          normalizeLegacyOrderBanners(node);
          if (node.matches?.('button[data-action="confirmarEntregaPedido"]')) {
            ensureNotDeliveredButtons(node.parentElement || document);
          } else if (node.querySelector?.('button[data-action="confirmarEntregaPedido"]')) {
            ensureNotDeliveredButtons(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function showUnreadRecolectorNotifications() {
    if (!window.supabaseClient) return;
    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;

      const { data, error } = await window.supabaseClient
        .from('notificaciones_repartidor')
        .select('id,tipo,titulo,mensaje,created_at')
        .eq('user_id', uid)
        .eq('leida', false)
        .order('created_at', { ascending: true })
        .limit(10);
      if (error || !data?.length) return;

      for (const item of data) {
        const isConflict = item.tipo === 'comprador_confirma_contradiccion';
        toast(
          isConflict ? '⚠️ Confirmación del comprador' : (item.titulo || 'Entrega confirmada'),
          item.mensaje || 'El comprador confirmó la recepción del pedido.',
          isConflict ? 'warning' : 'success',
          isConflict ? 8000 : 5500
        );
      }

      const ids = data.map((item) => item.id).filter(Boolean);
      if (ids.length) {
        await window.supabaseClient
          .from('notificaciones_repartidor')
          .update({ leida: true, read_at: new Date().toISOString() })
          .in('id', ids)
          .eq('user_id', uid);
      }
    } catch (err) {
      console.warn('No se pudieron cargar notificaciones del recolector:', err);
    }
  }

  async function startNotifications() {
    if (!window.supabaseClient) return;

    await showUnreadRecolectorNotifications();

    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (uid && typeof window.supabaseClient.channel === 'function' && !notificationChannel) {
        notificationChannel = window.supabaseClient
          .channel(`recolector-order-notifications-${uid}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notificaciones_repartidor', filter: `user_id=eq.${uid}` },
            () => showUnreadRecolectorNotifications()
          )
          .subscribe();
      }
    } catch (_) {}

    if (!pollTimer) {
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') showUnreadRecolectorNotifications();
      }, 30000);
    }

    if (!visibilityListenerInstalled) {
      visibilityListenerInstalled = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') showUnreadRecolectorNotifications();
      });
    }
  }

  function normalizeLegacyPlanCopy() {
    document.querySelectorAll('p,strong,button').forEach((el) => {
      const text = String(el.textContent || '').trim();
      if (!text) return;

      if (el.tagName === 'BUTTON' && /plan\s+pro|premium|ventaja/i.test(text)) {
        el.style.display = 'none';
        return;
      }

      if (/Acceso Gratuito.*Plan PRO/i.test(text)) {
        el.textContent = '1. Acceso sin suscripción y sin comisión por entrega';
        return;
      }

      if (/suscribirse.*Plan PRO|3 minutos.*pedidos|1 minuto.*clientes/i.test(text)) {
        el.textContent = 'NOTIGAS no cobra suscripción ni comisión. Los recolectores operan sin costo, sin saldos pendientes y sin bloqueos por monto.';
      }
    });
    normalizeLegacyFinancialCopy(document);
  }

  function normalizeRecolectorRegistrationOffer() {
    const inputTipo = document.getElementById('inputRecolectorPlanTipo');
    if (inputTipo) inputTipo.value = 'sin_comision';

    const originalSelector = window._notigasOriginalSeleccionarPlanRegistroChofer || window.seleccionarPlanRegistroChofer;
    if (!window._notigasOriginalSeleccionarPlanRegistroChofer && typeof originalSelector === 'function') {
      window._notigasOriginalSeleccionarPlanRegistroChofer = originalSelector;
      window.seleccionarPlanRegistroChofer = function () {
        return window._notigasOriginalSeleccionarPlanRegistroChofer('sin_comision');
      };
    }

    try {
      if (typeof window._notigasOriginalSeleccionarPlanRegistroChofer === 'function') {
        window._notigasOriginalSeleccionarPlanRegistroChofer('sin_comision');
      }
    } catch (_) {}

    const grid = document.getElementById('recolectorPlanCardsGrid');
    if (grid) {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = `
        <div style="border:1.5px solid #10B981;background:linear-gradient(135deg,rgba(16,185,129,.14),rgba(15,23,42,.95));border-radius:12px;padding:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
            <strong style="color:#FFFFFF;font-size:14px;">Acceso gratuito NOTIGAS Bolivia</strong>
            <span style="background:#10B981;color:#052E16;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;white-space:nowrap;">SIN COMISIÓN</span>
          </div>
          <div style="font-size:11.5px;color:#D1FAE5;line-height:1.55;">
            Operas <strong>sin costo y sin comisión</strong>: no hay cuota mensual, ni saldo pendiente, ni ciclo de crédito, ni bloqueo por monto. El pago se acuerda directo con el comprador en <strong>bolivianos (Bs)</strong>, únicamente por <strong>QR local (Simple / Banesco QR)</strong>.
          </div>
        </div>`;
    }

    for (const id of ['recolectorPremiumProContent', 'recolectorPremiumPaymentSection', 'recolectorPremiumStatusBadge', 'recolectorPremiumActiveAlert', 'recolectorPremiumPendingAlert', 'cardPlanRecolectorPro', 'btnCambiarAProDesdeGratuito']) {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    }

    const creditContent = document.getElementById('recolectorPremiumGratuitoContent');
    if (creditContent) {
      creditContent.style.display = 'block';
      creditContent.innerHTML = '<p style="margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;"><strong>Sin comisión:</strong> no pagas nada por usar NOTIGAS. El pago con el comprador se realiza en bolivianos, únicamente por QR local (Simple / Banesco QR).</p>';
    }

    const btnText = document.getElementById('btnRecolectorSubmitText');
    if (btnText) btnText.textContent = 'Registrar y activar mi cuenta de recolector';

    normalizeLegacyPlanCopy();
  }

  function install() {
    window.liberarPedidoRecolector = liberarPedidoRecolector;
    window.reportarNoEntregadoPedido = reportarNoEntregadoPedido;
    installOrderRuntimePatch();
    normalizeRecolectorRegistrationOffer();
    observeOrderButtons();
    startNotifications();
    window.setTimeout(() => {
      installOrderRuntimePatch();
      normalizeLegacyFinancialCopy(document);
      normalizeLegacyOrderBanners(document);
      syncRecolectorCreditCard();
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
