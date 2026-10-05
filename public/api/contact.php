<?php

/**
 * Point d'entrée du formulaire de contact (POST /api/contact.php), sur l'hébergement PHP du site.
 * Logique et tests : lib/contact.php et tests/php/.
 *
 * Configuration (config.php, jamais versionnée, créée sur le serveur à partir de config.sample.php), cherchée
 * dans cet ordre : variable d'environnement FAN2HARMONIE_CONFIG ; « fan2harmonie-contact/config.php » à côté
 * de la racine web (hors de celle-ci : recommandé) ; « api/config.php » en dernier recours. Sans configuration :
 * réponse 500 « Configuration manquante ».
 *
 * Ce fichier reste lisible par d'anciennes versions de PHP : il vérifie d'abord les exigences d'exécution
 * (lib/exigences.php) et répond par une erreur 500 générique si elles ne sont pas remplies.
 */

declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/lib/exigences.php';

$manquantes = Fan2Harmonie\Contact\exigencesManquantesIci();
if ($manquantes !== []) {
    error_log('contact.php : exigences manquantes : ' . implode(', ', $manquantes));
    $reponse = Fan2Harmonie\Contact\reponseExigencesManquantes();
    if (!headers_sent()) {
        header_remove('X-Powered-By');
        http_response_code($reponse['statut']);
        foreach ($reponse['entetes'] as $nom => $valeur) {
            header($nom . ': ' . $valeur);
        }
    }
    echo $reponse['contenu'];
    exit;
}

require_once __DIR__ . '/lib/contact.php';

try {
    $env = getenv();
    $chemin = Fan2Harmonie\Contact\trouverConfig($env, __DIR__);
    $config = $chemin === null ? null : Fan2Harmonie\Contact\chargerConfig($chemin);
    $resultat = Fan2Harmonie\Contact\executer($_POST, $_SERVER, $config, $env, $_FILES);
} catch (Throwable $erreur) {
    error_log('contact.php : erreur interne.');
    $resultat = Fan2Harmonie\Contact\echec(500, Fan2Harmonie\Contact\MESSAGE_INTERNE);
}

Fan2Harmonie\Contact\emettre(Fan2Harmonie\Contact\rendreReponse($resultat, Fan2Harmonie\Contact\veutJson($_SERVER)));
