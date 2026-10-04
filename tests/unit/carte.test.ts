import { describe, expect, it } from 'vitest';
import { coordonneesFr, lienCarte } from '../../src/lib/carte';

const gps = { lat: 48.64703, lon: 1.811268 };

describe('lienCarte', () => {
  it('construit le lien OpenStreetMap avec marqueur et zoom 17', () => {
    expect(lienCarte(gps)).toBe(
      'https://www.openstreetmap.org/?mlat=48.64703&mlon=1.811268#map=17/48.64703/1.811268',
    );
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
