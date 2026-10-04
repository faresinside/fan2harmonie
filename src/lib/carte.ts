/** Coordonnées GPS en degrés décimaux (nord et est positifs). */
export interface Gps {
  lat: number;
  lon: number;
}

/** Lien OpenStreetMap : marqueur sur le lieu, zoom 17 (allées du parc lisibles). */
export function lienCarte({ lat, lon }: Gps): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

const decimalFr = (n: number) => String(Math.abs(n)).replace('.', ',');

/** Notation française lisible : « 48,64703° N, 1,811268° E » (espaces insécables avant N/S/E/O). */
export function coordonneesFr({ lat, lon }: Gps): string {
  return `${decimalFr(lat)}° ${lat < 0 ? 'S' : 'N'}, ${decimalFr(lon)}° ${lon < 0 ? 'O' : 'E'}`;
}
