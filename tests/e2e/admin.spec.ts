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
    await servirConfig(page, (yml) =>
      yml
        .replace('repo: À_COMPLÉTER', 'repo: exemple/fan2harmonie')
        .replace('base_url: À_COMPLÉTER', 'base_url: https://auth.exemple.org'),
    );
    await page.goto('/admin/');
    await expect(page.getByRole('button', { name: /Se connecter avec .*GitHub/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Administration Fan 2 Harmonie').first()).toBeVisible();
    expect(erreurs).toEqual([]);
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

    const cheminActu = Object.keys(fichiers).find((f) => f.startsWith(`${racine}src/content/actualites/`));
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
