from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def rewrite(path, transform):
    file = ROOT / path
    before = file.read_text(encoding='utf-8')
    after = transform(before)
    if after != before:
        file.write_text(after, encoding='utf-8')
        print(f'updated: {path}')
    else:
        print(f'unchanged: {path}')


def clean_index(text):
    text = text.replace(
        'Comisión fija de S/ 1.00 por balón entregado, límite de crédito de S/ 50.00, corte semanal los domingos 11:59 PM y baneo definitivo por hardware en caso de incumplimiento',
        'Comisión de S/ 0.20 por pedido entregado, ciclo de crédito de 100 pedidos (S/ 20) y suspensión hasta regularizar el pago pendiente'
    )
    text = text.replace(
        'Comisión fija: <strong>S/ 1.00</strong>/balón • Límite de crédito: <strong>S/ 50.00</strong> (Suspensión) • Corte: <strong>Dom 11:59 PM</strong> • Baneo: <strong>Lun 1:00 PM</strong>',
        'Comisión: <strong>S/ 0.20</strong>/pedido • Ciclo: <strong>100 pedidos = S/ 20</strong> • Suspensión hasta regularizar el pago'
    )

    for fn in ('ejecutarCorteSemanalManualAdmin', 'ejecutarBaneoSemanalManualAdmin'):
        text = re.sub(
            r'\s*<button\b[^>]*onclick=["\']' + re.escape(fn) + r'\(\)["\'][^>]*>[\s\S]*?</button>',
            '', text, count=1, flags=re.I
        )

    forbidden = [
        'Comisión fija de S/ 1.00 por balón entregado',
        'Límite de crédito: <strong>S/ 50.00</strong>',
        'onclick="ejecutarCorteSemanalManualAdmin()"',
        'onclick="ejecutarBaneoSemanalManualAdmin()"'
    ]
    leftovers = [value for value in forbidden if value in text]
    if leftovers:
        raise RuntimeError(f'index.html conserva residuos: {leftovers}')
    return text


def clean_orders(text):
    replacements = {
        '// ciclo de 100 unidades entregadas; el saldo es informativo y se liquida por remesa.':
        '// ciclo de 100 pedidos entregados; el saldo es informativo y se liquida por Yape.',

        ".select('comisiones_pendientes, estado_servicio, bloqueado, motivo_bloqueo, promo_pedidos_gratis_total, promo_pedidos_gratis_usados, botellones_credito_ciclo, limite_botellones_credito, comision_por_pedido')":
        ".select('comisiones_pendientes, estado_servicio, bloqueado, motivo_bloqueo, pedidos_credito_ciclo, limite_pedidos_credito, comision_por_pedido')",

        "    gratisTotal: Number(financeRow.promo_pedidos_gratis_total ?? userData?.promo_pedidos_gratis_total ?? 20),\n": '',
        "    gratisUsados: Number(financeRow.promo_pedidos_gratis_usados ?? userData?.promo_pedidos_gratis_usados ?? 0),\n": '',
        "    unidadesCiclo: Number(financeRow.botellones_credito_ciclo ?? userData?.botellones_credito_ciclo ?? 0),":
        "    pedidosCiclo: Number(financeRow.pedidos_credito_ciclo ?? userData?.pedidos_credito_ciclo ?? 0),",
        "    unidadesLimite: Number(financeRow.limite_botellones_credito ?? userData?.limite_botellones_credito ?? 100),":
        "    pedidosLimite: Number(financeRow.limite_pedidos_credito ?? userData?.limite_pedidos_credito ?? 100),",

        '  const pctCredito = driverFinances.unidadesLimite > 0\n    ? Math.min(100, Math.round((driverFinances.unidadesCiclo / driverFinances.unidadesLimite) * 100))\n    : 0;':
        '  const pctCredito = driverFinances.pedidosLimite > 0\n    ? Math.min(100, Math.round((driverFinances.pedidosCiclo / driverFinances.pedidosLimite) * 100))\n    : 0;',
        '  const gratisRestantes = Math.max(0, driverFinances.gratisTotal - driverFinances.gratisUsados);\n': '',
        '${driverFinances.unidadesCiclo}/${driverFinances.unidadesLimite} unidades':
        '${driverFinances.pedidosCiclo}/${driverFinances.pedidosLimite} pedidos',
        '${gratisRestantes > 0 ? `${gratisRestantes} pedido(s) gratis restantes` : `Comisión: S/ ${driverFinances.comisionPedido.toFixed(2)} por pedido confirmado`}':
        'Comisión: S/ ${driverFinances.comisionPedido.toFixed(2)} por pedido confirmado',
        '<strong style="color:#FFFFFF;">Pedidos en tiempo real</strong> · Los primeros 20 pedidos confirmados no generan comisión. Después: S/ 0,20 por pedido, con crédito hasta 100 unidades entregadas.':
        '<strong style="color:#FFFFFF;">Pedidos en tiempo real</strong> · Comisión S/ 0,20 por pedido confirmado. Ciclo de crédito: 100 pedidos = S/ 20.',
        "onclick=\"alert('⛔ Cuenta Suspendida: Has alcanzado el tope de S/ 50.00 en comisiones. Paga vía Yape a la administración para volver a tomar pedidos.');\"":
        "onclick=\"alert('⛔ Cuenta suspendida: Alcanzaste el ciclo de 100 pedidos (S/ 20). Regulariza tu pago por Yape para volver a tomar pedidos.');\""
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    old_guard = """  // Comprobar suspensión de comisiones o límite de crédito
  const curUser = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  if (curUser && (curUser.comisiones_pendientes >= (curUser.limite_credito || 50) || curUser.estado_servicio === 'suspendido_tope' || curUser.bloqueado)) {
    if (typeof showToast === 'function') {
      showToast('⛔ Límite de Crédito Alcanzado', 'Has acumulado S/ 50.00 en comisiones pendientes. Regulariza tu saldo por Yape a la administración para volver a recibir pedidos.', 'error', 7000);
    } else {
      alert('⛔ Cuenta Suspendida: Límite de crédito de S/ 50.00 alcanzado. Paga tus comisiones por Yape para continuar.');
    }
    return;
  }
"""
    new_guard = """  // Comprobar suspensión o límite del ciclo de crédito vigente.
  const curUser = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const pedidosCiclo = Number(curUser?.pedidos_credito_ciclo || 0);
  const pedidosLimite = Number(curUser?.limite_pedidos_credito || 100);
  const saldoPendiente = Number(curUser?.comisiones_pendientes || 0);
  const limiteCredito = Number(curUser?.limite_credito || 20);
  if (curUser && (pedidosCiclo >= pedidosLimite || saldoPendiente >= limiteCredito || curUser.estado_servicio === 'suspendido_tope' || curUser.bloqueado)) {
    const mensaje = 'Alcanzaste el ciclo de 100 pedidos (S/ 20). Regulariza tu pago por Yape para volver a recibir pedidos.';
    if (typeof showToast === 'function') {
      showToast('⛔ Límite de crédito alcanzado', mensaje, 'error', 7000);
    } else {
      alert('⛔ Cuenta suspendida: ' + mensaje);
    }
    return;
  }
"""
    text = text.replace(old_guard, new_guard)

    old_delivery = """        const res = data || {};
        const newSaldo = res.comisiones_pendientes != null ? Number(res.comisiones_pendientes) : null;
        const isSuspended = Boolean(res.suspendido || (newSaldo != null && newSaldo >= 50));

        if (isSuspended) {
          showToast('⚠️ Límite de Crédito Alcanzado (S/ 50.00)', `Pedido entregado (+S/ 1.00 de comisión). Saldo: S/ ${newSaldo ? newSaldo.toFixed(2) : '50.00'}. Tu cuenta ha sido suspendida para tomar nuevos pedidos hasta regularizar vía Yape.`, 'warning', 8000);
        } else if (newSaldo != null) {
          showToast('¡Entrega Confirmada! 🎉', `Comisión fija de S/ 1.00 registrada. Saldo acumulado: S/ ${newSaldo.toFixed(2)} / S/ 50.00 (Tope).`, 'success', 5000);
        } else {
          showToast('¡Buen trabajo!', 'Pedido entregado. El pedido fue archivado en tus estadísticas.', 'success', 5000);
        }
"""
    new_delivery = """        const res = data || {};
        const accounting = res.accounting || res;
        const newSaldo = accounting.comisiones_pendientes != null ? Number(accounting.comisiones_pendientes) : null;
        const commissionCharged = Number(accounting.comision_cargada ?? res.comision_cargada ?? 0.20);
        const ordersCycle = Number(accounting.pedidos_credito_ciclo ?? res.pedidos_credito_ciclo ?? 0);
        const ordersLimit = Number(accounting.limite_pedidos_credito ?? res.limite_pedidos_credito ?? 100);
        const isSuspended = Boolean(accounting.suspendido ?? res.suspendido ?? false);

        if (isSuspended) {
          showToast('⚠️ Límite de crédito alcanzado', `Pedido entregado (+S/ ${commissionCharged.toFixed(2)} de comisión). Ciclo: ${ordersCycle || ordersLimit}/${ordersLimit} pedidos (S/ 20). Regulariza tu pago para continuar.`, 'warning', 8000);
        } else if (newSaldo != null) {
          showToast('¡Entrega Confirmada! 🎉', `Comisión S/ ${commissionCharged.toFixed(2)} registrada. Saldo acumulado: S/ ${newSaldo.toFixed(2)} · Ciclo: ${ordersCycle}/${ordersLimit} pedidos.`, 'success', 5000);
        } else {
          showToast('¡Buen trabajo!', 'Pedido entregado y contabilizado.', 'success', 5000);
        }
"""
    text = text.replace(old_delivery, new_delivery)

    forbidden = [
        'S/ 1.00 de comisión',
        'Comisión fija de S/ 1.00',
        'S/ 50.00',
        'primeros 20 pedidos confirmados no generan comisión',
        'promo_pedidos_gratis_total',
        'promo_pedidos_gratis_usados'
    ]
    leftovers = [value for value in forbidden if value.lower() in text.lower()]
    if leftovers:
        raise RuntimeError(f'js/orders.js conserva residuos: {leftovers}')
    if 'pedidos_credito_ciclo' not in text or 'limite_pedidos_credito' not in text:
        raise RuntimeError('js/orders.js no quedó conectado al ciclo de pedidos vigente')
    return text


rewrite('index.html', clean_index)
rewrite('js/orders.js', clean_orders)
