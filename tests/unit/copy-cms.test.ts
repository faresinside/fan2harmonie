import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CIBLE_PAR_DEFAUT, copierCms, sourceParDefaut } from '../../scripts/copy-cms.mjs';

describe('scripts/copy-cms.mjs (bundle de /admin)', () => {
  it('copie le bundle du paquet installé dans public/admin/sveltia-cms.js', () => {
    const source = sourceParDefaut();
    expect(source).toMatch(/@sveltia[/\\]cms[/\\]dist[/\\]sveltia-cms\.js$/);
    const cible = copierCms();
    expect(cible).toBe(CIBLE_PAR_DEFAUT);
    expect(cible.endsWith(path.join('public', 'admin', 'sveltia-cms.js'))).toBe(true);
    expect(statSync(cible).size).toBeGreaterThan(100_000);
    expect(statSync(cible).size).toBe(statSync(source ?? '').size);
  });

  it('source absente : erreur explicite, rien n’est écrit', () => {
    const dossier = mkdtempSync(path.join(tmpdir(), 'copy-cms-'));
    const cible = path.join(dossier, 'admin', 'sveltia-cms.js');
    try {
      expect(() => copierCms({ source: path.join(dossier, 'absent.js'), cible })).toThrow(
        /Sveltia CMS introuvable : la structure du paquet a-t-elle changé \? vérifier le chemin dans scripts\/copy-cms\.mjs/,
      );
      expect(() => readFileSync(cible)).toThrow();
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
