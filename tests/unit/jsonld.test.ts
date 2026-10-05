import { describe, expect, it } from 'vitest';
import { donneesLocalBusiness, serialiserJsonLd } from '../../src/lib/jsonld';

describe('donneesLocalBusiness', () => {
  const donnees = donneesLocalBusiness({
    nom: 'Fan 2 Harmonie',
    description: 'Qi Gong en plein air',
    url: 'https://www.exemple.fr/',
    image: 'https://www.exemple.fr/_astro/hero.jpg',
    gps: { lat: 48.64703, lon: 1.811268 },
  });

  it('uniquement des faits connus : nom, description, adresse du site, image, ville, GPS, gratuité', () => {
    expect(donnees).toEqual({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Fan 2 Harmonie',
      description: 'Qi Gong en plein air',
      url: 'https://www.exemple.fr/',
      image: 'https://www.exemple.fr/_astro/hero.jpg',
      isAccessibleForFree: true,
      address: { '@type': 'PostalAddress', addressLocality: 'Rambouillet', addressCountry: 'FR' },
      geo: { '@type': 'GeoCoordinates', latitude: 48.64703, longitude: 1.811268 },
    });
  });

  it('ni code postal, ni rue, ni fourchette de prix, ni zone desservie', () => {
    const texte = JSON.stringify(donnees);
    for (const cle of ['postalCode', 'streetAddress', 'priceRange', 'areaServed']) expect(texte).not.toContain(cle);
  });
});

describe('serialiserJsonLd', () => {
  it('échappe « < » : une chaîne ne peut pas fermer la balise script', () => {
    const sortie = serialiserJsonLd({ description: '</script><script>alert(1)</script>' });
    expect(sortie).not.toContain('<');
    expect(sortie).toContain('\\u003c/script>');
  });

  it('reste du JSON valide qui redonne les données d’origine', () => {
    const donnees = { name: 'Fan 2 Harmonie', note: 'a < b & c', geo: { latitude: 48.64703 } };
    expect(JSON.parse(serialiserJsonLd(donnees))).toEqual(donnees);
  });
});
