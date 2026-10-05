/** Sérialise des données structurées pour <script type="application/ld+json"> sans risque de fermer la balise. */
export function serialiserJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

export interface InfosActivite {
  nom: string;
  description: string;
  /** Adresse absolue de l'accueil. */
  url: string;
  /** Adresse absolue de l'image de partage. */
  image: string;
  gps: { lat: number; lon: number };
}

/**
 * Données structurées LocalBusiness : seulement des faits établis (séances gratuites, au parc de Rambouillet,
 * coordonnées GPS du lieu). Ni rue ni code postal : l'activité a lieu en plein air, sans adresse postale publique.
 */
export function donneesLocalBusiness(infos: InfosActivite) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: infos.nom,
    description: infos.description,
    url: infos.url,
    image: infos.image,
    isAccessibleForFree: true,
    address: { '@type': 'PostalAddress', addressLocality: 'Rambouillet', addressCountry: 'FR' },
    geo: { '@type': 'GeoCoordinates', latitude: infos.gps.lat, longitude: infos.gps.lon },
  };
}
