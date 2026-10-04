/**
 * Jeux de contenus de test pour les tests E2E.
 * CONTENT_FIXTURE=1 et CONTENT_FIXTURE_SET=<jeu> : les rendez-vous et actualités viennent de
 * tests/fixtures/content/<jeu>/ ; les textes des pages restent les vrais (src/content/pages).
 * Lu par src/content.config.ts (dossiers des collections) et astro.config.mjs (dossiers de sortie).
 */
type Env = Record<string, string | undefined>;

export type Collection = 'rendezvous' | 'actualites' | 'pages';

/** Nom du jeu actif, ou undefined hors mode test. Erreur explicite si le jeu est absent ou mal formé. */
export function jeuDeTest(env: Env = process.env): string | undefined {
  if (env['CONTENT_FIXTURE'] !== '1') return undefined;
  const jeu = env['CONTENT_FIXTURE_SET'] ?? '';
  if (!/^[a-z0-9-]+$/.test(jeu)) {
    throw new Error(`CONTENT_FIXTURE=1 exige CONTENT_FIXTURE_SET=<jeu> (dossier tests/fixtures/content/<jeu>), reçu « ${jeu} »`);
  }
  return jeu;
}

/** Dossier lu par le chargeur glob de la collection. */
export function contentBase(collection: Collection, env: Env = process.env): string {
  const jeu = jeuDeTest(env);
  return jeu && collection !== 'pages' ? `./tests/fixtures/content/${jeu}/${collection}` : `./src/content/${collection}`;
}
