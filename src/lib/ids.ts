let compteur = 0;

/** Identifiant unique pour la durée du build (ex. relier un <title> SVG via aria-labelledby). */
export function idUnique(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${compteur}`;
}
