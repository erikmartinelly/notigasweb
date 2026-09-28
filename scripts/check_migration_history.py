#!/usr/bin/env python3
"""Integridad del historial de migraciones de Supabase.

La CLI de Supabase registra el estado de cada migracion por numero de version en
`supabase_migrations.schema_migrations`. Si una version esta aplicada en remoto
pero su archivo ya no existe en `supabase/migrations/`, todo comando que compare
el historial local contra el remoto aborta con:

    Remote migration versions not found in local migrations directory.

Eso paso en produccion: el commit e4b55e1 movio tres migraciones YA APLICADAS a
`retired_migrations/` suponiendo que nunca se habian desplegado. Este guard
impide que el mismo error vuelva a colarse, y ademas detecta el resto de
desordenes que rompen el despliegue en orden ascendente.
"""
import pathlib
import re
import sys
from typing import List

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "supabase" / "migrations"
RETIRADAS = RAIZ / "supabase" / "retired_migrations"

FALLO: List[str] = []
OK = 0

# La CLI ordena y compara migraciones por el prefijo numerico del nombre. Acepta
# cualquier longitud: las 90 migraciones legadas de este repo usan "001_", y las
# nuevas siguen la convencion de 14 digitos (AAAAMMDDHHMMSS). Solo exigimos que
# el prefijo sea numerico, no que tenga 14 digitos.
RE_VERSION = re.compile(r"^(\d+)_(.+)\.sql$")


def revisar(condicion: bool, mensaje: str) -> None:
    global OK
    if condicion:
        OK += 1
        print(f"  [OK]   {mensaje}")
    else:
        FALLO.append(mensaje)
        print(f"  [FALLA] {mensaje}")


def main() -> int:
    print("NOTIGAS - Historial de migraciones de Supabase")

    if not MIGRACIONES.is_dir():
        print(f"  [FALLA] no existe {MIGRACIONES}")
        return 1

    archivos = sorted(p for p in MIGRACIONES.iterdir() if p.is_file() and p.suffix == ".sql")

    revisar(bool(archivos), f"supabase/migrations/ contiene {len(archivos)} migracion(es)")

    # 1. El error que rompio produccion: archivos "retirados" que en realidad
    #    ya estaban aplicados. Ningun .sql puede vivir fuera de la secuencia.
    huerfanos = []
    if RETIRADAS.is_dir():
        huerfanos = sorted(
            p.name for p in RETIRADAS.iterdir()
            if p.is_file() and p.suffix == ".sql"
        )
    revisar(
        not huerfanos,
        "supabase/retired_migrations/ no contiene migraciones .sql"
        + (f" (encontro: {', '.join(huerfanos)})" if huerfanos else ""),
    )

    # 2. Toda migracion necesita prefijo numerico, porque la CLI ordena y compara
    #    por ese numero. Las legadas ("001_") y las nuevas ("20260926090000_")
    #    son validas; lo que no vale es un nombre sin numero.
    sin_version = [p.name for p in archivos if not RE_VERSION.match(p.name)]
    revisar(
        not sin_version,
        "toda migracion tiene un prefijo numerico de version"
        + (f" (sin prefijo: {', '.join(sin_version)})" if sin_version else ""),
    )

    # 3. Versiones duplicadas: dos archivos con la misma version hacen que la CLI
    #    ejecute una y se salte la otra. Se comparan como enteros, no como texto:
    #    "1000" es anterior a "999" en orden numerico, pero no en lexicografico.
    versiones = {}
    for p in archivos:
        m = RE_VERSION.match(p.name)
        if m:
            versiones.setdefault(int(m.group(1)), []).append(p.name)
    duplicadas = {v: n for v, n in versiones.items() if len(n) > 1}
    revisar(
        not duplicadas,
        "no hay versiones de migracion duplicadas"
        + (f" (duplicadas: {duplicadas})" if duplicadas else ""),
    )

    # 4. El orden de despliegue debe coincidir con el orden de version. Si no,
    #    `db push` las aplica en un orden que el autor no escribio (por ejemplo
    #    una correccion aplicada antes que la migracion que la origina).
    por_nombre = [int(RE_VERSION.match(p.name).group(1)) for p in archivos if RE_VERSION.match(p.name)]
    if por_nombre != sorted(por_nombre):
        desordenadas = [
            (a, b) for a, b in zip(por_nombre, sorted(por_nombre)) if a != b
        ]
        revisar(
            False,
            "el orden lexicografico de los archivos coincide con el orden de versiones"
            + f" (primer desajuste: {desordenadas[0][0]} vs {desordenadas[0][1]})",
        )
    else:
        revisar(True, "el orden lexicografico de los archivos coincide con el orden de versiones")

    # 5. Ningun archivoapplied puede quedar sin su sql: el esquema desplegable
    #    tiene que estar completo.
    revisar(
        all(p.stat().st_size > 0 for p in archivos),
        "ninguna migracion esta vacia",
    )

    # 6. Aviso de estado: la migracion mas reciente del catalogo Bolivia.
    reviewed = [p.name for p in archivos if p.name.startswith("20260926090000")]
    revisar(
        bool(reviewed),
        "esta presente la migracion del catalogo de reciclaje de Bolivia (20260926090000)",
    )

    print()
    if FALLO:
        print("=" * 70)
        print(f"FALLARON {len(FALLO)} verificaciones:")
        for m in FALLO:
            print(f"  - {m}")
        print("=" * 70)
        return 1

    print("=" * 70)
    print(f"OK: {OK} verificaciones. Historial de migraciones integro.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
