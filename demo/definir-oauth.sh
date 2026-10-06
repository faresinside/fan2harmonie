#!/bin/sh
# Enregistre les identifiants de l'OAuth App GitHub (connexion à /admin) dans le dossier PRIVÉ du serveur.
# À lancer par vous, dans un terminal (ssh -t …), pour que le « client secret » ne passe jamais par un message,
# ni par le dépôt, ni par l'historique du terminal : il est saisi sans affichage.
#
# Usage : sh definir-oauth.sh
set -eu

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
cd "$DOSSIER"
[ -d private ] || { echo "Lancez d'abord preparer-serveur.sh" >&2; exit 1; }

printf "Client ID de l'OAuth App GitHub : "
read -r CLIENT_ID
printf "Client secret (saisie masquée) : "
stty -echo
read -r CLIENT_SECRET
stty echo
printf "\n"

# Seuls des caractères sûrs sont acceptés (jamais de guillemet ni de retour à la ligne dans le fichier PHP).
case "$CLIENT_ID" in ""|*[!A-Za-z0-9._-]*) echo "Client ID invalide." >&2; exit 1;; esac
case "$CLIENT_SECRET" in ""|*[!A-Za-z0-9._-]*) echo "Client secret invalide." >&2; exit 1;; esac

TMP="$(mktemp)"
cat > "$TMP" <<PHP
<?php

declare(strict_types=1);

// Relais de connexion GitHub de la DÉMONSTRATION. Fichier privé : jamais versionné.
return [
    'client_id' => '$CLIENT_ID',
    'client_secret' => '$CLIENT_SECRET',
    'origines_autorisees' => ['https://fan2harmonie.casticode.com'],
    // Dépôt PUBLIC : droits les plus étroits.
    'scope' => 'public_repo',
    'url_callback' => 'https://fan2harmonie.casticode.com/oauth/callback.php',
    'transport_test' => false,
];
PHP

docker run --rm -v "$DOSSIER/private:/p" -v "$TMP:/tmp-oauth.php:ro" alpine sh -c \
  'cp /tmp-oauth.php /p/oauth-config.php && chown 33:33 /p/oauth-config.php && chmod 600 /p/oauth-config.php'
rm -f "$TMP"
unset CLIENT_ID CLIENT_SECRET
echo "Identifiants enregistrés dans private/oauth-config.php (droits 0600)."
