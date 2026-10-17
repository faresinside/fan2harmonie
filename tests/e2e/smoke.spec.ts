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
