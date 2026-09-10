from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def sub(text, pattern, repl, flags=0):
    return re.sub(pattern, repl, text, flags=flags)


# ---------------------------------------------------------------------------
# index.html: registro y términos visibles
# ---------------------------------------------------------------------------
p = 'index.html'
t = read(p)
t = t.replace('id="inputDriverPlanTipo" value="pro"', 'id="inputDriverPlanTipo" value="credito"')
t = t.replace('Registrar y Activar Repartidor PRO (S/ 15/mes)', 'Registrar y activar mi cuenta de repartidor')
t = t.replace('💸 Método de Pago Oficial: <strong>Remesa por Yape</strong> (S/ 15.00 PEN):', '💸 <strong>Remesa por Yape:</strong> se habilita únicamente al completar el ciclo de crédito vigente.')
t = t.replace('👑 RECOMENDADO', '🎁 50 PEDIDOS GRATIS')
t = t.replace('Repartidor PRO', 'Prueba gratis NOTIGAS')
t = t.replace('⚡ <strong>Ventaja de 3 Minutos en Pedidos:</strong> Verás los pedidos en el mapa 3 minutos antes que tu competencia.', '🎁 <strong>Primeros 50 pedidos gratis:</strong> prueba NOTIGAS sin pagar comisión durante tus primeras 50 entregas confirmadas.')
t = t.replace('👑 <strong>Prioridad ante Compradores:</strong> Te mostramos 1 minuto antes en el mapa de clientes y con prioridad superior.', '⚡ <strong>Pedidos en tiempo real:</strong> todos los repartidores habilitados reciben los pedidos sin ventajas pagadas ni demoras artificiales.')
t = t.replace('🚛 <strong>Insignia VIP Dorada:</strong> Corona de oro y precio destacado en tu camión en vivo.', '📈 <strong>Crédito progresivo:</strong> después de la promoción se acumulan S/ 0.20 por pedido; el límite crece con las remesas confirmadas.')

acceptance = (
    r'(Acepto los <a[^>]*>Términos y Condiciones para Repartidores</a> de Notigas\.com)\s*\([^\n]*\)'
)
acceptance_text = (
    r'\1 (Primeros 50 pedidos confirmados gratis; desde el pedido 51, comisión de S/ 0.20 por pedido. '
    r'Primer ciclo: 100 pedidos cobrables = S/ 20; después de la 1.ª remesa el crédito sube a S/ 50 y después de la 3.ª remesa al tope de S/ 100.)'
)
t = sub(t, acceptance, acceptance_text, flags=re.I)

t = sub(
    t,
    r'(<strong>Comisión por pedido:</strong>).*?(?=</li>)',
    r'\1 Los primeros <strong>50 pedidos confirmados son gratuitos</strong>. Desde el pedido 51, Notigas.com registra una comisión de <strong>S/ 0.20</strong> por cada pedido efectivamente entregado y confirmado.',
    flags=re.I | re.S,
)
t = sub(
    t,
    r'(<strong>Límite de Crédito:</strong>).*?(?=</li>)',
    r'\1 Después de los 50 pedidos gratuitos, el primer ciclo permite acumular hasta <strong>100 pedidos cobrables = S/ 20</strong>. Después de la primera remesa confirmada el crédito sube a <strong>S/ 50</strong>; la segunda remesa mantiene ese nivel y, después de la tercera remesa confirmada, sube al tope de <strong>S/ 100</strong>.',
    flags=re.I | re.S,
)
t = t.replace('🚨 4. Ciclo de Pago y Baneo Automático por Incumplimiento', '💳 4. Ciclo de crédito, remesas y continuidad del servicio')
t = sub(
    t,
    r'(<strong>Corte Semanal:</strong>).*?(?=</li>)',
    r'<strong>Solicitud de remesa:</strong> La remesa se solicita únicamente cuando el repartidor alcanza el límite de crédito vigente. No existe corte semanal.',
    flags=re.I | re.S,
)
t = sub(
    t,
    r'(<strong>Plazo de Pago:</strong>).*?(?=</li>)',
    r'<strong>Continuidad del servicio:</strong> Si el repartidor decide no realizar la remesa, su cuenta queda suspendida para recibir o tomar nuevos pedidos hasta que regularice el saldo.',
    flags=re.I | re.S,
)
t = sub(
    t,
    r'(<strong>Baneo Definitivo de Dispositivo e Identidad:</strong>).*?(?=</li>)',
    r'<strong>Suspensión y fraude:</strong> La falta de remesa produce una suspensión por saldo pendiente, no un baneo permanente. El baneo permanente se reserva para fraude, comprobantes falsificados u otros incumplimientos graves verificados.',
    flags=re.I | re.S,
)
# Ocultar el contenedor legado de pago inicial; el flujo nuevo vive en Pagos.
t = t.replace('id="driverPremiumPaymentSection" style="background:', 'id="driverPremiumPaymentSection" style="display:none;background:')
# Cache bust único.
t = t.replace('?v=130', '?v=132')
write(p, t)

# ---------------------------------------------------------------------------
# auth.js: registro sin PRO/VIP y promoción 50 gratis
# ---------------------------------------------------------------------------
p = 'js/auth.js'
t = read(p)
t = t.replace(
    'Registro sin suscripción mensual. Primeros 20 pedidos confirmados sin comisión; luego S/ 0,20 por pedido con crédito hasta 100 unidades.',
    'Registro sin suscripción mensual. Tus primeros 50 pedidos confirmados son gratuitos. Después se aplica S/ 0,20 por pedido: primer ciclo S/ 20, luego crédito S/ 50 tras la primera remesa y S/ 100 tras la tercera.'
)
t = t.replace(
    "showToast('👑 ¡Repartidor PRO Activado!', `¡Bienvenido ${nombreNegocio}! Cuentas con 3 minutos de ventaja en pedidos y 1 minuto ante compradores.`, 'success', 6500);",
    "showToast('🎁 Cuenta de repartidor activada', `¡Bienvenido ${nombreNegocio}! Tus primeros 50 pedidos confirmados son gratuitos.`, 'success', 6500);"
)
t = t.replace(
    "showToast('🟢 Registro Gratuito Activado', `Ficha de ${nombreNegocio} registrada. Puedes pasar a PRO por S/ 15/mes para obtener 3 minutos de ventaja.`, 'success', 6000);",
    "showToast('🎁 Cuenta de repartidor activada', `Ficha de ${nombreNegocio} registrada. Tus primeros 50 pedidos confirmados son gratuitos.`, 'success', 6000);"
)
write(p, t)

# ---------------------------------------------------------------------------
# map.js: todos los repartidores ven pedidos en tiempo real
# ---------------------------------------------------------------------------
p = 'js/map.js'
t = read(p)
t = sub(t, r"\n\s*const isCurrentDriverVip = Boolean\(u\.es_premium \|\| u\.tipo_plan === 'pro'\);\s*\n\s*const PRO_ORDER_ADVANTAGE_MS = 3 \* 60 \* 1000;\s*\n\s*const fetchNow = Date\.now\(\);", '\n', flags=re.M)
t = sub(t, r"\n\s*// Ventaja de 3 minutos para repartidores PRO:\s*\n\s*if \(!isCurrentDriverVip\) \{\s*\n\s*const orderAge = fetchNow - new Date\(order\.created_at\)\.getTime\(\);\s*\n\s*if \(orderAge < PRO_ORDER_ADVANTAGE_MS\) return false;\s*\n\s*\}", '\n', flags=re.M)
write(p, t)

# ---------------------------------------------------------------------------
# vendors.js: no ordenar por Premium
# ---------------------------------------------------------------------------
p = 'js/vendors.js'
t = read(p)
t = sub(t, r"\n\s*// Prioridad para repartidores PRO: aparecen siempre en los primeros lugares\s*\n\s*filtered\.sort\(\(a, b\) => \(b\.es_premium \? 1 : 0\) - \(a\.es_premium \? 1 : 0\)\);", '\n', flags=re.M)
write(p, t)

# ---------------------------------------------------------------------------
# driver_icons.js: ningún distintivo VIP/Premium visible
# ---------------------------------------------------------------------------
p = 'js/driver_icons.js'
t = read(p)
t = t.replace('const isPremium = Boolean(data.es_premium);', 'const isPremium = false; // campo legado ignorado: no existe prioridad Premium')
write(p, t)

# ---------------------------------------------------------------------------
# orders.js: promoción visible + límites progresivos
# ---------------------------------------------------------------------------
p = 'js/orders.js'
t = read(p)
t = t.replace(
    "'comisiones_pendientes, estado_servicio, bloqueado, motivo_bloqueo, pedidos_credito_ciclo, limite_pedidos_credito, comision_por_pedido'",
    "'comisiones_pendientes, estado_servicio, bloqueado, motivo_bloqueo, pedidos_credito_ciclo, limite_pedidos_credito, limite_credito, comision_por_pedido, promo_pedidos_gratis_total, promo_pedidos_gratis_usados, remesas_confirmadas'"
)
t = t.replace(
    "    comisionPedido: Number(financeRow.comision_por_pedido ?? userData?.comision_por_pedido ?? 0.20)\n  };",
    "    comisionPedido: Number(financeRow.comision_por_pedido ?? userData?.comision_por_pedido ?? 0.20),\n    limiteCredito: Number(financeRow.limite_credito ?? userData?.limite_credito ?? 20),\n    promoTotal: Number(financeRow.promo_pedidos_gratis_total ?? userData?.promo_pedidos_gratis_total ?? 50),\n    promoUsados: Number(financeRow.promo_pedidos_gratis_usados ?? userData?.promo_pedidos_gratis_usados ?? 0),\n    remesasConfirmadas: Number(financeRow.remesas_confirmadas ?? userData?.remesas_confirmadas ?? 0)\n  };"
)
t = t.replace(
    "  const pctCredito = driverFinances.pedidosLimite > 0\n    ? Math.min(100, Math.round((driverFinances.pedidosCiclo / driverFinances.pedidosLimite) * 100))\n    : 0;",
    "  const promoRestantes = Math.max(0, driverFinances.promoTotal - driverFinances.promoUsados);\n  const enPromo = promoRestantes > 0;\n  const pctCredito = enPromo\n    ? (driverFinances.promoTotal > 0 ? Math.min(100, Math.round((driverFinances.promoUsados / driverFinances.promoTotal) * 100)) : 0)\n    : (driverFinances.pedidosLimite > 0 ? Math.min(100, Math.round((driverFinances.pedidosCiclo / driverFinances.pedidosLimite) * 100)) : 0);"
)
t = t.replace('💳 Crédito por uso</span>', "${enPromo ? '🎁 Prueba gratis' : '💳 Crédito por uso'}</span>")
t = t.replace('${driverFinances.pedidosCiclo}/${driverFinances.pedidosLimite} pedidos</span>', "${enPromo ? `${driverFinances.promoUsados}/${driverFinances.promoTotal} gratis` : `${driverFinances.pedidosCiclo}/${driverFinances.pedidosLimite} pedidos`}</span>")
t = t.replace('<span>Comisión: S/ ${driverFinances.comisionPedido.toFixed(2)} por pedido confirmado</span>', "<span>${enPromo ? `${promoRestantes} pedido(s) gratis restantes` : `Comisión: S/ ${driverFinances.comisionPedido.toFixed(2)} por pedido confirmado`}</span>")
t = t.replace('<span>Saldo: S/ ${driverFinances.comisiones.toFixed(2)}</span>', "<span>${enPromo ? 'Saldo: S/ 0.00' : `Saldo: S/ ${driverFinances.comisiones.toFixed(2)} / S/ ${driverFinances.limiteCredito.toFixed(2)}`}</span>")
t = t.replace(
    '<strong style="color:#FFFFFF;">Pedidos en tiempo real</strong> · Comisión S/ 0,20 por pedido confirmado. Ciclo de crédito: 100 pedidos = S/ 20.',
    '<strong style="color:#FFFFFF;">🎁 50 pedidos gratis para probar NOTIGAS</strong> · Después: S/ 0,20 por pedido. Primer ciclo: 100 pedidos cobrables = S/ 20; luego el crédito progresa a S/ 50 y, tras la 3.ª remesa, a S/ 100.'
)
write(p, t)

# ---------------------------------------------------------------------------
# driver_order_rules.js: experiencia operativa coherente
# ---------------------------------------------------------------------------
p = 'js/driver_order_rules.js'
t = read(p)
t = t.replace('   - Comisión fija: S/ 0.20 por pedido entregado y contabilizado una sola vez.\n   - Ciclo de crédito: 100 pedidos = S/ 20; al llegar al tope se suspende hasta pagar.', '   - Promoción: primeros 50 pedidos confirmados sin comisión.\n   - Después: S/ 0.20 por pedido. Crédito progresivo S/ 20 -> S/ 50 -> S/ 100.')
t = t.replace("el.textContent = 'NOTIGAS es de libre acceso para compradores. Los repartidores no pagan suscripción: se aplica S/ 0.20 por cada pedido entregado y el saldo se liquida al completar 100 pedidos (S/ 20).';", "el.textContent = 'NOTIGAS no cobra suscripción. Los primeros 50 pedidos confirmados son gratis; después se aplica S/ 0.20 por pedido. El crédito comienza en S/ 20, sube a S/ 50 tras la primera remesa y a S/ 100 tras la tercera.';")
t = t.replace("banner.innerHTML = '<strong style=\"color:#FFFFFF;\">Pedidos en tiempo real</strong> · Comisión: S/ 0.20 por pedido confirmado. Ciclo de crédito: 100 pedidos = S/ 20.';", "banner.innerHTML = '<strong style=\"color:#FFFFFF;\">🎁 50 pedidos gratis para probar NOTIGAS</strong> · Después: S/ 0.20 por pedido. Crédito progresivo hasta S/ 100.';")
t = t.replace(
    "            Se registra una comisión de <strong>S/ 0.20 por cada pedido entregado</strong>. El ciclo permite <strong>100 pedidos</strong>, equivalentes a <strong>S/ 20</strong> de comisión acumulada.",
    "            Tus primeros <strong>50 pedidos confirmados son totalmente gratuitos</strong>. Desde el pedido 51 se registra una comisión de <strong>S/ 0.20 por cada pedido entregado</strong>."
)
t = t.replace(
    "            Al confirmar el pedido 100, la cuenta queda suspendida para nuevos pedidos hasta que el pago Yape sea validado. Al aprobarse el pago, el ciclo vuelve a 0 automáticamente.",
    "            El primer ciclo cobrable permite <strong>100 pedidos = S/ 20</strong>. Tras la primera remesa confirmada tu crédito sube a <strong>S/ 50</strong>; la segunda mantiene S/ 50 y, tras la tercera remesa confirmada, sube al tope de <strong>S/ 100</strong>."
)
t = t.replace(
    "creditContent.innerHTML = '<p style=\"margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;\">El registro no requiere pago inicial ni suscripción. La comisión se genera únicamente cuando una entrega queda confirmada.</p>';",
    "creditContent.innerHTML = '<p style=\"margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;\"><strong>Prueba gratis:</strong> tus primeros 50 pedidos confirmados no generan comisión. Después: S/ 0.20 por pedido, con crédito progresivo S/ 20 → S/ 50 → S/ 100.</p>';"
)
t = t.replace(
    ".select('comisiones_pendientes,pedidos_credito_ciclo,limite_pedidos_credito,comision_por_pedido,estado_servicio,bloqueado')",
    ".select('comisiones_pendientes,pedidos_credito_ciclo,limite_pedidos_credito,limite_credito,comision_por_pedido,promo_pedidos_gratis_total,promo_pedidos_gratis_usados,remesas_confirmadas,estado_servicio,bloqueado')"
)
t = t.replace(
    "      const fee = Number(driver.comision_por_pedido || 0.20);\n      const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;",
    "      const fee = Number(driver.comision_por_pedido || 0.20);\n      const creditLimit = Number(driver.limite_credito || 20);\n      const freeTotal = Number(driver.promo_pedidos_gratis_total || 50);\n      const freeUsed = Number(driver.promo_pedidos_gratis_usados || 0);\n      const freeRemaining = Math.max(0, freeTotal - freeUsed);\n      const inPromo = freeRemaining > 0;\n      const pct = inPromo ? Math.min(100, Math.round((freeUsed / Math.max(freeTotal,1)) * 100)) : (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);"
)
t = t.replace('💳 Crédito por uso</span>', "${inPromo ? '🎁 Prueba gratis' : '💳 Crédito por uso'}</span>")
t = t.replace('${used}/${limit} pedidos</span>', "${inPromo ? `${freeUsed}/${freeTotal} gratis` : `${used}/${limit} pedidos`}</span>")
t = t.replace('<span>Comisión: S/ ${fee.toFixed(2)} por pedido confirmado</span>', "<span>${inPromo ? `${freeRemaining} pedido(s) gratis restantes` : `Comisión: S/ ${fee.toFixed(2)} por pedido confirmado`}</span>")
t = t.replace('<span>Saldo: S/ ${saldo.toFixed(2)}</span>', "<span>${inPromo ? 'Saldo: S/ 0.00' : `Saldo: S/ ${saldo.toFixed(2)} / S/ ${creditLimit.toFixed(2)}`}</span>")
t = t.replace(
    "        const suspended = Boolean(accounting.suspendido ?? data?.suspendido ?? false);",
    "        const suspended = Boolean(accounting.suspendido ?? data?.suspendido ?? false);\n        const freeOrder = Boolean(accounting.pedido_gratis ?? data?.pedido_gratis ?? false);\n        const promoRemaining = Number(accounting.promo_restantes ?? data?.promo_restantes ?? 0);\n        const creditLimit = Number(accounting.limite_credito ?? data?.limite_credito ?? 20);"
)
t = t.replace(
    "        if (suspended) {\n          toast('⚠️ Límite de crédito alcanzado', `Entrega confirmada. Comisión S/ ${fee.toFixed(2)}. Alcanzaste ${used || limit}/${limit} pedidos del ciclo (S/ 20). Regulariza el pago para continuar.`, 'warning', 8000);\n        } else {\n          toast('¡Entrega confirmada! 🎉', `Comisión S/ ${fee.toFixed(2)} registrada. Saldo: S/ ${saldo.toFixed(2)} · Ciclo: ${used}/${limit} pedidos.`, 'success', 5000);\n        }",
    "        if (freeOrder) {\n          toast('🎁 Pedido gratuito confirmado', `No se generó comisión. Te quedan ${promoRemaining} pedido(s) gratis de la promoción inicial.`, 'success', 5000);\n        } else if (suspended) {\n          toast('⚠️ Límite de crédito alcanzado', `Entrega confirmada. Comisión S/ ${fee.toFixed(2)}. Alcanzaste ${used || limit}/${limit} pedidos del ciclo y S/ ${creditLimit.toFixed(2)} de crédito. Regulariza la remesa para continuar.`, 'warning', 8000);\n        } else {\n          toast('¡Entrega confirmada! 🎉', `Comisión S/ ${fee.toFixed(2)} registrada. Saldo: S/ ${saldo.toFixed(2)} / S/ ${creditLimit.toFixed(2)} · Ciclo: ${used}/${limit} pedidos.`, 'success', 5000);\n        }"
)
t = t.replace(
    "    const message = '¿El comprador ya recibió su pedido? La entrega confirmada genera una comisión de S/ 0.20 y suma 1 pedido al ciclo de 100.';",
    "    const message = '¿El comprador ya recibió su pedido? Si aún estás dentro de los primeros 50 pedidos promocionales, esta entrega es gratuita. Después se aplica S/ 0.20 por pedido confirmado.';"
)
write(p, t)

# ---------------------------------------------------------------------------
# driver_payments.js: explicar la escalera de crédito
# ---------------------------------------------------------------------------
p = 'js/driver_payments.js'
t = read(p)
t = t.replace('   - Comisión: S/ 0.20 por pedido entregado.\n   - Liquidación: 100 pedidos = S/ 20.', '   - Promoción: primeros 50 pedidos confirmados sin comisión.\n   - Después: S/ 0.20 por pedido. Crédito S/ 20 -> S/ 50 -> S/ 100.')
t = t.replace(
    'Comisión: <strong>S/ 0.20 por pedido entregado</strong>. Al llegar a <strong>100 pedidos (S/ 20)</strong>, debes liquidar por Yape para iniciar un nuevo ciclo.',
    '<strong>Primeros 50 pedidos confirmados: GRATIS.</strong> Después: S/ 0.20 por pedido. Primer ciclo: 100 pedidos cobrables = S/ 20; tras la 1.ª remesa el crédito sube a S/ 50 y tras la 3.ª al tope de S/ 100.'
)
write(p, t)

# ---------------------------------------------------------------------------
# README: contrato vigente
# ---------------------------------------------------------------------------
p = 'README.md'
t = read(p)
t = sub(
    t,
    r'The current business model has \*\*no PRO/VIP monthly subscription and no artificial visibility delay\*\*\..*?(?=\n\n|$)',
    'The current business model has **no PRO/VIP monthly subscription and no artificial visibility delay**. Driver onboarding includes the first **50 confirmed orders commission-free**. After that, the platform records **S/ 0.20 per confirmed order**. The first paid credit cycle is **100 orders = S/ 20**; after the first confirmed remittance the credit limit increases to **S/ 50**, remains S/ 50 through the second remittance, and after the third confirmed remittance increases to the maximum **S/ 100**.',
    flags=re.S,
)
write(p, t)

# ---------------------------------------------------------------------------
# test_driver_plans.js: reemplazar el test PRO por el contrato actual
# ---------------------------------------------------------------------------
write('scripts/test_driver_plans.js', """'use strict';
const assert = require('assert');

const FREE_ORDERS = 50;
const FEE = 0.20;
const creditForRemittances = (count) => count >= 3 ? 100 : (count >= 1 ? 50 : 20);
const orderLimit = (credit) => Math.round(credit / FEE);

assert.strictEqual(FREE_ORDERS, 50);
assert.strictEqual(orderLimit(creditForRemittances(0)), 100);
assert.strictEqual(creditForRemittances(1), 50);
assert.strictEqual(orderLimit(creditForRemittances(1)), 250);
assert.strictEqual(creditForRemittances(2), 50);
assert.strictEqual(orderLimit(creditForRemittances(2)), 250);
assert.strictEqual(creditForRemittances(3), 100);
assert.strictEqual(orderLimit(creditForRemittances(3)), 500);
assert.strictEqual(creditForRemittances(99), 100);

console.log('✅ Política de repartidor: 50 gratis; S/0.20; crédito S/20 -> S/50 -> S/100');
""")

# ---------------------------------------------------------------------------
# Cache PWA coherente v132
# ---------------------------------------------------------------------------
p = 'js/state.js'
t = read(p).replace("window.NOTIGAS.CACHE_VERSION = '129';", "window.NOTIGAS.CACHE_VERSION = '132';")
write(p, t)

p = 'sw.js'
t = read(p)
t = t.replace('SERVICE WORKER v131.0', 'SERVICE WORKER v132.0')
t = t.replace("notigas-cache-v131", "notigas-cache-v132")
t = t.replace('?v=130', '?v=132')
write(p, t)

# ---------------------------------------------------------------------------
# Guardrails permanentes
# ---------------------------------------------------------------------------
p = 'scripts/check_audit_hardening.js'
t = read(p)
t = t.replace("uniqueHtmlVersions[0] !== '130'", "uniqueHtmlVersions[0] !== '132'")
t = t.replace("/notigas-cache-v131/", "/notigas-cache-v132/")
# Reemplazar invariantes del modelo viejo por el nuevo.
t = t.replace(
    "  assertNo('js/driver_order_rules.js', /20\\s+PEDIDOS\\s+GRATIS|primeros\\s+20\\s+pedidos|penalizaci[oó]n\\s+de\\s+S\\/\\s*0[.,]10|100\\s+botellones/i, 'Reglas del repartidor conservan el modelo financiero anterior');",
    "  assertHas('js/driver_order_rules.js', /primeros\\s+50\\s+pedidos/i, 'Falta promoción inicial de 50 pedidos gratis');"
)
t = t.replace(
    "  assertHas('js/driver_order_rules.js', /100\\s+pedidos[\\s\\S]{0,80}S\\/\\s*20/i, 'Falta regla 100 pedidos = S/ 20');",
    "  assertHas('js/driver_order_rules.js', /100\\s+pedidos[\\s\\S]{0,120}S\\/\\s*20/i, 'Falta primer ciclo 100 pedidos = S/ 20');\n  assertHas('js/driver_order_rules.js', /S\\/\\s*50[\\s\\S]{0,180}S\\/\\s*100/i, 'Falta escalera de crédito S/50 -> S/100');"
)
marker = "  assertNo('js/map.js', /PRO_BUYER_ADVANTAGE_MS|1 Minuto de Ventaja para Repartidores PRO/i, 'Quedó ventaja PRO en mapa');"
extra = """
  assertNo('js/map.js', /PRO_ORDER_ADVANTAGE_MS|isCurrentDriverVip|Ventaja de 3 minutos para repartidores PRO/i, 'map.js conserva prioridad PRO activa');
  assertNo('js/vendors.js', /Prioridad para repartidores PRO/i, 'vendors.js conserva ordenamiento PRO');
  assertNo('js/auth.js', /Puedes pasar a PRO|Repartidor PRO Activado|3 minutos de ventaja/i, 'auth.js conserva promoción PRO');
  assertNo('index.html', /S\/\s*15(?:\.00)?(?:\s*PEN|\/mes)|Ventaja de 3 Minutos en Pedidos|Corte Semanal:|Baneo Definitivo de Dispositivo/i, 'index.html conserva términos o plan PRO obsoletos');
  assertHas('index.html', /primeros\s+50\s+pedidos/i, 'La ficha de registro no informa los 50 pedidos gratis');
  assertHas('index.html', /S\/\s*20[\s\S]{0,240}S\/\s*50[\s\S]{0,240}S\/\s*100/i, 'La ficha de registro no informa la escalera S/20 -> S/50 -> S/100');
  assertHas('supabase/migrations/20260910225938_driver_50_free_and_progressive_credit_tiers.sql', /promo_pedidos_gratis_total\s+SET DEFAULT 50/i, 'Migración nueva no fija 50 pedidos gratis');
  assertHas('supabase/migrations/20260910225938_driver_50_free_and_progressive_credit_tiers.sql', /remesas_confirmadas/i, 'Migración nueva no registra remesas confirmadas');
"""
if extra.strip() not in t:
    t = t.replace(marker, marker + extra)
write(p, t)

# ---------------------------------------------------------------------------
# Validación final del transformador
# ---------------------------------------------------------------------------
checks = {
    'index.html': [r'primeros\s+50\s+pedidos', r'S/\s*100'],
    'js/driver_order_rules.js': [r'primeros\s+50\s+pedidos', r'S/\s*50', r'S/\s*100'],
    'js/driver_payments.js': [r'Primeros\s+50\s+pedidos', r'S/\s*100'],
    'js/map.js': [],
}
for path, required in checks.items():
    text = read(path)
    for pattern in required:
        if not re.search(pattern, text, re.I):
            raise SystemExit(f'Falta patrón requerido {pattern} en {path}')

for path, pattern in [
    ('js/map.js', r'PRO_ORDER_ADVANTAGE_MS|isCurrentDriverVip'),
    ('js/vendors.js', r'Prioridad para repartidores PRO'),
    ('js/auth.js', r'Puedes pasar a PRO|Repartidor PRO Activado'),
    ('index.html', r'S/\s*15(?:\.00)?(?:\s*PEN|/mes)|Ventaja de 3 Minutos en Pedidos|Baneo Definitivo de Dispositivo'),
]:
    if re.search(pattern, read(path), re.I):
        raise SystemExit(f'Residuo obsoleto en {path}: {pattern}')

print('✅ Transformación a 50 pedidos gratis y crédito progresivo aplicada')
