# Fan 2 Harmonie

Tout tourne dans Docker (rien à installer sur le PC).

- Première fois : `docker compose run --rm app npm install`
- Tests unitaires : `docker compose run --rm app npm test`
- Tests E2E : `docker compose run --rm app npm run test:e2e`
- Développement : `docker compose up`, puis http://localhost:4321