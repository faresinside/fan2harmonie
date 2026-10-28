/** Nombre de caractères au plus pour un mot du menu (au-delà, le menu ne tient plus sur une ligne). */
export const LONGUEUR_MENU = 30;

/**
 * Mot du menu d'une page de texte : le mot choisi dans les réglages du menu s'il existe, sinon le TITRE DE LA PAGE
 * (« Textes des pages »), de sorte qu'il n'y a qu'un endroit à modifier. Un titre trop long pour le menu est coupé.
 */
export function motDuMenu(reglage: string | undefined, titre: string): string {
  if (reglage !== undefined) return reglage;
  return titre.length > LONGUEUR_MENU ? `${titre.slice(0, LONGUEUR_MENU - 1).trimEnd()}…` : titre;
}
