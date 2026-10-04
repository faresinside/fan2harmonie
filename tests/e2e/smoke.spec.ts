import { test, expect } from '@playwright/test';

test("la page d'accueil répond et a un h1", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});