import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** README : phrases qui doivent rester exactes (`npm run test:docs`, non bloquant au déploiement). */

const RACINE = path.resolve(__dirname, '../..');
const readme = readFileSync(path.join(RACINE, 'README.md'), 'utf8');
const plat = readme.replace(/\s+/g, ' ');

describe('README.md', () => {
  it('ASTRO_BASE : aperçu seulement, jamais en production', () => {
    expect(plat).toMatch(/`ASTRO_BASE` ne sert qu’à cet aperçu, jamais en production/);
  });

  it('liste toutes les commandes de test, y compris les suites non bloquantes', () => {
    for (const commande of [
      'npm test',
      'npm run test:e2e',
      'npm run test:php',
      'npm run test:php81',
      'npm run test:apache',
      'npm run lighthouse',
      'npm run verifier:mise-en-ligne',
      'npm run verifier:contenu',
      'npm run test:docs',
    ]) {
      expect(readme, commande).toContain(commande);
    }
    expect(plat).toMatch(/non bloquant/);
  });
});
