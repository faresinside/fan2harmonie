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
  it('les 3 plus récentes, plus récente d’abord, sans modifier la liste reçue', () => {
    const items = [actu('a', '2026-01-10'), actu('b', '2026-03-01'), actu('c', '2025-12-01'), actu('d', '2026-02-14')];
    expect(dernieresActualites(items).map((a) => a.id)).toEqual(['b', 'd', 'a']);
    expect(items.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd']);
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
