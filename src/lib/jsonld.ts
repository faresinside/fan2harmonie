/** Sérialise des données structurées pour <script type="application/ld+json"> sans risque de fermer la balise. */
export function serialiserJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

export interface InfosSite {
  nom: string;
  description: string;
  /** Adresse absolue de l'accueil. */
  url: string;
  /** Adresse absolue de l'image de partage. */
  image: string;
  /** Prénom et nom de l'éditrice, organisatrice des séances (déjà publics : mentions légales). */
  organisateur: string;
  /** Lieu habituel de la pratique (réglages) : nom et coordonnées. */
  lieu: { nom: string; lat: number; lon: number };
}

/** Une séance à venir, telle qu'elle est affichée dans la liste des rendez-vous. */
export interface Seance {
  /** AAAA-MM-JJ. */
  date: string;
  /** HH:MM, heure de Paris. */
  heure: string;
  lieu: string;
  remarque?: string | undefined;
  annule: boolean;
}

/** Décalage de Paris par rapport à UTC à une date et une heure locales : « +02:00 » l'été, « +01:00 » l'hiver. */
export function decalageParis(date: string, heure: string): string {
  const approx = new Date(`${date}T${heure}:00Z`);
  const nom = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
    .formatToParts(approx)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-]\d{2}):(\d{2})/.exec(nom ?? '');
  return m ? `${m[1]}:${m[2]}` : '+01:00';
}

/**
 * Données structurées de l'accueil : le site (WebSite) et chaque séance à venir (Event), que Google peut présenter
 * comme évènement. Seulement des faits établis : séances gratuites, lieu et heure de la fiche, annulation. Aucune
 * entreprise, aucun commerce : l'activité est exercée à titre gratuit par une personne. Ni rue, ni code postal, ni prix
 * autre que la gratuité : l'activité a lieu en plein air, sans adresse postale publique. Le lieu habituel porte la ville
 * et les coordonnées GPS ; un autre lieu n'est décrit que par le texte de la fiche (on ne devine pas sa ville).
 */
export function donneesSite(infos: InfosSite, seances: readonly Seance[]) {
  const evenements = seances.map((s) => {
    const habituel = s.lieu === infos.lieu.nom;
    return {
      '@type': 'Event',
      name: 'Séance de Qi Gong en plein air',
      description: s.remarque ? `${infos.description} ${s.remarque}` : infos.description,
      startDate: `${s.date}T${s.heure}:00${decalageParis(s.date, s.heure)}`,
      eventStatus: s.annule ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true,
      location: habituel
        ? {
            '@type': 'Place',
            name: s.lieu,
            address: { '@type': 'PostalAddress', addressLocality: 'Rambouillet', addressCountry: 'FR' },
            geo: { '@type': 'GeoCoordinates', latitude: infos.lieu.lat, longitude: infos.lieu.lon },
          }
        : { '@type': 'Place', name: s.lieu, address: s.lieu },
      image: [infos.image],
      organizer: { '@type': 'Person', name: infos.organisateur, url: infos.url },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: infos.url },
      url: `${infos.url}#rdv`,
    };
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${infos.url}#site`,
        name: infos.nom,
        url: infos.url,
        description: infos.description,
        inLanguage: 'fr-FR',
      },
      ...evenements,
    ],
  };
}
