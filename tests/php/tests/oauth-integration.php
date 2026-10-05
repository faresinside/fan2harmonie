<?php

/**
 * Intégration HTTP du relais de connexion GitHub de /admin : les vrais public/oauth/auth.php et callback.php
 * servis par le serveur intégré de PHP (php -S), et un FAUX GitHub local (second php -S dans le même conteneur,
 * sans réseau) désigné par « github_url_jeton » dans la configuration de test. Racine web temporaire
 * « <tmp>/web » : copie de public/oauth/ ; configuration écrite HORS de la racine web
 * (« <tmp>/fan2harmonie-contact/oauth-config.php », emplacement recommandé en production).
 *
 * Aussi : le vrai client cURL (clientHttpCurl) contre le faux GitHub (redirection non suivie, réponse énorme
 * coupée, délai dépassé, protocoles interdits) et contre un serveur TLS au certificat auto-signé (refusé).
 */

declare(strict_types=1);

if (is_file(RACINE . '/public/oauth/lib/oauth.php')) {
    require_once RACINE . '/public/oauth/lib/oauth.php';
}

use function Fan2Harmonie\OAuth\clientHttpCurl;
use function Fan2Harmonie\OAuth\cookieEfface;

const PORT_RELAIS = 8091;
const PORT_FAUX_GITHUB = 8092;
const PORT_TLS = 8093;
const JETON_FAUX_GITHUB = 'gho_JetonDuFauxGitHub0123456789abcdefAB';
const SECRET_INTEGRATION = 'secret0integration0oauth0123456789abcdef';
const CODE_VALIDE = 'code0valide0000001';

/** Scripts du faux GitHub (point d'échange du code, et cas particuliers pour le client cURL). */
const FAUX_GITHUB = [
    'jeton.php' => <<<'PHP'
        <?php
        // Faux point d'échange du code de GitHub : note chaque requête, puis répond comme GitHub.
        $corps = (string) file_get_contents('php://input');
        file_put_contents((string) getenv('FAUX_GITHUB_JOURNAL'), json_encode([
            'methode' => $_SERVER['REQUEST_METHOD'],
            'accept' => $_SERVER['HTTP_ACCEPT'] ?? '',
            'type' => $_SERVER['CONTENT_TYPE'] ?? '',
            'corps' => $corps,
        ]) . "\n", FILE_APPEND);
        parse_str($corps, $champs);
        header('Content-Type: application/json; charset=utf-8');
        $attendu = [
            'client_id' => 'Iv1.integration0001',
            'client_secret' => getenv('FAUX_GITHUB_SECRET'),
            'code' => 'code0valide0000001',
            'redirect_uri' => 'https://fan2harmonie.fr/oauth/callback.php',
        ];
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && $champs === $attendu) {
            echo json_encode(['access_token' => getenv('FAUX_GITHUB_JETON'), 'token_type' => 'bearer', 'scope' => 'repo']);
        } else {
            echo json_encode(['error' => 'bad_verification_code', 'error_description' => 'DESCRIPTION-SECRETE-GITHUB']);
        }
        PHP,
    'redirection.php' => "<?php\nheader('Location: http://127.0.0.1:" . PORT_FAUX_GITHUB . "/jeton.php', true, 302);\n",
    'gros.php' => "<?php\necho str_repeat('x', 40000);\n",
    'lent.php' => "<?php\nsleep(4);\necho '{}';\n",
];

/** Démarre `php <arguments>` (php -S…) et attend que le port réponde. @return resource */
function demarrerPhp(array $arguments, int $port, array $env)
{
    $processus = proc_open(
        array_merge([PHP_BINARY], $arguments),
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
        $tubes,
        null,
        $env + ['PATH' => (string) getenv('PATH')],
    );
    vrai(is_resource($processus), 'processus PHP démarré');
    for ($i = 0; $i < 100; $i++) {
        $socket = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
        if ($socket !== false) {
            fclose($socket);
            return $processus;
        }
        usleep(50_000);
    }
    proc_terminate($processus);
    throw new EchecTest("serveur injoignable sur le port {$port}");
}

/**
 * Prépare « $racine/web/oauth/ » (copie de public/oauth/, sans config.php), le faux GitHub dans
 * « $racine/github/ » et la configuration hors racine web. @return array<string, string> chemins utiles
 */
function preparerRelais(string $racine): array
{
    $source = RACINE . '/public/oauth';
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS)) as $f) {
        $relatif = substr($f->getPathname(), strlen($source));
        if (basename($relatif) === 'config.php') {
            continue;
        }
        $cible = $racine . '/web/oauth' . $relatif;
        if (!is_dir(dirname($cible))) {
            mkdir(dirname($cible), 0700, true);
        }
        copy($f->getPathname(), $cible);
    }
    mkdir($racine . '/github', 0700);
    foreach (FAUX_GITHUB as $nom => $code) {
        file_put_contents($racine . '/github/' . $nom, $code);
    }
    mkdir($racine . '/fan2harmonie-contact', 0700);
    $config = $racine . '/fan2harmonie-contact/oauth-config.php';
    file_put_contents($config, "<?php\nreturn " . var_export([
        'client_id' => 'Iv1.integration0001',
        'client_secret' => SECRET_INTEGRATION,
        'origines_autorisees' => ['https://fan2harmonie.fr'],
        'scope' => 'repo',
        'url_callback' => 'https://fan2harmonie.fr/oauth/callback.php',
        'github_url_jeton' => 'http://127.0.0.1:' . PORT_FAUX_GITHUB . '/jeton.php',
    ], true) . ";\n");
    return [
        'config' => $config,
        'journal_php' => $racine . '/erreurs-php.log',
        'journal_github' => $racine . '/requetes-github.jsonl',
    ];
}

/** Requête vers le relais, avec un en-tête Cookie facultatif. */
function requeteRelais(string $methode, string $chemin, ?string $cookie = null): array
{
    return requeteHttp($methode, $chemin, $cookie === null ? [] : ['Cookie' => $cookie], '', PORT_RELAIS);
}

/** Requêtes reçues par le faux GitHub. @return list<array<string, string>> */
function requetesGitHub(string $journal): array
{
    if (!is_file($journal)) {
        return [];
    }
    return array_map(static fn (string $l): array => json_decode($l, true), array_values(array_filter(explode("\n", (string) file_get_contents($journal)))));
}

/** Nonce de l'en-tête CSP reçu, vérifié contre la balise <script> du corps. */
function nonceVerifie(array $r): string
{
    vrai(preg_match("/^default-src 'none'; script-src 'nonce-([0-9a-f]{32})'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/", $r['entetes']['content-security-policy'] ?? '', $m) === 1, 'CSP : ' . ($r['entetes']['content-security-policy'] ?? '(absente)'));
    contient('<script nonce="' . $m[1] . '">', $r['corps']);
    return $m[1];
}

test('intégration OAuth (php -S + faux GitHub) : auth.php → GitHub → callback.php, cookie aller-retour, jeton jamais journalisé', function (): void {
    $racine = dossierTemporaire();
    $chemins = preparerRelais($racine);
    $github = demarrerPhp(['-S', '127.0.0.1:' . PORT_FAUX_GITHUB, '-t', $racine . '/github'], PORT_FAUX_GITHUB, [
        'FAUX_GITHUB_JOURNAL' => $chemins['journal_github'],
        'FAUX_GITHUB_SECRET' => SECRET_INTEGRATION,
        'FAUX_GITHUB_JETON' => JETON_FAUX_GITHUB,
    ]);
    $relais = demarrerPhp(['-d', 'error_log=' . $chemins['journal_php'], '-d', 'log_errors=1', '-S', '127.0.0.1:' . PORT_RELAIS, '-t', $racine . '/web'], PORT_RELAIS, []);
    try {
        // 1. auth.php, comme l'ouvre Sveltia CMS : 302 vers GitHub, state dans un cookie.
        $r = requeteRelais('GET', '/oauth/auth.php?provider=github&site_id=fan2harmonie.fr&scope=repo%2Cuser');
        egal(302, $r['statut'], 'auth.php : ' . $r['corps']);
        $location = $r['entetes']['location'] ?? '';
        vrai(str_starts_with($location, 'https://github.com/login/oauth/authorize?'), 'redirection vers GitHub : ' . $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $params);
        egal(['client_id', 'redirect_uri', 'scope', 'state'], array_keys($params));
        egal('Iv1.integration0001', $params['client_id']);
        egal('https://fan2harmonie.fr/oauth/callback.php', $params['redirect_uri']);
        egal('repo', $params['scope'], 'portée de la configuration, pas « repo,user » de la requête');
        egal(1, preg_match('/^[0-9a-f]{64}$/', $params['state']));
        $etat = $params['state'];
        egal('fan2h_oauth_state=' . $etat . '; Max-Age=600; Path=/oauth/; Secure; HttpOnly; SameSite=Lax', $r['entetes']['set-cookie'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        egal('no-referrer', $r['entetes']['referrer-policy'] ?? null);
        vrai(!isset($r['entetes']['x-powered-by']), 'X-Powered-By retiré');

        // 2. Retour de GitHub vers callback.php, avec le cookie : échange du code, page qui transmet le jeton.
        $retour = '/oauth/callback.php?code=' . CODE_VALIDE . '&state=' . $etat;
        $r = requeteRelais('GET', $retour, 'fan2h_oauth_state=' . $etat);
        egal(200, $r['statut'], 'callback.php : ' . $r['corps']);
        egal('text/html; charset=utf-8', $r['entetes']['content-type'] ?? null);
        egal('no-store', $r['entetes']['cache-control'] ?? null);
        egal('no-referrer', $r['entetes']['referrer-policy'] ?? null);
        egal('nosniff', $r['entetes']['x-content-type-options'] ?? null);
        egal(cookieEfface(), $r['entetes']['set-cookie'] ?? null);
        nonceVerifie($r);
        preg_match('/^  var message = (.*);$/m', $r['corps'], $m);
        egal('authorization:github:success:{"token":"' . JETON_FAUX_GITHUB . '","provider":"github"}', json_decode($m[1] ?? 'null', true));
        $requetes = requetesGitHub($chemins['journal_github']);
        egal(1, count($requetes), 'une requête au faux GitHub');
        egal('POST', $requetes[0]['methode']);
        egal('application/json', $requetes[0]['accept']);
        egal('application/x-www-form-urlencoded', $requetes[0]['type']);
        parse_str($requetes[0]['corps'], $champs);
        egal(['client_id' => 'Iv1.integration0001', 'client_secret' => SECRET_INTEGRATION, 'code' => CODE_VALIDE, 'redirect_uri' => 'https://fan2harmonie.fr/oauth/callback.php'], $champs);

        // 3. Rejeu : le cookie a été effacé ; la même adresse sans cookie (ou avec un autre state) est refusée.
        $r = requeteRelais('GET', $retour);
        egal(403, $r['statut'], 'rejeu sans cookie');
        egal(cookieEfface(), $r['entetes']['set-cookie'] ?? null);
        $r = requeteRelais('GET', $retour, 'fan2h_oauth_state=' . str_repeat('0', 64));
        egal(403, $r['statut'], 'cookie d’un autre state');
        egal(1, count(requetesGitHub($chemins['journal_github'])), 'GitHub jamais appelé pour un rejeu');

        // 4. Code refusé par GitHub : 502, page générique (sans la description de GitHub).
        $r = requeteRelais('GET', '/oauth/auth.php');
        parse_str((string) parse_url($r['entetes']['location'] ?? '', PHP_URL_QUERY), $params);
        $r = requeteRelais('GET', '/oauth/callback.php?code=code0refuse&state=' . $params['state'], 'fan2h_oauth_state=' . $params['state']);
        egal(502, $r['statut']);
        nonceVerifie($r);
        absent('DESCRIPTION-SECRETE-GITHUB', $r['corps']);
        absent('bad_verification_code', $r['corps']);

        // 5. GitHub renvoie une erreur (accès refusé) : 400, rien de la description.
        $r = requeteRelais('GET', '/oauth/callback.php?error=access_denied&error_description=DESCRIPTION-SECRETE-GITHUB&state=' . $params['state'], 'fan2h_oauth_state=' . $params['state']);
        egal(400, $r['statut']);
        absent('DESCRIPTION-SECRETE-GITHUB', $r['corps']);

        // 6. Méthodes : seul GET.
        foreach (['POST', 'HEAD', 'PUT'] as $methode) {
            foreach (['/oauth/auth.php', '/oauth/callback.php'] as $chemin) {
                $r = requeteRelais($methode, $chemin);
                egal(405, $r['statut'], "{$methode} {$chemin}");
                egal('GET', $r['entetes']['allow'] ?? null);
            }
        }

        // 7. Bibliothèque et modèle demandés directement (php -S ne lit pas les .htaccess) : rien n'est affiché.
        foreach (['/oauth/lib/oauth.php', '/oauth/lib/exigences.php', '/oauth/config.sample.php'] as $chemin) {
            egal('', requeteRelais('GET', $chemin)['corps'], "{$chemin} n'affiche rien");
        }

        // 8. Configuration retirée : page 500 générique (même chose avec le modèle non adapté).
        rename($chemins['config'], $chemins['config'] . '.ailleurs');
        $r = requeteRelais('GET', '/oauth/auth.php?provider=github');
        egal(500, $r['statut']);
        nonceVerifie($r);
        vrai(!isset($r['entetes']['location']) && !isset($r['entetes']['set-cookie']), 'ni redirection ni cookie');
        contient('Connexion impossible', $r['corps']);
        copy(RACINE . '/public/oauth/config.sample.php', $chemins['config']);
        egal(500, requeteRelais('GET', '/oauth/auth.php')['statut'], 'modèle non adapté');
        egal(500, requeteRelais('GET', $retour, 'fan2h_oauth_state=' . $etat)['statut'], 'callback sans configuration valide');
    } finally {
        proc_terminate($relais);
        proc_close($relais);
        proc_terminate($github);
        proc_close($github);
    }

    // 9. Journal d'erreurs PHP du relais : lignes génériques seulement ; ni jeton, ni code, ni secret, ni GitHub.
    $journal = is_file($chemins['journal_php']) ? (string) file_get_contents($chemins['journal_php']) : '';
    contient('oauth : état absent ou différent du cookie (requête refusée).', $journal);
    contient('oauth : échange du code impossible (code refusé par GitHub).', $journal);
    contient('oauth : autorisation refusée ou annulée sur GitHub.', $journal);
    contient('oauth : configuration manquante.', $journal);
    contient('oauth : configuration invalide.', $journal);
    foreach ([JETON_FAUX_GITHUB, CODE_VALIDE, 'code0refuse', SECRET_INTEGRATION, 'DESCRIPTION-SECRETE-GITHUB', 'bad_verification_code', 'Iv1.integration0001', 'CHANGER'] as $sensible) {
        absent($sensible, $journal, 'journal PHP');
    }
    // Rien n'a été écrit sur disque par le relais (pas de fichier de jeton, de session…).
    $fichiers = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine . '/web', FilesystemIterator::SKIP_DOTS)) as $f) {
        $fichiers[] = substr($f->getPathname(), strlen($racine . '/web'));
    }
    sort($fichiers);
    egal(['/oauth/.htaccess', '/oauth/auth.php', '/oauth/callback.php', '/oauth/config.sample.php', '/oauth/lib/.htaccess', '/oauth/lib/exigences.php', '/oauth/lib/oauth.php'], $fichiers);
    foreach (glob(sys_get_temp_dir() . '/sess_*') ?: [] as $session) {
        absent(JETON_FAUX_GITHUB, (string) @file_get_contents($session), 'session PHP');
    }
});

test('client cURL : redirection non suivie, réponse énorme coupée, délai dépassé, protocoles interdits', function (): void {
    $racine = dossierTemporaire();
    preparerRelais($racine);
    $github = demarrerPhp(['-S', '127.0.0.1:' . PORT_FAUX_GITHUB, '-t', $racine . '/github'], PORT_FAUX_GITHUB, [
        'FAUX_GITHUB_JOURNAL' => $racine . '/requetes.jsonl',
        'FAUX_GITHUB_SECRET' => SECRET_INTEGRATION,
        'FAUX_GITHUB_JETON' => JETON_FAUX_GITHUB,
    ]);
    try {
        $http = clientHttpCurl();
        $base = 'http://127.0.0.1:' . PORT_FAUX_GITHUB;
        $r = $http($base . '/jeton.php', 'a=1', ['Accept: application/json']);
        egal(200, $r['statut'] ?? null);
        egal(false, $r['tronque']);
        contient('bad_verification_code', $r['corps']);

        $r = $http($base . '/redirection.php', 'a=1', []);
        egal(302, $r['statut'] ?? null, 'redirection rendue telle quelle, jamais suivie');
        egal(1, count(requetesGitHub($racine . '/requetes.jsonl')), 'jeton.php appelé une seule fois (pas par la redirection)');

        $r = $http($base . '/gros.php', '', []);
        egal(true, $r['tronque'] ?? null, 'réponse énorme coupée');
        vrai(strlen($r['corps']) <= 16384, 'au plus 16 Ko gardés');

        $debut = microtime(true);
        egal(null, clientHttpCurl(1, 1)($base . '/lent.php', '', []), 'délai dépassé');
        vrai(microtime(true) - $debut < 3, 'abandon après le délai');

        foreach (['file:///etc/passwd', 'ftp://127.0.0.1/', 'gopher://127.0.0.1:' . PORT_FAUX_GITHUB . '/', 'dict://127.0.0.1/', 'https://127.0.0.1:' . PORT_FAUX_GITHUB . '/jeton.php'] as $adresse) {
            egal(null, $http($adresse, '', []), $adresse);
        }
    } finally {
        proc_terminate($github);
        proc_close($github);
    }
});

test('client cURL : certificat TLS non reconnu (auto-signé) → refusé ; le même serveur répond si l’on désactive la vérification', function (): void {
    $dossier = dossierTemporaire();
    $cle = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    vrai($cle !== false, 'clé TLS de test créée');
    $demande = openssl_csr_new(['commonName' => '127.0.0.1'], $cle, ['digest_alg' => 'sha256']);
    $certificat = openssl_csr_sign($demande, null, $cle, 1, ['digest_alg' => 'sha256']);
    openssl_x509_export_to_file($certificat, $dossier . '/cert.pem');
    openssl_pkey_export_to_file($cle, $dossier . '/cle.pem');
    file_put_contents($dossier . '/serveur.php', <<<'PHP'
        <?php
        $contexte = stream_context_create(['ssl' => ['local_cert' => $argv[1], 'local_pk' => $argv[2]]]);
        $serveur = stream_socket_server('tls://127.0.0.1:' . $argv[3], $n, $m, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $contexte);
        for ($i = 0; $i < 20; $i++) {
            $client = @stream_socket_accept($serveur, 10);
            if ($client === false) {
                continue;
            }
            fread($client, 8192);
            fwrite($client, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
            fclose($client);
        }
        PHP);
    $serveur = demarrerPhp([$dossier . '/serveur.php', $dossier . '/cert.pem', $dossier . '/cle.pem', (string) PORT_TLS], PORT_TLS, []);
    try {
        $adresse = 'https://127.0.0.1:' . PORT_TLS . '/';
        // Témoin : sans vérification, ce serveur répond 200 « {} ».
        $temoin = curl_init($adresse);
        curl_setopt_array($temoin, [CURLOPT_RETURNTRANSFER => true, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0, CURLOPT_TIMEOUT => 5]);
        egal('{}', curl_exec($temoin), 'témoin sans vérification');
        unset($temoin);
        // Le client du relais vérifie le certificat : refus.
        egal(null, clientHttpCurl()($adresse, 'a=1', []), 'certificat auto-signé refusé');
    } finally {
        proc_terminate($serveur);
        proc_close($serveur);
    }
});
