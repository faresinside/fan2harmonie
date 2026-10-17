import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { urlJeu } from '../fixtures/jeux';
import { animationsTerminees, sansDebordement, sansViolationAxe } from './outils';

/**
 * Photos des actualités (jeu « galerie ») : une photo = mise en page habituelle ; plusieurs = vignettes sous le
 * texte, agrandies dans un <dialog> au clic (fermeture : Échap, clic sur le fond, bouton « Fermer ») ;
 * aucune photo = aucun <img>.
 */

const URL_GALERIE = urlJeu('galerie');
test.use({ baseURL: URL_GALERIE });

const article = (page: Page, titre: string) => page.locator('#actualites article').filter({ has: page.locator('h3', { hasText: titre }) });
const cinq = (page: Page) => article(page, 'Cinq photos de la journée');
const vignettes = (page: Page) => cinq(page).locator('button[data-galerie-vignette]');

/** Ouvre la 3e vignette et attend l'image agrandie. */
async function ouvrirTroisieme(page: Page) {
  await page.goto('/');
  const troisieme = vignettes(page).nth(2);
  await troisieme.click();
  const dialogue = cinq(page).locator('dialog[open]');
  await expect(dialogue).toBeVisible();
  return { troisieme, dialogue };
}

test('cinq photos : cinq vignettes, images paresseuses avec texte alternatif', async ({ page }) => {
  await page.goto('/');
  await expect(vignettes(page)).toHaveCount(5);
  for (const vignette of await vignettes(page).all()) {
    await expect(vignette).toHaveAttribute('type', 'button');
    await expect(vignette).toHaveAttribute('aria-label', /^Agrandir la photo : .+/);
    await expect(vignette).toHaveAttribute('data-grand', /\S/);
    const image = vignette.locator('img');
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('alt', /\S/);
  }
  await expect(vignettes(page).nth(0).locator('img')).toHaveAttribute('alt', 'Première photo de la journée');
  await expect(vignettes(page).nth(1).locator('img')).toHaveAttribute('alt', 'Cinq photos de la journée (photo 2 sur 5)');
  await expect(vignettes(page).nth(1)).toHaveAttribute('aria-label', 'Agrandir la photo : Cinq photos de la journée (photo 2 sur 5)');
  // Un seul dialogue, fermé ; l'image agrandie n'est pas chargée d'avance.
  await expect(cinq(page).locator('dialog')).toHaveCount(1);
  await expect(cinq(page).locator('dialog[open]')).toHaveCount(0);
  await expect(cinq(page).locator('dialog img')).not.toHaveAttribute('src', /./);
  // Les vignettes viennent après le texte.
  const ordre = await cinq(page).evaluate((a) => {
    const texte = a.querySelector('.actu__corps')!;
    const galerie = a.querySelector('[data-galerie-vignette]')!;
    return texte.compareDocumentPosition(galerie) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(ordre).toBeTruthy();
});

test('une photo : une image, ni vignette ni dialogue', async ({ page }) => {
  await page.goto('/');
  const une = article(page, 'Une seule photo');
  await expect(une.locator('img')).toHaveCount(1);
  await expect(une.locator('img')).toHaveAttribute('alt', 'Le groupe sous les arbres au début de la séance');
  await expect(une.locator('[data-galerie-vignette]')).toHaveCount(0);
  await expect(une.locator('dialog')).toHaveCount(0);
});

test('sans photo : aucun <img>', async ({ page }) => {
  await page.goto('/');
  const sans = article(page, 'Une actualité sans photo');
  await expect(sans).toHaveCount(1);
  await expect(sans.locator('img')).toHaveCount(0);
  await expect(sans.locator('dialog')).toHaveCount(0);
});

test('clic sur la 3e vignette : la photo correspondante, agrandie, dans le dialogue', async ({ page }) => {
  const { troisieme, dialogue } = await ouvrirTroisieme(page);
  const grand = await troisieme.getAttribute('data-grand');
  const image = dialogue.locator('img');
  await expect(image).toHaveAttribute('src', grand!);
  await expect(image).toHaveAttribute('alt', (await troisieme.locator('img').getAttribute('alt'))!);
  await expect.poll(() => image.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialogue.getByRole('button', { name: 'Fermer' })).toBeVisible();
});

test('Échap ferme, le focus revient à la 3e vignette', async ({ page }) => {
  const { troisieme } = await ouvrirTroisieme(page);
  await page.keyboard.press('Escape');
  await expect(cinq(page).locator('dialog[open]')).toHaveCount(0);
  await expect(troisieme).toBeFocused();
});

test('clic sur le fond ferme, le focus revient à la vignette', async ({ page }) => {
  const { troisieme } = await ouvrirTroisieme(page);
  await page.mouse.click(4, 4);
  await expect(cinq(page).locator('dialog[open]')).toHaveCount(0);
  await expect(troisieme).toBeFocused();
});

test('après fermeture, l’image agrandie est vidée : une autre vignette charge sa propre photo', async ({ page }) => {
  const { dialogue } = await ouvrirTroisieme(page);
  await page.keyboard.press('Escape');
  await expect(cinq(page).locator('dialog[open]')).toHaveCount(0);
  await expect(cinq(page).locator('dialog img')).not.toHaveAttribute('src', /./);
  const premiere = vignettes(page).first();
  await premiere.click();
  await expect(dialogue).toBeVisible();
  await expect(dialogue.locator('img')).toHaveAttribute('src', (await premiere.getAttribute('data-grand'))!);
  await expect(dialogue.locator('img')).toHaveAttribute('alt', (await premiere.locator('img').getAttribute('alt'))!);
});

test('un clic sur la photo agrandie ne ferme pas', async ({ page }) => {
  const { dialogue } = await ouvrirTroisieme(page);
  await dialogue.locator('img').click();
  await expect(dialogue).toBeVisible();
});

test('bouton « Fermer » ferme, le focus revient à la vignette', async ({ page }) => {
  const { troisieme, dialogue } = await ouvrirTroisieme(page);
  await dialogue.getByRole('button', { name: 'Fermer' }).click();
  await expect(cinq(page).locator('dialog[open]')).toHaveCount(0);
  await expect(troisieme).toBeFocused();
});

test('au clavier : Entrée ouvre, Échap ferme', async ({ page }) => {
  await page.goto('/');
  const deuxieme = vignettes(page).nth(1);
  await deuxieme.focus();
  await page.keyboard.press('Enter');
  const dialogue = cinq(page).locator('dialog[open]');
  await expect(dialogue).toBeVisible();
  await expect(dialogue.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deuxieme).toBeFocused();
});

test.describe('390 px, animations réduites', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('aucun débordement, axe sans violation (page puis dialogue ouvert)', async ({ page }) => {
    await page.goto('/');
    await animationsTerminees(page);
    await sansDebordement(page);
    await sansViolationAxe(page);
    await vignettes(page).nth(2).click();
    await expect(cinq(page).locator('dialog[open]')).toBeVisible();
    await sansDebordement(page);
    await sansViolationAxe(page);
  });
});

test('aucune violation de la CSP de public/.htaccess, photo agrandie comprise', async ({ page }) => {
  const htaccess = readFileSync('public/.htaccess', 'utf8');
  const CSP = /^\s*Header always set Content-Security-Policy "([^"]+)" env=!SANS_CSP$/m.exec(htaccess)?.[1] ?? '';
  expect(CSP).not.toBe('');
  const violations: string[] = [];
  await page.exposeFunction('__violation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __violation: (v: string) => void }).__violation(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.route(
    (u) => u.origin === URL_GALERIE,
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const reponse = await route.fetch();
      await route.fulfill({ response: reponse, headers: { ...reponse.headers(), 'content-security-policy': CSP } });
    },
  );
  const reponse = await page.goto('/');
  expect(reponse?.headers()['content-security-policy']).toBe(CSP);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState('networkidle');
  await vignettes(page).nth(2).click();
  const image = cinq(page).locator('dialog[open] img');
  await expect.poll(() => image.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  expect(violations).toEqual([]);
});
