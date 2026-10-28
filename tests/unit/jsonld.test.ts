import { describe, expect, it } from 'vitest';
import { decalageParis, donneesOffres, donneesSite, serialiserJsonLd, type Seance } from '../../src/lib/jsonld';

const infos = {
  nom: 'Fan 2 Harmonie',
  description: 'Qi Gong en plein air',
  url: 'https://www.exemple.fr/',
  image: 'https://www.exemple.fr/_astro/hero.jpg',
  organisateur: 'Stéphanie Gabalda',
  lieu: { nom: 'Parc test', lat: 48.1, lon: 1.2 },
};
const seance = (surcharge: Partial<Seance> = {}): Seance => ({
  date: '2026-10-17',
  heure: '10:00',
  lieu: 'Parc test',
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
      description: 'Séance de Qi Gong gratuite en plein air, ouverte à tous, à tout âge et à tous niveaux. Apportez un tapis.',
      startDate: '2026-10-17T10:00:00+02:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true,
      location: {
        '@type': 'Place',
        name: 'Parc test',
        address: { '@type': 'PostalAddress', addressLocality: 'Rambouillet', addressRegion: 'Île-de-France', addressCountry: 'FR' },
        geo: { '@type': 'GeoCoordinates', latitude: 48.1, longitude: 1.2 },
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
    expect(JSON.stringify(evenement?.['location'])).not.toContain('geo');
  });

  it('le lieu habituel est celui des réglages : un autre nom de lieu ne reçoit ni ville ni GPS', () => {
    const renomme = { ...infos, lieu: { nom: 'Étang du parc', lat: 48.7, lon: 1.9 } };
    const [, ancien, nouveau] = donneesSite(renomme, [seance({ lieu: 'Parc test' }), seance({ lieu: 'Étang du parc' })])['@graph'] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(ancien?.['location']).toEqual({ '@type': 'Place', name: 'Parc test', address: 'Parc test' });
    expect(nouveau?.['location']).toMatchObject({
      name: 'Étang du parc',
      address: { addressLocality: 'Rambouillet' },
      geo: { latitude: 48.7, longitude: 1.9 },
    });
  });

  it('description d’un évènement : texte fixe (sans remarque), indépendant de la description du référencement', () => {
    const autre = { ...infos, description: 'Une autre description de référencement, modifiée par Stéphanie.' };
    const [, evenement] = donneesSite(autre, [seance()])['@graph'] as [unknown, Record<string, unknown>];
    expect(evenement?.['description']).toBe('Séance de Qi Gong gratuite en plein air, ouverte à tous, à tout âge et à tous niveaux.');
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

describe('donneesSite : pas de FAQ', () => {
  it('aucun nœud FAQPage : seulement WebSite puis les évènements', () => {
    expect(JSON.stringify(donneesSite(infos, []))).not.toContain('FAQPage');
    expect(donneesSite(infos, [seance()])['@graph'].map((n) => n['@type'])).toEqual(['WebSite', 'Event']);
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

describe('donneesOffres', () => {
  const noeuds = donneesOffres({ nom: 'Fan 2 Harmonie', url: 'https://www.exemple.fr/', urlPage: 'https://www.exemple.fr/offres-de-seances/', titrePage: 'Activités proposées', organisateur: 'Stéphanie Gabalda' });

  it('deux services (plein air, milieu professionnel) et un fil d’Ariane', () => {
    expect(noeuds.map((n) => n['@type'])).toEqual(['Service', 'Service', 'BreadcrumbList']);
    expect(noeuds.map((n) => (n as { name?: string }).name).slice(0, 2)).toEqual([
      'Qi Gong en pleine nature',
      'Séances matinales de réveil articulaire et musculaire en milieu professionnel',
    ]);
  });

  it('zone desservie : les Yvelines, dans la région Île-de-France ; jamais Paris', () => {
    for (const service of noeuds.slice(0, 2) as { areaServed: unknown }[]) {
      expect(service.areaServed).toEqual({ '@type': 'AdministrativeArea', name: 'Yvelines', containedInPlace: { '@type': 'AdministrativeArea', name: 'Île-de-France' } });
    }
    expect(JSON.stringify(noeuds)).not.toMatch(/Paris/);
  });

  it('gratuité affirmée seulement pour les séances en plein air ; aucun prix pour le milieu professionnel', () => {
    const [pleinAir, pro] = noeuds as { offers?: { price: string } }[];
    expect(pleinAir?.offers?.price).toBe('0');
    expect(pro).not.toHaveProperty('offers');
  });

  it('fil d’Ariane : accueil puis page', () => {
    const fil = noeuds[2] as { itemListElement: { position: number; item: string }[] };
    expect(fil.itemListElement.map((e) => [e.position, e.item])).toEqual([
      [1, 'https://www.exemple.fr/'],
      [2, 'https://www.exemple.fr/offres-de-seances/'],
    ]);
  });
});
