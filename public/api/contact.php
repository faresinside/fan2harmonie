<?php

/**
 * Point d'entrée du formulaire de contact (POST /api/contact.php), sur l'hébergement PHP du site.
 * Logique et tests : lib/contact.php et tests/php/. Configuration : config.php (même dossier, non versionné,
 * créé sur le serveur à partir de config.sample.php) ; s'il manque, réponse 500 « Configuration manquante ».
 */

declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/lib/contact.php';

use function Fan2Harmonie\Contact\chargerConfig;
use function Fan2Harmonie\Contact\echec;
use function Fan2Harmonie\Contact\emettre;
use function Fan2Harmonie\Contact\executer;
use function Fan2Harmonie\Contact\rendreReponse;
use function Fan2Harmonie\Contact\veutJson;

try {
    $resultat = executer($_POST, $_SERVER, chargerConfig(__DIR__ . '/config.php'), getenv());
} catch (Throwable) {
    error_log('contact.php : erreur interne.');
    $resultat = echec(500, Fan2Harmonie\Contact\MESSAGE_INTERNE);
}

emettre(rendreReponse($resultat, veutJson($_SERVER)));
