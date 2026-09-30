#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Invariantes de seguridad y auditoria de NOTIGAS Bolivia.

Reemplaza a scripts/check_audit_hardening.js, que era un guardia de la era
Peru. Fallaba en ~12 aserciones porque exigia un modelo de producto
eliminado (100 pedidos gratis, S/0,20 por balon, ciclo de S/50, 250
balones, Yape Remesas, limites de credito), y dos de sus aserciones estaban
invertidas para Bolivia:

  - Exigia que NINGUN archivo contuviera "Cochabamba".
  - Exigia que el README NO describiera Bolivia.

Se conserva todo lo que sigue siendo una garantia de seguridad real
(CSP, suspension neutral, OCR fail-closed, capa de privacidad, estrategia
de cache, migraciones criticas, ausencia de prioridad PRO) y se eliminan las
aserciones que describian cobros que ya no existen.
"""

import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

fallos = []
pasos = 0


def leer(rel):
    with open(os.path.join(RAIZ, rel), "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def revisar(descripcion, condicion, detalle=""):
    global pasos
    pasos += 1
    if condicion:
        print("  [OK]   %s" % descripcion)
    else:
        print("  [FALLA] %s" % descripcion)
        if detalle:
            print("          -> %s" % detalle)
        fallos.append(descripcion)


def sin(re_, txt):
    return not re.search(re_, txt, re.IGNORECASE | re.MULTILINE)


def con(re_, txt):
    return bool(re.search(re_, txt, re.IGNORECASE | re.MULTILINE))


def sin_en(descripcion, ruta, patron, motivo):
    revisar(descripcion, sin(patron, leer(ruta)), "%s: %s" % (ruta, motivo))


def con_en(descripcion, ruta, patron, motivo):
    revisar(descripcion, con(patron, leer(ruta)), "%s: %s" % (ruta, motivo))


print("=" * 70)
print("INVARIANTES DE AUDITORIA Y SEGURIDAD (NOTIGAS Bolivia)")
print("=" * 70)

# --- 1. Higiene de codigo ------------------------------------------------
print("\n[1/7] Higiene de codigo y CSP")
sin_en("device_security.js sin JavaScript invalido en document.cookie",
        "js/device_security.js", r"document\.cookie\s*=\s*\$\{", "cookie mal formado")
con_en("CSP de .htaccess permite el worker de OCR",
        ".htaccess", r"worker-src 'self' blob:", "falta worker-src")
con_en("supabase-config.js reconcilia el snapshot de Realtime",
        "js/supabase-config.js", r"reconciliaci[oó]n de snapshot fall[oó]",
        "Realtime no reconcilia tras reconectar")

# --- 2. Bolivia: el telefono es +591 -------------------------------------
print("\n[2/7] Identidad de Bolivia en los puntos de contacto")
# La version Peru exigia que NO hubiera +591 (Peru es +51). En Bolivia +591
# es el prefijo correcto, asi que la asercion esta invertida.
con_en("promo.js usa el prefijo telefonico boliviano +591",
        "js/promo.js", r"\+591", "falta el prefijo +591")
sin_en("promo.js no conserva el fallback peruano +51",
        "js/promo.js", r"wa\.me/51(?!1)|59170000000", "queda un numero peruano")

# --- 3. Sin prioridad PRO ni cortes semanales ----------------------------
print("\n[3/7] Sin Ventaja PRO ni cortes por monto")
sin_en("mapa sin prioridad PRO",
        "js/map.js", r"PRO_ORDER_ADVANTAGE_MS|PRO_BUYER_ADVANTAGE_MS|isCurrentDriverVip",
        "queda prioridad PRO")
sin_en("directorio sin ordenamiento PRO",
        "js/vendors.js", r"Prioridad para repartidores PRO", "queda prioridad PRO")
sin_en("auth sin promocion a PRO",
        "js/auth.js", r"Puedes pasar a PRO|Repartidor PRO Activado|3 minutos de ventaja",
        "queda promocion PRO")
sin_en("registro sin contrato S/15 ni corte semanal",
        "index.html",
        r"S/\s*15(?:\.00)?(?:\s*PEN|\s*/\s*mes|/mes)|Corte Semanal:|Baneo Definitivo de Dispositivo",
        "contrato Peru S/15 o corte semanal")

# --- 4. Suspension administrativa neutral --------------------------------
print("\n[4/7] Suspension administrativa neutral y reversible")
con_en("admin_users.js usa el motivo neutral de suspension",
        "js/admin_users.js", r"p_motivo:\s*['\"]Suspensi[oó]n administrativa['\"]",
        "motivo no neutral")
con_en("admin_users.js restaura estado_servicio activo al desbloquear",
        "js/admin_users.js", r"estado_servicio:\s*['\"]activo['\"]",
        "no restaura estado activo")
sin_en("admin_users.js no llama cortes ni baneos semanales",
        "js/admin_users.js",
        r"\.rpc\(\s*['\"]rpc_ejecutar_(?:corte_semanal_comisiones|baneo_semanal_morosos)['\"]",
        "proceso semanal reinstated")
sin_en("admin_users.js sin el mensaje de falta de pago por comision",
        "js/admin_users.js", r"Falta de pago de comisi[oó]n", "modelo de deuda reintroducido")

# --- 5. Pagos: sin persistencia financiera --------------------------------
print("\n[5/7] Sin cobros de reparto ni persistencia financiera")
# El reparto es gratuito y no tiene comisiones. El OCR de comprobantes existe
# SOLO para la publicidad pagada (rpc_publicar_anuncio_pagado); nunca para
# cobrar el reparto.
sin_en("el OCR de vouchers no se usa para cobrar el reparto",
        "js/driver_payments.js", r"voucher_ocr",
        "driver_payments.js usa OCR de vouchers para cobrar")
revisar("el OCR de vouchers, si existe, solo lo consume la publicidad pagada",
        (not os.path.exists(os.path.join(RAIZ, "js", "voucher_ocr.js")))
        or os.path.exists(os.path.join(RAIZ, "js", "publicidad_paga.js")),
        "js/voucher_ocr.js existe sin un modulo de publicidad pagada")
sin_en("index.html no carga el OCR de vouchers",
        "index.html", r"voucher_ocr\.js", "se reimidio el OCR de comprobantes QR")
# El panel de pagos es informativo: no debe hacer aritmetica de moneda.
sin_en("admin_payments.js sin logica de moneda BOB",
        "js/admin_payments.js", r"\bBOB\b|monto_recibido_bob", "aritmetica de moneda")
con_en("admin_payment_config.js neutraliza el admin Premium heredado",
        "js/admin_payment_config.js", r"disableLegacyPremiumAdmin", "no neutraliza Premium")
sin_en("admin_payment_config.js no invoca el RPC de escritura de cobros",
        "js/admin_payment_config.js", r"rpc_admin_set_payment_config",
        "sigue escribiendo la configuracion de cobro")
sin_en("admin_payments.js sin baneo financiero definitivo",
        "js/admin_payments.js",
        r"baneo permanente|Un pago posterior no levantar[aá] este baneo",
        "baneo por deuda")

# --- 6. Capa de privacidad y cache ---------------------------------------
print("\n[6/7] Capa de privacidad y estrategia de cache")
con_en("state.js carga order_privacy_layer.js",
        "js/state.js", r"order_privacy_layer", "no carga la capa de privacidad")
sw = leer("sw.js")
revisar("el service worker declara una cache versionada",
        bool(re.search(r"CACHE_NAME\s*=\s*['\"]notigas-cache-v\d+['\"]", sw)))
revisar("el service worker NO precachea order_privacy_layer.js",
        not re.search(r"order_privacy_layer\.js\?v=\d+", sw),
        "la capa de privacidad compite en el precache inicial")
revisar("el service worker no fuerza recargas duplicadas en install",
        "fetch(asset, { cache: 'reload' })" not in sw)
revisar("el service worker documenta stale-while-revalidate",
        con(r"stale-while-revalidate", sw))

# El numero de version de assets no se fija en el test: se exige coherencia.
idx = leer("index.html")
versiones = re.findall(r"(?:styles|js)/[^\"']+\?v=(\d+)", idx)
revisar("index.html tiene assets versionados", bool(versiones))
if versiones:
    unicas = sorted(set(versiones))
    revisar("todos los assets versionados comparten una version",
            len(unicas) == 1, "versiones: %s" % ", ".join(unicas))
    revisar("el service worker precachea la misma version que index.html",
            all(("?v=" + unicas[0]) in leer("sw.js") for _ in [0]) or
            ("main.css?v=%s" % unicas[0]) in leer("sw.js"),
            "sw.js precachea otra version")

runtime = leer("scripts/check_runtime.js")
for mod in ["js/admin_payments.js", "js/admin_payment_config.js",
            "js/driver_payments.js", "js/driver_order_rules.js"]:
    revisar("check_runtime.js carga %s" % mod, "'%s'" % mod in runtime)

# --- 7. Migraciones criticas presentes ----------------------------------
print("\n[7/7] Migraciones criticas presentes (el registro historico no se toca)")
MIG_DIR = os.path.join(RAIZ, "supabase", "migrations")
mig = set(os.listdir(MIG_DIR))
CRITICAS = [
    "20260910192243_credit_suspension_identifiers_and_reconciliation.sql",
    "20260910205311_fix_device_block_rpc_overload_ambiguity_v2.sql",
    "20260910205729_remove_release_penalty_align_credit_contract.sql",
    "20260910220052_remove_obsolete_weekly_financial_rpcs.sql",
    "20260910225938_driver_50_free_and_progressive_credit_tiers.sql",
    "20260910234110_make_payment_suspensions_reversible_on_full_payment.sql",
    "20260911020205_preprod_states_routes_privacy.sql",
    "20260911020236_preprod_payment_configuration.sql",
    "20260911020258_preprod_ocr_fail_closed.sql",
    "20260915041809_preprod_reconcile_payment_contract_rls.sql",
    "20260911022526_secure_order_radar_and_registered_driver_visibility.sql",
    "20260916005326_restrict_order_radar_to_active_drivers.sql",
    "20260916005329_buyer_published_price_complaint.sql",
    "20260916005332_set_yape_mobile_wallet_delivery_method.sql",
]
faltan = [m for m in CRITICAS if m not in mig]
revisar("estan las %d migraciones criticas" % len(CRITICAS), not faltan,
        "faltan: %s" % ", ".join(faltan))

# El OCR debe seguir fallando cerrado.
ocr = leer("supabase/migrations/20260911020258_preprod_ocr_fail_closed.sql")
revisar("el OCR de servidor sigue fallando cerrado",
        con(r"No se detect[oó] el nombre del destinatario", ocr))
revisar("las suspensiones siguen siendo reversibles",
        con(r"WHEN v_full_payment THEN 'activo'",
            leer("supabase/migrations/20260910234110_make_payment_suspensions_reversible_on_full_payment.sql")))

print("\n" + "=" * 70)
if fallos:
    print("FALLARON %d de %d verificaciones:" % (len(fallos), pasos))
    for f in fallos:
        print("  - %s" % f)
    print("=" * 70)
    sys.exit(1)

print("OK: %d verificaciones. Invariantes de auditoria intactas." % pasos)
print("=" * 70)
sys.exit(0)
