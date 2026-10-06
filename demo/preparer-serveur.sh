#!/bin/sh
# Préparation UNIQUE du dossier de la démonstration sur le serveur (/opt/docker/fan2harmonie).
# Sûr à relancer : ne remplace jamais une configuration ni un secret existants.
#
# Crée le dossier privé (hors de la racine web du conteneur), la configuration du formulaire avec un secret
# généré ici (jamais écrit dans le dépôt), et donne le dossier à l'utilisateur sous lequel PHP s'exécute (www-data,
# uid 33). N'installe rien sur le serveur : tout passe par Docker.
set -eu

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
cd "$DOSSIER"

mkdir -p site private/limiteur private/messages

if [ ! -f private/config.php ]; then
  SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > private/config.php <<PHP
<?php

declare(strict_types=1);

// Configuration du formulaire pour la DÉMONSTRATION (voir LISEZ-MOI.md). Fichier privé : jamais versionné.
return [
    'destinataire' => 'contact@fan2harmonie.fr',
    'expediteur' => 'site@fan2harmonie.fr',
    'origines_autorisees' => ['https://fan2harmonie.casticode.com'],
    // Démonstration : limites larges (tous les visiteurs passent par l'adresse du relais Cloudflare/Traefik).
    'limite_par_heure' => 30,
    'limite_globale_par_heure' => 200,
    'entrees_max' => 2000,
    'dossier_limiteur' => '/srv/fan2harmonie-contact/limiteur',
    'secret_limiteur' => '$SECRET',
    'taille_max_message' => 5000,
    // Démonstration seulement : les messages sont écrits dans un dossier au lieu d'être envoyés par e-mail.
    'transport_test' => true,
    'dossier_transport_test' => '/srv/fan2harmonie-contact/messages',
];
PHP
  echo "Configuration du formulaire créée (secret généré)."
else
  echo "Configuration du formulaire déjà présente : conservée."
fi

# Propriétaire www-data (33), droits stricts : dossier 0700, fichiers 0600 (le dossier ne doit être ni
# modifiable par le groupe ni par les autres, sinon le formulaire refuse de démarrer).
docker run --rm -v "$DOSSIER/private:/p" alpine sh -c \
  'chown -R 33:33 /p && chmod 700 /p /p/limiteur /p/messages && chmod 600 /p/*.php 2>/dev/null; true'

echo "Dossier prêt : $DOSSIER"
