import { describe, expect, it } from 'vitest';
import { actualiteSchema, rendezvousSchema } from '../../src/lib/schemas';

describe('rendezvousSchema', () => {
  it('accepte une date et une heure valides, avec valeurs par défaut', () => {
    const r = rendezvousSchema.parse({ date: '2026-10-10', heure: '16:00' });
    expect(r.lieu).toBe('Parc de Rambouillet, près de la bergerie');
    expect(r.annule).toBe(false);
    expect(r.remarque).toBeUndefined();
  });

  it("rejette une heure au mauvais format", () => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure: '4pm' }).success).toBe(false);
  });

  it('rejette une date invalide', () => {
    expect(rendezvousSchema.safeParse({ date: '2026-13-40', heure: '16:00' }).success).toBe(false);
  });

  it.each(['2026-02-30', '2026-04-31', '2026-10-10T00:00', '10/10/2026'])(
    'rejette la date %s (pas de débordement)',
    (date) => {
      expect(rendezvousSchema.safeParse({ date, heure: '16:00' }).success).toBe(false);
    },
  );

  it('accepte une date en chaîne ou en objet Date (YAML non quoté) et produit un Date UTC', () => {
    const a = rendezvousSchema.parse({ date: '2026-10-10', heure: '16:00' });
    const b = rendezvousSchema.parse({ date: new Date('2026-10-10'), heure: '16:00' });
    expect(a.date.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(b.date.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(rendezvousSchema.safeParse({ date: new Date('invalid'), heure: '16:00' }).success).toBe(false);
  });

  it.each(['23:59', '00:00'])('accepte l\'heure %s', (heure) => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure }).success).toBe(true);
  });

  it.each(['25:00', '12:60', '99:99', '24:00'])("rejette l'heure %s", (heure) => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure }).success).toBe(false);
  });
});

describe('actualiteSchema', () => {
  it('accepte un titre de 90 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(90), date: '2026-10-04' }).success).toBe(true);
  });

  it('rejette un titre de 91 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(91), date: '2026-10-04' }).success).toBe(false);
  });
});
