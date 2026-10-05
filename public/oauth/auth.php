<?php

/**
 * Relais de connexion GitHub de /admin, étape 1 : GET /oauth/auth.php (fenêtre ouverte par Sveltia CMS, avec
 * provider=github, site_id et scope ; seul « provider » est lu). Tire un « state » aléatoire, le pose dans un
 * cookie réservé à /oauth/, puis redirige vers la page d'autorisation de GitHub. Logique et tests :
 * lib/oauth.php et tests/php/.
 *
 * Configuration (client_id, client_secret… ; modèle : config.sample.php), cherchée dans cet ordre : variable
 * d'environnement FAN2HARMONIE_OAUTH_CONFIG ; « fan2harmonie-contact/oauth-config.php » à côté de la racine web
 * (hors de celle-ci : recommandé) ; « oauth/config.php » en dernier recours. Absente ou invalide : page 500
 * générique.
 *
 * Ce fichier reste lisible par d'anciennes versions de PHP : il vérifie d'abord les exigences d'exécution
 * (lib/exigences.php) et répond par une page 500 générique si elles ne sont pas remplies.
 */

declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/lib/exigences.php';

$manquantes = Fan2Harmonie\OAuth\exigencesManquantesIci();
if ($manquantes !== []) {
    error_log('oauth : exigences manquantes : ' . implode(', ', $manquantes));
    $reponse = Fan2Harmonie\OAuth\reponseExigencesManquantes();
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

require_once __DIR__ . '/lib/oauth.php';

try {
    $config = Fan2Harmonie\OAuth\configDepuisServeur(getenv(), __DIR__);
    $reponse = Fan2Harmonie\OAuth\traiterAuth(
        $_GET,
        $_SERVER,
        $config,
        'Fan2Harmonie\OAuth\genererEtat',
        'Fan2Harmonie\OAuth\genererNonce'
    );
} catch (Throwable $erreur) {
    error_log('oauth : erreur interne (auth.php).');
    $reponse = Fan2Harmonie\OAuth\reponseEchec(500, Fan2Harmonie\OAuth\DEFAUTS['origines_autorisees'], Fan2Harmonie\OAuth\genererNonce());
}

Fan2Harmonie\OAuth\emettre($reponse);
