import type { Rendezvous } from './schemas';

/** Jour calendaire AAAA-MM-JJ de `now` à Paris (comparable lexicographiquement). */
function parisDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Jour calendaire d'une date de contenu (minuit UTC du jour). */
function contentDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Rendez-vous dont le jour est aujourd'hui (heure de Paris) ou plus tard,
 * triés par date puis heure. Les annulés sont conservés.
 */
export function upcoming(items: Rendezvous[], now: Date): Rendezvous[] {
  const today = parisDay(now);
  return items
    .filter((r) => contentDay(r.date) >= today)
    .sort((a, b) => {
      const byDay = contentDay(a.date).localeCompare(contentDay(b.date));
      return byDay !== 0 ? byDay : a.heure.localeCompare(b.heure);
    });
}

export function formatDateFr(date: Date): { jourSemaine: string; jour: string; mois: string } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    jourSemaine: get('weekday').toLowerCase(),
    jour: get('day'),
    mois: get('month').toLowerCase(),
  };
}

/** Heure à la française : « 16:00 » → « 16h00 », « 09:30 » → « 9h30 ». */
export function heureFr(heure: string): string {
  const [h = '', m = ''] = heure.split(':');
  return `${Number(h)}h${m}`;
}

export function isCancelled(r: Rendezvous): boolean {
  return r.annule;
}
