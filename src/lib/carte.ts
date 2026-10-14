/** Coordonnées GPS en degrés décimaux (nord et est positifs). */
export interface Gps {
  lat: number;
  lon: number;
}

/**
 * Lien Google Maps : marqueur sur le lieu. Simple lien, jamais une carte intégrée : rien n'est envoyé à Google tant que le
 * visiteur ne clique pas. Sur téléphone, il ouvre directement l'application de cartes.
 */
export function lienCarte({ lat, lon }: Gps): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

const decimalFr = (n: number) => String(Math.abs(n)).replace('.', ',');

/** Notation française lisible : « 48,64703° N, 1,811268° E » (espaces insécables avant N/S/E/O). */
export function coordonneesFr({ lat, lon }: Gps): string {
  return `${decimalFr(lat)}° ${lat < 0 ? 'S' : 'N'}, ${decimalFr(lon)}° ${lon < 0 ? 'O' : 'E'}`;
}
