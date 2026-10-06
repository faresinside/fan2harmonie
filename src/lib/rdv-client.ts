/**
 * Logique pure du script des rendez-vous (src/scripts/rendezvous.ts) : quel jour est-il à Paris, quels
 * feuillets sont passés, lequel mettre en avant. Le site est statique : les rendez-vous passés sont retirés par
 * la reconstruction de la nuit ; ce script les masque en plus dans le navigateur, le jour même, au cas où la
 * reconstruction serait en retard ou suspendue (GitHub suspend les tâches planifiées d'un dépôt public inactif).
 */

export interface FeuilletClient {
  /** Date « AAAA-MM-JJ » du rendez-vous (attribut data-date). */
  date: string;
  annule: boolean;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Date du jour « AAAA-MM-JJ » à Paris (heure d'été et d'hiver comprises). */
export function aujourdhuiParis(maintenant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}

/**
 * Feuillets visibles (date ≥ aujourd'hui : le rendez-vous du jour reste jusqu'à minuit ; une date illisible
 * reste visible) et rang du prochain : le premier visible non annulé, ou -1.
 */
export function etatRendezvous(feuillets: readonly FeuilletClient[], aujourdhui: string): { visibles: boolean[]; prochain: number } {
  const visibles = feuillets.map((f) => !JOUR.test(f.date) || f.date >= aujourdhui);
  const prochain = feuillets.findIndex((f, i) => visibles[i] && !f.annule);
  return { visibles, prochain };
}
