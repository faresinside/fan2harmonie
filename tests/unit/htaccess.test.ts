import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contientPlaceholder } from '../../src/lib/misenligne';

/**
 * Règles Apache/LiteSpeed (public/.htaccess, public/api/.htaccess), lues comme du texte. Leur effet réel est
 * vérifié sur un vrai Apache par `npm run test:apache` (tests/apache/run.sh) ; ici, ce qui doit rester vrai
 * quoi qu'on modifie, à commencer par le nom de domaine, qui doit être celui de site.url.
 */

const RACINE = path.resolve(__dirname, '../..');
const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), 'utf8');
/** Lignes de directives (sans commentaires ni lignes vides), espaces de bordure retirés. */
const directives = (texte: string) =>
  texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

const racine = lire('public/.htaccess');
const api = lire('public/api/.htaccess');
let hote = '';

beforeAll(async () => {
  // Jamais l'adresse d'audit Lighthouse : la valeur écrite dans site.ts.
  delete process.env['AUDIT_SITE_URL'];
  const { site } = await import('../../src/config/site');
  hote = new URL(site.url).hostname;
});

describe('public/.htaccess', () => {
  it('redirections vers https://<hôte de site.url> seulement (changer de domaine fait échouer ce test)', () => {
    const cibles = [...racine.matchAll(/^RewriteRule \^ (https?:\/\/[^%\s]+)%\{REQUEST_URI\} \[R=301,L\]$/gm)].map((m) => m[1]);
    expect(cibles).toEqual([`https://${hote}`, `https://${hote}`]);
    // Aucune autre adresse ni aucun autre nom de domaine dans les directives.
    const domaines = directives(racine).join('\n').match(/[a-z0-9-]+(\\?\.[a-z0-9-]+)*\\?\.(fr|com|net|org|eu)\b/gi) ?? [];
    expect([...new Set(domaines.map((d) => d.replace(/\\/g, '')))]).toEqual([hote]);
  });

  it('tout autre nom que <hôte de site.url> (www., nom étranger…) → 301 vers le domaine canonique', () => {
    const echappe = hote.replace(/\./g, '\\.');
    const lignes = directives(racine);
    const i = lignes.indexOf(`RewriteCond %{HTTP_HOST} !^${echappe}\\.?(:443)?$ [NC]`);
    expect(i).toBeGreaterThan(-1);
    expect(lignes[i + 1]).toBe(`RewriteRule ^ https://${hote}%{REQUEST_URI} [R=301,L]`);
  });

  it('HTTPS forcé (redirection 301) avant tout le reste ; mod_rewrite obligatoire (hors <IfModule>)', () => {
    const lignes = directives(racine);
    const moteur = lignes.indexOf('RewriteEngine On');
    expect(moteur).toBeGreaterThan(-1);
    // Profondeur des <IfModule> à la ligne « RewriteEngine On » : 0.
    const profondeur = lignes.slice(0, moteur).reduce((p, l) => p + (/^<IfModule/i.test(l) ? 1 : /^<\/IfModule>/i.test(l) ? -1 : 0), 0);
    expect(profondeur).toBe(0);
    expect(lignes.slice(moteur + 1, moteur + 4)).toEqual([
      'RewriteCond %{HTTPS} !=on',
      'RewriteCond %{HTTP:X-Forwarded-Proto} !=https',
      `RewriteRule ^ https://${hote}%{REQUEST_URI} [R=301,L]`,
    ]);
  });

  it('en-têtes de sécurité exacts, sur toutes les réponses (« always »)', () => {
    const lignes = directives(racine);
    for (const attendu of [
      'Header always set X-Content-Type-Options "nosniff"',
      'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
      'Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"',
      'Header always set X-Frame-Options "DENY"',
      'Header always set Strict-Transport-Security "max-age=31536000"',
      `Header always set Content-Security-Policy "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" env=!SANS_CSP`,
    ]) {
      expect(lignes).toContain(attendu);
    }
  });

  it('jamais no-referrer (le script de contact se replie sur Referer) sauf sous /oauth/, ni COOP, ni CORS, ni HSTS étendu', () => {
    const lignes = directives(racine);
    // Seule exception : le relais de connexion GitHub (/oauth/), dont les adresses portent code et state.
    expect(lignes).toContain('SetEnvIf Request_URI "^/oauth(/|$)" SANS_REFERENT');
    expect(lignes).toContain('Header unset Referrer-Policy');
    expect(lignes.filter((l) => l.includes('no-referrer'))).toEqual(['Header always set Referrer-Policy "no-referrer" env=SANS_REFERENT']);
    expect(lignes.indexOf('Header always set Referrer-Policy "no-referrer" env=SANS_REFERENT')).toBe(
      lignes.indexOf('Header always set Referrer-Policy "strict-origin-when-cross-origin"') + 1,
    );
    const texte = lignes.filter((l) => !l.includes('SANS_REFERENT')).join('\n');
    expect(texte).not.toMatch(/no-referrer"/);
    expect(texte).not.toMatch(/Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy|Access-Control-/i);
    expect(texte).not.toMatch(/includeSubDomains|preload/i);
  });

  it('CSP partielle : pas sur /admin/, /oauth/ ni /api/', () => {
    expect(directives(racine)).toContain('SetEnvIf Request_URI "^/(admin|oauth|api)(/|$)" SANS_CSP');
  });

  it('cache : /_astro/ un an (réponses réussies seulement), HTML revalidé, /admin/ /oauth/ /api/ jamais', () => {
    const lignes = directives(racine);
    expect(lignes).toContain('SetEnvIf Request_URI "^/_astro/" CACHE_IMMUABLE');
    expect(lignes).toContain('Header always set Cache-Control "no-cache"');
    expect(lignes).toContain('Header set Cache-Control "public, max-age=31536000, immutable" env=CACHE_IMMUABLE');
    expect(lignes).toContain('SetEnvIf Request_URI "^/(admin|oauth|api)(/|$)" SANS_CACHE');
    expect(lignes).toContain('Header always set Cache-Control "no-store" env=SANS_CACHE');
  });

  it('refus par mod_rewrite ET par <FilesMatch> ; mêmes pages d’erreur pour 403 et 404', () => {
    const lignes = directives(racine);
    for (const regle of [
      'RewriteRule (^|/)\\.(?!well-known(/|$)) - [F]',
      'RewriteRule ^(api|oauth)/lib(/|$) - [F,NC]',
      'RewriteRule \\.(php[0-9s]?|phtml|phar|pht|inc)\\. - [F,NC]',
      'RewriteRule \\.sample\\.php$ - [F,NC]',
      'RewriteRule (^|/)config[^/]*\\.php$ - [F,NC]',
      'RewriteRule \\.md$ - [F,NC]',
      'RewriteRule (^|/)error_log$ - [F,NC]',
    ]) {
      expect(lignes).toContain(regle);
    }
    expect(lignes.filter((l) => l === 'Require all denied')).toHaveLength(2);
    // Double extension (x.php.jpg, x.pht.jpg, x.inc.txt) : même liste dans <FilesMatch> que dans RewriteRule.
    const doubleExtension = /\.(php[0-9s]?|phtml|phar|pht|inc)\./i;
    expect(lignes).toContain('<FilesMatch "(?i)(^\\.|~$|\\.(bak|swp|save|orig|old|dist|md|inc)$|\\.sample\\.php$|^error_log$|^composer\\.|^config.*\\.php$|\\.(php[0-9s]?|phtml|phar|pht|inc)\\.)">');
    for (const nom of ['x.php.jpg', 'x.PHP5.png', 'x.pht.jpg', 'x.inc.txt', 'x.phar.gif']) expect(doubleExtension.test(nom), nom).toBe(true);
    for (const nom of ['photo.jpg', 'index.html', 'incipit.txt', 'phtx.jpg']) expect(doubleExtension.test(nom), nom).toBe(false);
    expect(lignes).toContain('ErrorDocument 404 /404.html');
    expect(lignes).toContain('ErrorDocument 403 /404.html');
    expect(lignes).toContain('Options -Indexes -MultiViews');
    expect(lignes).toContain('RedirectMatch 404 "/\\.(?!well-known/)"');
    expect(lignes.join('\n')).not.toMatch(/^LimitRequestBody/m);
    expect(lignes).toContain('ServerSignature Off');
  });

  it('scripts PHP exécutables : api/contact.php, oauth/auth.php et oauth/callback.php seulement', () => {
    const lignes = directives(racine);
    const i = lignes.indexOf('RewriteCond %{REQUEST_URI} !^/(api/contact|oauth/auth|oauth/callback)\\.php$');
    expect(i).toBeGreaterThan(-1);
    expect(lignes[i + 1]).toBe('RewriteRule \\.(php[0-9s]?|phtml|phar|pht|inc)$ - [F,NC]');
    const motif = /^(?!(contact|auth|callback)\.php$).*\.(php[0-9s]?|phtml|phar|pht)$/i;
    expect(lignes).toContain('<FilesMatch "(?i)^(?!(contact|auth|callback)\\.php$).*\\.(php[0-9s]?|phtml|phar|pht)$">');
    for (const nom of ['contact.php', 'auth.php', 'callback.php']) expect(motif.test(nom), nom).toBe(false);
    for (const nom of ['config.php', 'x.PHP', 'AUTH.php5', 'autre.phtml', 'callback.php.php']) expect(motif.test(nom), nom).toBe(true);
  });

  it('aucune valeur provisoire', () => {
    expect(contientPlaceholder(racine)).toBe(false);
    expect(contientPlaceholder(api)).toBe(false);
  });
});

describe('public/api/.htaccess', () => {
  it('corps limité à 64 Ko, seul contact.php exécutable, jamais en cache, pas de liste', () => {
    const lignes = directives(api);
    expect(lignes).toContain('LimitRequestBody 65536');
    expect(lignes).toContain('<FilesMatch "(?i)^(?!contact\\.php$).*\\.(php[0-9s]?|phtml|phar|pht)$">');
    expect(lignes).toContain('Require all denied');
    expect(lignes).toContain('Header always set Cache-Control "no-store"');
    expect(lignes).toContain('Options -Indexes -MultiViews');
    expect(lignes).toContain('AcceptPathInfo Off');
  });

  it('aucune directive mod_rewrite (sinon les refus de la racine ne seraient plus hérités)', () => {
    expect(directives(api).join('\n')).not.toMatch(/^Rewrite/m);
  });

  it('expression de <FilesMatch> : tout .php sauf contact.php', () => {
    const motif = /^(?!contact\.php$).*\.(php[0-9s]?|phtml|phar|pht)$/i;
    expect(motif.test('contact.php')).toBe(false);
    for (const nom of ['autre.php', 'config.php', 'config.sample.php', 'contact.php.php', 'x.phtml', 'x.php5', 'xcontact.php']) {
      expect(motif.test(nom), nom).toBe(true);
    }
  });
});

describe('.htaccess des sous-dossiers de public/', () => {
  const sousDossiers = readdirSync(path.join(RACINE, 'public'), { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.htaccess') && f !== '.htaccess');

  it('api/lib/ et oauth/lib/ : « Require all denied »', () => {
    for (const f of ['api/lib/.htaccess', 'oauth/lib/.htaccess']) {
      expect(sousDossiers).toContain(f);
      expect(directives(lire(`public/${f}`))).toEqual(['Require all denied']);
    }
  });

  it('oauth/ : « AcceptPathInfo Off », no-store et no-referrer (une seule fois), rien d’autre', () => {
    expect(sousDossiers).toContain('oauth/.htaccess');
    expect(directives(lire('public/oauth/.htaccess'))).toEqual([
      'AcceptPathInfo Off',
      '<IfModule mod_headers.c>',
      'Header always set Cache-Control "no-store"',
      'Header always set Referrer-Policy "no-referrer"',
      '</IfModule>',
    ]);
  });

  it('aucun ne contient de directive Rewrite (les refus de la racine ne seraient plus hérités)', () => {
    expect(sousDossiers.length).toBeGreaterThanOrEqual(4);
    for (const f of sousDossiers) expect(directives(lire(`public/${f}`)).join('\n'), f).not.toMatch(/^Rewrite/im);
  });
});
