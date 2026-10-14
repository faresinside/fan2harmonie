#!/bin/bash
# Fabrique une COPIE du dépôt à historique nettoyé, prête à être poussée sur le dépôt de Stéphanie (transmission du site).
# Le dépôt d'origine n'est jamais modifié : tout se passe dans un nouveau dossier.
#
# Usage :
#     ANCIEN_EMAIL='ancienne@adresse' NOUVEL_EMAIL='identifiant+nom@users.noreply.github.com' \
#         bash scripts/historique-propre.sh ../fan2harmonie-pour-stephanie
#
# Nettoyage :
#   - retire de TOUT l'historique : demo/ (installation personnelle du technicien) et source/ImageAnimation.jpeg
#     (photo personnelle d'origine) ;
#   - ANCIEN_EMAIL / NOUVEL_EMAIL (facultatifs) : remplace une adresse d'auteur par une autre (l'adresse « noreply » de
#     GitHub) dans tous les commits, pour qu'une adresse personnelle ne devienne pas publique avec un dépôt public ;
#   - ne garde que la branche main (et ses étiquettes) ; aucun dépôt distant n'est conservé.
# Aucune adresse ni valeur personnelle n'est écrite dans ce fichier : elles se donnent à l'appel.
set -euo pipefail

SORTIE=${1:-}
[ -n "$SORTIE" ] || { echo "usage : bash scripts/historique-propre.sh <nouveau-dossier>" >&2; exit 1; }
[ ! -e "$SORTIE" ] || { echo "$SORTIE existe déjà : choisir un nouveau nom." >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "Le dépôt a des modifications non commitées : les commiter d'abord." >&2; exit 1; }

git clone -q --no-local . "$SORTIE"
cd "$SORTIE"
git checkout -q -B main
for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$'); do git branch -q -D "$b"; done

export ANCIEN_EMAIL="${ANCIEN_EMAIL:-}" NOUVEL_EMAIL="${NOUVEL_EMAIL:-}" FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --index-filter 'git rm -r -q --cached --ignore-unmatch demo source/ImageAnimation.jpeg' --env-filter '
if [ -n "$ANCIEN_EMAIL" ] && [ -n "$NOUVEL_EMAIL" ]; then
  [ "$GIT_AUTHOR_EMAIL" = "$ANCIEN_EMAIL" ] && export GIT_AUTHOR_EMAIL="$NOUVEL_EMAIL"
  [ "$GIT_COMMITTER_EMAIL" = "$ANCIEN_EMAIL" ] && export GIT_COMMITTER_EMAIL="$NOUVEL_EMAIL"
fi
true' --tag-name-filter cat -- --branches --tags > /dev/null 2>&1

# Ancien dépôt distant, copies de sauvegarde de filter-branch et objets orphelins : tout est retiré.
git remote remove origin 2> /dev/null || true
rm -rf .git/refs/original
git reflog expire --expire=now --all
git gc -q --prune=now --aggressive

echo "=== Contrôles ==="
trace=$(git log --all --name-only --pretty=format: | sort -u | grep -E '^demo/|ImageAnimation' || true)
if [ -n "$trace" ]; then echo "ERREUR : traces restantes dans l'historique :" >&2; echo "$trace" >&2; exit 1; fi
echo "Aucune trace de demo/ ni de la photo d'origine dans l'historique."
echo "Adresses d'auteur et de validation restantes (à vérifier : aucune adresse personnelle) :"
git log --all --format='%ae%n%ce' | sort | uniq -c | sed 's/^/  /'
if [ -n "$ANCIEN_EMAIL" ] && git log --all --format='%ae%n%ce' | grep -qxF "$ANCIEN_EMAIL"; then
  echo "ERREUR : l'ancienne adresse est encore présente." >&2
  exit 1
fi
echo "Commits : $(git rev-list --count main) ; fichiers suivis : $(git ls-files | wc -l)"
echo
echo "Copie prête : $(pwd)"
echo "Suite : ajouter le dépôt de Stéphanie puis pousser main, par exemple :"
echo "  git remote add origin https://github.com/<compte-de-Stéphanie>/fan2harmonie.git && git push -u origin main"
