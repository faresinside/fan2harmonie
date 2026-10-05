<?php

/**
 * Outils communs aux tests PHP : requête, configuration et facteur (envoi de courriel) de test.
 * Chargé en premier par tests/php/run.php (ordre alphabétique).
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\traiterContact;

/** Configuration valide ; `$remplacement` écrase des clés. */
function configTest(array $remplacement = []): array
{
    return array_replace([
        'destinataire' => 'contact@fan2harmonie.fr',
        'expediteur' => 'site@fan2harmonie.fr',
        'origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'],
        'limite_par_heure' => 5,
        'dossier_limiteur' => sys_get_temp_dir(),
        'secret_limiteur' => str_repeat('0123456789abcdef', 4),
        'taille_max_message' => 5000,
        'transport_test' => false,
    ], $remplacement);
}

/** Contexte $_SERVER d'un envoi valide depuis le site en JavaScript. */
function serveurTest(array $remplacement = []): array
{
    return array_replace([
        'REQUEST_METHOD' => 'POST',
        'HTTP_ORIGIN' => 'https://fan2harmonie.fr',
        'HTTP_ACCEPT' => 'application/json',
        'CONTENT_LENGTH' => '420',
        'REMOTE_ADDR' => '203.0.113.7',
    ], $remplacement);
}

/** Champs ($_POST) d'un envoi valide, tels que le formulaire du site les envoie. */
function postTest(array $remplacement = []): array
{
    return array_replace([
        'nom' => 'Camille Martin',
        'email' => 'camille@example.org',
        'message' => "Bonjour,\r\nla séance de samedi est-elle maintenue ?",
        'consentement' => 'oui',
        '_gotcha' => '',
        '_subject' => 'Message depuis le site Fan 2 Harmonie',
    ], $remplacement);
}

/** Retire des clés d'un tableau. */
function sans(array $tableau, string ...$cles): array
{
    return array_diff_key($tableau, array_flip($cles));
}

/** Faux facteur : garde chaque courriel « envoyé ». */
final class Facteur
{
    /** @var list<array<string, mixed>> */
    public array $envois = [];

    public function __construct(public bool $reussite = true)
    {
    }

    public function __invoke(array $courriel): bool
    {
        $this->envois[] = $courriel;
        return $this->reussite;
    }
}

/** Faux limiteur : décision fixée à l'avance, appels notés. */
final class LimiteurFaux
{
    /** @var list<string> */
    public array $appels = [];

    public function __construct(public bool $autorise = true, public int $reessayer = 0, public bool $panne = false)
    {
    }

    public function __invoke(string $cle): array
    {
        $this->appels[] = $cle;
        if ($this->panne) {
            throw new RuntimeException('stockage indisponible');
        }
        return ['autorise' => $this->autorise, 'reessayer' => $this->reessayer];
    }
}

/** Instant fixe des tests : 5 octobre 2026, 12 h 34 UTC (14 h 34 à Paris). */
function instantTest(): DateTimeImmutable
{
    return new DateTimeImmutable('2026-10-05T12:34:00Z');
}

/**
 * Lance traiterContact avec les valeurs de test.
 * @return array{0: array, 1: Facteur, 2: LimiteurFaux}
 */
function traiter(
    array $post = [],
    array $serveur = [],
    ?array $config = null,
    ?Facteur $facteur = null,
    ?LimiteurFaux $limiteur = null,
    bool $sansConfig = false,
): array {
    $facteur ??= new Facteur();
    $limiteur ??= new LimiteurFaux();
    $resultat = traiterContact(
        postTest($post),
        serveurTest($serveur),
        $sansConfig ? null : ($config ?? configTest()),
        $facteur,
        $limiteur,
        instantTest(),
    );
    return [$resultat, $facteur, $limiteur];
}

/** Décode un sujet fait de mots encodés RFC 2047 (=?UTF-8?B?…?=) séparés par une espace. */
function decoderSujet(string $sujet): string
{
    $texte = '';
    foreach (explode(' ', $sujet) as $mot) {
        if (preg_match('/^=\?UTF-8\?B\?([A-Za-z0-9+\/=]+)\?=$/', $mot, $m) !== 1) {
            throw new EchecTest('mot encodé invalide dans le sujet : ' . montrer($mot));
        }
        $texte .= base64_decode($m[1], true);
    }
    return $texte;
}

/** Corps décodé (base64) d'un courriel composé par la bibliothèque. */
function decoderCorps(string $corps): string
{
    $decode = base64_decode(str_replace("\r\n", '', $corps), true);
    vrai($decode !== false, 'corps base64 illisible');
    return $decode;
}

/** Vérifie qu'un courriel ne porte que les en-têtes attendus, sans retour à la ligne nulle part. */
function verifierEntetesSurs(array $courriel): void
{
    egal(['From', 'Reply-To', 'MIME-Version', 'Content-Type', 'Content-Transfer-Encoding'], array_keys($courriel['entetes']), 'en-têtes');
    foreach ($courriel['entetes'] as $nom => $valeur) {
        vrai(preg_match('/[\r\n\0]/', $valeur) === 0, "retour à la ligne ou NUL dans l'en-tête {$nom}");
    }
    vrai(preg_match('/[\r\n\0]/', $courriel['sujet']) === 0, 'retour à la ligne ou NUL dans le sujet');
    vrai(preg_match('/[\r\n\0]/', $courriel['destinataire']) === 0, 'retour à la ligne dans le destinataire');
}
