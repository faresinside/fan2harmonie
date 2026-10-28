import { describe, expect, it } from 'vitest';
import { LONGUEUR_MENU, motDuMenu } from '../../src/lib/menu';

describe('motDuMenu', () => {
  it('sans mot choisi : le menu reprend le titre de la page (un seul endroit à modifier)', () => {
    expect(motDuMenu(undefined, 'Activités proposées')).toBe('Activités proposées');
    expect(motDuMenu(undefined, 'La pratique')).toBe('La pratique');
  });

  it('avec un mot choisi dans les réglages : c’est lui qui est affiché', () => {
    expect(motDuMenu('Les activités', 'Activités proposées - Séances d’1 heure')).toBe('Les activités');
  });

  it('titre de 30 caractères : gardé entier ; plus long : coupé avec « … », sans dépasser 30 caractères', () => {
    const trente = 'a'.repeat(LONGUEUR_MENU);
    expect(motDuMenu(undefined, trente)).toBe(trente);
    const coupe = motDuMenu(undefined, 'Activités proposées - Séances d’1 heure');
    expect(coupe.length).toBeLessThanOrEqual(LONGUEUR_MENU);
    expect(coupe.endsWith('…')).toBe(true);
    expect(coupe).toBe('Activités proposées - Séances…');
  });
});
