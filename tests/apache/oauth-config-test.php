<?php

/**
 * Configuration de TEST du relais de connexion GitHub (public/oauth/) pour le vrai Apache de tests/apache/ :
 * JAMAIS en production. Copiée par demarrer.sh HORS de la racine web (/srv/fan2harmonie-test/oauth-config.php)
 * et désignée par la variable d'environnement FAN2HARMONIE_OAUTH_CONFIG du service « apache ». Identifiant et
 * secret inventés : le réseau de test n'a pas accès à Internet et aucun code n'y est jamais échangé.
 */

declare(strict_types=1);

return [
    'client_id' => 'Iv1.apachetest0001',
    'client_secret' => 'secret0de0test0apache0123456789abcdef01',
    'origines_autorisees' => ['https://fan2harmonie.fr'],
    'scope' => 'repo',
    'url_callback' => 'https://fan2harmonie.fr/oauth/callback.php',
];
