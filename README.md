# Fan 2 Harmonie

Tout tourne dans Docker (rien à installer sur le PC).

- Première fois : `docker compose run --rm app npm install`
- Après toute modification de `package.json` : relancer `docker compose run --rm app npm install`
- Tests unitaires : `docker compose run --rm app npm test`
- Tests E2E : `docker compose run --rm app npm run test:e2e`
  - Les rendez-vous et actualités de test sont dans `tests/fixtures/content/<jeu>/` (dates 2099 = à venir, 2020 = passées).
    Playwright construit chaque jeu avec `CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>` dans `dist-fixture-<jeu>/`
    et le sert sur le port indiqué dans `tests/fixtures/jeux.ts` (4322 et suivants) ; le vrai contenu reste sur `dist/` et le port 4321.
- Portes de qualité :
  - `npm run test:e2e` inclut `tests/e2e/quality.spec.ts` : axe (WCAG 2.x A/AA et bonnes pratiques) à 360, 768 et 1280 px, clavier et focus visible, aucun débordement de 320 à 1920 px, mouvement réduit, `robots.txt` et plan du site.
  - Lighthouse : `docker compose run --rm app npm run lighthouse` (`lighthouserc.json`) construit le site dans `dist-audit/` puis audite `/` et `/mentions-legales/` en mobile, 3 passages chacun, avec le Chromium de l'image Playwright.
    Échec si une catégorie (performance, accessibilité, bonnes pratiques, SEO) est sous 0,95, ou si LCP > 2,5 s, CLS > 0,1, TBT > 200 ms. Rapports : `.lighthouseci/rapports/`.
  - Pour l'audit seulement, `AUDIT_SITE_URL=http://localhost:4400` remplace l'adresse du site (canonique, plan du site, `robots.txt`) ; c'est une variable d'environnement, jamais écrite dans `src/config/site.ts`.
    Elle est posée uniquement par `scripts/lighthouse.mjs` : ne JAMAIS la définir chez l'hébergeur ni dans le workflow de déploiement, sinon le site publié aurait une canonique et un plan du site faux.
- Développement : `docker compose up`, puis http://localhost:4321

## Formulaire de contact (PHP)

- Le formulaire est reçu par `public/api/contact.php` (logique dans `public/api/lib/contact.php`) sur l'hébergement PHP du site, qui envoie un e-mail à `contact@fan2harmonie.fr` : aucune donnée de visiteur ne passe par un service tiers ni ne quitte l'hébergeur français.
- Tests PHP (dans Docker, sans réseau), sur PHP 8.3 et 8.1 : `docker compose run --rm php php tests/php/run.php` et `docker compose run --rm php81 php tests/php/run.php` (alias `npm run test:php` / `npm run test:php81` là où `docker` est disponible). `npm test` (conteneur `app`) n'a pas besoin de PHP.
- Configuration : `config.php`, créé sur le serveur par la propriétaire ou son technicien à partir de `public/api/config.sample.php` (copié tel quel, il est refusé : `dossier_limiteur` et `secret_limiteur` sont à renseigner). Emplacement recommandé : `<compte>/fan2harmonie-contact/config.php`, dossier voisin de la racine web, donc hors de celle-ci ; sinon la variable d'environnement `FAN2HARMONIE_CONFIG` (cherchée en premier) ou, en dernier recours, `api/config.php`. Jamais versionné (`.gitignore`) ; sans lui, le formulaire répond « Configuration manquante ».
- Exigences de l'hébergement : PHP ≥ 8.1 avec les extensions mbstring, ctype, filter, json, hash et PCRE (UTF-8) ; extension `posix` RECOMMANDÉE (pas exigée : sans elle, le compte du processus PHP est lu sur un petit fichier sonde créé puis supprimé dans le dossier du limiteur) ; une fonction `mail()` qui accepte l'option `-f` ; un dossier privé pour le limiteur (`dossier_limiteur`) : hors de la racine web, pas `/tmp`, vrai dossier (pas un lien symbolique), appartenant au compte sous lequel PHP s'exécute, droits 0700 (jamais inscriptible par le groupe ou les autres). Secret `secret_limiteur` : `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`. Si une exigence manque, le script répond 500 et note seulement le nom de ce qui manque dans le journal d'erreurs.

## Hébergement et mise en ligne

- Tout est servi par un hébergeur 100 % français (PHP ≥ 8.1, Apache ou LiteSpeed lisant `.htaccess`, SSH) : les pages statiques (`dist/`) et le script de contact (`api/contact.php`). Ni Cloudflare ni service tiers : aucune donnée de visiteur ne quitte la France. GitHub ne sert qu'au contenu public et à la construction.
- `.github/workflows/deploiement.yml` : à chaque modification de `main`, chaque nuit (les rendez-vous passés disparaissent) ou à la main (champ `ref` = SHA d'un ancien commit pour revenir en arrière) : tests unitaires, garde-fou `npm run verifier:mise-en-ligne` (bloque tant qu'une valeur provisoire subsiste), construction, puis copie de `dist/` par rsync sur SSH. Les fichiers propres au serveur (`api/config.php`, `error_log`, `.well-known/`, `cgi-bin/`, `oauth/config.php`, `.htpasswd`, `.user.ini` de la racine) ne sont jamais écrasés ni supprimés.
- Secrets GitHub à créer (noms seulement, valeurs jamais dans le dépôt) : `SSH_HOST`, `SSH_USER`, `SSH_PORT` (22 si vide), `REMOTE_PATH` (racine web sur le serveur), `SSH_PRIVATE_KEY` (clé dédiée au déploiement), `SSH_KNOWN_HOSTS` (empreinte du serveur, vérifiée).
- Règles du serveur : `public/.htaccess` (HTTPS et domaine canonique, en-têtes de sécurité, cache, compression, refus des fichiers sensibles, page 404 pour 403 et 404) et `public/api/.htaccess` (32 Ko au plus, seul `contact.php` exécutable) ; réglages PHP dans `public/api/.user.ini`. Le domaine écrit dans `.htaccess` doit être celui de `site.url` (`tests/unit/htaccess.test.ts`).
- Vérification sur un vrai Apache (PHP 8.3) dans Docker, après `npm run build` : `npm run test:apache`, c'est-à-dire `docker compose --profile apache up --build --force-recreate --attach apache-tests --abort-on-container-exit --exit-code-from apache-tests apache apache-sans-rewrite apache-sans-headers apache-tests` (`tests/apache/run.sh` : redirections, en-têtes exacts, refus, page 404, vrai envoi du formulaire). Différences possibles avec LiteSpeed : à revérifier sur l'hébergement réel.

## En-têtes HTTP : CSP complète (plus tard)

- Aujourd'hui : CSP partielle (`base-uri`, `form-action`, `frame-ancestors`, `object-src`) dans `public/.htaccess`. À faire plus tard (hash des scripts en ligne) : les pages construites contiennent deux scripts en ligne : le menu (`src/components/Header.astro`, `is:inline`) et le formulaire de contact (`src/scripts/contact.ts`, qu'Astro insère dans la page en `type="module"`). Une `Content-Security-Policy` devra autoriser leurs empreintes (`'sha256-…'`, recalculées à chaque construction) et `connect-src 'self'` (le formulaire écrit à `/api/contact.php`, même origine) ; `/admin` (Sveltia charge des ressources depuis unpkg.com, cdn.jsdelivr.net, api.github.com) demandera sa propre politique.

## Administration

- Adresse : `/admin` (Sveltia CMS, en français si le navigateur l'est). Rendez-vous, actualités (photo facultative) et textes des pages.
- Connexion avec un compte GitHub ayant accès au dépôt (collaborateurs du dépôt) ; chaque enregistrement est un commit, le site se reconstruit seul.
- Configuration : `public/admin/config.yml` ; `repo` et `base_url` (relais d'authentification) valent `À_COMPLÉTER` jusqu'à la mise en ligne.
- Le script du CMS (version exacte épinglée dans `package.json`, non versionné) est copié dans `public/admin/` par `npm install` / `npm ci` (postinstall), `npm run dev` et `npm run build`. La commande de construction (workflow de déploiement) doit donc être `npm run build` (pas `astro build` seul).
- Les tests e2e de `/admin` (vrai Sveltia CMS) ont besoin d'Internet (textes français sur unpkg.com, polices sur cdn.jsdelivr.net) et dépendent des libellés de l'interface Sveltia (« Parcourir », « Téléverser », « Insérer », « Enregistrer ») : à revoir à chaque nouvelle version de `@sveltia/cms`.
- En local, sur http://localhost:4321/admin, « Travailler avec un dépôt local » édite directement les fichiers du projet (Chrome ou Edge, une fois `repo` renseigné).
