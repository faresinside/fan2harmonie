import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/** Reconstruction quotidienne (.github/workflows/rebuild-daily.yml), lue comme le ferait GitHub. */
type Etape = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
type Workflow = {
  on: { schedule?: { cron: string }[]; workflow_dispatch?: unknown; [cle: string]: unknown };
  permissions?: unknown;
  jobs: Record<string, { 'runs-on': string; permissions?: unknown; steps: Etape[] }>;
};

const CHEMIN = path.resolve(__dirname, '../../.github/workflows/rebuild-daily.yml');
const texte = () => readFileSync(CHEMIN, 'utf8');
const workflow = () => parse(texte()) as Workflow;
const etapes = () => Object.values(workflow().jobs).flatMap((j) => j.steps);

describe('reconstruction quotidienne', () => {
  it('le fichier existe', () => {
    expect(existsSync(CHEMIN)).toBe(true);
  });

  it('deux horaires (22:10 et 23:10 UTC) : l’un tombe toujours à 00:10 à Paris, été comme hiver', () => {
    expect((workflow().on.schedule ?? []).map((s) => s.cron).sort()).toEqual(['10 22 * * *', '10 23 * * *']);
  });

  it('déclenchable à la main (workflow_dispatch), aucun autre déclencheur', () => {
    expect(Object.keys(workflow().on).sort()).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('aucune permission accordée au jeton GitHub', () => {
    expect(workflow().permissions).toEqual({});
    for (const job of Object.values(workflow().jobs)) expect(job.permissions ?? {}).toEqual({});
  });

  it('appelle le deploy hook lu dans le secret CLOUDFLARE_DEPLOY_HOOK, et échoue si le secret est vide', () => {
    const avecHook = etapes().filter((e) => e.run?.includes('curl'));
    expect(avecHook).toHaveLength(1);
    const etape = avecHook[0] as Etape;
    expect(etape.env?.['DEPLOY_HOOK_URL']).toBe('${{ secrets.CLOUDFLARE_DEPLOY_HOOK }}');
    expect(etape.run).toMatch(/test -n "\$DEPLOY_HOOK_URL"/);
    expect(etape.run).toMatch(/curl -fsS -X POST "\$DEPLOY_HOOK_URL"/);
    // Le secret n'est jamais affiché (pas de `set -x`, pas d'echo de la variable).
    expect(etape.run).not.toMatch(/set -x|echo[^\n]*\$DEPLOY_HOOK_URL/);
  });

  it('aucune adresse écrite en dur, aucune action tierce', () => {
    for (const e of etapes()) {
      expect(e.run ?? '').not.toMatch(/https?:\/\//);
      expect(Object.values(e.env ?? {}).join(' ')).not.toMatch(/https?:\/\//);
      expect(e.uses).toBeUndefined();
    }
  });

  it('.node-version (lu par Cloudflare Pages) = version majeure de Node du conteneur de développement', () => {
    const version = readFileSync(path.resolve(__dirname, '../../.node-version'), 'utf8');
    expect(version.trim()).toBe(process.versions.node.split('.')[0]);
    expect(version.endsWith('\n')).toBe(true);
  });

  it('commentaire expliquant pourquoi (site statique, dates évaluées à la construction)', () => {
    expect(texte()).toMatch(/statique/);
    expect(texte()).toMatch(/construction/);
  });
});
