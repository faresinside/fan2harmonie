<?php

/**
 * Limiteur sur fichier (dossier temporaire réel) : par client (IPv4, IPv6 par /64), plafond global, plafond du
 * nombre d'entrées, purge, fichier privé (pas de lien symbolique, propriétaire, verrou borné).
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\cleClient;
use function Fan2Harmonie\Contact\fabriquerLimiteur;
use function Fan2Harmonie\Contact\limiteurFichier;

const SECRET_TEST = 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk';
const DEBUT = 1_800_000_000;

/** Horloge réglable : `$maintenant` est lu à chaque appel. */
function horloge(int &$maintenant): Closure
{
    return static function () use (&$maintenant): int {
        return $maintenant;
    };
}

function lireLimiteur(string $dossier): array
{
    return json_decode((string) file_get_contents($dossier . '/fan2harmonie-limiteur.json'), true);
}

const OUI = ['autorise' => true, 'reessayer' => 0];

test('limiteur sur fichier : limite par client sur une heure glissante, empreinte seulement, purge, droits 0600', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 2, 20, 2000, horloge($maintenant));

    egal(OUI, $limiteur('203.0.113.7'));
    $maintenant += 600;
    egal(OUI, $limiteur('203.0.113.7'));
    $maintenant += 600;
    egal(['autorise' => false, 'reessayer' => 2400], $limiteur('203.0.113.7'), 'le plus ancien envoi sort de la fenêtre dans 40 min');
    egal(OUI, $limiteur('198.51.100.20'), 'un autre client a sa propre limite');

    $fichier = $dossier . '/fan2harmonie-limiteur.json';
    egal('0600', substr(sprintf('%o', fileperms($fichier)), -4), 'droits du fichier');
    $contenu = (string) file_get_contents($fichier);
    absent('203.0.113.7', $contenu, 'adresse IP en clair');
    absent('198.51.100.20', $contenu, 'adresse IP en clair');
    $donnees = lireLimiteur($dossier);
    egal(['*', hash_hmac('sha256', '203.0.113.7', SECRET_TEST), hash_hmac('sha256', '198.51.100.20', SECRET_TEST)], array_keys($donnees));
    egal([DEBUT, DEBUT + 600, DEBUT + 1200], $donnees['*'], 'compteur global : envois acceptés seulement');

    // 61 minutes après le premier envoi : il est purgé, un nouvel envoi passe.
    $maintenant = DEBUT + 3660;
    egal(OUI, $limiteur('203.0.113.7'));
    // Bien plus tard : toutes les entrées anciennes sont purgées.
    $maintenant = DEBUT + 3 * 3600;
    egal(OUI, $limiteur('192.0.2.1'));
    $cle = hash_hmac('sha256', '192.0.2.1', SECRET_TEST);
    egal(['*' => [$maintenant], $cle => [$maintenant]], lireLimiteur($dossier));
});

test('limiteur : purge seule (requête refusée ou piège) — rien n’est compté, les entrées expirées disparaissent', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 1, 20, 2000, horloge($maintenant));
    egal(OUI, $limiteur('203.0.113.7'));
    $maintenant += 10;
    egal(OUI, $limiteur('198.51.100.20', false), 'la purge seule n’est jamais refusée');
    egal(2, count(lireLimiteur($dossier)), 'purge seule : rien n’est ajouté');
    $maintenant = DEBUT + 3601;
    $limiteur('198.51.100.20', false);
    egal([], lireLimiteur($dossier), 'entrées expirées supprimées par une simple purge');
});

test('cleClient : IPv4 telle quelle, IPv6 réduite à son /64, IPv4 dans IPv6 ramenée à l’IPv4', function (): void {
    egal('203.0.113.7', cleClient('203.0.113.7'));
    egal('2001:db8:1:2::/64', cleClient('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
    egal('2001:db8:1:2::/64', cleClient('2001:0DB8:0001:0002::1'));
    egal('203.0.113.7', cleClient('::ffff:203.0.113.7'));
    egal('203.0.113.7', cleClient('::FFFF:cb00:7107'));
    egal('inconnue', cleClient(''));
    egal('inconnue', cleClient('pas une adresse'));
});

test('limiteur : même /64 IPv6 = même compteur ; autre /64 = autre compteur ; IPv4 dans IPv6 = IPv4', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 1, 20, 2000, horloge($maintenant));
    egal(OUI, $limiteur('2001:db8:1:2::1'));
    egal(false, $limiteur('2001:db8:1:2:ffff::9')['autorise'], 'même /64');
    egal(OUI, $limiteur('2001:db8:1:3::1'), 'autre /64');
    egal(OUI, $limiteur('203.0.113.7'));
    egal(false, $limiteur('::ffff:203.0.113.7')['autorise'], 'IPv4 dans IPv6');
});

test('limiteur : plafond global par heure, tous clients confondus → refus avec délai', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 5, 3, 2000, horloge($maintenant));
    foreach (['192.0.2.1', '192.0.2.2', '192.0.2.3'] as $i => $ip) {
        $maintenant = DEBUT + $i * 100;
        egal(OUI, $limiteur($ip), $ip);
    }
    // Le plafond atteint est journalisé (une ligne par heure, voir durcissement.php).
    journalPendant(static function () use ($limiteur): void {
        egal(['autorise' => false, 'reessayer' => 3400], $limiteur('192.0.2.4'), 'plafond global atteint');
    });
    $maintenant = DEBUT + 3601;
    egal(OUI, $limiteur('192.0.2.4'), 'le plus ancien envoi est sorti de la fenêtre');
});

test('limiteur : plafond du nombre d’entrées → refus (fail closed) ; la purge libère de la place', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 5, 100, 2, horloge($maintenant));
    egal(OUI, $limiteur('192.0.2.1'));
    $maintenant += 60;
    egal(OUI, $limiteur('192.0.2.2'));
    egal(OUI, $limiteur('192.0.2.1'), 'un client déjà connu passe encore');
    egal(['autorise' => false, 'reessayer' => 3540], $limiteur('192.0.2.3'), 'nouvelle entrée refusée : plafond atteint');
    $maintenant = DEBUT + 3601 + 60;
    egal(OUI, $limiteur('192.0.2.3'), 'entrées expirées purgées : place libre');
});

test('limiteur : fichier illisible remplacé ; dossier absent → exception', function (): void {
    $dossier = dossierTemporaire();
    file_put_contents($dossier . '/fan2harmonie-limiteur.json', '{pas du json');
    chmod($dossier . '/fan2harmonie-limiteur.json', 0600);
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 1);
    egal(true, $limiteur('203.0.113.7')['autorise']);
    egal(false, $limiteur('203.0.113.7')['autorise']);
    $leve = false;
    try {
        limiteurFichier($dossier . '/absent', SECRET_TEST, 1)('203.0.113.7');
    } catch (RuntimeException) {
        $leve = true;
    }
    vrai($leve, 'dossier absent : RuntimeException attendue');
});

/** Vrai si l'appel lève une RuntimeException. */
function leve(callable $appel): bool
{
    try {
        $appel();
    } catch (RuntimeException) {
        return true;
    }
    return false;
}

test('limiteur : fichier remplacé par un lien symbolique → refus, la cible n’est pas touchée', function (): void {
    $dossier = dossierTemporaire();
    $cible = $dossier . '/cible.txt';
    file_put_contents($cible, 'ne pas écraser');
    symlink($cible, $dossier . '/fan2harmonie-limiteur.json');
    vrai(leve(static fn () => limiteurFichier($dossier, SECRET_TEST, 1)('203.0.113.7')), 'lien symbolique accepté');
    egal('ne pas écraser', file_get_contents($cible));
});

test('limiteur : fichier qui n’est pas un fichier ordinaire ou appartient à un autre compte → refus', function (): void {
    $dossier = dossierTemporaire();
    mkdir($dossier . '/fan2harmonie-limiteur.json');
    vrai(leve(static fn () => limiteurFichier($dossier, SECRET_TEST, 1)('203.0.113.7')), 'dossier accepté à la place du fichier');

    if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
        return; // Changer le propriétaire demande les droits de root (cas du conteneur de test).
    }
    $dossier = dossierTemporaire();
    $fichier = $dossier . '/fan2harmonie-limiteur.json';
    file_put_contents($fichier, '{}');
    chmod($fichier, 0600);
    chown($fichier, 4321);
    vrai(leve(static fn () => limiteurFichier($dossier, SECRET_TEST, 1)('203.0.113.7')), 'fichier d’un autre compte accepté');
});

test('limiteur : verrou tenu par un autre processus → abandon borné (≈ 2 s) avec exception', function (): void {
    $dossier = dossierTemporaire();
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 1);
    egal(true, $limiteur('192.0.2.1')['autorise']);
    $autre = fopen($dossier . '/fan2harmonie-limiteur.json', 'r');
    flock($autre, LOCK_EX);
    $debut = microtime(true);
    try {
        vrai(leve(static fn () => $limiteur('192.0.2.2')), 'verrou occupé : exception attendue');
    } finally {
        flock($autre, LOCK_UN);
        fclose($autre);
    }
    $duree = microtime(true) - $debut;
    vrai($duree >= 1.5 && $duree < 4, sprintf('attente bornée (%.2f s)', $duree));
    egal(true, $limiteur('192.0.2.2')['autorise'], 'verrou libéré : fonctionne de nouveau');
});

test('fabriquerLimiteur : secret, limites et dossier de la configuration', function (): void {
    $dossier = dossierTemporaire();
    $limiteur = fabriquerLimiteur(configTest(['dossier_limiteur' => $dossier, 'limite_par_heure' => 1, 'secret_limiteur' => SECRET_TEST]));
    egal(true, $limiteur('203.0.113.7')['autorise']);
    egal(false, $limiteur('203.0.113.7')['autorise']);
    vrai(array_key_exists(hash_hmac('sha256', '203.0.113.7', SECRET_TEST), lireLimiteur($dossier)), 'empreinte avec le secret de la configuration');
    egal([], glob($dossier . '/fan2harmonie-secret*') ?: [], 'aucun fichier de secret créé');
});
