<?php

/**
 * traiterContact : méthode, origine, taille, champs, piège, injection d'en-têtes, limiteur, envoi, configuration.
 */

declare(strict_types=1);

use function Fan2Harmonie\Contact\chargerConfig;
use function Fan2Harmonie\Contact\composerMessageBrut;
use function Fan2Harmonie\Contact\configValide;
use function Fan2Harmonie\Contact\construireSujet;
use function Fan2Harmonie\Contact\emailValide;
use function Fan2Harmonie\Contact\veutJson;

// ---------- Envoi valide ----------

test('envoi valide : 200 {ok:true}, un seul courriel, aux bons destinataire et expéditeur', function (): void {
    [$r, $facteur, $limiteur] = traiter();
    egal(200, $r['statut']);
    egal(['ok' => true], $r['corps']);
    egal(true, $r['envoye']);
    egal(1, count($facteur->envois));
    $c = $facteur->envois[0];
    egal('contact@fan2harmonie.fr', $c['destinataire']);
    egal('site@fan2harmonie.fr', $c['expediteur']);
    egal(['203.0.113.7'], $limiteur->appels, 'le limiteur reçoit REMOTE_ADDR');
});

test('envoi valide : en-têtes exacts (From et To de la configuration, Reply-To = adresse validée)', function (): void {
    [, $facteur] = traiter();
    $c = $facteur->envois[0];
    egal([
        'From' => 'Site Fan 2 Harmonie <site@fan2harmonie.fr>',
        'Reply-To' => 'camille@example.org',
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'base64',
    ], $c['entetes']);
    verifierEntetesSurs($c);
});

test('envoi valide : sujet fixe + nom, encodé RFC 2047 (mots de 75 caractères au plus)', function (): void {
    [, $facteur] = traiter(['nom' => 'Héloïse Dupré']);
    $sujet = $facteur->envois[0]['sujet'];
    egal('[Site Fan 2 Harmonie] Message de Héloïse Dupré', decoderSujet($sujet));
    foreach (explode(' ', $sujet) as $mot) {
        vrai(strlen($mot) <= 75, 'mot encodé trop long : ' . strlen($mot));
    }
    egal(1, preg_match('/^[\x21-\x7E ]+$/', $sujet), 'sujet en ASCII imprimable seulement');
});

test('envoi valide : corps texte UTF-8 (nom, e-mail, date de Paris, message), sans HTML, fins de ligne CRLF', function (): void {
    [, $facteur] = traiter(['message' => "Bonjour,\nligne deux\rligne trois\r\nfin"]);
    $c = $facteur->envois[0];
    foreach (explode("\r\n", rtrim($c['corps'], "\r\n")) as $ligne) {
        vrai(strlen($ligne) <= 76, 'ligne base64 trop longue');
    }
    $texte = decoderCorps($c['corps']);
    egal(true, mb_check_encoding($texte, 'UTF-8'), 'UTF-8 valide');
    contient("Nom : Camille Martin\r\n", $texte);
    contient("E-mail : camille@example.org\r\n", $texte);
    contient("Date : 05/10/2026 à 14:34 (heure de Paris)\r\n", $texte);
    contient("Bonjour,\r\nligne deux\r\nligne trois\r\nfin", $texte);
    egal(0, preg_match('/(?<!\r)\n|\r(?!\n)/', $texte), 'aucune fin de ligne isolée');
    absent('<', $texte, 'pas de HTML');
});

test('_subject envoyé par le client : ignoré', function (): void {
    [, $facteur] = traiter(['_subject' => "Pirate\r\nBcc: victime@example.org"]);
    egal('[Site Fan 2 Harmonie] Message de Camille Martin', decoderSujet($facteur->envois[0]['sujet']));
    verifierEntetesSurs($facteur->envois[0]);
});

test('caractères variés (accents, emoji, texte de droite à gauche) : conservés dans le sujet et le corps', function (): void {
    $nom = 'Zoé 🌸 مريم';
    $message = "Salut 👋🏽 — شكرا\nÇa va ? 漢字";
    [$r, $facteur] = traiter(['nom' => $nom, 'message' => $message]);
    egal(200, $r['statut']);
    egal('[Site Fan 2 Harmonie] Message de ' . $nom, decoderSujet($facteur->envois[0]['sujet']));
    $texte = decoderCorps($facteur->envois[0]['corps']);
    contient("Nom : {$nom}", $texte);
    contient("Salut 👋🏽 — شكرا\r\nÇa va ? 漢字", $texte);
});

// ---------- Injection d'en-têtes ----------

test('injection par le nom (x\\r\\nBcc: …) : aucun en-tête ajouté, aucun retour à la ligne dans le sujet', function (): void {
    foreach (["x\r\nBcc: a@b.c", "x\nBcc: a@b.c", "x\rBcc: a@b.c", "x\0Bcc: a@b.c", "x%0d%0aBcc: a@b.c"] as $nom) {
        [$r, $facteur] = traiter(['nom' => $nom]);
        egal(200, $r['statut'], montrer($nom));
        $c = $facteur->envois[0];
        verifierEntetesSurs($c);
        $sujet = decoderSujet($c['sujet']);
        egal(0, preg_match('/[\x00-\x1F\x7F]/', $sujet), 'caractère de contrôle dans le sujet décodé');
        $brut = composerMessageBrut($c);
        [$entetes] = explode("\r\n\r\n", $brut, 2);
        foreach (explode("\r\n", $entetes) as $ligne) {
            egal(1, preg_match('/^(To|Subject|From|Reply-To|MIME-Version|Content-Type|Content-Transfer-Encoding): /', $ligne), 'ligne d’en-tête inattendue : ' . montrer($ligne));
        }
        absent("\nBcc:", $brut);
    }
});

test('nom avec tabulation, DEL, séparateurs de ligne Unicode et contrôles bidirectionnels : retirés du sujet', function (): void {
    [, $facteur] = traiter(['nom' => "A\tB\x7FC\u{2028}D\u{2029}E\u{202E}F\u{2066}G"]);
    $sujet = decoderSujet($facteur->envois[0]['sujet']);
    egal('[Site Fan 2 Harmonie] Message de A B C D EFG', $sujet);
});

test('injection par l’adresse e-mail : refusée (422), aucun courriel', function (): void {
    foreach ([
        "a@b.fr\r\nBcc: victime@example.org",
        "a@b.fr\nBcc: victime@example.org",
        "a@b.fr\0",
        'a@b.fr,victime@example.org',
        'a@b.fr;victime@example.org',
        '<a@b.fr>',
        'Nom <a@b.fr>',
        '"a b"@example.org',
        'a\\b@example.org',
        'a(commentaire)@example.org',
    ] as $email) {
        [$r, $facteur] = traiter(['email' => $email]);
        egal(422, $r['statut'], montrer($email));
        egal([['field' => 'email', 'message' => 'Adresse e-mail invalide.']], $r['corps']['errors']);
        egal([], $facteur->envois);
    }
});

test('message contenant \\r\\n.\\r\\n : corps encodé, aucune ligne « . » dans le message brut', function (): void {
    [$r, $facteur] = traiter(['message' => "début\r\n.\r\nBcc: x@y.z\r\n\r\nfin"]);
    egal(200, $r['statut']);
    $brut = composerMessageBrut($facteur->envois[0]);
    foreach (explode("\r\n", $brut) as $ligne) {
        vrai($ligne !== '.', 'ligne « . » isolée dans le message brut');
        vrai(!str_starts_with($ligne, 'Bcc:'), 'ligne Bcc dans le message brut');
    }
    contient("début\r\n.\r\nBcc: x@y.z\r\n\r\nfin", decoderCorps($facteur->envois[0]['corps']), 'le texte reste intact une fois décodé');
});

test('octets NUL et caractères de contrôle du message : retirés du corps (tabulations et retours conservés)', function (): void {
    [, $facteur] = traiter(['message' => "a\0b\x07c\td\ne"]);
    contient("abc\td\r\ne", decoderCorps($facteur->envois[0]['corps']));
});

// ---------- Validation des champs ----------

$cas422 = [
    'nom vide' => [['nom' => ''], 'nom', 'Indiquez votre nom.'],
    'nom fait d’espaces' => [['nom' => "  \t "], 'nom', 'Indiquez votre nom.'],
    'nom de 101 caractères' => [['nom' => str_repeat('é', 101)], 'nom', 'Votre nom est trop long (100 caractères au maximum).'],
    'nom très long (20 000 caractères, sous le plafond de la requête)' => [['nom' => str_repeat('x', 20000)],'nom', 'Votre nom est trop long (100 caractères au maximum).'],
    'nom en tableau' => [['nom' => ['a', 'b']], 'nom', 'Indiquez votre nom.'],
    'nom absent' => [['nom' => null], 'nom', 'Indiquez votre nom.'],
    'nom en UTF-8 invalide' => [['nom' => "Cam\xC3\x28ille"], 'nom', 'Indiquez votre nom.'],
    'e-mail vide' => [['email' => ''], 'email', 'Adresse e-mail invalide.'],
    'e-mail sans @' => [['email' => 'pas-une-adresse'], 'email', 'Adresse e-mail invalide.'],
    'e-mail sans domaine' => [['email' => 'camille@'], 'email', 'Adresse e-mail invalide.'],
    'e-mail de 255 caractères' => [['email' => str_repeat('a', 64) . '@' . str_repeat('b', 63) . '.' . str_repeat('c', 63) . '.' . str_repeat('d', 59) . '.fr'], 'email', 'Adresse e-mail invalide.'],
    'e-mail en tableau' => [['email' => ['a@b.fr']], 'email', 'Adresse e-mail invalide.'],
    'message vide' => [['message' => " \r\n "], 'message', 'Écrivez votre message.'],
    'message de 5001 caractères' => [['message' => str_repeat('🌸', 5001)], 'message', 'Votre message est trop long (5000 caractères au maximum).'],
    'message en tableau' => [['message' => ['x']], 'message', 'Écrivez votre message.'],
    'consentement absent' => [['consentement' => null], 'consentement', 'Cochez la case de consentement pour pouvoir envoyer votre message.'],
    'consentement « non »' => [['consentement' => 'non'], 'consentement', 'Cochez la case de consentement pour pouvoir envoyer votre message.'],
    'consentement « on »' => [['consentement' => 'on'], 'consentement', 'Cochez la case de consentement pour pouvoir envoyer votre message.'],
];
foreach ($cas422 as $cas => [$champs, $champ, $texte]) {
    test("422 : {$cas}", function () use ($champs, $champ, $texte): void {
        $post = array_filter(postTest($champs), static fn ($v) => $v !== null);
        [$r, $facteur, $limiteur] = [null, new Facteur(), new LimiteurFaux()];
        $r = Fan2Harmonie\Contact\traiterContact($post, serveurTest(), configTest(), $facteur, $limiteur, instantTest());
        egal(422, $r['statut']);
        egal(['ok' => false, 'errors' => [['field' => $champ, 'message' => $texte]]], $r['corps']);
        egal(false, $r['envoye']);
        egal([], $facteur->envois, 'aucun courriel');
        egal([], $limiteur->appels, 'un envoi refusé ne compte pas dans la limite');
    });
}

test('422 : tous les champs invalides, une erreur par champ, dans l’ordre du formulaire, sans écho de la saisie', function (): void {
    [$r] = traiter(['nom' => '', 'email' => '<script>@x', 'message' => '', 'consentement' => 'peut-être']);
    egal(422, $r['statut']);
    egal(['nom', 'email', 'message', 'consentement'], array_column($r['corps']['errors'], 'field'));
    $json = json_encode($r['corps'], JSON_UNESCAPED_UNICODE);
    absent('script', $json);
    absent('peut-être', $json);
});

test('limites exactes : nom de 100 caractères multioctets et message de 5000 emoji acceptés', function (): void {
    [$r, $facteur] = traiter(['nom' => str_repeat('é', 100), 'message' => str_repeat('🌸', 5000)]);
    egal(200, $r['statut']);
    egal(1, count($facteur->envois));
});

test('taille maximale du message : celle de la configuration', function (): void {
    [$r] = traiter(['message' => str_repeat('a', 11)], [], configTest(['taille_max_message' => 10]));
    egal(422, $r['statut']);
    egal('Votre message est trop long (10 caractères au maximum).', $r['corps']['errors'][0]['message']);
    [$r] = traiter(['message' => str_repeat('a', 10)], [], configTest(['taille_max_message' => 10]));
    egal(200, $r['statut']);
});

test('le message compte un saut de ligne CRLF pour un seul caractère (comme le navigateur)', function (): void {
    [$r] = traiter(['message' => str_repeat("a\r\n", 3) . 'a'], [], configTest(['taille_max_message' => 7]));
    egal(200, $r['statut']);
});

// ---------- Champ piège ----------

test('champ piège rempli : 200 {ok:true} sans courriel ni décompte (le robot n’apprend rien)', function (): void {
    [$r, $facteur, $limiteur] = traiter(['_gotcha' => 'https://spam.example']);
    egal(200, $r['statut']);
    egal(['ok' => true], $r['corps']);
    egal(false, $r['envoye']);
    egal([], $facteur->envois);
    egal([], $limiteur->appels);
});

test('champ piège rempli avec des champs invalides : toujours 200 {ok:true}', function (): void {
    [$r, $facteur] = traiter(['_gotcha' => 'x', 'email' => 'nimporte', 'consentement' => null]);
    egal(200, $r['statut']);
    egal(['ok' => true], $r['corps']);
    egal([], $facteur->envois);
});

test('champ piège en tableau : traité comme rempli', function (): void {
    [$r, $facteur] = traiter(['_gotcha' => ['x']]);
    egal(200, $r['statut']);
    egal([], $facteur->envois);
});

// ---------- Méthode, origine, taille ----------

test('méthode autre que POST : 405 avec Allow: POST, corps JSON, aucun courriel', function (): void {
    foreach (['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'post'] as $methode) {
        [$r, $facteur] = traiter([], ['REQUEST_METHOD' => $methode]);
        egal(405, $r['statut'], $methode);
        egal('POST', $r['entetes']['Allow'] ?? null);
        egal(false, $r['corps']['ok']);
        egal([], $facteur->envois);
    }
});

test('origine refusée : 403, aucun courriel', function (): void {
    foreach ([
        'https://evil.example',
        'https://fan2harmonie.fr.evil.example',
        'https://evilfan2harmonie.fr',
        'http://fan2harmonie.fr',
        'https://fan2harmonie.fr:8443',
        'null',
        '',
        'fan2harmonie.fr',
        "https://fan2harmonie.fr\r\nX: y",
    ] as $origine) {
        [$r, $facteur] = traiter([], ['HTTP_ORIGIN' => $origine]);
        egal(403, $r['statut'], montrer($origine));
        egal(['ok' => false, 'errors' => [['message' => 'Origine de la requête refusée.']]], $r['corps']);
        egal([], $facteur->envois);
    }
});

test('origine acceptée : www, majuscules, port 443 explicite', function (): void {
    foreach (['https://www.fan2harmonie.fr', 'HTTPS://FAN2HARMONIE.FR', 'https://fan2harmonie.fr:443'] as $origine) {
        [$r] = traiter([], ['HTTP_ORIGIN' => $origine]);
        egal(200, $r['statut'], $origine);
    }
});

test('sans Origin : le Referer décide ; ni l’un ni l’autre : 403', function (): void {
    $sansOrigine = sans(serveurTest(), 'HTTP_ORIGIN');
    $cas = [
        ['https://www.fan2harmonie.fr/#contact', 200],
        ['https://fan2harmonie.fr/mentions-legales/?a=b', 200],
        ['https://evil.example/https://fan2harmonie.fr/', 403],
        ['https://fan2harmonie.fr@evil.example/', 403],
        ['/relatif', 403],
    ];
    foreach ($cas as [$referent, $statut]) {
        $r = Fan2Harmonie\Contact\traiterContact(postTest(), $sansOrigine + ['HTTP_REFERER' => $referent], configTest(), new Facteur(), new LimiteurFaux(), instantTest());
        egal($statut, $r['statut'], $referent);
    }
    $r = Fan2Harmonie\Contact\traiterContact(postTest(), $sansOrigine, configTest(), new Facteur(), new LimiteurFaux(), instantTest());
    egal(403, $r['statut']);
});

test('Origin présent mais refusé : un Referer correct ne le rattrape pas', function (): void {
    [$r] = traiter([], ['HTTP_ORIGIN' => 'https://evil.example', 'HTTP_REFERER' => 'https://fan2harmonie.fr/']);
    egal(403, $r['statut']);
});

test('requête de plus de 20 Ko (Content-Length) : 413 ; 20 Ko pile : acceptée', function (): void {
    [$r, $facteur] = traiter([], ['CONTENT_LENGTH' => '20481']);
    egal(413, $r['statut']);
    egal(['ok' => false, 'errors' => [['message' => 'Requête trop volumineuse.']]], $r['corps']);
    egal([], $facteur->envois);
    [$r] = traiter([], ['CONTENT_LENGTH' => '20480']);
    egal(200, $r['statut']);
});

test('sans Content-Length lisible : la taille des champs reçus est plafonnée à 20 Ko', function (): void {
    foreach ([null, '', 'abc', '-5'] as $longueur) {
        $serveur = $longueur === null ? sans(serveurTest(), 'CONTENT_LENGTH') : serveurTest(['CONTENT_LENGTH' => $longueur]);
        $r = Fan2Harmonie\Contact\traiterContact(postTest(['_autre' => str_repeat('x', 21000)]), $serveur, configTest(), new Facteur(), new LimiteurFaux(), instantTest());
        egal(413, $r['statut'], montrer($longueur));
        $r = Fan2Harmonie\Contact\traiterContact(postTest(), $serveur, configTest(), new Facteur(), new LimiteurFaux(), instantTest());
        egal(200, $r['statut'], montrer($longueur));
    }
});

// ---------- Limiteur ----------

test('limite atteinte : 429 avec Retry-After, aucun courriel', function (): void {
    [$r, $facteur] = traiter([], [], null, null, new LimiteurFaux(false, 1200));
    egal(429, $r['statut']);
    egal('1200', $r['entetes']['Retry-After'] ?? null);
    egal(['ok' => false, 'errors' => [['message' => 'Trop de messages envoyés. Réessayez plus tard.']]], $r['corps']);
    egal([], $facteur->envois);
});

test('limiteur : seule REMOTE_ADDR compte (X-Forwarded-For ignoré)', function (): void {
    [, , $limiteur] = traiter([], ['HTTP_X_FORWARDED_FOR' => '198.51.100.1', 'HTTP_X_REAL_IP' => '198.51.100.2']);
    egal(['203.0.113.7'], $limiteur->appels);
});

test('limiteur en panne : 500, aucun courriel', function (): void {
    [$r, $facteur] = traiter([], [], null, null, new LimiteurFaux(panne: true));
    egal(500, $r['statut']);
    egal(['ok' => false, 'errors' => [['message' => 'Service momentanément indisponible.']]], $r['corps']);
    egal([], $facteur->envois);
});

// ---------- Envoi et configuration ----------

test('échec de l’envoi : 500 « L’envoi a échoué. »', function (): void {
    [$r, $facteur] = traiter([], [], null, new Facteur(false));
    egal(500, $r['statut']);
    egal(['ok' => false, 'errors' => [['message' => "L'envoi a échoué."]]], $r['corps']);
    egal(false, $r['envoye']);
    egal(1, count($facteur->envois));
});

test('configuration absente : 500 « Configuration manquante », rien d’autre n’est tenté', function (): void {
    [$r, $facteur, $limiteur] = traiter([], [], null, null, null, true);
    egal(500, $r['statut']);
    egal(['ok' => false, 'errors' => [['message' => 'Configuration manquante']]], $r['corps']);
    egal([], $facteur->envois);
    egal([], $limiteur->appels);
});

test('configuration invalide : 500 « Configuration invalide »', function (): void {
    $invalides = [
        ['destinataire' => 'pas une adresse'],
        ['destinataire' => "contact@fan2harmonie.fr\r\nBcc: x@y.z"],
        ['expediteur' => '-oQ/tmp/x site@fan2harmonie.fr'],
        ['expediteur' => '-site@fan2harmonie.fr'],
        ['origines_autorisees' => []],
        ['origines_autorisees' => 'https://fan2harmonie.fr'],
        ['origines_autorisees' => ['https://fan2harmonie.fr/']],
        ['limite_par_heure' => 0],
        ['limite_par_heure' => '5'],
        ['taille_max_message' => 0],
        ['dossier_limiteur' => ''],
        ['transport_test' => 'non'],
        ['transport_test' => true],
    ];
    foreach ($invalides as $remplacement) {
        vrai(!configValide(configTest($remplacement)), 'acceptée à tort : ' . montrer($remplacement));
        [$r, $facteur] = traiter([], [], configTest($remplacement));
        egal(500, $r['statut'], montrer($remplacement));
        egal('Configuration invalide', $r['corps']['errors'][0]['message']);
        egal([], $facteur->envois);
    }
    vrai(configValide(sans(configTest(), 'secret_limiteur', 'transport_test')), 'secret_limiteur et transport_test facultatifs');
    vrai(configValide(configTest(['transport_test' => true, 'dossier_transport_test' => sys_get_temp_dir()])), 'transport de test avec son dossier');
});

test('chargerConfig : fichier absent ou ne renvoyant pas de tableau → null ; config.sample.php valide et sans transport de test', function (): void {
    $dossier = dossierTemporaire();
    egal(null, chargerConfig($dossier . '/config.php'));
    file_put_contents($dossier . '/config.php', "<?php\nreturn 'oups';\n");
    egal(null, chargerConfig($dossier . '/config.php'));
    $exemple = chargerConfig(RACINE . '/public/api/config.sample.php');
    vrai(is_array($exemple), 'config.sample.php renvoie un tableau');
    vrai(configValide($exemple), 'config.sample.php est une configuration valide');
    egal('contact@fan2harmonie.fr', $exemple['destinataire']);
    egal('site@fan2harmonie.fr', $exemple['expediteur']);
    egal(['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'], $exemple['origines_autorisees']);
    egal(5, $exemple['limite_par_heure']);
    egal(5000, $exemple['taille_max_message']);
    egal(false, $exemple['transport_test'], 'jamais de transport de test en production');
});

// ---------- Outils ----------

test('emailValide : adresses simples acceptées, formes dangereuses refusées', function (): void {
    foreach (['a@b.fr', 'prenom.nom+site@exemple.co.uk', 'x_y-z@sous.domaine.fr'] as $ok) {
        vrai(emailValide($ok), "refusée à tort : {$ok}");
    }
    foreach (['', 'a', 'a@', '@b.fr', 'a@b', "a@b.fr\n", ' a@b.fr', 'a b@c.fr', 'a@b.fr>', 'é@b.fr', str_repeat('a', 250) . '@b.fr'] as $ko) {
        vrai(!emailValide($ko), 'acceptée à tort : ' . montrer($ko));
    }
});

test('construireSujet : nom de 100 caractères de 4 octets, mots encodés ≤ 75, une seule ligne', function (): void {
    $nom = str_repeat('𝄞', 100);
    $sujet = construireSujet($nom);
    egal('[Site Fan 2 Harmonie] Message de ' . $nom, decoderSujet($sujet));
    foreach (explode(' ', $sujet) as $mot) {
        vrai(strlen($mot) <= 75, 'mot encodé trop long');
    }
    vrai(strlen('Subject: ' . $sujet) <= 998, 'ligne d’en-tête trop longue');
    egal(0, preg_match('/[\r\n]/', $sujet));
    egal(100, mb_strlen(mb_substr(decoderSujet(construireSujet(str_repeat('a', 300))), 33)), 'nom tronqué à 100 caractères');
});

test('veutJson : selon l’en-tête Accept', function (): void {
    egal(true, veutJson(['HTTP_ACCEPT' => 'application/json']));
    egal(true, veutJson(['HTTP_ACCEPT' => 'Application/JSON, text/plain']));
    egal(false, veutJson(['HTTP_ACCEPT' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8']));
    egal(false, veutJson([]));
});
