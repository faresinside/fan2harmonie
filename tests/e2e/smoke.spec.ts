import { test, expect } from '@playwright/test';

test("la page d'accueil répond et a un h1", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});

test('le lieu de la pratique garde ses coordonnées et son lien Google Maps', async ({ page }) => {
  await page.goto('/');
  const pratique = page.locator('#pratique');
  await expect(pratique).toContainText('48,64703° N, 1,811268° E');
  await expect(pratique.getByRole('link', { name: /Ouvrir dans Google Maps/ })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=48.64703,1.811268',
  );
});

test("l'accueil affiche les textes réglés (titre, infos, bouton, bienfaits dans l'ordre)", async ({ page }) => {
  await page.goto('/');
  const accueil = page.locator('#accueil');

  // Le « : » masqué (sr-only) reste entre le titre et le sous-titre pour les lecteurs d'écran.
  await expect(page.locator('h1')).toContainText('Qi Gong : Animation découverte');
  await expect(page.locator('h1 .accueil__titre-principal')).toHaveText('Qi Gong');
  await expect(page.locator('h1 .accueil__titre-second')).toHaveText('Animation découverte');
  await expect(page.locator('h1 .sr-only')).toHaveText(':');

  await expect(accueil.locator('.accueil__accent')).toHaveText('1 heure pour vous…');
  await expect(accueil.locator('.accueil__devise')).toHaveText('Respirez, Bougez, Équilibrez-vous');
  await expect(accueil.locator('.accueil__infos')).toHaveText(
    'Parc de Rambouillet · samedis ou dimanches à 16h00 · gratuit',
  );
  await expect(accueil.locator('.accueil__infos [aria-hidden="true"]')).toHaveCount(2);

  const bouton = accueil.getByRole('link', { name: 'Venez essayer' });
  await expect(bouton).toHaveAttribute('href', '#rdv');

  const bienfaits = accueil.locator('.bienfaits__item');
  await expect(bienfaits).toHaveText([
    'Faire circuler l’énergie',
    'Calmer l’esprit',
    'Travailler les muscles profonds',
    'Souplesse',
  ]);
  await expect(bienfaits.locator('svg')).toHaveCount(4);
});
