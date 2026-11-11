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

/** Les sept liens du menu, dans l'ordre par défaut (celui demandé par Stéphanie en novembre 2026). */
export const LIENS_MENU = ['rdv', 'offres', 'pratique', 'qigong', 'actualites', 'qui', 'contact'] as const;
export type LienMenu = (typeof LIENS_MENU)[number];

/**
 * Ordre des liens du menu choisi dans les réglages (« Ordre des liens du menu »). Jamais de lien perdu ni répété :
 * un doublon est ignoré, un lien absent (ou un ordre non réglé) reprend sa place par défaut, à la suite.
 */
export function ordreDuMenu(ordre: readonly string[] | undefined): LienMenu[] {
  const choisis = (ordre ?? []).filter((id, i, tous): id is LienMenu =>
    (LIENS_MENU as readonly string[]).includes(id) && tous.indexOf(id) === i,
  );
  return [...choisis, ...LIENS_MENU.filter((id) => !choisis.includes(id))];
}
