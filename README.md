# Fan 2 Harmonie

Tout tourne dans Docker (rien à installer sur le PC).

- Première fois : `docker compose run --rm app npm install`
- Après toute modification de `package.json` : relancer `docker compose run --rm app npm install`
- Tests unitaires : `docker compose run --rm app npm test`
- Tests E2E : `docker compose run --rm app npm run test:e2e`
  - Les rendez-vous et actualités de test sont dans `tests/fixtures/content/<jeu>/` (dates 2099 = à venir, 2020 = passées).
    Playwright construit chaque jeu avec `CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>` dans `dist-fixture-<jeu>/`
    et le sert sur le port indiqué dans `tests/fixtures/jeux.ts` (4322 et suivants) ; le vrai contenu reste sur `dist/` et le port 4321.
- Développement : `docker compose up`, puis http://localhost:4321

## Administration

- Adresse : `/admin` (Sveltia CMS, en français si le navigateur l'est). Rendez-vous, actualités (photo facultative) et textes des pages.
- Connexion avec un compte GitHub ayant accès au dépôt (collaborateurs du dépôt) ; chaque enregistrement est un commit, le site se reconstruit seul.
- Configuration : `public/admin/config.yml` ; `repo` et `base_url` (relais d'authentification) valent `À_COMPLÉTER` jusqu'à la Task 11.
- Le script du CMS (version exacte épinglée dans `package.json`) est copié dans `public/admin/` par `npm run dev` / `npm run build` (non versionné).
- En local, sur http://localhost:4321/admin, « Travailler avec un dépôt local » édite directement les fichiers du projet (Chrome ou Edge, une fois `repo` renseigné).
