import { defineConfig } from 'vitest/config';

/**
 * Contrôle du contenu RÉEL (src/content/), écrit par l'éditrice dans /admin : `npm run verifier:contenu`.
 * NON bloquant dans le déploiement (simple avertissement) : un contenu imparfait ne doit jamais empêcher une
 * mise en ligne. Le `npm test` bloquant (vitest.config.ts) ne lit jamais ce contenu.
 */
export default defineConfig({
  test: { include: ['tests/content/**/*.test.ts'] },
});
