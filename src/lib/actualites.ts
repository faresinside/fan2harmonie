/** Actualités : sélection des plus récentes et date longue en français. */

/** Date longue d'un contenu (minuit UTC) : « 4 octobre 2026 », « 1er mars 2026 ». */
export function formatDateLongueFr(date: Date): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const jour = get('day') === '1' ? '1er' : get('day');
  return `${jour} ${get('month').toLowerCase()} ${get('year')}`;
}

/** Les `n` actualités les plus récentes, plus récente d'abord (même date : par identifiant). Ne modifie pas `items`. */
export function dernieresActualites<T extends { id: string; data: { date: Date } }>(items: T[], n = 3): T[] {
  return [...items]
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id))
    .slice(0, n);
}
