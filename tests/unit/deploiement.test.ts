import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/** Déploiement (.github/workflows/deploiement.yml), lu comme le ferait GitHub. */
type Etape = { id?: string; name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  'runs-on': string;
  needs?: string;
  if?: string;
  environment?: string;
  permissions?: unknown;
  outputs?: Record<string, string>;
  steps: Etape[];
};
type Workflow = {
  on: {
    push?: { branches?: string[]; 'paths-ignore'?: string[] };
    schedule?: { cron: string }[];
    workflow_dispatch?: { inputs?: Record<string, { required?: boolean; type?: string; description?: string }> };
    [cle: string]: unknown;
  };
  permissions?: unknown;
  concurrency?: unknown;
  jobs: Record<string, Job>;
};

const RACINE = path.resolve(__dirname, '../..');
const texte = readFileSync(path.join(RACINE, '.github/workflows/deploiement.yml'), 'utf8');
const workflow = parse(texte) as Workflow;
const construire = workflow.jobs['construire'] as Job;
const deployer = workflow.jobs['deployer'] as Job;
const etapes = Object.values(workflow.jobs).flatMap((j) => j.steps);
const scripts = etapes.map((e) => e.run ?? '');
const texteJob = (job: Job) => JSON.stringify(job);
/** Rang de la première étape du job dont le script contient `fragment` (-1 si aucune). */
const rang = (job: Job, fragment: string) => job.steps.findIndex((e) => (e.run ?? '').includes(fragment));
const rsync = deployer.steps.find((e) => (e.run ?? '').includes('rsync -r'));

/**
 * Filtre de chemins de GitHub Actions, pour les deux seuls motifs employés : « ** » couvre tout (« / »
 * compris), « * » tout sauf « / » (https://docs.github.com/actions/reference/workflow-syntax-for-github-actions#filter-pattern-cheat-sheet).
 */
const versRegex = (motif: string) =>
  new RegExp(`^${motif.split('**').map((p) => p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`);
/** Vrai si un push qui ne touche que `fichier` est ignoré par paths-ignore. */
const ignore = (fichier: string) => (workflow.on.push?.['paths-ignore'] ?? []).some((m) => versRegex(m).test(fichier));

describe('déploiement : déclencheurs', () => {
  it('push sur main (sauf docs/ et .md de la racine), deux horaires nocturnes, lancement manuel avec « ref »', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on.push?.['paths-ignore']).toEqual(['docs/**', '*.md']);
    expect((workflow.on.schedule ?? []).map((s) => s.cron).sort()).toEqual(['10 22 * * *', '10 23 * * *']);
    const ref = workflow.on.workflow_dispatch?.inputs?.['ref'];
    expect(ref?.required).toBe(false);
    expect(ref?.type).toBe('string');
    expect(ref?.description).toMatch(/40/);
  });

  it('un contenu enregistré dans /admin (src/content/**/*.md, images) déploie ; README et docs/ non', () => {
    for (const fichier of ['src/content/rendezvous/x.md', 'src/content/pages/qigong.md', 'src/content/actualites/a/b.md', 'public/images/x.jpg', 'public/admin/config.yml', 'src/config/site.ts']) {
      expect(ignore(fichier), fichier).toBe(false);
    }
    for (const fichier of ['README.md', 'CHANGELOG.md', 'docs/x.md', 'docs/a/b/c.png']) {
      expect(ignore(fichier), fichier).toBe(true);
    }
  });

  it('commentaire : l’un des deux horaires tombe toujours juste après minuit à Paris', () => {
    expect(texte).toMatch(/minuit à Paris/);
  });

  it('commentaire : retour arrière durable = git revert ; « ref » = urgence, écrasée au prochain push ou la nuit', () => {
    expect(texte).toMatch(/git revert/);
    expect(texte).toMatch(/provisoire/);
  });
});

describe('déploiement : deux jobs', () => {
  it('« construire » puis « deployer » (needs), jeton en lecture seule partout', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['construire', 'deployer']);
    expect(deployer.needs).toBe('construire');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toEqual({ contents: 'read' });
      expect(job['runs-on']).toBe('ubuntu-latest');
    }
  });

  it('jamais deux déploiements à la fois, sans annuler celui en cours', () => {
    expect(workflow.concurrency).toEqual({ group: 'deploiement', 'cancel-in-progress': false });
  });

  it('« deployer » : seulement depuis main, dans l’environnement « production »', () => {
    expect(deployer.if).toBe("github.ref == 'refs/heads/main'");
    expect(deployer.environment).toBe('production');
    expect(construire.environment).toBeUndefined();
  });

  it('« construire » : aucun secret ; checkout → version → Node → npm ci → tests → garde-fou → construction → contrôle → artefact', () => {
    expect(texteJob(construire)).not.toMatch(/secrets\./);
    const s = construire.steps;
    const ordre = [
      s.findIndex((e) => e.uses?.startsWith('actions/checkout@')),
      s.findIndex((e) => e.id === 'version'),
      s.findIndex((e) => e.uses?.startsWith('actions/setup-node@')),
      rang(construire, 'npm ci'),
      rang(construire, 'npm test'),
      rang(construire, 'npm run verifier:mise-en-ligne'),
      rang(construire, 'npm run build'),
      rang(construire, 'find dist -type l'),
      s.findIndex((e) => e.uses?.startsWith('actions/upload-artifact@')),
    ];
    expect(ordre.every((r) => r >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
    const artefact = s.find((e) => e.uses?.startsWith('actions/upload-artifact@'));
    expect(artefact?.with).toMatchObject({ name: 'site', path: 'dist/', 'include-hidden-files': true, 'if-no-files-found': 'error' });
    expect(construire.outputs?.['adresse']).toBe('${{ steps.adresse.outputs.adresse }}');
  });

  it('« deployer » : ni Node ni npm ; dist/ récupéré ; contrôles → clé → rsync → effacement de la clé', () => {
    const texteDeployer = texteJob(deployer);
    expect(texteDeployer).not.toMatch(/\bnpm\b|\bnode\b|setup-node/);
    const s = deployer.steps;
    const telechargement = s.find((e) => e.uses?.startsWith('actions/download-artifact@'));
    expect(telechargement?.with).toEqual({ name: 'site', path: 'dist' });
    const ordre = [
      s.findIndex((e) => e.uses?.startsWith('actions/download-artifact@')),
      rang(deployer, 'scripts/valider-remote-path.sh'),
      rang(deployer, 'SSH_PRIVATE_KEY'),
      rang(deployer, 'rsync -r'),
    ];
    expect(ordre.every((r) => r >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
    const derniere = s.at(-1);
    expect(derniere?.if).toBe('always()');
    expect(derniere?.run).toMatch(/rm -rf "\$RUNNER_TEMP\/ssh"/);
  });

  it('Node.js : version lue dans .node-version, égale à la version majeure du conteneur de développement', () => {
    const node = construire.steps.find((e) => e.uses?.startsWith('actions/setup-node@'));
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
  it('« ref » : variable d’environnement, script de main (syntaxe puis ancêtre de origin/main), historique complet', () => {
    const version = construire.steps.find((e) => e.id === 'version');
    expect(version?.env?.['REF_DEMANDEE']).toBe('${{ inputs.ref }}');
    expect(version?.run).toContain('cp scripts/valider-ref.sh "$RUNNER_TEMP/valider-ref.sh"');
    expect(version?.run).toContain('bash "$RUNNER_TEMP/valider-ref.sh" syntaxe "$REF_DEMANDEE"');
    expect(version?.run).toContain('bash "$RUNNER_TEMP/valider-ref.sh" ancetre');
    const checkout = construire.steps.find((e) => e.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toEqual({ 'fetch-depth': 0, 'persist-credentials': false });
  });

  it('REMOTE_PATH : trois couches — forme du chemin, fichier témoin sur le serveur, --max-delete', () => {
    expect(texteJob(deployer)).toContain('sh scripts/valider-remote-path.sh \\"$REMOTE_PATH\\"');
    const run = rsync?.run ?? '';
    const temoin = run.indexOf('rsync --list-only -e "$ssh_cmd" "$distant/.fan2harmonie-site"');
    expect(temoin).toBeGreaterThan(-1);
    expect(run.indexOf('rsync -rlpt')).toBeGreaterThan(temoin);
    expect(run).toMatch(/\.fan2harmonie-site absent[^\n]*\n\s*exit 1/);
    expect(run).toContain('--max-delete=200');
    expect(run).toContain(`--filter='- /.fan2harmonie-site' --filter='P /.fan2harmonie-site'`);
  });

  it('aucune expression ${{ … }} dans les scripts (injection) : tout passe par env', () => {
    for (const script of scripts) expect(script).not.toContain('${{');
    expect(texte).not.toMatch(/github\.event\./);
  });

  it('secrets lus seulement par secrets.* dans env du job « deployer », et seulement les six secrets documentés', () => {
    const references = [...texte.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
    expect([...new Set(references)].sort()).toEqual(['REMOTE_PATH', 'SSH_HOST', 'SSH_KNOWN_HOSTS', 'SSH_PORT', 'SSH_PRIVATE_KEY', 'SSH_USER']);
    const enEnv = deployer.steps.flatMap((e) => Object.values(e.env ?? {})).filter((v) => v.includes('secrets.')).length;
    expect(enEnv).toBe(references.length);
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

  it('rsync : dist/ vers le dossier du secret, --delete-after --delay-updates, D755/F644, fichiers du serveur protégés', () => {
    const run = rsync?.run ?? '';
    expect(run).toContain('rsync -rlpt --delete-after --delay-updates');
    expect(run).not.toContain('--delete-excluded');
    expect(run).toContain('--chmod=D755,F644');
    expect(run).toContain('distant="$SSH_USER@$SSH_HOST:${REMOTE_PATH%/}"');
    expect(run).toContain('dist/ "$distant/"');
    for (const chemin of ['/api/config.php', 'error_log', '/.well-known/acme-challenge/', '/cgi-bin/', '/oauth/config.php', '/.htpasswd', '/.user.ini']) {
      expect(run, chemin).toContain(`--filter='P ${chemin}'`);
      expect(run, chemin).toContain(`--filter='- ${chemin}'`);
    }
    // .well-known/ lui-même peut être déployé (ex. security.txt) : seul acme-challenge/ est réservé.
    expect(run).not.toContain(`'- /.well-known/'`);
    expect(rsync?.env).toMatchObject({
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
    expect(actions.sort()).toEqual([
      'actions/checkout@v4',
      'actions/checkout@v4',
      'actions/download-artifact@v4',
      'actions/setup-node@v4',
      'actions/upload-artifact@v4',
    ]);
    expect(scripts.join('\n')).not.toMatch(/(curl|wget)[^\n|]*\|\s*(ba|z)?sh/);
  });
});
