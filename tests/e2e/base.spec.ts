import { test, expect, type Page } from '@playwright/test';

/** Familles réellement chargées (FontFace au statut « loaded »). */
async function famillesChargees(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.status === 'loaded')
      .map((f) => f.family.replace(/["']/g, ''));
  });
}

test.describe('mise en page de base', () => {
  test('html lang="fr", un seul h1, meta description non vide', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('h1')).toHaveCount(1);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('JSON-LD parsable : site (WebSite) et séances à venir (Event) gratuites, sans entreprise ni commerce', async ({ page }) => {
    await page.goto('/');
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(scripts.length).toBe(1);
    const donnees = JSON.parse(scripts[0] ?? '') as { '@context': string; '@graph': Record<string, unknown>[] };
    expect(donnees['@context']).toBe('https://schema.org');
    const [site, ...evenements] = donnees['@graph'];
    expect(site).toMatchObject({ '@type': 'WebSite', name: 'Fan 2 Harmonie', inLanguage: 'fr-FR' });
    expect(JSON.stringify(donnees)).not.toMatch(/LocalBusiness|priceRange|areaServed|postalCode|streetAddress/);
    // Chaque séance à venir : évènement gratuit, daté à l'heure de Paris, avec un lieu.
    for (const e of evenements) {
      expect(e).toMatchObject({ '@type': 'Event', isAccessibleForFree: true, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode' });
      expect(e['startDate']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+0[12]:00$/);
      expect(e['location']).toMatchObject({ '@type': 'Place' });
    }
    // Un évènement par feuillet de la liste des rendez-vous.
    await expect(page.locator('#rdv li[data-date]')).toHaveCount(evenements.length);
  });

  test('lien canonique présent et absolu', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);
    expect(new URL(href ?? '').pathname).toBe('/');
  });

  test('Open Graph : titre, description, url, image absolue, locale fr_FR', async ({ page }) => {
    await page.goto('/');
    const og = async (p: string) => page.locator(`meta[property="og:${p}"]`).getAttribute('content');
    expect(await og('title')).toBeTruthy();
    expect(await og('description')).toBeTruthy();
    expect(await og('type')).toBe('website');
    expect(await og('locale')).toBe('fr_FR');
    expect(await og('url')).toMatch(/^https?:\/\//);
    expect(await og('image')).toMatch(/^https?:\/\//);
    expect((await og('image:alt'))?.trim()).toBeTruthy();
  });

  test('JSON-LD : aucun « < » brut (ne peut pas fermer la balise script)', async ({ page }) => {
    const html = await (await page.request.get('/')).text();
    const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(bloc.length).toBeGreaterThan(0);
    expect(bloc).not.toContain('<');
  });

  test("lien d'évitement vers #contenu, cible présente", async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="#contenu"]').first()).toBeAttached();
    await expect(page.locator('main#contenu')).toHaveCount(1);
  });

  test('polices locales chargées (Cormorant, Source Sans 3, Allura)', async ({ page }) => {
    await page.goto('/');
    const familles = await famillesChargees(page);
    expect(familles).toContain('Cormorant Variable');
    expect(familles).toContain('Source Sans 3 Variable');
    expect(familles).toContain('Allura');
  });

  test('Allura couvre les accents français (é è ê à ç œ)', async ({ page }) => {
    await page.goto('/');
    const manquants = await page.evaluate(async () => {
      await document.fonts.load('48px Allura', 'éèêàçœÉ');
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return ['canvas'];
      const largeur = (police: string, c: string) => {
        ctx.font = police;
        return ctx.measureText(c).width;
      };
      // Si Allura possède le glyphe, la police de repli n'intervient pas : largeurs identiques.
      return [...'éèêàçœÉ'].filter(
        (c) => largeur('48px Allura, monospace', c) !== largeur('48px Allura, serif', c),
      );
    });
    expect(manquants).toEqual([]);
  });

  test('icônes décoratives masquées aux lecteurs d’écran', async ({ page }) => {
    await page.goto('/');
    const icones = page.locator('svg.icone');
    expect(await icones.count()).toBeGreaterThanOrEqual(4);
    for (const svg of await icones.all()) {
      const role = await svg.getAttribute('role');
      if (role === 'img') {
        const id = await svg.getAttribute('aria-labelledby');
        await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
      } else {
        await expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });

  test('aucune erreur dans la console', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erreurs.push(m.text());
    });
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(erreurs).toEqual([]);
  });
});

test.describe('icônes du site (favicon)', () => {
  test('SVG, PNG 32 px de repli et apple-touch-icon : liens présents, fichiers servis avec le bon type', async ({ page, request }) => {
    await page.goto('/');
    const attendus: [string, string, string][] = [
      ['link[rel="icon"][type="image/svg+xml"]', '/favicon.svg', 'image/svg+xml'],
      ['link[rel="icon"][type="image/png"][sizes="32x32"]', '/favicon-32.png', 'image/png'],
      ['link[rel="apple-touch-icon"]', '/apple-touch-icon.png', 'image/png'],
    ];
    for (const [selecteur, href, type] of attendus) {
      await expect(page.locator(selecteur), selecteur).toHaveAttribute('href', href);
      const reponse = await request.get(href);
      expect(reponse.status(), href).toBe(200);
      expect(reponse.headers()['content-type'], href).toContain(type);
    }
    expect((await request.get('/icon-512.png')).status()).toBe(200);
    // L'image de partage reste la photo d'accueil recadrée.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/_astro\/hero\..*\.jpg$/);
  });
});
