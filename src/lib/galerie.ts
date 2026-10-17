/** Galerie de photos d'une actualité : texte alternatif de chaque photo. */

/**
 * Texte alternatif d'une photo : sa légende (sans les espaces autour) si elle n'est pas vide, sinon
 * « {titre} (photo {rang} sur {total}) », rang à partir de 1. Jamais vide tant que le titre ne l'est pas.
 */
export function texteAlternatif(legende: string | undefined, titre: string, rang: number, total: number): string {
  return legende?.trim() || `${titre} (photo ${rang} sur ${total})`;
}
