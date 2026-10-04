/**
 * Formulaire de contact : fonctions pures, sans dépendance au DOM (testées dans tests/unit/contact.test.ts).
 * Le service de réception (Formspree) répond en JSON quand on le lui demande (en-tête Accept) :
 * 2xx sans échec signalé dans le corps JSON = message reçu ; tout le reste (4xx, 5xx, 2xx avec `ok: false` ou
 * `errors`, JSON illisible, réseau coupé, délai dépassé) = échec.
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
    if (!reponse.ok) return 'erreur';
    // Corps non JSON (page HTML, corps vide sans en-tête JSON) : le statut 2xx fait foi.
    if (!(reponse.headers.get('content-type') ?? '').includes('json')) return 'succes';
    // Corps annoncé JSON : il doit se lire et ne signaler aucun échec (JSON illisible = échec).
    return echecSignale(await reponse.json()) ? 'erreur' : 'succes';
  } catch {
    return 'erreur';
  }
}

/** Vrai si la réponse JSON du service signale un échec : `ok: false` ou une liste/un objet `errors` non vide. */
function echecSignale(corps: unknown): boolean {
  if (typeof corps !== 'object' || corps === null) return false;
  const { ok, errors } = corps as { ok?: unknown; errors?: unknown };
  if (ok === false) return true;
  if (Array.isArray(errors)) return errors.length > 0;
  return typeof errors === 'object' && errors !== null && Object.keys(errors).length > 0;
}
