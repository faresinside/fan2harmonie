import { existsSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { site } from '../../src/config/site';
import { lienMailto } from '../../src/lib/contact';
import { REGLES_WCAG, sansDebordement, sansViolationAxe } from './outils';

/**
 * Formulaire de contact (#contact) et page /mentions-legales.
 * L'adresse d'envoi (`site.formEndpoint`) est le script PHP du même hébergement (/api/contact.php, testé à part
 * par tests/php/) ; `astro preview` n'exécute pas de PHP : les envois sont donc toujours interceptés ici
 * (page.route).
 */

// Défilement doux désactivé : les clics sur le formulaire, en bas de page, ne visent pas une cible en mouvement.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const formulaire = (page: Page) => page.locator('#contact form');
const bouton = (page: Page) => formulaire(page).getByRole('button', { name: 'Envoyer mon message' });

/** Adresse d'envoi résolue par le navigateur (attribut action du formulaire). */
async function adresseEnvoi(page: Page): Promise<string> {
  return formulaire(page).evaluate((f) => (f as HTMLFormElement).action);
}

/** Compte les requêtes POST vers l'adresse d'envoi ; `reponse` décide de la suite. */
async function intercepter(page: Page, reponse: (route: Route) => Promise<void>) {
  const action = await adresseEnvoi(page);
  const envois: { corps: string; accept: string | undefined }[] = [];
  await page.route(
    (url) => url.href === action,
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      envois.push({ corps: route.request().postData() ?? '', accept: route.request().headers()['accept'] });
      await reponse(route);
    },
  );
  return envois;
}

async function remplir(page: Page, { consentement = true } = {}) {
  const f = formulaire(page);
  await f.getByLabel('Votre nom').fill('Camille Martin');
  await f.getByLabel('Votre adresse e-mail').fill('camille@example.org');
  await f.getByLabel('Votre message').fill('Bonjour, la séance de samedi est-elle maintenue ?');
  if (consentement) await f.getByRole('checkbox').check();
}


test.describe('formulaire de contact : structure', () => {
  test('envoi POST vers le script de contact du site (/api/contact.php), sans novalidate', async ({ page }) => {
    await page.goto('/');
    const f = formulaire(page);
    await expect(f).toHaveCount(1);
    await expect(f).toHaveAttribute('method', 'post');
    await expect(f).toHaveAttribute('action', '/api/contact.php');
    expect(site.formEndpoint).toBe('/api/contact.php');
    expect(await adresseEnvoi(page)).toBe(new URL('/api/contact.php', page.url()).href);
    await expect(f).not.toHaveAttribute('novalidate', /.*/);
    // Le script de contact compose lui-même le sujet de l'e-mail : aucun champ caché « _subject ».
    await expect(f.locator('input[name="_subject"]')).toHaveCount(0);
  });

  test('chaque champ a une étiquette visible et est obligatoire', async ({ page }) => {
    await page.goto('/');
    const f = formulaire(page);
    const champs = [
      { label: 'Votre nom', name: 'nom', autocomplete: 'name' },
      { label: 'Votre adresse e-mail', name: 'email', autocomplete: 'email' },
      { label: 'Votre message', name: 'message', autocomplete: null },
    ];
    for (const { label, name, autocomplete } of champs) {
      const champ = f.getByLabel(label);
      await expect(champ, label).toHaveAttribute('name', name);
      await expect(champ, label).toHaveAttribute('required', '');
      if (autocomplete) await expect(champ, label).toHaveAttribute('autocomplete', autocomplete);
      await expect(f.locator(`label[for="${await champ.getAttribute('id')}"]`), label).toBeVisible();
    }
    await expect(f.getByLabel('Votre adresse e-mail')).toHaveAttribute('type', 'email');
    await expect(f.getByLabel('Votre message')).toHaveJSProperty('tagName', 'TEXTAREA');

    const consentement = f.getByLabel(/J’accepte que mon nom, mon adresse e-mail et mon message/);
    await expect(consentement).toHaveAttribute('type', 'checkbox');
    await expect(consentement).toHaveAttribute('name', 'consentement');
    await expect(consentement).toHaveAttribute('required', '');
    await expect(bouton(page)).toHaveClass(/bouton--rose/);
  });

  test('texte d’accueil : mots de Stéphanie et adresse e-mail', async ({ page }) => {
    await page.goto('/');
    const contact = page.locator('#contact');
    await expect(contact).toContainText('Si besoin, n’hésitez pas à me contacter');
    await expect(contact).toContainText('Je vous réponds dès que possible.');
    await expect(contact.locator(`a[href="${lienMailto(site.email)}"]`).first()).toBeVisible();
  });
});

test.describe('champ piège anti-spam (_gotcha)', () => {
  test('masqué aux technologies d’assistance, hors de la tabulation', async ({ page }) => {
    await page.goto('/');
    const piege = formulaire(page).locator('input[name="_gotcha"]');
    await expect(piege).toHaveCount(1);
    await expect(piege).toHaveAttribute('tabindex', '-1');
    await expect(piege).toHaveAttribute('autocomplete', 'off');
    expect(await piege.evaluate((e) => e.closest('[aria-hidden="true"]') !== null)).toBe(true);

    // Parcours au clavier depuis le premier champ jusqu'au bouton : le piège n'est jamais atteint.
    await formulaire(page).getByLabel('Votre nom').focus();
    const atteints: string[] = [];
    for (let i = 0; i < 8; i++) {
      atteints.push(await page.evaluate(() => document.activeElement?.getAttribute('name') ?? document.activeElement?.tagName ?? ''));
      await page.keyboard.press('Tab');
    }
    expect(atteints).not.toContain('_gotcha');
    expect(atteints).toContain('consentement');
  });

  test('hors de l’écran (pas display:none), sans débordement à 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    const piege = formulaire(page).locator('input[name="_gotcha"]');
    expect(await piege.evaluate((e) => getComputedStyle(e).display)).not.toBe('none');
    const boite = await piege.boundingBox();
    expect(boite).not.toBeNull();
    expect(boite!.x + boite!.width).toBeLessThanOrEqual(0);
    await sansDebordement(page);
  });
});

test.describe('validation native', () => {
  test('formulaire vide : envoi bloqué, aucune requête, premier champ invalide ciblé', async ({ page }) => {
    await page.goto('/');
    const envois = await intercepter(page, (r) => r.fulfill({ status: 200, json: { ok: true } }));
    const adresse = page.url();
    await bouton(page).click();
    const nom = formulaire(page).getByLabel('Votre nom');
    await expect(nom).toBeFocused();
    expect(await nom.evaluate((e) => e.matches(':invalid'))).toBe(true);
    await page.waitForTimeout(300);
    expect(envois).toHaveLength(0);
    expect(page.url()).toBe(adresse);
  });

  test('champ invalide : aria-invalid et indication reliée par aria-describedby', async ({ page }) => {
    await page.goto('/');
    await bouton(page).click();
    const nom = formulaire(page).getByLabel('Votre nom');
    await expect(nom).toHaveAttribute('aria-invalid', 'true');
    const ids = ((await nom.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const aide = page.locator(`[id="${id}"]`);
      await expect(aide).toHaveCount(1);
      expect((await aide.textContent())?.trim()).toBeTruthy();
    }
    await expect(nom).toHaveAccessibleDescription('Indiquez votre nom.');
    await expect(page.locator(`[id="${ids[0]}"]`)).toBeVisible();

    // Corrigé : l'état invalide disparaît.
    await nom.fill('Camille');
    await expect(nom).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('quitter un champ invalide en cliquant sur « Envoyer » : le clic n’est pas perdu', async ({ page }) => {
    // Régression : l'indication apparaissait au moment où le champ perdait le focus, décalait le bouton
    // sous le pointeur, et le clic n'aboutissait pas (aucune validation, aucun envoi).
    await page.goto('/');
    const f = formulaire(page);
    await f.getByLabel('Votre adresse e-mail').fill('camille@');
    await bouton(page).click();
    await expect(f.getByLabel('Votre nom')).toBeFocused();
    for (const champ of [f.getByLabel('Votre nom'), f.getByLabel('Votre adresse e-mail'), f.getByLabel('Votre message')]) {
      await expect(champ).toHaveAttribute('aria-invalid', 'true');
    }
  });

  test('chaque indication est reliée à son champ (aria-describedby)', async ({ page }) => {
    await page.goto('/');
    const f = formulaire(page);
    for (const champ of [f.getByLabel('Votre nom'), f.getByLabel('Votre adresse e-mail'), f.getByLabel('Votre message'), f.getByRole('checkbox')]) {
      const ids = ((await champ.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
  });

  test('consentement non coché : envoi bloqué', async ({ page }) => {
    await page.goto('/');
    const envois = await intercepter(page, (r) => r.fulfill({ status: 200, json: { ok: true } }));
    await remplir(page, { consentement: false });
    await bouton(page).click();
    const consentement = formulaire(page).getByRole('checkbox');
    await expect(consentement).toBeFocused();
    expect(await consentement.evaluate((e) => e.matches(':invalid'))).toBe(true);
    await page.waitForTimeout(300);
    expect(envois).toHaveLength(0);
  });

  test('après une saisie invalide, une indication écrite accompagne la couleur', async ({ page }) => {
    await page.goto('/');
    const email = formulaire(page).getByLabel('Votre adresse e-mail');
    await email.fill('pas-une-adresse');
    await email.blur();
    await expect(formulaire(page).getByText('Indiquez une adresse e-mail valide')).toBeVisible();
  });
});

test.describe('envoi avec JavaScript', () => {
  test('succès : « Envoi en cours… », puis message de remerciement, formulaire vidé', async ({ page }) => {
    await page.goto('/');
    let liberer: () => void = () => {};
    const attente = new Promise<void>((r) => (liberer = r));
    const envois = await intercepter(page, async (route) => {
      await attente;
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await remplir(page);
    await bouton(page).click();

    const enCours = formulaire(page).getByRole('button', { name: 'Envoi en cours…' });
    await expect(enCours).toBeDisabled();
    liberer();

    const statut = page.locator('#contact').getByRole('status');
    await expect(statut).toHaveText('Merci, votre message est bien parti. Je vous répondrai dès que possible.');
    await expect(statut).toHaveAttribute('aria-live', 'polite');
    await expect(statut).toBeFocused();
    await expect(bouton(page)).toBeEnabled();
    await expect(formulaire(page).getByLabel('Votre message')).toHaveValue('');
    await expect(formulaire(page).getByLabel('Votre nom')).toHaveValue('');
    await expect(formulaire(page).getByRole('checkbox')).not.toBeChecked();

    expect(envois).toHaveLength(1);
    expect(envois[0]!.accept).toBe('application/json');
    for (const nom of ['nom', 'email', 'message', 'consentement', '_gotcha']) {
      expect(envois[0]!.corps, nom).toContain(`name="${nom}"`);
    }
    expect(envois[0]!.corps).not.toContain('name="_subject"');
    expect(envois[0]!.corps).toContain('Camille Martin');
  });

  for (const [cas, reponse] of [
    ['réponse 500', (r: Route) => r.fulfill({ status: 500, json: { error: 'x' } })],
    ['requête interrompue', (r: Route) => r.abort('failed')],
    ['réponse 200 signalant un échec', (r: Route) => r.fulfill({ status: 200, json: { ok: false, errors: [{ message: 'x' }] } })],
  ] as const) {
    test(`erreur (${cas}) : message d’erreur avec lien e-mail, message conservé`, async ({ page }) => {
      await page.goto('/');
      await intercepter(page, reponse);
      await remplir(page);
      await bouton(page).click();

      const alerte = page.locator('#contact').getByRole('alert');
      await expect(alerte).toContainText('Le message n’a pas pu être envoyé.');
      await expect(alerte).toContainText('Vous pouvez réessayer, ou m’écrire directement à');
      await expect(alerte.getByRole('link', { name: site.email })).toHaveAttribute('href', lienMailto(site.email));
      await expect(alerte).toBeFocused();
      await expect(formulaire(page).getByLabel('Votre nom')).toHaveValue('Camille Martin');
      await expect(formulaire(page).getByRole('checkbox')).toBeChecked();
      await expect(formulaire(page).getByLabel('Votre message')).toHaveValue(
        'Bonjour, la séance de samedi est-elle maintenue ?',
      );
      await expect(bouton(page)).toBeEnabled();
      await expect(page.locator('#contact').getByRole('status')).toHaveText('');
    });
  }

  test('réponse 422 du script : les champs signalés sont marqués invalides, avec leur indication', async ({ page }) => {
    await page.goto('/');
    await intercepter(page, (r) =>
      r.fulfill({
        status: 422,
        json: { ok: false, errors: [{ field: 'email', message: 'Adresse e-mail invalide.' }, { field: 'inconnu', message: 'x' }] },
      }),
    );
    await remplir(page);
    await bouton(page).click();
    const f = formulaire(page);
    await expect(page.locator('#contact').getByRole('alert')).toContainText('Le message n’a pas pu être envoyé.');
    await expect(f.getByLabel('Votre adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    await expect(f.getByText('Indiquez une adresse e-mail valide')).toBeVisible();
    await expect(f.getByLabel('Votre nom')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(f.getByLabel('Votre adresse e-mail')).toHaveValue('camille@example.org');
  });

  test('nouvel essai après une erreur : l’erreur disparaît, le succès s’affiche', async ({ page }) => {
    await page.goto('/');
    let echec = true;
    await intercepter(page, (r) => (echec ? r.fulfill({ status: 500 }) : r.fulfill({ status: 200, json: { ok: true } })));
    await remplir(page);
    await bouton(page).click();
    await expect(page.locator('#contact').getByRole('alert')).toContainText('n’a pas pu être envoyé');
    echec = false;
    await bouton(page).click();
    await expect(page.locator('#contact').getByRole('status')).toContainText('Merci');
    await expect(page.locator('#contact').getByRole('alert')).toHaveText('');
  });
});

test.describe('sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('le formulaire rempli part en POST natif vers l’adresse d’envoi', async ({ page }) => {
    await page.goto('/');
    const envois = await intercepter(page, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Merci</title><p>Merci</p>' }),
    );
    await remplir(page);
    await bouton(page).click();
    await expect(page).toHaveTitle('Merci');
    expect(envois).toHaveLength(1);
    expect(envois[0]!.corps).toContain('nom=Camille+Martin');
  });
});

test.describe('mentions légales', () => {
  test('la page répond, un seul h1, contenu légal issu de la configuration', async ({ page }) => {
    const reponse = await page.goto('/mentions-legales/');
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle('Mentions légales — Fan 2 Harmonie');
    expect((await page.locator('meta[name="description"]').getAttribute('content'))?.trim()).toBeTruthy();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('main#contenu')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Mentions légales');

    const main = page.locator('main');
    const valeur = (terme: string) => main.locator('dt', { hasText: terme }).locator('xpath=following-sibling::dd[1]');
    await expect(valeur('Nom du site')).toHaveText(site.nom);
    await expect(valeur('Éditrice du site et responsable de la publication')).toHaveText(site.editeur);
    await expect(valeur('Contact')).toHaveText(site.email);
    await expect(valeur('Contact').locator('a')).toHaveAttribute('href', lienMailto(site.email));

    // SIRET et ville facultatifs : affichés seulement s'ils sont renseignés ; le statut en découle.
    const siret = site.siret?.trim() || null;
    const ville = site.ville?.trim() || null;
    if (siret) {
      await expect(valeur('SIRET')).toHaveText(siret);
      await expect(valeur('Statut')).toHaveText('Entrepreneur individuel (micro-entreprise)');
    } else {
      await expect(main.locator('dt', { hasText: 'SIRET' })).toHaveCount(0);
      await expect(valeur('Statut')).toHaveText('Personne physique, activité exercée à titre non professionnel et gratuit');
    }
    if (ville) await expect(valeur('Ville')).toHaveText(ville);
    else await expect(main.locator('dt', { hasText: /^Ville$/ })).toHaveCount(0);

    // Hébergeur : tel qu'il est écrit dans src/config/site.ts (valeurs provisoires comprises).
    const hebergement = page.locator('section[aria-labelledby="hebergement"]');
    const valeurHebergeur = (terme: string) =>
      hebergement.locator('dt', { hasText: terme }).locator('xpath=following-sibling::dd[1]');
    await expect(valeurHebergeur('Hébergeur')).toHaveText(site.hebergeur.nom);
    await expect(valeurHebergeur('Adresse')).toHaveText(site.hebergeur.adresse);
    await expect(valeurHebergeur('Site web')).toHaveText(site.hebergeur.siteWeb);
    await expect(main).toContainText('consentement');
    await expect(main).toContainText('SIL Open Font License');
    await expect(main.getByRole('link', { name: /cnil\.fr/ })).toHaveAttribute('href', 'https://www.cnil.fr');
    await expect(main).toContainText('CNIL');
    await expect(main.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/');
  });

  test('données personnelles : formulaire traité chez l’hébergeur, rien de conservé ni transmis, engagements vérifiables', async ({ page }) => {
    await page.goto('/mentions-legales/');
    const donnees = page.locator('#donnees-personnelles');
    await expect(donnees).toContainText('votre nom, votre adresse e-mail et votre message');
    await expect(donnees).toContainText(`qui envoie votre message à l’adresse ${site.email}`);
    await expect(donnees.getByRole('link', { name: site.email }).first()).toHaveAttribute('href', lienMailto(site.email));
    await expect(donnees).toContainText('vos données ne sont pas enregistrées sur le site et ne sont pas transmises à des tiers');
    await expect(donnees).toContainText(
      'une empreinte pseudonymisée de l’adresse IP et l’heure d’envoi sont conservées au plus une heure et supprimées au plus tard lors de la prochaine utilisation du formulaire.',
    );
    await expect(donnees).not.toContainText('non réversible');
    await expect(donnees).toContainText(
      'L’hébergeur peut conserver les journaux techniques de connexion (adresse IP, date) conformément à la loi.',
    );
    await expect(donnees).toContainText(
      'Vos données sont conservées uniquement le temps nécessaire pour répondre à votre demande, puis supprimées.',
    );
    await expect(donnees).toContainText('Ce site ne dépose aucun cookie de mesure d’audience ni de publicité.');
    for (const ancien of ['États-Unis', 'hors de l’Union européenne', 'Formspree', 'Cloudflare']) {
      await expect(page.locator('main'), ancien).not.toContainText(ancien);
    }
    const main = page.locator('main');
    await expect(main).toContainText('Les logos, textes et visuels de ce site sont © 2026 Fan 2 Harmonie, sauf éléments de tiers mentionnés.');
    for (const affirmation of ['aucune conservation', 'ne dépose aucun cookie et', 'licence libre', 'clauses contractuelles']) {
      await expect(main, affirmation).not.toContainText(affirmation);
    }
  });

  test('pages construites : aucune mention de Formspree ni de Cloudflare dans le HTML', async ({ request }) => {
    for (const chemin of ['/', '/mentions-legales/']) {
      const reponse = await request.get(chemin);
      expect(reponse.status(), chemin).toBe(200);
      const html = (await reponse.text()).toLowerCase();
      expect(html.includes('formspree'), `${chemin} : formspree`).toBe(false);
      expect(html.includes('cloudflare'), `${chemin} : cloudflare`).toBe(false);
    }
  });

  test('le script de contact est copié dans le site construit, jamais sa configuration réelle', () => {
    expect(existsSync('dist/api/contact.php')).toBe(true);
    expect(existsSync('dist/api/lib/contact.php')).toBe(true);
    expect(existsSync('dist/api/config.php')).toBe(false);
  });

  test('formulaire : mention de conservation vérifiable', async ({ page }) => {
    await page.goto('/');
    await expect(formulaire(page)).toContainText('Ces informations ne sont conservées que le temps de répondre à ma demande.');
    await expect(formulaire(page)).not.toContainText('pas conservées au-delà');
  });

  test('section « Données personnelles » ciblée depuis le formulaire', async ({ page }) => {
    await page.goto('/');
    const lien = formulaire(page).getByRole('link', { name: /données personnelles/i });
    await expect(lien).toHaveAttribute('href', '/mentions-legales/#donnees-personnelles');
    await page.goto('/mentions-legales/');
    await expect(page.locator('[id="donnees-personnelles"]')).toHaveCount(1);
  });

  test('navigation de l’en-tête : ancres absolues vers l’accueil', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/mentions-legales/');
    const liens = page.locator('header nav a');
    expect(await liens.count()).toBeGreaterThanOrEqual(5);
    const hrefs = await liens.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    for (const href of hrefs) expect(href).toMatch(/^\/#[a-z]+$/);
    for (const attendu of ['/#rdv', '/#pratique', '/#qigong', '/#qui', '/#contact']) expect(hrefs).toContain(attendu);

    await page.locator('header nav a[href="/#pratique"]').click();
    await expect(page).toHaveURL(/\/#pratique$/);
    await expect(page.locator('#pratique')).toBeInViewport();

    // Toutes les ancres existent bien sur l'accueil.
    for (const href of hrefs) await expect(page.locator(`[id="${href.slice(2)}"]`), href).toHaveCount(1);
  });

  test('le lien du pied de page « Mentions légales » mène à la page', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer a', { hasText: 'Mentions légales' }).click();
    await expect(page).toHaveURL(/\/mentions-legales\/?$/);
    await expect(page.locator('h1')).toHaveText('Mentions légales');
  });
});

for (const largeur of [360, 390, 1280]) {
  test.describe(`accessibilité et mise en page (${largeur} px)`, () => {
    test.use({ viewport: { width: largeur, height: 900 } });

    test('section contact : zéro violation axe, y compris champs invalides et état d’erreur', async ({ page }) => {
      const contact = { zone: '#contact', regles: REGLES_WCAG };
      await page.goto('/');
      await sansViolationAxe(page, contact);

      // Formulaire vide envoyé : champs invalides, indications visibles.
      await bouton(page).click();
      await expect(formulaire(page).getByLabel('Votre nom')).toHaveAttribute('aria-invalid', 'true');
      await expect(formulaire(page).getByText('Indiquez votre nom.')).toBeVisible();
      await sansViolationAxe(page, contact);
      await sansDebordement(page);

      // Envoi refusé par le service : message d'erreur.
      await intercepter(page, (r) => r.fulfill({ status: 500 }));
      await remplir(page);
      await bouton(page).click();
      await expect(page.locator('#contact').getByRole('alert')).not.toHaveText('');
      await sansViolationAxe(page, contact);
    });

    if (largeur !== 360) {
      test('mentions légales : zéro violation axe', async ({ page }) => {
        expect((await page.goto('/mentions-legales/'))?.status()).toBe(200);
        await sansViolationAxe(page);
      });
    }
  });
}
