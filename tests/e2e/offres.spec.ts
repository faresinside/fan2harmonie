/**
 * Page « Les offres de séances » (/offres-de-seances/) et son lien dans le menu : texte venant de
 * src/content/pages/offres.md, modifiable dans l'administration.
 */
import { test, expect } from '@playwright/test';
import { sansDebordement, sansViolationAxe } from './outils';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('menu', () => {
  test('« Les offres de séances » juste après « La pratique », vers la page dédiée ; les autres liens visent l’accueil', async ({ page }) => {
    await page.goto('/');
    const liens = page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link');
    const textes = await liens.allTextContents();
    expect(textes.indexOf('Les offres de séances')).toBe(textes.indexOf('La pratique') + 1);
    await expect(liens.filter({ hasText: 'Les offres de séances' })).toHaveAttribute('href', '/offres-de-seances/');
    await expect(liens.filter({ hasText: 'La pratique' })).toHaveAttribute('href', '#pratique');
  });

  test('depuis la page des offres, les autres liens visent les sections de l’accueil, et le lien courant est signalé', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'La pratique' })).toHaveAttribute('href', '/#pratique');
    await expect(nav.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/#contact');
    await expect(nav.getByRole('link', { name: 'Les offres de séances' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('page des offres', () => {
  test('titre, accroche, trois offres en titres de niveau 2, texte corrigé', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    await expect(page).toHaveTitle('Les offres de séances — Fan 2 Harmonie');
    await expect(page.locator('h1')).toHaveText('Les offres de séances');
    await expect(page.locator('.offres__accroche')).toContainText('Quelques minutes en mouvement pour une journée plus sereine');
    const titres = await page.locator('main h2').allTextContents();
    expect(titres).toEqual([
      'Les séances',
      'Qi Gong en pleine nature : un moment pour soi',
      'Séances matinales de réveil articulaire et musculaire en milieu professionnel',
    ]);
    const texte = await page.locator('main').innerText();
    for (const corrige of ['Inspirées des techniques', 'mouvements de Qi Gong (postures, étirements)', 'développer la mobilité', 'grâce à des techniques simples', 'gratuite et sans prérequis']) {
      expect(texte, corrige).toContain(corrige);
    }
    for (const faute of ['Inspirés', 'ddévelopper', 'de par techniques', 'Qi (postures']) expect(texte, faute).not.toContain(faute);
  });

  test('le lien « La pratique » mène à la section de l’accueil', async ({ page }) => {
    await page.goto('/offres-de-seances/');
    await page.locator('main').getByRole('link', { name: 'La pratique' }).click();
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
