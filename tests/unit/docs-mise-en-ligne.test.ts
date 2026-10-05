import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Checklist de mise en ligne (docs/MISE-EN-LIGNE.md) : ce qu'elle doit toujours dire, et ce qu'elle ne doit
 * jamais contenir (aucune valeur secrète, aucun service tiers présenté comme utilisé).
 */

const RACINE = path.resolve(__dirname, '../..');
const CHEMIN = path.join(RACINE, 'docs/MISE-EN-LIGNE.md');
const texte = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';

describe('docs/MISE-EN-LIGNE.md', () => {
  it('existe, en français, avec ses étapes numérotées de 0 à 14', () => {
    expect(texte.length).toBeGreaterThan(5000);
    for (let n = 0; n <= 14; n++) expect(texte, `étape ${n}`).toMatch(new RegExp(`^## ${n}\\. `, 'm'));
  });

  it('nomme chacun des six secrets du déploiement, exactement ceux du workflow', () => {
    const workflow = readFileSync(path.join(RACINE, '.github/workflows/deploiement.yml'), 'utf8');
    const secrets = [...new Set([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1] ?? ''))].sort();
    expect(secrets).toEqual(['REMOTE_PATH', 'SSH_HOST', 'SSH_KNOWN_HOSTS', 'SSH_PORT', 'SSH_PRIVATE_KEY', 'SSH_USER']);
    for (const secret of secrets) expect(texte, secret).toContain(`\`${secret}\``);
  });

  it('fichier témoin .fan2harmonie-site, adresse de retour OAuth exacte, environnement « production » créé AVANT les secrets', () => {
    expect(texte).toContain('`.fan2harmonie-site`');
    expect(texte).toMatch(/fichier VIDE/);
    expect(texte).toContain('`https://fan2harmonie.fr/oauth/callback.php`');
    // Phrase d'ordre : l'environnement d'abord (limité à main), PUIS les secrets, au niveau de l'environnement.
    expect(texte).toMatch(/Créer D’ABORD l’environnement `production`[\s\S]{0,300}?`main`[\s\S]{0,100}?PUIS seulement[\s\S]{0,60}?six secrets/);
    expect(texte).toMatch(/secrets? (de|au niveau du) dépôt/i);
  });

  it('mêmes valeurs que le projet : base_url et auth_endpoint de config.yml, emplacement des configurations, seuils', () => {
    const backend = (parse(readFileSync(path.join(RACINE, 'public/admin/config.yml'), 'utf8')) as { backend: Record<string, string> }).backend;
    expect(texte).toContain(`${backend['base_url']}/${backend['auth_endpoint']}`);
    for (const fragment of [
      'fan2harmonie-contact/config.php',
      'fan2harmonie-contact/oauth-config.php',
      'php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"',
      '--max-delete=200',
      'docker compose run --rm app npm run verifier:mise-en-ligne',
      'curl --resolve fan2harmonie.fr:443:',
      'git revert',
      'source/CREDITS-PHOTOS.md',
      'npm run assets',
      'fan2harmonie-limiteur.json',
      '`repo`',
      '`public_repo`',
      'À faire relire (juridique)',
    ]) {
      expect(texte, fragment).toContain(fragment);
    }
    expect(texte).toMatch(/100 suppressions/);
    expect(texte).toMatch(/20 (envois|messages) par heure/);
  });

  it('aucune valeur secrète ni réelle (clé, jeton, secret, empreinte, adresse IP)', () => {
    for (const motif of [
      /BEGIN [A-Z ]*PRIVATE KEY/,
      /\bgh[opusr]_[A-Za-z0-9]{20,}/,
      /\b[0-9a-f]{40}\b/i,
      /\b[0-9a-f]{64}\b/i,
      /ssh-(ed25519|rsa) AAAA/,
      /SHA256:[A-Za-z0-9+/]{20,}/,
      /\b\d{1,3}(\.\d{1,3}){3}\b/,
      /'client_secret' => '(?!CHANGER)/,
      /\bIv1\.[A-Za-z0-9]{8,}/,
    ]) {
      expect(texte, String(motif)).not.toMatch(motif);
    }
  });

  it('Cloudflare et Formspree : seulement pour dire qu’ils ne sont PAS utilisés', () => {
    const lignes = texte.split('\n').filter((l) => /cloudflare|formspree/i.test(l));
    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) expect(ligne, ligne).toMatch(/\b(ni|aucun|pas|plus)\b/i);
  });
});
