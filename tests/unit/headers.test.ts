import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** En-têtes HTTP de Cloudflare Pages (public/_headers), lus selon la syntaxe de Cloudflare. */
const CHEMIN = path.resolve(__dirname, '../../public/_headers');

type Bloc = { chemin: string; entetes: [string, string][] };

function lire(): Bloc[] {
  const blocs: Bloc[] = [];
  for (const brute of readFileSync(CHEMIN, 'utf8').split(/\r?\n/)) {
    if (brute.trim() === '' || brute.trim().startsWith('#')) continue;
    if (!/^\s/.test(brute)) {
      blocs.push({ chemin: brute.trim(), entetes: [] });
      continue;
    }
    const bloc = blocs.at(-1);
    if (!bloc) throw new Error(`en-tête hors bloc : ${brute}`);
    const i = brute.indexOf(':');
    if (i < 0) throw new Error(`ligne sans « : » : ${brute}`);
    bloc.entetes.push([brute.slice(0, i).trim().toLowerCase(), brute.slice(i + 1).trim()]);
  }
  return blocs;
}

const bloc = (chemin: string): Record<string, string> => {
  const b = lire().find((x) => x.chemin === chemin);
  if (!b) throw new Error(`bloc ${chemin} absent de _headers`);
  return Object.fromEntries(b.entetes);
};
const tousLesEntetes = () => lire().flatMap((b) => b.entetes.map(([nom]) => nom));

describe('public/_headers (Cloudflare Pages)', () => {
  it('existe et se termine par un saut de ligne', () => {
    expect(existsSync(CHEMIN)).toBe(true);
    expect(readFileSync(CHEMIN, 'utf8').endsWith('\n')).toBe(true);
  });

  it('chaque chemin n’a qu’un seul bloc, chaque en-tête qu’une seule fois par bloc', () => {
    const chemins = lire().map((b) => b.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const b of lire()) {
      const noms = b.entetes.map(([nom]) => nom);
      expect(new Set(noms).size, b.chemin).toBe(noms.length);
    }
  });

  it('/* : en-têtes de sécurité', () => {
    expect(bloc('/*')).toEqual({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'x-frame-options': 'DENY',
    });
  });

  it('Permissions-Policy sans « interest-cohort » (fonction retirée : Chrome affiche une erreur en console)', () => {
    expect(bloc('/*')['permissions-policy']).not.toContain('interest-cohort');
  });

  it('/_astro/* : fichiers à nom unique, cache d’un an immuable', () => {
    expect(bloc('/_astro/*')).toEqual({ 'cache-control': 'public, max-age=31536000, immutable' });
  });

  it('/admin/* : jamais en cache (configuration et CMS toujours à jour)', () => {
    expect(bloc('/admin/*')).toEqual({ 'cache-control': 'no-store' });
  });

  it('aucun Cross-Origin-Opener-Policy (casserait la fenêtre de connexion GitHub de /admin)', () => {
    expect(tousLesEntetes()).not.toContain('cross-origin-opener-policy');
  });

  it('pas encore de Content-Security-Policy (scripts en ligne : voir le README)', () => {
    expect(tousLesEntetes()).not.toContain('content-security-policy');
    expect(tousLesEntetes()).not.toContain('content-security-policy-report-only');
  });
});
