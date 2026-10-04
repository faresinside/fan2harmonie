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
});

describe('actualiteSchema', () => {
  it('accepte un titre de 90 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(90), date: '2026-10-04' }).success).toBe(true);
  });

  it('rejette un titre de 91 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(91), date: '2026-10-04' }).success).toBe(false);
  });
});
