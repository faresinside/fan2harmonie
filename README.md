# Fan 2 Harmonie

Tout tourne dans Docker (rien à installer sur le PC).

- Première fois : `docker compose run --rm app npm install`
- Après toute modification de `package.json` : relancer `docker compose run --rm app npm install`
- Tests unitaires : `docker compose run --rm app npm test`
- Tests E2E : `docker compose run --rm app npm run test:e2e`
  - Les rendez-vous et actualités de test sont dans `tests/fixtures/content/<jeu>/` (dates 2099 = à venir, 2020 = passées).
    Playwright construit chaque jeu avec `CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>` dans `dist-fixture-<jeu>/`
    et le sert sur le port indiqué dans `tests/fixtures/jeux.ts` (4322 et suivants) ; le vrai contenu reste sur `dist/` et le port 4321.
- Portes de qualité :
  - `npm run test:e2e` inclut `tests/e2e/quality.spec.ts` : axe (WCAG 2.x A/AA et bonnes pratiques) à 360, 768 et 1280 px, clavier et focus visible, aucun débordement de 320 à 1920 px, mouvement réduit, `robots.txt` et plan du site.
  - Lighthouse : `docker compose run --rm app npm run lighthouse` (`lighthouserc.json`) construit le site dans `dist-audit/` puis audite `/` et `/mentions-legales/` en mobile, 3 passages chacun, avec le Chromium de l'image Playwright.
    Échec si une catégorie (performance, accessibilité, bonnes pratiques, SEO) est sous 0,95, ou si LCP > 2,5 s, CLS > 0,1, TBT > 200 ms. Rapports : `.lighthouseci/rapports/`.
  - Pour l'audit seulement, `AUDIT_SITE_URL=http://localhost:4400` remplace l'adresse du site (canonique, plan du site, `robots.txt`) ; c'est une variable d'environnement, jamais écrite dans `src/config/site.ts`.
    Elle est posée uniquement par `scripts/lighthouse.mjs` : ne JAMAIS la définir chez l'hébergeur (tableau de bord Cloudflare Pages), sinon le site publié aurait une canonique et un plan du site faux.
- Développement : `docker compose up`, puis http://localhost:4321

## Administration

- Adresse : `/admin` (Sveltia CMS, en français si le navigateur l'est). Rendez-vous, actualités (photo facultative) et textes des pages.
- Connexion avec un compte GitHub ayant accès au dépôt (collaborateurs du dépôt) ; chaque enregistrement est un commit, le site se reconstruit seul.
- Configuration : `public/admin/config.yml` ; `repo` et `base_url` (relais d'authentification) valent `À_COMPLÉTER` jusqu'à la mise en ligne.
- Le script du CMS (version exacte épinglée dans `package.json`, non versionné) est copié dans `public/admin/` par `npm install` / `npm ci` (postinstall), `npm run dev` et `npm run build`. La commande de construction de l'hébergeur doit donc être `npm run build` (pas `astro build` seul).
- Les tests e2e de `/admin` (vrai Sveltia CMS) ont besoin d'Internet (textes français sur unpkg.com, polices sur cdn.jsdelivr.net) et dépendent des libellés de l'interface Sveltia (« Parcourir », « Téléverser », « Insérer », « Enregistrer ») : à revoir à chaque nouvelle version de `@sveltia/cms`.
- En local, sur http://localhost:4321/admin, « Travailler avec un dépôt local » édite directement les fichiers du projet (Chrome ou Edge, une fois `repo` renseigné).
