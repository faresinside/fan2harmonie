import { describe, expect, it } from 'vitest';
import { rendezvousSchema } from '../../src/lib/schemas';
import { formatDateFr, heureFr, isCancelled, upcoming } from '../../src/lib/rendezvous';

const rdv = (date: string, heure = '16:00', extra: Record<string, unknown> = {}) =>
  rendezvousSchema.parse({ date, heure, ...extra });

describe('upcoming', () => {
  it('garde un rendez-vous du jour jusqu\'à 23h59 (Paris) et le retire le lendemain', () => {
    const items = [rdv('2026-10-10')];
    expect(upcoming(items, new Date('2026-10-10T20:30:00+02:00'))).toHaveLength(1);
    expect(upcoming(items, new Date('2026-10-10T23:59:00+02:00'))).toHaveLength(1);
    expect(upcoming(items, new Date('2026-10-11T00:01:00+02:00'))).toHaveLength(0);
  });

  it('garde un rendez-vous du jour au passage à l\'heure d\'hiver (2026-10-25)', () => {
    const items = [rdv('2026-10-25')];
    expect(upcoming(items, new Date('2026-10-25T23:30:00+01:00'))).toHaveLength(1);
    expect(upcoming(items, new Date('2026-10-26T00:01:00+01:00'))).toHaveLength(0);
  });

  it('renvoie une liste vide pour une liste vide', () => {
    expect(upcoming([], new Date('2026-10-10T12:00:00+02:00'))).toEqual([]);
  });

  it('conserve les rendez-vous annulés et les signale', () => {
    const annule = rdv('2026-10-17', '16:00', { annule: true });
    const result = upcoming([annule], new Date('2026-10-10T12:00:00+02:00'));
    expect(result).toHaveLength(1);
    expect(isCancelled(result[0]!)).toBe(true);
    expect(isCancelled(rdv('2026-10-17'))).toBe(false);
  });

  it('trie par date puis par heure', () => {
    const items = [rdv('2026-10-24', '16:00'), rdv('2026-10-17', '17:00'), rdv('2026-10-17', '10:00')];
    const result = upcoming(items, new Date('2026-10-10T12:00:00+02:00'));
    expect(result.map((r) => `${r.date.toISOString().slice(0, 10)} ${r.heure}`)).toEqual([
      '2026-10-17 10:00',
      '2026-10-17 17:00',
      '2026-10-24 16:00',
    ]);
  });

  it('ne modifie pas la liste d\'origine', () => {
    const items = [rdv('2026-10-24'), rdv('2026-10-17')];
    upcoming(items, new Date('2026-10-10T12:00:00+02:00'));
    expect(items[0]?.heure).toBe('16:00');
    expect(items[0]?.date.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });
});

describe('formatDateFr', () => {
  it('renvoie jour de semaine, jour et mois en français minuscule', () => {
    expect(formatDateFr(new Date('2026-10-10T00:00:00.000Z'))).toEqual({
      jourSemaine: 'samedi',
      jour: '10',
      mois: 'octobre',
    });
  });
});

describe('heureFr', () => {
  it.each([
    ['16:00', '16h00'],
    ['09:30', '9h30'],
    ['00:05', '0h05'],
  ])('%s → %s', (heure, attendu) => {
    expect(heureFr(heure)).toBe(attendu);
  });
});
