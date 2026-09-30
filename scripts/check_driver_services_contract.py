#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contrato del repartidor en NOTIGAS Bolivia: servicios (sal, afilado) y
suspension por estado de servicio. Sin planes, sin credito, sin prueba gratis.

Reemplaza a scripts/test_driver_plans.js, que era un test vacio: definia
constantes de la epoca Peru (100 pedidos gratis, S/0.20 por balon, ciclos de
S/50) y luego assertaba esas constantes contra si mismo, sin leer nunca el
codigo de la aplicacion. Siempre pasaba, y su mensaje de salida imprimia una
politica de cobro que el producto ya no tiene.
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


def sin_limpiezas(texto):
    """
    Neutraliza los ARGUMENTOS REGEX de .replace(...) y .test(...).

    La app neutraliza activamente texto peruano heredado que todavia puede
    llegar desde la base de datos, por ejemplo:

        .replace(/Comision de S\\/0.20 por balon/gi, 'Sin comision por balon')
        if (/Acceso Gratuito.*Plan PRO/i.test(text)) { ... }

    Ese codigo es correcto y es justo lo que queremos. El patron viejo no debe
    contar como fuga, pero el texto de reemplazo Bolivia si debe quedar
    visible para el resto de verificaciones.

    Se self-testea al final del script: la neutralizacion no puede volverse una
    puerta trasera que oculte una fuga real.
    """
    patron_regex = r"/(?:\\.|[^/\\])*/[gimsuy]*"
    texto = re.sub(r"\.replace\(\s*" + patron_regex, ".replace(/__SANEADO__/", texto)
    texto = re.sub(r"\.test\(\s*" + patron_regex, ".test(/__SANEADO__/", texto)
    # El regex como receptor: /Plan PRO/i.test(text)
    texto = re.sub(patron_regex + r"\s*\.\s*test\(", "/__SANEADO__/.test(", texto)
    return texto


def citas(texto, patron, limite=3):
    out = []
    rx = re.compile(patron, re.IGNORECASE)
    for i, linea in enumerate(texto.splitlines(), 1):
        if rx.search(linea):
            out.append("L%d: %s" % (i, linea.strip()[:100]))
            if len(out) >= limite:
                break
    return "; ".join(out)


print("=" * 68)
print("CONTRATO DEL REPARTIDOR: servicios y suspension (Bolivia, sin cobros)")
print("=" * 68)

index_html = leer("index.html")
auth_js = leer("js/auth.js")
reglas_js = leer("js/driver_order_rules.js")
pagos_js = leer("js/driver_payments.js")

# --- 1. Checkboxes de materiales del recolector ------------------------
print("\n[1/5] Materiales ofrecidos en el registro del recolector")
cbs = re.findall(r'name="driverMaterial"[^>]*value="([^"]+)"', index_html)
revisar("index.html declara checkboxes de materiales", len(cbs) >= 5, "encontrados: %s" % cbs)
revisar("el material 'plastico' esta disponible", "plastico" in cbs)
revisar("el material 'papel' esta disponible", "papel" in cbs)
revisar("el material 'chatarra' esta disponible", "chatarra" in cbs)
revisar("el material 'botellas' esta disponible", "botellas" in cbs)
revisar("el material 'organico' esta disponible", "organico" in cbs)
revisar(
    "el picker de materiales driverMaterialesPicker existe",
    'id="driverMaterialesPicker"' in index_html,
)

# --- 2. El registro captura y propaga los materiales ---------------------
print("\n[2/5] El registro captura y propaga los materiales")
revisar(
    "auth.js lee los materiales marcados",
    re.search(r"function\s+leerMaterialesRecolector", auth_js),
)
revisar(
    "auth.js serializa los materiales marcados",
    re.search(r"function\s+serializarMaterialesRecolector", auth_js),
)
revisar(
    "auth.js re-selecciona los materiales al editar",
    re.search(r"function\s+aplicarMaterialesEnFormulario", auth_js),
)
revisar(
    "los materiales se sincronizan con inputDriverCat",
    re.search(r"sincronizarMaterialesRecolector", auth_js)
    or re.search(r"inputDriverCat", auth_js),
)

# --- 3. Suspension por estado de servicio --------------------------------
print("\n[3/5] Suspension y bloqueo del repartidor")
revisar(
    "las reglas leen estado_servicio del repartidor",
    re.search(r"estado_servicio", reglas_js),
)
revisar(
    "las reglas impiden operar a un repartidor baneado",
    re.search(r"bloqueado", reglas_js),
)
revisar(
    "las reglas incluyen una guarda de suspension",
    re.search(r"suspend|bloquead", reglas_js, re.IGNORECASE),
)

# --- 4. Sin planes ni credito (la epoca Peru ya no aplica) ---------------
print("\n[4/5] Sin planes, credito ni prueba gratis")
codigo_activo = sin_limpiezas(index_html + pagos_js + reglas_js)
CONCEPTOS_VIEJOS = [
    ("planes de suscripción", r"Plan Gratuito|Plan\s+Pro|plan premium|Plan Premium"),
    ("prueba gratis", r"PRUEBA GRATIS|prueba gratis"),
    ("espera de 3 minutos como beneficio", r"3 min de espera|3 minutos de espera"),
    ("corona VIP", r"corona VIP|Corona VIP"),
    ("ciclo cobrable", r"ciclo cobrable"),
    ("saldos de credito por pedido", r"credito por pedido|crédito por pedido"),
    ("tarifa monetaria por entrega", r"S/\s*[\d.,]+|\b[\d.,]{1,6}\s*soles\b"),
]
for etiqueta, patron in CONCEPTOS_VIEJOS:
    revisar("no queda el concepto de %s" % etiqueta,
            not re.search(patron, codigo_activo, re.IGNORECASE),
            citas(codigo_activo, patron))

revisar(
    "las reglas de pedido no calculan limites por monto de credito",
    not re.search(r"limite_credito|credito_disponible|maximo_pedidos", reglas_js, re.IGNORECASE),
    citas(reglas_js, r"limite_credito|credito_disponible|maximo_pedidos"),
)

# Positivo: el saneamiento de texto peruano heredado debe existir y apuntar
# al texto Bolivia correcto. Esto es mas valioso que el grep negativo, porque
# la app debe tolerar que la base de datos aun contenga copy de la era Peru.
# Vive en js/driver_order_rules.js -> normalizeLegacyFinancialCopy().
print("\n[4b] Saneamiento de texto peruano heredado (BD vieja -> Bolivia)")
revisar(
    "driver_order_rules.js define normalizeLegacyFinancialCopy",
    "normalizeLegacyFinancialCopy" in reglas_js,
)
for etiqueta, texto_esperado in [
    ("tarifa por balon -> 'Sin comision por balon entregado'",
     "Sin comisión por bal\u00f3n entregado"),
    ("limite de credito -> 'acceso gratuito sin cobros'",
     "acceso gratuito sin cobros"),
    ("ciclo de credito -> 'Sin cobros'", "Sin cobros"),
    ("plan heredado -> 'Acceso sin suscripcion y sin comision'",
     "Acceso sin suscripci\u00f3n y sin comisi\u00f3n por entrega"),
    ("bloqueo por deuda -> 'sin cortes por deuda ni baneos por monto'",
     "sin cortes por deuda ni baneos por monto"),
]:
    revisar("el saneamiento reescribe %s" % etiqueta, texto_esperado in reglas_js)

revisar(
    "el saneamiento detecta los planes heredados (Plan PRO / premium)",
    "/plan\\s+pro|premium|ventaja/i" in reglas_js
    and "/Acceso Gratuito.*Plan PRO/i" in reglas_js,
)

# --- 5. Los pagos no forman parte del precio -----------------------------
print("\n[5/5] El pago del repartidor no altera el contrato")
revisar(
    "el panel de pagos aclara que no hay comision",
    re.search(r"no hay comis", pagos_js, re.IGNORECASE),
)
revisar(
    "las reglas de pedido no dependen de un pago previo",
    not re.search(r"pago_verificado|verificacion_pago", reglas_js, re.IGNORECASE),
    citas(reglas_js, r"pago_verificado|verificacion_pago"),
)

print("\n" + "=" * 68)

# --- Auto-test del propio guarda -----------------------------------------
# sin_limpiezas() podria volverse una puerta trasera: si neutraliza de mas,
# el guarda dejaria de detectar fugas reales. Se comprueba con casos
# sinteticos que NO deben quedar ocultos.
print("\n[autotest] El neutralizador no puede ocultar fugas reales")
FUGAS_SINTETICAS = [
    "const tarifa = 'S/ 0.20 por balon entregado';",
    "<p>El cliente paga S/ 50 por ciclo</p>",
    "textoAMostrar = 'Plan PRO de por vida';",
    "const regla = 'ciclo cobrable de S/20';",
]
for fuga in FUGAS_SINTETICAS:
    superviviente = sin_limpiezas(fuga)
    revisar(
        "una fuga en texto normal sigue siendo detectable",
        bool(re.search(r"S/\s*[\d.,]+|Plan PRO|ciclo cobrable", superviviente, re.IGNORECASE)),
        "el neutralizador ocultó: %r" % fuga,
    )

revisar(
    "una tarifa dentro de un .replace de saneamiento SI se neutraliza",
    not re.search(
        r"S/\s*[\d.,]+",
        sin_limpiezas(".replace(/Comision S\\/ 1.00 por balon/gi, 'Sin comision')"),
    ),
)

print("\n" + "=" * 68)
if fallos:
    print("FALLARON %d de %d verificaciones:" % (len(fallos), pasos))
    for f in fallos:
        print("  - %s" % f)
    print("=" * 68)
    sys.exit(1)

print("OK: %d verificaciones. Contrato del repartidor intacto." % pasos)
print("=" * 68)
sys.exit(0)
