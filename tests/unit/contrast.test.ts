import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../../src/lib/contrast';
import { jeton as jetonDe, lireJetons } from '../../src/lib/jetons';

/** Lit les jetons de couleur directement dans tokens.css : tests et CSS ne peuvent pas diverger. */
const css = readFileSync('src/styles/tokens.css', 'utf8');
const jeton = (nom: string) => jetonDe(css, nom);

describe('lireJetons', () => {
  it('lit les couleurs hexadécimales, ignore les autres jetons', () => {
    expect(lireJetons(':root { --a: #fff; --b:#12AB34; --c: var(--a); --d: 1rem; }')).toEqual({ a: '#fff', b: '#12AB34' });
  });

  it('jeton absent : erreur explicite', () => {
    expect(() => jetonDe(':root { --a: #fff; }', 'b')).toThrow('--b');
  });
});

describe('contrastRatio', () => {
  it('blanc sur noir = 21', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
  });

  it('couleurs identiques = 1', () => {
    expect(contrastRatio('#2c4a2e', '#2c4a2e')).toBe(1);
  });

  it('est symétrique', () => {
    expect(contrastRatio('#26331f', '#faf5e8')).toBeCloseTo(contrastRatio('#faf5e8', '#26331f'), 10);
  });

  it('accepte la notation courte #rgb', () => {
    expect(contrastRatio('#fff', '#000')).toBe(21);
  });

  it('valeur de référence WCAG : #777777 sur blanc ≈ 4,48', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('rejette une couleur invalide', () => {
    expect(() => contrastRatio('rouge', '#000000')).toThrow();
  });
});

describe('jetons de la charte (lus dans tokens.css)', () => {
  it('définit les cinq couleurs de base', () => {
    for (const nom of ['foret', 'dore', 'rose', 'creme', 'encre']) expect(jeton(nom)).toMatch(/^#/);
  });

  const paires: Array<[texte: string, fond: string]> = [
    ['encre', 'creme'],
    ['foret', 'creme'],
    ['blanc', 'rose'],
    ['creme', 'foret'],
    ['creme', 'foret-profond'],
    ['encre-doux', 'creme'],
    ['encre', 'creme-fonce'],
    ['blanc', 'rose-fonce'],
    ['rose', 'creme'],
    // Formulaire de contact : textes sur la carte (entre blanc et crème), indications d'erreur, messages.
    ['encre', 'blanc'],
    ['encre-doux', 'blanc'],
    ['rose-fonce', 'blanc'],
    ['rose-fonce', 'creme'],
    ['encre', 'rose-doux'],
    ['foret', 'blanc'],
  ];
  for (const [texte, fond] of paires) {
    it(`texte ${texte} sur fond ${fond} ≥ 4,5:1`, () => {
      expect(contrastRatio(jeton(texte), jeton(fond))).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Anneau de focus (élément non textuel, WCAG 1.4.11) : ≥ 3:1 contre le fond.
  const anneaux: Array<[anneau: string, fond: string]> = [
    ['rose-fonce', 'creme'],
    ['focus-sur-fonce', 'foret'],
    ['focus-sur-fonce', 'foret-profond'],
    // Contour des champs (composant d'interface, WCAG 1.4.11) et contour d'un champ invalide.
    ['bordure-champ', 'blanc'],
    ['bordure-champ', 'creme'],
    ['rose-fonce', 'blanc'],
  ];
  for (const [anneau, fond] of anneaux) {
    it(`élément d’interface ${anneau} sur ${fond} ≥ 3:1`, () => {
      expect(contrastRatio(jeton(anneau), jeton(fond))).toBeGreaterThanOrEqual(3);
    });
  }
});
