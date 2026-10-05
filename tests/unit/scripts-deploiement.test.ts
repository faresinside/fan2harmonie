import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Garde-fous shell du déploiement (scripts/valider-remote-path.sh, scripts/valider-ref.sh), exécutés pour de
 * vrai (sh / bash du conteneur `app`) contre une table d'entrées bonnes et mauvaises.
 */

const RACINE = path.resolve(__dirname, '../..');
const lancer = (interprete: string, script: string, ...args: string[]) => {
  const r = spawnSync(interprete, [path.join(RACINE, 'scripts', script), ...args], { encoding: 'utf8' });
  return { code: r.status, sortie: r.stdout, erreurs: r.stderr };
};

describe('scripts/valider-remote-path.sh (REMOTE_PATH)', () => {
  const bons = ['/home/u/www', '/home/u/www/', '/home/user/www/fan2harmonie.fr', '/var/www/html', '/home/u-1/w_w.w/site~old'];
  const mauvais = [
    '', ' ', '.', './', '~', '~/', 'www/.', 'www', 'home/u/www', '/', '//', '/home', '/a', '/home/u', '/home/u/',
    '/home/u/../x', '/home/u/www/..', '/home/./u/www', '/home/~u/www', '/home/u/~', '/home//u/www',
    '/home/u/w ww', '/home/u/www\n/etc', '/home/u/www\nx', '/home/u/$(id)', '/home/u/`id`', '/home/u/www;rm',
    '/home/u/ww"w', "/home/u/ww'w", '-/home/u/www', '/home/u/www\t',
  ];

  for (const chemin of bons) {
    it(`accepte ${JSON.stringify(chemin)}`, () => {
      expect(lancer('sh', 'valider-remote-path.sh', chemin).code).toBe(0);
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

describe('scripts/valider-ssh.sh (SSH_HOST, SSH_USER, SSH_PORT)', () => {
  const bons: [string, string, string][] = [
    ['ssh.hebergeur.fr', 'compte', '22'],
    ['ssh.hebergeur.fr', 'compte', ''],
    ['ssh-1.cluster_2.hebergeur.fr', 'u.ser-1_x', '2222'],
    ['192.0.2.10', 'compte', '65535'],
    ['serveur', 'c', '1'],
  ];
  const mauvais: [string, string, string][] = [
    ['', 'compte', '22'],
    ['ssh.hebergeur.fr', '', '22'],
    ['-oProxyCommand=id', 'compte', '22'],
    ['ssh.hebergeur.fr', '-lroot', '22'],
    ['ssh.hebergeur.fr', 'compte', '-1'],
    ['ssh hebergeur.fr', 'compte', '22'],
    ['ssh.hebergeur.fr\nx', 'compte', '22'],
    ['ssh.hebergeur.fr', 'com\npte', '22'],
    ['ssh.hebergeur.fr', 'compte@x', '22'],
    ['user@ssh.hebergeur.fr', 'compte', '22'],
    ['ssh.hebergeur.fr:22', 'compte', '22'],
    ['ssh.hebergeur.fr', 'compte', '22a'],
    ['ssh.hebergeur.fr', 'compte', '0'],
    ['ssh.hebergeur.fr', 'compte', '65536'],
    ['ssh.hebergeur.fr', 'compte', '123456'],
    ['ssh.hebergeur.fr', 'compte', ' 22'],
    ['ssh.hebergeur.fr', 'compte', '22\n'],
    ['$(id)', 'compte', '22'],
    ['ssh.hebergeur.fr', '`id`', '22'],
    ['[::1]', 'compte', '22'],
    ['ssh.hebergeur.fr', 'compte;id', '22'],
  ];
  for (const [hote, compte, port] of bons) {
    it(`accepte ${JSON.stringify([hote, compte, port])}`, () => {
      const r = lancer('sh', 'valider-ssh.sh', hote, compte, port);
      expect(r.erreurs).toBe('');
      expect(r.code).toBe(0);
    });
  }
  for (const [hote, compte, port] of mauvais) {
    it(`refuse ${JSON.stringify([hote, compte, port])}`, () => {
      const r = lancer('sh', 'valider-ssh.sh', hote, compte, port);
      expect(r.code).not.toBe(0);
      expect(r.erreurs).toMatch(/SSH_(HOST|USER|PORT)/);
    });
  }
  it('refuse un nombre d’arguments autre que trois', () => {
    expect(lancer('sh', 'valider-ssh.sh', 'a', 'b').code).not.toBe(0);
    expect(lancer('sh', 'valider-ssh.sh', 'a', 'b', '22', 'x').code).not.toBe(0);
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
