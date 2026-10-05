/**
 * Formulaire de contact : fonctions pures, sans dépendance au DOM (testées dans tests/unit/contact.test.ts).
 * Le script de contact du site (public/api/contact.php) répond en JSON quand on le lui demande (en-tête Accept) :
 * 2xx sans échec signalé dans le corps JSON = message reçu ; tout le reste (4xx, 5xx, 2xx avec `ok: false` ou
 * `errors`, JSON illisible, réseau coupé, délai dépassé) = échec.
 */

/**
 * Sujet des liens mailto de secours. (Le sujet des e-mails du formulaire est composé par le script de contact,
 * public/api/lib/contact.php : « [Site Fan 2 Harmonie] Message de <nom> ».)
 */
export const SUJET_MESSAGE = 'Message depuis le site Fan 2 Harmonie';

/** Délai au-delà duquel un envoi sans réponse est considéré comme échoué (le message reste saisi). */
export const DELAI_ENVOI_MS = 20_000;

export type IssueEnvoi = 'succes' | 'erreur';

type Envoi = (url: string, options: RequestInit) => Promise<Response>;

/** Lien « écrire un e-mail » vers `email`, avec le même sujet que les messages du formulaire. */
export function lienMailto(email: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(SUJET_MESSAGE)}`;
}

/** Issue d'un envoi et champs que le script a refusés (réponse 422 : `errors[].field`), dans l'ordre reçu. */
export interface ResultatEnvoi {
  issue: IssueEnvoi;
  champs: string[];
}

/** Noms des champs du formulaire que le script peut signaler (attribut name). */
const CHAMPS_FORMULAIRE = ['nom', 'email', 'message', 'consentement'] as const;

/** Envoie les données du formulaire ; ne lève jamais d'exception. */
export async function envoyerFormulaire(
  action: string,
  donnees: FormData,
  envoi: Envoi = (url, options) => fetch(url, options),
  delaiMs: number = DELAI_ENVOI_MS,
): Promise<IssueEnvoi> {
  return (await envoyerFormulaireDetaille(action, donnees, envoi, delaiMs)).issue;
}

/** Comme envoyerFormulaire, avec en plus les champs refusés par le script (vide hors réponse JSON d'erreur). */
export async function envoyerFormulaireDetaille(
  action: string,
  donnees: FormData,
  envoi: Envoi = (url, options) => fetch(url, options),
  delaiMs: number = DELAI_ENVOI_MS,
): Promise<ResultatEnvoi> {
  const erreur = (champs: string[] = []): ResultatEnvoi => ({ issue: 'erreur', champs });
  try {
    const reponse = await envoi(action, {
      method: 'POST',
      body: donnees,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(delaiMs),
    });
    const json = (reponse.headers.get('content-type') ?? '').includes('json');
    if (!reponse.ok) return erreur(json ? champsEnErreur(await reponse.json().catch(() => null)) : []);
    // Corps non JSON (page HTML, corps vide sans en-tête JSON) : le statut 2xx fait foi.
    if (!json) return { issue: 'succes', champs: [] };
    // Corps annoncé JSON : il doit se lire et ne signaler aucun échec (JSON illisible = échec).
    const corps: unknown = await reponse.json();
    return echecSignale(corps) ? erreur(champsEnErreur(corps)) : { issue: 'succes', champs: [] };
  } catch {
    return erreur();
  }
}

/** Champs du formulaire nommés dans `errors[].field` d'une réponse du script (inconnus ignorés, sans doublon). */
export function champsEnErreur(corps: unknown): string[] {
  if (typeof corps !== 'object' || corps === null) return [];
  const { errors } = corps as { errors?: unknown };
  if (!Array.isArray(errors)) return [];
  const champs: string[] = [];
  for (const e of errors) {
    const champ = typeof e === 'object' && e !== null ? (e as { field?: unknown }).field : undefined;
    if ((CHAMPS_FORMULAIRE as readonly unknown[]).includes(champ) && !champs.includes(champ as string)) champs.push(champ as string);
  }
  return champs;
}

/** Vrai si la réponse JSON du service signale un échec : `ok: false` ou une liste/un objet `errors` non vide. */
function echecSignale(corps: unknown): boolean {
  if (typeof corps !== 'object' || corps === null) return false;
  const { ok, errors } = corps as { ok?: unknown; errors?: unknown };
  if (ok === false) return true;
  if (Array.isArray(errors)) return errors.length > 0;
  return typeof errors === 'object' && errors !== null && Object.keys(errors).length > 0;
}
