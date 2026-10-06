# Fan 2 Harmonie

Site vitrine de Fan 2 Harmonie (Qi Gong en plein air au parc de Rambouillet) : `https://fan2harmonie.fr`.
Stéphanie y gère elle-même ses rendez-vous, ses actualités et les textes des pages depuis `/admin`.

Tout tourne dans Docker : rien à installer sur le PC (seuls `docker` et `git` tournent sur l’hôte).

- Première fois, et après toute modification de `package.json` : `docker compose run --rm app npm install`
- Développement : `docker compose up`, puis http://localhost:4321
- Aperçu sous un sous-chemin (par exemple GitHub Pages, `https://<compte>.github.io/<dépôt>/`) :
  `docker compose run --rm -e ASTRO_BASE=/<dépôt>/ app npm run build`. `ASTRO_BASE` ne sert qu’à cet aperçu,
  jamais en production : le site de production est servi à la racine du domaine (`.htaccess`, `/api/`, `/oauth/`
  et `/admin/` supposent la racine) et le déploiement ne la pose jamais (`tests/unit/astro-base.test.ts`).

## Architecture

- **Site statique Astro 5** (TypeScript strict) : une page d’accueil défilante et les mentions légales. Les
  contenus (`src/content/` : rendez-vous, actualités, textes des pages) sont des fichiers validés par des schémas
  Zod (`src/lib/schemas.ts`) ; les rendez-vous passés disparaissent à chaque construction.
- **Hébergeur 100 % français** (PHP ≥ 8.1, Apache ou LiteSpeed lisant `.htaccess`, SSH) : il sert `dist/`, le
  script du formulaire de contact (`public/api/`) et le relais de connexion GitHub de l’administration
  (`public/oauth/`). Ni Cloudflare ni Formspree ni autre service tiers ne sont utilisés : aucune donnée de visiteur ne
  quitte la France.
- **GitHub** : code et contenu public, construction et mise en ligne par GitHub Actions
  (`.github/workflows/deploiement.yml` : construction sans secret, puis copie rsync sur SSH depuis l’environnement
  `production`, à chaque modification de `main` et chaque nuit).
- **Administration** : Sveltia CMS sous `/admin` (`public/admin/config.yml`), qui enregistre dans le dépôt
  GitHub ; le site est reconstruit et republié en quelques minutes (délai à mesurer à la première mise en ligne).
- **Règles du serveur** : `public/.htaccess` (HTTPS, domaine canonique, en-têtes de sécurité, cache, refus des
  fichiers sensibles en plusieurs couches, page 404), `public/api/.htaccess`, `public/oauth/.htaccess`
  (`AcceptPathInfo Off` seulement), `public/api/lib/.htaccess` et `public/oauth/lib/.htaccess` (tout refusé),
  `public/api/.user.ini`. RÈGLE : aucun `.htaccess` de sous-dossier ne contient de directive `Rewrite…` (il
  remplacerait les règles de la racine et leurs refus disparaîtraient en silence).

## Tests

Commandes à lancer depuis le PC (forme Docker) ; les alias `npm run …` sont donnés entre parenthèses.

| Suite | Commande |
|---|---|
| Unitaires (Vitest, `tests/unit/`) | `docker compose run --rm app npm test` |
| Bout en bout (Playwright, `tests/e2e/`, y compris le vrai Sveltia CMS ; Internet requis pour ses textes et polices) | `docker compose run --rm app npm run test:e2e` |
| PHP 8.3 (formulaire et relais OAuth, `tests/php/`) | `docker compose run --rm php php tests/php/run.php` (`npm run test:php`) |
| PHP 8.1 | `docker compose run --rm php81 php tests/php/run.php` (`npm run test:php81`) |
| Vrai Apache (quatre serveurs : normal, sans mod_rewrite, sans mod_headers, sans les refus mod_rewrite), après `npm run build` | commande Docker complète du script `test:apache` de `package.json` (`npm run test:apache`) |
| Lighthouse (mobile, 3 passages, seuils 0,95) | `docker compose run --rm app npm run lighthouse` |
| Types Astro | `docker compose run --rm app npm run check` |
| Garde-fou de mise en ligne (échoue tant qu’une valeur provisoire subsiste) | `docker compose run --rm app npm run verifier:mise-en-ligne` |

- Jeux de contenus de test : `tests/fixtures/content/<jeu>/` (dates 2099 = à venir, 2020 = passées), construits
  dans `dist-fixture-<jeu>/` et servis sur les ports de `tests/fixtures/jeux.ts` ; le vrai contenu reste sur
  `dist/` et le port 4321.
- Lighthouse construit le site dans `dist-audit/` avec `AUDIT_SITE_URL=http://localhost:4400`, variable posée
  uniquement par `scripts/lighthouse.mjs` : ne JAMAIS la définir chez l’hébergeur ni dans le déploiement.
- Les tests PHP n’ont pas de réseau : le relais OAuth y parle à un faux GitHub local (`php -S`). Le test de bout
  en bout de `/admin` simule GitHub et le relais (`tests/fixtures/oauth/page-succes.html`, page produite par la
  bibliothèque du relais et vérifiée par les tests PHP).
- Les tests de `/admin` dépendent des libellés de l’interface Sveltia (« Parcourir », « Enregistrer »…) : à revoir
  à chaque nouvelle version de `@sveltia/cms` (version exacte épinglée dans `package.json`).

## Mise en ligne

- **Checklist complète et ordonnée** (domaine, DNS, boîtes mail, réglages PHP, dossiers du serveur, GitHub et ses
  secrets d’environnement, application OAuth, premier déploiement, vérifications, retour arrière, points
  juridiques, risques restants) : [`docs/MISE-EN-LIGNE.md`](docs/MISE-EN-LIGNE.md).
- GitHub : créer l’environnement `production` limité à `main` AVANT d’ajouter les secrets, qui sont des secrets
  d’environnement (jamais des secrets de dépôt) ; détail à l’étape 5 de la checklist.
- **Guide de Stéphanie** pour l’administration : [`docs/GUIDE-STEPHANIE.md`](docs/GUIDE-STEPHANIE.md).
- Revenir en arrière : durablement par `git revert` sur `main` ; en urgence, lancement manuel du déploiement
  depuis `main` avec `ref` = SHA complet d’un ancien commit (provisoire : écrasé au prochain push ou la nuit).

## Formulaire de contact (PHP)

- `public/api/contact.php` (logique dans `public/api/lib/contact.php`) envoie un e-mail à
  `contact@fan2harmonie.fr` par la messagerie de l’hébergeur ; limiteur par adresse IP (empreinte HMAC, une
  heure) et global (20 messages par heure).
- Configuration `config.php` créée sur le serveur à partir de `public/api/config.sample.php` (refusé tel quel),
  de préférence dans `<compte>/fan2harmonie-contact/`, hors de la racine web ; sinon la variable
  `FAN2HARMONIE_CONFIG`, ou `api/config.php` en dernier recours. Jamais versionnée.
- Exigences : PHP ≥ 8.1, extensions mbstring, ctype, filter, json, hash, PCRE (UTF-8), `posix` recommandée,
  `mail()` acceptant `-f`, dossier privé du limiteur (0700, hors racine web, jamais `/tmp`).

## Administration

- Adresse : `https://fan2harmonie.fr/admin` (Sveltia CMS, en français si le navigateur l’est) : rendez-vous,
  actualités (photo facultative, réduite et convertie en WebP), textes des pages. Accès : les collaborateurs du
  dépôt GitHub, en double authentification.
- **Relais de connexion GitHub en PHP** (`public/oauth/`), servi par le site lui-même : `config.yml` a
  `base_url: https://fan2harmonie.fr` et `auth_endpoint: oauth/auth.php`.
  - `auth.php` tire un `state` aléatoire, le pose dans le cookie `__Host-fan2h_oauth_state`
    (`HttpOnly; Secure; SameSite=Lax`, `Path=/`, 10 minutes) et redirige vers GitHub avec les seules valeurs de la configuration ;
  - `callback.php` vérifie le `state` (comparaison en temps constant), échange le code par cURL (TLS vérifié,
    HTTPS seul, sans redirection) et rend une page à CSP « nonce » qui transmet le jeton à `/admin` par
    `postMessage`, vers l’origine autorisée exacte, selon le protocole de Sveltia ;
  - logique et tests : `public/oauth/lib/oauth.php`, `tests/php/tests/oauth*.php` ; le jeton n’apparaît jamais dans
    une adresse, un journal, un cookie ni un fichier ;
  - configuration (`client_id`, `client_secret` de l’application OAuth GitHub, portée `repo` ou `public_repo`) :
    `oauth-config.php` créé sur le serveur à partir de `public/oauth/config.sample.php` (refusé tel quel), de
    préférence dans `<compte>/fan2harmonie-contact/` ; sinon `FAN2HARMONIE_OAUTH_CONFIG` ou `oauth/config.php`.
- `repo` : dépôt GitHub du site, `faresinside/fan2harmonie` (public). Portée de l’application OAuth :
  `public_repo` tant que le dépôt est public (voir `docs/MISE-EN-LIGNE.md`).
- Le script du CMS est copié dans `public/admin/` par `npm install`/`npm ci` (postinstall), `npm run dev` et
  `npm run build` : la construction doit toujours passer par `npm run build`.

## En-têtes HTTP : CSP complète (plus tard)

Aujourd’hui : CSP partielle (`base-uri`, `form-action`, `frame-ancestors`, `object-src`) dans `public/.htaccess` ;
les pages du formulaire et du relais OAuth ont leur propre CSP stricte. À faire : empreintes (`'sha256-…'`) des deux
scripts en ligne des pages (menu de `src/components/Header.astro`, formulaire `src/scripts/contact.ts`) et
`connect-src 'self'` ; `/admin` demandera sa propre politique (unpkg.com, cdn.jsdelivr.net, api.github.com).
