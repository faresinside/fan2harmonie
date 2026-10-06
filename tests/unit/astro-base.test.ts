import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Option ASTRO_BASE (astro.config.mjs) : seulement pour construire un APERÇU sous un sous-chemin (GitHub Pages,
 * https://<compte>.github.io/<dépôt>/) ; jamais en production, où le site est servi à la racine du domaine.
 */

const RACINE = path.resolve(__dirname, '../..');
type Config = { site?: string; base?: string };

async function charger(env: Record<string, string | undefined>): Promise<Config> {
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  vi.resetModules();
  return (await import('../../astro.config.mjs')).default as Config;
}

afterEach(() => {
  delete process.env['ASTRO_BASE'];
});

describe('astro.config.mjs : ASTRO_BASE', () => {
  it('sans ASTRO_BASE (cas normal, production) : aucune base, site = https://fan2harmonie.fr', async () => {
    const config = await charger({ ASTRO_BASE: undefined, AUDIT_SITE_URL: undefined });
    expect(config.base).toBeUndefined();
    expect(config.site).toBe('https://fan2harmonie.fr');
  });

  it('ASTRO_BASE vide : ignorée', async () => {
    const config = await charger({ ASTRO_BASE: '', AUDIT_SITE_URL: undefined });
    expect(config.base).toBeUndefined();
  });

  it('ASTRO_BASE=/fan2harmonie/ : base posée, adresse du site inchangée', async () => {
    const config = await charger({ ASTRO_BASE: '/fan2harmonie/', AUDIT_SITE_URL: undefined });
    expect(config.base).toBe('/fan2harmonie/');
    expect(config.site).toBe('https://fan2harmonie.fr');
  });

  it('jamais posée par le déploiement vers l’hébergeur', () => {
    const workflow = readFileSync(path.join(RACINE, '.github/workflows/deploiement.yml'), 'utf8');
    // Jamais posée (ni env, ni affectation) ; seulement contrôlée vide avant la construction.
    expect(workflow).not.toMatch(/ASTRO_BASE\s*(:\s|=)/);
    expect(workflow).toContain('test -z "${ASTRO_BASE:-}');
  });
});
