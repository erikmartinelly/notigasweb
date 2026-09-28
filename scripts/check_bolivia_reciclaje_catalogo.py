#!/usr/bin/env python3
"""Guard del catalogo de reciclaje de NOTIGAS Bolivia.

Comprueba que el catalogo canonico, los pines del mapa, el letrero central y
los iconos PWA no vuelvan a quedar pegados a gas/carbon, y que la separacion
recogida/compra se mantenga en cliente y servidor.

Uso: python scripts/check_bolivia_reciclaje_catalogo.py
Salida: codigo 0 si todo sigue intacto, 1 si algo se rompio.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple

RAIZ = Path(__file__).resolve().parent.parent
FALLO: List[str] = []
OK = 0

# Orden canonico acordado. El indice importa: es el orden de la UI.
# NOTIGAS es servicio de reciclaje: las cinco categorias vivas son todas
# recogida. Las seis retiradas (frutas, detergentes, sal, afilado, agua, otros)
# siguen existiendo en el catalogo historico de la base de datos para poder
# resolver y auditar pedidos antiguos, pero no se pueden volver a pedir.
CATALOGO_ESPERADO = [
    ("plastico", "recogida"),
    ("papel", "recogida"),
    ("chatarra", "recogida"),
    ("botellas", "recogida"),
    ("organico", "recogida"),
]

# Codigos que solo pueden aparecer como historico, nunca como categoria viva.
CATEGORIAS_RETIRADAS = (
    "frutas", "detergentes", "sal", "afilado", "agua", "otros",
)

# Palabras que no deben aparecer como categoria viva en superficies de producto.
LEGADO_PROHIBIDO = ("garrafa", "garrafas_agotadas", "gas glp", "carbon", "carbón", "leña", "lena")

# Archivos donde el termino puede seguir living como columna real o alias
# defensivo: ahi solo se comprueba que no se presente como categoria.
LEGADO_PERMITIDO_EN = {
    "supabase/full_production_schema.sql",
    "sw.js",  # solo si queda en un comentario de nota
}


def ok(cond: bool, msg: str) -> None:
    global OK
    if cond:
        OK += 1
        print(f"  [OK]   {msg}")
    else:
        FALLO.append(msg)
        print(f"  [FALLA] {msg}")


def leer(rel: str) -> str:
    return (RAIZ / rel).read_text(encoding="utf-8", errors="replace")


def bloque_categorias(texto: str) -> List[Tuple[str, str]]:
    """Extrae (codigo, tipo_solicitud) del array CATEGORIAS, en orden."""
    m = re.search(r"const\s+CATEGORIAS\s*=\s*\[(.*?)\];", texto, re.S)
    if not m:
        return []
    out: List[Tuple[str, str]] = []
    for linea in m.group(1).splitlines():
        cod = re.search(r"codigo:\s*'([a-z]+)'", linea)
        tipo = re.search(r"tipo_solicitud:\s*'(recogida|compra)'", linea)
        if cod:
            out.append((cod.group(1), tipo.group(1) if tipo else "?"))
    return out


def bloque_sql_catalogo(texto: str) -> List[Tuple[str, str]]:
    """Extrae (codigo, tipo) de la funcion SQL del catalogo."""
    m = re.search(
        r"notigas_catalogo_categorias\(\).*?RETURNS TABLE\((.*?)\)\s*AS\s*\$\$",
        texto, re.S,
    )
    if not m:
        return []
    cuerpo = m.group(1)
    if re.search(r"notigas_tipo_de_categoria\s*\(", cuerpo):
        cuerpo = cuerpo.replace("notigas_tipo_de_categoria(valor_codigo)", "notigas_tipo_de_categoria(valor_codigo)")
    codigos = re.findall(r"'([a-z]+)'", cuerpo)
    tipos = re.findall(r"notigas_tipo_de_categoria\('([a-z]+)'\)\s+AS\s+tipo", cuerpo)
    mapa = dict(tipos)
    return [(c, mapa.get(c, "?")) for c in codigos]


def sin_comentarios(texto: str) -> str:
    """Quita comentarios de linea y de bloque.

    Importa: varios archivos explican *por que* se retiro el gas. Un guard que
    marcara esos comentarios obligaria a borrarlos, y con ellos la razon del
    cambio. Solo el codigo ejecutable debe estar limpio.

    El orden es HTML primero y despues JS, y el bloque /* */ solo se aplica si
    esta balanceado: en index.html hay tres 'image/*' de accept=, que no son
    comentarios pero romperian un strip ingenuo.
    """
    texto = re.sub(r"<!--.*?-->", " ", texto, flags=re.S)  # <!-- ... -->
    if texto.count("/*") <= texto.count("*/"):
        texto = re.sub(r"/\*.*?\*/", " ", texto, flags=re.S)  # /* ... */
    texto = re.sub(r"^\s*//.*$", " ", texto, flags=re.M)   # // ...
    return texto


def main() -> int:
    print("=" * 70)
    print("NOTIGAS Bolivia - Guard del catalogo de reciclaje")
    print("=" * 70)

    bo = leer("js/notigas_bo.js")
    idx = leer("index.html")
    mapa = leer("js/map.js")
    appj = leer("js/app.js")
    vend = leer("js/vendors.js")
    ordj = leer("js/orders.js")
    auth = leer("js/auth.js")
    admin = leer("js/admin.js")
    icons = leer("js/recolector_icons.js")
    sw = leer("sw.js")
    man = leer("manifest.json")
    css = leer("styles/main.css")

    # ---------------------------------------------------------------- catalogo
    cat = bloque_categorias(bo)
    ok(len(cat) == 5, f"el catalogo activo tiene 5 categorias (tiene {len(cat)})")
    ok(cat == CATALOGO_ESPERADO, "el orden y tipo de cada categoria son los canónicos")
    if cat != CATALOGO_ESPERADO:
        print(f"          esperado: {CATALOGO_ESPERADO}")
        print(f"          obtenido: {cat}")

    for cod, tipo in CATALOGO_ESPERADO:
        ok(cod in bo, f"el catalogo declara '{cod}'")
    ok(len([c for c, t in cat if t == "recogida"]) == 5, "las cinco categorias son recogida")
    ok(len([c for c, t in cat if t == "compra"]) == 0, "ninguna categoria es compra")

    # Las retiradas no pueden volver a offered como categoria viva: el
    # catalogo historico las conserva, pero la UI no las debe listar.
    for cod in CATEGORIAS_RETIRADAS:
        ok(f'"{cod}"' not in bo, f"la categoria retirada '{cod}' no esta en el catalogo activo")

    # el servidor debe derivar el mismo tipo
    migs = sorted((RAIZ / "supabase/migrations").glob("*.sql"))
    sql = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in migs)
    ok("notigas_tipo_de_categoria" in sql, "el servidor deriva el tipo desde la categoría")
    ok("pedidos_categoria_catalogo_chk" in sql, "existe el CHECK de catálogo en pedidos")
    ok("tipo_solicitud" in sql, "existe la columna tipo_solicitud")

    # ------------------------------------------------------- residuos heredados
    #
    # Excepciones deliberadas que el guard NO debe marcar como fallo:
    #   - 'garrafas_agotadas' es una columna real de la BD, no branding.
    #   - js/map.js conserva sinonimos gas/carbon en normalizeCategoryCode para
    #     mapear filas antiguas a una categoria valida. Deben seguir ahi.
    #   - js/recolector_icons.js usa un regex para NO pintar un badge redundante
    #     cuando la categoria es una palabra generica como "reparto"; como
    #     choferes.categoria no tiene CHECK, puede haber filas legacy.
    SINONIMOS_PERMITIDOS = {
        "js/map.js": ["includes('gas')", "includes('carbon')", "gas/carbon"],
        "js/recolector_icons.js": ["gas|glp|gas glp"],
    }

    for rel, texto in (("index.html", idx), ("js/map.js", mapa), ("js/app.js", appj),
                       ("js/vendors.js", vend), ("js/orders.js", ordj),
                       ("js/auth.js", auth), ("js/admin.js", admin), ("sw.js", sw)):
        permitidas = SINONIMOS_PERMITIDOS.get(rel, [])
        bajo = sin_comentarios(texto).lower()
        # 'garrafas_agotadas' es columna real de la BD: no es branding.
        limpio = bajo.replace("garrafas_agotadas", "")
        for antiguo in permitidas:
            limpio = limpio.replace(antiguo.lower(), "")

        if rel == "sw.js":
            ok("garrafa_red_clean.svg" not in limpio,
               "sw.js no precachea la garrafa de gas")
            ok("garrafa_red-192.png" not in limpio, "sw.js no precachea la garrafa 192")
            ok("garrafa_red-512.png" not in limpio, "sw.js no precachea la garrafa 512")
        else:
            ok("garrafa_red" not in limpio, f"{rel} no carga la garrafa de gas")
            ok("'gas'" not in limpio and '"gas"' not in limpio,
               f"{rel} no usa 'gas' como valor por defecto")
            ok("gas glp" not in limpio, f"{rel} no presenta Gas GLP al usuario")
            ok("balón de gas" not in limpio and "balon de gas" not in limpio,
               f"{rel} no ofrece balones de gas")

    # el alias defensivo debe seguir presente: sin el, las filas legacy no mapean
    ok("includes('gas')" in mapa,
       "normalizeCategoryCode conserva el sinonimo defensivo de gas")
    ok("includes('carbon')" in mapa,
       "normalizeCategoryCode conserva el sinonimo defensivo de carbon")
    ok("garrafas_agotadas" in mapa,
       "la columna real garrafas_agotadas no se renombro")

    # ----------------------------------------------------------------- letrero
    ok('id="mapaLetrero"' in idx, "el mapa tiene letrero central")
    ok('id="mapaLetreroRecogida"' in idx and 'id="mapaLetreroCompra"' not in idx,
       "el letrero solo lista recogida")
    ok("pintarLetreroMapa" in bo, "el letrero se pinta desde el catálogo canónico")
    ok(".mapa-letrero" in css, "existe el estilo del letrero del mapa")

    # ------------------------------------------------------------------- pines
    ok("ICONOS_FONTAWESOME_POR_CATEGORIA" in mapa,
       "los pines se resuelven por categoría, no por producto")
    ok("RECOGER" in mapa and "PEDIDO" in mapa,
       "el pin distingue RECOGER de PEDIDO")
    ok("tipo_solicitud" in mapa, "los pines reciben tipo_solicitud del pedido")
    ok("obtenerIconoCategoriaMapa(order.categoria, order.tipo_solicitud)" in mapa,
       "los pines se construyen con la categoría y el tipo")

    # normalizeCategoryCode no debe devolver categorías retiradas
    nc = re.search(r"normalizeCategoryCode\s*=\s*function.*?\n};", mapa, re.S)
    cuerpo = nc.group(0) if nc else ""
    ok(bool(cuerpo), "existe normalizeCategoryCode en el cliente")
    if cuerpo:
        retornos = set(re.findall(r"return\s+'([a-z]+)';", cuerpo))
        ok("gas" not in retornos, "normalizeCategoryCode nunca devuelve 'gas'")
        ok("carbon" not in retornos, "normalizeCategoryCode nunca devuelve 'carbon'")
        ok(bool(retornos & {"plastico", "papel", "chatarra", "botellas"}),
           "normalizeCategoryCode devuelve códigos del catálogo")

    # ------------------------------------------------------------------ iconos
    ok("camion_reciclaje.svg" in idx, "el header usa el camión de reciclaje")
    ok("Icon-192.png" in man and "Icon-512.png" in man, "el manifest declara PNG 192 y 512")
    ok("maskable" in man, "el manifest declara un icono maskable")
    for rel in ("icons/Icon-192.png", "icons/Icon-512.png"):
        p = RAIZ / rel
        ok(p.exists() and p.stat().st_size > 1000, f"{rel} existe y no está vacío")
    # el PNG no debe seguir siendo la garrafa: comparamos con los archivos legacy
    legacy = RAIZ / "icons/garrafa_red-192.png"
    nuevo = RAIZ / "icons/Icon-192.png"
    if legacy.exists() and nuevo.exists():
        ok(legacy.read_bytes() != nuevo.read_bytes(),
           "Icon-192.png ya no es la garrafa vieja")

    # -------------------------------------------------------------- coherencia
    # La version de assets se deriva de CACHE_NAME en sw.js, que es la unica
    # fuente de verdad. Antes el 143 estaba escrito a mano aqui, asi que cada
    # subida de version obligaba a editar el guard y era facil que se quedara
    # desfasado. Ahora se comprueba la coherencia entre los tres archivos.
    m_cache = re.search(r"CACHE_NAME\s*=\s*'notigas-cache-v(\d+)'", sw)
    if not m_cache:
        ok(False, "sw.js declara CACHE_NAME con una versión legible")
        return
    version = m_cache.group(1)
    ok(True, f"el service worker está en v{version}")

    # El precache del service worker no debe apuntar a una versión anterior.
    versiones_sw = set(re.findall(r"\?v=(\d+)", sw))
    ok(versiones_sw <= {version},
       f"sw.js no precachea assets de otra versión ({versiones_sw or 'sin ?v='})")

    # index.html debe usar exactamente una versión, y la misma que el SW.
    versiones = set(re.findall(r"\?v=(\d+)", idx))
    ok(versiones == {version},
       f"index.html usa una sola versión de assets ({versiones}, esperada v{version})")

    # ------------------------------------------------- orden de la pestaña 2
    # Regla de producto: en la lista de recolectores los recicladores van
    # siempre antes que los distribuidores de venta. choferes_publicos se
    # consulta sin ORDER BY, así que sin este orden explícito la lista salía
    # en un orden distinto en cada recarga.
    vend = (RAIZ / "js/vendors.js").read_text(encoding="utf-8", errors="replace")
    ok("ordenarRecolectoresPrimero" in vend and
       re.search(r"ordenarRecolectoresPrimero\s*\(", vend) is not None,
       "la lista de la pestaña 2 ordena con ordenarRecolectoresPrimero")
    ok("tipo_solicitud !== 'compra'" in vend,
       "el orden de la pestaña 2 decide por tipo_solicitud, no por texto libre")
    # La ordenación debe aplicarse en el render, no solo definirse.
    ok(re.search(r"const\s+filtered\s*=\s*ordenarRecolectoresPrimero\s*\(", vend) is not None,
       "renderVendorCards aplica la ordenación a la lista que pinta")
    # Y no debe depender de un ORDER BY que la consulta no declara.
    consulta = vend[max(0, vend.find('choferes_publicos') - 400):vend.find('choferes_publicos') + 400]
    ok(".order(" not in consulta,
       "la consulta de choferes_publicos no promete un orden que el catálogo no define")

    # ------------------------------------------- grupos de la barra de categorías
    # La barra de la pestaña 2 tiene un solo grupo: NOTIGAS es servicio de
    # reciclaje. La suscripcion a recargas no es una categoria, asi que no
    # aparece como chip.
    ok(idx.count('class="cat-group"') == 1,
       f"la barra de la pestaña 2 tiene 1 grupo de categorías ({idx.count('class=\"cat-group\"')})")
    ok("catGroupReciclaje" in idx and "catGroupPedidos" not in idx,
       "el grupo se llama Recolectores de reciclaje")
    ok(idx.count('class="cat-chip') == len(cat) + 1,
       f"la barra ofrece Todos + las {len(cat)} categorías ({idx.count('class=\"cat-chip')})")
    # Los chips deben quedar DENTRO del grupo, no sueltos en la barra: un chip
    # fuera del grupo es una categoría sin clasificar.
    bloque = re.search(
        r'<div class="cat-group"[^>]*aria-labelledby="catGroupReciclaje">(.*?)</div>', idx, re.S)
    ok(bool(bloque) and bloque.group(1).count('class="cat-chip') > 0,
       "el grupo Recolectores de reciclaje contiene chips de categoría")

    # Los botones de pedido deben seguir colgando del mapa y no del panel de
    # acciones: si vuelven al panel, el cambio de rol los deja visibles al
    # recolector, porque orders.js solo los oculta al abrir un pedido.
    occ = list(re.finditer(
        r'id="orderTypeActions"(.*?)</div>', idx, re.S))
    occ_dentro_del_panel = [
        m for m in occ
        if idx.rfind('id="buyerFloatingActions"', 0, m.start())
        < idx.rfind('id="recolectorFloatingActions"', 0, m.start())
        and idx.rfind('id="buyerFloatingActions"', 0, m.start())
        > idx.rfind('id="recolectorFloatingActions"', 0, m.start())
    ]
    ok(len(occ) == 1, f"hay un solo bloque orderTypeActions ({len(occ)})")
    ok(not occ_dentro_del_panel,
       "los botones de pedido cuelgan del mapa, no del panel de acciones")

    # Anclados abajo y a ancho completo: flotando a media altura tapaban el
    # grupo de zoom y las etiquetas de ciudad de las teselas.
    bloque_css = re.search(r"#orderTypeActions\s*\{(.*?)\}", css, re.S)
    decl = bloque_css.group(1) if bloque_css else ""
    ok("bottom:" in decl and "top: auto" in decl,
       "los botones de pedido se anclan al borde inferior")
    ok(re.search(r"left:\s*12px", decl) is not None and re.search(r"width:\s*auto", decl) is not None,
       "los botones de pedido ocupan el ancho completo")
    ok(".btn-order-tipo--compra" not in css,
       "no queda estilo del boton de compras, que ya no existe")

    ok("orderTypeActions" in appj
       and "orderTypeActions.style.display = 'none'" in appj
       and re.search(r"orderTypeActions\.style\.display\s*=[^;\n]*'flex'", appj),
       "el cambio de rol muestra y oculta los botones de pedido")
    ok("btnPedirReciclador" in idx, "el boton btnPedirReciclador esta en el mapa")
    ok("btnPedirCompras" not in idx, "el boton btnPedirCompras ya no esta en el mapa")
    ok("PEDIR RECOJO" in idx, "la accion principal se llama PEDIR RECOJO")

    # La suscripcion a recargas es independiente del pedido: modal propio, ids
    # propios, y no se mezcla con el flujo de pedidos ni con el mapa.
    ok("btnSuscribirseRecarga" in idx, "el boton de recargas esta en el mapa")
    ok("SUSCRIBIRME A RECARGAS" in idx, "el boton de recargas se rotula como suscripcion")
    for mid in ("modalRecarga", "btnGuardarRecarga", "selectRecargaProducto",
                "selectRecargaFrecuencia", "inputRecargaZona", "inputRecargaTelefono"):
        ok(f'id="{mid}"' in idx, f"el modal de recargas define {mid}")
    ok("js/recargas.js" in idx, "el modulo de recargas se carga en la pagina")
    recargas = leer("js/recargas.js")
    ok("suscripciones_recarga" in recargas, "las recargas se guardan en suscripciones_recarga")
    ok("onConflict: 'user_id,producto'" in recargas,
       "las recargas usan el conflicto unico (user_id, producto)")

    print()
    print("=" * 70)
    if FALLO:
        print(f"FALLARON {len(FALLO)} de {OK + len(FALLO)} verificaciones:")
        for f in FALLO:
            print(f"  - {f}")
        return 1
    print(f"OK: {OK} verificaciones. Catalogo de reciclaje intacto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
