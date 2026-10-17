import { CODE_GOOGLE_REGEX } from './schemas';

/**
 * Code de vérification Google à écrire dans <meta name="google-site-verification">, ou `undefined` : rien à écrire.
 * Seule une valeur de la forme attendue passe (jamais une balise entière, des guillemets ou des chevrons),
 * même si le fichier a été modifié sans passer par l'administration.
 */
export function codeVerificationGoogle(valeur: string | undefined): string | undefined {
  return valeur !== undefined && CODE_GOOGLE_REGEX.test(valeur) ? valeur : undefined;
}
