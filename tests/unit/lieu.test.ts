import { describe, expect, it } from 'vitest';
import { lieuDeSeance, resoudreLieu } from '../../src/lib/lieu';

describe('resoudreLieu', () => {
  it('lieu absent, vide ou fait d’espaces : le lieu habituel', () => {
    expect(resoudreLieu(undefined, 'A')).toBe('A');
    expect(resoudreLieu('', 'A')).toBe('A');
    expect(resoudreLieu('  ', 'A')).toBe('A');
  });

  it('autre lieu : conservé tel quel', () => {
    expect(resoudreLieu('B', 'A')).toBe('B');
  });
});

describe('lieuDeSeance (case « Au lieu par mauvais temps »)', () => {
  it('case cochée et autre lieu rempli : l’autre lieu, signalé comme repli', () => {
    expect(lieuDeSeance({ repli: true }, 'Parc', 'Jardin')).toEqual({ lieu: 'Jardin', repli: true, habituel: false });
    expect(lieuDeSeance({ repli: true, lieu: 'Salle' }, 'Parc', 'Jardin').lieu).toBe('Jardin');
  });

  it('case cochée sans autre lieu (absent ou vide) : sans effet', () => {
    expect(lieuDeSeance({ repli: true }, 'Parc', undefined)).toEqual({ lieu: 'Parc', repli: false, habituel: true });
    expect(lieuDeSeance({ repli: true }, 'Parc', '  ').repli).toBe(false);
  });

  it('case non cochée : lieu de la fiche, sinon le lieu habituel (seul ce cas est « habituel »)', () => {
    expect(lieuDeSeance({}, 'Parc', 'Jardin')).toEqual({ lieu: 'Parc', repli: false, habituel: true });
    expect(lieuDeSeance({ lieu: 'Salle' }, 'Parc', 'Jardin')).toEqual({ lieu: 'Salle', repli: false, habituel: false });
  });
});
