#!/usr/bin/env python3
"""Comprobaciones estructurales de index.html, manifest.json y main.css.

El anidamiento se valida con html.parser (el algoritmo real de HTML5), no con
regex: asi las etiquetas que viven dentro de strings de JS no producen falsos
alarmas, y un </div> huerfano si se detecta. Ese fue un bug real que este guard
encontro en index.html.
"""
import json
import pathlib
import re
import sys
from html.parser import HTMLParser
from typing import List, Optional, Tuple

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FALLO: List[str] = []
OK = 0

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
# Un <p> se cierra implicitamente cuando aparece uno de estos.
CIERRA_P = {"div", "section", "main", "ul", "ol", "li", "table", "tr",
            "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "form"}


class Rastreador(HTMLParser):
    """Detecta cierres sobrantes y etiquetas sin cerrar.

    script/style se tratan como un bloque opaco: su contenido no es markup, asi
    que se marca con en_blanco y se ignora hasta el </script> correspondiente.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pila: List[Tuple[str, int]] = []
        self.problemas: List[str] = []
        self.en_blanco: Optional[str] = None   # 'script' | 'style' | None

    def handle_starttag(self, tag, attrs):
        if self.en_blanco:
            return
        if tag in VOID:
            return
        if tag in ("script", "style"):
            self.pila.append((tag, self.getpos()[0]))
            self.en_blanco = tag
            return
        if tag in CIERRA_P:
            while self.pila and self.pila[-1][0] == "p":
                self.pila.pop()
        self.pila.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.en_blanco:
            # Solo el cierre del propio bloque opaco es relevante.
            if tag == self.en_blanco and self.pila and self.pila[-1][0] == tag:
                self.pila.pop()
                self.en_blanco = None
            return
        if tag in CIERRA_P:
            while self.pila and self.pila[-1][0] == "p":
                self.pila.pop()
        if not self.pila:
            self.problemas.append(f"L{self.getpos()[0]}: </{tag}> sobrante")
            return
        abierto, ln = self.pila[-1]
        if abierto == tag:
            self.pila.pop()
            return
        for i in range(len(self.pila) - 1, -1, -1):
            if self.pila[i][0] == tag:
                for t, l in self.pila[i + 1:]:
                    self.problemas.append(
                        f"L{l}: <{t}> queda sin cerrar al cerrar </{tag}>")
                del self.pila[i:]
                return
        self.problemas.append(f"L{self.getpos()[0]}: </{tag}> sin apertura previa")


def ok(cond: bool, msg: str) -> None:
    global OK
    if cond:
        OK += 1
        print(f"  [OK]   {msg}")
    else:
        FALLO.append(msg)
        print(f"  [FALLA] {msg}")


def main() -> int:
    print("=" * 70)
    print("NOTIGAS - Estructura de HTML, manifest y CSS")
    print("=" * 70)

    # ------------------------------------------------------------------ manifest
    man = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
    ok(isinstance(man, dict), "manifest.json es JSON valido")
    for clave in ("name", "short_name", "start_url", "display", "icons"):
        ok(clave in man, f"el manifest declara '{clave}'")
    ok(len(man.get("icons", [])) >= 3, "el manifest declara al menos 3 iconos")
    for ico in man.get("icons", []):
        existe = (RAIZ / ico["src"]).exists()
        ok(existe, f"el icono del manifest existe: {ico['src']}")
    tamanos = {i.get("sizes") for i in man.get("icons", [])}
    ok("192x192" in tamanos and "512x512" in tamanos,
       "el manifest incluye 192x192 y 512x512")
    ok(any("maskable" in str(i.get("purpose", "")) for i in man.get("icons", [])),
       "el manifest incluye un icono maskable")

    # ------------------------------------------------------------------- HTML
    html = (RAIZ / "index.html").read_text(encoding="utf-8")
    ok(len(html) > 10000, "index.html tiene contenido")

    # Anidamiento real, no una cuenta con regex.
    r = Rastreador()
    r.feed(html)
    r.close()
    for tag, ln in r.pila:
        r.problemas.append(f"L{ln}: <{tag}> nunca se cierra")
    ok(not r.problemas,
       f"el anidamiento de index.html es correcto ({len(r.problemas)} anomalias)")
    for p in r.problemas:
        print(f"          {p}")

    # JSON-LD embebido
    bloques = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.S | re.I)
    ok(len(bloques) >= 1, f"index.html tiene JSON-LD ({len(bloques)} bloque/s)")
    for i, b in enumerate(bloques):
        try:
            json.loads(b)
            ok(True, f"el JSON-LD #{i + 1} es valido")
        except Exception as e:
            ok(False, f"el JSON-LD #{i + 1} no es valido: {str(e)[:70]}")

    # todo <script src=...> local debe existir en disco
    # Una barra inicial significa "raiz del dominio", que en el repo es la raiz.
    # Ojo: si la app se sirviera desde un subdirectorio (GitHub Pages de
    # proyecto, por ejemplo), esas rutas absolutas dejarian de resolver.
    srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html, re.I)
    locales = [s for s in srcs if not s.startswith(("http://", "https://", "//"))]
    faltan = [s for s in locales if not (RAIZ / s.lstrip("/").split("?")[0]).exists()]
    ok(not faltan, f"los {len(locales)} scripts locales de index.html existen")
    for f in faltan:
        print(f"          falta: {f}")

    absolutas = [s for s in locales if s.startswith("/")]
    if absolutas:
        print(f"  [AVISO] {len(absolutas)} script(s) con ruta absoluta: "
              f"{', '.join(absolutas)}")
        print("          funcionan si el sitio se sirve en la raiz del dominio; "
              "no si vive en un subdirectorio.")

    # todo <link rel=stylesheet> local debe existir
    hrefs = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\']',
                       html, re.I)
    locales = [h for h in hrefs if not h.startswith(("http://", "https://", "//"))]
    faltan = [h for h in locales if not (RAIZ / h.lstrip("/").split("?")[0]).exists()]
    ok(not faltan, f"las {len(locales)} hojas de estilo locales existen")
    for f in faltan:
        print(f"          falta: {f}")

    # todo <img src=...> local debe existir
    imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.I)
    locales = [s for s in imgs if not s.startswith(("http://", "https://", "//", "data:"))]
    faltan = [s for s in locales if not (RAIZ / s.lstrip("/").split("?")[0]).exists()]
    ok(not faltan, f"las {len(locales)} imagenes locales de index.html existen")
    for f in faltan:
        print(f"          falta: {f}")

    # balance de <section>
    abre = len(re.findall(r"<section\b", html, re.I))
    cierra = len(re.findall(r"</section>", html, re.I))
    ok(abre == cierra, f"los <section> balancean (abren {abre}, cierran {cierra})")

    # el letrero del mapa debe estar dentro del mapa, no despues
    i_letrero = html.find('id="mapaLetrero"')
    i_trip = html.find('id="notigasTripCard"')
    ok(0 < i_letrero < i_trip, "el letrero del mapa precede al panel de pedido")

    # ------------------------------------------------------- cadenas obligatorias
    # El usuario fijo texto de marca. Si alguien lo reescribe (por ejemplo al
    # limpiar copy viejo) la pagina sigue funcionando pero pierde el texto
    # acordado, asi que lo fijamos aqui.
    TITULO = "NOTIGAS: Noticias de Generadores de residuos seleccionados - NOTIGAS"
    DESCRIPCION = (
        "NOTIGAS - Bolivia \U0001F1E7\U0001F1F4 | \U0001F5D1\uFE0F Generadores de residuos"
        " | \u267B\uFE0F Reciclaje | \U0001F69B Recolectores | \U0001F4A7 Agua"
        " | \U0001F9F4 Detergentes | \U0001F9C2 Sal | \U0001F52A Afilado"
    )
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    ok(m is not None and m.group(1).strip() == TITULO,
       "el <title> es exactamente el texto de marca acordado")
    m = re.search(r'name="description" content="(.*?)"', html, re.S)
    ok(m is not None and m.group(1).strip() == DESCRIPCION,
       "la meta description es exactamente la acordada")
    for prop in ("og:title", "og:description", "twitter:title", "twitter:description"):
        m = re.search(r'property="%s" content="(.*?)"' % prop, html, re.S)
        esperado = TITULO if prop.endswith("title") else DESCRIPCION
        ok(m is not None and m.group(1).strip() == esperado,
           f'{prop} coincide con el texto de marca acordado')
    ok("gas glp" not in html.lower(), "index.html no vuelve a mencionar Gas GLP")

    # ---------------------------------------------------------- carga de scripts
    # CI exige que estos tres carguen con defer y nunca como <script src> a pelo:
    # sin defer bloquean el parser y retrasan el primer render.
    for modulo in ("recolector_icons", "device_security", "monitoring"):
        ok(re.search(r'<script defer src="js/%s\.js\?v=\d+"></script>' % modulo, html)
           is not None, f"js/{modulo}.js carga con defer y version")
        ok(re.search(r'<script src="js/%s\.js\?v=\d+"></script>' % modulo, html) is None,
           f"js/{modulo}.js no bloquea el parser")

    # ------------------------------------------------- precios no visibles
    # NOTIGAS no intermedia fondos: ninguna superficie pintada puede mostrar un
    # precio. Se busca el patron del badge, no la mera palabra "precio".
    # Excepcion deliberada: reportarIncumplimientoPrecio() en orders.js pide al
    # usuario el monto que le cobro el recolector para abrir una queja. Eso no
    # es mostrar un precio de plataforma, es denunciar un cobro.
    SUPERFICIES = [
        "js/vendors.js", "js/recolector_icons.js", "js/app.js",
        "js/map.js", "js/auth.js", "index.html",
    ]
    BADIO = re.compile(
        r"precio_balon_10kg\s*\?\?|precio10kgHtml|priceHtml|rawPrice10kg"
        r"|Bal[oó]n 10 ?Kg"
    )
    for rel in SUPERFICIES:
        texto = (RAIZ / rel).read_text(encoding="utf-8")
        encontrado = BADIO.search(texto)
        ok(encontrado is None,
           f"{rel} no pinta precios en la interfaz"
           + (f" (queda {encontrado.group(0)!r})" if encontrado else ""))

    # -------------------------------------------------------------------- CSS
    css = (RAIZ / "styles/main.css").read_text(encoding="utf-8")
    n = css.count("{") - css.count("}")
    ok(n == 0, f"main.css balancea las llaves (diferencia {n})")
    ok(".mapa-letrero" in css, "main.css define el estilo del letrero")
    ok(".mapa-letrero__chip" in css, "main.css define los chips del letrero")

    print()
    print("=" * 70)
    if FALLO:
        print(f"FALLARON {len(FALLO)} de {OK + len(FALLO)} verificaciones:")
        for f in FALLO:
            print(f"  - {f}")
        return 1
    print(f"OK: {OK} verificaciones. Estructura sana.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
