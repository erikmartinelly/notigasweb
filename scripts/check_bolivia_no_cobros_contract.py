#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contrato vigente de NOTIGAS Bolivia: sin cobros por pedido, pago por QR local.

Este script REEMPLAZA a dos verificadores de la era Peru que ya no tenian
sentido y fallaban porque exigian un producto que ya no existe:

  - scripts/check_yape_remittance_contract.js  (exigia Yape Remesas a Bolivia)
  - test_financial_parameters.py               (exigia S/ 0.20 por balon y
                                               "100 pedidos" de prueba gratis)

Un CI que obliga a mantener "S/ 0,20 por balon" en un producto que no cobra
nada es un guardia que empuja hacia atras. Este script protege en su lugar los
invariantes que hoy importan.

Las migraciones historicas NO se tocan ni se escanean: son registro fiel de
como estaba el producto. Solo se verifican de forma positiva las migraciones
nuevas de Bolivia.
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


def js_files():
    d = os.path.join(RAIZ, "js")
    return sorted(f for f in os.listdir(d) if f.endswith(".js"))


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


def citas(texto, patron, limite=3):
    """Devuelve las lineas que hacen match, para diagnosticar fallos."""
    out = []
    rx = re.compile(patron, re.IGNORECASE)
    for i, linea in enumerate(texto.splitlines(), 1):
        if rx.search(linea):
            out.append("L%d: %s" % (i, linea.strip()[:100]))
            if len(out) >= limite:
                break
    return "; ".join(out)


# ---------------------------------------------------------------------------
print("=" * 68)
print("CONTRATO NOTIGAS BOLIVIA: sin cobros, pago por QR local")
print("=" * 68)

codigo = {f: leer("js/" + f) for f in js_files()}
index_html = leer("index.html")
notigas_bo = leer("js/notigas_bo.js")
driver_pagos = leer("js/driver_payments.js")
mapa_js = leer("js/map.js")
todo_js = "\n".join(codigo.values())

# --- 1. Moneda: nada de soles -------------------------------------------
print("\n[1/9] Moneda boliviana (Bs), sin soles")
revisar(
    "js/ no usa el simbolo de soles (S/importe)",
    not re.search(r"S/\s*\d", todo_js),
    citas(todo_js, r"S/\s*\d"),
)
revisar(
    "index.html no usa el simbolo de soles (S/importe)",
    not re.search(r"S/\s*\d", index_html),
    citas(index_html, r"S/\s*\d"),
)
revisar(
    "no queda la palabra 'soles' en el codigo activo",
    not re.search(r"\bsoles\b", todo_js + index_html, re.IGNORECASE),
    citas(todo_js + index_html, r"\bsoles\b"),
)
revisar(
    "js/notigas_bo.js declara bolivianos (Bs / BOB)",
    "BOB" in notigas_bo and "Bs" in notigas_bo,
)

# --- 2. Yape fuera del flujo de pago ------------------------------------
print("\n[2/9] Yape fuera del flujo de pago")
revisar(
    "js/driver_payments.js no menciona Yape",
    not re.search(r"yape", driver_pagos, re.IGNORECASE),
    citas(driver_pagos, r"yape"),
)
revisar(
    "el modulo de OCR de vouchers se elimino (el servicio es gratuito)",
    "voucher_ocr.js" not in codigo,
    "voucher_ocr.js sigue en el arbol",
)
revisar(
    "js/driver_payments.js aclara que no hay comision",
    re.search(r"no hay comis", driver_pagos, re.IGNORECASE),
    "falta el texto de 'no hay comision'",
)

# --- 3. Nada de llamadas a objetos ya eliminados -------------------------
print("\n[3/9] Sin llamadas a tablas/RPCs de comisiones (eliminados en BD)")
ELIMINADOS = [
    "rpc_generar_cobro_comisiones",
    "rpc_liquidar_comisiones_chofer",
    "rpc_registrar_ocr_pago",
    "rpc_admin_set_payment_config",
    "rpc_admin_list_commission_vouchers",
    "rpc_admin_review_commission_voucher",
    "rpc_suspender_repartidor_mora",
]
for rpc in ELIMINADOS:
    llamadas = [f for f, txt in codigo.items() if re.search(r"rpc\(\s*['\"]%s" % re.escape(rpc), txt)]
    revisar(
        "ningun modulo llama %s" % rpc,
        not llamadas,
        "llamado en: %s" % ", ".join(llamadas),
    )

# --- 4. Ciudad por defecto Bolivia --------------------------------------
print("\n[4/9] Ciudad por defecto: Cochabamba, no Lima")
revisar(
    "js/ no usa 'lima' como valor de ciudad",
    not re.search(r"""['\"]lima['\"]""", todo_js),
    citas(todo_js, r"""['\"]lima['\"]"""),
)
revisar(
    "index.html no usa 'lima' como valor de ciudad",
    not re.search(r"""['\"]lima['\"]""", index_html),
    citas(index_html, r"""['\"]lima['\"]"""),
)
revisar(
    "js/notigas_bo.js fija cochabamba como ciudad predeterminada",
    re.search(r"CIUDAD_PREDETERMINADA\s*=\s*['\"]cochabamba['\"]", notigas_bo),
)

# --- 5. Identidad de Bolivia ---------------------------------------------
print("\n[5/9] Identidad de Bolivia")
for etiqueta, patron in [
    ("prefijo telefonico +591", r"\+591|['\"]591['\"]"),
    ("moneda BOB", r"BOB"),
    ("locale es-BO", r"es-BO"),
    ("documento CI o NIT", r"CI\s*(o|/)\s*NIT|CI o NIT"),
    ("huso America/La_Paz", r"America/La_Paz"),
]:
    revisar("js/notigas_bo.js declara %s" % etiqueta, re.search(patron, notigas_bo))

# --- 6. Las 9 ciudades de Bolivia ---------------------------------------
print("\n[6/9] Las 9 ciudades de Bolivia en mapa y selector")
CIUDADES = [
    "cochabamba", "lapaz", "santacruz", "sucre",
    "oruro", "potosi", "tarija", "trinidad", "cobija",
]
faltan_mapa = [c for c in CIUDADES if ('key: "%s"' % c) not in mapa_js]
revisar("js/map.js declara las 9 ciudades", not faltan_mapa, "faltan: %s" % ", ".join(faltan_mapa))
faltan_html = [c for c in CIUDADES if ('value="%s"' % c) not in index_html]
revisar("index.html ofrece las 9 ciudades", not faltan_html, "faltan: %s" % ", ".join(faltan_html))
revisar(
    "el mapa consulta countrycodes=bo en Nominatim",
    "countrycodes=bo" in leer("js/map_search.js"),
)

# --- 7. Sin cobros: coherencia de mensajes -------------------------------
print("\n[7/9] Coherencia del mensaje 'sin cobros'")
revisar(
    "index.html declara que NOTIGAS no procesa ni custodia fondos",
    re.search(r"no procesa, recauda ni custodia fondos", index_html, re.IGNORECASE),
)
revisar(
    "index.html declara que no hay cobros ni saldos de credito",
    re.search(r"no hay cobros|saldo[s]? pendiente|limite[s]? de cr", index_html, re.IGNORECASE),
)

# --- 8. Materiales del recolector (multi-material de reciclaje) -----------
print("\n[8/9] Materiales del recolector (multi-material de reciclaje)")
revisar(
    "index.html ofrece seleccion de materiales de reciclaje",
    'id="driverMaterialesPicker"' in index_html,
)
revisar(
    "index.html ya no ofrece 'Compra de sal'",
    'value="Compra de sal"' not in index_html,
)
revisar(
    "index.html ya no ofrece 'Afilado de cuchillos'",
    'value="Afilado de cuchillos"' not in index_html,
)

# --- 9. Migraciones nuevas de Bolivia ------------------------------------
print("\n[9/9] Migraciones de Bolivia aplicadas y coherentes")
mig_dir = os.path.join(RAIZ, "supabase", "migrations")
migs = sorted(f for f in os.listdir(mig_dir) if f.endswith(".sql"))

mig_no_cobros = [f for f in migs if "sin_cobros" in f]
mig_contacto = [f for f in migs if "visibilidad_contacto" in f]
mig_ciudad = [f for f in migs if "ciudad_por_defecto" in f]

revisar("existe la migracion que elimina los cobros", bool(mig_no_cobros))
revisar("existe la migracion de visibilidad del contacto", bool(mig_contacto))
revisar("existe la migracion de ciudad por defecto", bool(mig_ciudad))

if mig_no_cobros:
    txt = leer("supabase/migrations/" + mig_no_cobros[0])
    revisar(
        "la migracion de cobros elimina pagos_comisiones",
        re.search(r"drop\s+table[^;]*pagos_comisiones", txt, re.IGNORECASE),
    )
    revisar(
        "la migracion de cobros deja la entrega sin comision por pedido",
        re.search(r"fn_contabilizar_entrega_confirmada", txt, re.IGNORECASE),
    )

if mig_ciudad:
    txt = leer("supabase/migrations/" + mig_ciudad[0])
    revisar(
        "la migracion de ciudad fija cochabamba por defecto",
        re.search(r"set\s+default\s+'cochabamba'", txt, re.IGNORECASE),
    )

if mig_contacto:
    txt = leer("supabase/migrations/" + mig_contacto[0])
    revisar(
        "la migracion de contacto crea la politica de repartidores",
        re.search(r"pedidos_select_drivers_contacto", txt),
    )

# --- Extra: cache-bust coherente -----------------------------------------
print("\n[extra] Cache-bust coherente en index.html")
versiones = re.findall(r"js/[\w\-]+\.js\?v=(\d+)", index_html)
if versiones:
    unicas = sorted(set(versiones))
    revisar(
        "todos los scripts locales comparten una sola version de cache",
        len(unicas) == 1,
        "versiones encontradas: %s" % ", ".join(unicas),
    )
else:
    revisar("index.html declara versiones de cache en los scripts", False)

# ---------------------------------------------------------------------------
print("\n" + "=" * 68)
if fallos:
    print("FALLARON %d de %d verificaciones:" % (len(fallos), pasos))
    for f in fallos:
        print("  - %s" % f)
    print("=" * 68)
    sys.exit(1)

print("OK: %d verificaciones. Contrato Bolivia sin cobros intacto." % pasos)
print("=" * 68)
sys.exit(0)
