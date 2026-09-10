/* ==========================================================================
   NOTIGAS - REGLAS OPERATIVAS DEL REPARTIDOR (PERÚ)
   - Sin suscripción, VIP ni ventajas temporales.
   - Promoción: primeros 50 pedidos confirmados sin comisión.
   - Después: S/ 0.20 por pedido. Crédito progresivo S/ 20 -> S/ 50 -> S/ 100.
   - Liberar un pedido no entregado no genera comisión ni modifica el saldo.
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

  async function liberarPedidoRepartidor(orderId) {
    if (!window.supabaseClient || !orderId) return;

    const msg = 'Este pedido ya fue tomado por ti. Si lo liberas volverá a quedar disponible para otros repartidores. Como no fue entregado, no genera comisión ni modifica tu saldo.';

    const execute = async () => {
      if (typeof window.showLoadingOverlay === 'function') {
        window.showLoadingOverlay('Liberando pedido...');
      }

      try {
        const { data, error } = await window.supabaseClient.rpc('rpc_driver_release_order', {
          p_order_id: orderId,
          p_motivo: 'Repartidor liberó un pedido no entregado'
        });

        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();

        if (error) {
          console.error('Error liberando pedido:', error);
          toast('Error', error.message || 'No se pudo liberar el pedido.', 'error', 4500);
          return;
        }

        toast(
          'Pedido liberado',
          data?.message || 'El pedido volvió a estar disponible. No se aplicó comisión.',
          'info',
          4500
        );

        if (typeof window.renderDriverOrdersList === 'function') window.renderDriverOrdersList();
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
        if (typeof window.renderDriverOrdersList === 'function') window.renderDriverOrdersList();
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
      btn.className = 'btn-action btn-driver-not-delivered';
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
    const weeklyButtonRx = /Corte\s+Dom|Corte\s+Semanal|Baneo\s+Lun|Baneo\s+Semanal/i;

    const buttons = scope.querySelectorAll?.('button') || [];
    buttons.forEach((button) => {
      if (weeklyButtonRx.test(String(button.textContent || ''))) {
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
          .replace(/Comisi[oó]n\s+fija\s+de\s+S\/\s*1\.00\s+por\s+bal[oó]n\s+entregado/gi, 'Comisión de S/ 0.20 por pedido entregado')
          .replace(/l[ií]mite\s+de\s+cr[eé]dito\s+de\s+S\/\s*50\.00/gi, 'ciclo de crédito de 100 pedidos (S/ 20)')
          .replace(/corte\s+semanal\s+los\s+domingos\s+11:59\s*PM\s+y\s+baneo\s+definitivo\s+por\s+hardware\s+en\s+caso\s+de\s+incumplimiento/gi, 'suspensión al completar el ciclo hasta regularizar el pago')
          .replace(/Los\s+primeros\s+20\s+pedidos\s+confirmados\s+no\s+generan\s+comisi[oó]n\.\s*Despu[eé]s:\s*/gi, '')
          .replace(/cr[eé]dito\s+hasta\s+100\s+unidades\s+entregadas/gi, 'ciclo de crédito de 100 pedidos');
        if (text !== original) node.nodeValue = text;
      });
    }

    const deepestSummary = Array.from(scope.querySelectorAll?.('div') || []).filter((el) => {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/Comisi[oó]n fija:.*S\/\s*1\.00.*S\/\s*50\.00.*Corte:.*Baneo:/i.test(text)) return false;
      return !Array.from(el.children || []).some((child) => /Comisi[oó]n fija:.*S\/\s*1\.00.*S\/\s*50\.00.*Corte:.*Baneo:/i.test(String(child.textContent || '')));
    });
    deepestSummary.forEach((el) => {
      el.textContent = 'Comisión: S/ 0.20 por pedido confirmado • Ciclo: 100 pedidos = S/ 20 • Suspensión hasta regularizar el pago';
    });
  }

  function normalizeLegacyOrderBanners(root = document) {
    const banners = root.querySelectorAll?.('.driver-plan-banner') || [];
    banners.forEach((banner) => {
      banner.innerHTML = '<strong style="color:#FFFFFF;">🎁 50 pedidos gratis para probar NOTIGAS</strong> · Después: S/ 0.20 por pedido. Crédito progresivo hasta S/ 100.';
    });
  }

  async function syncDriverCreditCard() {
    if (!window.supabaseClient) return;
    const card = document.querySelector('.driver-financial-card');
    if (!card) return;

    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;

      const { data: driver, error } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('comisiones_pendientes,pedidos_credito_ciclo,limite_pedidos_credito,limite_credito,comision_por_pedido,promo_pedidos_gratis_total,promo_pedidos_gratis_usados,remesas_confirmadas,estado_servicio,bloqueado')
        .eq('user_id', uid)
        .maybeSingle();
      if (error || !driver) return;

      const used = Number(driver.pedidos_credito_ciclo || 0);
      const limit = Number(driver.limite_pedidos_credito || 100);
      const saldo = Number(driver.comisiones_pendientes || 0);
      const fee = Number(driver.comision_por_pedido || 0.20);
      const creditLimit = Number(driver.limite_credito || 20);
      const freeTotal = Number(driver.promo_pedidos_gratis_total || 50);
      const freeUsed = Number(driver.promo_pedidos_gratis_usados || 0);
      const freeRemaining = Math.max(0, freeTotal - freeUsed);
      const inPromo = freeRemaining > 0;
      const pct = inPromo ? Math.min(100, Math.round((freeUsed / Math.max(freeTotal,1)) * 100)) : (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);
      const suspended = Boolean(driver.bloqueado || driver.estado_servicio === 'suspendido_tope' || driver.estado_servicio === 'baneado');
      const barColor = suspended || pct >= 100 ? '#EF4444' : (pct >= 70 ? '#F59E0B' : '#10B981');

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:800;color:#E2E8F0;">${inPromo ? '🎁 Prueba gratis' : '💳 Crédito por uso'}</span>
          <span style="font-size:11px;font-weight:900;color:${barColor};">${inPromo ? `${freeUsed}/${freeTotal} gratis` : `${used}/${limit} pedidos`}</span>
        </div>
        <div style="background:#0F172A;border-radius:6px;height:8px;width:100%;overflow:hidden;border:1px solid #334155;"><div style="background:${barColor};height:100%;width:${pct}%;"></div></div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:9.5px;color:#94A3B8;">
          <span>${inPromo ? `${freeRemaining} pedido(s) gratis restantes` : `Comisión: S/ ${fee.toFixed(2)} por pedido confirmado`}</span>
          <span>${inPromo ? 'Saldo: S/ 0.00' : `Saldo: S/ ${saldo.toFixed(2)} / S/ ${creditLimit.toFixed(2)}`}</span>
        </div>`;
    } catch (err) {
      console.warn('No se pudo sincronizar el crédito del repartidor:', err);
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

        const accounting = data?.accounting || data || {};
        const fee = Number(accounting.comision_cargada ?? data?.comision_cargada ?? 0.20);
        const saldo = Number(accounting.comisiones_pendientes ?? data?.comisiones_pendientes ?? 0);
        const used = Number(accounting.pedidos_credito_ciclo ?? data?.pedidos_credito_ciclo ?? 0);
        const limit = Number(accounting.limite_pedidos_credito ?? data?.limite_pedidos_credito ?? 100);
        const suspended = Boolean(accounting.suspendido ?? data?.suspendido ?? false);
        const freeOrder = Boolean(accounting.pedido_gratis ?? data?.pedido_gratis ?? false);
        const promoRemaining = Number(accounting.promo_restantes ?? data?.promo_restantes ?? 0);
        const creditLimit = Number(accounting.limite_credito ?? data?.limite_credito ?? 20);

        if (freeOrder) {
          toast('🎁 Pedido gratuito confirmado', `No se generó comisión. Te quedan ${promoRemaining} pedido(s) gratis de la promoción inicial.`, 'success', 5000);
        } else if (suspended) {
          toast('⚠️ Límite de crédito alcanzado', `Entrega confirmada. Comisión S/ ${fee.toFixed(2)}. Alcanzaste ${used || limit}/${limit} pedidos del ciclo y S/ ${creditLimit.toFixed(2)} de crédito. Regulariza la remesa para continuar.`, 'warning', 8000);
        } else {
          toast('¡Entrega confirmada! 🎉', `Comisión S/ ${fee.toFixed(2)} registrada. Saldo: S/ ${saldo.toFixed(2)} / S/ ${creditLimit.toFixed(2)} · Ciclo: ${used}/${limit} pedidos.`, 'success', 5000);
        }

        if (typeof window.renderDriverOrdersList === 'function') await window.renderDriverOrdersList();
        if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
        await syncDriverCreditCard();
      } catch (err) {
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        toast('Error', err.message || 'No se pudo confirmar la entrega.', 'error', 5000);
      }
    };

    const message = '¿El comprador ya recibió su pedido? Si aún estás dentro de los primeros 50 pedidos promocionales, esta entrega es gratuita. Después se aplica S/ 0.20 por pedido confirmado.';
    if (typeof window.showConfirmModal === 'function') {
      window.showConfirmModal('🏁', 'Confirmar entrega', message, 'Sí, ya entregué el pedido', execute, 'Volver');
    } else if (window.confirm(message)) {
      execute();
    }
  }

  function installOrderRuntimePatch() {
    window.confirmarEntregaPedido = confirmarEntregaPedidoActual;

    const original = window.renderDriverOrdersList;
    if (typeof original === 'function' && !original.__notigasCreditContractPatched) {
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        normalizeLegacyFinancialCopy(document);
        normalizeLegacyOrderBanners(document);
        await syncDriverCreditCard();
        return result;
      };
      wrapped.__notigasCreditContractPatched = true;
      wrapped.__notigasOriginal = original;
      window.renderDriverOrdersList = wrapped;
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

  async function showUnreadDriverNotifications() {
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
      console.warn('No se pudieron cargar notificaciones del repartidor:', err);
    }
  }

  async function startNotifications() {
    if (!window.supabaseClient) return;

    await showUnreadDriverNotifications();

    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (uid && typeof window.supabaseClient.channel === 'function' && !notificationChannel) {
        notificationChannel = window.supabaseClient
          .channel(`driver-order-notifications-${uid}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notificaciones_repartidor', filter: `user_id=eq.${uid}` },
            () => showUnreadDriverNotifications()
          )
          .subscribe();
      }
    } catch (_) {}

    if (!pollTimer) {
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') showUnreadDriverNotifications();
      }, 30000);
    }

    if (!visibilityListenerInstalled) {
      visibilityListenerInstalled = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') showUnreadDriverNotifications();
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
        el.textContent = '1. Acceso sin suscripción y comisión por entrega';
        return;
      }

      if (/suscribirse.*Plan PRO|3 minutos.*pedidos|1 minuto.*clientes/i.test(text)) {
        el.textContent = 'NOTIGAS no cobra suscripción. Los primeros 50 pedidos confirmados son gratis; después se aplica S/ 0.20 por pedido. El crédito comienza en S/ 20, sube a S/ 50 tras la primera remesa y a S/ 100 tras la tercera.';
      }
    });
    normalizeLegacyFinancialCopy(document);
  }

  function normalizeDriverRegistrationOffer() {
    const inputTipo = document.getElementById('inputDriverPlanTipo');
    if (inputTipo) inputTipo.value = 'credito';

    const originalSelector = window._notigasOriginalSeleccionarPlanRegistroChofer || window.seleccionarPlanRegistroChofer;
    if (!window._notigasOriginalSeleccionarPlanRegistroChofer && typeof originalSelector === 'function') {
      window._notigasOriginalSeleccionarPlanRegistroChofer = originalSelector;
      window.seleccionarPlanRegistroChofer = function () {
        return window._notigasOriginalSeleccionarPlanRegistroChofer('credito');
      };
    }

    try {
      if (typeof window._notigasOriginalSeleccionarPlanRegistroChofer === 'function') {
        window._notigasOriginalSeleccionarPlanRegistroChofer('credito');
      }
    } catch (_) {}

    const grid = document.getElementById('driverPlanCardsGrid');
    if (grid) {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = `
        <div style="border:1.5px solid #10B981;background:linear-gradient(135deg,rgba(16,185,129,.14),rgba(15,23,42,.95));border-radius:12px;padding:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
            <strong style="color:#FFFFFF;font-size:14px;">Crédito operativo NOTIGAS</strong>
            <span style="background:#10B981;color:#052E16;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;white-space:nowrap;">SIN SUSCRIPCIÓN</span>
          </div>
          <div style="font-size:11.5px;color:#D1FAE5;line-height:1.55;">
            Tus primeros <strong>50 pedidos confirmados son totalmente gratuitos</strong>. Desde el pedido 51 se registra una comisión de <strong>S/ 0.20 por cada pedido entregado</strong>.
          </div>
          <div style="margin-top:9px;background:rgba(15,23,42,.72);border-left:3px solid #F59E0B;padding:8px 10px;border-radius:0 8px 8px 0;font-size:11px;color:#FDE68A;line-height:1.5;">
            El primer ciclo cobrable permite <strong>100 pedidos = S/ 20</strong>. Tras la primera remesa confirmada tu crédito sube a <strong>S/ 50</strong>; la segunda mantiene S/ 50 y, tras la tercera remesa confirmada, sube al tope de <strong>S/ 100</strong>.
          </div>
        </div>`;
    }

    for (const id of ['driverPremiumProContent', 'driverPremiumPaymentSection', 'driverPremiumStatusBadge', 'driverPremiumActiveAlert', 'driverPremiumPendingAlert', 'cardPlanDriverPro', 'btnCambiarAProDesdeGratuito']) {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    }

    const creditContent = document.getElementById('driverPremiumGratuitoContent');
    if (creditContent) {
      creditContent.style.display = 'block';
      creditContent.innerHTML = '<p style="margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;"><strong>Prueba gratis:</strong> tus primeros 50 pedidos confirmados no generan comisión. Después: S/ 0.20 por pedido, con crédito progresivo S/ 20 → S/ 50 → S/ 100.</p>';
    }

    const btnText = document.getElementById('btnDriverSubmitText');
    if (btnText) btnText.textContent = 'Registrar y activar mi cuenta de repartidor';

    normalizeLegacyPlanCopy();
  }

  function install() {
    window.liberarPedidoRepartidor = liberarPedidoRepartidor;
    window.reportarNoEntregadoPedido = reportarNoEntregadoPedido;
    installOrderRuntimePatch();
    normalizeDriverRegistrationOffer();
    observeOrderButtons();
    startNotifications();
    window.setTimeout(() => {
      installOrderRuntimePatch();
      normalizeLegacyFinancialCopy(document);
      normalizeLegacyOrderBanners(document);
      syncDriverCreditCard();
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();