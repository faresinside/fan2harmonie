<?php

/**
 * Formulaire de contact du site : bibliothèque de fonctions (aucune superglobale, aucune sortie).
 * Point d'entrée : public/api/contact.php. Tests : tests/php/ (`docker compose run --rm php php tests/php/run.php`).
 *
 * Demandé directement par le web, ce fichier ne fait que déclarer des constantes et des fonctions : il n'affiche
 * rien et n'agit sur rien. (L'accès direct à api/lib/ et à api/config.php sera en plus refusé par le serveur.)
 *
 * Parcours d'une requête (traiterContact) : méthode POST → configuration présente et valide → taille ≤ 20 Ko →
 * origine autorisée → champ piège vide (sinon faux succès) → champs valides (sinon 422) → limiteur par adresse IP
 * → un courriel texte à l'adresse de la configuration. Rien n'est stocké ; aucune donnée saisie n'est journalisée.
 */

declare(strict_types=1);

namespace Fan2Harmonie\Contact;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;
use stdClass;
use Throwable;

/** Taille maximale d'une requête (corps), en octets. */
const TAILLE_MAX_REQUETE = 20480;
const LONGUEUR_MAX_NOM = 100;
const LONGUEUR_MAX_EMAIL = 254;
/** Fenêtre glissante du limiteur, en secondes. */
const FENETRE_LIMITEUR = 3600;
const PREFIXE_SUJET = '[Site Fan 2 Harmonie] Message de ';
const NOM_EXPEDITEUR = 'Site Fan 2 Harmonie';
const FICHIER_LIMITEUR = 'fan2harmonie-limiteur.json';
const FICHIER_SECRET = 'fan2harmonie-secret-limiteur';
/** Octets de texte par mot encodé RFC 2047 : 45 octets → 60 caractères base64 → mot de 72 caractères (≤ 75). */
const OCTETS_PAR_MOT = 45;

const MESSAGE_METHODE = 'Méthode non autorisée.';
const MESSAGE_CONFIG_ABSENTE = 'Configuration manquante';
const MESSAGE_CONFIG_INVALIDE = 'Configuration invalide';
const MESSAGE_TAILLE = 'Requête trop volumineuse.';
const MESSAGE_ORIGINE = 'Origine de la requête refusée.';
const MESSAGE_LIMITE = 'Trop de messages envoyés. Réessayez plus tard.';
const MESSAGE_INDISPONIBLE = 'Service momentanément indisponible.';
const MESSAGE_ENVOI = "L'envoi a échoué.";
const MESSAGE_INTERNE = 'Erreur interne.';

const ERREUR_NOM_VIDE = 'Indiquez votre nom.';
const ERREUR_NOM_LONG = 'Votre nom est trop long (100 caractères au maximum).';
const ERREUR_EMAIL = 'Adresse e-mail invalide.';
const ERREUR_MESSAGE_VIDE = 'Écrivez votre message.';
const ERREUR_CONSENTEMENT = 'Cochez la case de consentement pour pouvoir envoyer votre message.';

/*
 * Formes des tableaux échangés :
 * - Résultat : array{statut: int, corps: array{ok: bool, errors?: list<array{field?: string, message: string}>},
 *   envoye: bool, entetes: array<string, string>} (en-têtes HTTP propres au cas : Allow, Retry-After).
 * - Réponse HTTP : array{statut: int, entetes: array<string, string>, contenu: string}.
 * - Courriel : array{destinataire: string, expediteur: string, sujet: string, entetes: array<string, string>,
 *   corps: string} (sujet déjà encodé RFC 2047, corps déjà encodé en base64).
 * - Décision du limiteur : array{autorise: bool, reessayer: int} (secondes avant un nouvel essai si refusé).
 */

// ---------------------------------------------------------------------------------------------------------
// Traitement
// ---------------------------------------------------------------------------------------------------------

/**
 * Traite un envoi du formulaire. Fonction pure, hors des deux fonctions injectées.
 *
 * @param array<array-key, mixed> $post         Champs reçus ($_POST).
 * @param array<string, mixed>    $serveur      Contexte ($_SERVER) : REQUEST_METHOD, HTTP_ORIGIN, HTTP_REFERER,
 *                                              CONTENT_LENGTH, REMOTE_ADDR.
 * @param array<string, mixed>|null $config     Configuration (config.php), null si absente.
 * @param callable(array): bool   $envoyerMail  Envoie un courriel (voir « Courriel ») ; vrai si accepté.
 * @param callable(string): array $limiteur     Reçoit REMOTE_ADDR, rend une décision (voir « Décision ») et
 *                                              compte l'envoi s'il est autorisé ; peut lever une exception.
 * @return array{statut: int, corps: array, envoye: bool, entetes: array<string, string>}
 */
function traiterContact(
    array $post,
    array $serveur,
    ?array $config,
    callable $envoyerMail,
    callable $limiteur,
    ?DateTimeImmutable $maintenant = null,
): array {
    if (chaine($serveur['REQUEST_METHOD'] ?? null) !== 'POST') {
        return echec(405, MESSAGE_METHODE, ['Allow' => 'POST']);
    }
    if ($config === null) {
        return echec(500, MESSAGE_CONFIG_ABSENTE);
    }
    if (!configValide($config)) {
        return echec(500, MESSAGE_CONFIG_INVALIDE);
    }
    if (tailleExcessive($post, $serveur)) {
        return echec(413, MESSAGE_TAILLE);
    }
    if (!origineAutorisee($serveur, $config['origines_autorisees'])) {
        return echec(403, MESSAGE_ORIGINE);
    }
    // Champ piège rempli : un robot. Faux succès, rien n'est envoyé ni compté.
    if (piegeRempli($post)) {
        return succes(false);
    }

    ['valeurs' => $valeurs, 'erreurs' => $erreurs] = validerChamps($post, $config['taille_max_message']);
    if ($erreurs !== []) {
        return ['statut' => 422, 'corps' => ['ok' => false, 'errors' => $erreurs], 'envoye' => false, 'entetes' => []];
    }

    try {
        $decision = $limiteur(chaine($serveur['REMOTE_ADDR'] ?? null));
    } catch (Throwable) {
        return echec(500, MESSAGE_INDISPONIBLE);
    }
    if (!is_array($decision) || !is_bool($decision['autorise'] ?? null)) {
        return echec(500, MESSAGE_INDISPONIBLE);
    }
    if ($decision['autorise'] !== true) {
        $attente = is_int($decision['reessayer'] ?? null) ? max(1, $decision['reessayer']) : FENETRE_LIMITEUR;
        return echec(429, MESSAGE_LIMITE, ['Retry-After' => (string) $attente]);
    }

    $courriel = construireCourriel($valeurs, $config, $maintenant ?? new DateTimeImmutable());
    try {
        $envoye = $envoyerMail($courriel) === true;
    } catch (Throwable) {
        $envoye = false;
    }
    return $envoye ? succes(true) : echec(500, MESSAGE_ENVOI);
}

/**
 * Traitement complet d'une requête réelle : traiterContact avec le vrai limiteur sur fichier et le vrai
 * transport (mail(), ou le transport de test s'il est explicitement activé, voir transportTestActif).
 *
 * @param array<string, string> $env Variables d'environnement (getenv()).
 */
function executer(array $post, array $serveur, ?array $config, array $env): array
{
    $envoyeur = static function (array $courriel) use ($config, $env): bool {
        $config ??= [];
        $transport = transportTestActif($config, $env) ? envoyeurFichier($config['dossier_transport_test']) : envoyeurMail();
        return $transport($courriel);
    };
    $limiteur = static function (string $ip) use ($config): array {
        try {
            return fabriquerLimiteur($config ?? [])($ip);
        } catch (Throwable) {
            error_log('contact.php : limiteur indisponible (vérifier dossier_limiteur).');
            throw new RuntimeException('limiteur indisponible');
        }
    };
    return traiterContact($post, $serveur, $config, $envoyeur, $limiteur);
}

/** @return array{statut: int, corps: array, envoye: bool, entetes: array<string, string>} */
function echec(int $statut, string $message, array $entetes = []): array
{
    return ['statut' => $statut, 'corps' => ['ok' => false, 'errors' => [['message' => $message]]], 'envoye' => false, 'entetes' => $entetes];
}

/** @return array{statut: int, corps: array, envoye: bool, entetes: array<string, string>} */
function succes(bool $envoye): array
{
    return ['statut' => 200, 'corps' => ['ok' => true], 'envoye' => $envoye, 'entetes' => []];
}

/** La valeur si c'est une chaîne, sinon la chaîne vide (champ absent, tableau `nom[]=…`, etc.). */
function chaine(mixed $valeur): string
{
    return is_string($valeur) ? $valeur : '';
}

// ---------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------

/**
 * Lit config.php (un fichier PHP qui renvoie un tableau). Null si le fichier manque ou ne renvoie pas un tableau.
 * Toute sortie accidentelle du fichier (espace après « ?> »…) est écartée.
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

/** Vrai si la configuration a toutes les clés attendues, de bons types et des adresses sûres. */
function configValide(array $config): bool
{
    foreach (['destinataire', 'expediteur'] as $cle) {
        if (!is_string($config[$cle] ?? null) || !emailValide($config[$cle])) {
            return false;
        }
    }
    $origines = $config['origines_autorisees'] ?? null;
    if (!is_array($origines) || $origines === [] || !array_is_list($origines)) {
        return false;
    }
    foreach ($origines as $origine) {
        // Forme canonique exigée (minuscules, sans barre finale ni chemin) : la comparaison est alors exacte.
        if (!is_string($origine) || normaliserOrigine($origine) !== $origine) {
            return false;
        }
    }
    foreach (['limite_par_heure', 'taille_max_message'] as $cle) {
        if (!is_int($config[$cle] ?? null) || $config[$cle] < 1) {
            return false;
        }
    }
    if (!is_string($config['dossier_limiteur'] ?? null) || $config['dossier_limiteur'] === '') {
        return false;
    }
    $secret = $config['secret_limiteur'] ?? '';
    if (!is_string($secret) || ($secret !== '' && strlen($secret) < 32)) {
        return false;
    }
    $transportTest = $config['transport_test'] ?? false;
    if (!is_bool($transportTest)) {
        return false;
    }
    return !$transportTest || (is_string($config['dossier_transport_test'] ?? null) && $config['dossier_transport_test'] !== '');
}

// ---------------------------------------------------------------------------------------------------------
// Contrôles de la requête
// ---------------------------------------------------------------------------------------------------------

/** Vrai si le corps annoncé (Content-Length) ou la taille des champs reçus dépasse 20 Ko. */
function tailleExcessive(array $post, array $serveur): bool
{
    $longueur = $serveur['CONTENT_LENGTH'] ?? null;
    if (is_int($longueur)) {
        $longueur = (string) $longueur;
    }
    if (is_string($longueur) && $longueur !== '' && ctype_digit($longueur)) {
        if (strlen($longueur) > 9 || (int) $longueur > TAILLE_MAX_REQUETE) {
            return true;
        }
    }
    return tailleChamps($post) > TAILLE_MAX_REQUETE;
}

/** Nombre d'octets des noms et valeurs de champs (tableaux compris). */
function tailleChamps(array $donnees): int
{
    $taille = 0;
    foreach ($donnees as $cle => $valeur) {
        $taille += strlen((string) $cle);
        if (is_array($valeur)) {
            $taille += tailleChamps($valeur);
        } elseif (is_string($valeur)) {
            $taille += strlen($valeur);
        }
    }
    return $taille;
}

/**
 * Vrai si l'en-tête Origin (ou, s'il est absent, l'origine du Referer) figure exactement dans `$autorisees`.
 * Un Origin présent mais refusé n'est jamais rattrapé par le Referer ; sans l'un ni l'autre : refus.
 *
 * @param list<string> $autorisees Origines canoniques (voir normaliserOrigine).
 */
function origineAutorisee(array $serveur, array $autorisees): bool
{
    $origine = chaine($serveur['HTTP_ORIGIN'] ?? null);
    if ($origine !== '') {
        $trouvee = normaliserOrigine($origine);
    } else {
        $referent = chaine($serveur['HTTP_REFERER'] ?? null);
        $trouvee = $referent === '' ? null : origineDUrl($referent, true);
    }
    return $trouvee !== null && in_array($trouvee, $autorisees, true);
}

/** Origine canonique « schéma://hôte[:port] » d'un en-tête Origin, ou null (« null », chemin, identifiants…). */
function normaliserOrigine(string $origine): ?string
{
    return origineDUrl($origine, false);
}

/**
 * Origine canonique d'une adresse http(s) : schéma et hôte en minuscules, port omis s'il est celui par défaut.
 * Null si l'adresse est mal formée, contient des identifiants ou des caractères de contrôle ; avec
 * `$cheminPermis` faux, null aussi dès qu'il y a un chemin, une requête ou un fragment.
 */
function origineDUrl(string $adresse, bool $cheminPermis): ?string
{
    if ($adresse === '' || preg_match('/[^\x21-\x7E]/', $adresse) === 1) {
        return null;
    }
    $parties = parse_url($adresse);
    if (!is_array($parties) || !isset($parties['scheme'], $parties['host'])) {
        return null;
    }
    if (isset($parties['user']) || isset($parties['pass'])) {
        return null;
    }
    if (!$cheminPermis && (($parties['path'] ?? '') !== '' || isset($parties['query']) || isset($parties['fragment']))) {
        return null;
    }
    $schema = strtolower($parties['scheme']);
    $defaut = ['https' => 443, 'http' => 80][$schema] ?? null;
    if ($defaut === null) {
        return null;
    }
    $hote = strtolower($parties['host']);
    if (preg_match('/^[a-z0-9.-]+$/', $hote) !== 1) {
        return null;
    }
    $port = $parties['port'] ?? $defaut;
    return $schema . '://' . $hote . ($port === $defaut ? '' : ':' . $port);
}

/** Vrai si le champ piège « _gotcha » n'est pas une chaîne vide (les personnes ne le voient pas). */
function piegeRempli(array $post): bool
{
    return array_key_exists('_gotcha', $post) && $post['_gotcha'] !== '';
}

/** Vrai si le client demande du JSON (envoi en JavaScript) ; sinon il reçoit une page HTML. */
function veutJson(array $serveur): bool
{
    return str_contains(strtolower(chaine($serveur['HTTP_ACCEPT'] ?? null)), 'application/json');
}

// ---------------------------------------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------------------------------------

/**
 * Valide les champs. « _subject » et tout champ inconnu sont ignorés.
 *
 * @return array{valeurs: array{nom: string, email: string, message: string},
 *               erreurs: list<array{field: string, message: string}>}
 *         Valeurs nettoyées : nom sur une ligne, message aux fins de ligne « \n » sans caractère de contrôle.
 */
function validerChamps(array $post, int $tailleMaxMessage): array
{
    $erreurs = [];

    $nom = nettoyerNom(chaine($post['nom'] ?? null));
    if ($nom === '') {
        $erreurs[] = ['field' => 'nom', 'message' => ERREUR_NOM_VIDE];
    } elseif (mb_strlen($nom, 'UTF-8') > LONGUEUR_MAX_NOM) {
        $erreurs[] = ['field' => 'nom', 'message' => ERREUR_NOM_LONG];
    }

    $emailBrut = chaine($post['email'] ?? null);
    // Aucun caractère de contrôle (CR, LF, NUL…), même en bordure : trim() les ôterait sinon en silence.
    $email = preg_match('/[\x00-\x1F\x7F]/', $emailBrut) === 1 ? '' : trim($emailBrut, ' ');
    if (!emailValide($email)) {
        $erreurs[] = ['field' => 'email', 'message' => ERREUR_EMAIL];
    }

    $message = nettoyerMessage(chaine($post['message'] ?? null));
    if ($message === '') {
        $erreurs[] = ['field' => 'message', 'message' => ERREUR_MESSAGE_VIDE];
    } elseif (mb_strlen($message, 'UTF-8') > $tailleMaxMessage) {
        $erreurs[] = ['field' => 'message', 'message' => sprintf('Votre message est trop long (%d caractères au maximum).', $tailleMaxMessage)];
    }

    // La case du formulaire envoie value="oui" quand elle est cochée (src/components/ContactForm.astro).
    if (($post['consentement'] ?? null) !== 'oui') {
        $erreurs[] = ['field' => 'consentement', 'message' => ERREUR_CONSENTEMENT];
    }

    return ['valeurs' => ['nom' => $nom, 'email' => $email, 'message' => $message], 'erreurs' => $erreurs];
}

/**
 * Nom sur une seule ligne : UTF-8 invalide → chaîne vide ; caractères de contrôle (CR, LF, tabulation, NUL, DEL…)
 * et séparateurs de ligne Unicode → une espace ; contrôles bidirectionnels (U+202A–U+202E, U+2066–U+2069) retirés.
 */
function nettoyerNom(string $nom): string
{
    if (!mb_check_encoding($nom, 'UTF-8')) {
        return '';
    }
    $nom = (string) preg_replace('/[\p{Cc}\x{2028}\x{2029}]+/u', ' ', $nom);
    $nom = (string) preg_replace('/[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $nom);
    return trim($nom, ' ');
}

/**
 * Message : UTF-8 invalide → chaîne vide ; fins de ligne CRLF et CR → LF ; caractères de contrôle autres que
 * tabulation et saut de ligne (NUL…) retirés ; espaces de bordure retirés.
 */
function nettoyerMessage(string $message): string
{
    if (!mb_check_encoding($message, 'UTF-8')) {
        return '';
    }
    $message = str_replace(["\r\n", "\r"], "\n", $message);
    $message = (string) preg_replace('/[^\P{Cc}\t\n]/u', '', $message);
    return trim($message);
}

/**
 * Adresse e-mail sûre pour un en-tête et pour `sendmail -f` : ASCII imprimable sans espace, sans guillemet,
 * barre oblique inverse, parenthèse, virgule, point-virgule, deux-points, chevron ni crochet ; ne commence pas
 * par « - » ; 254 caractères au plus ; acceptée par FILTER_VALIDATE_EMAIL.
 */
function emailValide(string $email): bool
{
    if ($email === '' || strlen($email) > LONGUEUR_MAX_EMAIL || str_starts_with($email, '-')) {
        return false;
    }
    if (preg_match('/[^\x21-\x7E]/', $email) === 1 || strpbrk($email, "\"\\(),;:<>[]") !== false) {
        return false;
    }
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

// ---------------------------------------------------------------------------------------------------------
// Courriel
// ---------------------------------------------------------------------------------------------------------

/**
 * Sujet encodé : préfixe fixe + nom (nettoyé, 100 caractères au plus), en mots RFC 2047 « =?UTF-8?B?…?= » de
 * 75 caractères au plus, séparés par une espace, sur une seule ligne.
 */
function construireSujet(string $nom): string
{
    $texte = PREFIXE_SUJET . mb_substr(nettoyerNom($nom), 0, LONGUEUR_MAX_NOM, 'UTF-8');
    $mots = [];
    $morceau = '';
    foreach (mb_str_split($texte, 1, 'UTF-8') as $caractere) {
        if ($morceau !== '' && strlen($morceau) + strlen($caractere) > OCTETS_PAR_MOT) {
            $mots[] = $morceau;
            $morceau = '';
        }
        $morceau .= $caractere;
    }
    $mots[] = $morceau;
    return implode(' ', array_map(static fn (string $m): string => '=?UTF-8?B?' . base64_encode($m) . '?=', $mots));
}

/**
 * Compose le courriel : To et From viennent de la configuration seule ; Reply-To est l'adresse validée ;
 * corps en texte brut UTF-8 (nom, e-mail, date de Paris, message), fins de ligne CRLF, encodé en base64.
 *
 * @param array{nom: string, email: string, message: string} $valeurs Valeurs validées (validerChamps).
 */
function construireCourriel(array $valeurs, array $config, DateTimeImmutable $maintenant): array
{
    $paris = $maintenant->setTimezone(new DateTimeZone('Europe/Paris'));
    $texte = "Nouveau message envoyé depuis le formulaire de contact du site.\n\n"
        . 'Nom : ' . nettoyerNom($valeurs['nom']) . "\n"
        . 'E-mail : ' . $valeurs['email'] . "\n"
        . 'Date : ' . $paris->format('d/m/Y') . ' à ' . $paris->format('H:i') . " (heure de Paris)\n\n"
        . "Message :\n\n"
        . nettoyerMessage($valeurs['message']) . "\n";

    return [
        'destinataire' => $config['destinataire'],
        'expediteur' => $config['expediteur'],
        'sujet' => construireSujet($valeurs['nom']),
        'entetes' => [
            'From' => NOM_EXPEDITEUR . ' <' . $config['expediteur'] . '>',
            'Reply-To' => $valeurs['email'],
            'MIME-Version' => '1.0',
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding' => 'base64',
        ],
        'corps' => chunk_split(base64_encode(str_replace("\n", "\r\n", $texte)), 76, "\r\n"),
    ];
}

/**
 * Vrai si le courriel peut partir : destinataire et expéditeur sûrs (emailValide), noms d'en-têtes simples,
 * aucune valeur (sujet, en-têtes) contenant CR, LF ou NUL. Dernière barrière avant mail().
 */
function courrielSur(array $courriel): bool
{
    foreach (['destinataire', 'expediteur'] as $cle) {
        if (!is_string($courriel[$cle] ?? null) || !emailValide($courriel[$cle])) {
            return false;
        }
    }
    if (!is_string($courriel['sujet'] ?? null) || !is_string($courriel['corps'] ?? null) || !is_array($courriel['entetes'] ?? null)) {
        return false;
    }
    $valeurs = [$courriel['sujet']];
    foreach ($courriel['entetes'] as $nom => $valeur) {
        if (!is_string($nom) || preg_match('/^[A-Za-z][A-Za-z-]*$/', $nom) !== 1 || !is_string($valeur)) {
            return false;
        }
        $valeurs[] = $valeur;
    }
    foreach ($valeurs as $valeur) {
        if (preg_match('/[\r\n\0]/', $valeur) === 1) {
            return false;
        }
    }
    return true;
}

/** Message brut (en-têtes To, Subject, puis les autres ; ligne vide ; corps), tel que remis à sendmail. */
function composerMessageBrut(array $courriel): string
{
    $lignes = ['To: ' . $courriel['destinataire'], 'Subject: ' . $courriel['sujet']];
    foreach ($courriel['entetes'] as $nom => $valeur) {
        $lignes[] = $nom . ': ' . $valeur;
    }
    return implode("\r\n", $lignes) . "\r\n\r\n" . $courriel['corps'];
}

/**
 * Transport réel : mail() de PHP, enveloppe (-f) = expéditeur de la configuration, vérifié juste avant
 * (courrielSur). En cas d'échec : faux, et un message générique dans le journal (aucune donnée saisie).
 *
 * @return Closure(array): bool
 */
function envoyeurMail(): Closure
{
    return static function (array $courriel): bool {
        if (!courrielSur($courriel)) {
            error_log("contact.php : courriel refusé avant l'envoi (adresse ou en-tête invalide).");
            return false;
        }
        try {
            $envoye = mail(
                $courriel['destinataire'],
                $courriel['sujet'],
                $courriel['corps'],
                $courriel['entetes'],
                '-f' . $courriel['expediteur'],
            );
        } catch (Throwable) {
            $envoye = false;
        }
        if (!$envoye) {
            error_log("contact.php : L'envoi du courriel a échoué.");
        }
        return $envoye;
    };
}

/**
 * Transport de TEST : écrit le message brut dans un nouveau fichier .eml (droits 0600) de `$dossier`.
 * N'est utilisé que si transportTestActif() ; jamais en production.
 *
 * @return Closure(array): bool
 */
function envoyeurFichier(string $dossier): Closure
{
    return static function (array $courriel) use ($dossier): bool {
        if (!courrielSur($courriel)) {
            return false;
        }
        $chemin = rtrim($dossier, '/') . '/message-' . bin2hex(random_bytes(8)) . '.eml';
        $fichier = @fopen($chemin, 'xb');
        if ($fichier === false) {
            return false;
        }
        chmod($chemin, 0600);
        $brut = composerMessageBrut($courriel);
        $ecrit = fwrite($fichier, $brut) === strlen($brut);
        fclose($fichier);
        return $ecrit;
    };
}

/**
 * Vrai seulement si config.php pose `transport_test => true` (vrai booléen) avec `dossier_transport_test`,
 * ET si la variable d'environnement MAIL_TRANSPORT vaut exactement « file ». config.sample.php le désactive.
 *
 * @param array<string, string> $env
 */
function transportTestActif(array $config, array $env): bool
{
    return ($config['transport_test'] ?? false) === true
        && ($env['MAIL_TRANSPORT'] ?? null) === 'file'
        && is_string($config['dossier_transport_test'] ?? null)
        && $config['dossier_transport_test'] !== '';
}

// ---------------------------------------------------------------------------------------------------------
// Limiteur
// ---------------------------------------------------------------------------------------------------------

/**
 * Limiteur sur fichier : au plus `$limite` envois acceptés par adresse IP sur une heure glissante.
 * Le fichier `fan2harmonie-limiteur.json` (droits 0600) de `$dossier` ne contient que des empreintes
 * HMAC-SHA256 des adresses (clé `$secret`) et des instants Unix ; les instants de plus d'une heure sont purgés
 * à chaque appel. Lecture-modification-écriture sous verrou exclusif (flock). Lève RuntimeException si le
 * fichier est inutilisable.
 *
 * @param (callable(): int)|null $horloge Instant courant (tests) ; time() par défaut.
 * @return Closure(string): array{autorise: bool, reessayer: int}
 */
function limiteurFichier(string $dossier, string $secret, int $limite, ?callable $horloge = null): Closure
{
    $horloge ??= static fn (): int => time();
    $chemin = rtrim($dossier, '/') . '/' . FICHIER_LIMITEUR;

    return static function (string $ip) use ($chemin, $secret, $limite, $horloge): array {
        $cle = hash_hmac('sha256', $ip, $secret);
        $maintenant = $horloge();
        $fichier = ouvrirPrive($chemin);
        try {
            if (!flock($fichier, LOCK_EX)) {
                throw new RuntimeException('verrou du limiteur impossible');
            }
            $lues = json_decode((string) stream_get_contents($fichier), true);
            $entrees = [];
            foreach (is_array($lues) ? $lues : [] as $empreinte => $instants) {
                $empreinte = (string) $empreinte;
                if (preg_match('/^[0-9a-f]{64}$/', $empreinte) !== 1 || !is_array($instants)) {
                    continue;
                }
                $recents = array_values(array_filter(
                    $instants,
                    static fn (mixed $t): bool => is_int($t) && $t > $maintenant - FENETRE_LIMITEUR,
                ));
                if ($recents !== []) {
                    $entrees[$empreinte] = $recents;
                }
            }

            $recents = $entrees[$cle] ?? [];
            if (count($recents) >= $limite) {
                $decision = ['autorise' => false, 'reessayer' => max(1, min($recents) + FENETRE_LIMITEUR - $maintenant)];
            } else {
                $recents[] = $maintenant;
                $entrees[$cle] = $recents;
                $decision = ['autorise' => true, 'reessayer' => 0];
            }

            $json = json_encode($entrees === [] ? new stdClass() : $entrees, JSON_THROW_ON_ERROR);
            if (!ftruncate($fichier, 0) || !rewind($fichier) || fwrite($fichier, $json) !== strlen($json) || !fflush($fichier)) {
                throw new RuntimeException('écriture du limiteur impossible');
            }
            return $decision;
        } finally {
            flock($fichier, LOCK_UN);
            fclose($fichier);
        }
    };
}

/**
 * Secret de l'empreinte des adresses IP : `secret_limiteur` de la configuration s'il est renseigné, sinon un
 * secret aléatoire de 32 octets créé une fois puis gardé dans `dossier_limiteur` (fichier 0600, sous verrou).
 */
function secretLimiteur(array $config): string
{
    $secret = $config['secret_limiteur'] ?? '';
    if (is_string($secret) && $secret !== '') {
        return $secret;
    }
    $chemin = rtrim(chaine($config['dossier_limiteur'] ?? null), '/') . '/' . FICHIER_SECRET;
    $fichier = ouvrirPrive($chemin);
    try {
        if (!flock($fichier, LOCK_EX)) {
            throw new RuntimeException('verrou du secret impossible');
        }
        $lu = trim((string) stream_get_contents($fichier));
        if (preg_match('/^[0-9a-f]{64}$/', $lu) === 1) {
            return $lu;
        }
        $nouveau = bin2hex(random_bytes(32));
        if (!ftruncate($fichier, 0) || !rewind($fichier) || fwrite($fichier, $nouveau . "\n") === false || !fflush($fichier)) {
            throw new RuntimeException('écriture du secret impossible');
        }
        return $nouveau;
    } finally {
        flock($fichier, LOCK_UN);
        fclose($fichier);
    }
}

/** Limiteur réel d'après la configuration (dossier, secret, limite par heure). */
function fabriquerLimiteur(array $config): Closure
{
    return limiteurFichier(chaine($config['dossier_limiteur'] ?? null), secretLimiteur($config), (int) ($config['limite_par_heure'] ?? 1));
}

/**
 * Ouvre (ou crée) un fichier en lecture-écriture, réservé au compte (masque 0077 à la création, puis 0600).
 *
 * @return resource
 */
function ouvrirPrive(string $chemin)
{
    $masque = umask(0077);
    try {
        $fichier = @fopen($chemin, 'c+b');
    } finally {
        umask($masque);
    }
    if ($fichier === false) {
        throw new RuntimeException('fichier inaccessible');
    }
    @chmod($chemin, 0600);
    return $fichier;
}

// ---------------------------------------------------------------------------------------------------------
// Réponse HTTP
// ---------------------------------------------------------------------------------------------------------

/**
 * Réponse HTTP d'un résultat : JSON (envoi en JavaScript) ou page HTML autonome (envoi sans JavaScript).
 * Toujours : Cache-Control: no-store et X-Content-Type-Options: nosniff ; plus les en-têtes du résultat.
 *
 * @return array{statut: int, entetes: array<string, string>, contenu: string}
 */
function rendreReponse(array $resultat, bool $json): array
{
    $entetes = ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff'];
    if ($json) {
        $entetes['Content-Type'] = 'application/json; charset=utf-8';
        $contenu = (string) json_encode($resultat['corps'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    } else {
        $entetes['Content-Type'] = 'text/html; charset=utf-8';
        $entetes['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
        $contenu = pageHtml($resultat);
    }
    foreach ($resultat['entetes'] ?? [] as $nom => $valeur) {
        $entetes[$nom] = $valeur;
    }
    return ['statut' => $resultat['statut'], 'entetes' => $entetes, 'contenu' => $contenu];
}

/** Échappement HTML de tout texte inséré dans la page. */
function html(string $texte): string
{
    return htmlspecialchars($texte, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Page HTML minimale en français, sans script, avec un lien « Retour au site ». */
function pageHtml(array $resultat): string
{
    $reussi = ($resultat['corps']['ok'] ?? false) === true;
    if ($reussi) {
        $titre = 'Message envoyé';
        $contenu = '<p>Merci, votre message est bien parti. Je vous répondrai dès que possible.</p>';
    } else {
        $titre = 'Message non envoyé';
        $elements = '';
        foreach ($resultat['corps']['errors'] ?? [] as $erreur) {
            if (is_array($erreur) && is_string($erreur['message'] ?? null)) {
                $elements .= '<li>' . html($erreur['message']) . "</li>\n";
            }
        }
        $contenu = "<p>Le message n’a pas pu être envoyé.</p>\n"
            . ($elements === '' ? '' : "<ul>\n{$elements}</ul>\n")
            . '<p>Revenez à la page précédente pour corriger et réessayer.</p>';
    }

    return "<!doctype html>\n"
        . "<html lang=\"fr\">\n"
        . "<head>\n"
        . "<meta charset=\"utf-8\">\n"
        . "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        . "<meta name=\"robots\" content=\"noindex\">\n"
        . '<title>' . html($titre) . " — Fan 2 Harmonie</title>\n"
        . "<style>body{margin:0;padding:2rem 1rem;background:#f8f3ea;color:#2b2b2b;font:1.0625rem/1.6 system-ui,sans-serif}"
        . "main{max-width:36rem;margin:0 auto}h1{color:#3f5a46;font-size:1.5rem}a{color:#3f5a46;font-weight:600}</style>\n"
        . "</head>\n"
        . "<body>\n"
        . "<main>\n"
        . '<h1>' . html($titre) . "</h1>\n"
        . $contenu . "\n"
        . "<p><a href=\"/\">Retour au site</a></p>\n"
        . "</main>\n"
        . "</body>\n"
        . "</html>\n";
}

/** Émet la réponse : statut, en-têtes (X-Powered-By retiré), contenu. Seule fonction qui écrit la sortie. */
function emettre(array $reponse): void
{
    if (!headers_sent()) {
        header_remove('X-Powered-By');
        http_response_code($reponse['statut']);
        foreach ($reponse['entetes'] as $nom => $valeur) {
            header($nom . ': ' . $valeur);
        }
    }
    echo $reponse['contenu'];
}
