<?php

/**
 * Exigences d'exécution vérifiées par l'entrée avant de charger la bibliothèque (public/api/lib/exigences.php).
 */

declare(strict_types=1);

if (is_file(RACINE . '/public/api/lib/exigences.php')) {
    require_once RACINE . '/public/api/lib/exigences.php';
}

use function Fan2Harmonie\Contact\exigencesManquantes;
use function Fan2Harmonie\Contact\exigencesManquantesIci;
use function Fan2Harmonie\Contact\reponseExigencesManquantes;

test('exigences : PHP ≥ 8.1, mbstring, ctype, json, hash, filter, PCRE avec UTF-8', function (): void {
    $toutes = static fn (string $extension): bool => true;
    $pcreOk = static fn (): bool => true;
    egal([], exigencesManquantes(80111, $toutes, $pcreOk));
    // 8.1.0 à 8.1.10 refusées : 8.1.11 au moins (corrections de sécurité).
    egal(['PHP >= 8.1.11'], exigencesManquantes(80110, $toutes, $pcreOk));
    egal(['PHP >= 8.1.11'], exigencesManquantes(80100, $toutes, $pcreOk));
    egal([], exigencesManquantes(80312, $toutes, $pcreOk));
    egal(['PHP >= 8.1.11'], exigencesManquantes(80030, $toutes, $pcreOk));
    $sansMbstringNiJson = static fn (string $extension): bool => !in_array($extension, ['mbstring', 'json'], true);
    egal(['mbstring', 'json'], exigencesManquantes(80111, $sansMbstringNiJson, $pcreOk));
    egal(['ctype', 'hash', 'filter'], exigencesManquantes(80111, static fn (string $e): bool => !in_array($e, ['ctype', 'hash', 'filter'], true), $pcreOk));
    egal(['pcre (UTF-8)'], exigencesManquantes(80111, $toutes, static fn (): bool => false));
    egal(['PHP >= 8.1.11', 'mbstring', 'json', 'pcre (UTF-8)'], exigencesManquantes(70400, $sansMbstringNiJson, static fn (): bool => false));
});

test('exigences : remplies dans ce conteneur (PHP ' . PHP_VERSION . ')', function (): void {
    egal([], exigencesManquantesIci());
});

test('exigences manquantes : 500 JSON générique, sans le détail des manques', function (): void {
    $reponse = reponseExigencesManquantes();
    egal(500, $reponse['statut']);
    egal('application/json; charset=utf-8', $reponse['entetes']['Content-Type']);
    egal('no-store', $reponse['entetes']['Cache-Control']);
    egal('nosniff', $reponse['entetes']['X-Content-Type-Options']);
    egal('{"ok":false,"errors":[{"message":"Service momentanément indisponible."}]}', $reponse['contenu']);
});
