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
