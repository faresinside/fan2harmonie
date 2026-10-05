import { defineConfig } from 'vitest/config';

/**
 * Garde-fou de mise en ligne seul (`npm run verifier:mise-en-ligne`) : tests/deploy/.
 * Le `npm test` habituel (vitest.config.ts) ne charge que tests/unit/ et ne lance donc jamais ce test.
 */
export default defineConfig({
  test: { include: ['tests/deploy/**/*.test.ts'] },
});
