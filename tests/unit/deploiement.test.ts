import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/** Déploiement (.github/workflows/deploiement.yml), lu comme le ferait GitHub. */
type Etape = { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = {
  on: {
    push?: { branches?: string[]; 'paths-ignore'?: string[] };
    schedule?: { cron: string }[];
    workflow_dispatch?: { inputs?: Record<string, { required?: boolean; type?: string }> };
    [cle: string]: unknown;
  };
  permissions?: unknown;
  concurrency?: unknown;
  jobs: Record<string, { 'runs-on': string; permissions?: unknown; steps: Etape[] }>;
};

const RACINE = path.resolve(__dirname, '../..');
const texte = readFileSync(path.join(RACINE, '.github/workflows/deploiement.yml'), 'utf8');
const workflow = parse(texte) as Workflow;
const etapes = Object.values(workflow.jobs).flatMap((j) => j.steps);
const scripts = etapes.map((e) => e.run ?? '');
/** Rang de la première étape dont le script contient `fragment` (-1 si aucune). */
const rang = (fragment: string) => etapes.findIndex((e) => (e.run ?? '').includes(fragment));
const rsync = etapes.find((e) => (e.run ?? '').includes('rsync '));

describe('déploiement : déclencheurs', () => {
  it('push sur main (sauf documentation seule), deux horaires nocturnes, lancement manuel avec « ref »', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on.push?.['paths-ignore']).toEqual(['docs/**', '**.md']);
    expect((workflow.on.schedule ?? []).map((s) => s.cron).sort()).toEqual(['10 22 * * *', '10 23 * * *']);
    const ref = workflow.on.workflow_dispatch?.inputs?.['ref'];
    expect(ref).toBeDefined();
    expect(ref?.required).toBe(false);
    expect(ref?.type).toBe('string');
  });

  it('commentaire : l’un des deux horaires tombe toujours juste après minuit à Paris', () => {
    expect(texte).toMatch(/minuit à Paris/);
  });
});

describe('déploiement : droits et exécution', () => {
  it('jeton GitHub en lecture seule (contents: read), aucune permission ajoutée par un job', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs)) expect(job.permissions).toBeUndefined();
  });

  it('jamais deux déploiements à la fois, sans annuler celui en cours', () => {
    expect(workflow.concurrency).toEqual({ group: 'deploiement', 'cancel-in-progress': false });
  });

  it('un seul job, sur ubuntu-latest', () => {
    expect(Object.values(workflow.jobs).map((j) => j['runs-on'])).toEqual(['ubuntu-latest']);
  });

  it('ordre : validation de « ref » → checkout → Node → npm ci → tests → garde-fou → construction → rsync → effacement de la clé', () => {
    const validation = etapes.findIndex((e) => e.env?.['REF_DEMANDEE'] !== undefined);
    const checkout = etapes.findIndex((e) => e.uses?.startsWith('actions/checkout@'));
    const node = etapes.findIndex((e) => e.uses?.startsWith('actions/setup-node@'));
    const ordre = [validation, checkout, node, rang('npm ci'), rang('npm test'), rang('npm run verifier:mise-en-ligne'), rang('npm run build'), rang('rsync ')];
    expect(ordre.every((r) => r >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
    expect(new Set(ordre).size).toBe(ordre.length);
    const derniere = etapes.at(-1);
    expect(derniere?.if).toBe('always()');
    expect(derniere?.run).toMatch(/rm -rf "\$RUNNER_TEMP\/ssh"/);
  });

  it('Node.js : version lue dans .node-version, égale à la version majeure du conteneur de développement', () => {
    const node = etapes.find((e) => e.uses?.startsWith('actions/setup-node@'));
    expect(node?.with?.['node-version-file']).toBe('.node-version');
    const version = readFileSync(path.join(RACINE, '.node-version'), 'utf8');
    expect(version.trim()).toBe(process.versions.node.split('.')[0]);
    expect(version.endsWith('\n')).toBe(true);
  });

  it('scripts de plusieurs lignes en mode strict (set -euo pipefail)', () => {
    for (const script of scripts.filter((s) => s.trim().includes('\n'))) {
      expect(script.trimStart().startsWith('set -euo pipefail')).toBe(true);
    }
  });
});

describe('déploiement : sécurité', () => {
  it('« ref » passe par une variable d’environnement et est validée (SHA ou main) avant le checkout', () => {
    const validation = etapes.find((e) => e.env?.['REF_DEMANDEE'] !== undefined);
    expect(validation?.env?.['REF_DEMANDEE']).toBe('${{ inputs.ref }}');
    expect(validation?.run).toContain("grep -Eqx '[0-9a-f]{7,40}|main'");
    const checkout = etapes.find((e) => e.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['ref']).toBe('${{ inputs.ref }}');
    expect(checkout?.with?.['persist-credentials']).toBe(false);
  });

  it('aucune expression ${{ … }} dans les scripts (injection) : tout passe par env', () => {
    for (const script of scripts) expect(script).not.toContain('${{');
    expect(texte).not.toMatch(/github\.event\./);
  });

  it('secrets lus seulement par secrets.* dans env, et seulement les six secrets documentés', () => {
    const references = [...texte.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
    expect([...new Set(references)].sort()).toEqual(['REMOTE_PATH', 'SSH_HOST', 'SSH_KNOWN_HOSTS', 'SSH_PORT', 'SSH_PRIVATE_KEY', 'SSH_USER']);
    const enEnv = etapes.flatMap((e) => Object.values(e.env ?? {})).filter((v) => v.includes('secrets.')).length;
    expect(enEnv).toBe(references.length);
    // Jamais affichés.
    for (const script of scripts) {
      expect(script).not.toMatch(/set -x|echo[^\n]*\$(SSH_PRIVATE_KEY|SSH_KNOWN_HOSTS)/);
    }
  });

  it('vérification stricte de l’hôte SSH (known_hosts du secret), jamais « no » ni « accept-new »', () => {
    const run = rsync?.run ?? '';
    expect(run).toContain('-o StrictHostKeyChecking=yes');
    expect(run).toContain('-o UserKnownHostsFile=$RUNNER_TEMP/ssh/known_hosts');
    expect(texte).not.toMatch(/StrictHostKeyChecking=(no|accept-new)/i);
    expect(scripts.join('\n')).toMatch(/chmod 0600 "\$RUNNER_TEMP\/ssh\/cle"/);
  });

  it('rsync : dist/ vers le dossier du secret, --delete-after, droits D755/F644, fichiers du serveur protégés', () => {
    const run = rsync?.run ?? '';
    expect(run).toMatch(/rsync -rl?p?t /);
    expect(run).toContain('--delete-after');
    expect(run).not.toContain('--delete-excluded');
    expect(run).toContain('--chmod=D755,F644');
    expect(run).toContain('dist/ "$SSH_USER@$SSH_HOST:${REMOTE_PATH%/}/"');
    expect(run).toContain('-p $port');
    for (const chemin of ['/api/config.php', 'error_log', '/.well-known/', '/cgi-bin/', '/oauth/config.php', '/.htpasswd']) {
      expect(run, chemin).toContain(`--filter='P ${chemin}'`);
      expect(run, chemin).toContain(`--filter='- ${chemin}'`);
    }
    expect(rsync?.env).toEqual({
      SSH_HOST: '${{ secrets.SSH_HOST }}',
      SSH_USER: '${{ secrets.SSH_USER }}',
      SSH_PORT: '${{ secrets.SSH_PORT }}',
      REMOTE_PATH: '${{ secrets.REMOTE_PATH }}',
    });
  });

  it('aucune adresse, aucun hôte ni identifiant écrit en dur', () => {
    const code = [...scripts, ...etapes.flatMap((e) => Object.values(e.env ?? {}))].join('\n');
    expect(code).not.toMatch(/https?:\/\//);
    expect(code).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(code).not.toMatch(/fan2harmonie\.fr/i);
    expect(code).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]/);
    expect(texte).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it('actions officielles seulement (actions/*), épinglées en version majeure ; jamais « curl | sh »', () => {
    const actions = etapes.flatMap((e) => (e.uses ? [e.uses] : []));
    expect(actions.sort()).toEqual(['actions/checkout@v4', 'actions/setup-node@v4']);
    expect(scripts.join('\n')).not.toMatch(/(curl|wget)[^\n|]*\|\s*(ba|z)?sh/);
  });
});
