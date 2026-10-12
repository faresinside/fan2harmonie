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
const copie = deployer.steps.find((e) => (e.run ?? '').includes('scripts/deployer.sh'));
/** Le script de déploiement lui-même (scripts/deployer.sh), testé contre de vrais serveurs par `npm run test:ftp`. */
const script = readFileSync(path.join(RACINE, 'scripts/deployer.sh'), 'utf8');

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

  it('« deployer » : ni Node ni npm ; dist/ récupéré ; lftp installé → empreinte SFTP → scripts/deployer.sh → effacement', () => {
    const texteDeployer = texteJob(deployer);
    expect(texteDeployer).not.toMatch(/\bnpm\b|\bnode\b|setup-node/);
    const s = deployer.steps;
    const telechargement = s.find((e) => e.uses?.startsWith('actions/download-artifact@'));
    expect(telechargement?.with).toEqual({ name: 'site', path: 'dist' });
    const ordre = [
      s.findIndex((e) => e.uses?.startsWith('actions/download-artifact@')),
      rang(deployer, 'apt-get install'),
      rang(deployer, 'known_hosts'),
      rang(deployer, 'scripts/deployer.sh'),
    ];
    expect(ordre.every((r) => r >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
    const derniere = s.at(-1);
    expect(derniere?.if).toBe('always()');
    expect(derniere?.run).toMatch(/rm -rf "\$RUNNER_TEMP\/ssh"/);
  });

  it('known_hosts effacé AUSSITÔT après la copie (always), avant la vérification du site', () => {
    const s = deployer.steps;
    const copie = rang(deployer, 'scripts/deployer.sh');
    const effacement = s[copie + 1];
    expect(effacement?.if).toBe('always()');
    expect(effacement?.run).toMatch(/rm -rf "\$RUNNER_TEMP\/ssh"/);
    expect(rang(deployer, 'curl ')).toBeGreaterThan(copie + 1);
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

describe('déploiement : contenu et documentation jamais bloquants ; variables de test interdites', () => {
  const etape = (fragment: string) => construire.steps.find((e) => (e.run ?? '').includes(fragment));

  it('npm test et le garde-fou restent bloquants', () => {
    expect(etape('npm test')?.['continue-on-error' as keyof Etape]).toBeUndefined();
    expect(etape('npm run verifier:mise-en-ligne')?.['continue-on-error' as keyof Etape]).toBeUndefined();
  });

  it('verifier:contenu et test:docs : NON bloquants (continue-on-error), avertissement ::warning::, après la construction', () => {
    for (const commande of ['npm run verifier:contenu', 'npm run test:docs']) {
      const e = etape(commande) as (Etape & { 'continue-on-error'?: boolean }) | undefined;
      expect(e, commande).toBeDefined();
      expect(e?.['continue-on-error'], commande).toBe(true);
      expect(e?.run, commande).toMatch(/::warning::/);
      expect(rang(construire, commande), commande).toBeGreaterThan(rang(construire, 'find dist -type l'));
      expect(rang(construire, commande), commande).toBeLessThan(construire.steps.findIndex((s) => s.uses?.startsWith('actions/upload-artifact@')));
    }
  });

  it('L-c : aucune variable de test (ASTRO_BASE, AUDIT_SITE_URL, CONTENT_FIXTURE*) à la construction, contrôle bloquant avant npm run build', () => {
    const garde = etape('test -z "${ASTRO_BASE:-}${AUDIT_SITE_URL:-}${CONTENT_FIXTURE:-}${CONTENT_FIXTURE_SET:-}"');
    expect(garde).toBeDefined();
    expect(garde?.run).toMatch(/::error::/);
    expect(garde?.['continue-on-error' as keyof Etape]).toBeUndefined();
    expect(rang(construire, 'test -z "${ASTRO_BASE')).toBeLessThan(rang(construire, 'npm run build'));
  });
});

describe('déploiement : derniers garde-fous (N3 à N6)', () => {
  const verification = deployer.steps.find((e) => (e.run ?? '').includes('curl '));

  it('N3 : adresse issue du job 1 validée (https://hôte/) AVANT tout curl, et « -- » avant l’adresse', () => {
    const script = verification?.run ?? '';
    expect(verification?.env).toEqual({ ADRESSE: '${{ needs.construire.outputs.adresse }}' });
    const controle = script.indexOf('[[ "$ADRESSE" =~ ^https://[a-z0-9.-]+/$ ]] || exit 1');
    expect(controle).toBeGreaterThan(-1);
    expect(script.indexOf('curl ')).toBeGreaterThan(controle);
    for (const appel of script.match(/curl [^\n]*/g) ?? []) expect(appel).toMatch(/ -- "\$ADRESSE"/);
    // L'expression régulière de bash : vraie pour l'adresse attendue, fausse pour une injection d'option.
    const motif = /^https:\/\/[a-z0-9.-]+\/$/;
    expect(motif.test('https://fan2harmonie.fr/')).toBe(true);
    for (const ko of ['-K/etc/passwd', 'https://fan2harmonie.fr', 'http://fan2harmonie.fr/', 'https://x/ -o /tmp/y', 'https://a@b/', 'https://x/\n-K']) {
      expect(motif.test(ko), ko).toBe(false);
    }
  });

  it('N6 : réponse 5xx du site → échec du job ; connexion impossible (DNS) → simple avertissement', () => {
    const script = verification?.run ?? '';
    expect(script).toMatch(/5\[0-9\]\[0-9\]\)[^;]*::error::[^\n]*\n\s*exit 1/);
    expect(script).toMatch(/000\)[^;]*::warning::/);
  });

  it('N4 : passage à blanc (--dry-run, mêmes exclusions) avant la vraie copie ; trop de suppressions → arrêt', () => {
    const essai = script.indexOf('mirror -R --dry-run');
    const vraie = script.lastIndexOf('mirror -R --delete');
    expect(script.indexOf('.fan2harmonie-site absent')).toBeGreaterThan(-1);
    expect(essai).toBeGreaterThan(script.indexOf('.fan2harmonie-site absent'));
    expect(vraie).toBeGreaterThan(essai);
    // Mêmes exclusions pour les deux passages : une seule liste, réutilisée.
    expect(script).toMatch(/exclusions=\(/);
    expect(script.match(/\$\{exclusions\[@\]\}/g)).toHaveLength(2);
    expect(script).toMatch(/SEUIL_SUPPRESSIONS=\$\{SEUIL_SUPPRESSIONS:-100\}/);
    expect(script).toMatch(/-gt "\$SEUIL_SUPPRESSIONS"/);
    expect(script).toMatch(/head -n \d+/);
    // Toute erreur de lftp (passage à blanc ou vrai) : les 50 dernières lignes du journal, puis arrêt.
    expect(script.match(/tail -n 50 /g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // La vraie copie ne se lance qu'après le contrôle du seuil.
    expect(vraie).toBeGreaterThan(script.indexOf('trop de suppressions'));
  });

  it('A5 : protocole, serveur, compte et port validés par scripts/valider-connexion.sh, REMOTE_PATH par scripts/valider-remote-path.sh', () => {
    expect(script).toContain('sh scripts/valider-connexion.sh "$PROTOCOLE" "$HOTE" "$UTILISATEUR" "$PORT"');
    expect(script).toContain('sh scripts/valider-remote-path.sh "$DISTANT"');
    expect(script.indexOf('scripts/valider-connexion.sh')).toBeLessThan(script.indexOf('lftp -f'));
    expect(script.indexOf('scripts/valider-remote-path.sh')).toBeLessThan(script.indexOf('lftp -f'));
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

  it('REMOTE_PATH : trois couches — forme du chemin, fichier témoin sur le serveur, seuil de suppressions', () => {
    expect(script).toContain('sh scripts/valider-remote-path.sh "$DISTANT"');
    const temoin = script.indexOf("cls -1 .fan2harmonie-site");
    expect(temoin).toBeGreaterThan(-1);
    expect(script.indexOf('mirror -R --delete')).toBeGreaterThan(temoin);
    expect(script).toMatch(/\.fan2harmonie-site absent[^\n]*\n\s*fi|erreur "fichier témoin \.fan2harmonie-site absent/);
    expect(script).toContain("-x '^\\.fan2harmonie-site$'");
    expect(script).toContain('SEUIL_SUPPRESSIONS');
  });

  it('aucune expression ${{ … }} dans les scripts (injection) : tout passe par env', () => {
    for (const s of scripts) expect(s).not.toContain('${{');
    expect(texte).not.toMatch(/github\.event\./);
  });

  it('secrets lus seulement par secrets.* dans env du job « deployer », et seulement les sept secrets documentés', () => {
    const references = [...texte.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
    expect([...new Set(references)].sort()).toEqual([
      'DEPLOY_HOST',
      'DEPLOY_KNOWN_HOSTS',
      'DEPLOY_PASSWORD',
      'DEPLOY_PORT',
      'DEPLOY_PROTOCOL',
      'DEPLOY_USER',
      'REMOTE_PATH',
    ]);
    const enEnv = deployer.steps.flatMap((e) => Object.values(e.env ?? {})).filter((v) => v.includes('secrets.')).length;
    expect(enEnv).toBe(references.length);
    for (const s of [...scripts, script]) {
      expect(s).not.toMatch(/set -x|echo[^\n]*\$(DEPLOY_PASSWORD|DEPLOY_KNOWN_HOSTS|mdp_lftp)/);
    }
  });

  it('le mot de passe n’est ni dans un argument, ni dans un fichier, ni dans le journal : entrée standard de lftp seulement', () => {
    expect(script).not.toMatch(/(^|\|)\s*lftp \S[^\n]*(-u |DEPLOY_PASSWORD|mdp_lftp)/m);
    expect(script).toContain("printf 'open -u \"%s,%s\" \"%s\"\\n' \"$UTILISATEUR\" \"$mdp_lftp\" \"$url\"");
    expect(script).toContain('} | lftp -f /dev/stdin');
    expect(script).not.toMatch(/>\s*[^\n]*mdp_lftp|echo[^\n]*\$DEPLOY_PASSWORD/);
  });

  it('vérification stricte du serveur : certificat FTPS vérifié (nom compris), empreinte SFTP du secret ; jamais d’option pour désactiver', () => {
    expect(script).toContain('set ssl:verify-certificate yes');
    expect(script).toContain('set ssl:check-hostname yes');
    expect(script).toContain('set ftp:ssl-force yes');
    expect(script).toContain('set ftp:ssl-protect-data yes');
    expect(script).toContain('-o StrictHostKeyChecking=yes');
    expect(script).toContain('-o UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS');
    expect(script).not.toMatch(/verify-certificate\s+(no|false|off)|check-hostname\s+(no|false|off)|StrictHostKeyChecking=(no|accept-new)|ftp:ssl-allow\s+no|ftp:ssl-force\s+no/i);
    expect(script).not.toMatch(/ftp:\/\/[^$]/);
    expect(texte).not.toMatch(/StrictHostKeyChecking=(no|accept-new)/i);
    expect(scripts.join('\n')).toMatch(/chmod 0600 "\$RUNNER_TEMP\/ssh\/known_hosts"/);
  });

  it('lftp : dist/ vers le dossier du secret, suppression en fin de copie, fichiers du serveur exclus, secrets passés par env', () => {
    expect(script).toContain('mirror -R --delete --no-perms');
    expect(script).not.toMatch(/delete-first/);
    for (const motif of ["'^api/config\\.php$'", "'^oauth/config\\.php$'", "'(^|/)error_log$'", "'^\\.well-known/'", "'^cgi-bin/'", "'^\\.htpasswd$'", "'^\\.user\\.ini$'", "'^\\.fan2harmonie-site$'"]) {
      expect(script, motif).toContain(`-x ${motif}`);
    }
    expect(copie?.env).toMatchObject({
      DEPLOY_PROTOCOL: '${{ secrets.DEPLOY_PROTOCOL }}',
      DEPLOY_HOST: '${{ secrets.DEPLOY_HOST }}',
      DEPLOY_USER: '${{ secrets.DEPLOY_USER }}',
      DEPLOY_PASSWORD: '${{ secrets.DEPLOY_PASSWORD }}',
      DEPLOY_PORT: '${{ secrets.DEPLOY_PORT }}',
      REMOTE_PATH: '${{ secrets.REMOTE_PATH }}',
    });
  });

  it('aucune adresse, aucun hôte ni identifiant écrit en dur', () => {
    const code = [...scripts, ...etapes.flatMap((e) => Object.values(e.env ?? {}))]
      .join('\n')
      // Seule exception : l'expression qui VALIDE l'adresse lue dans site.ts (N3).
      .replace('^https://[a-z0-9.-]+/$', '');
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
