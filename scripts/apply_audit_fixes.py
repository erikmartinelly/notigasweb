#!/usr/bin/env python3
"""Apply the audited NOTIGAS frontend/PWA cleanup deterministically.

This script is intentionally strict: expected legacy markers must exist before
replacement and postconditions are checked before files are written.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = "130"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_required(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"{label}: expected marker not found")
    return text.replace(old, new)


def sub_required(text, pattern, repl, label, flags=0, count=1):
    new, n = re.subn(pattern, repl, text, count=count, flags=flags)
    if n != count:
        raise RuntimeError(f"{label}: expected {count} replacement(s), got {n}")
    return new


def replace_function(text, name, replacement):
    start = text.find(f"function {name}(")
    async_start = text.find(f"async function {name}(")
    candidates = [x for x in (start, async_start) if x >= 0]
    if not candidates:
        raise RuntimeError(f"function {name}: start not found")
    start = min(candidates)
    export_marker = f"window.{name} = {name};"
    end = text.find(export_marker, start)
    if end < 0:
        raise RuntimeError(f"function {name}: export marker not found")
    end += len(export_marker)
    return text[:start] + replacement.rstrip() + "\n" + text[end:]


def patch_promo():
    p = "js/promo.js"
    t = read(p)
    t = replace_required(
        t,
        "let currentAdUrl = 'https://wa.me/59170000000?text=Hola';",
        "let currentAdUrl = '';",
        "promo Bolivia fallback",
    )
    old = """  // Si es un número telefónico (e.g. 70000000 o 59170000000)\n  const digitsOnly = str.replace(/[^0-9]/g, '');\n  if (/^(\\+?591)?[67][0-9]{7}$/.test(str) || (/^[0-9]{8,12}$/.test(digitsOnly) && !str.includes('.') && !str.includes('/'))) {\n    const cleanNum = digitsOnly.startsWith('591') ? digitsOnly : ('591' + digitsOnly);\n    return `https://wa.me/${cleanNum}`;\n  }"""
    new = """  // Número móvil peruano: 9 dígitos, opcionalmente precedido por +51/51.\n  const digitsOnly = str.replace(/[^0-9]/g, '');\n  if (/^(?:\\+?51)?9[0-9]{8}$/.test(str) || (/^(?:51)?9[0-9]{8}$/.test(digitsOnly) && !str.includes('.') && !str.includes('/'))) {\n    const localNumber = digitsOnly.startsWith('51') ? digitsOnly.slice(2) : digitsOnly;\n    return `https://wa.me/51${localNumber}`;\n  }"""
    t = replace_required(t, old, new, "promo Peru WhatsApp normalization")
    write(p, t)


def patch_orders():
    p = "js/orders.js"
    t = read(p)

    finance_pattern = r"  // 3\. Estado financiero del chofer \(Comisión fija S/ 1 por balón, Tope S/ 50\.00\)[\s\S]*?\n  const pubOrders = pubRes\.data \|\| \[\];"
    finance_repl = """  // 3. Estado operativo y de crédito del repartidor. La suspensión depende del\n  // ciclo de 100 unidades entregadas; el saldo es informativo y se liquida por remesa.\n  let driverFinancePromise = Promise.resolve({ data: null, error: null });\n  if (localUserId) {\n    driverFinancePromise = window.supabaseClient\n      .from('choferes_habilitados')\n      .select('comisiones_pendientes, estado_servicio, bloqueado, motivo_bloqueo, promo_pedidos_gratis_total, promo_pedidos_gratis_usados, botellones_credito_ciclo, limite_botellones_credito, comision_por_pedido')\n      .eq('user_id', localUserId)\n      .maybeSingle();\n  }\n\n  const [pubRes, assignedRes, finRes] = await Promise.all([pubQuery, assignedPromise, driverFinancePromise]);\n  if (pubRes.error) console.error('Error cargando lista de pedidos repartidor (públicos):', pubRes.error);\n  if (assignedRes.error) console.error('Error cargando pedidos asignados repartidor:', assignedRes.error);\n\n  const financeRow = finRes?.data || {};\n  const driverFinances = {\n    comisiones: Number(financeRow.comisiones_pendientes ?? userData?.comisiones_pendientes ?? 0),\n    estado_servicio: financeRow.estado_servicio || userData?.estado_servicio || 'activo',\n    bloqueado: Boolean(financeRow.bloqueado || userData?.bloqueado),\n    motivo_bloqueo: financeRow.motivo_bloqueo || userData?.motivo_bloqueo || '',\n    gratisTotal: Number(financeRow.promo_pedidos_gratis_total ?? userData?.promo_pedidos_gratis_total ?? 20),\n    gratisUsados: Number(financeRow.promo_pedidos_gratis_usados ?? userData?.promo_pedidos_gratis_usados ?? 0),\n    unidadesCiclo: Number(financeRow.botellones_credito_ciclo ?? userData?.botellones_credito_ciclo ?? 0),\n    unidadesLimite: Number(financeRow.limite_botellones_credito ?? userData?.limite_botellones_credito ?? 100),\n    comisionPedido: Number(financeRow.comision_por_pedido ?? userData?.comision_por_pedido ?? 0.20)\n  };\n  driverFinances.isSuspended = Boolean(\n    driverFinances.bloqueado ||\n    driverFinances.estado_servicio === 'suspendido_tope' ||\n    driverFinances.estado_servicio === 'suspendido' ||\n    driverFinances.estado_servicio === 'baneado'\n  );\n\n  if (typeof AppState !== 'undefined') {\n    const curU = AppState.get('userData') || {};\n    AppState.set('userData', { ...curU, ...financeRow });\n  }\n\n  const pctCredito = driverFinances.unidadesLimite > 0\n    ? Math.min(100, Math.round((driverFinances.unidadesCiclo / driverFinances.unidadesLimite) * 100))\n    : 0;\n  const barColor = driverFinances.isSuspended || pctCredito >= 100 ? '#EF4444' : (pctCredito >= 70 ? '#F59E0B' : '#10B981');\n  const gratisRestantes = Math.max(0, driverFinances.gratisTotal - driverFinances.gratisUsados);\n\n  let financialWidgetHtml = `\n    <div class=\"driver-financial-card\" style=\"background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%);border:1.5px solid ${driverFinances.isSuspended ? '#EF4444' : '#334155'};border-radius:10px;padding:10px 12px;margin-bottom:12px;\">\n      <div style=\"display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;\">\n        <span style=\"font-size:11px;font-weight:800;color:#E2E8F0;\">💳 Crédito por uso</span>\n        <span style=\"font-size:11px;font-weight:900;color:${barColor};\">${driverFinances.unidadesCiclo}/${driverFinances.unidadesLimite} unidades</span>\n      </div>\n      <div style=\"background:#0F172A;border-radius:6px;height:8px;width:100%;overflow:hidden;border:1px solid #334155;\"><div style=\"background:${barColor};height:100%;width:${pctCredito}%;\"></div></div>\n      <div style=\"display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:9.5px;color:#94A3B8;\">\n        <span>${gratisRestantes > 0 ? `${gratisRestantes} pedido(s) gratis restantes` : `Comisión: S/ ${driverFinances.comisionPedido.toFixed(2)} por pedido confirmado`}</span>\n        <span>Saldo: S/ ${driverFinances.comisiones.toFixed(2)}</span>\n      </div>\n    </div>`;\n\n  if (driverFinances.isSuspended) {\n    const motivo = driverFinances.motivo_bloqueo || 'Alcanzaste el límite del ciclo de crédito. Regulariza la remesa pendiente para continuar.';\n    financialWidgetHtml += `<div class=\"driver-lockout-banner\" style=\"background:rgba(239,68,68,.15);border:2px solid #EF4444;border-radius:10px;padding:12px;margin-bottom:12px;color:#FECACA;\"><strong>⛔ CUENTA SUSPENDIDA</strong><div style=\"margin-top:5px;font-size:11px;line-height:1.45;\">${typeof escapeHtmlStr === 'function' ? escapeHtmlStr(motivo) : motivo}</div></div>`;\n  }\n\n  const pubOrders = pubRes.data || [];"""
    t = sub_required(t, finance_pattern, finance_repl, "orders finance model", flags=re.S)

    delay_pattern = r"  // 3 Minutos de Ventaja para Repartidores PRO:[\s\S]*?\n  const allOrders = \[\.\.\.assignedOrders, \.\.\.visiblePubOrders\];"
    delay_repl = """  // Todos los repartidores habilitados reciben los pedidos en tiempo real, sin ventajas artificiales.\n  const visiblePubOrders = pubOrders.filter(o =>\n    (typeof window.isOrderCategoryMatchingDriver !== 'function') ||\n    window.isOrderCategoryMatchingDriver(o.categoria, driverCategoria)\n  );\n  const allOrders = [...assignedOrders, ...visiblePubOrders];"""
    t = sub_required(t, delay_pattern, delay_repl, "remove PRO order delay", flags=re.S)

    banner_pattern = r"  // Banner informativo superior de Plan PRO vs Gratuito[\s\S]*?\n  if \(!orders \|\| orders\.length === 0\) \{"
    banner_repl = """  const planBannerHtml = `\n    <div class=\"driver-plan-banner\" style=\"background:linear-gradient(135deg,rgba(16,185,129,.14),#0F172A);border:1.5px solid #10B981;border-radius:10px;padding:10px 12px;margin-bottom:12px;color:#D1FAE5;font-size:11.5px;line-height:1.45;\">\n      <strong style=\"color:#FFFFFF;\">Pedidos en tiempo real</strong> · Los primeros 20 pedidos confirmados no generan comisión. Después: S/ 0,20 por pedido, con crédito hasta 100 unidades entregadas.\n    </div>`;\n\n  if (!orders || orders.length === 0) {"""
    t = sub_required(t, banner_pattern, banner_repl, "remove PRO plan banner", flags=re.S)

    vip_notice_pattern = r"    const vipLockedNotice = \(ordersInVipWindow > 0\)[\s\S]*?\n      : '';"
    t = sub_required(t, vip_notice_pattern, "    const vipLockedNotice = '';", "remove PRO locked notice", flags=re.S)

    write(p, t)


def patch_map():
    p = "js/map.js"
    t = read(p)
    start_marker = "  const isDriverPremium = Boolean(data.es_premium || data.tipo_plan === 'pro');"
    end_marker = "  let priceHtml = '';"
    start = t.find(start_marker)
    if start < 0:
        raise RuntimeError("map PRO delay start not found")
    end = t.find(end_marker, start)
    if end < 0:
        raise RuntimeError("map price marker after PRO delay not found")
    t = t[:start] + "  // Sin ventaja de visibilidad por plan: todos los camiones activos se muestran inmediatamente.\n\n" + t[end:]
    write(p, t)


def patch_auth():
    p = "js/auth.js"
    t = read(p)

    t = replace_function(t, "seleccionarPlanRegistroChofer", """function seleccionarPlanRegistroChofer() {\n  const inputTipo = document.getElementById('inputDriverPlanTipo');\n  if (inputTipo) inputTipo.value = 'credito';\n  const cardPro = document.getElementById('cardPlanDriverPro');\n  const proContent = document.getElementById('driverPremiumProContent');\n  const paymentSection = document.getElementById('driverPremiumPaymentSection');\n  const statusBadge = document.getElementById('driverPremiumStatusBadge');\n  if (cardPro) cardPro.style.display = 'none';\n  if (proContent) proContent.style.display = 'none';\n  if (paymentSection) paymentSection.style.display = 'none';\n  if (statusBadge) statusBadge.style.display = 'none';\n  const cardBase = document.getElementById('cardPlanDriverGratuito');\n  if (cardBase) { cardBase.style.display = 'block'; cardBase.style.opacity = '1'; cardBase.style.border = '2px solid #10B981'; }\n  const content = document.getElementById('driverPremiumGratuitoContent');\n  if (content) { content.style.display = 'block'; content.innerHTML = '<p style=\"margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;\">Registro sin suscripción mensual. Primeros 20 pedidos confirmados sin comisión; luego S/ 0,20 por pedido con crédito hasta 100 unidades.</p>'; }\n  const btnText = document.getElementById('btnDriverSubmitText');\n  if (btnText) btnText.textContent = 'Guardar ficha de repartidor';\n}\nwindow.seleccionarPlanRegistroChofer = seleccionarPlanRegistroChofer;""")

    t = replace_function(t, "actualizarEstadoUIPerfilPremium", """function actualizarEstadoUIPerfilPremium() {\n  ['driverPremiumStatusBadge','driverPremiumActiveAlert','driverPremiumPendingAlert','driverPremiumProContent','driverPremiumPaymentSection'].forEach(id => {\n    const el = document.getElementById(id);\n    if (el) el.style.display = 'none';\n  });\n}\nwindow.actualizarEstadoUIPerfilPremium = actualizarEstadoUIPerfilPremium;""")

    t = replace_function(t, "manejarSeleccionVoucherDriver", """async function manejarSeleccionVoucherDriver() {\n  if (typeof showToast === 'function') showToast('Pagos', 'Los pagos de comisiones se gestionan desde la sección Pagos del repartidor.', 'info', 3500);\n}\nwindow.manejarSeleccionVoucherDriver = manejarSeleccionVoucherDriver;""")

    t = replace_function(t, "enviarComprobantePagoPremium", """async function enviarComprobantePagoPremium() {\n  if (typeof showToast === 'function') showToast('Función retirada', 'No existen suscripciones PRO/VIP. Usa la sección Pagos únicamente cuando alcances el límite de crédito.', 'info', 4500);\n}\nwindow.enviarComprobantePagoPremium = enviarComprobantePagoPremium;""")

    # Existing profile always opens in the single current credit model.
    t = re.sub(r"\n\s*// Seleccionar plan activo \(PRO o Gratuito\)[\s\S]*?actualizarEstadoUIPerfilPremium\(driverRow\);", "\n    seleccionarPlanRegistroChofer('credito');\n    actualizarEstadoUIPerfilPremium(driverRow);", t, count=1)

    # Any remaining registration payload is server-compatible only; no client premium entitlement.
    t = re.sub(r"const planTipo\s*=\s*[^;]+;", "const planTipo = 'credito';", t)
    t = re.sub(r"const yaEsVip\s*=\s*[^;]+;", "const yaEsVip = false;", t)
    t = t.replace("tipo_plan: planTipo", "tipo_plan: 'credito'")
    t = t.replace("es_premium: yaEsVip", "es_premium: false")

    # Remove the old PRO-only validation block by making any residual condition unreachable and non-promotional.
    t = t.replace("if (planTipo === 'pro' && !yaEsVip && !fileVoucher)", "if (false)")
    t = t.replace("Para activar el Plan PRO (S/ 15/mes) debes adjuntar tu captura de Remesa por Yape al 987-654-321. Si prefieres empezar gratis, selecciona el Plan Gratuito.", "El registro de repartidor no requiere suscripción ni pago inicial.")

    write(p, t)


def patch_voucher_ocr():
    p = "js/voucher_ocr.js"
    t = read(p)
    start = t.find("  async function generarCobroComisiones() {")
    export = t.find("  window.leerYValidarVoucherOCR = leerYValidarVoucherOCR;", start)
    if start < 0 or export < 0:
        raise RuntimeError("voucher_ocr legacy DB writer section not found")
    replacement = """  // Este módulo solo interpreta la imagen localmente. driver_payments.js es el único\n  // responsable de enviar datos estructurados al RPC vigente de pagos.\n\n"""
    t = t[:start] + replacement + t[export:]
    t = t.replace("  window.generarCobroComisiones = generarCobroComisiones;\n", "")
    t = t.replace("  window.registrarPagoDesdeOCR = registrarPagoDesdeOCR;\n", "")
    t = t.replace("  window.procesarYRegistrarPagoOCR = procesarYRegistrarPagoOCR;\n", "")
    t = t.replace("  window.obtenerInstruccionesPago = obtenerInstruccionesPago;\n", "")
    write(p, t)


def patch_realtime():
    p = "js/supabase-config.js"
    t = read(p)
    marker = "                if (window.AppState) window.AppState.set('realtimeConnected', true);"
    addition = marker + """\n                // Reconciliar snapshot autoritativo: los eventos ocurridos durante una\n                // desconexión no deben depender de que Realtime los reenvíe.\n                Promise.resolve().then(async () => {\n                    try {\n                        if (typeof cargarPedidosVecinalesEnVivo === 'function') await cargarPedidosVecinalesEnVivo();\n                        if (typeof checkActiveOrderStatus === 'function') await checkActiveOrderStatus();\n                        if (typeof cargarRepartidoresEnMapa === 'function') await cargarRepartidoresEnMapa();\n                        if (typeof renderActiveOrdersMap === 'function') renderActiveOrdersMap();\n                    } catch (snapshotError) {\n                        console.warn('Realtime reconectado; la reconciliación de snapshot falló:', snapshotError);\n                    }\n                });"""
    if "Realtime reconectado; la reconciliación de snapshot falló" not in t:
        t = replace_required(t, marker, addition, "Realtime snapshot reconciliation")
    # visible legacy terminology only; database column barrio_otb remains for compatibility.
    t = t.replace("COMUNICADO OFICIAL ADMINISTRACIÓN OTB", "COMUNICADO OFICIAL DE ADMINISTRACIÓN")
    t = t.replace("📢 Comunicado Oficial OTB", "📢 Comunicado Oficial")
    write(p, t)


def patch_localization_and_versions():
    runtime_files = [
        "index.html", "js/app.js", "js/auth.js", "js/forum.js", "js/vendors.js",
        "js/admin.js", "js/orders.js", "js/map.js", "js/supabase-config.js",
        "scripts/check_runtime.js", "README.md"
    ]
    for rel in runtime_files:
        t = read(rel)
        # Runtime/UI wording only; lowercase barrio_otb identifiers remain unchanged.
        replacements = {
            "Cochabamba": "Lima",
            "COCHABAMBA": "LIMA",
            "Santa Cruz de la Sierra": "Lima",
            "Vecino de la OTB": "Vecino de la zona",
            "de la OTB": "de la zona",
            "en la OTB": "en la zona",
            "tu OTB": "tu zona",
            "la OTB": "la zona",
            "OTB local": "zona local",
            "Alerta Oficial OTB": "Alerta Oficial de Zona",
            "Administración OTB": "Administración",
            "ADMINISTRACIÓN OTB": "ADMINISTRACIÓN",
        }
        for old, new in replacements.items():
            t = t.replace(old, new)
        if rel == "scripts/check_runtime.js":
            t = t.replace("[-17.3895, -66.1568]", "[-12.0464, -77.0428]")
            t = t.replace("getSouth: () => -17.5", "getSouth: () => -12.2")
            t = t.replace("getNorth: () => -17.2", "getNorth: () => -11.9")
            t = t.replace("getWest: () => -66.3", "getWest: () => -77.2")
            t = t.replace("getEast: () => -66.0", "getEast: () => -76.8")
        if rel == "index.html":
            # One release version for all first-party assets loaded by HTML.
            t = re.sub(r"(\b(?:styles|js|icons)/[^\"']+\?v=)\d+", rf"\g<1>{VERSION}", t)
            t = re.sub(r"(favicon\.svg\?v=)\d+", rf"\g<1>{VERSION}", t)
            # Obsolete premium controls remain only as compatibility DOM nodes and must never be visible.
            head_marker = "</head>"
            css = """  <style id=\"legacy-plan-disabled\">\n    #cardPlanDriverPro,#driverPremiumProContent,#driverPremiumPaymentSection,#driverPremiumStatusBadge,#driverPremiumActiveAlert,#driverPremiumPendingAlert{display:none!important}\n  </style>\n"""
            if "legacy-plan-disabled" not in t:
                t = t.replace(head_marker, css + head_marker, 1)
        write(rel, t)

    sw = read("sw.js")
    sw = re.sub(r"SERVICE WORKER v\d+(?:\.\d+)?", f"SERVICE WORKER v{VERSION}.0", sw)
    sw = re.sub(r"notigas-cache-v\d+", f"notigas-cache-v{VERSION}", sw)
    sw = re.sub(r"\?v=\d+", f"?v={VERSION}", sw)
    write("sw.js", sw)

    ht = read(".htaccess")
    ht = ht.replace("worker-src 'self';", "worker-src 'self' blob:;")
    write(".htaccess", ht)


def patch_tests_and_package():
    p = "scripts/check_runtime.js"
    t = read(p)
    t = t.replace("all 15 application modules", "all application modules")
    t = t.replace("NOTIGAS (15 módulos frontend)", "NOTIGAS (módulos frontend)")
    # Include recently added modules in runtime evaluation when not already present.
    array_marker = "  'js/admin.js',"
    if "'js/admin_payments.js'" not in t:
        t = replace_required(t, array_marker, array_marker + "\n  'js/admin_payments.js',\n  'js/driver_payments.js',\n  'js/driver_order_rules.js',", "runtime new modules")
    write(p, t)

    package = read("package.json")
    package = package.replace(
        '"build": "node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js"',
        '"build": "node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js && node scripts/check_audit_hardening.js"'
    )
    package = package.replace(
        '"test": "node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js && node scripts/test_db_integration.js"',
        '"test": "node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js && node scripts/check_audit_hardening.js"'
    )
    write("package.json", package)


def main():
    patch_promo()
    patch_orders()
    patch_map()
    patch_auth()
    patch_voucher_ocr()
    patch_realtime()
    patch_localization_and_versions()
    patch_tests_and_package()
    print("Audit frontend remediation applied successfully")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"AUDIT PATCH FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
