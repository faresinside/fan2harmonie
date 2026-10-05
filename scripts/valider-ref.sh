#!/usr/bin/env bash
# Garde-fou du champ « ref » du lancement manuel du déploiement (.github/workflows/deploiement.yml).
#
#   bash scripts/valider-ref.sh syntaxe "$REF"
#       Accepte « main », un SHA complet (40 caractères hexadécimaux en minuscules) ou une valeur vide (= main).
#       Affiche la référence retenue ; refuse tout le reste (SHA court, majuscules, espaces, retour à la ligne,
#       option « --… », nom de branche…). Le test est fait par bash ([[ =~ ]]) sur la chaîne entière : un
#       retour à la ligne ne peut pas faire passer une seconde ligne (piège de « grep -x »).
#   bash scripts/valider-ref.sh ancetre
#       Dans le dépôt courant (après le checkout de la version demandée) : refuse un commit qui n'est pas
#       atteignable depuis origin/main (jamais une branche de côté ni un commit étranger).
set -euo pipefail

case "${1:-}" in
    syntaxe)
        ref="${2-}"
        if [[ -z "$ref" ]]; then
            ref=main
        fi
        if [[ ! "$ref" =~ ^([0-9a-f]{40}|main)$ ]]; then
            echo "« ref » refusée : un SHA complet de 40 caractères (minuscules) ou « main » est attendu." >&2
            exit 1
        fi
        printf '%s\n' "$ref"
        ;;
    ancetre)
        if ! git merge-base --is-ancestor HEAD origin/main; then
            echo "Version refusée : ce commit n'est pas dans l'historique de main." >&2
            exit 1
        fi
        ;;
    *)
        echo "usage : valider-ref.sh syntaxe REF | valider-ref.sh ancetre" >&2
        exit 2
        ;;
esac
