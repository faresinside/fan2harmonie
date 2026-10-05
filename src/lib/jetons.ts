/**
 * Lecture des jetons de couleur de src/styles/tokens.css (forme « --nom: #hex; »).
 * Source unique : la page (theme-color) et les tests de contraste lisent les mêmes valeurs que le CSS.
 */
export function lireJetons(css: string): Record<string, string> {
  const jetons: Record<string, string> = {};
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\b/gi)) {
    const [, nom, valeur] = m;
    if (nom && valeur) jetons[nom] = valeur;
  }
  return jetons;
}

/** Valeur d'un jeton ; erreur explicite s'il est absent (renommage dans tokens.css). */
export function jeton(css: string, nom: string): string {
  const valeur = lireJetons(css)[nom];
  if (!valeur) throw new Error(`jeton --${nom} absent de tokens.css`);
  return valeur;
}
