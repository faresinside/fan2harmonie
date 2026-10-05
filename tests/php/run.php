<?php

/**
 * Tests PHP du script de contact (public/api/) et du relais de connexion GitHub de /admin (public/oauth/), sans
 * dépendance (ni Composer ni PHPUnit).
 * Lancement : `docker compose run --rm php php tests/php/run.php` (ou `npm run test:php` depuis le PC).
 * 1. `php -l` de chaque fichier PHP du projet (public/api/, public/oauth/ et tests/php/) ;
 * 2. tests unitaires de la bibliothèque (tests/php/tests/*.php), dont le limiteur sur fichier et le vrai mail()
 *    vers un faux sendmail ;
 * 3. tests d'intégration HTTP avec le serveur intégré de PHP (tests/php/tests/integration.php pour le formulaire,
 *    tests/php/tests/oauth-integration.php pour le relais OAuth, avec un faux GitHub local).
 * Code de sortie non nul au moindre échec.
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

const RACINE = __DIR__ . '/../..';
const BIBLIOTHEQUE = RACINE . '/public/api/lib/contact.php';

/** @var list<array{nom: string, fn: callable}> */
$GLOBALS['tests'] = [];

/** Déclare un test. */
function test(string $nom, callable $fn): void
{
    $GLOBALS['tests'][] = ['nom' => $nom, 'fn' => $fn];
}

final class EchecTest extends Exception
{
}

/** Représentation lisible d'une valeur (caractères de contrôle rendus visibles). */
function montrer(mixed $valeur): string
{
    $texte = var_export($valeur, true);
    return strlen($texte) > 600 ? substr($texte, 0, 600) . '…' : addcslashes($texte, "\0..\37");
}

function egal(mixed $attendu, mixed $obtenu, string $message = ''): void
{
    if ($attendu !== $obtenu) {
        throw new EchecTest(trim($message . "\n      attendu : " . montrer($attendu) . "\n      obtenu  : " . montrer($obtenu)));
    }
}

function vrai(bool $condition, string $message): void
{
    if (!$condition) {
        throw new EchecTest($message);
    }
}

function contient(string $aiguille, string $botte, string $message = ''): void
{
    vrai(str_contains($botte, $aiguille), trim($message . ' — ' . montrer($aiguille) . ' absent de ' . montrer($botte)));
}

function absent(string $aiguille, string $botte, string $message = ''): void
{
    vrai(!str_contains($botte, $aiguille), trim($message . ' — ' . montrer($aiguille) . ' présent dans ' . montrer($botte)));
}

/** Dossier temporaire neuf, supprimé à la fin du lancement. */
function dossierTemporaire(): string
{
    $dossier = sys_get_temp_dir() . '/fan2harmonie-tests-' . bin2hex(random_bytes(6));
    mkdir($dossier, 0700, true);
    register_shutdown_function(static function () use ($dossier): void {
        supprimerDossier($dossier);
    });
    return $dossier;
}

function supprimerDossier(string $dossier): void
{
    if (!is_dir($dossier)) {
        return;
    }
    $elements = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dossier, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($elements as $element) {
        // Un lien symbolique vers un dossier se supprime comme un fichier (unlink), sans toucher à sa cible.
        ($element->isDir() && !$element->isLink()) ? rmdir($element->getPathname()) : unlink($element->getPathname());
    }
    rmdir($dossier);
}

// ---------- 1. Syntaxe de chaque fichier PHP ----------

$fichiersPhp = [];
foreach ([RACINE . '/public/api', RACINE . '/public/oauth', RACINE . '/tests/php'] as $dossier) {
    if (!is_dir($dossier)) {
        continue;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier, FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->isFile() && $f->getExtension() === 'php') {
            $fichiersPhp[] = $f->getPathname();
        }
    }
}
sort($fichiersPhp);

$erreursSyntaxe = 0;
foreach ($fichiersPhp as $fichier) {
    exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($fichier) . ' 2>&1', $sortie, $code);
    if ($code !== 0) {
        $erreursSyntaxe++;
        echo "✗ php -l " . $fichier . "\n  " . implode("\n  ", $sortie) . "\n";
    }
    $sortie = [];
}
printf("php -l : %d fichier(s), %d erreur(s)\n", count($fichiersPhp), $erreursSyntaxe);

// ---------- 2 et 3. Tests ----------

if (!is_file(BIBLIOTHEQUE)) {
    echo "✗ Bibliothèque introuvable : public/api/lib/contact.php\n";
    echo "ÉCHEC : 0 test lancé.\n";
    exit(1);
}
require_once BIBLIOTHEQUE;

$fichiersTests = glob(__DIR__ . '/tests/*.php') ?: [];
sort($fichiersTests);
foreach ($fichiersTests as $fichierTest) {
    require $fichierTest;
}

$reussis = 0;
$echecs = [];
foreach ($GLOBALS['tests'] as ['nom' => $nom, 'fn' => $fn]) {
    try {
        $fn();
        $reussis++;
        echo "✓ {$nom}\n";
    } catch (Throwable $e) {
        $detail = $e instanceof EchecTest ? $e->getMessage() : get_class($e) . ' : ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
        $echecs[] = $nom;
        echo "✗ {$nom}\n    {$detail}\n";
    }
}

$total = count($GLOBALS['tests']);
echo "\n";
if ($echecs === [] && $erreursSyntaxe === 0) {
    echo "RÉUSSITE : {$reussis}/{$total} tests, " . count($fichiersPhp) . " fichiers PHP sans erreur de syntaxe.\n";
    exit(0);
}
echo 'ÉCHEC : ' . count($echecs) . "/{$total} test(s) en échec, {$erreursSyntaxe} erreur(s) de syntaxe.\n";
foreach ($echecs as $nom) {
    echo "  - {$nom}\n";
}
exit(1);
