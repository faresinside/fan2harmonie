/**
 * Politique de sécurité du contenu (CSP) PARTIELLE de public/.htaccess, appliquée aux pages construites :
 * le serveur de prévisualisation n'envoie pas les en-têtes du .htaccess, donc la valeur exacte du fichier est
 * ajoutée ici aux réponses HTML. Aucune violation ne doit apparaître (rien n'est chargé ailleurs que sur le
 * site : « aucune donnée de visiteur ne quitte la France ») et le formulaire de contact doit fonctionner.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const htaccess = readFileSync('public/.htaccess', 'utf8');
const CSP = /^\s*Header always set Content-Security-Policy "([^"]+)" env=!SANS_CSP$/m.exec(htaccess)?.[1] ?? '';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function avecCsp(page: Page) {
  const violations: string[] = [];
  await page.exposeFunction('__violation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __violation: (v: string) => void }).__violation(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.route(
    (u) => u.origin === new URL(page.url() === 'about:blank' ? 'http://localhost:4321' : page.url()).origin,
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const reponse = await route.fetch();
      await route.fulfill({ response: reponse, headers: { ...reponse.headers(), 'content-security-policy': CSP } });
    },
  );
  return violations;
}

test('la CSP de public/.htaccess est bien celle attendue (rien vers l’extérieur)', () => {
  expect(CSP).toBe(
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'none'",
  );
  expect(CSP).not.toMatch(/script-src|style-src|default-src/);
});

for (const chemin of ['/', '/mentions-legales/']) {
  test(`${chemin} : aucune violation de la CSP, images et polices chargées`, async ({ page }) => {
    const violations = await avecCsp(page);
    const reponse = await page.goto(chemin);
    expect(reponse?.headers()['content-security-policy']).toBe(CSP);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    const images = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => ({ src: (i as HTMLImageElement).currentSrc, ok: (i as HTMLImageElement).naturalWidth > 0 })));
    for (const image of images) expect(image.ok, image.src).toBe(true);
    expect(await page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded'))).toBe(true);
    expect(violations).toEqual([]);
  });
}

test('témoin : une CSP trop stricte (img-src none) produit bien des violations détectées', async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction('__violation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __violation: (v: string) => void }).__violation(e.violatedDirective);
    });
  });
  await page.route('http://localhost:4321/', async (route) => {
    const reponse = await route.fetch();
    await route.fulfill({ response: reponse, headers: { ...reponse.headers(), 'content-security-policy': "img-src 'none'" } });
  });
  await page.goto('/');
  await expect.poll(() => violations.length).toBeGreaterThan(0);
});

test('/ : le formulaire de contact fonctionne sous la CSP (connect-src self)', async ({ page }) => {
  const violations = await avecCsp(page);
  await page.goto('/');
  const f = page.locator('#contact form');
  await page.route('**/api/contact.php', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  await f.getByLabel('Votre nom').fill('Camille Martin');
  await f.getByLabel('Votre adresse e-mail').fill('camille@example.org');
  await f.getByLabel('Votre message').fill('Bonjour !');
  await f.getByRole('checkbox').check();
  await f.getByRole('button', { name: 'Envoyer mon message' }).click();
  await expect(page.locator('#contact').getByRole('status')).toHaveText('Merci, votre message est bien parti. Je vous répondrai dès que possible.');
  expect(violations).toEqual([]);
});
