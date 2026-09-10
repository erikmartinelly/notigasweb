/* ==========================================================================
   NOTIGAS - REGLAS OPERATIVAS DEL REPARTIDOR
   - Primeros 20 pedidos confirmados: sin comisión.
   - Después: S/ 0.20 por pedido confirmado, a crédito hasta 100 botellones.
   - Cancelar/liberar un pedido ya tomado aplica penalización de S/ 0.10.
   - "No entregué" registra la declaración sin cerrar la posibilidad de que el
     comprador confirme recepción; la confirmación del comprador prevalece.
   - Muestra notificaciones de confirmación del comprador al repartidor.
   ========================================================================== */
(function () {
  'use strict';

  const PENALIZACION_CANCELACION = 0.10;
  let notificationChannel = null;
  let pollTimer = null;

  function toast(title, message, type = 'info', duration = 4500) {
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, type, duration);
    } else {
      console.log(`[${title}] ${message}`);
    }
  }

  async function liberarPedidoConPenalizacion(orderId) {
    if (!window.supabaseClient || !orderId) return;

    const msg = `Este pedido ya fue tomado por ti. Si lo cancelas volverá a quedar disponible para otros repartidores y se aplicará una penalización de S/ ${PENALIZACION_CANCELACION.toFixed(2)} a tu saldo pendiente. La penalización no cuenta como botellón entregado.`;

    const execute = async () => {
      if (typeof window.showLoadingOverlay === 'function') {
        window.showLoadingOverlay('Cancelando pedido...');
      }

      try {
        const { data, error } = await window.supabaseClient.rpc('rpc_driver_release_order', {
          p_order_id: orderId,
          p_motivo: 'Repartidor canceló un pedido ya tomado'
        });

        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();

        if (error) {
          console.error('Error cancelando pedido:', error);
          toast('Error', error.message || 'No se pudo cancelar el pedido.', 'error', 4500);
          return;
        }

        const penalty = Number(data?.penalizacion ?? PENALIZACION_CANCELACION);
        const saldo = Number(data?.comisiones_pendientes);
        const saldoTxt = Number.isFinite(saldo) ? ` Tu saldo pendiente ahora es S/ ${saldo.toFixed(2)}.` : '';
        toast('Pedido cancelado', `Se aplicó la penalización de S/ ${penalty.toFixed(2)}.${saldoTxt}`, 'warning', 5500);

        if (typeof window.renderDriverOrdersList === 'function') window.renderDriverOrdersList();
        if (typeof window.cargarPedidosVecinalesEnVivo === 'function') window.cargarPedidosVecinalesEnVivo();
        if (typeof window.map !== 'undefined' && window.map?.closePopup) window.map.closePopup();
      } catch (err) {
        if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
        console.error('Error inesperado cancelando pedido:', err);
        toast('Error', 'No se pudo cancelar el pedido.', 'error', 4500);
      }
    };

    if (typeof window.showConfirmModal === 'function') {
      window.showConfirmModal(
        '⚠️',
        'Cancelar pedido tomado',
        msg,
        `Cancelar · penalización S/ ${PENALIZACION_CANCELACION.toFixed(2)}`,
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
      if (parent.querySelector(`button[data-not-delivered-for="${CSS.escape(orderId)}"]`)) return;

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

      const ids = data.map(x => x.id).filter(Boolean);
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
      if (uid && typeof window.supabaseClient.channel === 'function') {
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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') showUnreadDriverNotifications();
    });
  }

  function normalizeDriverRegistrationOffer() {
    const inputTipo = document.getElementById('inputDriverPlanTipo');
    if (inputTipo) inputTipo.value = 'gratuito';

    const originalSelector = window._notigasOriginalSeleccionarPlanRegistroChofer || window.seleccionarPlanRegistroChofer;
    if (!window._notigasOriginalSeleccionarPlanRegistroChofer && typeof originalSelector === 'function') {
      window._notigasOriginalSeleccionarPlanRegistroChofer = originalSelector;
      window.seleccionarPlanRegistroChofer = function () {
        return window._notigasOriginalSeleccionarPlanRegistroChofer('gratuito');
      };
    }

    try {
      if (typeof window._notigasOriginalSeleccionarPlanRegistroChofer === 'function') {
        window._notigasOriginalSeleccionarPlanRegistroChofer('gratuito');
      }
    } catch (_) {}

    const grid = document.getElementById('driverPlanCardsGrid');
    if (grid) {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = `
        <div style="border:1.5px solid #10B981;background:linear-gradient(135deg,rgba(16,185,129,.14),rgba(15,23,42,.95));border-radius:12px;padding:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
            <strong style="color:#FFFFFF;font-size:14px;">🎁 Promoción de bienvenida NOTIGAS</strong>
            <span style="background:#10B981;color:#052E16;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;white-space:nowrap;">20 PEDIDOS GRATIS</span>
          </div>
          <div style="font-size:11.5px;color:#D1FAE5;line-height:1.55;">
            Tus <strong>primeros 20 pedidos confirmados</strong> no generan comisión. Desde el pedido 21 se aplica una comisión de <strong>S/ 0,20 por pedido confirmado</strong>, a crédito hasta acumular <strong>100 botellones entregados</strong>.
          </div>
          <div style="margin-top:9px;background:rgba(15,23,42,.72);border-left:3px solid #F59E0B;padding:8px 10px;border-radius:0 8px 8px 0;font-size:11px;color:#FDE68A;line-height:1.5;">
            Al llegar al límite, puedes decidir si deseas continuar usando NOTIGAS. Si continúas, regulariza el saldo mediante la remesa indicada en <strong>Pagos</strong>. Si no realizas la remesa, tu cuenta queda suspendida y dejas de ver nuevos pedidos en el mapa hasta regularizarla.
          </div>
          <div style="margin-top:8px;font-size:10.5px;color:#CBD5E1;line-height:1.45;">
            ⚠️ Cancelar un pedido que ya tomaste tiene una penalización de <strong>S/ 0,10</strong>.
          </div>
        </div>`;
    }

    const proContent = document.getElementById('driverPremiumProContent');
    if (proContent) proContent.style.display = 'none';

    const paymentSection = document.getElementById('driverPremiumPaymentSection');
    if (paymentSection) paymentSection.style.display = 'none';

    const gratuitoContent = document.getElementById('driverPremiumGratuitoContent');
    if (gratuitoContent) {
      gratuitoContent.style.display = 'block';
      gratuitoContent.innerHTML = '<p style="margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;">Tu registro no requiere pago inicial. La promoción y el crédito comienzan cuando tus entregas son confirmadas.</p>';
    }

    const btnText = document.getElementById('btnDriverSubmitText');
    if (btnText) btnText.textContent = 'Registrar y activar mi cuenta de repartidor';

    const planContainer = document.getElementById('driverPlanSelectorContainer');
    if (planContainer) {
      planContainer.querySelectorAll('h3,h4,p').forEach((el) => {
        if (/plan\s+pro|premium|suscripci[oó]n/i.test(el.textContent || '')) {
          el.style.display = 'none';
        }
      });
    }
  }

  function install() {
    // orders.js ya fue ejecutado antes de DOMContentLoaded; sustituimos únicamente
    // la acción de liberar para mostrar el costo antes de confirmar.
    window.liberarPedidoRepartidor = liberarPedidoConPenalizacion;
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