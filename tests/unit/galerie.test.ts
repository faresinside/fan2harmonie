import { describe, expect, it } from 'vitest';
import { texteAlternatif } from '../../src/lib/galerie';

describe('texteAlternatif', () => {
  it('la légende, sans les espaces autour', () => {
    expect(texteAlternatif('  Le groupe  ', 'T', 1, 3)).toBe('Le groupe');
  });

  it('sans légende : titre de l’actualité et rang de la photo', () => {
    expect(texteAlternatif(undefined, 'Stage', 2, 5)).toBe('Stage (photo 2 sur 5)');
  });

  it('légende vide ou faite d’espaces : texte par défaut, jamais vide', () => {
    expect(texteAlternatif('', 'Stage', 1, 2)).toBe('Stage (photo 1 sur 2)');
    expect(texteAlternatif('   \n\t ', 'Stage', 2, 2)).toBe('Stage (photo 2 sur 2)');
  });
});
