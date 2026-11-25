import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { parse } from 'yaml';
import { enTeteMd, petitsTextes } from './outils';

/** Petits textes actuels du site (modifiables dans l'administration). */
const T = petitsTextes();

/** Infos de l'accueil telles qu'écrites dans src/content/reglages/accueil.md (modifiables dans l'administration). */
const reglagesAccueil = parse(readFileSync('src/content/reglages/accueil.md', 'utf8').split('---')[1] ?? '') as { infos: string[]; devise: string };
const infosAccueil = reglagesAccueil.infos;

test("la page d'accueil répond et a un h1", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});

test('le lieu de la pratique garde ses coordonnées et son lien Google Maps', async ({ page }) => {
  await page.goto('/');
  const pratique = page.locator('#pratique');
  await expect(pratique).toContainText('48,64703° N, 1,811268° E');
  // Premier lien : le lieu habituel (le second, s'il existe, est celui de l'autre lieu, par mauvais temps).
  await expect(pratique.getByRole('link', { name: T.pratique.lienCarte }).first()).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=48.64703,1.811268',
  );
});

test('autre lieu (par mauvais temps) : son encadré, et son lien Google Maps si ses coordonnées sont données', async ({ page }) => {
  const lieu = enTeteMd<{ autreLieu?: { nom?: string; latitude?: number; longitude?: number } }>('src/content/reglages/lieu.md');
  const autre = lieu.autreLieu;
  await page.goto('/');
  const encadre = page.locator('#lieu-autre');
  if (!autre?.nom) {
    await expect(encadre).toHaveCount(0);
    return;
  }
  await expect(encadre.locator('.lieu-carte__titre')).toHaveText(T.pratique.titreAutreLieu);
  await expect(encadre).toContainText(autre.nom);
  const lien = encadre.getByRole('link', { name: T.pratique.lienCarte });
  if (autre.latitude !== undefined && autre.longitude !== undefined) {
    await expect(lien).toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${autre.latitude},${autre.longitude}`);
  } else {
    await expect(lien).toHaveCount(0);
  }
});

test('réseaux sociaux : liens seulement pour les comptes remplis (contact et pied de page), nouvel onglet sûr', async ({ page }) => {
  await page.goto('/');
  const comptes = [T.reseaux?.facebook, T.reseaux?.instagram].filter((u): u is string => Boolean(u));
  for (const zone of ['#contact', 'footer']) {
    const liens = page.locator(`${zone} .reseaux__lien`);
    await expect(liens).toHaveCount(comptes.length);
    for (const [i, url] of comptes.entries()) {
      await expect(liens.nth(i)).toHaveAttribute('href', url);
      await expect(liens.nth(i)).toHaveAttribute('rel', /noopener/);
    }
  }
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
  await expect(accueil.locator('.accueil__devise')).toHaveText(reglagesAccueil.devise);
  await expect(accueil.locator('.accueil__infos')).toHaveText(infosAccueil.join(' · '));
  await expect(accueil.locator('.accueil__infos [aria-hidden="true"]')).toHaveCount(infosAccueil.length - 1);

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
