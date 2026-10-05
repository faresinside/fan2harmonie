<?php

/**
 * Durcissement du limiteur et de la configuration (revue de sécurité de la tâche 11b-1) :
 * dossier du limiteur (propriétaire, droits, lien), liens physiques, qualité du secret, compte du processus,
 * journaux (plafond global, purges, chemin de configuration), exigences recommandées.
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\configValide;
use function Fan2Harmonie\Contact\executer;
use function Fan2Harmonie\Contact\exigencesManquantes;
use function Fan2Harmonie\Contact\limiteurFichier;
use function Fan2Harmonie\Contact\proprietaireAttendu;
use function Fan2Harmonie\Contact\recommandationsManquantes;
use function Fan2Harmonie\Contact\secretValide;
use function Fan2Harmonie\Contact\trouverConfig;
use function Fan2Harmonie\Contact\uidParSonde;

/** Lignes écrites par error_log() pendant `$fn` (journal redirigé vers un fichier temporaire). */
function journalPendant(callable $fn): string
{
    $fichier = dossierTemporaire() . '/journal.log';
    $ancien = ini_get('error_log');
    ini_set('error_log', $fichier);
    try {
        $fn();
    } finally {
        ini_set('error_log', $ancien === false ? '' : $ancien);
    }
    return is_file($fichier) ? (string) file_get_contents($fichier) : '';
}

/** Vrai si le processus de test est root (nécessaire pour changer le propriétaire d'un fichier). */
function estRoot(): bool
{
    return function_exists('posix_geteuid') && posix_geteuid() === 0;
}

// ---------- N1 : dossier du limiteur ----------

test('N1 : dossier du limiteur ouvert en écriture au groupe ou à tous, ou lien symbolique → configuration invalide', function (): void {
    foreach ([0770, 0720, 0702, 0777, 0775] as $droits) {
        vrai(!configValide(configTest(['dossier_limiteur' => dossierAvecDroits($droits)])), sprintf('droits %o acceptés à tort', $droits));
    }
    foreach ([0700, 0750, 0755, 0711] as $droits) {
        vrai(configValide(configTest(['dossier_limiteur' => dossierAvecDroits($droits)])), sprintf('droits %o refusés à tort', $droits));
    }
    $cible = dossierAvecDroits(0700);
    $lien = dirname($cible) . '/lien';
    symlink($cible, $lien);
    vrai(!configValide(configTest(['dossier_limiteur' => $lien])), 'lien symbolique vers un dossier valide accepté');
});

test('N1 : dossier du limiteur appartenant à un autre compte → configuration invalide', function (): void {
    if (!estRoot()) {
        return; // Changer le propriétaire demande les droits de root (cas du conteneur de test).
    }
    $dossier = dossierAvecDroits(0700);
    chown($dossier, 4321);
    vrai(!configValide(configTest(['dossier_limiteur' => $dossier])), 'dossier d’un autre compte accepté');
});

// ---------- N2 : liens physiques ----------

test('N2 : fichier du limiteur ayant un second lien physique → refus, le fichier lié reste intact', function (): void {
    $dossier = dossierTemporaire();
    $ailleurs = dossierTemporaire();
    $fichier = $dossier . '/fan2harmonie-limiteur.json';
    file_put_contents($fichier, '{}');
    chmod($fichier, 0600);
    link($fichier, $ailleurs . '/copie.json');
    vrai(leve(static fn () => limiteurFichier($dossier, SECRET_TEST, 1)('203.0.113.7')), 'fichier à deux liens physiques accepté');
    egal('{}', file_get_contents($ailleurs . '/copie.json'));
    unlink($ailleurs . '/copie.json');
    egal(true, limiteurFichier($dossier, SECRET_TEST, 1)('203.0.113.7')['autorise'], 'un seul lien : accepté');
});

// ---------- N3 : qualité du secret ----------

test('N3 : secret refusé s’il contient « CHANGER », a moins de 32 caractères ou trop peu de caractères différents', function (): void {
    $refuses = [
        'CHANGER-MOI',
        'changer-' . bin2hex(random_bytes(32)),
        bin2hex(random_bytes(16)) . 'ChAnGeR' . bin2hex(random_bytes(16)),
        str_repeat('k', 40),
        str_repeat('ab', 20),
        str_repeat('0123456789', 4),
        str_repeat('s3cr3t-', 6),
        substr(bin2hex(random_bytes(32)), 0, 31),
    ];
    foreach ($refuses as $secret) {
        vrai(!secretValide($secret), 'secret accepté à tort : ' . montrer($secret));
        vrai(!configValide(configTest(['secret_limiteur' => $secret])), 'configuration acceptée avec le secret ' . montrer($secret));
    }
    vrai(secretValide(str_repeat('0123456789abcdef', 2)), '32 caractères, 16 différents');
    vrai(secretValide('Zx8!qP2#mL5$wR9%tY3^vB6&nH1*kJ4('), 'secret varié');
});

test('N3 : la commande documentée (bin2hex(random_bytes(32))) donne toujours un secret accepté (2 000 tirages)', function (): void {
    for ($i = 0; $i < 2000; $i++) {
        $secret = bin2hex(random_bytes(32));
        vrai(secretValide($secret), 'secret généré refusé : ' . $secret);
    }
});

test('N3 : config.sample.php — secret refusé tel quel, commande de génération en commentaire', function (): void {
    $source = (string) file_get_contents(RACINE . '/public/api/config.sample.php');
    contient('php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"', $source);
    $exemple = require RACINE . '/public/api/config.sample.php';
    vrai(!secretValide($exemple['secret_limiteur']), 'secret de l’exemple accepté');
    contient('CHANGER', strtoupper($exemple['secret_limiteur']));
});

// ---------- N4 : compte du processus ----------

test('N4 : proprietaireAttendu n’utilise jamais getmyuid() (propriétaire du script, pas du processus)', function (): void {
    // Code seulement (les commentaires peuvent en parler) : aucun identifiant getmyuid.
    $identifiants = array_map(
        static fn (array $jeton): string => strtolower($jeton[1]),
        array_filter(token_get_all((string) file_get_contents(BIBLIOTHEQUE)), static fn ($j): bool => is_array($j) && $j[0] === T_STRING),
    );
    vrai(!in_array('getmyuid', $identifiants, true), 'appel à getmyuid() dans lib/contact.php');
    if (PHP_OS_FAMILY !== 'Windows') {
        egal(posix_geteuid(), proprietaireAttendu(dossierTemporaire()), 'avec posix : uid effectif');
    }
});

test('N4 : sans posix, uid lu sur un fichier que le processus vient de créer dans le dossier (sonde retirée ensuite)', function (): void {
    $dossier = dossierTemporaire();
    egal(posix_geteuid(), uidParSonde($dossier));
    egal([], array_values(array_diff(scandir($dossier) ?: [], ['.', '..'])), 'sonde supprimée');
    vrai(leve(static fn () => uidParSonde($dossier . '/absent')), 'dossier absent : exception');
});

test('N4 : sans posix, un script appartenant à un autre compte ne trompe pas la détection (≠ getmyuid)', function (): void {
    if (!estRoot()) {
        return; // Il faut root pour donner le script à un autre compte.
    }
    $dossier = dossierTemporaire();
    chmod($dossier, 0755);
    $script = $dossier . '/sonde.php';
    file_put_contents($script, '<?php require ' . var_export(BIBLIOTHEQUE, true) . ';'
        . 'echo function_exists("posix_geteuid") ? "posix" : "", "|", getmyuid(), "|", Fan2Harmonie\Contact\proprietaireAttendu(' . var_export($dossier, true) . ');');
    chown($script, 4321);
    $sortie = (string) shell_exec(escapeshellarg(PHP_BINARY) . ' -d disable_functions=posix_geteuid ' . escapeshellarg($script) . ' 2>&1');
    egal('|4321|0', $sortie, 'sans posix : uid du processus (root), pas celui du script');
});

// ---------- N5 et N6 : journaux ----------

test('N5 : plafond global atteint → une seule ligne de journal par fenêtre d’une heure', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 5, 1, 2000, horloge($maintenant));
    $journal = journalPendant(static function () use ($limiteur, &$maintenant): void {
        $limiteur('192.0.2.1');
        foreach (['192.0.2.2', '192.0.2.3', '192.0.2.4'] as $ip) {
            $maintenant += 60;
            egal(false, $limiteur($ip)['autorise'], $ip);
        }
    });
    egal(1, substr_count($journal, 'contact.php : plafond global atteint'), 'une seule ligne : ' . $journal);
    absent('192.0.2', $journal, 'aucune adresse IP dans le journal');
    egal([DEBUT + 60], lireLimiteur($dossier)['!'] ?? null, 'marqueur « ! » : instant de la ligne de journal');

    // Fenêtre suivante : une nouvelle ligne au plus.
    $journal = journalPendant(static function () use ($limiteur, &$maintenant): void {
        $maintenant = DEBUT + 2 * 3600;
        egal(true, $limiteur('192.0.2.5')['autorise']);
        egal(false, $limiteur('192.0.2.6')['autorise']);
        egal(false, $limiteur('192.0.2.7')['autorise']);
    });
    egal(1, substr_count($journal, 'contact.php : plafond global atteint'), 'nouvelle fenêtre : ' . $journal);
});

test('N5 : la limite par client et la purge ne journalisent rien ; le marqueur ne compte pas comme un client', function (): void {
    $dossier = dossierTemporaire();
    $maintenant = DEBUT;
    $limiteur = limiteurFichier($dossier, SECRET_TEST, 1, 1, 1, horloge($maintenant));
    $journal = journalPendant(static function () use ($limiteur): void {
        egal(true, $limiteur('192.0.2.1')['autorise']);
        egal(false, $limiteur('192.0.2.1')['autorise'], 'limite par client');
        $limiteur('192.0.2.9', false);
    });
    egal('', $journal);
});

test('N6 : limiteur en panne → aucune ligne de journal sur les purges seules (champ piège, erreurs de saisie)', function (): void {
    $dossier = dossierTemporaire();
    mkdir($dossier . '/fan2harmonie-limiteur.json'); // Rend le limiteur inutilisable.
    $config = configTest(['dossier_limiteur' => $dossier]);
    $journal = journalPendant(static function () use ($config): void {
        egal(200, executer(postTest(['_gotcha' => 'robot']), serveurTest(), $config, [])['statut'], 'champ piège');
        egal(422, executer(postTest(['email' => 'x']), serveurTest(), $config, [])['statut'], 'saisie invalide');
    });
    egal('', $journal, 'purges seules : rien dans le journal');
    $journal = journalPendant(static function () use ($config): void {
        egal(500, executer(postTest(), serveurTest(), $config, [])['statut'], 'envoi valide, limiteur en panne');
    });
    egal(1, substr_count($journal, 'limiteur indisponible'), 'envoi réel : une ligne');
});

test('I2 : FAN2HARMONIE_CONFIG vers un fichier absent → une ligne générique dans le journal, puis les autres emplacements', function (): void {
    $api = dossierTemporaire() . '/www/api';
    mkdir($api, 0700, true);
    file_put_contents($api . '/config.php', "<?php\nreturn [];\n");
    $absent = dirname($api, 2) . '/introuvable/config.php';
    $trouve = null;
    $journal = journalPendant(static function () use ($api, $absent, &$trouve): void {
        $trouve = trouverConfig(['FAN2HARMONIE_CONFIG' => $absent], $api);
    });
    egal($api . '/config.php', $trouve, 'repli sur les autres emplacements');
    egal(1, substr_count($journal, 'contact.php : chemin de configuration invalide'), $journal);
    absent('introuvable', $journal, 'le chemin lui-même n’est pas journalisé');

    $journal = journalPendant(static function () use ($api): void {
        trouverConfig([], $api);
        trouverConfig(['FAN2HARMONIE_CONFIG' => $api . '/config.php'], $api);
    });
    egal('', $journal, 'variable absente ou valide : rien');
});

// ---------- Exigences ----------

test('exigences : posix est recommandée, jamais exigée', function (): void {
    $sansPosix = static fn (string $extension): bool => $extension !== 'posix';
    egal([], exigencesManquantes(80300, $sansPosix, static fn (): bool => true), 'posix absente : rien de bloquant');
    egal(['posix'], recommandationsManquantes($sansPosix));
    egal([], recommandationsManquantes(static fn (string $e): bool => true));
});
