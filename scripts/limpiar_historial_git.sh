#!/usr/bin/env bash
# =============================================================================
# LIMPIEZA DEL HISTORIAL DE GIT - notigasweb
# =============================================================================
# Objetivo: borrar "Tiquipaya428" y "TuNuevaContraseña123" de TODOS los commits
# del historial (no solo del archivo actual), y reescribir main + fix-production.
#
# IMPORTANTE — leer antes de correr:
# 1. Esto reescribe hashes de commit. Cualquiera que ya haya clonado el repo
#    (incluido tú, en otra máquina) tendrá que volver a clonarlo después.
# 2. Corre esto en una copia nueva, no en tu carpeta de trabajo actual.
# 3. El intento anterior con `git filter-branch` (los commits "eliminar basura")
#    no llegó a hacer force-push, por eso la contraseña sigue en main. Usamos
#    git-filter-repo en vez de filter-branch: es la herramienta que el propio
#    equipo de Git recomienda hoy, y evita el error de dejar objetos huérfanos.
# 4. Rota la contraseña de todos modos. Aunque esto la borre de git, GitHub
#    puede haber cacheado los objetos sueltos por un tiempo tras el force-push,
#    y cualquiera que ya haya hecho fork o clonado el repo se la lleva igual.
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/erikmartinelly/notigasweb.git"
WORKDIR="notigasweb-limpieza"

# 1. Instalar git-filter-repo si no está (requiere Python 3)
if ! command -v git-filter-repo &> /dev/null; then
    echo "Instalando git-filter-repo..."
    pip install git-filter-repo --break-system-packages 2>/dev/null || pip3 install --user git-filter-repo
fi

# 2. Clonar un mirror limpio (filter-repo lo exige así, no un checkout normal)
rm -rf "$WORKDIR"
git clone --mirror "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

# 3. Archivo de reemplazos: cada línea "texto_viejo==>texto_nuevo"
cat > /tmp/reemplazos.txt << 'EOF'
Tiquipaya428==>***REDACTED***
TuNuevaContraseña123==>***REDACTED***
EOF

# 4. Reescribir todo el historial reemplazando esas cadenas, en todos los blobs
git filter-repo --replace-text /tmp/reemplazos.txt --force

# 5. Verificación: no debe imprimir nada
echo "Verificando que ya no aparece la contraseña..."
if git log --all -p | grep -q "Tiquipaya428"; then
    echo "❌ La contraseña TODAVÍA aparece. No hagas push. Revisa antes de continuar."
    exit 1
else
    echo "✅ Ya no aparece 'Tiquipaya428' en ningún commit."
fi

# 6. Restaurar el remoto (filter-repo lo quita por seguridad) y hacer push forzado
git remote add origin "$REPO_URL"
echo ""
echo "Todo listo para el push. Esto es DESTRUCTIVO e irreversible. Revisa el resultado"
echo "arriba, y cuando estés seguro corre manualmente:"
echo ""
echo "  cd $WORKDIR"
echo "  git push --force --all origin"
echo "  git push --force --tags origin"
echo ""
echo "Después de esto:"
echo "  - Rota la contraseña de admin en el sistema donde se usa (aunque el código"
echo "    actual ya no la lea, si algo externo la valida, cámbiala igual)."
echo "  - Si alguien más clonó el repo, que borre su copia local y vuelva a clonar;"
echo "    un 'git pull' normal sobre una copia vieja va a generar conflictos feos."
echo "  - Revisa en GitHub → Settings → Security si hay algún fork del repo, porque"
echo "    un fork existente conserva el historial viejo con la contraseña."
