import { describe, expect, it } from 'vitest';
import { dernieresActualites, formatDateLongueFr } from '../../src/lib/actualites';

const actu = (id: string, date: string) => ({ id, data: { date: new Date(`${date}T00:00:00.000Z`) } });

describe('formatDateLongueFr', () => {
  it('jour, mois en toutes lettres, année', () => {
    expect(formatDateLongueFr(new Date('2026-10-04T00:00:00.000Z'))).toBe('4 octobre 2026');
  });

  it('« 1er » pour le premier du mois', () => {
    expect(formatDateLongueFr(new Date('2026-03-01T00:00:00.000Z'))).toBe('1er mars 2026');
  });

  it('lit le jour en UTC (date de contenu à minuit UTC), quel que soit le fuseau', () => {
    expect(formatDateLongueFr(new Date('2026-12-31T00:00:00.000Z'))).toBe('31 décembre 2026');
  });
});

describe('dernieresActualites', () => {
  it('les 6 plus récentes par défaut (sur 8), plus récente d’abord, sans modifier la liste reçue', () => {
    const items = [
      actu('a', '2026-01-10'),
      actu('b', '2026-03-01'),
      actu('c', '2025-12-01'),
      actu('d', '2026-02-14'),
      actu('e', '2025-11-05'),
      actu('f', '2025-10-20'),
      actu('g', '2025-09-01'),
      actu('h', '2026-04-02'),
    ];
    expect(dernieresActualites(items).map((a) => a.id)).toEqual(['h', 'b', 'd', 'a', 'c', 'e']);
    expect(items.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('`n` choisi : les `n` plus récentes', () => {
    const items = [actu('a', '2026-01-10'), actu('b', '2026-03-01'), actu('c', '2025-12-01')];
    expect(dernieresActualites(items, 2).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('même date : ordre stable par identifiant', () => {
    expect(dernieresActualites([actu('b', '2026-01-10'), actu('a', '2026-01-10')]).map((a) => a.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('liste vide → liste vide', () => {
    expect(dernieresActualites([])).toEqual([]);
  });
});
