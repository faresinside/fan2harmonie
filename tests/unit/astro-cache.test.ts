import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Cache de contenu d'Astro (`cacheDir`) : le serveur de développement (`docker compose up`) utilise le cache par
 * défaut (`node_modules/.astro`). Tout autre mode qui construit le site avec une configuration différente (audit
 * Lighthouse, jeux de contenus de test) doit avoir SON PROPRE cache : sinon il y écrit sa configuration (adresse du
 * site, contenus) et le serveur de développement relit un cache d'un autre contexte — « La collection "pages"
 * n'existe pas » et une page d'accueil en erreur 500.
 */

type Config = { outDir?: string; cacheDir?: string };

async function charger(env: Record<string, string | undefined>): Promise<Config> {
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  vi.resetModules();
  return (await import('../../astro.config.mjs')).default as Config;
}

afterEach(() => {
  for (const cle of ['AUDIT_SITE_URL', 'CONTENT_FIXTURE', 'CONTENT_FIXTURE_SET']) delete process.env[cle];
});

const NORMAL = { AUDIT_SITE_URL: undefined, CONTENT_FIXTURE: undefined, CONTENT_FIXTURE_SET: undefined };

describe('astro.config.mjs : un cache séparé par mode de construction', () => {
  it('cas normal (développement, production) : cache par défaut, aucune sortie ni cache imposés', async () => {
    const config = await charger(NORMAL);
    expect(config.cacheDir).toBeUndefined();
    expect(config.outDir).toBeUndefined();
  });

  it('audit Lighthouse : sortie ET cache à part (jamais le cache du serveur de développement)', async () => {
    const config = await charger({ ...NORMAL, AUDIT_SITE_URL: 'http://localhost:4400' });
    expect(config.outDir).toBe('./dist-audit');
    expect(config.cacheDir).toBe('./node_modules/.astro-audit');
  });

  it('jeu de contenus de test : sortie et cache à part, par jeu', async () => {
    const config = await charger({ ...NORMAL, CONTENT_FIXTURE: '1', CONTENT_FIXTURE_SET: 'vide' });
    expect(config.outDir).toBe('./dist-fixture-vide');
    expect(config.cacheDir).toBe('./node_modules/.astro-fixture-vide');
  });
});
