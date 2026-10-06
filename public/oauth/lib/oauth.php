<?php

/**
 * Relais de connexion GitHub de l'administration (/admin, Sveltia CMS) : bibliothèque de fonctions pures,
 * collaborateurs injectés (hasard, client HTTP), aucune superglobale, aucune sortie sauf emettre().
 * Points d'entrée : public/oauth/auth.php et public/oauth/callback.php. Tests : tests/php/tests/oauth*.php.
 *
 * Demandé directement par le web, ce fichier ne fait que déclarer des constantes et des fonctions : il n'affiche
 * rien (le serveur refuse en plus tout accès à oauth/lib/).
 *
 * Parcours (flux « authorization code » d'une OAuth App GitHub, comme le relais sveltia-cms-auth) :
 *  1. /admin ouvre une fenêtre sur oauth/auth.php?provider=github&site_id=…&scope=… (paramètres ajoutés par
 *     Sveltia, IGNORÉS ici sauf « provider ») ; auth.php tire un « state » aléatoire, le pose dans un cookie
 *     « __Host- » HttpOnly, Secure, SameSite=Lax et redirige vers GitHub (client_id, redirect_uri, scope et state de la
 *     configuration : rien qui vienne de la requête).
 *  2. GitHub renvoie la fenêtre sur oauth/callback.php?code=…&state=… ; callback.php compare le state au
 *     cookie (hash_equals), efface le cookie, échange le code contre un jeton (POST HTTPS vers GitHub, avec le
 *     secret de l'application) puis répond par une page qui transmet le jeton à /admin par postMessage, vers
 *     l'origine EXACTE autorisée (jamais « * »), selon le protocole de Sveltia/Decap :
 *        fenêtre → /admin   « authorizing:github »
 *        /admin → fenêtre   « authorizing:github » (même message, renvoyé)
 *        fenêtre → /admin   « authorization:github:success:{"token":"…","provider":"github"} »
 *                       ou  « authorization:github:error:{"provider":"github","error":"…"} »
 * Le jeton n'apparaît jamais dans une adresse, un journal, un cookie ni un fichier.
 */

declare(strict_types=1);

namespace Fan2Harmonie\OAuth;

use Closure;
use JsonException;
use Throwable;

/** Fournisseur unique de ce relais. */
const FOURNISSEUR = 'github';

/**
 * Cookie du « state » : nom, chemin, durée de vie en secondes. Préfixe « __Host- » : le navigateur ne
 * l'accepte que s'il est Secure, posé en HTTPS, avec Path=/ et sans Domain ; un sous-domaine de fan2harmonie.fr
 * ou une page en http ne peuvent donc pas en poser un (« cookie tossing »).
 */
const NOM_COOKIE = '__Host-fan2h_oauth_state';
const CHEMIN_COOKIE = '/';
const DUREE_ETAT = 600;

/** Longueur maximale de la chaîne de requête (les paramètres utiles font moins de 400 octets). */
const TAILLE_MAX_REQUETE = 2048;

/** Taille maximale de la réponse de GitHub à l'échange du code (environ 200 octets attendus). */
const TAILLE_MAX_REPONSE = 16384;

/** Délais de l'échange du code, en secondes. */
const DELAI_TOTAL = 10;
const DELAI_CONNEXION = 5;

/** Configuration : variable d'environnement, dossier hors de la racine web et nom du fichier. */
const VARIABLE_CONFIG = 'FAN2HARMONIE_OAUTH_CONFIG';
const DOSSIER_CONFIG_HORS_WEB = 'fan2harmonie-contact';
const FICHIER_CONFIG_HORS_WEB = 'oauth-config.php';

/** Portées acceptées : « repo » (dépôt privé) ou « public_repo » (dépôt public). */
const PORTEES = ['repo', 'public_repo'];

/** Valeurs par défaut des clés facultatives de la configuration. */
const DEFAUTS = [
    'origines_autorisees' => ['https://fan2harmonie.fr'],
    // Le dépôt du site est public : public_repo (droits plus étroits) ; « repo » seulement s'il devient privé.
    'scope' => 'public_repo',
    'url_callback' => 'https://fan2harmonie.fr/oauth/callback.php',
    // Adresses de GitHub : à ne JAMAIS changer en production (modifiables seulement pour les tests).
    'github_url_autorisation' => 'https://github.com/login/oauth/authorize',
    'github_url_jeton' => 'https://github.com/login/oauth/access_token',
    // TESTS seulement : autorise http://127.0.0.1 ou http://localhost pour github_url_jeton (faux GitHub local).
    // JAMAIS true en production.
    'transport_test' => false,
];

/** Forme acceptée d'un jeton d'accès (les jetons GitHub « gho_… » en font partie). */
const MOTIF_JETON = '/^[A-Za-z0-9_\-]{20,255}$/D';

/** Forme du « state » : 32 octets aléatoires en hexadécimal. */
const MOTIF_ETAT = '/^[0-9a-f]{64}$/D';

/** Forme acceptée du code renvoyé par GitHub. */
const MOTIF_CODE = '/^[A-Za-z0-9_\-]{1,256}$/D';

/** Message d'échec transmis à /admin (affiché par Sveltia) : générique, en français. */
const MESSAGE_ECHEC = 'La connexion avec GitHub n’a pas abouti. Réessayez dans quelques instants.';

/** Texte qui remplace la page quand le jeton n'a pas pu être transmis (pas de fenêtre parente, délai dépassé). */
const TEXTE_ABANDON = 'La connexion n’a pas abouti. Vous pouvez fermer cette fenêtre et recommencer.';

/** Indicateurs json_encode d'une valeur insérée dans le script de la page : rien ne peut en sortir. */
const JSON_SCRIPT = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR;

// ---------------------------------------------------------------------------------------------------------
// Hasard
// ---------------------------------------------------------------------------------------------------------

/** « state » de la demande d'autorisation : 32 octets aléatoires (random_bytes) en hexadécimal (64 caractères). */
function genererEtat(): string
{
    return bin2hex(random_bytes(32));
}

/** Nonce de la Content-Security-Policy d'une page : 16 octets aléatoires en hexadécimal, un par réponse. */
function genererNonce(): string
{
    return bin2hex(random_bytes(16));
}

// ---------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------

/**
 * Emplacements possibles de la configuration, dans l'ordre de recherche (même logique que le formulaire de
 * contact) :
 * 1. la variable d'environnement FAN2HARMONIE_OAUTH_CONFIG (chemin complet) ;
 * 2. « <dossier parent de la racine web>/fan2harmonie-contact/oauth-config.php » : HORS de la racine web
 *    (emplacement recommandé) ;
 * 3. « oauth/config.php » à côté des scripts, en dernier recours.
 *
 * @param array<string, mixed> $env         Variables d'environnement (getenv()).
 * @param string               $dossierOauth Dossier des points d'entrée (…/<racine web>/oauth).
 * @return list<string>
 */
function candidatsConfig(array $env, string $dossierOauth): array
{
    $candidats = [];
    $variable = $env[VARIABLE_CONFIG] ?? '';
    if (is_string($variable) && $variable !== '') {
        $candidats[] = $variable;
    }
    $candidats[] = dirname($dossierOauth, 2) . '/' . DOSSIER_CONFIG_HORS_WEB . '/' . FICHIER_CONFIG_HORS_WEB;
    $candidats[] = $dossierOauth . '/config.php';
    return $candidats;
}

/**
 * Premier emplacement de candidatsConfig() où le fichier existe, ou null. Si FAN2HARMONIE_OAUTH_CONFIG est posée
 * mais ne désigne aucun fichier, une ligne générique (sans le chemin) va dans le journal, puis la recherche
 * continue.
 *
 * @param (callable(string): bool)|null $existe Test d'existence (is_file par défaut ; injecté dans les tests).
 */
function trouverConfig(array $env, string $dossierOauth, ?callable $existe = null): ?string
{
    $existe ??= static fn (string $chemin): bool => is_file($chemin);
    $variable = $env[VARIABLE_CONFIG] ?? '';
    foreach (candidatsConfig($env, $dossierOauth) as $rang => $chemin) {
        if ($existe($chemin)) {
            return $chemin;
        }
        if ($rang === 0 && is_string($variable) && $variable !== '') {
            error_log('oauth : chemin de configuration invalide (FAN2HARMONIE_OAUTH_CONFIG).');
        }
    }
    return null;
}

/**
 * Lit un fichier de configuration (un fichier PHP qui renvoie un tableau). Null si le fichier manque ou ne
 * renvoie pas un tableau. Toute sortie accidentelle du fichier est écartée.
 */
function chargerConfig(string $chemin): ?array
{
    if (!is_file($chemin) || !is_readable($chemin)) {
        return null;
    }
    ob_start();
    try {
        $valeur = (static function (string $fichier): mixed {
            return require $fichier;
        })($chemin);
    } finally {
        ob_end_clean();
    }
    return is_array($valeur) ? $valeur : null;
}

/**
 * Configuration complète (valeurs par défaut ajoutées) si `$brute` est valide, sinon null :
 * - client_id : identifiant de l'OAuth App, lettres, chiffres, « . », « _ », « - » (1 à 100 caractères) ;
 * - client_secret : secret de l'OAuth App, 20 à 255 caractères de la même famille ;
 *   jamais une valeur contenant « CHANGER » (celle de config.sample.php) ;
 * - origines_autorisees : liste non vide d'origines « https://hôte[:port] » en minuscules, sans barre finale ;
 * - scope : « repo » ou « public_repo » ;
 * - url_callback : adresse https sans identifiants, requête ni fragment ;
 * - github_url_autorisation : adresse https, sans identifiants, requête ni fragment ;
 * - github_url_jeton : idem ; http://127.0.0.1 ou http://localhost seulement si transport_test vaut true
 *   (TESTS seulement : faux GitHub local) ;
 * - transport_test : booléen, false par défaut, jamais true en production.
 */
function normaliserConfig(array $brute): ?array
{
    $config = array_replace(DEFAUTS, $brute);
    foreach (['client_id' => 100, 'client_secret' => 255] as $cle => $longueurMax) {
        $valeur = $config[$cle] ?? null;
        $minimum = $cle === 'client_secret' ? 20 : 1;
        if (
            !is_string($valeur)
            || preg_match('/^[A-Za-z0-9._\-]{' . $minimum . ',' . $longueurMax . '}$/D', $valeur) !== 1
            || stripos($valeur, 'CHANGER') !== false
        ) {
            return null;
        }
    }
    $origines = $config['origines_autorisees'];
    if (!is_array($origines) || $origines === [] || !array_is_list($origines)) {
        return null;
    }
    foreach ($origines as $origine) {
        if (!is_string($origine) || origineCanonique($origine) !== $origine || !str_starts_with($origine, 'https://')) {
            return null;
        }
    }
    if (!in_array($config['scope'], PORTEES, true)) {
        return null;
    }
    foreach (['url_callback', 'github_url_autorisation'] as $cle) {
        if (!is_string($config[$cle]) || !adresseSure($config[$cle], false)) {
            return null;
        }
    }
    if (!is_bool($config['transport_test'])) {
        return null;
    }
    if (!is_string($config['github_url_jeton']) || !adresseSure($config['github_url_jeton'], $config['transport_test'])) {
        return null;
    }
    return $config;
}

/**
 * Configuration lue sur le serveur (trouverConfig → chargerConfig → normaliserConfig), ou null. Chaque échec
 * laisse une ligne générique dans le journal (jamais le chemin ni une valeur).
 */
function configDepuisServeur(array $env, string $dossierOauth): ?array
{
    $chemin = trouverConfig($env, $dossierOauth);
    if ($chemin === null) {
        error_log('oauth : configuration manquante.');
        return null;
    }
    $brute = chargerConfig($chemin);
    $config = $brute === null ? null : normaliserConfig($brute);
    if ($config === null) {
        error_log('oauth : configuration invalide.');
    }
    return $config;
}

/** Origine canonique « https://hôte[:port] » (ou http) d'une origine sans chemin, ou null. */
function origineCanonique(string $origine): ?string
{
    if (preg_match('/[^\x21-\x7E]|\\\\/', $origine) === 1) {
        return null;
    }
    $parties = parse_url($origine);
    if (!is_array($parties) || !isset($parties['scheme'], $parties['host']) || isset($parties['user']) || isset($parties['pass'])) {
        return null;
    }
    if (($parties['path'] ?? '') !== '' || isset($parties['query']) || isset($parties['fragment'])) {
        return null;
    }
    $schema = strtolower($parties['scheme']);
    $defaut = ['https' => 443, 'http' => 80][$schema] ?? null;
    $hote = strtolower($parties['host']);
    if ($defaut === null || preg_match('/^[a-z0-9.-]+$/D', $hote) !== 1) {
        return null;
    }
    $port = $parties['port'] ?? $defaut;
    return $schema . '://' . $hote . ($port === $defaut ? '' : ':' . $port);
}

/**
 * Vrai si `$adresse` est une adresse https absolue sans identifiants, requête ni fragment (caractères ASCII
 * visibles seulement). Avec `$bouclePermise`, http est aussi accepté pour 127.0.0.1 et localhost (tests).
 */
function adresseSure(string $adresse, bool $bouclePermise): bool
{
    if (preg_match('/[^\x21-\x7E]|\\\\/', $adresse) === 1) {
        return false;
    }
    $parties = parse_url($adresse);
    if (!is_array($parties) || !isset($parties['scheme'], $parties['host'])) {
        return false;
    }
    if (isset($parties['user']) || isset($parties['pass']) || isset($parties['query']) || isset($parties['fragment'])) {
        return false;
    }
    $hote = strtolower($parties['host']);
    if (preg_match('/^[a-z0-9.-]+$/D', $hote) !== 1) {
        return false;
    }
    $schema = strtolower($parties['scheme']);
    return $schema === 'https' || ($bouclePermise && $schema === 'http' && in_array($hote, ['127.0.0.1', 'localhost'], true));
}

// ---------------------------------------------------------------------------------------------------------
// Briques des réponses
// ---------------------------------------------------------------------------------------------------------

/**
 * Adresse d'autorisation de GitHub : client_id, redirect_uri (= url_callback), scope et state, tous tirés de
 * la configuration ou du hasard, encodés selon la RFC 3986. Aucune valeur de la requête n'y entre.
 */
function construireUrlAutorisation(array $config, string $etat): string
{
    return $config['github_url_autorisation'] . '?' . http_build_query([
        'client_id' => $config['client_id'],
        'redirect_uri' => $config['url_callback'],
        'scope' => $config['scope'],
        'state' => $etat,
    ], '', '&', PHP_QUERY_RFC3986);
}

/** En-tête Set-Cookie qui pose le « state » : __Host-, HttpOnly, Secure, SameSite=Lax, Path=/, 10 minutes. */
function cookieEtat(string $etat): string
{
    return NOM_COOKIE . '=' . $etat . '; Max-Age=' . DUREE_ETAT . '; Path=' . CHEMIN_COOKIE . '; Secure; HttpOnly; SameSite=Lax';
}

/** En-tête Set-Cookie qui efface le « state » (mêmes attributs, durée nulle). */
function cookieEfface(): string
{
    return NOM_COOKIE . '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=' . CHEMIN_COOKIE . '; Secure; HttpOnly; SameSite=Lax';
}

/** Politique de sécurité du contenu d'une page du relais : un seul script, celui qui porte ce nonce. */
function politiqueContenu(string $nonce): string
{
    return "default-src 'none'; script-src 'nonce-" . $nonce . "'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
}

/** En-têtes de toutes les réponses du relais. */
function entetesCommuns(): array
{
    return [
        'Cache-Control' => 'no-store',
        'Referrer-Policy' => 'no-referrer',
        'X-Content-Type-Options' => 'nosniff',
    ];
}

/** Message de réussite pour /admin : « authorization:github:success:{"token":"…","provider":"github"} ». */
function messageSucces(string $jeton): string
{
    return 'authorization:' . FOURNISSEUR . ':success:'
        . json_encode(['token' => $jeton, 'provider' => FOURNISSEUR], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

/** Message d'échec pour /admin : « authorization:github:error:{"provider":"github","error":"…"} » (générique). */
function messageEchec(): string
{
    return 'authorization:' . FOURNISSEUR . ':error:'
        . json_encode(['provider' => FOURNISSEUR, 'error' => MESSAGE_ECHEC], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

/** Échappement HTML de tout texte inséré dans la page. */
function html(string $texte): string
{
    return htmlspecialchars($texte, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Page HTML autonome (français) avec UN script en ligne, autorisé par `$nonce`. Le script :
 * 1. envoie « authorizing:github » à la fenêtre qui a ouvert celle-ci (window.opener), vers chacune des
 *    origines autorisées (le navigateur ne le délivre qu'à la bonne) ;
 * 2. attend la réponse de /admin : même fenêtre (event.source === window.opener), origine EXACTEMENT dans la
 *    liste, données « authorizing:github » ; tout autre message est ignoré ;
 * 3. envoie alors `$message` à cette origine de la liste (jamais « * »), puis ferme la fenêtre.
 * `$message` et `$origines` sont insérés par json_encode (JSON_HEX_TAG|AMP|APOS|QUOT, caractères non ASCII
 * échappés) : aucune valeur ne peut fermer la chaîne ni la balise <script>.
 *
 * @param list<string> $origines
 */
function pageMessage(string $titre, string $texte, string $message, array $origines, string $nonce): string
{
    $script = "(function () {\n"
        . "  \"use strict\";\n"
        . "  var script = document.currentScript;\n"
        . '  var origines = ' . json_encode(array_values($origines), JSON_SCRIPT) . ";\n"
        . '  var message = ' . json_encode($message, JSON_SCRIPT) . ";\n"
        . '  var attendu = ' . json_encode('authorizing:' . FOURNISSEUR, JSON_SCRIPT) . ";\n"
        . '  var texteEchec = ' . json_encode(TEXTE_ABANDON, JSON_SCRIPT) . ";\n"
        . "  var parent = window.opener;\n"
        . "  var delai = 0;\n"
        . "  function effacer(echec) {\n"
        . "    message = null;\n"
        . "    if (script && script.parentNode) {\n"
        . "      script.parentNode.removeChild(script);\n"
        . "    }\n"
        . "    if (echec) {\n"
        . "      var principal = document.querySelector(\"main\");\n"
        . "      if (principal) {\n"
        . "        var paragraphe = document.createElement(\"p\");\n"
        . "        paragraphe.textContent = texteEchec;\n"
        . "        principal.textContent = \"\";\n"
        . "        principal.appendChild(paragraphe);\n"
        . "      }\n"
        . "    }\n"
        . "  }\n"
        . "  if (!parent) {\n"
        . "    effacer(true);\n"
        . "    return;\n"
        . "  }\n"
        . "  function recevoir(evenement) {\n"
        . "    var rang = origines.indexOf(evenement.origin);\n"
        . "    if (message === null || evenement.source !== parent || rang === -1 || evenement.data !== attendu) {\n"
        . "      return;\n"
        . "    }\n"
        . "    window.removeEventListener(\"message\", recevoir);\n"
        . "    window.clearTimeout(delai);\n"
        . "    parent.postMessage(message, origines[rang]);\n"
        . "    effacer(false);\n"
        . "    window.setTimeout(function () {\n"
        . "      window.close();\n"
        . "    }, 500);\n"
        . "  }\n"
        . "  window.addEventListener(\"message\", recevoir);\n"
        . "  delai = window.setTimeout(function () {\n"
        . "    window.removeEventListener(\"message\", recevoir);\n"
        . "    effacer(true);\n"
        . "  }, 30000);\n"
        . "  for (var i = 0; i < origines.length; i += 1) {\n"
        . "    parent.postMessage(attendu, origines[i]);\n"
        . "  }\n"
        . "})();\n";

    return "<!doctype html>\n"
        . "<html lang=\"fr\">\n"
        . "<head>\n"
        . "<meta charset=\"utf-8\">\n"
        . "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        . "<meta name=\"robots\" content=\"noindex\">\n"
        . '<title>' . html($titre) . " — Fan 2 Harmonie</title>\n"
        . "</head>\n"
        . "<body>\n"
        . "<main>\n"
        . '<h1>' . html($titre) . "</h1>\n"
        . '<p>' . html($texte) . "</p>\n"
        . "</main>\n"
        . '<script nonce="' . html($nonce) . "\">\n"
        . $script
        . "</script>\n"
        . "</body>\n"
        . "</html>\n";
}

/**
 * Réponse HTTP : `statut`, `entetes` (nom → valeur ; Set-Cookie au plus une fois), `contenu`.
 * @return array{statut: int, entetes: array<string, string>, contenu: string}
 */
function reponse(int $statut, array $entetes, string $contenu): array
{
    return ['statut' => $statut, 'entetes' => entetesCommuns() + $entetes, 'contenu' => $contenu];
}

/** Page de réussite (200) : transmet le jeton à /admin. */
function reponseSucces(string $jeton, array $origines, string $nonce): array
{
    $reponse = reponse(200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Content-Security-Policy' => politiqueContenu($nonce),
    ], pageMessage(
        'Connexion réussie',
        'La connexion a réussi. Cette fenêtre va se fermer ; si elle reste ouverte, vous pouvez la fermer.',
        messageSucces($jeton),
        $origines,
        $nonce,
    ));
    // Contenu sensible : jamais émis si les en-têtes (CSP, no-store) n'ont pas pu partir (voir emettre()).
    $reponse['sensible'] = true;
    return $reponse;
}

/**
 * Page d'échec générique : jamais de détail (ni la description de GitHub, ni la cause), qui va seulement, sous
 * une forme générique, dans le journal. Transmet aussi l'échec à /admin, qui l'affiche.
 */
function reponseEchec(int $statut, array $origines, string $nonce, array $entetes = []): array
{
    return reponse($statut, $entetes + [
        'Content-Type' => 'text/html; charset=utf-8',
        'Content-Security-Policy' => politiqueContenu($nonce),
    ], pageMessage(
        'Connexion impossible',
        'La connexion avec GitHub n’a pas abouti. Fermez cette fenêtre et réessayez depuis l’administration du site.',
        messageEchec(),
        $origines,
        $nonce,
    ));
}

// ---------------------------------------------------------------------------------------------------------
// Contrôles de la requête
// ---------------------------------------------------------------------------------------------------------

/**
 * Réponse de refus si la requête n'est pas un GET de taille raisonnable, sinon null :
 * méthode autre que GET → 405 (Allow: GET) ; chaîne de requête de plus de 2 Ko → 414 ; corps annoncé → 413.
 */
function refusRequete(array $serveur, array $origines, string $nonce, array $entetes = []): ?array
{
    if (($serveur['REQUEST_METHOD'] ?? '') !== 'GET') {
        return reponseEchec(405, $origines, $nonce, $entetes + ['Allow' => 'GET']);
    }
    $requete = $serveur['QUERY_STRING'] ?? '';
    if (!is_string($requete) || strlen($requete) > TAILLE_MAX_REQUETE) {
        return reponseEchec(414, $origines, $nonce, $entetes);
    }
    $longueur = $serveur['CONTENT_LENGTH'] ?? '';
    if ($longueur !== '' && $longueur !== null && $longueur !== '0' && $longueur !== 0) {
        return reponseEchec(413, $origines, $nonce, $entetes);
    }
    return null;
}

/** Origines vers lesquelles une page peut écrire : celles de la configuration, ou la valeur par défaut. */
function originesPour(?array $config): array
{
    return $config['origines_autorisees'] ?? DEFAUTS['origines_autorisees'];
}

// ---------------------------------------------------------------------------------------------------------
// Point d'entrée 1 : auth.php
// ---------------------------------------------------------------------------------------------------------

/**
 * Traite une requête vers auth.php.
 * - GET seulement (405 sinon), taille raisonnable ;
 * - configuration absente ou invalide → 500 ;
 * - « provider », s'il est présent, doit valoir exactement « github » (400 sinon) ;
 * - sinon : nouveau « state » dans le cookie, 302 vers GitHub.
 * Tout autre paramètre (site_id, scope, redirect_uri…) est ignoré.
 *
 * @param array<string, mixed> $get          $_GET.
 * @param array<string, mixed> $serveur      $_SERVER.
 * @param callable(): string   $genererEtat  genererEtat en production.
 * @param callable(): string   $genererNonce genererNonce en production.
 */
function traiterAuth(array $get, array $serveur, ?array $config, callable $genererEtat, callable $genererNonce): array
{
    $origines = originesPour($config);
    $refus = refusRequete($serveur, $origines, $genererNonce());
    if ($refus !== null) {
        return $refus;
    }
    if ($config === null) {
        return reponseEchec(500, $origines, $genererNonce());
    }
    if (array_key_exists('provider', $get) && $get['provider'] !== FOURNISSEUR) {
        return reponseEchec(400, $origines, $genererNonce());
    }
    $etat = $genererEtat();
    if (preg_match(MOTIF_ETAT, $etat) !== 1) {
        return reponseEchec(500, $origines, $genererNonce());
    }
    return reponse(302, [
        'Location' => construireUrlAutorisation($config, $etat),
        'Set-Cookie' => cookieEtat($etat),
        'Content-Type' => 'text/plain; charset=utf-8',
    ], '');
}

// ---------------------------------------------------------------------------------------------------------
// Point d'entrée 2 : callback.php
// ---------------------------------------------------------------------------------------------------------

/**
 * Client HTTP de l'échange du code : `(string $url, string $corps, list<string> $entetes): ?array` qui renvoie
 * `['statut' => int, 'corps' => string, 'tronque' => bool]`, ou null si la requête n'a pas abouti (délai
 * dépassé, connexion ou TLS refusés, protocole interdit…).
 *
 * cURL : POST, vérification TLS ACTIVE (VERIFYPEER, VERIFYHOST 2), délai total 10 s et de connexion 5 s,
 * aucune redirection suivie, protocole HTTPS seulement (HTTP seulement si l'adresse elle-même est en http,
 * ce que normaliserConfig n'accepte que vers 127.0.0.1 ou localhost, pour les tests), aucun mandataire (même si
 * une variable d'environnement en désigne un), réponse coupée au-delà de TAILLE_MAX_REPONSE.
 */
function clientHttpCurl(int $delaiTotal = DELAI_TOTAL, int $delaiConnexion = DELAI_CONNEXION): Closure
{
    return static function (string $url, string $corps, array $entetes) use ($delaiTotal, $delaiConnexion): ?array {
        $schema = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if ($schema !== 'https' && $schema !== 'http') {
            return null;
        }
        $protocole = $schema === 'http' ? CURLPROTO_HTTP : CURLPROTO_HTTPS;
        $recu = '';
        $tronque = false;
        $poignee = curl_init();
        if ($poignee === false) {
            return null;
        }
        $reglages = curl_setopt_array($poignee, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $corps,
            CURLOPT_HTTPHEADER => $entetes,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => $protocole,
            CURLOPT_REDIR_PROTOCOLS => $protocole,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => $delaiConnexion,
            CURLOPT_TIMEOUT => $delaiTotal,
            CURLOPT_NOSIGNAL => true,
            CURLOPT_PROXY => '',
            CURLOPT_HEADER => false,
            CURLOPT_WRITEFUNCTION => static function ($poignee, string $morceau) use (&$recu, &$tronque): int {
                if (strlen($recu) + strlen($morceau) > TAILLE_MAX_REPONSE) {
                    $tronque = true;
                    return 0;
                }
                $recu .= $morceau;
                return strlen($morceau);
            },
        ]);
        if ($reglages === false) {
            return null;
        }
        $fait = curl_exec($poignee);
        $statut = (int) curl_getinfo($poignee, CURLINFO_RESPONSE_CODE);
        unset($poignee);
        if ($tronque) {
            return ['statut' => $statut, 'corps' => $recu, 'tronque' => true];
        }
        if ($fait === false) {
            return null;
        }
        return ['statut' => $statut, 'corps' => $recu, 'tronque' => false];
    };
}

/**
 * Échange le code contre un jeton d'accès auprès de GitHub (POST vers github_url_jeton : client_id,
 * client_secret, code, redirect_uri ; Accept: application/json), par le client HTTP injecté.
 * Réussite : `['ok' => true, 'jeton' => string]`. Échec : `['ok' => false, 'raison' => string]`, raison
 * GÉNÉRIQUE (jamais le jeton, le code, le secret ni le corps de la réponse) destinée au journal.
 *
 * @param callable(string, string, list<string>): ?array $http
 */
function echangerCode(array $config, string $code, callable $http): array
{
    $corps = http_build_query([
        'client_id' => $config['client_id'],
        'client_secret' => $config['client_secret'],
        'code' => $code,
        'redirect_uri' => $config['url_callback'],
    ], '', '&', PHP_QUERY_RFC3986);
    try {
        $reponse = $http($config['github_url_jeton'], $corps, [
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
            'User-Agent: Fan2Harmonie-OAuth',
        ]);
    } catch (Throwable) {
        $reponse = null;
    }
    if (!is_array($reponse) || !is_int($reponse['statut'] ?? null) || !is_string($reponse['corps'] ?? null)) {
        return ['ok' => false, 'raison' => 'GitHub injoignable'];
    }
    if (($reponse['tronque'] ?? false) === true || strlen($reponse['corps']) > TAILLE_MAX_REPONSE) {
        return ['ok' => false, 'raison' => 'réponse trop volumineuse'];
    }
    if ($reponse['statut'] !== 200) {
        return ['ok' => false, 'raison' => 'statut HTTP ' . $reponse['statut']];
    }
    try {
        $donnees = json_decode($reponse['corps'], true, 4, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return ['ok' => false, 'raison' => 'réponse illisible'];
    }
    if (!is_array($donnees) || array_is_list($donnees)) {
        return ['ok' => false, 'raison' => 'réponse illisible'];
    }
    if (array_key_exists('error', $donnees)) {
        return ['ok' => false, 'raison' => 'code refusé par GitHub'];
    }
    $jeton = $donnees['access_token'] ?? null;
    if (!is_string($jeton) || preg_match(MOTIF_JETON, $jeton) !== 1) {
        return ['ok' => false, 'raison' => 'jeton absent ou invalide'];
    }
    $type = $donnees['token_type'] ?? null;
    if (!is_string($type) || strtolower($type) !== 'bearer') {
        return ['ok' => false, 'raison' => 'type de jeton inattendu'];
    }
    return ['ok' => true, 'jeton' => $jeton];
}

/**
 * Traite le retour de GitHub vers callback.php. Le cookie du « state » est effacé dans TOUS les cas.
 * - GET seulement (405), taille raisonnable ; configuration présente et valide (500) ;
 * - « error » renvoyé par GitHub (accès refusé…) → page d'échec générique (la description n'est pas reprise) ;
 * - « code » et « state » : chaînes de la forme attendue (400 sinon, tableaux compris) ;
 * - « state » égal au cookie (hash_equals ; les deux présents, 64 caractères hexadécimaux) → sinon 403 ;
 * - échange du code : échec → 502 ; réussite → page qui transmet le jeton.
 *
 * @param array<string, mixed> $get     $_GET.
 * @param array<string, mixed> $serveur $_SERVER.
 * @param array<string, mixed> $cookies $_COOKIE.
 * @param callable(string, string, list<string>): ?array $http         Client HTTP (clientHttpCurl()).
 * @param callable(): string                             $genererNonce genererNonce en production.
 */
function traiterCallback(array $get, array $serveur, array $cookies, ?array $config, callable $http, callable $genererNonce): array
{
    $origines = originesPour($config);
    $efface = ['Set-Cookie' => cookieEfface()];
    $refus = refusRequete($serveur, $origines, $genererNonce(), $efface);
    if ($refus !== null) {
        return $refus;
    }
    if ($config === null) {
        return reponseEchec(500, $origines, $genererNonce(), $efface);
    }
    if (array_key_exists('error', $get)) {
        error_log('oauth : autorisation refusée ou annulée sur GitHub.');
        return reponseEchec(400, $origines, $genererNonce(), $efface);
    }
    $code = $get['code'] ?? null;
    $etat = $get['state'] ?? null;
    if (!is_string($code) || !is_string($etat) || preg_match(MOTIF_CODE, $code) !== 1 || preg_match(MOTIF_ETAT, $etat) !== 1) {
        return reponseEchec(400, $origines, $genererNonce(), $efface);
    }
    $attendu = $cookies[NOM_COOKIE] ?? null;
    if (!is_string($attendu) || preg_match(MOTIF_ETAT, $attendu) !== 1 || !hash_equals($attendu, $etat)) {
        error_log('oauth : état absent ou différent du cookie (requête refusée).');
        return reponseEchec(403, $origines, $genererNonce(), $efface);
    }
    $echange = echangerCode($config, $code, $http);
    if ($echange['ok'] !== true) {
        error_log('oauth : échange du code impossible (' . $echange['raison'] . ').');
        return reponseEchec(502, $origines, $genererNonce(), $efface);
    }
    $reponse = reponseSucces($echange['jeton'], $origines, $genererNonce());
    $reponse['entetes'] += $efface;
    return $reponse;
}

// ---------------------------------------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------------------------------------

/**
 * Émet la réponse : statut, en-têtes (X-Powered-By retiré), contenu. Seule fonction qui écrit la sortie.
 * Si les en-têtes sont déjà partis (sortie accidentelle avant emettre()), une réponse sensible (le jeton)
 * n'est JAMAIS écrite, puisque sa CSP et son « no-store » manqueraient : une page d'échec sans script, et une
 * ligne générique dans le journal, la remplacent.
 *
 * @param (callable(): bool)|null $entetesEnvoyes headers_sent en production (injecté dans les tests).
 */
function emettre(array $reponse, ?callable $entetesEnvoyes = null): void
{
    $entetesEnvoyes ??= static fn (): bool => headers_sent();
    if ($entetesEnvoyes()) {
        if (($reponse['sensible'] ?? false) === true) {
            error_log('oauth : en-têtes déjà envoyés, réponse remplacée par une page d’échec.');
            echo "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n"
                . "<title>Connexion impossible — Fan 2 Harmonie</title>\n</head>\n<body>\n<h1>Connexion impossible</h1>\n"
                . '<p>' . html(TEXTE_ABANDON) . "</p>\n</body>\n</html>\n";
            return;
        }
        echo $reponse['contenu'];
        return;
    }
    header_remove('X-Powered-By');
    http_response_code($reponse['statut']);
    foreach ($reponse['entetes'] as $nom => $valeur) {
        header($nom . ': ' . $valeur, $nom !== 'Set-Cookie');
    }
    echo $reponse['contenu'];
}
