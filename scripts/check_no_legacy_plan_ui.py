#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guardia de UI heredada: NOTIGAS Bolivia no tiene selector de planes ni prueba
gratis. Solo lectura.

Reemplaza a scripts/normalize_recolector_free_trial.js. Aquel script era un
MUTADOR de la epoca Peru y hacia dos cosas incompatibles con el producto
actual:

  1. En modo --check exigia copy que ya no existe ("PRUEBA GRATIS" y
     "Los primeros 100 pedidos son gratis ... S/ 0,20 por balon"), asi que
     rompia CI.
  2. En modo normal REESCRIBIA index.html y js/auth.js para reintroducir esa
     copy. Es decir, el guard de CI era tambien el que podia devolver el
     producto a Peru si alguien lo ejecutaba sin --check.

Aqui se conserva lo util (la lista de tokens de UI heredada que no debe
reaparecer) y se descarta la parte peligrosa: este script no escribe nada.
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


print("=" * 68)
print("GUARDIA DE UI HEREDADA: sin planes, sin prueba gratis (Bolivia)")
print("=" * 68)

index_html = leer("index.html")
auth_js = leer("js/auth.js")

# --- 1. Tokens de la UI de planes que no debe reaparecer -----------------
print("\n[1/3] Tokens de UI de planes heredados ausentes de index.html")
TOKEN_HEREDADOS = [
    "Elige tu Modalidad de Registro",
    "Plan Gratuito",
    "Pedidos con <strong>3 min de espera</strong>",
    "En mapa clientes con <strong>1 min de espera</strong>",
    "Ficha basica sin corona VIP",
    "Ficha b\u00e1sica sin corona VIP",
    'id="cardPlanRecolectorPro"',
    'id="cardPlanRecolectorGratuito"',
    'id="btnCambiarAProDesdeGratuito"',
    'id="recolectorPremiumGratuitoContent"',
    "legacy-plan-disabled",
]
for token in TOKEN_HEREDADOS:
    revisar("index.html no contiene %r" % token[:44], token not in index_html)

# El contenedor conserva un id de la epoca Peru, pero su contenido se
# reutilizo para Bolivia. No se prohibe el id (auth.js lo usa): se verifica
# que muestre el copy correcto.
revisar(
    "el bloque de registro declara SIN COMISION (Bolivia)",
    re.search(r"SIN COMISI[O\u00D3]N", index_html),
)
revisar(
    "el bloque de registro menciona los pagos con QR local",
    re.search(r"QR local", index_html),
)
revisar(
    "el campo de modalidad unica vale 'sin_comision'",
    'id="inputRecolectorPlanTipo" value="sin_comision"' in index_html,
)

# --- 2. Copy comercial de la prueba gratis -------------------------------
print("\n[2/3] Copy de prueba gratis y tarifas soles ausente")
COPY_HEREDADO = [
    ("banner de prueba gratis", "PRUEBA GRATIS"),
    ("mensaje de 100 pedidos gratis", "100 pedidos son gratis"),
    ("primeros 100 pedidos gratuitos", "100 pedidos confirmados son gratuitos"),
    ("tarifa S/ 0,20 por balon", "S/ 0,20 por bal"),
    ("primer ciclo cobrable de 100 pedidos", "100 pedidos = S/ 20"),
]
for etiqueta, token in COPY_HEREDADO:
    revisar("index.html no muestra el %s" % etiqueta, token not in index_html)
    revisar("js/auth.js no muestra el %s" % etiqueta, token not in auth_js)

# El texto de excepcion es la version corregida de un toast que si existia.
revisar(
    "el aviso de alta del recolector ya no promete pedidos gratuitos",
    not re.search(r"100 pedidos[^.]{0,40}gratuit", auth_js, re.IGNORECASE),
)
revisar(
    "el aviso de alta del recolector declara que opera sin cobros",
    re.search(r"Operas sin comisiones, sin saldos pendientes y sin cobros", auth_js),
    "falta el texto Bolivia del aviso de alta",
)

# --- 3. Modalidad unica de registro ---------------------------------------
print("\n[3/3] Modalidad unica de registro (sin ramas PRO/VIP)")
revisar(
    "auth.js conserva seleccionarPlanRegistroChofer",
    "function seleccionarPlanRegistroChofer" in auth_js,
)
revisar(
    "seleccionarPlanRegistroChofer fija la modalidad Bolivia",
    re.search(
        r"function\s+seleccionarPlanRegistroChofer\s*\(\)\s*\{[\s\S]{0,400}?"
        r"inputRecolectorPlanTipo[\s\S]{0,120}?value\s*=\s*'sin_comision'",
        auth_js,
    ),
    "no fija 'sin_comision' (queda 'credito', valor Peru heredado)",
)
revisar(
    "no queda la rama de plan 'pro' en el alta",
    not re.search(r"planTipo\s*===\s*['\"]pro['\"]", auth_js),
)
revisar(
    "no queda el cobro de comprobante Premium en el alta",
    not re.search(r"si eligi[oó] PRO|comprobante.*[Pp]remium", auth_js),
)

print("\n" + "=" * 68)
if fallos:
    print("FALLARON %d de %d verificaciones:" % (len(fallos), pasos))
    for f in fallos:
        print("  - %s" % f)
    print("=" * 68)
    sys.exit(1)

print("OK: %d verificaciones. Sin UI heredada de planes ni prueba gratis." % pasos)
print("=" * 68)
sys.exit(0)
