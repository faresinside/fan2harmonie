import { test, expect, type Page } from '@playwright/test';
import { urlJeu } from '../fixtures/jeux';
import { sansDebordement, sansViolationAxe } from './outils';

/**
 * Prochains rendez-vous et actualités, sur des jeux de contenus de test (tests/fixtures/jeux.ts).
 * Chaque jeu est construit à part (CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>) et servi sur son propre port.
 */

const rendezvous = (page: Page) => page.locator('#rdv .rdv-liste > li');
const actualites = (page: Page) => page.locator('#actualites article');

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

test.describe('ni rendez-vous ni actualités, dossiers absents (jeu « aucun »)', () => {
  test.use({ baseURL: urlJeu('aucun') });

  test('le site se construit : « Prochaines dates bientôt », pas de section ni de lien Actualités, textes des pages présents', async ({ page }) => {
    const reponse = await page.goto('/');
    expect(reponse?.status()).toBe(200);
    await expect(page.locator('#rdv').getByText('Prochaines dates bientôt', { exact: true })).toBeVisible();
    await expect(rendezvous(page)).toHaveCount(0);
    await expect(page.locator('#actualites')).toHaveCount(0);
    await expect(page.locator('header nav a[href="#actualites"]')).toHaveCount(0);
    for (const id of ['pratique', 'qigong', 'qui', 'contact']) {
      await expect(page.locator(`[id="${id}"]`), id).toHaveCount(1);
    }
    expect((await page.goto('/mentions-legales/'))?.status()).toBe(200);
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

test.describe('premier rendez-vous annulé (jeu « annule-premier »)', () => {
  test.use({ baseURL: urlJeu('annule-premier') });

  test('« Prochain rendez-vous » va au premier non annulé, l’annulé garde sa place et sa mention', async ({ page }) => {
    await page.goto('/');
    await expect(rendezvous(page)).toHaveCount(3);
    await expect(page.locator('#rdv').getByText('Prochain rendez-vous', { exact: true })).toHaveCount(1);
    const premier = rendezvous(page).nth(0);
    await expect(premier.locator('time[datetime="2099-03-14"]')).toBeVisible();
    await expect(premier.getByText('Annulé', { exact: true })).toBeVisible();
    await expect(premier.getByText('Prochain rendez-vous', { exact: true })).toHaveCount(0);
    const second = rendezvous(page).nth(1);
    await expect(second.locator('time[datetime="2099-03-15"]')).toBeVisible();
    await expect(second.getByText('Prochain rendez-vous', { exact: true })).toBeVisible();
    // Mise en avant (carte, halo) : sur le second seulement.
    await expect(premier).not.toHaveClass(/rdv--prochain/);
    await expect(second).toHaveClass(/rdv--prochain/);
  });
});

/** Boîtes des feuillets, dans l'ordre du document. */
async function boites(page: Page) {
  const liste = [];
  for (const li of await rendezvous(page).all()) {
    const b = await li.boundingBox();
    if (!b) throw new Error('feuillet invisible');
    liste.push(b);
  }
  return liste;
}

test.describe('premier rendez-vous annulé, grand écran (jeu « annule-premier », 1280 px)', () => {
  test.use({ baseURL: urlJeu('annule-premier'), viewport: { width: 1280, height: 900 } });

  test('une seule colonne : ordre visuel = ordre chronologique du document', async ({ page }) => {
    await page.goto('/');
    const dates = await rendezvous(page).locator('time[datetime*="-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('datetime')),
    );
    expect(dates).toEqual(['2099-03-14', '2099-03-15', '2099-03-21']);
    const b = await boites(page);
    for (let i = 1; i < b.length; i++) {
      const prec = b[i - 1]!;
      const cour = b[i]!;
      // Strictement en dessous du précédent, jamais côte à côte.
      expect(cour.y, `feuillet ${i + 1}`).toBeGreaterThanOrEqual(prec.y + prec.height);
    }
    const second = rendezvous(page).nth(1);
    await expect(second).toHaveClass(/rdv--prochain/);
    await expect(second.getByText('Prochain rendez-vous', { exact: true })).toBeVisible();
  });
});

test.describe('prochain en premier, grand écran (jeu « annule », 1280 px)', () => {
  test.use({ baseURL: urlJeu('annule'), viewport: { width: 1280, height: 900 } });

  test('deux colonnes : le prochain à gauche, les suivants empilés à droite, dans l’ordre', async ({ page }) => {
    await page.goto('/');
    const dates = await rendezvous(page).locator('time[datetime*="-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('datetime')),
    );
    expect(dates).toEqual(['2099-03-14', '2099-03-15', '2099-03-21']);
    await expect(rendezvous(page).first()).toHaveClass(/rdv--prochain/);
    const [prochain, deuxieme, troisieme] = await boites(page);
    expect(deuxieme!.x).toBeGreaterThanOrEqual(prochain!.x + prochain!.width);
    expect(troisieme!.x).toBe(deuxieme!.x);
    expect(troisieme!.y).toBeGreaterThanOrEqual(deuxieme!.y + deuxieme!.height);
  });
});

test.describe('tous les rendez-vous annulés (jeu « tout-annule »)', () => {
  test.use({ baseURL: urlJeu('tout-annule') });

  test('aucune mention « Prochain rendez-vous », chacun marqué « Annulé »', async ({ page }) => {
    await page.goto('/');
    await expect(rendezvous(page)).toHaveCount(2);
    await expect(page.locator('#rdv').getByText('Prochain rendez-vous', { exact: true })).toHaveCount(0);
    await expect(page.locator('#rdv .rdv--prochain')).toHaveCount(0);
    for (const item of await rendezvous(page).all()) {
      await expect(item.getByText('Annulé', { exact: true })).toBeVisible();
    }
  });
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

/**
 * Script du navigateur (src/scripts/rendezvous.ts) : le jour même, les rendez-vous passés depuis la dernière
 * construction sont masqués, la mise en avant passe au prochain non annulé, et « Prochaines dates bientôt »
 * apparaît s'il n'en reste aucun. Date du jour simulée (horloge de Playwright). Jeu « annule » : 14 mars,
 * 15 mars (annulé), 21 mars 2099.
 */
test.describe('rendez-vous passés depuis la construction : masqués dans le navigateur (jeu « annule »)', () => {
  test.use({ baseURL: urlJeu('annule') });
  const dates = (page: Page) => rendezvous(page).evaluateAll((lis) => lis.map((li) => (li as HTMLElement).dataset['date']));

  test('le 15 mars : le 14 masqué, l’annulé garde sa place, « Prochain rendez-vous » passe au 21', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2099-03-15T10:00:00+01:00'));
    await page.goto('/');
    // Ordre du document inchangé (chronologique), rien n'est déplacé.
    expect(await dates(page)).toEqual(['2099-03-14', '2099-03-15', '2099-03-21']);
    await expect(rendezvous(page).nth(0)).toBeHidden();
    await expect(rendezvous(page).nth(1)).toBeVisible();
    await expect(rendezvous(page).nth(1).getByText('Annulé', { exact: true })).toBeVisible();
    await expect(rendezvous(page).nth(1)).not.toHaveClass(/rdv--prochain/);
    const vingtEtUn = rendezvous(page).nth(2);
    await expect(vingtEtUn).toHaveClass(/rdv--prochain/);
    await expect(vingtEtUn.getByText('Prochain rendez-vous', { exact: true })).toBeVisible();
    await expect(page.locator('#rdv').getByText('Prochain rendez-vous', { exact: true })).toHaveCount(1);
    await expect(rendezvous(page).nth(0)).not.toHaveClass(/rdv--prochain/);
    // Une colonne, et jamais de propriété CSS order.
    await expect(page.locator('#rdv .rdv-liste')).not.toHaveClass(/rdv-liste--deux-colonnes/);
    for (const li of await rendezvous(page).all()) expect(await li.evaluate((e) => getComputedStyle(e).order)).toBe('0');
    await expect(page.locator('#rdv').getByText('Prochaines dates bientôt')).toBeHidden();
  });

  test('le 22 mars : tout est passé, « Prochaines dates bientôt » s’affiche', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2099-03-22T08:00:00+01:00'));
    await page.goto('/');
    await expect(page.locator('#rdv').getByText('Prochaines dates bientôt', { exact: true })).toBeVisible();
    for (const li of await rendezvous(page).all()) await expect(li).toBeHidden();
  });

  test('le 14 mars à 23 h 30 : le rendez-vous du jour reste affiché', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2099-03-14T23:30:00+01:00'));
    await page.goto('/');
    await expect(rendezvous(page).nth(0)).toBeVisible();
    await expect(rendezvous(page).nth(0)).toHaveClass(/rdv--prochain/);
  });

  test('accessibilité (axe) une fois des rendez-vous masqués', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2099-03-15T10:00:00+01:00'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(rendezvous(page).nth(0)).toBeHidden();
    await sansViolationAxe(page);
  });
});

test.describe('sans JavaScript : comportement de la construction inchangé (jeu « annule »)', () => {
  test.use({ baseURL: urlJeu('annule'), javaScriptEnabled: false });

  test('trois feuillets visibles, le premier mis en avant, message caché', async ({ page }) => {
    await page.goto('/');
    await expect(rendezvous(page)).toHaveCount(3);
    for (const li of await rendezvous(page).all()) await expect(li).toBeVisible();
    await expect(rendezvous(page).nth(0)).toHaveClass(/rdv--prochain/);
    await expect(page.locator('#rdv').getByText('Prochaines dates bientôt')).toBeHidden();
  });
});
