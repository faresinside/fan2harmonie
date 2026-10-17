# Contenu éditable, photos d'actualités multiples et référencement : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stéphanie modifie depuis `/admin` l'accueil et le lieu, illustre ses actualités avec plusieurs photos, et le site devient trouvable sur Google.

**Architecture:** Trois fichiers Markdown « réglages » (accueil, lieu, référencement) dans `src/content/reglages/`, lus par trois collections Astro à fichier unique et édités par une collection Sveltia de type `files`. Les schémas Zod de `src/lib/schemas.ts` restent la source unique, comparés au `config.yml` du CMS par `tests/unit/cms-config.test.ts`. Les actualités passent de `image` à `photos` (liste) avec galerie et `<dialog>` natif. Site toujours statique.

**Tech Stack:** Astro 7 (collections, `astro:assets`), Zod (`astro/zod`), Sveltia CMS, Vitest, Playwright (axe), `sharp` pour les images de test.

**Spec:** `docs/superpowers/specs/2026-10-17-contenu-editable-photos-seo-design.md`

## Écarts assumés par rapport à la spec (corrigés dans la spec à la Task 0)

1. Réglages en `.md` (front matter) et non `.yml` : même chargeur `glob`, mêmes plugins remark (HTML neutralisé) et même widget `body` que `pages`. Le lieu a un corps Markdown (indications d'accès).
2. Les rendez-vous **existants portent explicitement** `lieu: Parc de Rambouillet, près de la bergerie` (écrit par la valeur par défaut du CMS) : la spec affirmait le contraire. Migration prévue (Task 3 et Task 10).
3. Pas de photos dans les données structurées des évènements : une actualité n'est pas une séance, le lien serait inventé.
4. La FAQ est éditable (dans `accueil.md`) et ne cite jamais d'horaire, pour ne pas recréer l'incohérence 10h/16h.

## Global Constraints

- Branche `preprod` uniquement ; jamais de push sur `main` ni de fusion sans accord explicite de Fares. Pas de `git push` sans demande.
- Commits : identité `-c user.name="Fares METIDJI" -c user.email="35744998+faresinside@users.noreply.github.com"` (aucune identité Git configurée sur ce poste) ; message terminé par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Site statique, aucune bibliothèque ni script tiers, aucune requête vers un service externe (CSP partielle, hébergement français).
- Tous les textes visibles et libellés de l'admin en français correct, avec accents.
- Rien ne change visuellement tant que Stéphanie ne modifie rien : valeurs initiales = textes actuels (accueil : `Hero.astro` actuel ; lieu : `Parc de Rambouillet, près de la bergerie`, 48.64703, 1.811268).
- Le contenu de `src/content/**` écrit par Stéphanie sur `main` ne doit jamais être écrasé (mots de son `pratique.md` repris à l'identique).
- Tests : `npm test` doit rester vert **sauf 4 échecs connus** de `tests/unit/scripts-deploiement.test.ts` (Windows, arguments avec guillemet ou retour à la ligne ; CI Linux verte). Tout autre échec bloque. Types : `npm run check` à 0 erreur.
- Limites des champs (identiques dans le schéma et dans `config.yml`) : accroche 60, titre 40, sousTitre 60, devise 80, infos 1 à 5 éléments de 60, bouton 30, bienfaits 1 à 6 (libellé 60), légende de photo 120, photos 0 à 12, FAQ 0 à 8 (question 120, réponse 400), titre de page 10 à 70, description 50 à 170, nom du lieu 120.
- Guide de Stéphanie : moins de 1 500 mots et aucun mot de la liste `INTERDITS` de `tests/docs/guide-stephanie.test.ts`.

## Review Focus

1. Latitude ou longitude hors limites, ou saisie à virgule française (`48,647`) : refusées par le CMS comme par le schéma, jamais publiées. Test en Task 1 et 2.
2. Code de vérification Google collé en balise entière (`<meta … content="…">`) : refusé dans l'admin avec un message en français ; un code valide n'est jamais accepté avec guillemets ou chevrons. Test en Task 2 et 8.
3. Actualité à 0, 1, 12 photos (accepté) et 13 photos ou légende de 121 caractères (refusé) ; texte alternatif jamais vide. Test en Task 5 et 6.
4. Rendez-vous sans `lieu`, avec l'ancien nom, ou avec un autre lieu : le nom affiché et le « lieu habituel » des données structurées sont cohérents. Test en Task 3.
5. Photo agrandie : fermeture à Échap, au clic sur le fond et au bouton ; focus rendu à la vignette ; aucune violation CSP ni axe à 390 px avec 5 photos. Test en Task 6.

---

## Task 0: Préparer la branche et corriger la spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-contenu-editable-photos-seo-design.md`

- [ ] **Step 1: Resynchroniser avec `main`.** `git fetch origin`, vérifier `git branch --show-current` = `preprod`, puis `git rebase origin/main` (aucun fichier de `src/content/` de `main` ne doit disparaître : `git diff --stat origin/main -- src/content` ne montre que des ajouts de ma part, c'est-à-dire rien).
- [ ] **Step 2: Mesurer la base.** `npm test` : noter les échecs ; attendu exactement les 4 cas connus. `npm run check` : 0 erreur.
- [ ] **Step 3: Corriger la spec** pour refléter les quatre écarts ci-dessus (réglages en `.md`, rendez-vous existants avec lieu explicite et migration, pas de photos dans le JSON-LD, FAQ éditable sans horaires). Ne pas modifier le reste.
- [ ] **Step 4: Commit** `docs: spec alignée sur le plan (réglages .md, migration des lieux de rendez-vous)`.

## Task 1: Schémas, collections et contenus initiaux des réglages

**Files:**
- Modify: `src/lib/schemas.ts`, `src/lib/fixture.ts`, `src/content.config.ts`
- Create: `src/content/reglages/accueil.md`, `src/content/reglages/lieu.md`, `src/content/reglages/referencement.md`
- Test: `tests/unit/content-schema.test.ts`, `tests/unit/contenu.test.ts`, `tests/content/contenu.test.ts`

**Interfaces:**
- Produces (`src/lib/schemas.ts`): `ICONES_BIENFAIT` (`['souffle','lotus','silhouette','yinyang'] as const`), `accueilSchema`, `lieuSchema` (`nom`, `latitude`, `longitude`), `CODE_GOOGLE_REGEX` (`/^[A-Za-z0-9_-]{20,100}$/`), `referencementSchema` (`titre`, `description`, `verificationGoogle?`). Types `Accueil`, `Lieu`, `Referencement` via `z.infer`. Limites du bloc Global Constraints.
- Produces (`src/lib/fixture.ts`): `Collection` accepte `'reglages'` ; `contentBase('reglages')` renvoie toujours `./src/content/reglages`, même avec un jeu de test.
- Produces (`src/content.config.ts`): collections `reglagesAccueil`, `reglagesLieu`, `reglagesReferencement`, chacune `glob({ pattern: '<nom>.md', base: contentBase('reglages') })` (id = `accueil` / `lieu` / `referencement`).

- [ ] **Step 1: Tests qui échouent** dans `content-schema.test.ts` : `lieuSchema` accepte `{nom:'Parc', latitude:48.64703, longitude:1.811268}` ; refuse latitude 90.1 et -90.1, longitude 180.1, latitude en texte `'48,647'`, nom vide. `accueilSchema` refuse `infos: []`, six `infos`, une `icone` hors liste, un `bouton` de 31 caractères. `referencementSchema` accepte un code Google de 20 caractères `[A-Za-z0-9_-]` et refuse `'<meta name="google-site-verification" content="abc">'`, un code de 19 caractères, un titre de 71 caractères, une description de 49. Dans `tests/unit/contenu.test.ts` : `contentBase('reglages', {CONTENT_FIXTURE:'1', CONTENT_FIXTURE_SET:'vide'})` = `./src/content/reglages`.
- [ ] **Step 2:** `npx vitest run tests/unit/content-schema.test.ts tests/unit/contenu.test.ts` : échec (symboles absents).
- [ ] **Step 3: Implémenter** les schémas et `ICONES_BIENFAIT`/`CODE_GOOGLE_REGEX` dans `schemas.ts` ; étendre `Collection` et `contentBase` dans `fixture.ts` (le jeu de test ne remplace que `rendezvous` et `actualites`) ; déclarer les trois collections dans `content.config.ts`.
- [ ] **Step 4: Créer les trois fichiers de contenu** avec les valeurs actuelles : `accueil.md` (front matter : accroche `1 heure pour vous…`, titre `Qi Gong`, sousTitre `Animation découverte`, devise `Respirez, Bougez, Équilibrez-vous`, infos `[Parc de Rambouillet, samedis ou dimanches à 16h00, gratuit]`, bouton `Venez essayer`, bienfaits dans l'ordre souffle « Faire circuler l’énergie », lotus « Calmer l’esprit », silhouette « Travailler les muscles profonds », yinyang « Souplesse ») ; `lieu.md` (nom, latitude 48.64703, longitude 1.811268, corps vide pour l'instant) ; `referencement.md` (titre `Fan 2 Harmonie — Qi Gong au parc de Rambouillet`, description = celle de `index.astro`, sans `verificationGoogle`). Étendre `tests/content/contenu.test.ts` pour valider ces trois fichiers avec leurs schémas.
- [ ] **Step 5:** `npm test` (seuls les 4 échecs connus), `npm run check`, `npm run verifier:contenu` : verts.
- [ ] **Step 6: Commit** `feat: schémas et contenus initiaux des réglages (accueil, lieu, référencement)`.

## Task 2: Rubrique « Réglages du site » dans l'admin

**Files:**
- Modify: `public/admin/config.yml`
- Test: `tests/unit/cms-config.test.ts`

**Interfaces:**
- Consumes: `accueilSchema`, `lieuSchema`, `referencementSchema`, `CODE_GOOGLE_REGEX`, `ICONES_BIENFAIT`.
- Produces: collection Sveltia `reglages` (label « Réglages du site », type `files`, ni création ni suppression) avec trois fichiers `accueil` (« Page d’accueil »), `lieu` (« Lieu de la pratique »), `referencement` (« Référencement Google »), chemins `src/content/reglages/<nom>.md`.

- [ ] **Step 1: Tests qui échouent** dans `cms-config.test.ts` : la liste des collections devient `['actualites','pages','reglages','rendezvous']` ; pour chaque fichier de `reglages`, `champsFrontMatter` = clés du schéma correspondant ; fichiers présents ; ni `create` ni `delete` ; `lieu` : champs `latitude` et `longitude` de widget `number`, `value_type: float`, `min`/`max` égaux aux bornes du schéma (-90/90, -180/180) ; `verificationGoogle` : `pattern[0]` = `CODE_GOOGLE_REGEX.source`, message contenant « balise », `required: false`, et le motif refuse une balise `<meta …>` entière ; `bienfaits.icone` : `select` dont les valeurs = `ICONES_BIENFAIT` ; `infos` : `widget: list`, `min: 1`, `max: 5` ; chaque champ a un `label` en français et un `hint`. Le test « libellés » existant doit continuer de passer (parcourt aussi les `files`).
- [ ] **Step 2:** `npx vitest run tests/unit/cms-config.test.ts` : échec.
- [ ] **Step 3: Écrire la collection `reglages`** dans `config.yml` (champs et indications en français simple, `editor.preview: false`, éditeur Markdown du lieu limité comme les pages : `buttons: [bold, italic, link, bulleted-list]`, `modes: [rich_text]`, `editor_components: []`, même aide sur les paragraphes). Hint du code Google : « Collez seulement le code (la suite de lettres et de chiffres), pas toute la balise ».
- [ ] **Step 4:** `npx vitest run tests/unit/cms-config.test.ts` : vert ; `npm test` global.
- [ ] **Step 5: Commit** `feat: rubrique « Réglages du site » dans l'administration`.

## Task 3: Lieu éditable

**Files:**
- Modify: `src/lib/schemas.ts`, `src/lib/jsonld.ts`, `src/lib/carte.ts` (inchangé sauf type), `src/components/LienCarte.astro`, `src/layouts/Base.astro`, `src/pages/index.astro`, `src/config/site.ts`, `public/admin/config.yml`, `src/content/pages/pratique.md`, `src/content/reglages/lieu.md`, `src/content/rendezvous/*.md`
- Test: `tests/unit/jsonld.test.ts`, `tests/unit/content-schema.test.ts`, `tests/unit/cms-config.test.ts`, `tests/unit/lieu.test.ts` (nouveau), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `lieuSchema`/`Lieu`, `lienCarte`, `coordonneesFr`.
- Produces: `rendezvousSchema.lieu` devient `z.string().optional()` (plus de défaut) ; `LIEU_PAR_DEFAUT` supprimé ; `resoudreLieu(lieuSeance: string | undefined, lieuHabituel: string): string` dans `src/lib/lieu.ts` (vide ou espaces → lieu habituel) ; `InfosSite` remplace `gps` par `lieu: { nom: string; lat: number; lon: number }` ; « lieu habituel » = `seance.lieu === infos.lieu.nom` ; `site.gps` supprimé de `src/config/site.ts` ; `LienCarte` reçoit `gps: Gps` en propriété ; `Base.astro` lit `getEntry('reglagesLieu','lieu')` lui-même (pages 404 et mentions légales comprises).

- [ ] **Step 1: Tests qui échouent.** `lieu.test.ts` : `resoudreLieu(undefined,'A')`, `resoudreLieu('','A')`, `resoudreLieu('  ','A')` = `'A'` ; `resoudreLieu('B','A')` = `'B'`. `jsonld.test.ts` : remplacer `LIEU_PAR_DEFAUT` et `gps` par `lieu: {nom:'Parc test', lat:48.1, lon:1.2}` ; une séance dont le lieu vaut `'Parc test'` produit `geo` 48.1 / 1.2 et ville Rambouillet ; une séance dont le lieu vaut `'Salle des fêtes'` produit `address: 'Salle des fêtes'` sans `geo`. `content-schema.test.ts` : `rendezvousSchema.parse({date,heure}).lieu` est `undefined`. `cms-config.test.ts` : champ `lieu` des rendez-vous sans `default`, hint « Laissez vide pour le lieu habituel… » ; le test de front matter n'importe plus `LIEU_PAR_DEFAUT`. `smoke.spec.ts` : `#pratique` contient « 48,64703° N, 1,811268° E » et le lien Maps `…query=48.64703,1.811268` (test de non-régression sur les valeurs initiales).
- [ ] **Step 2:** `npx vitest run` ciblé : échec.
- [ ] **Step 3: Implémenter** `lieu.ts`, les changements de schéma et de `jsonld.ts`, le retrait de `site.gps`. `index.astro` charge le lieu, passe `lieu.data.nom` à `resoudreLieu` pour chaque séance (`lieu` résolu transmis à `Base`/`RdvList`), rend le corps du lieu (`render(entree)`) dans `#pratique` avant `LienCarte` sous le titre « Le lieu » ; `LienCarte` reçoit `gps={{lat, lon}}`. Retirer le défaut du champ `lieu` du CMS.
- [ ] **Step 4: Déplacer l'itinéraire** : couper de `pratique.md` le paragraphe « Dans le parc de Rambouillet en allant à la bergerie … fanion « Fan 2 Harmonie » » (sauts de ligne forcés `\` conservés, mots inchangés) et le coller dans le corps de `lieu.md`. Tout le reste de `pratique.md` reste tel quel.
- [ ] **Step 5: Migrer les rendez-vous** : supprimer la ligne `lieu: Parc de Rambouillet, près de la bergerie` des fichiers de `src/content/rendezvous/` (commande : `sed -i '/^lieu: Parc de Rambouillet, près de la bergerie$/d' src/content/rendezvous/*.md`), vérifier `git diff` : seules ces lignes disparaissent.
- [ ] **Step 6:** `npm test`, `npm run check`, `npx playwright test tests/e2e/smoke.spec.ts` : verts ; vérifier à la main dans `dist/index.html` que la page est identique pour le lieu et le lien Maps.
- [ ] **Step 7: Commit** `feat: lieu de la pratique éditable (nom, coordonnées, indications d'accès)`.

## Task 4: Accueil éditable

**Files:**
- Modify: `src/components/Hero.astro`, `src/pages/index.astro`
- Test: `tests/e2e/smoke.spec.ts` (ou le spec d'accueil existant)

**Interfaces:**
- Consumes: `Accueil` (Task 1) ; icônes `IconSouffle`, `IconLotus`, `IconSilhouette`, `IconYinYang`.
- Produces: `Hero.astro` reçoit `accueil: Accueil` ; `infos` rendues séparées par `<span aria-hidden="true">·</span>` ; `icone` → composant par table `{souffle: IconSouffle, …}`.

- [ ] **Step 1: Test qui échoue** (e2e, contenu réel) : `h1` contient « Qi Gong » et « Animation découverte » (le « : » masqué `sr-only` reste), `.accueil__infos` a pour texte « Parc de Rambouillet · samedis ou dimanches à 16h00 · gratuit », le bouton « Venez essayer » mène à `#rdv`, quatre bienfaits dans l'ordre. Doit déjà passer avec le code en dur : l'écrire d'abord, puis constater qu'il passe encore après le changement (non-régression), puis ajouter un test unitaire de la table d'icônes seulement si elle est extraite en `src/lib/` (sinon e2e seul).
- [ ] **Step 2: Implémenter** : `Hero` lit `accueil` en propriété ; `index.astro` charge `getEntry('reglagesAccueil','accueil')` (erreur explicite « Texte manquant : src/content/reglages/accueil.md » si absent, comme `page()`). Animations, ordre du DOM, classes et `--retard` inchangés.
- [ ] **Step 3:** e2e `smoke` + `layout` (pas de débordement) + axe : verts.
- [ ] **Step 4: Commit** `feat: textes de la page d'accueil éditables`.

## Task 5: Photos d'actualités — données, admin et jeux de test

**Files:**
- Modify: `src/lib/schemas.ts`, `src/content.config.ts`, `public/admin/config.yml`, `tests/fixtures/jeux.ts`, `tests/e2e/admin.spec.ts`, `tests/unit/cms-config.test.ts`, `tests/unit/content-schema.test.ts`
- Create: `tests/fixtures/content/galerie/actualites/{une-photo,cinq-photos,sans-photo}.md`, images `tests/fixtures/content/galerie/actualites/p1.jpg … p5.jpg`, `tests/fixtures/content/galerie/rendezvous/2099-03-14.md`

**Interfaces:**
- Produces (`schemas.ts`): `photoSchema = z.object({ image: z.string(), legende: z.string().max(120).optional() })` ; `actualiteSchema` perd `image` et gagne `photos: z.array(photoSchema).max(12).optional()`. `content.config.ts` étend : `photos: z.array(photoSchema.extend({ image: image() })).max(12).default([])`.
- Produces (`jeux.ts`): jeu `galerie: 4331`.

- [ ] **Step 1: Tests qui échouent.** `content-schema.test.ts` : `actualiteSchema` accepte 12 photos, refuse 13, refuse une légende de 121 caractères, accepte l'absence de `photos`. `cms-config.test.ts` : champ `photos` de widget `list`, `max: 12`, `required: false`, sous-champs `image` (widget `image`, `accept` JPEG/PNG/WebP, `choose_url: false`) et `legende` (`required: false`, `maxlength: 120`) ; `champsFrontMatter(actualites)` = clés du schéma ; le test « image d'actualité : public_folder… » et celui du front matter (`image: …/photo.webp`) sont réécrits avec `photos: - image: …` (même résolution de chemin). `admin.spec.ts` (lignes ~299-345) : remplacer `image` par `photos[0].image` (`../../assets/actualites/hero.webp`), actualité sans photo : aucune clé `photos`.
- [ ] **Step 2:** tests ciblés : échec.
- [ ] **Step 3: Implémenter** schéma, `content.config.ts` et champ `photos` du CMS (liste, libellé « Photos », indication « Ajoutez autant de photos que vous voulez (12 au plus). La légende est facultative, elle décrit la photo pour les personnes qui ne la voient pas. »). Retirer le champ `image`. Vérifier avant : `git grep -n "^image:" origin/main -- src/content/actualites` ne renvoie rien (sinon migrer ce fichier).
- [ ] **Step 4: Jeu `galerie`.** Générer cinq petits JPEG distincts avec sharp (une commande jetable, par exemple `node -e` créant des aplats 1200×800 de couleurs différentes), les placer à côté des `.md` ; `une-photo.md` (1 photo avec légende), `cinq-photos.md` (5 photos dont 2 sans légende, une légende de 120 caractères), `sans-photo.md`, dates en 2099 ; chemins `./p1.jpg`. Ajouter `galerie: 4331` à `JEUX`.
- [ ] **Step 5:** `npm test`, `npm run check`, `CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=galerie npm run build` : la construction réussit.
- [ ] **Step 6: Commit** `feat: plusieurs photos par actualité (données, administration, jeu de test)`.

## Task 6: Photos d'actualités — affichage en galerie

**Files:**
- Create: `src/components/GaleriePhotos.astro`, `src/scripts/galerie.ts`, `src/lib/galerie.ts`, `tests/unit/galerie.test.ts`, `tests/e2e/galerie.spec.ts`
- Modify: `src/components/ActualiteCard.astro`, `src/pages/index.astro`, `src/lib/actualites.ts`, `tests/unit/actualites.test.ts`

**Interfaces:**
- Produces (`src/lib/galerie.ts`): `texteAlternatif(legende: string | undefined, titre: string, rang: number, total: number): string` — légende (sans espaces autour) si non vide, sinon `« {titre} (photo {rang} sur {total}) »` (rang à partir de 1).
- Produces (`src/scripts/galerie.ts`): `initialiserGaleries(racine: ParentNode): void` — ouverture au clic sur `[data-galerie-vignette]`, fermeture Échap / clic sur le fond / bouton « Fermer », focus rendu à la vignette.
- `ActualiteCard` : propriété `photos: { image: ImageMetadata; legende?: string | undefined }[]` (remplace `image`/`imageAlt`). 1 photo : mise en page actuelle ; 2 photos ou plus : `GaleriePhotos` sous le texte ; 0 : aucun élément d'image.
- `dernieresActualites(items, n = 6)`.

- [ ] **Step 1: Tests unitaires qui échouent** : `texteAlternatif('  Le groupe  ','T',1,3)` = `'Le groupe'` ; `texteAlternatif(undefined,'Stage',2,5)` = `'Stage (photo 2 sur 5)'` ; légende vide ou d'espaces → texte par défaut ; `dernieresActualites` renvoie 6 éléments par défaut sur 8 (adapter le test existant qui attend 3).
- [ ] **Step 2: Tests e2e qui échouent** (`galerie.spec.ts`, jeu `galerie`) : actualité à 5 photos → 5 vignettes `button` avec `aria-label` « Agrandir la photo : … », images `loading="lazy"` avec `alt` non vide ; actualité à 1 photo → une image, aucune vignette ni dialogue ; sans photo → aucun `img` ; clic sur la 3e vignette → `dialog[open]` affichant l'image agrandie correspondante ; Échap ferme et le focus revient à la 3e vignette ; clic sur le fond ferme ; bouton « Fermer » ferme ; à 390 px : `sansDebordement`, `sansViolationAxe` (animations réduites) ; la page ne déclenche aucune violation CSP (comme `csp.spec.ts`).
- [ ] **Step 3: Implémenter** `galerie.ts` (lib), `GaleriePhotos.astro` (vignettes carrées `object-fit: cover`, grille responsive ; chaque vignette porte `data-grand` = URL d'une version 1600 px calculée avec `getImage`, l'image agrandie n'est chargée qu'au clic ; un seul `<dialog>` par actualité ; respect de `prefers-reduced-motion`), `src/scripts/galerie.ts` appelé depuis `index.astro` comme `appliquerDates`, adaptation de `ActualiteCard` et de la boucle de `index.astro` (`photos` au lieu d'`image`), `n = 6`.
- [ ] **Step 4:** `npm test`, `npm run check`, `npx playwright test tests/e2e/galerie.spec.ts tests/e2e/rdv-actus.spec.ts tests/e2e/csp.spec.ts tests/e2e/layout.spec.ts` : verts. Le jeu `sans-image` existant doit encore passer (renommer son titre si besoin n'est pas nécessaire).
- [ ] **Step 5: Commit** `feat: galerie de photos dans les actualités, six actualités sur l'accueil`.

## Task 7: Recette intermédiaire (point d'arrêt avec Fares)

**Files:** aucun.

- [ ] **Step 1:** `npm test`, `npm run check`, `npm run build`, `npm run test:e2e` : tout vert (hors les 4 échecs connus de `npm test`).
- [ ] **Step 2:** `npm run lighthouse` : pas de régression de score sur l'accueil par rapport à la base de la Task 0 (noter les deux séries de scores dans le message de fin de tâche).
- [ ] **Step 3:** Lancer `npm run preview -- --port 4321` en arrière-plan et donner l'adresse à Fares pour contrôle visuel (accueil, lieu, galerie à 1, 5 photos avec le jeu `galerie` : `CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=galerie npm run build && npm run preview -- --port 4331`).
- [ ] **Step 4: S'arrêter** et attendre l'accord de Fares avant la Task 8 (le SEO vient en dernier, comme convenu).

## Task 8: Référencement dans le code

**Files:**
- Modify: `src/layouts/Base.astro`, `src/pages/index.astro`, `src/lib/jsonld.ts`, `src/lib/schemas.ts`, `src/content/reglages/accueil.md`, `public/admin/config.yml`, `astro.config.mjs`
- Create: `src/components/Faq.astro`
- Test: `tests/unit/jsonld.test.ts`, `tests/unit/cms-config.test.ts`, `tests/e2e/base.spec.ts`

**Interfaces:**
- Produces: `accueilSchema.faq: z.array(z.object({question: z.string().min(1).max(120), reponse: z.string().min(1).max(400)})).max(8).default([])` ; `donneesSite(infos, seances, faq?: { question: string; reponse: string }[])` ajoute un nœud `FAQPage` (`mainEntity` de `Question` / `acceptedAnswer`) seulement si la FAQ n'est pas vide ; `Base.astro` : propriété `verificationGoogle?: string` rendue en `<meta name="google-site-verification" content=…>` seulement si présente, titre et description venant de `referencement.md` pour l'accueil.

- [ ] **Step 1: Tests qui échouent.** `jsonld.test.ts` : FAQ vide → aucun nœud `FAQPage` ; deux questions → nœud `FAQPage` avec deux `Question` dont `acceptedAnswer.text` = réponse ; `serialiserJsonLd` échappe toujours `<`. `cms-config.test.ts` : champ `faq` (liste, `max: 8`, sous-champs `question`, `reponse` de widget `text`). `base.spec.ts` : titre et description de l'accueil = valeurs de `referencement.md` ; aucune balise `google-site-verification` tant que le champ est vide ; une seule balise `h1` ; `robots` absent hors 404 ; canonique `https://fan2harmonie.fr/`.
- [ ] **Step 2: Implémenter** la FAQ (schéma, champ CMS, `Faq.astro` en `<details>` accessibles dans la section « La pratique », données structurées) et le contenu initial de 4 questions dans `accueil.md` **sans aucun horaire** : où (parc de Rambouillet, voir « La pratique »), quand (« Les dates et heures des prochaines séances sont dans « Prochains rendez-vous » »), combien (gratuit), quelle tenue (vêtements souples et chaussures plates). Titre / description de l'accueil lus dans `referencement.md` ; valeurs proposées : titre `Qi Gong gratuit à Rambouillet — Fan 2 Harmonie`, description `Séances de Qi Gong gratuites en plein air au parc de Rambouillet (Yvelines), ouvertes à tous, à tout âge et à tous niveaux. Dates et lieu sur le site.` (sans horaire ; Fares les valide). `sitemap({ serialize: (item) => ({ ...item, lastmod: new Date().toISOString() }) })` dans `astro.config.mjs`, seulement pour l'accueil.
- [ ] **Step 3:** `npm test`, `npm run check`, `npx playwright test tests/e2e/base.spec.ts tests/e2e/quality.spec.ts tests/e2e/csp.spec.ts` : verts ; contrôler `dist/sitemap-0.xml` (`lastmod` présent) et le JSON-LD de `dist/index.html`.
- [ ] **Step 4: Commit** `feat: référencement (titre et description éditables, FAQ, code de vérification Google, sitemap daté)`.

## Task 9: Guide de Stéphanie et procédure Google

**Files:**
- Modify: `docs/GUIDE-STEPHANIE.md`, `docs/presentation-stephanie.html`, `docs/Fan2Harmonie-presentation-Stephanie.pdf` (via `node scripts/pdf-presentation.mjs`), `README.md`, `tests/docs/guide-stephanie.test.ts`
- Create: `docs/PROCEDURE-GOOGLE.md`, `tests/docs/procedure-google.test.ts`

- [ ] **Step 1: Tests qui échouent.** `guide-stephanie.test.ts` : nouvelles rubriques « Modifier la page d’accueil », « Modifier le lieu », « Publier une actualité avec plusieurs photos » ; le guide reste sous 1 500 mots et sans mot interdit. `procedure-google.test.ts` : le document existe, aucun mot de la liste `INTERDITS` du guide, moins de 1 200 mots, contient les rubriques « Créer son compte Google », « S’inscrire à la Search Console », « Envoyer le plan du site », « Créer la fiche Google Business Profile », « Se faire connaître localement », « Suivre les résultats », les adresses `https://search.google.com/search-console` et `https://fan2harmonie.fr/sitemap-index.xml`, la phrase indiquant de coller **seulement le code** et la rubrique de l'admin « Référencement Google ».
- [ ] **Step 2:** `npm run test:docs` : échec.
- [ ] **Step 3: Rédiger** les rubriques du guide (captures de l'admin pour accueil, lieu et photos, prises sur le site en local via Playwright comme les captures existantes de `docs/images/guide/`), et `PROCEDURE-GOOGLE.md` à la première personne comme le guide existant : méthode de vérification « balise HTML » (copier la valeur de `content="…"`, la coller dans Référencement Google de l'admin, attendre la mise à jour du site, cliquer sur Valider), repli par enregistrement DNS chez OVH, envoi du sitemap, « Inspection de l’URL » puis « Demander une indexation », fiche Business Profile (activité gratuite en plein air, lieu public, pas d'adresse postale privée), liens locaux (office de tourisme et mairie de Rambouillet, associations, Facebook), délai normal de quelques jours à quelques semaines.
- [ ] **Step 4:** `npm run test:docs` vert ; régénérer le PDF ; mentionner la procédure dans le `README`.
- [ ] **Step 5: Commit** `docs: guide mis à jour (accueil, lieu, photos) et procédure Google pour Stéphanie`.

## Task 10: Recette finale et passage de relais

**Files:**
- Modify: `src/content/rendezvous/*.md` (migration si de nouveaux fichiers sont arrivés)

- [ ] **Step 1: Resynchroniser** : `git fetch origin`, `git rebase origin/main` ; si Stéphanie a créé des rendez-vous entre-temps, rejouer la commande de migration de la Task 3 Step 5 et vérifier `git diff` (seules les lignes `lieu:` identiques à l'ancien nom disparaissent). Aucun contenu de `main` perdu : `git diff --stat origin/main -- src/content` ne montre que mes changements prévus.
- [ ] **Step 2:** `npm test` (4 échecs connus seulement), `npm run check`, `npm run verifier:contenu`, `npm run verifier:mise-en-ligne`, `npm run test:docs`, `npm run test:e2e`, `npm run lighthouse` : tout vert, scores sans régression.
- [ ] **Step 3: Demander à Fares de faire confirmer par Stéphanie** les horaires de l'accueil (`infos` : actuellement « samedis ou dimanches à 16h00 » alors que son texte « La pratique » dit « samedi à 16h00 ou dimanche à 10h00 » et que les rendez-vous réels sont à 10h00 et 17h00), puis corriger `accueil.md` en conséquence.
- [ ] **Step 4: Résumé et arrêt.** Présenter la liste des commits de `preprod`, l'état des tests et la procédure Google ; **ne pas pousser ni fusionner**. Fusionner dans `main` (qui déclenche le déploiement) uniquement sur accord explicite de Fares, puis vérifier le déploiement avec `gh run list`.
