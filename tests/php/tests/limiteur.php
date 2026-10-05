<?php

/**
 * Limiteur sur fichier (dossier temporaire réel) et secret du limiteur.
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\limiteurFichier;
use function Fan2Harmonie\Contact\secretLimiteur;

test('limiteur sur fichier : limite par adresse sur une heure glissante, empreinte seulement, purge, droits 0600', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = 1_800_000_000;
    $horloge = static function () use (&$maintenant): int {
        return $maintenant;
    };
    $limiteur = limiteurFichier($dossier, str_repeat('k', 64), 2, $horloge);

    egal(['autorise' => true, 'reessayer' => 0], $limiteur('203.0.113.7'));
    $maintenant += 600;
    egal(['autorise' => true, 'reessayer' => 0], $limiteur('203.0.113.7'));
    $maintenant += 600;
    egal(['autorise' => false, 'reessayer' => 2400], $limiteur('203.0.113.7'), 'le plus ancien envoi sort de la fenêtre dans 40 min');
    egal(['autorise' => true, 'reessayer' => 0], $limiteur('2001:db8::1'), 'une autre adresse a sa propre limite');

    $fichier = $dossier . '/fan2harmonie-limiteur.json';
    vrai(is_file($fichier), 'fichier du limiteur créé');
    egal('0600', substr(sprintf('%o', fileperms($fichier)), -4), 'droits du fichier');
    $contenu = (string) file_get_contents($fichier);
    absent('203.0.113.7', $contenu, 'adresse IP en clair');
    absent('2001:db8::1', $contenu, 'adresse IP en clair');
    $donnees = json_decode($contenu, true);
    egal(2, count($donnees), 'deux empreintes');
    foreach ($donnees as $empreinte => $instants) {
        egal(1, preg_match('/^[0-9a-f]{64}$/', (string) $empreinte), 'empreinte HMAC-SHA256 en hexadécimal');
        vrai(array_is_list($instants) && $instants !== [], 'liste d’instants');
    }
    egal(hash_hmac('sha256', '203.0.113.7', str_repeat('k', 64)), array_key_first($donnees));

    // 61 minutes après le premier envoi : il est purgé, un nouvel envoi passe.
    $maintenant = 1_800_000_000 + 3660;
    egal(['autorise' => true, 'reessayer' => 0], $limiteur('203.0.113.7'));
    // Plus d'une heure après tout : toutes les entrées anciennes sont purgées (la seconde adresse disparaît).
    $maintenant = 1_800_000_000 + 3 * 3600;
    egal(['autorise' => true, 'reessayer' => 0], $limiteur('198.51.100.9'));
    $donnees = json_decode((string) file_get_contents($fichier), true);
    egal([hash_hmac('sha256', '198.51.100.9', str_repeat('k', 64))], array_keys($donnees));
    egal([$maintenant], $donnees[array_key_first($donnees)]);
});

test('limiteur sur fichier : fichier illisible remplacé, dossier inutilisable → exception (aucun envoi)', function (): void {
    $dossier = dossierTemporaire();
    file_put_contents($dossier . '/fan2harmonie-limiteur.json', '{pas du json');
    $limiteur = limiteurFichier($dossier, str_repeat('k', 64), 1);
    egal(true, $limiteur('203.0.113.7')['autorise']);
    egal(false, $limiteur('203.0.113.7')['autorise']);

    $leve = false;
    try {
        limiteurFichier($dossier . '/absent', str_repeat('k', 64), 1)('203.0.113.7');
    } catch (RuntimeException) {
        $leve = true;
    }
    vrai($leve, 'dossier absent : RuntimeException attendue');
});

test('secret du limiteur : celui de la configuration, sinon un secret aléatoire gardé dans un fichier 0600', function (): void {
    $dossier = dossierTemporaire();
    egal(str_repeat('s', 40), secretLimiteur(['secret_limiteur' => str_repeat('s', 40), 'dossier_limiteur' => $dossier]));
    $secret = secretLimiteur(['secret_limiteur' => '', 'dossier_limiteur' => $dossier]);
    egal(1, preg_match('/^[0-9a-f]{64}$/', $secret), 'secret aléatoire de 32 octets');
    egal($secret, secretLimiteur(['dossier_limiteur' => $dossier]), 'même secret au deuxième appel');
    $fichier = $dossier . '/fan2harmonie-secret-limiteur';
    egal('0600', substr(sprintf('%o', fileperms($fichier)), -4));
    egal($secret, trim((string) file_get_contents($fichier)));
});
