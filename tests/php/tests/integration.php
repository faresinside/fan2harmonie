<?php

/**
 * Intégration HTTP : le vrai public/api/contact.php servi par le serveur intégré de PHP (php -S), interrogé
 * par de vraies requêtes HTTP. Racine web temporaire : copie de public/api/ (contact.php et lib/) et un
 * config.php de test (transport de test vers un dossier temporaire), pour ne jamais écrire de config.php
 * dans le projet. Le serveur reçoit MAIL_TRANSPORT=file ; config.php pose transport_test => true.
 */

declare(strict_types=1);

const PORT_TEST = 8089;

/**
 * Requête HTTP vers le serveur de test.
 * @param array<string, string> $entetes
 * @return array{statut: int, entetes: array<string, string>, corps: string}
 */
function requeteHttp(string $methode, string $chemin, array $entetes = [], string $corps = ''): array
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
    $reponse = file_get_contents('http://127.0.0.1:' . PORT_TEST . $chemin, false, $contexte);
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
function posterFormulaire(array $champs, array $entetes = []): array
{
    $corps = http_build_query($champs);
    return requeteHttp('POST', '/api/contact.php', $entetes + [
        'Content-Type' => 'application/x-www-form-urlencoded',
        'Content-Length' => (string) strlen($corps),
    ], $corps);
}

test('intégration HTTP (php -S) : configuration, méthode, origine, envoi, page HTML, limite, taille, fichiers inertes', function (): void {
    $racine = dossierTemporaire();
    $courriers = $racine . '/courriers';
    $limiteur = $racine . '/limiteur';
    mkdir($racine . '/web/api/lib', 0700, true);
    mkdir($courriers, 0700);
    mkdir($limiteur, 0700);
    copy(RACINE . '/public/api/contact.php', $racine . '/web/api/contact.php');
    copy(RACINE . '/public/api/lib/contact.php', $racine . '/web/api/lib/contact.php');
    copy(RACINE . '/public/api/config.sample.php', $racine . '/web/api/config.sample.php');

    $serveur = proc_open(
        [PHP_BINARY, '-S', '127.0.0.1:' . PORT_TEST, '-t', $racine . '/web'],
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
        $tubes,
        null,
        ['MAIL_TRANSPORT' => 'file', 'PATH' => (string) getenv('PATH')],
    );
    vrai(is_resource($serveur), 'serveur PHP démarré');
    try {
        $pret = false;
        for ($i = 0; $i < 100 && !$pret; $i++) {
            $socket = @fsockopen('127.0.0.1', PORT_TEST, $errno, $errstr, 0.1);
            if ($socket !== false) {
                fclose($socket);
                $pret = true;
            } else {
                usleep(50_000);
            }
        }
        vrai($pret, 'serveur PHP joignable');

        $valide = ['nom' => 'Héloïse Dupré', 'email' => 'heloise@example.org', 'message' => "Bonjour 🌸\r\nÀ samedi ?", 'consentement' => 'oui', '_gotcha' => ''];
        $js = ['Origin' => 'https://fan2harmonie.fr', 'Accept' => 'application/json'];

        // 1. Sans config.php : 500 JSON « Configuration manquante ».
        $r = posterFormulaire($valide, $js);
        egal(500, $r['statut'], 'sans configuration');
        egal('{"ok":false,"errors":[{"message":"Configuration manquante"}]}', $r['corps']);
        egal('application/json; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        egal('nosniff', $r['entetes']['x-content-type-options'] ?? null);
        vrai(!isset($r['entetes']['x-powered-by']), 'X-Powered-By retiré');

        file_put_contents($racine . '/web/api/config.php', "<?php\nreturn " . var_export([
            'destinataire' => 'contact@fan2harmonie.fr',
            'expediteur' => 'site@fan2harmonie.fr',
            'origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'],
            'limite_par_heure' => 2,
            'dossier_limiteur' => $limiteur,
            'secret_limiteur' => '',
            'taille_max_message' => 5000,
            'transport_test' => true,
            'dossier_transport_test' => $courriers,
        ], true) . ";\n");

        // 2. GET : 405.
        $r = requeteHttp('GET', '/api/contact.php', ['Accept' => 'application/json']);
        egal(405, $r['statut']);
        egal('POST', $r['entetes']['allow'] ?? null);
        egal(false, json_decode($r['corps'], true)['ok']);

        // 3. Origine étrangère : 403, aucun courrier.
        $r = posterFormulaire($valide, ['Origin' => 'https://evil.example', 'Accept' => 'application/json']);
        egal(403, $r['statut']);
        egal([], glob($courriers . '/*.eml'));

        // 4. Envoi valide : 200 {"ok":true}, un message brut sur disque.
        $r = posterFormulaire($valide, $js);
        egal(200, $r['statut'], 'envoi valide : ' . $r['corps']);
        egal('{"ok":true}', $r['corps']);
        egal('application/json; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        $fichiers = glob($courriers . '/*.eml') ?: [];
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

        // Le limiteur ne garde qu'une empreinte et des instants.
        $donnees = (string) file_get_contents($limiteur . '/fan2harmonie-limiteur.json');
        absent('127.0.0.1', $donnees);
        egal(1, preg_match('/^\{"[0-9a-f]{64}":\[\d+\]\}$/', $donnees), 'contenu du limiteur : ' . $donnees);

        // 5. Sans JavaScript (pas d'Accept JSON) : page HTML de succès.
        $r = posterFormulaire($valide, ['Origin' => 'https://www.fan2harmonie.fr', 'Accept' => 'text/html,application/xhtml+xml']);
        egal(200, $r['statut']);
        egal('text/html; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        contient('<html lang="fr">', $r['corps']);
        contient('Merci, votre message est bien parti.', $r['corps']);
        contient('<a href="/">Retour au site</a>', $r['corps']);
        egal(2, count(glob($courriers . '/*.eml') ?: []));

        // 6. Page HTML d'erreur de saisie (422), qui ne reprend pas la saisie.
        $r = posterFormulaire(['nom' => '<b>x</b>', 'email' => 'pas-une-adresse', 'message' => 'm', 'consentement' => 'oui'], ['Origin' => 'https://fan2harmonie.fr']);
        egal(422, $r['statut']);
        contient('<li>Adresse e-mail invalide.</li>', $r['corps']);
        absent('<b>x</b>', $r['corps']);
        absent('pas-une-adresse', $r['corps']);

        // 7. Troisième envoi accepté dans l'heure (limite 2) : 429 + Retry-After.
        $r = posterFormulaire($valide, $js);
        egal(429, $r['statut']);
        vrai(ctype_digit($r['entetes']['retry-after'] ?? '') && (int) $r['entetes']['retry-after'] > 3500, 'Retry-After en secondes');
        egal(2, count(glob($courriers . '/*.eml') ?: []), 'aucun troisième message');

        // 8. Requête de plus de 20 Ko : 413.
        $r = posterFormulaire($valide + ['remplissage' => str_repeat('x', 21000)], $js);
        egal(413, $r['statut']);

        // 9. Bibliothèque et exemple de configuration demandés directement : rien n'est affiché.
        foreach (['/api/lib/contact.php', '/api/config.sample.php', '/api/config.php'] as $chemin) {
            $r = requeteHttp('GET', $chemin);
            egal('', $r['corps'], "{$chemin} n'affiche rien");
        }
    } finally {
        proc_terminate($serveur);
        proc_close($serveur);
    }
});
