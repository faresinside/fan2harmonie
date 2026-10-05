/**
 * Tests de /admin avec le vrai Sveltia CMS.
 * - Réseau requis : Sveltia charge ses textes français depuis unpkg.com et ses polices depuis cdn.jsdelivr.net
 *   (adresses codées en dur dans le bundle) ; hors ligne, ces tests échouent. Les hôtes ne sont pas simulés.
 * - Ils s'appuient sur des libellés de l'interface Sveltia (« Parcourir », « Téléverser », « Insérer »,
 *   « Enregistrer », « Se connecter avec GitHub »…) : à revoir à chaque changement de version de @sveltia/cms.
 */
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { test, expect, type Page } from '@playwright/test';
import { actualiteSchema, rendezvousSchema } from '../../src/lib/schemas';

/** Pathname exact (Sveltia ajoute parfois un paramètre anti-cache à l'URL de la configuration). */
const estConfig = (u: URL) => u.pathname === '/admin/config.yml';

/** Sert une variante de la vraie configuration (le reste du fichier est inchangé). */
async function servirConfig(page: Page, transformer: (yml: string) => string) {
  const vraie = await (await page.request.get('/admin/config.yml')).text();
  await page.route(estConfig, (r) => r.fulfill({ body: transformer(vraie), contentType: 'text/yaml' }));
}

function suivreErreurs(page: Page): string[] {
  const erreurs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  page.on('pageerror', (e) => erreurs.push(e.message));
  return erreurs;
}

/** Fichiers écrits par le dépôt de test de Sveltia (stockage privé du navigateur, OPFS). */
const fichiersEcrits = (page: Page) =>
  page.evaluate(async () => {
    const out: Record<string, string> = {};
    async function parcourir(dossier: FileSystemDirectoryHandle, prefixe: string) {
      for await (const [nom, h] of dossier.entries()) {
        if (h.kind === 'directory') await parcourir(h as FileSystemDirectoryHandle, `${prefixe}${nom}/`);
        else out[`${prefixe}${nom}`] = nom.endsWith('.md') ? await (await (h as FileSystemFileHandle).getFile()).text() : '';
      }
    }
    await parcourir(await navigator.storage.getDirectory(), '');
    return out;
  });

test.describe('espace d’administration /admin/', () => {
  // Sveltia choisit la langue de l'interface d'après le navigateur : celui de Stéphanie est en français.
  test.use({ locale: 'fr-FR' });

  test('page en français, non indexée, configuration liée', async ({ page }) => {
    const reponse = await page.goto('/admin/');
    expect(reponse?.status()).toBe(200);
    // HTML servi (Sveltia ajoute ensuite sa propre balise robots, d'où la lecture du fichier statique).
    const html = (await reponse?.text()) ?? '';
    expect(html).toContain('<html lang="fr">');
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(html).toContain('<title>Administration — Fan 2 Harmonie</title>');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('link[rel="cms-config-url"]')).toHaveAttribute('href', '/admin/config.yml');
  });

  test('config.yml servi', async ({ request }) => {
    const reponse = await request.get('/admin/config.yml');
    expect(reponse.status()).toBe(200);
    expect(await reponse.text()).toContain('collections:');
  });

  test('Sveltia CMS servi par le site lui-même, vraie configuration chargée', async ({ page }) => {
    const erreurs = suivreErreurs(page);
    const script = page.waitForResponse((r) => new URL(r.url()).pathname === '/admin/sveltia-cms.js');
    await page.goto('/admin/');
    expect((await script).status()).toBe(200);
    await expect(page.locator('script[src="/admin/sveltia-cms.js"]')).toHaveCount(1);
    await expect(page.locator('body')).toContainText(/Sveltia CMS|Administration Fan 2 Harmonie/, { timeout: 30_000 });
    // Tant que le dépôt GitHub vaut À_COMPLÉTER (renseigné en Task 11), Sveltia signale ce seul défaut.
    const enAttente = (await (await page.request.get('/admin/config.yml')).text()).includes('À_COMPLÉTER');
    const attendues = enAttente ? [/“owner\/repo” format/, /Errors found in configuration/] : [];
    expect(erreurs.filter((e) => !attendues.some((r) => r.test(e)))).toEqual([]);
  });

  test('dépôt renseigné : écran de connexion GitHub en français, configuration validée par Sveltia', async ({ page }) => {
    const erreurs = suivreErreurs(page);
    await servirConfig(page, (yml) => yml.replace('repo: À_COMPLÉTER', 'repo: exemple/fan2harmonie'));
    await page.goto('/admin/');
    await expect(page.getByRole('button', { name: /Se connecter avec .*GitHub/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Administration Fan 2 Harmonie').first()).toBeVisible();
    expect(erreurs).toEqual([]);
  });

  test('connexion GitHub par le relais du site : fenêtre sur /oauth/auth.php, jeton reçu par la vraie page du relais', async ({
    page,
    context,
  }) => {
    // Aucune requête ne sort vers le vrai site ni vers GitHub : tout est simulé ici. La page de retour est
    // celle que produit public/oauth/lib/oauth.php (tests/fixtures/oauth/page-succes.html, tenue à jour par
    // tests/php/tests/oauth.php), avec l'origine de ce serveur de test et un nonce fixe.
    const pageRelais = readFileSync('tests/fixtures/oauth/page-succes.html', 'utf8');
    const jeton = 'gho_JetonFactice0000000000000000000E2E';
    let adressePopup: URL | null = null;
    let autorisation: string | null = null;
    // Le trajet auth.php → GitHub → callback.php (302, cookie du state, échange du code) est couvert par
    // tests/php/tests/oauth-integration.php ; ici, la fenêtre reçoit directement la page de retour du relais,
    // sur la même origine (https://fan2harmonie.fr) que la vraie page de callback.php.
    await context.route('https://fan2harmonie.fr/oauth/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/oauth/auth.php') {
        adressePopup = url;
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          headers: {
            'Content-Security-Policy':
              "default-src 'none'; script-src 'nonce-0123456789abcdef0123456789abcdef'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Cache-Control': 'no-store',
          },
          body: pageRelais,
        });
      } else {
        await route.fulfill({ status: 404, body: '' });
      }
    });
    await context.route(/^https:\/\/(api\.github\.com|github\.com|[^/]*githubstatus\.com)\//, async (route) => {
      if (new URL(route.request().url()).hostname === 'api.github.com') autorisation ??= route.request().headers()['authorization'] ?? '';
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' });
    });
    await servirConfig(page, (yml) => yml.replace('repo: À_COMPLÉTER', 'repo: exemple/fan2harmonie'));
    await page.goto('/admin/');
    const fenetre = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Se connecter avec .*GitHub/ }).click({ timeout: 30_000 });
    await fenetre;
    // Adresse construite par Sveltia : base_url + auth_endpoint, avec provider, site_id et scope (ignorés
    // par le relais, sauf provider).
    await expect.poll(() => adressePopup?.href ?? null).not.toBeNull();
    expect(adressePopup!.origin + adressePopup!.pathname).toBe('https://fan2harmonie.fr/oauth/auth.php');
    expect(adressePopup!.searchParams.get('provider')).toBe('github');
    expect([...adressePopup!.searchParams.keys()].sort()).toEqual(['provider', 'scope', 'site_id']);
    // Poignée de main postMessage réussie : Sveltia a reçu le jeton et l'utilise pour appeler l'API GitHub.
    await expect.poll(() => autorisation, { timeout: 30_000 }).not.toBeNull();
    expect(autorisation).toContain(jeton);
  });

  test.describe('page de retour du relais (script réel, navigateur réel)', () => {
    // Page produite par public/oauth/lib/oauth.php (tests/fixtures/oauth/page-succes.html) : origine autorisée
    // http://localhost:4321 (ce serveur de test), nonce fixe ; servie sur https://fan2harmonie.fr/oauth/….
    const pageRelais = readFileSync('tests/fixtures/oauth/page-succes.html', 'utf8');
    const jeton = 'gho_JetonFactice0000000000000000000E2E';
    const adresse = 'https://fan2harmonie.fr/oauth/callback.php?code=c0de&state=' + 'a'.repeat(64);
    const servirRelais = (context: import('@playwright/test').BrowserContext) =>
      context.route('https://fan2harmonie.fr/oauth/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          headers: {
            'Content-Security-Policy':
              "default-src 'none'; script-src 'nonce-0123456789abcdef0123456789abcdef'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
          body: pageRelais,
        }),
      );
    /** Ouvre la page du relais en fenêtre depuis `ouvreur`, qui note tous les messages reçus. */
    async function ouvrirDepuis(ouvreur: Page) {
      await ouvreur.evaluate(() => {
        const w = window as unknown as { recus: string[] };
        w.recus = [];
        window.addEventListener('message', (e) => w.recus.push(String(e.data)));
      });
      const [fenetre] = await Promise.all([
        ouvreur.waitForEvent('popup'),
        ouvreur.evaluate((url) => {
          (window as unknown as { fenetre: Window | null }).fenetre = window.open(url, 'auth');
        }, adresse),
      ]);
      await fenetre.waitForLoadState();
      return fenetre;
    }
    const recus = (p: Page) => p.evaluate(() => (window as unknown as { recus: string[] }).recus);

    test('sans fenêtre parente : le jeton est retiré de la page, message calme affiché', async ({ page, context }) => {
      await servirRelais(context);
      await page.goto(adresse);
      await expect(page.locator('main')).toHaveText('La connexion n’a pas abouti. Vous pouvez fermer cette fenêtre et recommencer.');
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      expect(html).not.toContain(jeton);
      expect(html).not.toContain('<script');
      // Sans le script de nettoyage, le jeton serait bien là : contrôle du témoin.
      expect(pageRelais).toContain(jeton);
    });

    test('ouvreur d’une origine non autorisée : rien ne lui est envoyé, même s’il répond', async ({ page, context }) => {
      await servirRelais(context);
      await context.route('https://autre.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>autre</title>' }));
      await page.goto('https://autre.example/');
      const fenetre = await ouvrirDepuis(page);
      await page.evaluate(() => (window as unknown as { fenetre: Window }).fenetre.postMessage('authorizing:github', '*'));
      await page.waitForTimeout(1500);
      expect(await recus(page)).toEqual([]);
      expect(await fenetre.evaluate(() => document.documentElement.outerHTML)).toContain('<script');
    });

    test('message d’une autre fenêtre (même origine, mais pas l’ouvreur) : ignoré ; puis l’ouvreur reçoit le jeton', async ({ page, context }) => {
      await servirRelais(context);
      await page.goto('/');
      const fenetre = await ouvrirDepuis(page);
      await expect.poll(() => recus(page)).toEqual(['authorizing:github']);
      // Une autre fenêtre de la même origine autorisée (un cadre de la page) tente la poignée de main.
      await page.evaluate(
        () =>
          new Promise<void>((fin) => {
            const cadre = document.createElement('iframe');
            cadre.src = '/robots.txt';
            cadre.onload = () => {
              // Exécuté dans le cadre : event.source sera le cadre, pas l'ouvreur.
              (cadre.contentWindow as unknown as { eval: (code: string) => void }).eval(
                'parent.fenetre.postMessage("authorizing:github", "*")',
              );
              fin();
            };
            document.body.appendChild(cadre);
          }),
      );
      await page.waitForTimeout(1500);
      expect((await recus(page)).filter((m) => m.startsWith('authorization:'))).toEqual([]);
      // L'ouvreur lui-même : réussite, jeton reçu, script retiré, fenêtre fermée.
      const fermee = fenetre.waitForEvent('close');
      await page.evaluate(() => (window as unknown as { fenetre: Window }).fenetre.postMessage('authorizing:github', 'https://fan2harmonie.fr'));
      await expect.poll(async () => (await recus(page)).filter((m) => m.startsWith('authorization:'))).toEqual([
        `authorization:github:success:{"token":"${jeton}","provider":"github"}`,
      ]);
      await fermee;
    });
  });

  test('fichiers écrits par le CMS acceptés par les schémas du site (rendez-vous, actualité avec photo)', async ({ page }) => {
    test.setTimeout(90_000);
    const erreurs = suivreErreurs(page);
    // Même configuration, mais dépôt de test de Sveltia (fichiers écrits dans le navigateur).
    await servirConfig(page, (yml) => yml.replace(/backend:\n( {2}.*\n)+/, 'backend:\n  name: test-repo\n'));
    await page.goto('/admin/');
    await page.getByRole('button', { name: /dépôt de test/ }).click();
    await expect(page.getByText('Rendez-vous').first()).toBeVisible();

    // Rendez-vous : date choisie, heure et lieu par défaut.
    await page.goto('/admin/#/collections/rendezvous/new');
    await page.locator('input[type=date]').fill('2099-10-17');
    await page.getByRole('textbox', { name: 'Remarque' }).fill('Annulé en cas de pluie');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('17/10/2099 — 16:00')).toBeVisible();
    const premier = `sveltia-cms-test/src/content/rendezvous/2099-10-17.md`;
    const premierAvant = (await fichiersEcrits(page))[premier];
    expect(premierAvant).toBeDefined();

    // Deuxième rendez-vous le même jour : nouveau fichier suffixé, le premier n'est pas écrasé.
    await page.goto('/admin/#/collections/rendezvous/new');
    await page.locator('input[type=date]').fill('2099-10-17');
    await page.getByRole('textbox', { name: 'Heure' }).fill('10:00');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('17/10/2099 — 10:00')).toBeVisible();
    const apresDeux = await fichiersEcrits(page);
    const suffixe = 'sveltia-cms-test/src/content/rendezvous/2099-10-17-1.md';
    const rdvDuJour = [premier, suffixe];
    expect(
      Object.keys(apresDeux)
        .filter((f) => f.startsWith('sveltia-cms-test/src/content/rendezvous/2099-10-17'))
        .sort(),
    ).toEqual([...rdvDuJour].sort());
    expect(apresDeux[premier]).toBe(premierAvant);
    const heures = rdvDuJour.map((f) => rendezvousSchema.parse(parseFrontmatter(apresDeux[f] ?? '').frontmatter).heure);
    expect(heures).toEqual(['16:00', '10:00']);

    // Actualité sans photo : aucune clé `image` écrite (omit_empty_optional_fields), fichier valide.
    await page.goto('/admin/#/collections/actualites/new');
    await page.getByRole('textbox', { name: 'Titre' }).fill('Sans photo');
    await page.locator('input[type=date]').fill('2099-10-03');
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type('Un texte.');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/Sans photo/).first()).toBeVisible();
    const sansPhoto = Object.entries(await fichiersEcrits(page)).find(([f]) => f.endsWith('-sans-photo.md'))?.[1];
    expect(sansPhoto).toBeDefined();
    const fmSansPhoto = parseFrontmatter(sansPhoto ?? '').frontmatter;
    expect(fmSansPhoto).not.toHaveProperty('image');
    expect(actualiteSchema.safeParse(fmSansPhoto).success).toBe(true);

    // Actualité avec photo téléversée et texte sur deux paragraphes.
    await page.goto('/admin/#/collections/actualites/new');
    await page.getByRole('textbox', { name: 'Titre' }).fill('Stage d’été');
    await page.locator('input[type=date]').fill('2099-10-04');
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type('Premier paragraphe.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second paragraphe.');
    await page.getByRole('group', { name: /Photo/ }).getByRole('button', { name: 'Parcourir' }).click();
    const selecteur = page.waitForEvent('filechooser');
    await page.getByRole('dialog').getByRole('button', { name: /Téléverser/ }).click();
    await (await selecteur).setFiles('src/assets/photos/hero.jpg');
    await expect(page.getByRole('dialog').getByText('hero.jpg')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Insérer' }).click();
    await expect(page.getByRole('group', { name: /Photo/ })).toContainText('../../assets/actualites/hero.webp');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/Stage d’été/).first()).toBeVisible();

    const fichiers = await fichiersEcrits(page);
    const racine = 'sveltia-cms-test/';
    const rdv = fichiers[`${racine}src/content/rendezvous/2099-10-17.md`];
    expect(rdv, Object.keys(fichiers).join('\n')).toBeDefined();
    const rdvLu = rendezvousSchema.parse(parseFrontmatter(rdv ?? '').frontmatter);
    expect(rdvLu).toMatchObject({ heure: '16:00', remarque: 'Annulé en cas de pluie', annule: false });

    const cheminActu = Object.keys(fichiers).find(
      (f) => f.startsWith(`${racine}src/content/actualites/`) && f.includes('stage'),
    );
    expect(cheminActu).toMatch(/\/\d{4}-\d{2}-\d{2}-stage-d-ete\.md$/);
    const actu = parseFrontmatter(fichiers[cheminActu ?? ''] ?? '');
    expect(actualiteSchema.safeParse(actu.frontmatter).success).toBe(true);
    // Photo convertie en WebP dans src/assets/actualites, chemin relatif au fichier .md (exigé par Astro).
    expect(actu.frontmatter['image']).toBe('../../assets/actualites/hero.webp');
    expect(Object.keys(fichiers)).toContain(`${racine}src/assets/actualites/hero.webp`);
    expect(actu.content).not.toMatch(/<br|<!--/i);
    expect(actu.content).toContain('Premier paragraphe.\n\nSecond paragraphe.');
    expect(erreurs).toEqual([]);
  });

  test('l’accueil ne mène pas à /admin, /admin absent du plan du site', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
    for (const plan of ['/sitemap-index.xml', '/sitemap-0.xml']) {
      const reponse = await request.get(plan);
      if (reponse.ok()) expect(await reponse.text(), plan).not.toContain('/admin');
    }
  });
});
