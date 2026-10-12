import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Garde-fous shell du déploiement (scripts/valider-remote-path.sh, scripts/valider-connexion.sh, scripts/valider-ref.sh), exécutés pour de
 * vrai (sh / bash du conteneur `app`) contre une table d'entrées bonnes et mauvaises.
 */

const RACINE = path.resolve(__dirname, '../..');
const lancer = (interprete: string, script: string, ...args: string[]) => {
  const r = spawnSync(interprete, [path.join(RACINE, 'scripts', script), ...args], { encoding: 'utf8' });
  return { code: r.status, sortie: r.stdout, erreurs: r.stderr };
};

describe('scripts/valider-remote-path.sh (REMOTE_PATH, relatif à la racine du compte FTP/SFTP)', () => {
  const bons = ['www', 'www/', 'www/fan2harmonie.fr', 'public_html', 'web/www', 'w_w.w-1/site'];
  const mauvais = [
    '', ' ', '.', './', '..', '../', '~', 'www/.', 'www/..', './www', '../www', 'www/../x', 'www/./x', 'a/../../etc',
    '/', '//', '/www', '/home/u/www', 'www//x', 'www//', 'w ww', 'www\n/etc', 'www\nx', '$(id)', '`id`', 'www;rm',
    'ww"w', "ww'w", '-www', '-oProxyCommand=id', 'www\t', 'www|x', 'www&x', 'www>x', 'é',
  ];

  for (const chemin of bons) {
    it(`accepte ${JSON.stringify(chemin)}`, () => {
      const r = lancer('sh', 'valider-remote-path.sh', chemin);
      expect(r.erreurs).toBe('');
      expect(r.code).toBe(0);
    });
  }
  for (const chemin of mauvais) {
    it(`refuse ${JSON.stringify(chemin)}`, () => {
      const r = lancer('sh', 'valider-remote-path.sh', chemin);
      expect(r.code).not.toBe(0);
      expect(r.erreurs).toMatch(/REMOTE_PATH/);
    });
  }
  it('refuse l’absence d’argument', () => {
    expect(lancer('sh', 'valider-remote-path.sh').code).not.toBe(0);
  });
});

describe('scripts/valider-connexion.sh (DEPLOY_PROTOCOL, DEPLOY_HOST, DEPLOY_USER, DEPLOY_PORT)', () => {
  const bons: [string, string, string, string][] = [
    ['ftps', 'ftp.cluster000.hosting.ovh.net', 'compte', '21'],
    ['ftps', 'ftp.hebergeur.fr', 'compte', ''],
    ['sftp', 'ssh.hebergeur.fr', 'compte', ''],
    ['sftp', 'ssh-1.cluster_2.hebergeur.fr', 'u.ser-1_x', '2222'],
    ['ftps', '192.0.2.10', 'compte', '65535'],
    ['sftp', 'serveur', 'c', '1'],
  ];
  const mauvais: [string, string, string, string][] = [
    ['', 'h.fr', 'compte', ''],
    ['ftp', 'h.fr', 'compte', ''], // jamais de FTP en clair
    ['FTPS', 'h.fr', 'compte', ''],
    ['ftps ', 'h.fr', 'compte', ''],
    ['ssh', 'h.fr', 'compte', ''],
    ['ftps', '', 'compte', ''],
    ['ftps', 'h.fr', '', ''],
    ['ftps', '-oProxyCommand=id', 'compte', ''],
    ['sftp', 'h.fr', '-lroot', ''],
    ['ftps', 'h.fr', 'compte', '-1'],
    ['ftps', 'h .fr', 'compte', ''],
    ['ftps', 'h.fr\nx', 'compte', ''],
    ['ftps', 'h.fr', 'com\npte', ''],
    ['ftps', 'h.fr', 'compte@x', ''],
    ['ftps', 'user@h.fr', 'compte', ''],
    ['ftps', 'ftp://h.fr', 'compte', ''],
    ['ftps', 'h.fr:21', 'compte', ''],
    ['ftps', 'h.fr', 'compte', '21a'],
    ['ftps', 'h.fr', 'compte', '0'],
    ['ftps', 'h.fr', 'compte', '65536'],
    ['ftps', 'h.fr', 'compte', '123456'],
    ['ftps', 'h.fr', 'compte', ' 21'],
    ['ftps', 'h.fr', 'compte', '21\n'],
    ['ftps', '$(id)', 'compte', ''],
    ['ftps', 'h.fr', '`id`', ''],
    ['ftps', '[::1]', 'compte', ''],
    ['ftps', 'h.fr', 'compte;id', ''],
    ['ftps', 'h.fr', 'compte"x', ''],
  ];
  for (const [proto, hote, compte, port] of bons) {
    it(`accepte ${JSON.stringify([proto, hote, compte, port])}`, () => {
      const r = lancer('sh', 'valider-connexion.sh', proto, hote, compte, port);
      expect(r.erreurs).toBe('');
      expect(r.code).toBe(0);
    });
  }
  for (const [proto, hote, compte, port] of mauvais) {
    it(`refuse ${JSON.stringify([proto, hote, compte, port])}`, () => {
      const r = lancer('sh', 'valider-connexion.sh', proto, hote, compte, port);
      expect(r.code).not.toBe(0);
      expect(r.erreurs).toMatch(/DEPLOY_(PROTOCOL|HOST|USER|PORT)/);
    });
  }
  it('refuse un nombre d’arguments autre que quatre', () => {
    expect(lancer('sh', 'valider-connexion.sh', 'ftps', 'a', 'b').code).not.toBe(0);
    expect(lancer('sh', 'valider-connexion.sh', 'ftps', 'a', 'b', '21', 'x').code).not.toBe(0);
  });
});

describe('scripts/valider-ref.sh syntaxe (champ « ref » du lancement manuel)', () => {
  const sha = 'a'.repeat(39) + '0';
  const cas: [string, string | null][] = [
    ['', 'main'],
    ['main', 'main'],
    [sha, sha],
    ['0123456789abcdef0123456789abcdef01234567', '0123456789abcdef0123456789abcdef01234567'],
    ['abc1234', null],
    ['A'.repeat(40), null],
    [sha + '0', null],
    ['main\n--upload-pack=x', null],
    [`${sha}\nmain`, null],
    ['main ', null],
    [' main', null],
    ['refs/heads/main', null],
    ['--upload-pack=x', null],
    ['origin/main', null],
    ['v1.0', null],
  ];
  for (const [entree, attendu] of cas) {
    it(`${JSON.stringify(entree)} → ${attendu ?? 'refusé'}`, () => {
      const r = lancer('bash', 'valider-ref.sh', 'syntaxe', entree);
      if (attendu === null) {
        expect(r.code).not.toBe(0);
        expect(r.sortie).toBe('');
      } else {
        expect(r.code).toBe(0);
        expect(r.sortie).toBe(`${attendu}\n`);
      }
    });
  }
});

describe('scripts/valider-ref.sh ancetre (version atteignable depuis origin/main)', () => {
  const depot = mkdtempSync(path.join(tmpdir(), 'depot-'));
  afterAll(() => rmSync(depot, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const r = spawnSync('git', ['-C', depot, '-c', 'user.name=t', '-c', 'user.email=t@t.t', ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'un');
  const ancien = git('rev-parse', 'HEAD');
  git('commit', '-q', '--allow-empty', '-m', 'deux');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '-q', '-b', 'ailleurs', ancien);
  git('commit', '-q', '--allow-empty', '-m', 'hors de main');
  const horsMain = git('rev-parse', 'HEAD');
  const ancetre = () => spawnSync('bash', [path.join(RACINE, 'scripts/valider-ref.sh'), 'ancetre'], { cwd: depot, encoding: 'utf8' });

  it('ancien commit de main : accepté', () => {
    git('checkout', '-q', '--detach', ancien);
    expect(ancetre().status).toBe(0);
  });
  it('commit hors de main : refusé', () => {
    git('checkout', '-q', '--detach', horsMain);
    const r = ancetre();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/main/);
  });
});
