/** Sérialise des données structurées pour <script type="application/ld+json"> sans risque de fermer la balise. */
export function serialiserJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}
