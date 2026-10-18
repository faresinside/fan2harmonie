import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { site } from '../../src/config/site';

/** Front matter d'un fichier de réglages (src/content/reglages/<nom>.md), lu comme le fait le site. */
function reglages<T>(nom: string): T {
  const texte = readFileSync(`src/content/reglages/${nom}.md`, 'utf8').replace(/\r\n/g, '\n');
  return parse(/^---\n([\s\S]*?)\n---/.exec(texte)?.[1] ?? '') as T;
}

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
    const [accueil, ...autres] = donnees['@graph'];
    const evenements = autres;
    expect(accueil).toMatchObject({ '@type': 'WebSite', name: 'Fan 2 Harmonie', inLanguage: 'fr-FR' });
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

  test('référencement : titre et description de l’accueil = référencement.md, aucune vérification Google tant que le champ est vide, pas de noindex', async ({ page }) => {
    const ref = reglages<{ titre: string; description: string; verificationGoogle?: string }>('referencement');
    await page.goto('/');
    await expect(page).toHaveTitle(ref.titre);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', ref.description);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', ref.titre);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', ref.description);
    // Ni horaire ni jour dans le titre et la description : ils changeraient sans que Google le sache.
    expect(`${ref.titre} ${ref.description}`).not.toMatch(/\d\s?h\s?\d{0,2}|\d{1,2}:\d{2}/);
    // Le code de vérification n'est rendu que s'il est renseigné (le contenu de départ n'en a pas).
    expect(ref.verificationGoogle).toBeUndefined();
    await expect(page.locator('meta[name="google-site-verification"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('canonique de l’accueil : l’adresse du site, avec la barre finale', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL('/', site.url).href);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test('aucune FAQ : ni bloc « Questions fréquentes » sur l’accueil, ni FAQPage dans les données structurées (types : WebSite puis Event)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('details.faq__question, .faq')).toHaveCount(0);
    await expect(page.getByText(/questions fréquentes/i)).toHaveCount(0);
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graphe = (JSON.parse(scripts[0] ?? '') as { '@graph': Record<string, unknown>[] })['@graph'];
    expect(graphe.some((n) => n['@type'] === 'FAQPage')).toBe(false);
    expect(graphe[0]?.['@type']).toBe('WebSite');
    expect(graphe.slice(1).every((n) => n['@type'] === 'Event')).toBe(true);
  });

  test('plan du site : date de modification (lastmod) sur l’accueil seulement', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? '');
    expect(urls).toHaveLength(2);
    const loc = (u: string) => /<loc>([^<]+)<\/loc>/.exec(u)?.[1];
    const accueil = urls.find((u) => loc(u) === new URL('/', site.url).href) ?? '';
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(accueil)?.[1];
    expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Math.abs(Date.now() - new Date(lastmod ?? '').getTime())).toBeLessThan(24 * 3600 * 1000);
    expect(urls.filter((u) => u !== accueil).join('')).not.toContain('lastmod');
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
