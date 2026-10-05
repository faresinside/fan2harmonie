#!/bin/sh
# Garde-fou du déploiement (.github/workflows/deploiement.yml) : REMOTE_PATH, dossier distant où rsync
# --delete-after copie dist/ et SUPPRIME tout le reste. Usage : sh scripts/valider-remote-path.sh "$REMOTE_PATH"
# Code 0 si le chemin est acceptable ; sinon un message sur la sortie d'erreur et le code 1.
#
# Exigé : chemin absolu ; seulement lettres, chiffres et . _ ~ / - (ni espace, ni retour à la ligne, ni
# caractère du shell) ; aucun élément « . », « .. » ou « ~… » ; pas de « // » ; au moins trois éléments
# (/home/compte/www), jamais « / » seul ni le dossier du compte. Ce n'est qu'une première couche : le
# workflow exige aussi le fichier témoin .fan2harmonie-site dans ce dossier, sur le serveur.
set -u

refuser() {
    echo "REMOTE_PATH refusé : $1" >&2
    exit 1
}

[ "$#" -eq 1 ] || refuser "un seul argument attendu"
chemin=$1

case $chemin in
    '') refuser "vide" ;;
    -*) refuser "commence par « - »" ;;
    *[!A-Za-z0-9._~/-]*) refuser "caractère non permis (seuls lettres, chiffres et . _ ~ / -)" ;;
    /*) ;;
    *) refuser "chemin absolu exigé (commence par /)" ;;
esac

case $chemin in
    *//*) refuser "« // » interdit" ;;
esac

if printf '%s\n' "$chemin" | grep -Eq '(^|/)(\.\.?|~[^/]*)(/|$)'; then
    refuser "élément « . », « .. » ou « ~… » interdit"
fi

# Nombre d'éléments, barres finales ignorées.
sans_fin=$chemin
while [ "${sans_fin%/}" != "$sans_fin" ]; do
    sans_fin=${sans_fin%/}
done
elements=$(printf '%s' "$sans_fin" | tr -cd '/' | wc -c)
[ "$elements" -ge 3 ] || refuser "au moins trois éléments exigés (ex. /home/compte/www)"

exit 0
