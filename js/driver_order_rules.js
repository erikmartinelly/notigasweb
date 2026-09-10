/* ==========================================================================
   NOTIGAS - REGLAS OPERATIVAS DEL REPARTIDOR (PERÚ)
   - Sin suscripción, VIP ni ventajas temporales.
   - Comisión fija: S/ 0.20 por pedido entregado y contabilizado una sola vez.
   - Ciclo de crédito: 100 pedidos = S/ 20; al llegar al tope se suspende hasta pagar.
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

  function observeOrderButtons() {
    ensureNotDeliveredButtons(document);
    if (observerInstalled || !document.body) return;
    observerInstalled = true;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
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
        el.textContent = 'NOTIGAS es de libre acceso para compradores. Los repartidores no pagan suscripción: se aplica S/ 0.20 por cada pedido entregado y el saldo se liquida al completar 100 pedidos (S/ 20).';
      }
    });
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
            Se registra una comisión de <strong>S/ 0.20 por cada pedido entregado</strong>. El ciclo permite <strong>100 pedidos</strong>, equivalentes a <strong>S/ 20</strong> de comisión acumulada.
          </div>
          <div style="margin-top:9px;background:rgba(15,23,42,.72);border-left:3px solid #F59E0B;padding:8px 10px;border-radius:0 8px 8px 0;font-size:11px;color:#FDE68A;line-height:1.5;">
            Al confirmar el pedido 100, la cuenta queda suspendida para nuevos pedidos hasta que el pago Yape sea validado. Al aprobarse el pago, el ciclo vuelve a 0 automáticamente.
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
      creditContent.innerHTML = '<p style="margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;">El registro no requiere pago inicial ni suscripción. La comisión se genera únicamente cuando una entrega queda confirmada.</p>';
    }

    const btnText = document.getElementById('btnDriverSubmitText');
    if (btnText) btnText.textContent = 'Registrar y activar mi cuenta de repartidor';

    normalizeLegacyPlanCopy();
  }

  function install() {
    window.liberarPedidoRepartidor = liberarPedidoRepartidor;
    window.reportarNoEntregadoPedido = reportarNoEntregadoPedido;
    normalizeDriverRegistrationOffer();
    observeOrderButtons();
    startNotifications();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();