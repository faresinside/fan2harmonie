/**
 * Jeux de contenus de test (tests/fixtures/content/<jeu>/{rendezvous,actualites}) et port de prévisualisation
 * de chacun. Construits avec CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu> dans dist-fixture-<jeu>.
 * Les dates « à venir » sont en 2099 et les dates passées en 2020-2021 : les tests ne vieillissent pas.
 */
export const JEUX = {
  vide: 4322,
  annule: 4323,
  melange: 4324,
  xss: 4325,
  'sans-image': 4326,
  'titre-long': 4327,
  'annule-premier': 4328,
  'tout-annule': 4329,
} as const;

export type Jeu = keyof typeof JEUX;

export const urlJeu = (jeu: Jeu) => `http://localhost:${JEUX[jeu]}`;
