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
/** Texte sur une seule ligne (retours à la ligne et espaces multiples réduits à une espace). */
const plat = texte.replace(/\s+/g, ' ');

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
    expect(plat).toMatch(/Créer D’ABORD l’environnement `production`.{0,300}?`main`.{0,100}?PUIS seulement.{0,60}?six secrets/);
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

describe('docs/MISE-EN-LIGNE.md : points de la revue (round 1)', () => {
  const position = (fragment: string) => {
    const i = texte.indexOf(fragment);
    expect(i, fragment).toBeGreaterThan(-1);
    return i;
  };

  it('dossier privé ET dossier du limiteur créés en 0700 (les deux mkdir -m 700)', () => {
    expect(texte).toContain('mkdir -m 700 /home/compte/fan2harmonie-contact\n');
    expect(texte).toContain('mkdir -m 700 /home/compte/fan2harmonie-contact/limiteur');
    expect(texte).not.toMatch(/mkdir -m 700 -p/);
  });

  it('environnement `production` (titre) AVANT l’ajout des secrets (titre suivant)', () => {
    const environnement = position('### 5.3 Créer l’environnement `production`');
    const secrets = position('### 5.4 Ajouter les six secrets à l’environnement');
    expect(environnement).toBeLessThan(secrets);
    const liste = texte.slice(secrets, position('### 5.5 '));
    for (const s of ['SSH_HOST', 'SSH_USER', 'SSH_PORT', 'REMOTE_PATH', 'SSH_PRIVATE_KEY', 'SSH_KNOWN_HOSTS']) {
      expect(liste, s).toContain(`- \`${s}\` :`);
    }
  });

  it('configurations créées AVANT le premier déploiement, depuis les modèles du projet (scp), puis déploiement, puis vérifications', () => {
    const quatre = position('## 4. ');
    // Dans l'étape 4 elle-même (l'étape 3 emploie aussi l'expression, pour les lignes ajoutées à .htaccess).
    const flux = texte.indexOf('**AVANT le premier déploiement**', quatre);
    const copie = position('scp public/oauth/config.sample.php');
    const huit = position('## 8. ');
    const neuf = position('## 9. ');
    expect(quatre).toBeLessThan(flux);
    expect(flux).toBeLessThan(huit);
    expect(copie).toBeLessThan(huit);
    expect(huit).toBeLessThan(neuf);
    expect(texte).not.toMatch(/après le 1er déploiement/);
    // L'étape 8 rappelle que les configurations existent déjà.
    expect(texte.slice(huit, neuf)).toMatch(/oauth-config\.php/);
  });

  it('jetons : « Revoke all user tokens », le secret seul ne suffit pas, révocation immédiate en cas de doute', () => {
    expect(texte).toContain('« Revoke all user tokens »');
    expect(plat).toMatch(/ne rend PAS invalides les jetons déjà donnés/);
    expect(texte).toMatch(/aussitôt/);
  });

  it('portée réelle d’un jeton volé et recommandations (propriété du dépôt, compte dédié, GitHub App non testée)', () => {
    for (const fragment of [
      'pousser sur `main`',
      'du code sur l’hébergeur',
      'n’expire jamais',
      'rôle « Write », jamais « Admin »',
      'compte GitHub DÉDIÉ',
      'GitHub App',
      'non testé avec Sveltia CMS, à essayer à la mise en ligne',
      'liste d’empreintes',
    ]) {
      expect(plat, fragment).toContain(fragment);
    }
  });

  it('cookie __Host- et vérifications ajoutées au smoke test', () => {
    expect(texte).toContain('`__Host-fan2h_oauth_state`');
    expect(texte).not.toMatch(/(?<!__Host-)fan2h_oauth_state/);
    expect(texte).toContain('curl -sI https://fan2harmonie.fr/oauth/callback.php');
    expect(texte).toContain('display_errors');
    expect(texte).toMatch(/Settings > Applications/);
  });

  it('délai de mise en ligne : « quelques minutes », à mesurer', () => {
    expect(texte).toContain('quelques minutes');
    expect(texte).not.toMatch(/2 minutes|deux minutes/);
    expect(texte).toMatch(/mesurer/);
  });

  it('README : environnement avant les secrets, « quelques minutes » ; plan : Cloudflare marqué remplacé en ligne 7', () => {
    const readme = readFileSync(path.join(RACINE, 'README.md'), 'utf8');
    expect(readme).toContain('créer l’environnement `production` limité à `main` AVANT d’ajouter les secrets');
    expect(readme).not.toMatch(/2 minutes|deux minutes/);
    const plan = readFileSync(path.join(RACINE, 'docs/superpowers/plans/2026-10-04-fan2harmonie-site.md'), 'utf8').split('\n');
    expect(plan[6]).toContain('(remplacé : hébergement français, voir la note de mise à jour)');
  });
});

describe('docs/MISE-EN-LIGNE.md : commandes du relais OAuth (revue finale)', () => {
  it('jamais de HEAD (curl -I / -sI) sur auth.php ou callback.php, sauf quand 405 est le résultat attendu', () => {
    const lignes = texte.split('\n').filter((l) => /curl[^\n]*\s-s?I\b/.test(l) && /oauth\/(auth|callback)\.php/.test(l));
    for (const ligne of lignes) expect(ligne, ligne).toContain('405');
  });

  it('auth.php vérifié par un vrai GET : 302 et cookie __Host-', () => {
    const ligne = texte.split('\n').find((l) => l.includes('curl -s -D - -o /dev/null "$S/oauth/auth.php?provider=github"'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('302');
    expect(ligne).toContain('Set-Cookie: __Host-fan2h_oauth_state=');
  });
});

describe('docs : version de PHP et portée par défaut (revue finale)', () => {
  const readme = readFileSync(path.join(RACINE, 'README.md'), 'utf8');
  it('PHP ≥ 8.1.11, de préférence 8.3 ou plus récent ; plus jamais « PHP ≥ 8.1 » seul', () => {
    for (const doc of [texte, readme]) {
      expect(doc).not.toMatch(/PHP ≥ 8\.1(?!\.11)/);
      expect(doc).toContain('PHP ≥ 8.1.11');
    }
    expect(texte.replace(/\s+/g, ' ')).toContain('PHP ≥ 8.1.11, de préférence 8.3 ou plus récent (8.1 n’est plus maintenu en sécurité depuis fin 2025)');
  });

  it('portée : public_repo par défaut, repo seulement si le dépôt devient privé', () => {
    expect(texte).not.toMatch(/privé \(valeur par défaut du modèle\)/);
    expect(texte.replace(/\s+/g, ' ')).toMatch(/`public_repo`\*\* \(valeur par défaut du modèle\) tant que le dépôt est public/);
  });
});

describe('docs : procédure en cas de compromission et suites (revue finale, N1)', () => {
  const plat = texte.replace(/\s+/g, ' ');
  it('procédure complète : jetons, collaborateur, secret OAuth, clé SSH, secret du limiteur, mot de passe de la boîte, vérifications', () => {
    for (const fragment of [
      '« Revoke all user tokens »',
      'retirer le collaborateur',
      'nouveau `client_secret`',
      'nouvelle paire de clés',
      '`SSH_PRIVATE_KEY`',
      'nouveau `secret_limiteur`',
      'mot de passe de la boîte',
      '`~/.ssh/authorized_keys`',
      'crontab',
      '`fan2harmonie-contact/`',
      '`scripts/`, `package.json`, `public/**/*.php` et les `.htaccess`',
    ]) {
      expect(plat, fragment).toContain(fragment);
    }
  });

  it('un jeton sans la portée workflow ne modifie pas .github/workflows/, mais bien scripts/, package.json, PHP et .htaccess', () => {
    expect(plat).toMatch(/sans la portée `workflow`/);
    expect(plat).not.toMatch(/y compris `\.htaccess`, les scripts PHP et le workflow/);
  });

  it('suites : règles de poussée GitHub limitées aux contenus, application GitHub ; restriction rrsync facultative', () => {
    expect(plat).toContain('règles de poussée GitHub');
    expect(plat).toContain('`src/content/**` et `src/assets/actualites/**`');
    expect(plat).toMatch(/application GitHub à la place de l’OAuth App/i);
    expect(plat).toMatch(/rrsync/);
  });
});
