<?php

/**
 * Relais de connexion GitHub de /admin, étape 2 : GET /oauth/callback.php?code=…&state=… (retour de GitHub
 * dans la fenêtre de connexion). Vérifie le « state » contre le cookie posé par auth.php (effacé dans tous les
 * cas), échange le code contre un jeton auprès de GitHub (cURL, TLS vérifié), puis répond par une page qui
 * transmet le jeton à /admin par postMessage, vers l'origine autorisée exacte. Le jeton n'est jamais écrit
 * dans une adresse, un journal, un cookie ni un fichier. Logique et tests : lib/oauth.php et tests/php/.
 *
 * Configuration : comme auth.php (FAN2HARMONIE_OAUTH_CONFIG, puis fan2harmonie-contact/oauth-config.php hors de
 * la racine web, puis oauth/config.php).
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
    $reponse = Fan2Harmonie\OAuth\traiterCallback(
        $_GET,
        $_SERVER,
        $_COOKIE,
        $config,
        Fan2Harmonie\OAuth\clientHttpCurl(),
        'Fan2Harmonie\OAuth\genererNonce'
    );
} catch (Throwable $erreur) {
    error_log('oauth : erreur interne (callback.php).');
    $reponse = Fan2Harmonie\OAuth\reponseEchec(
        500,
        Fan2Harmonie\OAuth\DEFAUTS['origines_autorisees'],
        Fan2Harmonie\OAuth\genererNonce(),
        ['Set-Cookie' => Fan2Harmonie\OAuth\cookieEfface()]
    );
}

Fan2Harmonie\OAuth\emettre($reponse);
