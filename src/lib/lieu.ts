/**
 * Lieu affiché pour une séance : celui de la fiche, ou le lieu habituel (réglages « Lieu de la pratique »)
 * quand la fiche n'en précise pas (champ absent, vide ou fait d'espaces).
 */
export function resoudreLieu(lieuSeance: string | undefined, lieuHabituel: string): string {
  const propre = lieuSeance?.trim();
  return propre ? propre : lieuHabituel;
}
