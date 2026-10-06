# Site Fan 2 Harmonie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le site vitrine premium de Fan 2 Harmonie, dont Stéphanie (non technique) gère rendez-vous, actualités et textes depuis un espace d'administration à formulaires.

**Architecture:** Site statique Astro 5 (TypeScript strict). Les contenus (rendez-vous, actualités, textes de pages) sont des fichiers Markdown validés par des schémas Zod ; Sveltia CMS (`/admin`) les édite via GitHub. Cloudflare Pages construit et héberge (remplacé : hébergement français, voir la note de mise à jour) ; une reconstruction quotidienne retire automatiquement les rendez-vous passés.

**Tech Stack:** Astro 5, TypeScript, Zod (content collections), Vitest, Playwright + @axe-core/playwright, @lhci/cli, sharp, Sveltia CMS, Cloudflare Pages + Workers (remplacés : voir la mise à jour ci-dessous), GitHub, polices @fontsource.

**Spec:** `docs/superpowers/specs/2026-10-04-fan2harmonie-site-design.md`

> **Mise à jour (hébergement français), octobre 2026.** Ce plan reste l’historique de la réalisation, mais
> Cloudflare Pages, Cloudflare Workers et le service de formulaire tiers (Formspree ou Web3Forms) ont été
> remplacés : hébergeur 100 % français (PHP, Apache/LiteSpeed, SSH), mise en ligne par GitHub Actions et rsync
> (`.github/workflows/deploiement.yml`), formulaire en PHP sur le même hébergement (`public/api/`), relais de
> connexion GitHub de `/admin` en PHP (`public/oauth/`). Les Tasks 8, 9 et 11 ci-dessous sont annotées en
> conséquence ; référence à jour : `README.md` et `docs/MISE-EN-LIGNE.md`.

## Global Constraints

- Page unique défilante `/` (sections Accueil, Prochains rendez-vous, La pratique, Le Qi Gong, Qui est Fan 2 Harmonie, Actualités, Contact), plus `/mentions-legales`. Ordre des contenus de Stéphanie : 1 La pratique, 2 Le Qi Gong, 3 Qui est Fan 2 Harmonie.
- Langue `fr`, textes de Stéphanie repris tels quels (aucune reformulation pour l'instant) ; seules les fautes de frappe et espaces manquants sont corrigées. La reformulation « bien-être » reste une option ultérieure, à son initiative.
- Lieu : parc de Rambouillet, en allant à la bergerie ; parking rue de la Ferme ; lieu juste à gauche du parking ; fanion « Fan 2 Harmonie » ; GPS 48,64703°N, 1,811268°E ; samedis ou dimanches à 16h00 ; gratuit, tous âges et niveaux ; vêtements souples.
- Rendez-vous : champs `date` (`AAAA-MM-JJ`), `heure` (`HH:MM`), `lieu`, `remarque` (facultatif), `annule` (booléen). Fuseau `Europe/Paris`.
- Palette : vert forêt, doré (décoratif uniquement, jamais pour du texte), rose poudré, crème chaud. Contraste texte/fond ≥ 4,5:1.
- Typographie : script d'accent réservé aux grands titres ; serif lisible pour les titres ; sans-serif pour le texte ; polices hébergées localement ; 60-70 caractères par ligne, interlignage 1,6-1,7.
- Interdits (look « généré ») : emoji comme icônes, dégradés violacés, cartes toutes identiques, icônes génériques. Icônes SVG dessinées au trait, même épaisseur que le logo.
- Animations lentes et discrètes, désactivées avec `prefers-reduced-motion`.
- Lighthouse ≥ 95 (performance, accessibilité, bonnes pratiques, SEO) ; zéro violation axe ; aucun défilement horizontal dès 360 px de large.
- Aucun traceur ; carte en simple lien ; formulaire avec champ piège anti-spam et mention RGPD ; aucun secret dans le dépôt.
- Aucune valeur de substitution (`À_COMPLÉTER`) ne peut subsister au déploiement (Task 11).
- *Mise à jour (hébergement français)* : aucune donnée de visiteur ne quitte la France ; ni Cloudflare ni
  service de formulaire tiers ; secrets uniquement dans l’environnement GitHub `production` et sur le serveur.
- **Docker uniquement** : rien n'est installé sur le PC de l'utilisatrice (ni Node, ni paquets npm, ni navigateurs Playwright). Toute commande `npm …`, `npx …`, `node …` du plan s'exécute via `docker compose run --rm app <commande>`. `node_modules` vit dans un volume Docker nommé, pas dans le dossier du projet. Image de base : `mcr.microsoft.com/playwright` (Node + navigateurs inclus), version épinglée alignée sur `@playwright/test`. Seul `git` tourne sur l'hôte.

## Review Focus

1. **Rendez-vous du jour** : un rendez-vous daté d'aujourd'hui reste affiché jusqu'à 23h59 (heure de Paris), même après 16h00, y compris au passage à l'heure d'hiver.
2. **Aucun rendez-vous à venir** : l'accueil affiche « Prochaines dates bientôt », jamais une zone vide ni une date passée.
3. **Rendez-vous annulé** : il reste visible avec la mention « Annulé », il n'est pas masqué.
4. **Texte contenant du HTML** (`<script>`, `&`) dans une remarque ou une actualité : affiché comme texte, jamais exécuté.
5. **Actualité sans image ou avec un très long titre** : pas d'image cassée, pas de débordement de mise en page.

---

## File Structure

```
package.json, astro.config.mjs, tsconfig.json, vitest.config.ts, playwright.config.ts, lighthouserc.json
public/admin/index.html, public/admin/config.yml     Sveltia CMS
public/robots.txt
scripts/prepare-assets.mjs                            logos → PNG transparents, photo d'accueil
src/config/site.ts                                    constantes du site (nom, e-mail, GPS, SIRET…)
src/content.config.ts                                 collections Astro branchées sur les schémas
src/lib/schemas.ts                                    schémas Zod purs
src/content/rendezvous/*.md, actualites/*.md, pages/*.md
src/lib/rendezvous.ts                                 logique pure des dates
src/lib/contrast.ts                                   calcul du contraste WCAG (test des couleurs)
src/styles/tokens.css, global.css
src/layouts/Base.astro                                head, SEO, JSON-LD
src/components/                                       Header, Footer, Hero, RdvList, ActualiteCard, ContactForm, Icon*.astro
src/pages/index.astro, mentions-legales.astro
tests/unit/*.test.ts, tests/e2e/*.spec.ts, tests/fixtures/content/
docs/GUIDE-STEPHANIE.md
.github/workflows/rebuild-daily.yml
```

---

### Task 1: Socle du projet et outillage

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `src/pages/index.astro` (page minimale)
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `preview`, `test` (Vitest), `test:e2e` (Playwright sur `astro preview`, port 4321), `check` (`astro check`).
- Produces: service Docker Compose `app` (image `mcr.microsoft.com/playwright`, dossier du projet monté, `node_modules` dans le volume nommé `fan2harmonie_node_modules`, ports 4321 et 4322 publiés). Usage : `docker compose run --rm app npm run test`, `docker compose up` pour le serveur de développement.

- [ ] **Step 1:** `git init` dans `D:\Projet\qigong`, créer `.gitignore` (`node_modules`, `dist`, `.astro`, `.env`), déplacer les 5 JPEG et `texteSite.odt` dans `source/` (originaux conservés). Le dossier `maquette/` est supprimé une fois le rendu final accepté par Stéphanie.
- [ ] **Step 2:** Initialiser Astro 5 (gabarit « minimal », TypeScript « strictest »), installer `vitest`, `@playwright/test`, `@axe-core/playwright`, `sharp`, `@astrojs/sitemap`. `output: 'static'`.
- [ ] **Step 3:** Écrire le test `smoke.spec.ts` : `test('la page d'accueil répond et a un h1')` — charge `/`, attend `h1` visible.
- [ ] **Step 4:** Lancer `npm run build && npm run test:e2e`. Attendu : PASS.
- [ ] **Step 5:** Commit `chore: socle astro, vitest, playwright`.

---

### Task 2: Constantes du site et schémas de contenu

**Files:**
- Create: `src/config/site.ts`, `src/lib/schemas.ts`, `src/content.config.ts`, `src/content/rendezvous/2026-10-10.md`, `src/content/actualites/bienvenue.md`
- Test: `tests/unit/content-schema.test.ts`

**Interfaces:**
- Produces: `export const site: { nom: string; url: string; email: string; formEndpoint: string; gps: { lat: 48.64703; lon: 1.811268 }; siret: string; ville: string }`. Valeurs inconnues (`url`, `email`, `formEndpoint`, `siret`, `ville`) = `'À_COMPLÉTER'`.
- Produces: `rendezvousSchema` (Zod) : `date` (`z.coerce.date()`), `heure` (`/^\d{2}:\d{2}$/`), `lieu` (défaut « Parc de Rambouillet, près de la bergerie »), `remarque` (optionnel), `annule` (défaut `false`). `actualiteSchema` : `titre` (≤ 90 car.), `date`, `image` (optionnelle). Collections Astro : `rendezvous`, `actualites`, `pages` (`titre`, corps Markdown).

- [ ] **Step 1:** Écrire les tests : `rendezvousSchema` accepte `{date:'2026-10-10', heure:'16:00'}` ; rejette `heure:'4pm'` ; rejette `date:'2026-13-40'` ; `actualiteSchema` rejette un titre de 91 caractères.
- [ ] **Step 2:** Lancer `npx vitest run tests/unit/content-schema.test.ts`. Attendu : FAIL (module absent).
- [ ] **Step 3:** Implémenter `src/config/site.ts` et `src/lib/schemas.ts` ; `src/content.config.ts` les branche sur les collections (loader `glob`).
- [ ] **Step 4:** Relancer les tests. Attendu : PASS. Créer les deux fichiers d'exemple (samedi 10 octobre 2026, 16:00 ; actualité de bienvenue) et vérifier `npm run check` sans erreur.
- [ ] **Step 5:** Commit `feat: schémas de contenu et constantes du site`.

---

### Task 3: Logique des rendez-vous

**Files:**
- Create: `src/lib/rendezvous.ts`
- Test: `tests/unit/rendezvous.test.ts`

**Interfaces:**
- Consumes: type `Rendezvous` (sortie de `rendezvousSchema`).
- Produces: `upcoming(items: Rendezvous[], now: Date): Rendezvous[]` — garde les rendez-vous dont le jour calendaire `Europe/Paris` est ≥ celui de `now` ; triés par date puis heure ; les annulés sont conservés. `formatDateFr(date: Date): { jourSemaine: string; jour: string; mois: string }`. `isCancelled(r: Rendezvous): boolean`.

- [ ] **Step 1:** Écrire les tests : (a) rendez-vous du 2026-10-10 conservé à `2026-10-10T20:30:00+02:00` (Review Focus 1) et retiré à `2026-10-11T00:01:00+02:00` ; (b) passage à l'heure d'hiver : rendez-vous du 2026-10-25 conservé à `2026-10-25T23:30:00+01:00` ; (c) liste vide → `[]` ; (d) annulé conservé et `isCancelled` vrai (Review Focus 3) ; (e) tri chronologique de 3 dates mélangées ; (f) `formatDateFr` renvoie `samedi`, `10`, `octobre` pour le 2026-10-10.
- [ ] **Step 2:** Lancer les tests. Attendu : FAIL.
- [ ] **Step 3:** Implémenter les trois fonctions avec `Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' })` pour obtenir le jour calendaire parisien (aucun calcul manuel de décalage).
- [ ] **Step 4:** Relancer. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: logique des rendez-vous (jour parisien, annulés, tri)`.

---

### Task 4: Chaîne d'assets (logos et photo)

**Files:**
- Create: `scripts/prepare-assets.mjs`, `src/assets/logo/`, `src/assets/photos/`
- Test: `tests/unit/assets.test.ts`

**Interfaces:**
- Produces: `src/assets/logo/logo.png` (Logo_FondBlanc3, fond transparent, trait vert forêt), `logo-blanc.png` (trait crème, pour fonds sombres), `logo-long.png` (LogoLong, transparent), `favicon.png` 512×512 ; `src/assets/photos/hero.jpg` (recadrage provisoire de `ImageAnimation.jpeg`, zone forêt sans panneaux ni voiture, remplacée dès que Stéphanie fournit ses photos).

- [ ] **Step 1:** Test : pour chaque PNG de logo, via `sharp` : canal alpha présent, pixel (0,0) a `alpha === 0`, un pixel de trait a `alpha > 200` ; `favicon.png` fait 512×512.
- [ ] **Step 2:** Lancer. Attendu : FAIL (fichiers absents).
- [ ] **Step 3:** Écrire `prepare-assets.mjs` : l'alpha dérive de la luminance inversée (blanc → transparent, noir → opaque), avec seuil doux pour supprimer le voile gris ; teinte appliquée par recomposition RVB constante. Lecture depuis `source/`.
- [ ] **Step 4:** `node scripts/prepare-assets.mjs` puis relancer le test. Attendu : PASS. Contrôle visuel des PNG sur fond crème et fond vert par l'exécutant.
- [ ] **Step 5:** Commit `feat: logos transparents et photo d'accueil provisoire`.

---

### Task 5: Système de design, polices, mise en page de base

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/lib/contrast.ts`, `src/layouts/Base.astro`, `src/components/IconSouffle.astro`, `IconLotus.astro`, `IconSilhouette.astro`, `IconYinYang.astro`
- Test: `tests/unit/contrast.test.ts`, `tests/e2e/base.spec.ts`

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` (hex → rapport WCAG). Jetons CSS : `--foret`, `--dore`, `--rose`, `--creme`, `--encre`, échelle d'espacement sur 8 px, échelle typographique fluide (`clamp`). `Base.astro` props : `{ titre: string; description: string }` ; émet `<html lang="fr">`, meta description, Open Graph, `<link rel="canonical">`, JSON-LD `LocalBusiness` (nom, lieu, coordonnées GPS).
- Polices : `@fontsource/allura` (accent), `@fontsource-variable/cormorant` (titres), `@fontsource-variable/source-sans-3` (texte) — vérifier à l'installation que ces paquets existent ; à défaut, choisir l'équivalent le plus proche et le consigner.

- [ ] **Step 1:** Tests unitaires : `contrastRatio('#ffffff','#000000') === 21` ; ratios `encre`/`creme` ≥ 4,5, `foret`/`creme` ≥ 4,5, blanc/`rose` (texte des boutons) ≥ 4,5. Test e2e : la page a `lang="fr"`, un seul `h1`, une meta description non vide, un JSON-LD parsable de type `LocalBusiness`.
- [ ] **Step 2:** Lancer. Attendu : FAIL.
- [ ] **Step 3:** Définir les jetons : `--foret #2c4a2e`, `--dore #c9a24a`, `--rose #b4506a` (à assombrir si le test de contraste échoue), `--creme #faf5e8`, `--encre #26331f`. Implémenter `contrast.ts`, `Base.astro` et les 4 icônes SVG au trait (`stroke="currentColor"`, épaisseur 1,5, `aria-hidden` par défaut, `role="img"` + titre si porteuses de sens).
- [ ] **Step 4:** Relancer unitaires et e2e. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: système de design, polices locales, base SEO`.

---

### Task 6: Navigation, accueil et sections de texte

**Files:**
- Create: `src/components/Header.astro`, `Footer.astro`, `Hero.astro`, `src/content/pages/pratique.md`, `qigong.md`, `parcours.md`
- Modify: `src/pages/index.astro`
- Test: `tests/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `Base.astro`, icônes (Task 5), collection `pages`, logos (Task 4).
- Produces: ancres `#accueil`, `#rdv`, `#pratique`, `#qigong`, `#qui`, `#actualites`, `#contact` ; menu mobile accessible au clavier (bouton avec `aria-expanded`, `aria-controls`).

- [ ] **Step 1:** Tests e2e : les 7 ancres existent ; le menu mobile (viewport 390 px) s'ouvre au clavier (Entrée) et `aria-expanded` passe à `true` ; le lien « Voir la carte » pointe vers `openstreetmap.org` avec `mlat=48.64703` et `mlon=1.811268`.
- [ ] **Step 2:** Lancer. Attendu : FAIL.
- [ ] **Step 3:** Rédiger les 3 pages Markdown à partir de `source/texteSite.odt`, corrections : « cinqans » → « cinq ans », « aborderma » → « aborder ma », « dan » → « dans », « Union » → « union », « Prochainsrendez-vous » → « Prochains rendez-vous », espaces et accents manquants. **Aucune reformulation** : le texte de Stéphanie est repris mot pour mot, seules les fautes de frappe et les espaces sont corrigées. Construire `Hero` (logo, « 1 heure pour vous… », « Qi Gong — animation découverte », un seul bouton « Venez essayer » vers `#rdv`, quatre icônes porteuses : faire circuler l'énergie, calmer l'esprit, travailler les muscles profonds, souplesse), `Header` (logo + nav + bouton menu), `Footer` (logo long, mentions légales).
- [ ] **Step 4:** Relancer. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: navigation, accueil et sections de texte`.

---

### Task 7: Rendez-vous et actualités

**Files:**
- Create: `src/components/RdvList.astro`, `ActualiteCard.astro`, `tests/fixtures/content/`
- Modify: `src/pages/index.astro`
- Test: `tests/e2e/rdv-actus.spec.ts`

**Interfaces:**
- Consumes: `upcoming`, `formatDateFr`, `isCancelled` (Task 3) ; collections `rendezvous`, `actualites`.
- Produces: `<RdvList items={Rendezvous[]} />` ; `<ActualiteCard titre date image? >`. Si la liste de rendez-vous est vide : texte exact « Prochaines dates bientôt » (Review Focus 2). Les 3 dernières actualités, plus récentes d'abord.

- [ ] **Step 1:** Tests e2e sur des contenus de test chargés quand la variable d'environnement `CONTENT_FIXTURE=1` est définie (dossier `tests/fixtures/content`) : (a) rendez-vous vide → « Prochaines dates bientôt » visible ; (b) rendez-vous annulé → mention « Annulé » visible (Review Focus 3) ; (c) remarque `<script>window.__x=1</script>` : affichée en texte, `window.__x` indéfini (Review Focus 4) ; (d) actualité sans image : aucun `img` cassé, la carte s'affiche ; (e) titre de 90 caractères : `scrollWidth <= clientWidth` à 360 px (Review Focus 5).
- [ ] **Step 2:** Lancer. Attendu : FAIL.
- [ ] **Step 3:** Implémenter les composants ; balises `<time datetime>` ; images via `astro:assets` avec `alt` obligatoire ; échappement par défaut d'Astro (aucun `set:html` sur du contenu éditable).
- [ ] **Step 4:** Relancer. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: rendez-vous et actualités`.

---

### Task 8: Contact, RGPD et mentions légales

**Files:**
- Create: `src/components/ContactForm.astro`, `src/pages/mentions-legales.astro`
- Modify: `src/pages/index.astro`
- Test: `tests/e2e/contact.spec.ts`

**Interfaces:**
- Consumes: `site.formEndpoint`, `site.siret`, `site.email`, `site.ville` (Task 2).
- Produces: formulaire `method="post"` vers `site.formEndpoint` avec champs `nom`, `email`, `message` (tous `required`, `<label>` associés), champ piège `_gotcha` masqué (`aria-hidden`, `tabindex="-1"`), case de consentement RGPD requise.

- [ ] **Step 1:** Tests e2e : chaque champ a un label accessible ; `_gotcha` n'est pas atteignable au clavier ; l'envoi à vide est bloqué par la validation native ; la page `/mentions-legales` contient SIRET, éditeur, hébergeur « Cloudflare, Inc. » et un lien retour.
- [ ] **Step 2:** Lancer. Attendu : FAIL.
- [ ] **Step 3:** Implémenter formulaire et page légale ; service de réception choisi avec Stéphanie (Formspree ou Web3Forms, offre gratuite) ; texte RGPD : finalité unique (répondre au message), aucune conservation au-delà.
- [ ] **Step 4:** Relancer. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: formulaire de contact et mentions légales`.

> *Mise à jour (hébergement français)* : la réception passe par `public/api/contact.php` sur l’hébergeur
> français (ni Formspree ni Web3Forms) ; l’hébergeur des mentions légales est celui-ci, plus Cloudflare.

---

### Task 9: Espace d'administration Sveltia CMS

**Files:**
- Create: `public/admin/index.html`, `public/admin/config.yml`
- Test: `tests/unit/cms-config.test.ts`

**Interfaces:**
- Consumes: schémas Zod (Task 2).
- Produces: collections CMS `rendezvous` (dossier `src/content/rendezvous`, nom de fichier `{{date}}`), `actualites`, `pages` (fichiers fixes, sans création ni suppression), libellés en français (`locale: fr`) ; `backend: github`, `base_url` du relais d'authentification (Task 11).

- [ ] **Step 1:** Test : le YAML se charge ; pour chaque collection, l'ensemble des noms de champs du CMS égale l'ensemble des clés du schéma Zod correspondant ; le motif du champ `heure` est identique à celui du schéma ; `pages` a `create: false` et `delete: false`.
- [ ] **Step 2:** Lancer. Attendu : FAIL.
- [ ] **Step 3:** Écrire `config.yml` avec des libellés clairs (« Date », « Heure », « Remarque — par ex. annulé en cas de pluie », « Séance annulée ») et `index.html` chargeant Sveltia CMS depuis un paquet épinglé en version exacte (aucune version flottante).
- [ ] **Step 4:** Relancer. Attendu : PASS.
- [ ] **Step 5:** Commit `feat: espace d'administration Sveltia CMS`.

> *Mise à jour (hébergement français)* : `base_url: https://fan2harmonie.fr` et `auth_endpoint: oauth/auth.php`
> désignent le relais PHP du site (`public/oauth/`), vérifiés par le garde-fou de mise en ligne.

---

### Task 10: Portes de qualité

**Files:**
- Create: `lighthouserc.json`, `public/robots.txt`, `tests/e2e/quality.spec.ts`
- Modify: `astro.config.mjs` (sitemap), `package.json` (script `lighthouse`)

**Interfaces:**
- Consumes: le site complet (Tasks 1-9).

- [ ] **Step 1:** Tests : `@axe-core/playwright` sans violation sur `/` et `/mentions-legales` aux largeurs 360, 768, 1280 ; `document.documentElement.scrollWidth <= innerWidth` à 360 px ; avec `reducedMotion: 'reduce'`, aucune animation en cours (`document.getAnimations().length === 0`) ; `robots.txt` et `sitemap-index.xml` répondent 200.
- [ ] **Step 2:** Lancer. Attendu : échecs éventuels à corriger dans les composants concernés (corriger la cause, pas les tests).
- [ ] **Step 3:** Configurer `@lhci/cli` avec seuils `categories:performance`, `accessibility`, `best-practices`, `seo` ≥ 0,95 sur la version mobile.
- [ ] **Step 4:** `npm run build && npm run test:e2e && npm run lighthouse`. Attendu : tout PASS.
- [ ] **Step 5:** Commit `test: accessibilité, responsive, mouvement réduit, Lighthouse`.

---

### Task 11: Déploiement et remise à Stéphanie

**Files:**
- Create: `.github/workflows/rebuild-daily.yml`, `docs/GUIDE-STEPHANIE.md`, `tests/unit/no-placeholder.test.ts`
- Modify: `src/config/site.ts` (valeurs réelles)

**Interfaces:**
- Consumes: informations de Stéphanie (nom de domaine, SIRET, ville, e-mail, endpoint du formulaire).

- [ ] **Step 1:** Test : aucune valeur de `site` ne contient `À_COMPLÉTER`, et aucun fichier sous `src/` ne contient `À_COMPLÉTER`.
- [ ] **Step 2:** Lancer. Attendu : FAIL tant que les informations ne sont pas saisies.
- [ ] **Step 3:** Renseigner `site.ts` avec les vraies valeurs ; créer le dépôt GitHub (au nom de Stéphanie), le projet Cloudflare Pages relié, le domaine et son HTTPS ; déployer le relais d'authentification (`sveltia-cms-auth`) sur Cloudflare Workers avec l'application OAuth GitHub, secrets stockés dans Cloudflare uniquement ; inviter Stéphanie comme collaboratrice.
- [ ] **Step 4:** Workflow `rebuild-daily.yml` : cron quotidien à 00:10 heure de Paris appelant le « deploy hook » Cloudflare (URL en secret GitHub). Relancer tous les tests ; sur le site en ligne, vérifier : un rendez-vous ajouté par `/admin` apparaît en moins de 2 minutes ; sa suppression ; un retour arrière depuis l'historique.
- [ ] **Step 5:** Rédiger `GUIDE-STEPHANIE.md` (1 page, captures d'écran : se connecter, ajouter un rendez-vous, annuler une séance, publier une actualité, changer une photo, que faire en cas d'erreur) ; démonstration en direct avec Stéphanie, qui réalise elle-même un ajout et une suppression. Commit `docs: guide de Stéphanie` et étiquette `v1.0.0`.

> *Mise à jour (hébergement français)* : Steps 3 et 4 remplacés. Plus de projet Cloudflare Pages, de relais
> `sveltia-cms-auth` sur Cloudflare Workers ni de « deploy hook » : `.github/workflows/deploiement.yml` construit
> et copie le site chez l’hébergeur français (à chaque modification et chaque nuit), le relais de connexion est
> `public/oauth/` (secret de l’application OAuth sur le serveur uniquement), le garde-fou est
> `npm run verifier:mise-en-ligne` (`tests/deploy/no-placeholder.test.ts`). Étapes de mise en ligne :
> `docs/MISE-EN-LIGNE.md` ; guide : `docs/GUIDE-STEPHANIE.md`.

---

## Self-review

- **Couverture de la spec** : structure et textes (Task 6), rendez-vous et règles (Tasks 2, 3, 7), administration (Task 9), design et typographie (Task 5), photos et logos (Task 4), contact et RGPD (Task 8), accessibilité, performance, SEO, tests (Tasks 5, 10), déploiement, domaine, mentions légales, guide (Task 11). Pratiques d'ingénierie de la spec : TDD (chaque tâche), sécurité (Tasks 7, 11), confidentialité (Tasks 6, 8).
- **Cohérence des noms** : `upcoming`, `formatDateFr`, `isCancelled`, `rendezvousSchema`, `actualiteSchema`, `site` sont définis en Tasks 2-3 et réutilisés tels quels ensuite.
- **Points ouverts, à fournir par Stéphanie** : nom de domaine, SIRET, ville, e-mail de réception, 5 à 8 vraies photos (en attendant, photos libres de droits avec source et licence consignées dans `source/CREDITS-PHOTOS.md`). Valeurs d'exemple (SIRET, domaine, e-mail) acceptées en développement ; le test de la Task 11 bloque la mise en ligne tant qu'elles subsistent.
