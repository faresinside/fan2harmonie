<?php

/**
 * Exigences d'exécution du relais de connexion GitHub de /admin (oauth/auth.php, oauth/callback.php),
 * vérifiées par les deux points d'entrée AVANT de charger lib/oauth.php (qui demande PHP 8.1). Écrit dans une
 * syntaxe que d'anciennes versions de PHP savent lire, pour répondre proprement sur un hébergement mal réglé.
 * Demandé directement par le web, ce fichier ne fait que déclarer des fonctions : il n'affiche rien.
 *
 * cURL est EXIGÉ (pas de repli sur les flux de PHP) : l'échange du code contre le jeton se fait toujours avec
 * vérification TLS, délais courts, sans redirection et en HTTPS seulement, réglages que cURL garantit.
 */

declare(strict_types=1);

namespace Fan2Harmonie\OAuth;

/** Extensions PHP nécessaires, dans l'ordre du message de journal. */
const EXTENSIONS_REQUISES = ['curl', 'json', 'hash'];

/**
 * Exigences non remplies (noms seulement, pour le journal) : PHP ≥ 8.1 et les extensions curl, json, hash.
 * Liste vide si tout est là.
 *
 * @param int      $versionPhp       PHP_VERSION_ID.
 * @param callable $extensionChargee Nom d'extension → bool (extension_loaded).
 * @return string[]
 */
function exigencesManquantes($versionPhp, $extensionChargee)
{
    $manquantes = [];
    if ($versionPhp < 80100) {
        $manquantes[] = 'PHP >= 8.1';
    }
    foreach (EXTENSIONS_REQUISES as $extension) {
        if (!$extensionChargee($extension)) {
            $manquantes[] = $extension;
        }
    }
    return $manquantes;
}

/** Exigences non remplies par le PHP qui exécute ce code. */
function exigencesManquantesIci()
{
    return exigencesManquantes(PHP_VERSION_ID, function ($extension) {
        return extension_loaded($extension);
    });
}

/** Réponse 500 générique (page sans script ; le détail des manques va seulement dans le journal). */
function reponseExigencesManquantes()
{
    return [
        'statut' => 500,
        'entetes' => [
            'Content-Type' => 'text/html; charset=utf-8',
            'Cache-Control' => 'no-store',
            'Referrer-Policy' => 'no-referrer',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ],
        'contenu' => "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n"
            . "<meta name=\"robots\" content=\"noindex\">\n<title>Connexion impossible — Fan 2 Harmonie</title>\n</head>\n"
            . "<body>\n<h1>Connexion impossible</h1>\n"
            . "<p>Le service de connexion est momentanément indisponible. Fermez cette fenêtre et réessayez plus tard.</p>\n"
            . "</body>\n</html>\n",
    ];
}
