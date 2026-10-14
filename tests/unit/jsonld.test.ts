import { describe, expect, it } from 'vitest';
import { decalageParis, donneesSite, serialiserJsonLd, type Seance } from '../../src/lib/jsonld';
import { LIEU_PAR_DEFAUT } from '../../src/lib/schemas';

const infos = {
  nom: 'Fan 2 Harmonie',
  description: 'Qi Gong en plein air',
  url: 'https://www.exemple.fr/',
  image: 'https://www.exemple.fr/_astro/hero.jpg',
  organisateur: 'Stéphanie Gabalda',
  gps: { lat: 48.64703, lon: 1.811268 },
};
const seance = (surcharge: Partial<Seance> = {}): Seance => ({
  date: '2026-10-17',
  heure: '10:00',
  lieu: LIEU_PAR_DEFAUT,
  annule: false,
  ...surcharge,
});

describe('decalageParis', () => {
  it('+02:00 l’été, +01:00 l’hiver, y compris autour du changement d’heure', () => {
    expect(decalageParis('2026-07-14', '16:00')).toBe('+02:00');
    expect(decalageParis('2026-12-24', '16:00')).toBe('+01:00');
    // Changement d'heure de 2026 : dimanche 29 mars (2 h → 3 h) et dimanche 25 octobre (3 h → 2 h).
    expect(decalageParis('2026-03-28', '16:00')).toBe('+01:00');
    expect(decalageParis('2026-03-29', '16:00')).toBe('+02:00');
    expect(decalageParis('2026-10-24', '16:00')).toBe('+02:00');
    expect(decalageParis('2026-10-25', '16:00')).toBe('+01:00');
  });
});

describe('donneesSite', () => {
  it('sans séance : le site seulement (WebSite), aucune entreprise ni commerce', () => {
    const donnees = donneesSite(infos, []);
    expect(donnees).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': 'https://www.exemple.fr/#site',
          name: 'Fan 2 Harmonie',
          url: 'https://www.exemple.fr/',
          description: 'Qi Gong en plein air',
          inLanguage: 'fr-FR',
        },
      ],
    });
    const texte = JSON.stringify(donnees);
    for (const interdit of ['LocalBusiness', 'Organization', 'priceRange', 'areaServed', 'postalCode', 'streetAddress']) {
      expect(texte).not.toContain(interdit);
    }
  });

  it('une séance au lieu habituel : évènement gratuit, heure de Paris, ville et GPS du parc', () => {
    const [, evenement] = donneesSite(infos, [seance({ remarque: 'Apportez un tapis.' })])['@graph'];
    expect(evenement).toEqual({
      '@type': 'Event',
      name: 'Séance de Qi Gong en plein air',
      description: 'Qi Gong en plein air Apportez un tapis.',
      startDate: '2026-10-17T10:00:00+02:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true,
      location: {
        '@type': 'Place',
        name: LIEU_PAR_DEFAUT,
        address: { '@type': 'PostalAddress', addressLocality: 'Rambouillet', addressCountry: 'FR' },
        geo: { '@type': 'GeoCoordinates', latitude: 48.64703, longitude: 1.811268 },
      },
      image: ['https://www.exemple.fr/_astro/hero.jpg'],
      organizer: { '@type': 'Person', name: 'Stéphanie Gabalda', url: 'https://www.exemple.fr/' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://www.exemple.fr/' },
      url: 'https://www.exemple.fr/#rdv',
    });
  });

  it('séance annulée : statut « annulé » ; autre lieu : texte de la fiche, ni ville devinée ni GPS du parc', () => {
    const [, evenement] = donneesSite(infos, [seance({ annule: true, lieu: 'Salle des fêtes' })])['@graph'] as [unknown, Record<string, unknown>];
    expect(evenement?.['eventStatus']).toBe('https://schema.org/EventCancelled');
    expect(evenement?.['location']).toEqual({ '@type': 'Place', name: 'Salle des fêtes', address: 'Salle des fêtes' });
  });

  it('plusieurs séances : un évènement chacune, dans l’ordre reçu', () => {
    const graphe = donneesSite(infos, [seance(), seance({ date: '2026-11-07', heure: '16:00' }), seance({ date: '2027-01-02' })])['@graph'];
    expect(graphe).toHaveLength(4);
    expect(graphe.slice(1).map((e) => (e as { startDate: string }).startDate)).toEqual([
      '2026-10-17T10:00:00+02:00',
      '2026-11-07T16:00:00+01:00',
      '2027-01-02T10:00:00+01:00',
    ]);
  });
});

describe('serialiserJsonLd', () => {
  it('échappe « < » : une chaîne ne peut pas fermer la balise script', () => {
    const sortie = serialiserJsonLd({ description: '</script><script>alert(1)</script>' });
    expect(sortie).not.toContain('<');
    expect(sortie).toContain('\\u003c/script>');
  });

  it('une remarque saisie dans /admin ne peut pas fermer la balise non plus', () => {
    const sortie = serialiserJsonLd(donneesSite(infos, [seance({ remarque: '</script><img src=x onerror=alert(1)>' })]));
    expect(sortie).not.toContain('<');
    expect(JSON.parse(sortie)['@graph'][1].description).toContain('</script>');
  });

  it('reste du JSON valide qui redonne les données d’origine', () => {
    const donnees = { name: 'Fan 2 Harmonie', note: 'a < b & c', geo: { latitude: 48.64703 } };
    expect(JSON.parse(serialiserJsonLd(donnees))).toEqual(donnees);
  });
});
