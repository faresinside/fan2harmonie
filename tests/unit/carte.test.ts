import { describe, expect, it } from 'vitest';
import { coordonneesFr, lienCarte } from '../../src/lib/carte';

const gps = { lat: 48.64703, lon: 1.811268 };

describe('lienCarte', () => {
  it('construit le lien Google Maps avec un marqueur aux coordonnées du lieu', () => {
    expect(lienCarte(gps)).toBe('https://www.google.com/maps/search/?api=1&query=48.64703,1.811268');
  });
});

describe('coordonneesFr', () => {
  it('affiche les coordonnées en notation française', () => {
    expect(coordonneesFr(gps)).toBe('48,64703°\u00a0N, 1,811268°\u00a0E');
  });

  it('gère l’hémisphère sud et l’ouest', () => {
    expect(coordonneesFr({ lat: -12.5, lon: -3.25 })).toBe('12,5°\u00a0S, 3,25°\u00a0O');
  });
});
