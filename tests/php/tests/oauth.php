<?php

/**
 * Relais de connexion GitHub de /admin (public/oauth/lib/oauth.php) : tests unitaires, collaborateurs injectés
 * (faux client HTTP, hasard fixé). Le vrai cURL et les vrais points d'entrée sont testés dans
 * oauth-integration.php.
 */

declare(strict_types=1);

if (is_file(RACINE . '/public/oauth/lib/exigences.php')) {
    require_once RACINE . '/public/oauth/lib/exigences.php';
}
if (is_file(RACINE . '/public/oauth/lib/oauth.php')) {
    require_once RACINE . '/public/oauth/lib/oauth.php';
}

use function Fan2Harmonie\OAuth\candidatsConfig;
use function Fan2Harmonie\OAuth\chargerConfig;
use function Fan2Harmonie\OAuth\configDepuisServeur;
use function Fan2Harmonie\OAuth\construireUrlAutorisation;
use function Fan2Harmonie\OAuth\cookieEfface;
use function Fan2Harmonie\OAuth\cookieEtat;
use function Fan2Harmonie\OAuth\echangerCode;
use function Fan2Harmonie\OAuth\exigencesManquantes;
use function Fan2Harmonie\OAuth\exigencesManquantesIci;
use function Fan2Harmonie\OAuth\genererEtat;
use function Fan2Harmonie\OAuth\genererNonce;
use function Fan2Harmonie\OAuth\messageEchec;
use function Fan2Harmonie\OAuth\messageSucces;
use function Fan2Harmonie\OAuth\normaliserConfig;
use function Fan2Harmonie\OAuth\pageMessage;
use function Fan2Harmonie\OAuth\reponseExigencesManquantes;
use function Fan2Harmonie\OAuth\traiterAuth;
use function Fan2Harmonie\OAuth\traiterCallback;
use function Fan2Harmonie\OAuth\trouverConfig;

/** Jeton de la forme des vrais jetons GitHub (« gho_ » + 36 caractères), inventé. */
const JETON_TEST = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';
const SECRET_TEST = 'secret0de0test0oauth0123456789abcdef0123';
const CODE_TEST = 'f00dcafe0123456789ab';
const ETAT_TEST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSP_ATTENDUE = "default-src 'none'; script-src 'nonce-%s'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Configuration brute valide du relais ; `$remplacement` écrase des clés. */
function configOauthBrute(array $remplacement = []): array
{
    return array_replace(['client_id' => 'Iv1.0123456789abcdef', 'client_secret' => SECRET_TEST], $remplacement);
}

/** Configuration normalisée valide (valeurs par défaut ajoutées). */
function configOauth(array $remplacement = []): array
{
    return normaliserConfig(configOauthBrute($remplacement)) ?? throw new EchecTest('configuration de test refusée');
}

/** $_SERVER d'une requête GET vers le relais. */
function serveurOauth(array $remplacement = []): array
{
    return array_replace(['REQUEST_METHOD' => 'GET', 'QUERY_STRING' => 'provider=github&site_id=fan2harmonie.fr&scope=repo%2Cuser'], $remplacement);
}

/** Faux GitHub : renvoie `$reponse` (ou lance l'exception donnée) et garde chaque appel. */
final class FauxGitHub
{
    /** @var list<array{url: string, corps: string, entetes: list<string>}> */
    public array $appels = [];

    /** @param mixed $reponse Réponse du client HTTP ; null = délai dépassé ; par défaut, un jeton valide. */
    public function __construct(public mixed $reponse = 'jeton valide')
    {
        if ($this->reponse === 'jeton valide') {
            $this->reponse = reponseGitHub(200, json_encode(['access_token' => JETON_TEST, 'token_type' => 'bearer', 'scope' => 'repo']));
        }
    }

    public function __invoke(string $url, string $corps, array $entetes): ?array
    {
        $this->appels[] = ['url' => $url, 'corps' => $corps, 'entetes' => $entetes];
        if ($this->reponse instanceof Throwable) {
            throw $this->reponse;
        }
        return $this->reponse;
    }
}

function reponseGitHub(int $statut, string $corps, bool $tronque = false): array
{
    return ['statut' => $statut, 'corps' => $corps, 'tronque' => $tronque];
}

/** Nonce de la CSP d'une réponse (vérifie au passage la forme exacte de la CSP). */
function nonceDe(array $reponse): string
{
    $csp = $reponse['entetes']['Content-Security-Policy'] ?? '';
    vrai(preg_match("/^default-src 'none'; script-src 'nonce-([0-9a-f]{32})'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/", $csp, $m) === 1, 'CSP inattendue : ' . $csp);
    return $m[1];
}

/** Valeur (décodée) d'une variable « var nom = … ; » du script de la page. */
function valeurDuScript(string $page, string $nom): mixed
{
    vrai(preg_match('/^  var ' . $nom . ' = (.*);$/m', $page, $m) === 1, "variable {$nom} absente du script");
    return json_decode($m[1], true, 16, JSON_THROW_ON_ERROR);
}

/** Lance traiterCallback avec les valeurs de test. @return array{0: array, 1: FauxGitHub} */
function rappel(array $get = [], array $cookies = [NOM_COOKIE_TEST => ETAT_TEST], ?array $config = null, ?FauxGitHub $github = null, array $serveur = [], bool $sansConfig = false): array
{
    $github ??= new FauxGitHub();
    $get = array_replace(['code' => CODE_TEST, 'state' => ETAT_TEST], $get);
    $reponse = traiterCallback($get, serveurOauth(array_replace(['QUERY_STRING' => http_build_query($get)], $serveur)), $cookies, $sansConfig ? null : ($config ?? configOauth()), $github, genererNonce(...));
    return [$reponse, $github];
}

const NOM_COOKIE_TEST = 'fan2h_oauth_state';

/** Vérifie une page d'échec générique : statut, en-têtes, message d'échec, cookie effacé si demandé. */
function verifierEchec(array $reponse, int $statut, bool $cookieEfface, string $libelle): void
{
    egal($statut, $reponse['statut'], $libelle . ' : statut');
    egal('text/html; charset=utf-8', $reponse['entetes']['Content-Type'] ?? null, $libelle);
    egal('no-store', $reponse['entetes']['Cache-Control'] ?? null, $libelle);
    egal('no-referrer', $reponse['entetes']['Referrer-Policy'] ?? null, $libelle);
    egal('nosniff', $reponse['entetes']['X-Content-Type-Options'] ?? null, $libelle);
    nonceDe($reponse);
    vrai(!isset($reponse['entetes']['Location']), $libelle . ' : aucune redirection');
    egal(messageEchec(), valeurDuScript($reponse['contenu'], 'message'), $libelle . ' : message d’échec');
    absent(JETON_TEST, $reponse['contenu'], $libelle);
    if ($cookieEfface) {
        egal(cookieEfface(), $reponse['entetes']['Set-Cookie'] ?? null, $libelle . ' : cookie effacé');
    }
}

// ---------- Exigences ----------

test('oauth exigences : PHP ≥ 8.1, curl, json, hash ; remplies ici ; réponse 500 générique sans script', function (): void {
    $toutes = static fn (string $e): bool => true;
    egal([], exigencesManquantes(80100, $toutes));
    egal(['PHP >= 8.1', 'curl'], exigencesManquantes(80030, static fn (string $e): bool => $e !== 'curl'));
    egal(['json', 'hash'], exigencesManquantes(80300, static fn (string $e): bool => !in_array($e, ['json', 'hash'], true)));
    egal([], exigencesManquantesIci());
    $r = reponseExigencesManquantes();
    egal(500, $r['statut']);
    egal('text/html; charset=utf-8', $r['entetes']['Content-Type']);
    egal('no-store', $r['entetes']['Cache-Control']);
    egal("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", $r['entetes']['Content-Security-Policy']);
    contient('<html lang="fr">', $r['contenu']);
    absent('<script', $r['contenu']);
    foreach (['curl', 'PHP', '8.1'] as $detail) {
        absent($detail, $r['contenu'], 'aucun détail des manques');
    }
});

// ---------- Hasard ----------

test('oauth : state = 32 octets aléatoires en hexadécimal (64 caractères), nonce = 16 octets, jamais deux fois le même', function (): void {
    $etats = [];
    $nonces = [];
    for ($i = 0; $i < 50; $i++) {
        $etats[] = genererEtat();
        $nonces[] = genererNonce();
    }
    foreach ($etats as $etat) {
        egal(1, preg_match('/^[0-9a-f]{64}$/D', $etat), 'state : ' . $etat);
    }
    foreach ($nonces as $nonce) {
        egal(1, preg_match('/^[0-9a-f]{32}$/D', $nonce), 'nonce : ' . $nonce);
    }
    egal(50, count(array_unique($etats)));
    egal(50, count(array_unique($nonces)));
    $source = (string) file_get_contents(RACINE . '/public/oauth/lib/oauth.php');
    contient('bin2hex(random_bytes(32))', $source);
    foreach (['mt_rand', 'uniqid', 'rand(', 'lcg_value'] as $faible) {
        absent($faible, $source, 'hasard faible');
    }
});

// ---------- Configuration ----------

test('oauth config : valeurs par défaut (origine du site, repo, callback, adresses de GitHub)', function (): void {
    $c = configOauth();
    egal(['https://fan2harmonie.fr'], $c['origines_autorisees']);
    egal('repo', $c['scope']);
    egal('https://fan2harmonie.fr/oauth/callback.php', $c['url_callback']);
    egal('https://github.com/login/oauth/authorize', $c['github_url_autorisation']);
    egal('https://github.com/login/oauth/access_token', $c['github_url_jeton']);
    egal('public_repo', configOauth(['scope' => 'public_repo'])['scope']);
    egal(['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr:8443'], configOauth(['origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr:8443']])['origines_autorisees']);
    // Faux GitHub local : http seulement vers la boucle locale, et seulement pour l'adresse du jeton.
    egal('http://127.0.0.1:8092/jeton.php', configOauth(['github_url_jeton' => 'http://127.0.0.1:8092/jeton.php'])['github_url_jeton']);
});

test('oauth config : modèle config.sample.php REFUSÉ tel quel (secret et identifiant « CHANGER-MOI »)', function (): void {
    $modele = chargerConfig(RACINE . '/public/oauth/config.sample.php');
    vrai(is_array($modele), 'le modèle renvoie un tableau');
    egal(null, normaliserConfig($modele));
    contient('CHANGER-MOI', (string) file_get_contents(RACINE . '/public/oauth/config.sample.php'));
    // Le modèle adapté avec de vraies valeurs devient valide (les autres clés du modèle sont correctes).
    vrai(normaliserConfig(array_replace($modele, configOauthBrute())) !== null, 'modèle complété accepté');
});

test('oauth config : valeurs refusées (secret provisoire ou mal formé, origines, portée, adresses)', function (): void {
    $refusees = [
        'secret absent' => ['client_secret' => null],
        'secret provisoire' => ['client_secret' => 'CHANGER-MOI'],
        'secret provisoire long' => ['client_secret' => 'changer-moi-0123456789abcdef0123456789'],
        'secret trop court' => ['client_secret' => '0123456789abcdef'],
        'secret avec espace' => ['client_secret' => '0123456789abcdef 0123456789abcdef'],
        'secret tableau' => ['client_secret' => ['x']],
        'identifiant absent' => ['client_id' => ''],
        'identifiant provisoire' => ['client_id' => 'CHANGER-MOI'],
        'identifiant avec retour à la ligne' => ['client_id' => "Iv1.abc\nX"],
        'origine http' => ['origines_autorisees' => ['http://fan2harmonie.fr']],
        'origine avec barre finale' => ['origines_autorisees' => ['https://fan2harmonie.fr/']],
        'origine en majuscules' => ['origines_autorisees' => ['https://Fan2Harmonie.fr']],
        'origine étoile' => ['origines_autorisees' => ['*']],
        'origine null' => ['origines_autorisees' => ['null']],
        'origines vides' => ['origines_autorisees' => []],
        'origines non liste' => ['origines_autorisees' => ['a' => 'https://fan2harmonie.fr']],
        'origine chaîne' => ['origines_autorisees' => 'https://fan2harmonie.fr'],
        'origine avec identifiants' => ['origines_autorisees' => ['https://u@fan2harmonie.fr']],
        'portée repo,user' => ['scope' => 'repo,user'],
        'portée admin' => ['scope' => 'admin:org'],
        'portée vide' => ['scope' => ''],
        'callback http' => ['url_callback' => 'http://fan2harmonie.fr/oauth/callback.php'],
        'callback avec requête' => ['url_callback' => 'https://fan2harmonie.fr/oauth/callback.php?x=1'],
        'callback relative' => ['url_callback' => '/oauth/callback.php'],
        'autorisation http' => ['github_url_autorisation' => 'http://github.com/login/oauth/authorize'],
        'autorisation boucle http' => ['github_url_autorisation' => 'http://127.0.0.1/authorize'],
        'autorisation avec requête' => ['github_url_autorisation' => 'https://github.com/login/oauth/authorize?x=1'],
        'jeton http distant' => ['github_url_jeton' => 'http://github.com/login/oauth/access_token'],
        'jeton http autre machine' => ['github_url_jeton' => 'http://10.0.0.1/jeton'],
        'jeton file' => ['github_url_jeton' => 'file:///etc/passwd'],
        'jeton avec identifiants' => ['github_url_jeton' => 'https://u:p@github.com/login/oauth/access_token'],
        'jeton gopher' => ['github_url_jeton' => 'gopher://127.0.0.1/x'],
    ];
    foreach ($refusees as $cas => $remplacement) {
        egal(null, normaliserConfig(configOauthBrute($remplacement)), $cas);
    }
    egal(null, normaliserConfig(['client_secret' => SECRET_TEST]), 'client_id absent');
});

test('oauth config : emplacements dans l’ordre (FAN2HARMONIE_OAUTH_CONFIG, dossier hors racine web, oauth/config.php)', function (): void {
    $dossier = '/home/compte/www/oauth';
    egal([
        '/home/compte/fan2harmonie-contact/oauth-config.php',
        '/home/compte/www/oauth/config.php',
    ], candidatsConfig([], $dossier));
    egal([
        '/srv/prive/oauth.php',
        '/home/compte/fan2harmonie-contact/oauth-config.php',
        '/home/compte/www/oauth/config.php',
    ], candidatsConfig(['FAN2HARMONIE_OAUTH_CONFIG' => '/srv/prive/oauth.php', 'FAN2HARMONIE_CONFIG' => '/x'], $dossier));
    egal(candidatsConfig([], $dossier), candidatsConfig(['FAN2HARMONIE_OAUTH_CONFIG' => ''], $dossier), 'variable vide ignorée');

    $tous = static fn (string $c): bool => true;
    $env = ['FAN2HARMONIE_OAUTH_CONFIG' => '/srv/prive/oauth.php'];
    egal('/srv/prive/oauth.php', trouverConfig($env, $dossier, $tous));
    egal('/home/compte/fan2harmonie-contact/oauth-config.php', trouverConfig([], $dossier, $tous));
    egal('/home/compte/www/oauth/config.php', trouverConfig([], $dossier, static fn (string $c): bool => str_ends_with($c, '/oauth/config.php')));
    egal(null, trouverConfig([], $dossier, static fn (string $c): bool => false));

    // Variable posée mais fichier absent : une ligne générique (sans le chemin), puis la suite de la liste.
    $journal = journalPendant(function () use ($env, $dossier): void {
        egal('/home/compte/fan2harmonie-contact/oauth-config.php', trouverConfig($env, $dossier, static fn (string $c): bool => $c !== '/srv/prive/oauth.php'));
    });
    contient('oauth : chemin de configuration invalide (FAN2HARMONIE_OAUTH_CONFIG).', $journal);
    absent('/srv/prive', $journal);
});

test('oauth config : configDepuisServeur lit le vrai fichier ; manquante ou invalide → null et une ligne générique', function (): void {
    $racine = dossierTemporaire();
    mkdir($racine . '/www/oauth', 0700, true);
    mkdir($racine . '/fan2harmonie-contact', 0700);
    $dossier = $racine . '/www/oauth';
    $journal = journalPendant(function () use ($dossier): void {
        egal(null, configDepuisServeur([], $dossier));
    });
    contient('oauth : configuration manquante.', $journal);

    file_put_contents($racine . '/fan2harmonie-contact/oauth-config.php', (string) file_get_contents(RACINE . '/public/oauth/config.sample.php'));
    $journal = journalPendant(function () use ($dossier): void {
        egal(null, configDepuisServeur([], $dossier));
    });
    contient('oauth : configuration invalide.', $journal);
    absent('CHANGER', $journal);

    file_put_contents($racine . '/fan2harmonie-contact/oauth-config.php', "<?php\nreturn " . var_export(configOauthBrute(), true) . ";\n");
    file_put_contents($dossier . '/config.php', "<?php\nreturn ['PIEGE'];\n");
    $journal = journalPendant(function () use ($dossier): void {
        egal(configOauth(), configDepuisServeur([], $dossier), 'dossier hors racine web prioritaire sur oauth/config.php');
    });
    egal('', $journal);
    absent(SECRET_TEST, $journal);

    // FAN2HARMONIE_OAUTH_CONFIG cherchée en premier.
    $autre = $racine . '/autre.php';
    file_put_contents($autre, "<?php\nreturn " . var_export(configOauthBrute(['scope' => 'public_repo']), true) . ";\n");
    egal('public_repo', configDepuisServeur(['FAN2HARMONIE_OAUTH_CONFIG' => $autre], $dossier)['scope'] ?? null);
});

// ---------- Adresse d'autorisation ----------

test('oauth : adresse d’autorisation = configuration + state, RFC 3986, quatre paramètres exactement', function (): void {
    $url = construireUrlAutorisation(configOauth(), ETAT_TEST);
    egal('https://github.com/login/oauth/authorize?client_id=Iv1.0123456789abcdef&redirect_uri=https%3A%2F%2Ffan2harmonie.fr%2Foauth%2Fcallback.php&scope=repo&state=' . ETAT_TEST, $url);
    $c = configOauth(['url_callback' => 'https://fan2harmonie.fr/oauth/callback.php', 'scope' => 'public_repo']);
    parse_str((string) parse_url(construireUrlAutorisation($c, ETAT_TEST), PHP_URL_QUERY), $params);
    egal(['client_id' => 'Iv1.0123456789abcdef', 'redirect_uri' => 'https://fan2harmonie.fr/oauth/callback.php', 'scope' => 'public_repo', 'state' => ETAT_TEST], $params);
});

// ---------- auth.php ----------

test('oauth auth.php : 302 vers GitHub, rien de la requête dans l’adresse, cookie du state avec tous ses attributs', function (): void {
    $hostile = [
        'provider' => 'github',
        'site_id' => 'evil.example',
        'scope' => 'admin:org,delete_repo',
        'redirect_uri' => 'https://evil.example/vol',
        'client_id' => 'autre',
        'state' => 'impose',
        'response_type' => 'token',
    ];
    $r = traiterAuth($hostile, serveurOauth(['QUERY_STRING' => http_build_query($hostile)]), configOauth(), static fn (): string => ETAT_TEST, genererNonce(...));
    egal(302, $r['statut']);
    egal(construireUrlAutorisation(configOauth(), ETAT_TEST), $r['entetes']['Location'] ?? null);
    foreach (['evil', 'admin', 'delete_repo', 'autre', 'impose', 'token'] as $valeur) {
        absent($valeur, $r['entetes']['Location'], 'valeur de la requête reprise');
    }
    egal('fan2h_oauth_state=' . ETAT_TEST . '; Max-Age=600; Path=/oauth/; Secure; HttpOnly; SameSite=Lax', $r['entetes']['Set-Cookie'] ?? null);
    egal(cookieEtat(ETAT_TEST), $r['entetes']['Set-Cookie']);
    egal('no-store', $r['entetes']['Cache-Control'] ?? null);
    egal('no-referrer', $r['entetes']['Referrer-Policy'] ?? null);
    egal('nosniff', $r['entetes']['X-Content-Type-Options'] ?? null);
    egal('', $r['contenu']);

    // Sans « provider » : accepté ; chaque appel tire un nouveau state.
    $a = traiterAuth([], serveurOauth(['QUERY_STRING' => '']), configOauth(), genererEtat(...), genererNonce(...));
    $b = traiterAuth([], serveurOauth(['QUERY_STRING' => '']), configOauth(), genererEtat(...), genererNonce(...));
    egal(302, $a['statut']);
    vrai($a['entetes']['Set-Cookie'] !== $b['entetes']['Set-Cookie'], 'nouveau state à chaque demande');
    parse_str((string) parse_url($a['entetes']['Location'], PHP_URL_QUERY), $params);
    egal('fan2h_oauth_state=' . $params['state'] . '; Max-Age=600; Path=/oauth/; Secure; HttpOnly; SameSite=Lax', $a['entetes']['Set-Cookie'], 'cookie = state de l’adresse');
});

test('oauth auth.php : provider autre que « github » (ou tableau) → 400 ; sans configuration → 500 ; state mal formé → 500', function (): void {
    foreach (['gitlab', 'GitHub', '', 'github ', ['github']] as $fournisseur) {
        $r = traiterAuth(['provider' => $fournisseur], serveurOauth(), configOauth(), genererEtat(...), genererNonce(...));
        verifierEchec($r, 400, false, 'provider ' . json_encode($fournisseur));
        vrai(!isset($r['entetes']['Set-Cookie']), 'aucun cookie posé');
    }
    $r = traiterAuth(['provider' => 'github'], serveurOauth(), null, genererEtat(...), genererNonce(...));
    verifierEchec($r, 500, false, 'sans configuration');
    egal(['https://fan2harmonie.fr'], valeurDuScript($r['contenu'], 'origines'), 'origine par défaut');
    $r = traiterAuth([], serveurOauth(), configOauth(), static fn (): string => 'x', genererNonce(...));
    verifierEchec($r, 500, false, 'state mal formé');
});

test('oauth auth.php et callback.php : HEAD, POST, PUT → 405 (Allow: GET) ; requête trop longue → 414 ; corps → 413', function (): void {
    foreach (['HEAD', 'POST', 'PUT', 'OPTIONS', 'get'] as $methode) {
        $r = traiterAuth(['provider' => 'github'], serveurOauth(['REQUEST_METHOD' => $methode]), configOauth(), genererEtat(...), genererNonce(...));
        verifierEchec($r, 405, false, "auth {$methode}");
        egal('GET', $r['entetes']['Allow'] ?? null);
        vrai(!isset($r['entetes']['Set-Cookie']), 'aucun cookie posé');
        [$r, $github] = rappel([], [NOM_COOKIE_TEST => ETAT_TEST], null, null, ['REQUEST_METHOD' => $methode]);
        verifierEchec($r, 405, true, "callback {$methode}");
        egal('GET', $r['entetes']['Allow'] ?? null);
        egal([], $github->appels, 'GitHub jamais appelé');
    }
    $r = traiterAuth([], serveurOauth(['QUERY_STRING' => str_repeat('a', 2049)]), configOauth(), genererEtat(...), genererNonce(...));
    verifierEchec($r, 414, false, 'requête trop longue');
    $r = traiterAuth([], serveurOauth(['QUERY_STRING' => str_repeat('a', 2048)]), configOauth(), genererEtat(...), genererNonce(...));
    egal(302, $r['statut'], '2 048 octets acceptés');
    $r = traiterAuth([], serveurOauth(['CONTENT_LENGTH' => '10']), configOauth(), genererEtat(...), genererNonce(...));
    verifierEchec($r, 413, false, 'corps annoncé');
    [$r] = rappel([], [NOM_COOKIE_TEST => ETAT_TEST], null, null, ['QUERY_STRING' => str_repeat('a', 4000)]);
    verifierEchec($r, 414, true, 'callback : requête trop longue');
});

// ---------- callback.php ----------

test('oauth callback.php : réussite → page qui transmet le jeton, cookie effacé, échange conforme', function (): void {
    [$r, $github] = rappel();
    egal(200, $r['statut']);
    egal('text/html; charset=utf-8', $r['entetes']['Content-Type'] ?? null);
    egal('no-store', $r['entetes']['Cache-Control'] ?? null);
    egal('no-referrer', $r['entetes']['Referrer-Policy'] ?? null);
    egal('nosniff', $r['entetes']['X-Content-Type-Options'] ?? null);
    egal(cookieEfface(), $r['entetes']['Set-Cookie'] ?? null);
    egal('fan2h_oauth_state=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/oauth/; Secure; HttpOnly; SameSite=Lax', cookieEfface());
    $message = valeurDuScript($r['contenu'], 'message');
    egal('authorization:github:success:{"token":"' . JETON_TEST . '","provider":"github"}', $message);
    egal(messageSucces(JETON_TEST), $message);
    egal(['https://fan2harmonie.fr'], valeurDuScript($r['contenu'], 'origines'));
    egal('authorizing:github', valeurDuScript($r['contenu'], 'attendu'));
    // Échange : POST vers l'adresse du jeton, les quatre champs, Accept JSON.
    egal(1, count($github->appels));
    egal('https://github.com/login/oauth/access_token', $github->appels[0]['url']);
    parse_str($github->appels[0]['corps'], $champs);
    egal(['client_id' => 'Iv1.0123456789abcdef', 'client_secret' => SECRET_TEST, 'code' => CODE_TEST, 'redirect_uri' => 'https://fan2harmonie.fr/oauth/callback.php'], $champs);
    contient('Accept: application/json', implode("\n", $github->appels[0]['entetes']));
    contient('Content-Type: application/x-www-form-urlencoded', implode("\n", $github->appels[0]['entetes']));
    // Le jeton n'est que dans le script : ni en-tête, ni cookie.
    foreach ($r['entetes'] as $nom => $valeur) {
        absent(JETON_TEST, $valeur, "en-tête {$nom}");
    }
});

test('oauth callback.php : state absent, différent, rejoué après effacement du cookie → 403, GitHub jamais appelé', function (): void {
    $autre = str_repeat('b', 64);
    $cas = [
        'cookie absent' => [[], []],
        'cookie différent' => [[], [NOM_COOKIE_TEST => $autre]],
        'cookie vide' => [[], [NOM_COOKIE_TEST => '']],
        'cookie tableau' => [[], [NOM_COOKIE_TEST => [ETAT_TEST]]],
        'cookie mal formé' => [[], [NOM_COOKIE_TEST => strtoupper(ETAT_TEST)]],
        'cookie préfixe du state' => [[], [NOM_COOKIE_TEST => substr(ETAT_TEST, 0, 63)]],
    ];
    foreach ($cas as $libelle => [$get, $cookies]) {
        $journal = journalPendant(function () use ($get, $cookies, $libelle): void {
            [$r, $github] = rappel($get, $cookies);
            verifierEchec($r, 403, true, $libelle);
            egal([], $github->appels, $libelle . ' : GitHub jamais appelé');
        });
        contient('oauth : état absent ou différent du cookie (requête refusée).', $journal);
        absent(ETAT_TEST, $journal);
        absent(CODE_TEST, $journal);
    }
    // Rejeu : la première réponse efface le cookie ; le navigateur renvoie alors la même adresse sans cookie.
    [$premiere] = rappel();
    egal(200, $premiere['statut']);
    egal(cookieEfface(), $premiere['entetes']['Set-Cookie']);
    journalPendant(function (): void {
        [$rejeu, $github] = rappel([], []);
        verifierEchec($rejeu, 403, true, 'rejeu');
        egal([], $github->appels);
    });
});

test('oauth callback.php : code ou state absents, tableaux ou mal formés → 400, GitHub jamais appelé', function (): void {
    $cas = [
        'code absent' => ['state' => ETAT_TEST],
        'state absent' => ['code' => CODE_TEST],
        'rien' => [],
        'code tableau' => ['code' => [CODE_TEST], 'state' => ETAT_TEST],
        'state tableau' => ['code' => CODE_TEST, 'state' => [ETAT_TEST]],
        'code vide' => ['code' => '', 'state' => ETAT_TEST],
        'code avec espace' => ['code' => 'ab cd', 'state' => ETAT_TEST],
        'code trop long' => ['code' => str_repeat('a', 257), 'state' => ETAT_TEST],
        'state court' => ['code' => CODE_TEST, 'state' => 'abc'],
        'state majuscules' => ['code' => CODE_TEST, 'state' => strtoupper(ETAT_TEST)],
        'state avec retour à la ligne' => ['code' => CODE_TEST, 'state' => ETAT_TEST . "\n"],
    ];
    foreach ($cas as $libelle => $get) {
        $github = new FauxGitHub();
        $r = traiterCallback($get, serveurOauth(), [NOM_COOKIE_TEST => ETAT_TEST], configOauth(), $github, genererNonce(...));
        verifierEchec($r, 400, true, $libelle);
        egal([], $github->appels, $libelle . ' : GitHub jamais appelé');
    }
});

test('oauth callback.php : « error » renvoyé par GitHub → échec générique, description jamais reprise ni journalisée', function (): void {
    $description = '<script>alert("x")</script> détail interne';
    $journal = journalPendant(function () use ($description): void {
        [$r, $github] = rappel(['error' => 'access_denied', 'error_description' => $description, 'error_uri' => 'https://evil.example/']);
        verifierEchec($r, 400, true, 'erreur GitHub');
        egal([], $github->appels);
        foreach (['alert', 'détail interne', 'access_denied', 'evil.example'] as $fragment) {
            absent($fragment, $r['contenu']);
        }
    });
    contient('oauth : autorisation refusée ou annulée sur GitHub.', $journal);
    absent('alert', $journal);
    absent('access_denied', $journal);
});

test('oauth callback.php : sans configuration → 500, cookie effacé, GitHub jamais appelé', function (): void {
    [$r, $github] = rappel([], [NOM_COOKIE_TEST => ETAT_TEST], null, null, [], true);
    verifierEchec($r, 500, true, 'sans configuration');
    egal([], $github->appels);
});

// ---------- Échange du code ----------

test('oauth échange : réponses de GitHub refusées (erreur JSON, non-JSON, 401, délai, exception, jeton absent ou étrange, énorme)', function (): void {
    $jsonJeton = static fn (array $donnees): string => json_encode($donnees, JSON_UNESCAPED_SLASHES);
    $cas = [
        'erreur JSON' => [reponseGitHub(200, $jsonJeton(['error' => 'bad_verification_code', 'error_description' => 'DESCRIPTION-GITHUB'])), 'code refusé par GitHub'],
        'non-JSON' => [reponseGitHub(200, '<html>DESCRIPTION-GITHUB</html>'), 'réponse illisible'],
        'JSON liste' => [reponseGitHub(200, '["' . JETON_TEST . '"]'), 'réponse illisible'],
        'JSON trop profond' => [reponseGitHub(200, '{"a":{"b":{"c":{"d":{"e":1}}}}}'), 'réponse illisible'],
        'statut 401' => [reponseGitHub(401, $jsonJeton(['access_token' => JETON_TEST, 'token_type' => 'bearer'])), 'statut HTTP 401'],
        'statut 302' => [reponseGitHub(302, ''), 'statut HTTP 302'],
        'délai dépassé' => [null, 'GitHub injoignable'],
        'exception du client' => [new RuntimeException('DESCRIPTION-GITHUB ' . SECRET_TEST), 'GitHub injoignable'],
        'jeton absent' => [reponseGitHub(200, $jsonJeton(['token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton nombre' => [reponseGitHub(200, $jsonJeton(['access_token' => 12345678901234567890, 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton court' => [reponseGitHub(200, $jsonJeton(['access_token' => 'gho_abc', 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton avec balise' => [reponseGitHub(200, $jsonJeton(['access_token' => 'gho_</script><script>alert(1)</script>', 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton avec guillemets' => [reponseGitHub(200, $jsonJeton(['access_token' => 'gho_aaaaaaaaaaaaaaaaaa"\'', 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton avec U+2028' => [reponseGitHub(200, $jsonJeton(['access_token' => "gho_aaaaaaaaaaaaaaaaaaaa\u{2028}", 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton avec retour à la ligne' => [reponseGitHub(200, $jsonJeton(['access_token' => JETON_TEST . "\n", 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'jeton trop long' => [reponseGitHub(200, $jsonJeton(['access_token' => str_repeat('a', 256), 'token_type' => 'bearer'])), 'jeton absent ou invalide'],
        'type absent' => [reponseGitHub(200, $jsonJeton(['access_token' => JETON_TEST])), 'type de jeton inattendu'],
        'type mac' => [reponseGitHub(200, $jsonJeton(['access_token' => JETON_TEST, 'token_type' => 'mac'])), 'type de jeton inattendu'],
        'réponse énorme' => [reponseGitHub(200, str_repeat(' ', 16385) . $jsonJeton(['access_token' => JETON_TEST, 'token_type' => 'bearer'])), 'réponse trop volumineuse'],
        'réponse coupée par le client' => [reponseGitHub(200, '{"access_token":"' . JETON_TEST, true), 'réponse trop volumineuse'],
        'réponse mal formée' => [['statut' => '200', 'corps' => '{}'], 'GitHub injoignable'],
    ];
    foreach ($cas as $libelle => [$reponse, $raison]) {
        $resultat = echangerCode(configOauth(), CODE_TEST, new FauxGitHub($reponse));
        egal(['ok' => false, 'raison' => $raison], $resultat, $libelle);

        // Même cas à travers callback.php : 502, journal générique, rien de sensible nulle part.
        $journal = journalPendant(function () use ($reponse, $libelle, &$page): void {
            [$r] = rappel([], [NOM_COOKIE_TEST => ETAT_TEST], null, new FauxGitHub($reponse));
            verifierEchec($r, 502, true, $libelle);
            $page = $r['contenu'];
        });
        contient('oauth : échange du code impossible (' . $raison . ').', $journal, $libelle);
        foreach ([JETON_TEST, CODE_TEST, SECRET_TEST, 'DESCRIPTION-GITHUB', 'alert'] as $sensible) {
            absent($sensible, $journal, "{$libelle} : journal");
            absent($sensible, $page, "{$libelle} : page");
        }
    }
});

test('oauth échange : jeton accepté (forme GitHub, type « bearer » quelle que soit la casse)', function (): void {
    egal(['ok' => true, 'jeton' => JETON_TEST], echangerCode(configOauth(), CODE_TEST, new FauxGitHub()));
    $corps = json_encode(['access_token' => JETON_TEST, 'token_type' => 'Bearer', 'scope' => 'repo']);
    egal(['ok' => true, 'jeton' => JETON_TEST], echangerCode(configOauth(), CODE_TEST, new FauxGitHub(reponseGitHub(200, $corps))));
    $journal = journalPendant(function (): void {
        rappel();
    });
    egal('', $journal, 'aucune ligne de journal en cas de réussite');
});

// ---------- Page de résultat ----------

test('oauth page : HTML autonome en français, UN script, nonce identique dans la CSP et la balise, différent à chaque réponse', function (): void {
    [$a] = rappel();
    [$b] = rappel();
    $nonceA = nonceDe($a);
    $nonceB = nonceDe($b);
    vrai($nonceA !== $nonceB, 'un nonce par réponse');
    egal(sprintf(CSP_ATTENDUE, $nonceA), $a['entetes']['Content-Security-Policy']);
    foreach ([$a, $b] as $r) {
        $page = $r['contenu'];
        egal(1, substr_count($page, '<script'), 'un seul script');
        egal(1, substr_count($page, '</script>'), 'une seule fin de script');
        contient('<script nonce="' . nonceDe($r) . '">', $page);
        contient('<html lang="fr">', $page);
        contient('<meta charset="utf-8">', $page);
        contient('<meta name="robots" content="noindex">', $page);
        absent('<link', $page);
        absent('<img', $page);
        absent('<form', $page);
        absent('style=', $page);
        egal(0, preg_match('/\son[a-z]+=/i', $page), 'aucun gestionnaire en attribut');
    }
});

test('oauth page : postMessage vers les origines EXACTES de la configuration, jamais « * », après vérification de la source', function (): void {
    $origines = ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'];
    [$r] = rappel([], [NOM_COOKIE_TEST => ETAT_TEST], configOauth(['origines_autorisees' => $origines]));
    $page = $r['contenu'];
    egal($origines, valeurDuScript($page, 'origines'));
    absent('"*"', $page);
    absent("'*'", $page);
    absent('targetOrigin', $page);
    // Les seuls appels à postMessage : vers une origine de la liste.
    preg_match_all('/postMessage\(([^)]*)\)/', $page, $appels);
    egal(['message, origines[rang]', 'attendu, origines[i]'], $appels[1]);
    contient('var parent = window.opener;', $page);
    contient('if (evenement.source !== parent || rang === -1 || evenement.data !== attendu) {', $page);
    contient('var rang = origines.indexOf(evenement.origin);', $page);
    contient('window.close();', $page);
    // L'échec suit le même chemin.
    [$e] = rappel([], []);
    preg_match_all('/postMessage\(([^)]*)\)/', $e['contenu'], $appelsEchec);
    egal($appels[1], $appelsEchec[1]);
    $echec = valeurDuScript($e['contenu'], 'message');
    vrai(str_starts_with($echec, 'authorization:github:error:'), 'préfixe du message d’échec');
    egal(['provider' => 'github', 'error' => 'La connexion avec GitHub n’a pas abouti. Réessayez dans quelques instants.'], json_decode(substr($echec, strlen('authorization:github:error:')), true));
});

test('oauth page : valeurs hostiles insérées sans pouvoir sortir de la chaîne ni du script (défense en profondeur)', function (): void {
    $hostiles = [
        'gho_</script><script>alert(1)</script>',
        "gho_'\";alert(1);//",
        "gho_\u{2028}alert(1)\u{2029}",
        'gho_<!--<script>',
        'gho_\\u0022\\',
        "gho_&lt;&#x27;\0",
        'gho_]]><img src=x onerror=alert(1)>',
    ];
    foreach ($hostiles as $jeton) {
        $nonce = genererNonce();
        $page = pageMessage('Titre <b>', 'Texte & « fin »', messageSucces($jeton), ['https://fan2harmonie.fr'], $nonce);
        egal(1, substr_count($page, '<script'), 'une seule ouverture de script : ' . json_encode($jeton));
        egal(1, substr_count(strtolower($page), '</script'), 'une seule fermeture de script : ' . json_encode($jeton));
        absent('<!--', $page);
        absent("\u{2028}", $page);
        absent("\u{2029}", $page);
        absent("\0", $page);
        absent('<img', $page);
        absent('Titre <b>', $page);
        contient('Titre &lt;b&gt;', $page);
        // La ligne du message ne contient ni guillemet simple brut, ni « < », « > », « & » bruts.
        preg_match('/^  var message = (.*);$/m', $page, $m);
        egal(0, preg_match('/[<>&\']|"(?!$)/', substr($m[1], 1)), 'caractère brut dans la chaîne : ' . $m[1]);
        // Et elle redonne exactement le message (JSON ⊂ JavaScript : même valeur pour le navigateur).
        egal(messageSucces($jeton), valeurDuScript($page, 'message'), json_encode($jeton));
        $interieur = json_decode(substr(valeurDuScript($page, 'message'), strlen('authorization:github:success:')), true);
        egal(['token' => $jeton, 'provider' => 'github'], $interieur);
    }
});

test('oauth page : page d’échec sans aucun détail ; titres et textes fixes', function (): void {
    [$r] = rappel(['error' => 'redirect_uri_mismatch', 'error_description' => 'The redirect_uri MUST match']);
    contient('Connexion impossible', $r['contenu']);
    contient('La connexion avec GitHub n’a pas abouti.', $r['contenu']);
    foreach (['redirect_uri', 'MUST', 'mismatch'] as $fragment) {
        absent($fragment, $r['contenu']);
    }
    [$s] = rappel();
    contient('<h1>Connexion réussie</h1>', $s['contenu']);
});

// ---------- Page de test e2e (tests/e2e/admin.spec.ts) ----------

/** Page de réussite figée pour le test e2e avec le vrai Sveltia CMS (origine du serveur de test, nonce fixe). */
function pageE2e(): string
{
    return pageMessage(
        'Connexion réussie',
        'La connexion a réussi. Cette fenêtre va se fermer ; si elle reste ouverte, vous pouvez la fermer.',
        messageSucces('gho_JetonFactice0000000000000000000E2E'),
        ['http://localhost:4321'],
        '0123456789abcdef0123456789abcdef',
    );
}

test('oauth : page figée du test e2e (tests/fixtures/oauth/page-succes.html) = page produite par la bibliothèque', function (): void {
    $chemin = RACINE . '/tests/fixtures/oauth/page-succes.html';
    if (getenv('REGENERER_FIXTURES') === '1') {
        if (!is_dir(dirname($chemin))) {
            mkdir(dirname($chemin), 0755, true);
        }
        file_put_contents($chemin, pageE2e());
    }
    vrai(is_file($chemin), 'page figée absente (REGENERER_FIXTURES=1 pour la créer)');
    egal(pageE2e(), (string) file_get_contents($chemin), 'page figée à régénérer (REGENERER_FIXTURES=1)');
});
