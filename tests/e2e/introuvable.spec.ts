import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { animationsTerminees, REGLES_WCAG, sansViolationAxe } from './outils';

/**
 * Page 404 (src/pages/404.astro → dist/404.html), servie par l'hébergeur pour toute adresse inconnue et pour
 * tout fichier refusé (public/.htaccess). Ici avec `astro preview` ; le vrai Apache la vérifie aussi
 * (tests/apache/run.sh : statut 404, même page pour les 403).
 */

const INCONNUE = '/cette-page-nexiste-pas/';

test('adresse inconnue : statut 404 et page « Page introuvable »', async ({ request }) => {
  const reponse = await request.get(INCONNUE);
  expect(reponse.status()).toBe(404);
  const html = await reponse.text();
  expect(html).toContain('<title>Page introuvable — Fan 2 Harmonie</title>');
  expect(html).toContain('<meta name="robots" content="noindex">');
});

test('page 404 : un seul titre, message, lien vers l’accueil, même en-tête et pied de page, non indexée', async ({ page }) => {
  expect((await page.goto(INCONNUE))?.status()).toBe(404);
  await expect(page).toHaveTitle('Page introuvable — Fan 2 Harmonie');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Page introuvable');
  await expect(page.locator('main p').filter({ hasText: 'n’existe pas ou plus' })).toBeVisible();
  const retour = page.getByRole('link', { name: 'Retour à l’accueil' });
  await expect(retour).toHaveAttribute('href', '/');
  await expect(page.locator('header nav a[href="/#rdv"]')).toHaveCount(1);
  await expect(page.locator('footer a[href="/mentions-legales"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  await retour.click();
  await expect(page).toHaveURL('/');
});

for (const largeur of [390, 1280]) {
  test(`page 404 à ${largeur} px : zéro violation axe`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.goto(INCONNUE);
    await animationsTerminees(page);
    await sansViolationAxe(page, { regles: REGLES_WCAG });
  });
}

test('construction : dist/404.html, absente du plan du site ; .htaccess et .user.ini copiés tels quels', async ({ request }) => {
  expect(existsSync('dist/404.html')).toBe(true);
  const plan = await (await request.get('/sitemap-0.xml')).text();
  expect(plan).not.toContain('404');
  for (const fichier of ['.htaccess', 'api/.htaccess', 'api/.user.ini']) {
    expect(existsSync(`dist/${fichier}`), `dist/${fichier}`).toBe(true);
    expect(readFileSync(`dist/${fichier}`, 'utf8')).toBe(readFileSync(`public/${fichier}`, 'utf8'));
  }
});
