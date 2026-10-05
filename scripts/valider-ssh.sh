#!/bin/sh
# Garde-fou du déploiement (.github/workflows/deploiement.yml) : paramètres de connexion SSH lus dans les
# secrets de l'environnement « production ». Usage :
#     sh scripts/valider-ssh.sh "$SSH_HOST" "$SSH_USER" "$SSH_PORT"
# Code 0 si les trois valeurs sont acceptables ; sinon un message sur la sortie d'erreur et le code 1.
#
# SSH_HOST et SSH_USER : non vides, seulement lettres, chiffres et . _ - (ni espace, ni retour à la ligne,
# ni « @ », « : », « ; », « $ »…), jamais « - » en premier (ssh lirait une option, ex. « -oProxyCommand=… »).
# SSH_PORT : vide (= 22) ou un nombre de 1 à 65535, chiffres seulement.
set -u

refuser() {
    echo "$1 refusé : $2" >&2
    exit 1
}

[ "$#" -eq 3 ] || { echo "usage : valider-ssh.sh SSH_HOST SSH_USER SSH_PORT" >&2; exit 1; }

nom_simple() {
    # $1 = nom du secret, $2 = valeur
    case $2 in
        '') refuser "$1" "vide" ;;
        -*) refuser "$1" "commence par « - »" ;;
        *[!A-Za-z0-9._-]*) refuser "$1" "caractère non permis (seuls lettres, chiffres et . _ -)" ;;
    esac
}

nom_simple SSH_HOST "$1"
nom_simple SSH_USER "$2"

port=$3
case $port in
    '') ;;
    *[!0-9]*) refuser SSH_PORT "chiffres seulement" ;;
    ??????*) refuser SSH_PORT "au plus 5 chiffres" ;;
    *)
        if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
            refuser SSH_PORT "numéro de port de 1 à 65535 attendu"
        fi
        ;;
esac

exit 0
