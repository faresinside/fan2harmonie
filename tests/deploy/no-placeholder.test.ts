/**
 * Garde-fou de MISE EN LIGNE : `npm run verifier:mise-en-ligne` (configuration vitest.deploy.config.ts).
 * Ce test n'est PAS lancé par `npm test` (vitest.config.ts n'inclut que tests/unit/) : en développement,
 * les valeurs de substitution sont normales. Il doit passer avant toute mise en ligne (docs/MISE-EN-LIGNE.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { listerPlaceholders, verifierBackendCms, verifierSite } from '../../src/lib/misenligne';

const RACINE = path.resolve(__dirname, '../..');
/** Fichiers binaires (images, polices) et bundle tiers copié depuis node_modules (non versionné) : non parcourus. */
const BINAIRES = /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf)$/i;
const IGNORES = new Set(['public/admin/sveltia-cms.js']);

function fichiersTexte(dossier: string): { chemin: string; contenu: string }[] {
  return readdirSync(path.join(RACINE, dossier), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(RACINE, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((chemin) => !BINAIRES.test(chemin) && !IGNORES.has(chemin))
    .sort()
    .map((chemin) => ({ chemin, contenu: readFileSync(path.join(RACINE, chemin), 'utf8') }));
}

describe('mise en ligne : plus aucune valeur provisoire', () => {
  it('src/config/site.ts, public/admin/config.yml et tout src/ et public/ sont prêts', async () => {
    // Jamais l'adresse d'audit Lighthouse : on vérifie la valeur écrite dans site.ts.
    delete process.env['AUDIT_SITE_URL'];
    const { site } = await import('../../src/config/site');
    const config = parse(readFileSync(path.join(RACINE, 'public/admin/config.yml'), 'utf8')) as {
      backend?: Record<string, unknown>;
    };

    const occurrences = listerPlaceholders([...fichiersTexte('src'), ...fichiersTexte('public')]);
    const problemes = [
      ...verifierSite(site).map((p) => `src/config/site.ts — ${p}`),
      ...verifierBackendCms(config.backend ?? {}).map((p) => `public/admin/config.yml — ${p}`),
      ...occurrences.map((o) => `${o.chemin}:${o.ligne} — valeur provisoire : ${o.texte}`),
    ];

    const message = [
      `Mise en ligne impossible : ${problemes.length} point(s) à compléter (voir docs/MISE-EN-LIGNE.md).`,
      ...problemes.map((p) => `  - ${p}`),
    ].join('\n');
    if (problemes.length > 0) expect.fail(message);
  });
});
