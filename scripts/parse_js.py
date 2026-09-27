#!/usr/bin/env python3
"""Parsea cada modulo .js con esprima para detectar errores de sintaxis.

Existe porque la maquina de trabajo no tiene Node. En CI no se usa: ahi
`node scripts/check_syntax.js` ya valida lo mismo con el parser real de V8, que
ademas entiende ES2020 sin necesidad de normalizar nada.

Uso local:
    pip install esprima
    python scripts/parse_js.py

esprima 4.0.1 entiende hasta ES2017. El codigo usa sintaxis ES2020 (?. y ??),
que no soporta, asi que normalizamos esas construcciones a una forma
equivalente antes de parsear. Cada archivo reporta cuantas normalizaciones
requirio, para poder juzgar que tan confiable fue el resultado.

Salida: 0 si todo parsea, 1 si hay errores de sintaxis reales.
"""
import pathlib
import re
import sys
from typing import Tuple

try:
    import esprima
except ImportError:
    print("Falta la dependencia 'esprima'. Instala con:  pip install esprima")
    sys.exit(2)

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def normalizar_es2020(src: str) -> Tuple[str, int]:
    """Convierte sintaxis ES2020 a una forma equivalente que esprima parsea.

    Tres casos, en este orden:
      '?.('  -> '('   llamada opcional: 'f?.(x)'  -> 'f(x)'
      '?.['  -> '['   indice opcional: 'm?.[1]'  -> 'm[1]'
      '?.Id' -> '.Id' acceso opcional por nombre
      '??'   -> '||'

    Ojo con el orden: aplicar la regla general '?.' -> '.' a '?.(' produce
    'f.(x)' y a '?.[' produce 'm.[1]', y las dos son errores de sintaxis
    falsos. Por eso los dos casos especiales van primero.
    """
    n = 0
    src, k = re.subn(r"\?\.\(", "(", src)
    n += k
    src, k = re.subn(r"\?\.\[", "[", src)
    n += k
    src, k = re.subn(r"\?\.(?=[A-Za-z_])", ".", src)
    n += k
    src, k = re.subn(r"\?\?", "||", src)
    n += k
    return src, n


def main() -> int:
    fallos = 0
    total = 0
    for p in sorted((RAIZ / "js").glob("*.js")):
        total += 1
        src = p.read_text(encoding="utf-8", errors="replace")
        limpio, n = normalizar_es2020(src)
        try:
            esprima.parseScript(limpio, tolerant=False)
            nota = f"  (normalizadas {n} construcciones ES2020)" if n else ""
            print(f"  [OK]    {p.name}{nota}")
        except Exception as e:
            msg = str(e).split("\n")[0][:150]
            print(f"  [FALLA] {p.name}: {msg}")
            fallos += 1

    print()
    print(f"  {total} modulos analizados, {fallos} con error de sintaxis.")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
