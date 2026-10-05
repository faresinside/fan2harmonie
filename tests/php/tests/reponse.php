<?php

/**
 * Réponses (JSON ou page HTML sans JavaScript) et transports de courriel (vrai mail() et transport de test).
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\composerMessageBrut;
use function Fan2Harmonie\Contact\construireCourriel;
use function Fan2Harmonie\Contact\envoyeurFichier;
use function Fan2Harmonie\Contact\rendreReponse;
use function Fan2Harmonie\Contact\transportTestActif;

const ENTETES_COMMUNS = ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff'];

// ---------- JSON ----------

test('réponse JSON : succès 200, en-têtes no-store, nosniff, JSON UTF-8', function (): void {
    [$r] = traiter();
    $reponse = rendreReponse($r, true);
    egal(200, $reponse['statut']);
    egal(ENTETES_COMMUNS + ['Content-Type' => 'application/json; charset=utf-8'], $reponse['entetes']);
    egal('{"ok":true}', $reponse['contenu']);
});

test('réponse JSON : 422 avec la liste des erreurs, en français', function (): void {
    [$r] = traiter(['email' => 'x']);
    $reponse = rendreReponse($r, true);
    egal(422, $reponse['statut']);
    egal('{"ok":false,"errors":[{"field":"email","message":"Adresse e-mail invalide."}]}', $reponse['contenu']);
});

test('réponse JSON : 405 et 429 gardent Allow et Retry-After', function (): void {
    [$r] = traiter([], ['REQUEST_METHOD' => 'GET']);
    $reponse = rendreReponse($r, true);
    egal(405, $reponse['statut']);
    egal('POST', $reponse['entetes']['Allow']);
    egal('no-store', $reponse['entetes']['Cache-Control']);
    egal(['ok' => false, 'errors' => [['message' => 'Méthode non autorisée.']]], json_decode($reponse['contenu'], true));

    [$r] = traiter([], [], null, null, new LimiteurFaux(false, 60));
    $reponse = rendreReponse($r, true);
    egal(429, $reponse['statut']);
    egal('60', $reponse['entetes']['Retry-After']);
});

// ---------- Page HTML (envoi sans JavaScript) ----------

test('page HTML de succès : autonome, en français, sans script, lien « Retour au site »', function (): void {
    [$r] = traiter([], ['HTTP_ACCEPT' => 'text/html']);
    $reponse = rendreReponse($r, false);
    egal(200, $reponse['statut']);
    egal('text/html; charset=utf-8', $reponse['entetes']['Content-Type']);
    egal('no-store', $reponse['entetes']['Cache-Control']);
    egal('nosniff', $reponse['entetes']['X-Content-Type-Options']);
    contient("default-src 'none'", $reponse['entetes']['Content-Security-Policy'] ?? '');
    $html = $reponse['contenu'];
    vrai(str_starts_with($html, "<!doctype html>\n"), 'doctype');
    contient('<html lang="fr">', $html);
    contient('<meta charset="utf-8">', $html);
    contient('<meta name="robots" content="noindex">', $html);
    contient('Merci, votre message est bien parti.', $html);
    contient('<a href="/">Retour au site</a>', $html);
    absent('<script', strtolower($html));
    absent(' on', preg_replace('/>[^<]*</', '><', $html), 'aucun attribut d’événement');
});

test('page HTML d’erreur 422 : un message par champ', function (): void {
    [$r] = traiter(['nom' => '', 'consentement' => 'non']);
    $reponse = rendreReponse($r, false);
    egal(422, $reponse['statut']);
    $html = $reponse['contenu'];
    contient('Le message n’a pas pu être envoyé.', $html);
    contient('<li>Indiquez votre nom.</li>', $html);
    contient('<li>Cochez la case de consentement pour pouvoir envoyer votre message.</li>', $html);
    contient('<a href="/">Retour au site</a>', $html);
});

test('page HTML : tout texte est échappé (htmlspecialchars, ENT_QUOTES)', function (): void {
    $resultat = [
        'statut' => 422,
        'corps' => ['ok' => false, 'errors' => [['field' => 'nom', 'message' => '<script>alert("x")</script> & \'y\''], ['message' => "\xC3\x28"]]],
        'envoye' => false,
        'entetes' => [],
    ];
    $html = rendreReponse($resultat, false)['contenu'];
    contient('<li>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#039;y&#039;</li>', $html);
    absent('<script', $html);
    contient("<li>\u{FFFD}(</li>", $html, 'UTF-8 invalide remplacé (ENT_SUBSTITUTE)');
});

test('page HTML pour 403, 405, 413, 429 et 500 : statut gardé, message lisible', function (): void {
    foreach ([
        [traiter([], ['HTTP_ORIGIN' => 'https://evil.example'])[0], 403, 'Origine de la requête refusée.'],
        [traiter([], ['REQUEST_METHOD' => 'GET'])[0], 405, 'Méthode non autorisée.'],
        [traiter([], ['CONTENT_LENGTH' => '999999'])[0], 413, 'Requête trop volumineuse.'],
        [traiter([], [], null, null, new LimiteurFaux(false, 30))[0], 429, 'Trop de messages envoyés. Réessayez plus tard.'],
        [traiter([], [], null, new Facteur(false))[0], 500, 'L&#039;envoi a échoué.'],
    ] as [$resultat, $statut, $texte]) {
        $reponse = rendreReponse($resultat, false);
        egal($statut, $reponse['statut']);
        contient("<li>{$texte}</li>", $reponse['contenu']);
        egal('text/html; charset=utf-8', $reponse['entetes']['Content-Type']);
    }
});

// ---------- Transports ----------

test('transport de test : actif seulement avec transport_test === true ET MAIL_TRANSPORT=file', function (): void {
    $dossier = ['dossier_transport_test' => sys_get_temp_dir()];
    egal(true, transportTestActif(['transport_test' => true] + $dossier, ['MAIL_TRANSPORT' => 'file']));
    egal(false, transportTestActif(['transport_test' => true] + $dossier, []), 'variable d’environnement absente');
    egal(false, transportTestActif(['transport_test' => true] + $dossier, ['MAIL_TRANSPORT' => 'FILE']));
    egal(false, transportTestActif(['transport_test' => false] + $dossier, ['MAIL_TRANSPORT' => 'file']), 'production');
    egal(false, transportTestActif($dossier, ['MAIL_TRANSPORT' => 'file']), 'clé absente');
    egal(false, transportTestActif(['transport_test' => 1] + $dossier, ['MAIL_TRANSPORT' => 'file']), 'pas un vrai booléen');
    egal(false, transportTestActif(['transport_test' => 'true'] + $dossier, ['MAIL_TRANSPORT' => 'file']));
    egal(false, transportTestActif(['transport_test' => true], ['MAIL_TRANSPORT' => 'file']), 'sans dossier');
});

test('transport de test : écrit le message brut (en-têtes + corps) dans un fichier 0600', function (): void {
    $dossier = dossierTemporaire();
    $courriel = construireCourriel(['nom' => 'Zoé', 'email' => 'zoe@example.org', 'message' => 'Bonjour 🌸'], configTest(), instantTest());
    egal(true, envoyeurFichier($dossier)($courriel));
    $fichiers = glob($dossier . '/*.eml') ?: [];
    egal(1, count($fichiers));
    egal('0600', substr(sprintf('%o', fileperms($fichiers[0])), -4));
    $brut = (string) file_get_contents($fichiers[0]);
    egal(composerMessageBrut($courriel), $brut);
    vrai(str_starts_with($brut, "To: contact@fan2harmonie.fr\r\nSubject: =?UTF-8?B?"), 'début du message brut');
    contient("\r\nFrom: Site Fan 2 Harmonie <site@fan2harmonie.fr>\r\nReply-To: zoe@example.org\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n", $brut);
});

/**
 * Lance la vraie fonction mail() (via envoyeurMail) dans un processus PHP séparé dont le sendmail_path est un
 * faux sendmail qui recopie ses arguments et le message reçu.
 * @return array{code: int, arguments: ?string, message: ?string, erreurs: string}
 */
function envoyerAvecFauxSendmail(array $courriel, int $codeSendmail = 0): array
{
    $dossier = dossierTemporaire();
    $faux = $dossier . '/faux-sendmail.sh';
    file_put_contents($faux, "#!/bin/sh\nprintf '%s\\n' \"\$@\" > '{$dossier}/arguments'\ncat > '{$dossier}/message'\nexit {$codeSendmail}\n");
    chmod($faux, 0700);
    file_put_contents($dossier . '/courriel.json', json_encode($courriel, JSON_THROW_ON_ERROR));
    $script = 'require ' . var_export(BIBLIOTHEQUE, true) . ';'
        . '$c = json_decode(file_get_contents(' . var_export($dossier . '/courriel.json', true) . '), true);'
        . 'exit(Fan2Harmonie\Contact\envoyeurMail()($c) ? 0 : 3);';
    $commande = [PHP_BINARY, '-d', 'sendmail_path=' . $faux, '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=', '-r', $script];
    $processus = proc_open($commande, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubes);
    $sortie = stream_get_contents($tubes[1]);
    $erreurs = stream_get_contents($tubes[2]);
    fclose($tubes[1]);
    fclose($tubes[2]);
    $code = proc_close($processus);
    $lire = static fn (string $f): ?string => is_file("{$dossier}/{$f}") ? (string) file_get_contents("{$dossier}/{$f}") : null;
    return ['code' => $code, 'arguments' => $lire('arguments'), 'message' => $lire('message'), 'erreurs' => $sortie . $erreurs];
}

test('vrai mail() : -f avec l’expéditeur validé, en-têtes et corps transmis à sendmail', function (): void {
    $courriel = construireCourriel(['nom' => 'Camille', 'email' => 'camille@example.org', 'message' => 'Bonjour'], configTest(), instantTest());
    $r = envoyerAvecFauxSendmail($courriel);
    egal(0, $r['code'], 'envoi réussi : ' . $r['erreurs']);
    vrai($r['arguments'] !== null, 'faux sendmail appelé');
    egal(['-fsite@fan2harmonie.fr'], array_values(array_filter(explode("\n", (string) $r['arguments']), static fn ($a) => str_starts_with($a, '-f'))));
    $message = (string) $r['message'];
    contient('To: contact@fan2harmonie.fr', $message);
    contient('Subject: =?UTF-8?B?', $message);
    contient('Reply-To: camille@example.org', $message);
    contient('From: Site Fan 2 Harmonie <site@fan2harmonie.fr>', $message);
    contient('Content-Type: text/plain; charset=UTF-8', $message);
});

test('vrai mail() : expéditeur douteux → aucun appel à sendmail ; échec de sendmail → faux, journal sans donnée personnelle', function (): void {
    $courriel = construireCourriel(['nom' => 'Camille', 'email' => 'camille@example.org', 'message' => 'Bonjour'], configTest(), instantTest());
    $douteux = $courriel;
    $douteux['expediteur'] = '-X/tmp/journal site@fan2harmonie.fr';
    $r = envoyerAvecFauxSendmail($douteux);
    egal(3, $r['code']);
    egal(null, $r['arguments'], 'sendmail ne doit pas être appelé');

    $entetePiege = $courriel;
    $entetePiege['entetes']['Reply-To'] = "camille@example.org\r\nBcc: victime@example.org";
    $r = envoyerAvecFauxSendmail($entetePiege);
    egal(3, $r['code'], 'en-tête avec retour à la ligne refusé');
    egal(null, $r['arguments']);

    $r = envoyerAvecFauxSendmail($courriel, 1);
    egal(3, $r['code']);
    contient("L'envoi du courriel a échoué", $r['erreurs'], 'message générique dans le journal');
    absent('camille', strtolower($r['erreurs']));
    absent('Bonjour', $r['erreurs']);
});
