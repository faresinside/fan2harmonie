/**
 * Lieu affiché pour une séance : celui de la fiche, ou le lieu habituel (réglages « Lieu de la pratique »)
 * quand la fiche n'en précise pas (champ absent, vide ou fait d'espaces).
 */
export function resoudreLieu(lieuSeance: string | undefined, lieuHabituel: string): string {
  const propre = lieuSeance?.trim();
  return propre ? propre : lieuHabituel;
}

/**
 * Lieu d'une séance avec l'autre lieu (par mauvais temps) : case « repli » cochée et autre lieu rempli → l'autre lieu ;
 * sinon comme `resoudreLieu` ; `habituel` : la séance a lieu au lieu habituel. Une case cochée sans autre lieu rempli est sans effet (la séance garde son lieu).
 */
export function lieuDeSeance(
  seance: { lieu?: string | undefined; repli?: boolean | undefined },
  lieuHabituel: string,
  autreLieu: string | undefined,
): { lieu: string; repli: boolean; habituel: boolean } {
  const autre = autreLieu?.trim();
  if (seance.repli && autre) return { lieu: autre, repli: true, habituel: false };
  const propre = seance.lieu?.trim();
  return { lieu: propre || lieuHabituel, repli: false, habituel: !propre };
}
