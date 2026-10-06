<?php

/**
 * Exigences d'exécution du formulaire de contact, vérifiées par api/contact.php AVANT de charger
 * lib/contact.php (qui demande PHP 8.1). Écrit dans une syntaxe que d'anciennes versions de PHP savent lire,
 * pour pouvoir répondre proprement sur un hébergement mal réglé. Demandé directement par le web, ce fichier
 * ne fait que déclarer des fonctions : il n'affiche rien.
 */

declare(strict_types=1);

namespace Fan2Harmonie\Contact;

/** Extensions PHP nécessaires, dans l'ordre du message de journal. */
const EXTENSIONS_REQUISES = ['mbstring', 'ctype', 'json', 'hash', 'filter'];

/**
 * Exigences non remplies (noms seulement, pour le journal) : PHP ≥ 8.1.11, extensions mbstring, ctype, json, hash,
 * filter, et PCRE capable de lire l'UTF-8. Liste vide si tout est là.
 *
 * @param int      $versionPhp       PHP_VERSION_ID.
 * @param callable $extensionChargee Nom d'extension → bool (extension_loaded).
 * @param callable $pcreUtf8         () → bool : PCRE accepte le modificateur « u ».
 * @return string[]
 */
function exigencesManquantes(int $versionPhp, callable $extensionChargee, callable $pcreUtf8): array
{
    $manquantes = [];
    // 8.1.11 au moins : les versions 8.1.0 à 8.1.10 ont des failles de sécurité connues, corrigées depuis.
    if ($versionPhp < 80111) {
        $manquantes[] = 'PHP >= 8.1.11';
    }
    foreach (EXTENSIONS_REQUISES as $extension) {
        if (!$extensionChargee($extension)) {
            $manquantes[] = $extension;
        }
    }
    if (!$pcreUtf8()) {
        $manquantes[] = 'pcre (UTF-8)';
    }
    return $manquantes;
}

// posix est seulement RECOMMANDÉE (README) : sans elle, le compte du processus PHP est lu sur une sonde
// créée dans le dossier du limiteur (proprietaireAttendu dans lib/contact.php). Elle n'est donc pas vérifiée ici.

/** Exigences non remplies par le PHP qui exécute ce code. */
function exigencesManquantesIci(): array
{
    return exigencesManquantes(
        PHP_VERSION_ID,
        function ($extension) {
            return extension_loaded($extension);
        },
        function () {
            return function_exists('preg_match') && @preg_match('//u', '') === 1;
        }
    );
}

/** Réponse 500 générique (sans le détail des manques, qui va seulement dans le journal). */
function reponseExigencesManquantes(): array
{
    return [
        'statut' => 500,
        'entetes' => [
            'Content-Type' => 'application/json; charset=utf-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ],
        'contenu' => '{"ok":false,"errors":[{"message":"Service momentanément indisponible."}]}',
    ];
}
