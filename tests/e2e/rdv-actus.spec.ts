import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { urlJeu } from '../fixtures/jeux';

/**
 * Prochains rendez-vous et actualités, sur des jeux de contenus de test (tests/fixtures/jeux.ts).
 * Chaque jeu est construit à part (CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>) et servi sur son propre port.
 */

const rendezvous = (page: Page) => page.locator('#rdv .rdv-liste > li');
const actualites = (page: Page) => page.locator('#actualites article');

async function sansViolationAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function sansDebordement(page: Page) {
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(deborde).toBe(false);
}

test.describe('aucun rendez-vous à venir (jeu « vide »)', () => {
  test.use({ baseURL: urlJeu('vide') });

  test('affiche « Prochaines dates bientôt », aucune date passée', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rdv').getByText('Prochaines dates bientôt', { exact: true })).toBeVisible();
    await expect(rendezvous(page)).toHaveCount(0);
    await expect(page.locator('#rdv time')).toHaveCount(0);
    await expect(page.locator('#rdv')).not.toContainText('Rendez-vous passé');
  });

  test('aucune actualité : section et lien de navigation absents, navigation cohérente', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#actualites')).toHaveCount(0);
    await expect(page.locator('header nav a[href="#actualites"]')).toHaveCount(0);
    for (const lien of await page.locator('header nav a[href^="#"]').all()) {
      const href = (await lien.getAttribute('href')) ?? '';
      await expect(page.locator(`[id="${href.slice(1)}"]`), href).toHaveCount(1);
    }
  });

  test('accessibilité (axe, 390 px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await sansViolationAxe(page);
  });
});

test.describe('rendez-vous annulé (jeu « annule »)', () => {
  test.use({ baseURL: urlJeu('annule') });

  test('reste visible avec la mention « Annulé », les autres non', async ({ page }) => {
    await page.goto('/');
    await expect(rendezvous(page)).toHaveCount(3);
    const annule = rendezvous(page).filter({ hasText: '15 mars' });
    await expect(annule.getByText('Annulé', { exact: true })).toBeVisible();
    await expect(annule.locator('time[datetime="2099-03-15"]')).toBeVisible();
    for (const jour of ['14 mars', '21 mars']) {
      await expect(rendezvous(page).filter({ hasText: jour }).getByText('Annulé', { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('prochains rendez-vous (jeu « annule »)', () => {
  test.use({ baseURL: urlJeu('annule') });

  test('le premier porte la mention « Prochain rendez-vous », et lui seul', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rdv').getByText('Prochain rendez-vous', { exact: true })).toHaveCount(1);
    await expect(rendezvous(page).first().getByText('Prochain rendez-vous', { exact: true })).toBeVisible();
  });

  test('jour, date, mois, heure « 16h00 », lieu et <time datetime>', async ({ page }) => {
    await page.goto('/');
    const premier = rendezvous(page).nth(0);
    await expect(premier.locator('time[datetime="2099-03-14"]')).toHaveText(/samedi\s*14\s*mars/);
    await expect(premier).toContainText('16h00');
    await expect(premier).toContainText('Parc de Rambouillet, près de la bergerie');
    await expect(premier).toContainText('Pensez à une tenue souple');
    await expect(rendezvous(page).nth(1).locator('time[datetime="2099-03-15"]')).toHaveText(/dimanche\s*15\s*mars/);
    const troisieme = rendezvous(page).nth(2);
    await expect(troisieme.locator('time[datetime="2099-03-21"]')).toHaveText(/samedi\s*21\s*mars/);
    await expect(troisieme).toContainText('10h30');
    await expect(troisieme).toContainText('Parc de Rambouillet, près du Rocher');
    await expect(page.locator('#rdv')).not.toContainText('16:00');
  });

  test('liens vers les infos pratiques et le contact', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rdv a', { hasText: 'Toutes les infos pratiques' })).toHaveAttribute('href', '#pratique');
    await expect(page.locator('#rdv a', { hasText: 'Une question ?' })).toHaveAttribute('href', '#contact');
  });

  test('actualités : plus récente d’abord, date en français, image avec texte alternatif', async ({ page }) => {
    await page.goto('/');
    await expect(actualites(page)).toHaveCount(2);
    const premiere = actualites(page).nth(0);
    await expect(premiere.locator('h3')).toHaveText('Une séance spéciale pour accueillir le printemps');
    await expect(premiere.locator('time[datetime="2099-02-20"]')).toHaveText('20 février 2099');
    await expect(premiere).toContainText('nous saluerons le retour du printemps');
    const image = premiere.locator('img');
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute('alt', 'Une séance spéciale pour accueillir le printemps');
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('width', /^\d+$/);
    await expect(image).toHaveAttribute('height', /^\d+$/);
    await expect(actualites(page).nth(1).locator('h3')).toHaveText('Reprise des séances en plein air');
    await expect(actualites(page).nth(1).locator('img')).toHaveCount(0);
  });

  for (const largeur of [390, 1280]) {
    test(`accessibilité (axe, ${largeur} px) et aucun débordement`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await sansViolationAxe(page);
      await sansDebordement(page);
    });
  }
});

test.describe('tri et rendez-vous passés (jeu « melange »)', () => {
  test.use({ baseURL: urlJeu('melange') });

  test('dates passées exclues, ordre croissant par date puis heure', async ({ page }) => {
    await page.goto('/');
    await expect(rendezvous(page)).toHaveCount(3);
    await expect(page.locator('#rdv')).not.toContainText('PASSE');
    const dates = await rendezvous(page).locator('time[datetime*="-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('datetime')),
    );
    expect(dates).toEqual(['2099-03-14', '2099-03-14', '2099-04-04']);
    await expect(rendezvous(page).nth(0)).toContainText('10h00');
    await expect(rendezvous(page).nth(1)).toContainText('16h00');
  });

  test('les 3 actualités les plus récentes, plus récente d’abord', async ({ page }) => {
    await page.goto('/');
    await expect(actualites(page).locator('h3')).toHaveText([
      'Actualité de mars',
      'Actualité de février',
      'Actualité de janvier',
    ]);
    await expect(page.locator('#actualites')).not.toContainText('décembre');
    await expect(actualites(page).nth(0).locator('time')).toHaveText('1er mars 2026');
  });
});

test.describe('texte contenant du HTML (jeu « xss »)', () => {
  test.use({ baseURL: urlJeu('xss') });

  test('affiché comme texte, jamais exécuté', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto('/');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__x'])).toBeUndefined();
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__y'])).toBeUndefined();

    const rdv = page.locator('#rdv');
    await expect(rdv).toContainText('<script>window.__x=1</script> & <b>gras</b>');
    await expect(rdv).toContainText('Parc & <i>bergerie</i>');

    const article = actualites(page).first();
    await expect(article.locator('h3')).toHaveText('Titre <b>x</b> & co');
    await expect(article).toContainText('Texte avant & après.');
    await expect(article).toContainText('<script>window.__x=1</script>');
    await expect(article).toContainText('Un <b>x</b> en ligne &');

    await expect(page.locator('#rdv script, #actualites script')).toHaveCount(0);
    await expect(page.locator('#rdv :is(b, i, img), #actualites :is(b, i, img)')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });
});

test.describe('actualité sans image (jeu « sans-image »)', () => {
  test.use({ baseURL: urlJeu('sans-image') });

  test('la carte s’affiche, aucun élément <img>', async ({ page }) => {
    await page.goto('/');
    await expect(actualites(page)).toHaveCount(1);
    await expect(actualites(page).first().locator('h3')).toHaveText('Une actualité sans image');
    expect(await page.evaluate(() => document.querySelectorAll('article img').length)).toBe(0);
  });
});

test.describe('titre de 90 caractères et mot très long (jeu « titre-long », 360 px)', () => {
  test.use({ baseURL: urlJeu('titre-long'), viewport: { width: 360, height: 780 } });

  test('aucun débordement horizontal', async ({ page }) => {
    await page.goto('/');
    await expect(actualites(page).first().locator('h3')).toBeVisible();
    await sansDebordement(page);
    for (const bloc of [...(await actualites(page).all()), ...(await rendezvous(page).all())]) {
      const { scroll, client } = await bloc.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
      expect(scroll).toBeLessThanOrEqual(client);
    }
  });
});

test.describe('contenu réel', () => {
  test('rendez-vous ou « Prochaines dates bientôt », jamais une zone vide', async ({ page }) => {
    await page.goto('/');
    const n = await rendezvous(page).count();
    if (n === 0) await expect(page.locator('#rdv').getByText('Prochaines dates bientôt')).toBeVisible();
    else await expect(rendezvous(page).first()).toBeVisible();
  });

  test('accessibilité (axe, 390 px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await sansViolationAxe(page);
  });
});
