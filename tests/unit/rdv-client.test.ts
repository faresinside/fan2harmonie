import { describe, expect, it } from 'vitest';
import { aujourdhuiParis, etatRendezvous } from '../../src/lib/rdv-client';

/**
 * Logique du petit script du navigateur (src/scripts/rendezvous.ts) qui masque, le jour même, les rendez-vous
 * passés depuis la dernière construction du site (reconstruction de la nuit en retard ou suspendue).
 */

describe('aujourdhuiParis', () => {
  it.each([
    ['2026-10-24T21:59:00Z', '2026-10-24'], // 23 h 59 à Paris (heure d'été, UTC+2)
    ['2026-10-24T22:00:00Z', '2026-10-25'], // minuit à Paris
    ['2026-10-25T22:59:00Z', '2026-10-25'], // 23 h 59 à Paris (heure d'hiver, UTC+1)
    ['2026-10-25T23:00:00Z', '2026-10-26'],
    ['2099-03-15T09:00:00Z', '2099-03-15'],
  ])('%s → %s', (instant, attendu) => {
    expect(aujourdhuiParis(new Date(instant))).toBe(attendu);
  });
});

describe('etatRendezvous', () => {
  const rdv = (date: string, annule = false) => ({ date, annule });

  it('rien de passé : tout visible, le premier non annulé mis en avant', () => {
    expect(etatRendezvous([rdv('2099-03-14'), rdv('2099-03-15')], '2099-03-01')).toEqual({ visibles: [true, true], prochain: 0 });
  });

  it('le rendez-vous du jour reste visible jusqu’à minuit', () => {
    expect(etatRendezvous([rdv('2099-03-14'), rdv('2099-03-21')], '2099-03-14')).toEqual({ visibles: [true, true], prochain: 0 });
  });

  it('les passés sont masqués ; le prochain non annulé suivant est mis en avant', () => {
    expect(etatRendezvous([rdv('2099-03-14'), rdv('2099-03-15', true), rdv('2099-03-21')], '2099-03-15')).toEqual({
      visibles: [false, true, true],
      prochain: 2,
    });
  });

  it('tous passés : rien de visible, aucun mis en avant', () => {
    expect(etatRendezvous([rdv('2099-03-14'), rdv('2099-03-21')], '2099-03-22')).toEqual({ visibles: [false, false], prochain: -1 });
  });

  it('tous annulés : visibles, aucun mis en avant', () => {
    expect(etatRendezvous([rdv('2099-03-14', true), rdv('2099-03-21', true)], '2099-03-01')).toEqual({ visibles: [true, true], prochain: -1 });
  });

  it('date illisible : laissée visible (le script ne masque que ce qu’il comprend)', () => {
    expect(etatRendezvous([rdv('n’importe quoi'), rdv('2099-03-21')], '2099-03-10')).toEqual({ visibles: [true, true], prochain: 0 });
  });
});
