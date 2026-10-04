/**
 * Formulaire de contact : fonctions pures, sans dépendance au DOM (testées dans tests/unit/contact.test.ts).
 * Le service de réception (Formspree) répond en JSON quand on le lui demande (en-tête Accept) :
 * 2xx = message reçu ; tout le reste (4xx, 5xx, réseau coupé, délai dépassé) = échec.
 */

/** Sujet de l'e-mail reçu par Stéphanie (champ caché « _subject ») et des liens mailto de secours. */
export const SUJET_MESSAGE = 'Message depuis le site Fan 2 Harmonie';

/** Délai au-delà duquel un envoi sans réponse est considéré comme échoué (le message reste saisi). */
export const DELAI_ENVOI_MS = 20_000;

export type IssueEnvoi = 'succes' | 'erreur';

type Envoi = (url: string, options: RequestInit) => Promise<Response>;

/** Lien « écrire un e-mail » vers `email`, avec le même sujet que les messages du formulaire. */
export function lienMailto(email: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(SUJET_MESSAGE)}`;
}

/** Envoie les données du formulaire ; ne lève jamais d'exception. */
export async function envoyerFormulaire(
  action: string,
  donnees: FormData,
  envoi: Envoi = (url, options) => fetch(url, options),
  delaiMs: number = DELAI_ENVOI_MS,
): Promise<IssueEnvoi> {
  try {
    const reponse = await envoi(action, {
      method: 'POST',
      body: donnees,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(delaiMs),
    });
    return reponse.ok ? 'succes' : 'erreur';
  } catch {
    return 'erreur';
  }
}
