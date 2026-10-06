import { defineConfig } from 'vitest/config';

/**
 * Tests de la documentation (README, checklist de mise en ligne, guide de Stéphanie) : `npm run test:docs`.
 * NON bloquants dans le déploiement : une retouche du README ne doit jamais empêcher une mise en ligne.
 */
export default defineConfig({
  test: { include: ['tests/docs/**/*.test.ts'] },
});
