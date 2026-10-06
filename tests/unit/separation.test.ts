import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `npm test` bloque le déploiement : il ne doit tester que le code. Un geste normal de l'éditrice (supprimer
 * la dernière actualité, changer la date d'un rendez-vous) ou une retouche du README ne doit JAMAIS empêcher
 * une mise en ligne. Le contenu réel est contrôlé par `npm run verifier:contenu` (tests/content/) et la
 * documentation par `npm run test:docs` (tests/docs/), tous deux NON bloquants dans le déploiement.
 */

const RACINE = path.resolve(__dirname, '../..');
const sources = (dossier: string) =>
  readdirSync(path.join(RACINE, dossier))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ f, texte: readFileSync(path.join(RACINE, dossier, f), 'utf8') }));

describe('séparation des suites de tests', () => {
  it('aucun test de tests/unit/ ne lit le contenu modifiable (rendez-vous, actualités) ni la documentation', () => {
    for (const { f, texte } of sources('tests/unit')) {
      if (f === 'separation.test.ts') continue;
      // Chemins sous forme de chaîne seulement ; une lecture passe par readFileSync/readdirSync/existsSync/glob.
      const lectures = texte.match(/(readFileSync|readdirSync|existsSync|statSync|glob)\([^)]*\)/g) ?? [];
      for (const lecture of lectures) {
        expect(lecture, `${f} : ${lecture}`).not.toMatch(/src\/content\/(rendezvous|actualites)|README|docs\/|GUIDE|MISE-EN-LIGNE/);
      }
      expect(texte, f).not.toMatch(/['"`]src\/content['"`]\)/);
    }
  });

  it('configurations : unit, contenu, documentation, mise en ligne ; scripts npm', async () => {
    type Conf = { default: { test?: { include?: string[] } } };
    const inclus = (m: Conf) => m.default.test?.include;
    expect(inclus((await import('../../vitest.config')) as Conf)).toEqual(['tests/unit/**/*.test.ts']);
    expect(inclus((await import('../../vitest.content.config')) as Conf)).toEqual(['tests/content/**/*.test.ts']);
    expect(inclus((await import('../../vitest.docs.config')) as Conf)).toEqual(['tests/docs/**/*.test.ts']);
    expect(inclus((await import('../../vitest.deploy.config')) as Conf)).toEqual(['tests/deploy/**/*.test.ts']);
    const paquet = JSON.parse(readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(paquet.scripts['test']).toBe('vitest run');
    expect(paquet.scripts['verifier:contenu']).toBe('vitest run --config vitest.content.config.ts');
    expect(paquet.scripts['test:docs']).toBe('vitest run --config vitest.docs.config.ts');
  });

  it('les tests de contenu n’exigent ni un nombre minimal de fichiers ni un nom de fichier = date', () => {
    for (const { f, texte } of sources('tests/content')) {
      expect(texte, f).not.toMatch(/toBeGreaterThan(OrEqual)?\(\s*[1-9]/);
      expect(texte, f).not.toMatch(/basename\(/);
    }
  });
});
