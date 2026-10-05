<?php

/**
 * Configuration de TEST du formulaire pour le vrai Apache de tests/apache/ : JAMAIS en production.
 * Copiée par demarrer.sh HORS de la racine web (/srv/fan2harmonie-test/config.php) et désignée par la variable
 * d'environnement FAN2HARMONIE_CONFIG du conteneur (mécanisme documenté de public/api/config.sample.php).
 * Transport de test : les messages sont écrits dans des fichiers (MAIL_TRANSPORT=file dans le conteneur).
 */

declare(strict_types=1);

return [
    'destinataire' => 'contact@fan2harmonie.fr',
    'expediteur' => 'site@fan2harmonie.fr',
    'origines_autorisees' => ['https://fan2harmonie.fr'],
    'limite_par_heure' => 50,
    'limite_globale_par_heure' => 100,
    'entrees_max' => 2000,
    'dossier_limiteur' => '/srv/fan2harmonie-test/limiteur',
    'secret_limiteur' => 'secret-de-test-apache-0123456789abcdefghij',
    'taille_max_message' => 5000,
    'transport_test' => true,
    'dossier_transport_test' => '/srv/fan2harmonie-test/courriers',
];
