/**
 * Page « Les offres de séances » (/offres-de-seances/) et son lien dans le menu : texte venant de
 * src/content/pages/offres.md, modifiable dans l'administration.
 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { motDuMenu } from '../../src/lib/menu';
import { enTeteMd, motsDuMenu, sansDebordement, sansViolationAxe, titresNiveau2 } from './outils';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const OFFRES = 'src/content/pages/offres.md';
const motsOffres = () => motsDuMenu();

test.describe('menu', () => {
  test('le mot du menu pour les offres vient de l’administration (titre de la page par défaut), juste après « La pratique », vers la page dédiée', async ({ page }) => {
    const mots = motsOffres();
    await page.goto('/');
    const liens = page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link');
    expect(await liens.allTextContents()).toEqual(mots);
    await expect(liens.nth(2)).toHaveAttribute('href', '/offres-de-seances/');
    await expect(liens.nth(1)).toHaveAttribute('href', '#pratique');
  });

  test('depuis la page des offres, les autres liens visent les sections de l’accueil, et le lien courant est signalé', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('href', '/#contact');
    await expect(nav.getByRole('link').nth(1)).toHaveAttribute('href', '/#pratique');
    await expect(nav.getByRole('link').nth(2)).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('page des offres', () => {
  test('titre, accroche et offres (titres de niveau 2) : ceux du fichier modifiable dans l’administration', async ({ page }) => {
    const { titre, accroche } = enTeteMd<{ titre: string; accroche?: string }>(OFFRES);
    await page.goto('/offres-de-seances/');
    await expect(page).toHaveTitle(`${titre} — Fan 2 Harmonie`);
    await expect(page.locator('h1')).toHaveText(titre);
    if (accroche) await expect(page.locator('.offres__accroche')).toHaveText(accroche);
    else await expect(page.locator('.offres__accroche')).toHaveCount(0);
    expect(await page.locator('main h2').allTextContents()).toEqual(titresNiveau2(OFFRES));
  });

  test('le titre de la page est aussi le mot du menu, sauf mot plus court choisi dans les réglages du menu', async ({ page }) => {
    const mots = motsOffres();
    await page.goto('/offres-de-seances/');
    const { titre } = enTeteMd<{ titre: string }>(OFFRES);
    const reglage = enTeteMd<{ offres?: string }>('src/content/reglages/menu.md').offres;
    expect(mots[2]).toBe(motDuMenu(reglage, titre));
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link').nth(2)).toHaveText(mots[2] ?? '');
  });

  test('le lien « La pratique » mène à la section de l’accueil', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    test.skip(!readFileSync(OFFRES, 'utf8').includes('](/#pratique)'), 'le texte actuel n’a plus de lien vers La pratique');
    await page.locator('main a[href="/#pratique"]').first().click();
    await expect(page).toHaveURL(/\/#pratique$/);
    await expect(page.locator('#pratique')).toBeVisible();
  });

  test('données structurées : deux services (Yvelines, Île-de-France), fil d’Ariane, WebSite ; rien de la zone « Paris »', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(scripts).toHaveLength(1);
    const graphe = (JSON.parse(scripts[0] ?? '') as { '@graph': { '@type': string }[] })['@graph'];
    expect(graphe.map((n) => n['@type'])).toEqual(['WebSite', 'Service', 'Service', 'BreadcrumbList']);
    expect(scripts[0]).toContain('Yvelines');
    expect(scripts[0]).toContain('Île-de-France');
    expect(scripts[0]).not.toMatch(/Paris/);
  });

  test('adresse canonique, indexable, dans le plan du site', async ({ page, request }) => {
    await page.goto('/offres-de-seances/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/offres-de-seances\/$/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    const plan = await (await request.get('/sitemap-0.xml')).text();
    expect(plan).toContain('/offres-de-seances/');
  });

  for (const [nom, largeur] of [['téléphone', 360], ['tablette', 768], ['petit ordinateur', 1152], ['ordinateur', 1280]] as const) {
    test(`${nom} (${largeur} px) : aucun débordement, menu lisible, aucune violation d'accessibilité`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto('/offres-de-seances/');
      await sansDebordement(page);
      await sansViolationAxe(page);
    });
  }
});
