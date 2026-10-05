<?php

/**
 * Intégration HTTP : le vrai public/api/contact.php servi par le serveur intégré de PHP (php -S), interrogé
 * par de vraies requêtes HTTP. Racine web temporaire « <tmp>/web » : copie de public/api/ (sans aucun
 * config.php) ; la configuration de test est écrite HORS de la racine web, dans « <tmp>/fan2harmonie-contact/ »
 * (emplacement recommandé en production), jamais dans le projet. Le premier serveur reçoit MAIL_TRANSPORT=file
 * (transport de test, config.php pose transport_test => true) ; le second ne la reçoit pas.
 */

declare(strict_types=1);

const PORT_TEST = 8089;
const PORT_TEST_SANS_TRANSPORT = 8090;

/**
 * Requête HTTP vers un serveur de test.
 * @param array<string, string> $entetes
 * @return array{statut: int, entetes: array<string, string>, corps: string}
 */
function requeteHttp(string $methode, string $chemin, array $entetes = [], string $corps = '', int $port = PORT_TEST): array
{
    $lignes = [];
    foreach ($entetes as $nom => $valeur) {
        $lignes[] = "{$nom}: {$valeur}";
    }
    $contexte = stream_context_create(['http' => [
        'method' => $methode,
        'header' => implode("\r\n", $lignes),
        'content' => $corps,
        'ignore_errors' => true,
        'timeout' => 10,
        'follow_location' => 0,
    ]]);
    $reponse = file_get_contents('http://127.0.0.1:' . $port . $chemin, false, $contexte);
    // PHP 8.4+ : http_get_last_response_headers() ; avant : la variable locale $http_response_header.
    $brut = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?? []) : ($http_response_header ?? []);
    preg_match('/^HTTP\/\S+ (\d{3})/', $brut[0] ?? '', $m);
    $lus = [];
    foreach (array_slice($brut, 1) as $ligne) {
        [$nom, $valeur] = array_map('trim', explode(':', $ligne, 2)) + [1 => ''];
        $lus[strtolower($nom)] = $valeur;
    }
    return ['statut' => (int) ($m[1] ?? 0), 'entetes' => $lus, 'corps' => (string) $reponse];
}

/** Envoi du formulaire comme le navigateur (application/x-www-form-urlencoded). */
function posterFormulaire(array $champs, array $entetes = [], int $port = PORT_TEST): array
{
    $corps = http_build_query($champs);
    return requeteHttp('POST', '/api/contact.php', $entetes + [
        'Content-Type' => 'application/x-www-form-urlencoded',
        'Content-Length' => (string) strlen($corps),
    ], $corps, $port);
}

/**
 * Prépare « $racine/web/api/ » (copie de public/api/, sans config.php) et ses dossiers privés.
 * @return array{courriers: string, limiteur: string, config: string}
 */
function preparerSite(string $racine): array
{
    $source = RACINE . '/public/api';
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS)) as $f) {
        $relatif = substr($f->getPathname(), strlen($source));
        if (basename($relatif) === 'config.php') {
            continue;
        }
        $cible = $racine . '/web/api' . $relatif;
        if (!is_dir(dirname($cible))) {
            mkdir(dirname($cible), 0700, true);
        }
        copy($f->getPathname(), $cible);
    }
    foreach (['courriers', 'limiteur', 'fan2harmonie-contact'] as $dossier) {
        mkdir($racine . '/' . $dossier, 0700);
    }
    return [
        'courriers' => $racine . '/courriers',
        'limiteur' => $racine . '/limiteur',
        'config' => $racine . '/fan2harmonie-contact/config.php',
    ];
}

function ecrireConfig(string $chemin, array $config): void
{
    file_put_contents($chemin, "<?php\nreturn " . var_export($config, true) . ";\n");
}

/** Démarre php -S sur `$port` avec l'environnement donné et attend qu'il réponde. @return resource */
function demarrerServeur(string $web, int $port, array $env)
{
    $serveur = proc_open(
        [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $web],
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
        $tubes,
        null,
        $env + ['PATH' => (string) getenv('PATH')],
    );
    vrai(is_resource($serveur), 'serveur PHP démarré');
    for ($i = 0; $i < 100; $i++) {
        $socket = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
        if ($socket !== false) {
            fclose($socket);
            return $serveur;
        }
        usleep(50_000);
    }
    proc_terminate($serveur);
    throw new EchecTest("serveur PHP injoignable sur le port {$port}");
}

function arreterServeur($serveur): void
{
    proc_terminate($serveur);
    proc_close($serveur);
}

/** Configuration de test complète (dossiers privés de `$site`). */
function configIntegration(array $site, array $remplacement = []): array
{
    return array_replace([
        'destinataire' => 'contact@fan2harmonie.fr',
        'expediteur' => 'site@fan2harmonie.fr',
        'origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'],
        'limite_par_heure' => 2,
        'limite_globale_par_heure' => 20,
        'entrees_max' => 2000,
        'dossier_limiteur' => $site['limiteur'],
        'secret_limiteur' => 'secret-de-test-integration-0123456789abcdef',
        'taille_max_message' => 5000,
        'transport_test' => true,
        'dossier_transport_test' => $site['courriers'],
    ], $remplacement);
}

const VALIDE = ['nom' => 'Héloïse Dupré', 'email' => 'heloise@example.org', 'message' => "Bonjour 🌸\r\nÀ samedi ?", 'consentement' => 'oui', '_gotcha' => ''];
const JS = ['Origin' => 'https://fan2harmonie.fr', 'Accept' => 'application/json'];

test('intégration HTTP (php -S) : configuration, méthode, origine, envoi, page HTML, limite, taille, fichiers inertes', function (): void {
    $racine = dossierTemporaire();
    $site = preparerSite($racine);
    $serveur = demarrerServeur($racine . '/web', PORT_TEST, ['MAIL_TRANSPORT' => 'file']);
    try {
        // 1. Aucune configuration (ni variable, ni dossier voisin, ni api/config.php) : 500 « Configuration manquante ».
        $r = posterFormulaire(VALIDE, JS);
        egal(500, $r['statut'], 'sans configuration');
        egal('{"ok":false,"errors":[{"message":"Configuration manquante"}]}', $r['corps']);
        egal('application/json; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        egal('nosniff', $r['entetes']['x-content-type-options'] ?? null);
        vrai(!isset($r['entetes']['x-powered-by']), 'X-Powered-By retiré');

        // Copie de config.sample.php non adaptée : refusée.
        copy(RACINE . '/public/api/config.sample.php', $site['config']);
        $r = posterFormulaire(VALIDE, JS);
        egal(500, $r['statut']);
        egal('{"ok":false,"errors":[{"message":"Configuration invalide"}]}', $r['corps']);

        // Configuration de test hors de la racine web (dossier voisin « fan2harmonie-contact »).
        ecrireConfig($site['config'], configIntegration($site));

        // 2. GET et HEAD : 405.
        $r = requeteHttp('GET', '/api/contact.php', ['Accept' => 'application/json']);
        egal(405, $r['statut']);
        egal('POST', $r['entetes']['allow'] ?? null);
        egal(false, json_decode($r['corps'], true)['ok']);
        $r = requeteHttp('HEAD', '/api/contact.php');
        egal(405, $r['statut']);
        egal('POST', $r['entetes']['allow'] ?? null);

        // 3. Origine étrangère : 403, aucun courrier.
        $r = posterFormulaire(VALIDE, ['Origin' => 'https://evil.example', 'Accept' => 'application/json']);
        egal(403, $r['statut']);
        egal([], glob($site['courriers'] . '/*.eml'));

        // 4. Envoi valide : 200 {"ok":true}, un message brut sur disque.
        $r = posterFormulaire(VALIDE, JS);
        egal(200, $r['statut'], 'envoi valide : ' . $r['corps']);
        egal('{"ok":true}', $r['corps']);
        egal('application/json; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        $fichiers = glob($site['courriers'] . '/*.eml') ?: [];
        egal(1, count($fichiers), 'un message écrit');
        $brut = (string) file_get_contents($fichiers[0]);
        [$entetes, $corps] = explode("\r\n\r\n", $brut, 2);
        $lignes = explode("\r\n", $entetes);
        egal('To: contact@fan2harmonie.fr', $lignes[0]);
        egal('[Site Fan 2 Harmonie] Message de Héloïse Dupré', decoderSujet(substr($lignes[1], strlen('Subject: '))));
        egal([
            'From: Site Fan 2 Harmonie <site@fan2harmonie.fr>',
            'Reply-To: heloise@example.org',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ], array_slice($lignes, 2));
        $texte = decoderCorps($corps);
        contient("Nom : Héloïse Dupré\r\n", $texte);
        contient("E-mail : heloise@example.org\r\n", $texte);
        contient("Bonjour 🌸\r\nÀ samedi ?", $texte);
        egal(1, preg_match('/Date : \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} \(heure de Paris\)/u', $texte));

        // Le limiteur ne garde que des empreintes et des instants (clé « * » : compteur global).
        $contenu = (string) file_get_contents($site['limiteur'] . '/fan2harmonie-limiteur.json');
        absent('127.0.0.1', $contenu);
        $donnees = json_decode($contenu, true);
        egal(2, count($donnees), 'contenu du limiteur : ' . $contenu);
        egal(1, count($donnees['*'] ?? []));
        egal(1, preg_match('/^[0-9a-f]{64}$/', (string) array_key_last($donnees)));
        egal('0600', substr(sprintf('%o', fileperms($site['limiteur'] . '/fan2harmonie-limiteur.json')), -4));

        // 5. Sans JavaScript (pas d'Accept JSON) : page HTML de succès.
        $r = posterFormulaire(VALIDE, ['Origin' => 'https://www.fan2harmonie.fr', 'Accept' => 'text/html,application/xhtml+xml']);
        egal(200, $r['statut']);
        egal('text/html; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        contient('<html lang="fr">', $r['corps']);
        contient('Merci, votre message est bien parti.', $r['corps']);
        contient('<a href="/">Retour au site</a>', $r['corps']);
        egal(2, count(glob($site['courriers'] . '/*.eml') ?: []));

        // 6. Page HTML d'erreur de saisie (422), qui ne reprend pas la saisie.
        $r = posterFormulaire(['nom' => '<b>x</b>', 'email' => 'pas-une-adresse', 'message' => 'm', 'consentement' => 'oui'], ['Origin' => 'https://fan2harmonie.fr']);
        egal(422, $r['statut']);
        contient('<li>Adresse e-mail invalide.</li>', $r['corps']);
        absent('<b>x</b>', $r['corps']);
        absent('pas-une-adresse', $r['corps']);

        // 7. Troisième envoi accepté dans l'heure (limite 2) : 429 + Retry-After.
        $r = posterFormulaire(VALIDE, JS);
        egal(429, $r['statut']);
        vrai(ctype_digit($r['entetes']['retry-after'] ?? '') && (int) $r['entetes']['retry-after'] > 3500, 'Retry-After en secondes');
        egal(2, count(glob($site['courriers'] . '/*.eml') ?: []), 'aucun troisième message');

        // 8. Requête de plus de 56 Ko : 413 ; fichier joint (multipart) : 413.
        $r = posterFormulaire(VALIDE + ['remplissage' => str_repeat('x', 58000)], JS);
        egal(413, $r['statut']);
        $limite = 'limite-' . bin2hex(random_bytes(4));
        $multipart = '';
        foreach (VALIDE as $nom => $valeur) {
            $multipart .= "--{$limite}\r\nContent-Disposition: form-data; name=\"{$nom}\"\r\n\r\n{$valeur}\r\n";
        }
        $multipart .= "--{$limite}\r\nContent-Disposition: form-data; name=\"piece\"; filename=\"a.txt\"\r\nContent-Type: text/plain\r\n\r\nabc\r\n--{$limite}--\r\n";
        $r = requeteHttp('POST', '/api/contact.php', JS + ['Content-Type' => "multipart/form-data; boundary={$limite}", 'Content-Length' => (string) strlen($multipart)], $multipart);
        egal(413, $r['statut'], 'fichier joint');

        // 9. Bibliothèque et exemple de configuration demandés directement : rien n'est affiché.
        foreach (['/api/lib/contact.php', '/api/lib/exigences.php', '/api/config.sample.php'] as $chemin) {
            $r = requeteHttp('GET', $chemin);
            egal('', $r['corps'], "{$chemin} n'affiche rien");
        }
    } finally {
        arreterServeur($serveur);
    }
});

test('intégration HTTP : la requête ne peut pas activer le transport de test (champ, en-tête Mail-Transport)', function (): void {
    $racine = dossierTemporaire();
    $site = preparerSite($racine);
    // Configuration de test, mais serveur SANS la variable MAIL_TRANSPORT : le vrai mail() est utilisé (et
    // échoue ici : pas de sendmail dans le conteneur), jamais le transport vers fichier.
    ecrireConfig($site['config'], configIntegration($site));
    $serveur = demarrerServeur($racine . '/web', PORT_TEST_SANS_TRANSPORT, []);
    try {
        $r = posterFormulaire(
            VALIDE + ['transport_test' => '1', 'MAIL_TRANSPORT' => 'file'],
            JS + ['Mail-Transport' => 'file'],
            PORT_TEST_SANS_TRANSPORT,
        );
        egal(500, $r['statut'], 'vrai mail() sans sendmail : échec');
        egal('{"ok":false,"errors":[{"message":"L\'envoi a échoué."}]}', $r['corps']);
        egal([], glob($site['courriers'] . '/*.eml') ?: [], 'aucun message écrit par le transport de test');
    } finally {
        arreterServeur($serveur);
    }
});
