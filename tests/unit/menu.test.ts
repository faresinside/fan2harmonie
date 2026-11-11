import { describe, expect, it } from 'vitest';
import { LIENS_MENU, LONGUEUR_MENU, motDuMenu, ordreDuMenu } from '../../src/lib/menu';

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

describe('ordreDuMenu', () => {
  it('ordre non réglé : ordre par défaut', () => {
    expect(ordreDuMenu(undefined)).toEqual([...LIENS_MENU]);
    expect(ordreDuMenu([])).toEqual([...LIENS_MENU]);
  });

  it('ordre réglé dans l’administration : suivi tel quel', () => {
    const ordre = ['contact', 'qui', 'actualites', 'qigong', 'pratique', 'offres', 'rdv'];
    expect(ordreDuMenu(ordre)).toEqual(ordre);
  });

  it('jamais de lien perdu ni répété : doublon ignoré, lien absent remis à la suite, inconnu écarté', () => {
    expect(ordreDuMenu(['contact', 'contact', 'inconnu', 'rdv'])).toEqual([
      'contact', 'rdv', 'offres', 'pratique', 'qigong', 'actualites', 'qui',
    ]);
  });
});
