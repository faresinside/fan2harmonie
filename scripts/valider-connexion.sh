#!/bin/sh
# Garde-fou du déploiement (scripts/deployer.sh, .github/workflows/deploiement.yml) : paramètres de connexion
# FTPS / SFTP lus dans les secrets de l'environnement « production ». Usage :
#     sh scripts/valider-connexion.sh "$DEPLOY_PROTOCOL" "$DEPLOY_HOST" "$DEPLOY_USER" "$DEPLOY_PORT"
# Code 0 si les quatre valeurs sont acceptables ; sinon un message sur la sortie d'erreur et le code 1.
#
# DEPLOY_PROTOCOL : exactement « ftps » ou « sftp » (jamais « ftp » seul : le mot de passe passerait en clair).
# DEPLOY_HOST et DEPLOY_USER : non vides, seulement lettres, chiffres et . _ - (ni espace, ni retour à la ligne,
# ni « @ », « : », « ; », « $ »…), jamais « - » en premier (lftp lirait une option).
# DEPLOY_PORT : vide (= 21 en FTPS, 22 en SFTP) ou un nombre de 1 à 65535, chiffres seulement.
set -u

refuser() {
    echo "$1 refusé : $2" >&2
    exit 1
}

[ "$#" -eq 4 ] || { echo "usage : valider-connexion.sh DEPLOY_PROTOCOL DEPLOY_HOST DEPLOY_USER DEPLOY_PORT" >&2; exit 1; }

case $1 in
    ftps | sftp) ;;
    *) refuser DEPLOY_PROTOCOL "« ftps » ou « sftp » exigé" ;;
esac

nom_simple() {
    # $1 = nom du secret, $2 = valeur
    case $2 in
        '') refuser "$1" "vide" ;;
        -*) refuser "$1" "commence par « - »" ;;
        *[!A-Za-z0-9._-]*) refuser "$1" "caractère non permis (seuls lettres, chiffres et . _ -)" ;;
    esac
}

nom_simple DEPLOY_HOST "$2"
nom_simple DEPLOY_USER "$3"

port=$4
case $port in
    '') ;;
    *[!0-9]*) refuser DEPLOY_PORT "chiffres seulement" ;;
    ??????*) refuser DEPLOY_PORT "au plus 5 chiffres" ;;
    *)
        if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
            refuser DEPLOY_PORT "numéro de port de 1 à 65535 attendu"
        fi
        ;;
esac

exit 0
