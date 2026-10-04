import { test, expect, type Page } from '@playwright/test';

const ANCRES = ['accueil', 'rdv', 'pratique', 'qigong', 'qui', 'actualites', 'contact'];

/** Fautes de frappe du texte d'origine (source/texteSite.txt) qui ne doivent jamais être publiées. */
const FAUTES = ['cinqans', 'aborderma', 'Prochainsrendez', 'ensouffrance', 'sangcircule', 'retrouvervotre'];

test.describe('structure de la page', () => {
  test('les 7 ancres de section existent', async ({ page }) => {
    await page.goto('/');
    for (const id of ANCRES) await expect(page.locator(`[id="${id}"]`), `#${id}`).toHaveCount(1);
  });

  test('chaque lien de navigation pointe vers une ancre existante', async ({ page }) => {
    await page.goto('/');
    const liens = page.locator('header nav a[href^="#"]');
    expect(await liens.count()).toBeGreaterThanOrEqual(6);
    for (const lien of await liens.all()) {
      const href = (await lien.getAttribute('href')) ?? '';
      await expect(page.locator(`[id="${href.slice(1)}"]`), href).toHaveCount(1);
    }
  });

  test('un seul h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('un seul appel à l’action « Venez essayer » vers #rdv', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Venez essayer' });
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute('href', '#rdv');
  });

  test('lien « Voir la carte » vers OpenStreetMap aux coordonnées du site', async ({ page }) => {
    await page.goto('/');
    const lien = page.locator('a', { hasText: 'Voir la carte' });
    await expect(lien).toHaveCount(1);
    const href = (await lien.getAttribute('href')) ?? '';
    expect(href).toContain('openstreetmap.org');
    expect(href).toContain('mlat=48.64703');
    expect(href).toContain('mlon=1.811268');
    await expect(lien).toHaveAttribute('target', '_blank');
    await expect(lien).toHaveAttribute('rel', /noopener/);
    await expect(lien).toContainText('nouvel onglet');
  });

  test('pied de page : lien « Mentions légales »', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer a', { hasText: 'Mentions légales' })).toHaveAttribute(
      'href',
      '/mentions-legales',
    );
  });
});

test.describe('textes de Stéphanie', () => {
  test('La pratique : texte corrigé', async ({ page }) => {
    await page.goto('/');
    const pratique = page.locator('#pratique');
    await expect(pratique).toContainText('Gratuite et accessible à tous');
    await expect(pratique).toContainText('Mouvements doux dans le respect de notre corps');
    // Les dates vivent dans la collection « rendezvous », pas dans le texte.
    await expect(pratique).not.toContainText('Samedi 3 octobre');
  });

  test('« contactez-moi » renvoie vers #contact', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#pratique a', { hasText: 'contactez-moi' })).toHaveAttribute('href', '#contact');
  });

  test('Qui est Fan 2 Harmonie : « cinq ans »', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#qui')).toContainText('cinq ans');
  });

  test('aucune faute de frappe connue dans la page', async ({ page }) => {
    await page.goto('/');
    const texte = (await page.locator('body').textContent()) ?? '';
    for (const faute of FAUTES) expect(texte, faute).not.toContain(faute);
  });
});

test.describe('menu mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('s’ouvre au clavier (Entrée) : aria-expanded passe à true', async ({ page }) => {
    await page.goto('/');
    const bouton = page.locator('button[aria-controls]');
    await expect(bouton).toBeVisible();
    await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    const menu = page.locator(`[id="${await bouton.getAttribute('aria-controls')}"]`);
    await expect(menu.locator('a[href="#pratique"]')).toBeHidden();
    await bouton.focus();
    await page.keyboard.press('Enter');
    await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('a[href="#pratique"]')).toBeVisible();
  });

  test('Espace ouvre, Échap ferme et rend le focus au bouton', async ({ page }) => {
    await page.goto('/');
    const bouton = page.locator('button[aria-controls]');
    await bouton.focus();
    await page.keyboard.press('Space');
    await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    await expect(bouton).toBeFocused();
  });

  test('un clic sur un lien ferme le menu', async ({ page }) => {
    await page.goto('/');
    const bouton = page.locator('button[aria-controls]');
    await bouton.click();
    await page.locator('header nav a[href="#qigong"]').click();
    await expect(bouton).toHaveAttribute('aria-expanded', 'false');
  });
});

/** Tous les liens de la navigation sont visibles et mènent à une ancre existante ; aucun bouton de menu inutile. */
async function navigationUtilisable(page: Page) {
  const liens = page.locator('header nav a[href^="#"]');
  expect(await liens.count()).toBeGreaterThanOrEqual(6);
  for (const lien of await liens.all()) {
    await expect(lien).toBeVisible();
    const href = (await lien.getAttribute('href')) ?? '';
    await expect(page.locator(`[id="${href.slice(1)}"]`), href).toHaveCount(1);
  }
  await expect(page.locator('button[aria-controls]')).toBeHidden();
}

for (const largeur of [390, 1280]) {
  test.describe(`sans JavaScript (${largeur} px)`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: largeur, height: 844 } });

    test('la navigation reste visible et utilisable', async ({ page }) => {
      await page.goto('/');
      await navigationUtilisable(page);
    });
  });
}

test.describe('script du menu en échec (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la navigation reste visible si le script ne se charge pas', async ({ page }) => {
    // Script externe : requête annulée. Script en ligne (classique ou module) : retiré de la réponse HTML.
    await page.route('**/*.js', (route) => route.abort());
    await page.route('**/', async (route) => {
      const reponse = await route.fetch();
      const html = (await reponse.text()).replace(/<script(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/g, '');
      await route.fulfill({ response: reponse, body: html });
    });
    await page.goto('/');
    await navigationUtilisable(page);
  });
});

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('aucun défilement horizontal', async ({ page }) => {
    await page.goto('/');
    const deborde = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(deborde).toBe(false);
  });
});
