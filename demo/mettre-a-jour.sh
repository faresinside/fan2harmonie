#!/bin/sh
# Reconstruit et publie la démonstration quand la branche « main » du dépôt GitHub a changé (par exemple après
# une modification faite dans /admin). Lancé par une tâche cron toutes les 2 minutes ; à la main avec --force.
#
# Étapes : clone jetable -> adaptation à la démonstration (appliquer-demo.sh) -> construction dans un conteneur
# Node (rien n'est installé sur le serveur) -> copie du résultat dans ./site, servi par le conteneur Apache.
# Le site n'est remplacé QUE si la construction réussit : en cas d'échec, l'ancienne version reste en ligne.
set -eu

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
cd "$DOSSIER"

# Une seule mise à jour à la fois.
exec 9>"$DOSSIER/.maj.lock"
flock -n 9 || exit 0

DEPOT="https://github.com/faresinside/fan2harmonie.git"
BRANCHE="main"
JOURNAL="$DOSSIER/maj.log"
journal() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$JOURNAL"; }

NOUVELLE="$(git ls-remote "$DEPOT" "refs/heads/$BRANCHE" 2>/dev/null | cut -f1 || true)"
if [ -z "$NOUVELLE" ]; then journal "ERREUR : impossible de lire la version distante (réseau ou GitHub)"; exit 1; fi
ANCIENNE="$(cat .derniere-version 2>/dev/null || echo aucune)"
if [ "${1:-}" != "--force" ] && [ "$NOUVELLE" = "$ANCIENNE" ]; then exit 0; fi

journal "Nouvelle version $NOUVELLE (précédente : $ANCIENNE) : construction"
echo "--- $(date -u +%FT%TZ) $NOUVELLE" >> "$DOSSIER/build.log"

echec() { journal "ÉCHEC : $1 (détails dans build.log) ; l'ancienne version reste en ligne"; exit 1; }

# Dossier de travail jeté à chaque fois (fichiers créés par Docker en root : supprimés par un conteneur).
docker run --rm -v "$DOSSIER:/w" alpine rm -rf /w/src
git clone --quiet --depth 1 --branch "$BRANCHE" "$DEPOT" src >>"$DOSSIER/build.log" 2>&1 || echec "clone du dépôt"

sh ./appliquer-demo.sh src >>"$DOSSIER/build.log" 2>&1 || echec "adaptation à la démonstration"

docker run --rm -v "$DOSSIER/src:/app" -v f2h_npm_cache:/root/.npm -w /app node:24-bookworm \
  sh -c "npm ci --no-audit --no-fund && npm run build" >>"$DOSSIER/build.log" 2>&1 || echec "construction du site"

[ -f src/dist/index.html ] || echec "dist/index.html absent après la construction"

# Copie dans ./site (lu par le conteneur Apache) : fichiers lisibles par tous, rien n'est supprimé ailleurs.
rsync -rlt --delete --chmod=D755,F644 src/dist/ site/ >>"$DOSSIER/build.log" 2>&1 || echec "copie vers site/"

echo "$NOUVELLE" > .derniere-version
journal "Publié : $NOUVELLE"
