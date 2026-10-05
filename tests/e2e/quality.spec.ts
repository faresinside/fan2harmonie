import { test, expect, type Page } from '@playwright/test';
import { site } from '../../src/config/site';
import { urlJeu } from '../fixtures/jeux';
import { animationsTerminees, REGLES_WCAG, sansDebordement, sansViolationAxe } from './outils';

/**
 * Portes de qualité : plan du site et robots.txt, accessibilité (axe, clavier, focus visible),
 * mise en page de 320 à 1920 px, mouvement réduit. Lighthouse : `npm run lighthouse` (lighthouserc.json).
 */

const PAGES = ['/', '/mentions-legales/'];

// ---------------------------------------------------------------------------------------------------------
test.describe('plan du site et robots.txt', () => {
  test('robots.txt : tout est permis sauf /admin/, plan du site sur l’adresse du site', async ({ request }) => {
    const reponse = await request.get('/robots.txt');
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()['content-type']).toMatch(/^text\/plain/);
    const lignes = (await reponse.text()).split('\n').map((l) => l.trim());
    expect(lignes).toContain('User-agent: *');
    expect(lignes).toContain('Allow: /');
    expect(lignes).toContain('Disallow: /admin/');
    const plan = lignes.find((l) => l.startsWith('Sitemap:'))?.slice('Sitemap:'.length).trim();
    expect(plan).toBe(new URL('/sitemap-index.xml', site.url).href);
  });

  test('sitemap-index.xml : l’accueil et les mentions légales, jamais /admin', async ({ request }) => {
    const index = await request.get('/sitemap-index.xml');
    expect(index.status()).toBe(200);
    const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');

    const sousPlans = locs(await index.text());
    expect(sousPlans.length).toBeGreaterThan(0);
    const adresses: string[] = [];
    for (const sousPlan of sousPlans) {
      expect(sousPlan.startsWith(site.url)).toBe(true);
      const reponse = await request.get(new URL(sousPlan).pathname);
      expect(reponse.status()).toBe(200);
      adresses.push(...locs(await reponse.text()));
    }
    expect(adresses.sort()).toEqual([new URL('/', site.url).href, new URL('/mentions-legales/', site.url).href]);
    expect(adresses.join(' ')).not.toContain('/admin');
  });
});

// ---------------------------------------------------------------------------------------------------------
test.describe('accessibilité (axe : WCAG 2.x A/AA et bonnes pratiques)', () => {
  for (const largeur of [360, 768, 1280]) {
    for (const chemin of PAGES) {
      test(`${chemin} à ${largeur} px : zéro violation`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 900 });
        expect((await page.goto(chemin))?.status()).toBe(200);
        await animationsTerminees(page);
        await sansViolationAxe(page, { regles: REGLES_WCAG });
      });
    }
  }

  test('menu mobile ouvert (360 px) : zéro violation', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    const bouton = page.locator('header button[aria-controls]');
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('header nav a').first()).toBeVisible();
    await animationsTerminees(page);
    await sansViolationAxe(page, { regles: REGLES_WCAG });
  });
});

// ---------------------------------------------------------------------------------------------------------
test.describe('clavier', () => {
  for (const chemin of PAGES) {
    test(`lien d’évitement (${chemin}) : premier arrêt, visible au focus, mène dans <main>`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(chemin);
      const lien = page.locator('a.lien-evitement');
      await expect(lien).not.toBeInViewport();

      await page.keyboard.press('Tab');
      await expect(lien).toBeFocused();
      await expect(lien).toHaveAttribute('href', '#contenu');
      await expect(lien).toBeInViewport({ ratio: 1 });

      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('contenu');
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');

      // La tabulation reprend dans le contenu, pas dans l'en-tête.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('main')?.id)).toBe('contenu');
    });
  }

  /** Parcourt toute la page au clavier ; pour chaque arrêt, décrit l'élément et son indicateur de focus. */
  async function parcoursClavier(page: Page) {
    const arrets: { element: string; contour: string; visible: boolean }[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const arret = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const largeur = parseFloat(s.outlineWidth);
        const couleur = s.outlineColor;
        const transparent = couleur === 'transparent' || /rgba\(.*,\s*0\)$/.test(couleur);
        const r = el.getBoundingClientRect();
        return {
          element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} « ${(el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('name') || ''} »`,
          contour: `${s.outlineStyle} ${s.outlineWidth} ${couleur}`,
          visible: s.outlineStyle !== 'none' && largeur >= 2 && !transparent && r.width > 0 && r.height > 0,
          dernier: el === [...document.querySelectorAll('footer a')].at(-1),
        };
      });
      if (!arret) break;
      arrets.push({ element: arret.element, contour: arret.contour, visible: arret.visible });
      if (arret.dernier) break;
    }
    return arrets;
  }

  for (const largeur of [360, 1280]) {
    for (const chemin of PAGES) {
      test(`focus visible sur chaque élément interactif (${chemin}, ${largeur} px)`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(chemin);
        const arrets = await parcoursClavier(page);

        // Le parcours couvre l'en-tête, le contenu et le pied de page.
        const elements = arrets.map((a) => a.element).join('\n');
        expect(elements).toContain('Aller au contenu');
        expect(elements).toContain('Fan 2 Harmonie');
        expect(elements).toContain('Mentions légales');
        if (largeur === 360) expect(elements).toContain('button « Menu »');
        else expect(elements).toContain('Le Qi Gong');
        if (chemin === '/') {
          for (const champ of ['input#contact-nom', 'input#contact-email', 'textarea#contact-message', 'input#contact-consentement', 'Envoyer mon message']) {
            expect(elements).toContain(champ);
          }
        }

        expect(arrets.filter((a) => !a.visible).map((a) => `${a.element} : ${a.contour}`)).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
test.describe('mise en page', () => {
  for (const largeur of [320, 360, 390, 768, 1024, 1280, 1920]) {
    for (const chemin of PAGES) {
      test(`${chemin} à ${largeur} px : aucun débordement, aucun contenu coupé`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(chemin);
        await sansDebordement(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        // Tout texte ou élément interactif visible tient dans la largeur de l'écran et dans sa propre boîte.
        const coupes = await page.evaluate(() => {
          const largeurVue = document.documentElement.clientWidth;
          const resultat: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('body *')) {
            if (el.closest('[aria-hidden="true"], .sr-only, [hidden], script, style')) continue;
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue; // masqué visuellement (indications de champ)
            const interactif = el.matches('a, button, input, select, textarea, img');
            const texte = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
            if (!interactif && !texte) continue;
            const nom = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} « ${(el.textContent ?? '').trim().slice(0, 30)} »`;
            if (r.left < -1 || r.right > largeurVue + 1) resultat.push(`${nom} hors de l’écran`);
            else if (texte && s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) resultat.push(`${nom} coupé`);
          }
          return resultat;
        });
        expect(coupes).toEqual([]);
      });
    }
  }

  for (const largeur of [320, 360, 390, 768, 1024, 1280, 1920]) {
    test(`en-tête à ${largeur} px : une seule rangée, marque, bouton et liens sans chevauchement`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto('/');
      const boites = await page.evaluate(() => {
        const boite = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { nom: (el.textContent ?? '').trim().slice(0, 20), x: r.left, y: r.top, d: r.right, b: r.bottom };
        };
        const entete = document.querySelector('header')!;
        const visibles = [
          entete.querySelector('.entete__logo'),
          entete.querySelector('.entete__nom'),
          entete.querySelector('button[aria-controls]'),
          ...entete.querySelectorAll('nav a'),
        ].filter((el): el is Element => !!el && el.getBoundingClientRect().width > 0);
        const barre = entete.querySelector('.entete__barre')!.getBoundingClientRect();
        const nom = entete.querySelector<HTMLElement>('.entete__nom')!;
        const marque = entete.querySelector<HTMLElement>('.entete__marque')!;
        return {
          elements: visibles.map(boite),
          hauteurBarre: barre.height,
          hauteurEntete: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hauteur-entete')) * 16,
          nomCoupe: nom.scrollWidth > nom.clientWidth + 1,
          // Le logo et le nom tiennent dans la boîte de la marque (sans empiéter sur l'espace avant le bouton).
          marqueDeborde: marque.scrollWidth > marque.clientWidth + 1,
        };
      });

      const chevauchements: string[] = [];
      boites.elements.forEach((a, i) =>
        boites.elements.slice(i + 1).forEach((b) => {
          if (a.x < b.d - 0.5 && b.x < a.d - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) chevauchements.push(`${a.nom} / ${b.nom}`);
        }),
      );
      expect(chevauchements).toEqual([]);
      expect(boites.nomCoupe).toBe(false);
      expect(boites.marqueDeborde).toBe(false);
      // Une seule rangée : la barre garde la hauteur de l'en-tête (le menu replié ne l'agrandit pas).
      expect(boites.hauteurBarre).toBeLessThanOrEqual(boites.hauteurEntete + 1);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------
test.describe('actualités : ordre du document = ordre visuel (WCAG 1.3.2)', () => {
  test.use({ baseURL: urlJeu('annule') });

  /**
   * Parties de la carte dans l'ordre du document, avec le haut de chaque boîte à l'écran.
   * Attendu : image (si présente) → date → titre → texte, et chaque partie commence au même niveau ou plus bas
   * que la précédente (l'ordre de lecture à l'écran est celui du document).
   */
  const partiesDeLaCarte = (page: Page, selecteur: string) =>
    page.locator(selecteur).first().evaluate((article) =>
      [...article.querySelectorAll('img, time, h3, .actu__corps')].map((el) => ({
        partie: el.matches('img') ? 'image' : el.matches('time') ? 'date' : el.matches('h3') ? 'titre' : 'texte',
        haut: el.getBoundingClientRect().top,
      })),
    );

  for (const largeur of [360, 1280]) {
    for (const [cas, selecteur, attendu] of [
      ['avec image', '#actualites article:has(img)', ['image', 'date', 'titre', 'texte']],
      ['sans image', '#actualites article:not(:has(img))', ['date', 'titre', 'texte']],
    ] as const) {
      test(`carte ${cas} (${largeur} px) : ${attendu.join(' → ')}, dans le document comme à l’écran`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.goto('/');
        await expect(page.locator(selecteur).first()).toBeVisible();
        const parties = await partiesDeLaCarte(page, selecteur);
        expect(parties.map((p) => p.partie)).toEqual(attendu);
        parties.slice(1).forEach((p, i) => {
          expect(p.haut, `${p.partie} commence sous ${parties[i]!.partie}`).toBeGreaterThanOrEqual(parties[i]!.haut - 0.5);
        });
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
test.describe('mouvement', () => {
  /** Éléments de l'accueil dont l'opacité calculée n'est pas 1. */
  const accueilTransparent = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('#accueil, #accueil *')]
        .filter((el) => getComputedStyle(el).opacity !== '1')
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
    );

  /**
   * Mouvement réduit : toute animation encore listée est instantanée (≤ 1 ms, durées forcées par global.css),
   * puis la liste se vide aussitôt.
   */
  async function aucuneAnimation(page: Page) {
    const durees = await page.evaluate(() =>
      document.getAnimations().map((a) => ({ nom: (a as CSSAnimation).animationName ?? a.constructor.name, fin: Number(a.effect?.getComputedTiming().endTime ?? 0) })),
    );
    expect(durees.filter((d) => d.fin > 1)).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 }).toBe(0);
  }

  test('mouvement réduit : aucune animation ni transition en cours, contenu visible d’emblée', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await aucuneAnimation(page);
    expect(await accueilTransparent(page)).toEqual([]);
    await expect(page.locator('#accueil h1')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  });

  test('mouvement réduit, menu mobile : s’ouvre sans animation', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('header button[aria-controls]').click();
    await expect(page.locator('header button[aria-controls]')).toHaveAttribute('aria-expanded', 'true');
    await aucuneAnimation(page);
    await expect(page.locator('header nav a').first()).toBeVisible();
  });

  test('animations permises : l’entrée de l’accueil se termine vite, tout le contenu finit opaque', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    // Durée totale de chaque animation d'entrée (retard + durée), lue avant qu'elle ne se termine.
    const fins = await page.evaluate(() =>
      document.getAnimations().map((a) => ({
        texte: !!(a.effect as KeyframeEffect | null)?.target?.closest('.accueil__texte'),
        fin: Number(a.effect?.getComputedTiming().endTime ?? 0),
      })),
    );
    expect(fins.length).toBeGreaterThan(0);
    // Le titre et l'appel à l'action ne sont pas retenus : texte d'accueil achevé en 1,1 s, entrée complète en 1,5 s.
    expect(Math.max(...fins.filter((f) => f.texte).map((f) => f.fin))).toBeLessThanOrEqual(1100);
    expect(Math.max(...fins.map((f) => f.fin))).toBeLessThanOrEqual(1500);

    await expect.poll(() => accueilTransparent(page), { timeout: 3000 }).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
test.describe('performance', () => {
  test('polices : seuls les sous-ensembles latins utiles sont téléchargés sur l’accueil', async ({ page }) => {
    const polices: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'font') polices.push(new URL(r.url()).pathname.split('/').at(-1) ?? '');
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(polices.filter((p) => p.includes('latin-ext'))).toEqual([]);
    expect(polices.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe('métadonnées', () => {
  test('theme-color = jeton --creme de tokens.css', async ({ page }) => {
    await page.goto('/');
    const creme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--creme').trim());
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', creme);
  });
});
