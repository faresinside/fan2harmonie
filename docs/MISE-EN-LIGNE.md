# Mise en ligne de fan2harmonie.fr — checklist

Pour le technicien qui met le site en ligne, avec la propriétaire, Stéphanie Gabalda. Les étapes sont à suivre
**dans l’ordre**. Ce document ne contient aucune valeur secrète : les secrets (clé SSH, secret de l’application
GitHub, secret du limiteur) ne s’écrivent qu’aux endroits indiqués, jamais dans le dépôt, jamais par courriel.

Rappel de l’architecture :

- **Hébergeur 100 % français** (PHP ≥ 8.1.11, Apache ou LiteSpeed lisant les `.htaccess`, SSH, cron, boîtes mail) :
  il sert les pages (dossier `dist/` construit), le script du formulaire (`/api/contact.php`) et le relais de
  connexion GitHub de l’administration (`/oauth/auth.php` et `/oauth/callback.php`).
- **GitHub** : le code et le contenu PUBLIC du site (textes, rendez-vous, actualités, photos publiées), la
  construction et la mise en ligne automatique (GitHub Actions → rsync sur SSH).
- **Aucune donnée de visiteur ne quitte la France.** Ni Cloudflare ni Formspree ne sont utilisés : ils ne
  figurent plus nulle part dans le site.

---

## 0. Prérequis et coûts

- **Nom de domaine** `fan2harmonie.fr` : environ 10 € par an chez un bureau d’enregistrement (souvent l’hébergeur
  lui-même).
- **Hébergement mutualisé français** avec : PHP ≥ 8.1.11 choisi par compte, accès SSH (clé), fichiers `.htaccess`,
  `.user.ini`, tâches cron, au moins une boîte mail sur le domaine, certificat TLS gratuit (Let’s Encrypt).
- **Un compte GitHub pour Stéphanie** (gratuit, DÉDIÉ au site : voir l’étape 6), protégé par la **double
  authentification (2FA)** ; idem pour
  toute personne qui modifiera le site.
- Rien d’autre : ni Cloudflare, ni Formspree, ni service d’envoi de courriels tiers (aucun abonnement).

Ce que voit chaque service extérieur :

| Service | Ce qu’il voit |
|---|---|
| Hébergeur français | Tout le site, les journaux de connexion (adresses IP des visiteurs), les messages du formulaire, la boîte mail, les fichiers de configuration privés. |
| Bureau d’enregistrement | Le nom de domaine et les coordonnées de la titulaire. |
| GitHub (entreprise américaine) | Le code, les textes, rendez-vous, actualités et photos publiés (déjà publics sur le site), l’historique des modifications, les comptes des éditrices et leurs adresses IP quand elles utilisent `/admin`, les secrets de déploiement (chiffrés). **Aucune donnée de visiteur.** |
| unpkg.com, cdn.jsdelivr.net, githubstatus.com | Seulement depuis le navigateur de l’éditrice, quand elle ouvre `/admin` : l’outil Sveltia CMS y charge ses textes français, ses polices et l’état de GitHub. Les visiteurs du site ne chargent rien chez eux. |
| OpenStreetMap | Rien, sauf si un visiteur clique lui-même sur le lien « carte ». |

## 1. Nom de domaine et DNS

1. Dans la zone DNS du domaine :
   - `fan2harmonie.fr` : enregistrement **A** (et **AAAA** si l’hébergeur a une adresse IPv6) vers le serveur de
     l’hébergeur (valeurs données par l’hébergeur) ;
   - `www.fan2harmonie.fr` : **CNAME** vers `fan2harmonie.fr` (ou les mêmes A/AAAA). Le site redirige `www` vers
     `https://fan2harmonie.fr` (une seule adresse canonique).
2. **Certificat TLS** (Let’s Encrypt dans le panneau de l’hébergeur) couvrant **les deux noms**,
   `fan2harmonie.fr` ET `www.fan2harmonie.fr`, avec **renouvellement automatique** activé.
3. **HSTS** : le site envoie `Strict-Transport-Security: max-age=31536000` (un an, sans sous-domaines). Une fois
   qu’un navigateur a vu le site, il refusera pendant un an toute connexion non chiffrée : le certificat doit donc
   toujours être valide (vérifier le renouvellement automatique). Les sous-domaines (webmail…) ne sont pas
   concernés.
4. **Avant que le DNS pointe vers l’hébergeur** (ou pendant la propagation), tester avec le vrai nom : la règle
   de nom canonique de `.htaccess` redirige TOUT autre nom (adresse provisoire du panneau, adresse IP…) vers
   `https://fan2harmonie.fr`. Commande :

   ```sh
   curl --resolve fan2harmonie.fr:443:<adresse IP du serveur> -sI https://fan2harmonie.fr/
   ```

   (ou une ligne `<adresse IP du serveur> fan2harmonie.fr` dans le fichier `hosts` du PC, à retirer ensuite).

## 2. Boîtes mail et authentification du domaine

1. Créer la boîte **`contact@fan2harmonie.fr`** (celle qui reçoit les messages du formulaire et que Stéphanie
   lit) et **`site@fan2harmonie.fr`** (expéditeur technique du formulaire ; une simple boîte ou un alias vers
   `contact@`).
2. Enregistrements DNS d’authentification du courrier (valeurs exactes données par l’hébergeur) :
   - **SPF** (TXT sur `fan2harmonie.fr`) autorisant les serveurs d’envoi de l’hébergeur ;
   - **DKIM** (TXT ou CNAME fourni par l’hébergeur), activé dans le panneau ;
   - **DMARC** (TXT sur `_dmarc.fan2harmonie.fr`), par exemple d’abord en `p=none` avec une adresse de rapports,
     puis `p=quarantine` quand tout est conforme.
3. **Quota d’envoi** : vérifier le nombre maximal de courriels par heure autorisé par l’hébergeur. Le
   formulaire en envoie au plus **20 messages par heure** au total (limiteur, `limite_globale_par_heure`) : le
   quota de l’hébergeur doit être supérieur.

## 3. Réglages de l’hébergement

1. **PHP ≥ 8.1.11, de préférence 8.3 ou plus récent (8.1 n’est plus maintenu en sécurité depuis fin 2025)**,
   réglé dans le panneau. En dessous, les scripts répondent par une erreur 500 générique (détail dans le journal).
2. **Extensions PHP** : `mbstring`, `ctype`, `json`, `hash`, `filter`, `curl`, `pcre` (avec UTF-8) ;
   **`posix` recommandée**. Sans une extension exigée, le script concerné répond par une page ou un message
   d’erreur 500 générique et note seulement le nom de ce qui manque dans le journal d’erreurs.
3. **Gestionnaire PHP** de type **PHP-FPM ou LSAPI** (pas mod_php), pour que `api/.user.ini` (limites de taille)
   soit appliqué. Avec mod_php, les autres couches (Apache, script) suffisent, mais `.user.ini` est ignoré.
4. **`.htaccess` autorisés** (`AllowOverride`) : FileInfo (réécriture, en-têtes, types, pages d’erreur,
   `AcceptPathInfo`), AuthConfig (`Require`), Indexes (`DirectoryIndex`), Options (`Options -Indexes -MultiViews`,
   MultiViews compris) et, pour `LimitRequestBody` et `ServerSignature`, All. Le réglage habituel des hébergements
   mutualisés (`AllowOverride All`) convient. Si une directive est interdite, le serveur répond 500 partout :
   c’est voulu (jamais de site sans ses protections), à corriger avant l’ouverture.
5. **Lignes ajoutées par l’hébergeur** : certains panneaux écrivent dans le `.htaccess` de la racine (par
   exemple le choix de la version de PHP, `AddHandler …`). **Chaque déploiement remplace ce fichier** par
   `public/.htaccess` : AVANT le premier déploiement, copier ces lignes dans `public/.htaccess` (en tête de
   fichier, avec un commentaire), relancer `npm run test:apache` puis les publier. Le `.user.ini` de la racine,
   lui, n’est jamais touché par le déploiement.

## 4. Dossiers sur le serveur

Exemple de compte : `/home/compte/` avec la racine web `/home/compte/www/` (noms à adapter).

1. **Racine web** = la valeur du secret `REMOTE_PATH` : chemin **absolu** d’au moins trois éléments (ex.
   `/home/compte/www`). Y créer à la main, une fois, le **fichier VIDE** `.fan2harmonie-site` (un fichier, pas
   un dossier ni un lien symbolique) :

   ```sh
   touch /home/compte/www/.fan2harmonie-site
   ```

   C’est le fichier témoin : sans lui, le déploiement s’arrête sans rien copier ni supprimer.
2. **Dossier privé** voisin de la racine web (même dossier parent), donc HORS de la racine web :
   `/home/compte/fan2harmonie-contact/`, droits `0700`. Il est créé, avec ses deux fichiers de configuration,
   **AVANT le premier déploiement** (seul déroulement retenu ici) : les modèles viennent du projet (copie par
   `scp` ou SFTP depuis le PC du technicien), pas de la racine web, qui est encore vide. Il contient :
   - `config.php` (droits `0600`), copie adaptée de `api/config.sample.php` : `destinataire`
     (`contact@fan2harmonie.fr`), `expediteur` (`site@fan2harmonie.fr`), `origines_autorisees`,
     `dossier_limiteur` (le dossier ci-dessous), `secret_limiteur` généré sur le serveur avec

     ```sh
     php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
     ```

     et collé dans le fichier (jamais ailleurs), et **`'transport_test' => false`** ;
   - `oauth-config.php` (droits `0600`), copie adaptée de `oauth/config.sample.php` : `client_id` et
     `client_secret` y sont saisis à l’étape 6 (toujours avant le premier déploiement), `scope` selon l’étape 6,
     `'transport_test' => false` ;
   - `limiteur/` (droits `0700`) : dossier du limiteur du formulaire. Il doit appartenir au compte sous lequel
     PHP s’exécute (en FPM/LSAPI, c’est en général le compte lui-même : sinon, demander à l’hébergeur), ne jamais
     être ouvert en écriture au groupe ou aux autres, ne jamais être `/tmp`, ni un lien symbolique.

   Le script cherche donc `fan2harmonie-contact/config.php` et le relais `fan2harmonie-contact/oauth-config.php`
   à côté de la racine web (emplacements recommandés ; voir les modèles pour les autres emplacements possibles).
   Commandes, sur le serveur (les DEUX dossiers en `0700`) :

   ```sh
   mkdir -m 700 /home/compte/fan2harmonie-contact
   mkdir -m 700 /home/compte/fan2harmonie-contact/limiteur
   ```

   Puis, depuis le dossier du projet sur le PC du technicien (copie des modèles du projet) :

   ```sh
   scp public/api/config.sample.php compte@<serveur SSH>:/home/compte/fan2harmonie-contact/config.php
   scp public/oauth/config.sample.php compte@<serveur SSH>:/home/compte/fan2harmonie-contact/oauth-config.php
   ```

   Enfin, sur le serveur : `chmod 600` des deux fichiers, puis les compléter (`nano` ou l’éditeur du panneau) :

   ```sh
   chmod 600 /home/compte/fan2harmonie-contact/config.php /home/compte/fan2harmonie-contact/oauth-config.php
   ls -ld /home/compte/fan2harmonie-contact /home/compte/fan2harmonie-contact/limiteur   # drwx------ attendu
   ```

   Copiés tels quels, les deux modèles sont **refusés** (page d’erreur générique) : ils doivent être complétés.

## 5. GitHub : dépôt, environnement, secrets, clé de déploiement

### 5.1 Dépôt

Dépôt `faresinside/fan2harmonie` (déjà renseigné dans `public/admin/config.yml`), branche par défaut **`main`**.
Il **appartient au technicien (ou à une organisation)** ; Stéphanie y est collaboratrice avec le rôle « Write »,
jamais « Admin » (voir l’étape 6). Il est aujourd’hui **public** : portée `public_repo` (étape 6) ; GitHub
désactive les tâches planifiées d’un dépôt public après 60 jours sans activité (étape 13). Un dépôt privé
demanderait la portée `repo`.

### 5.2 Double authentification

Obligatoire pour chaque collaborateur (Settings > Password and authentication).

### 5.3 Créer l’environnement `production`

Créer D’ABORD l’environnement `production` (Settings > Environments > New environment), régler « Deployment
branches and tags » sur « Selected branches » avec la seule branche `main`, PUIS seulement y ajouter les six
secrets (étape 5.4), comme secrets **de l’environnement** (« Environment secrets »).

### 5.4 Ajouter les six secrets à l’environnement

Dans Settings > Environments > `production` > « Environment secrets » :

   - `SSH_HOST` : nom du serveur SSH (lettres, chiffres, `.`, `_`, `-`) ;
   - `SSH_USER` : compte SSH ;
   - `SSH_PORT` : port SSH (vide = 22) ;
   - `REMOTE_PATH` : chemin absolu de la racine web (étape 4) ;
   - `SSH_PRIVATE_KEY` : clé privée dédiée au déploiement (ci-dessous) ;
   - `SSH_KNOWN_HOSTS` : empreinte(s) du serveur (ci-dessous).
### 5.5 Aucun secret au niveau du dépôt

**Supprimer tout secret de même nom au niveau du dépôt** (Settings > Secrets and variables > Actions >
   « Repository secrets ») : un secret de dépôt est lisible par un workflow lancé depuis n’importe quelle
   branche, donc par toute personne qui peut pousser une branche (ou un compte volé), qui pourrait envoyer la clé
   SSH ailleurs ; un secret d’environnement limité à `main` ne l’est pas.
### 5.6 Clé SSH de déploiement et empreinte du serveur

**Clé SSH de déploiement** dédiée, sans phrase de passe, générée sur le PC du technicien :

   ```sh
   ssh-keygen -t ed25519 -C "deploiement fan2harmonie" -N "" -f fan2harmonie-deploiement
   ```

   - la clé **publique** (`fan2harmonie-deploiement.pub`) va dans `~/.ssh/authorized_keys` du compte de
     l’hébergeur, si possible précédée de l’option `restrict` (ni terminal, ni redirection de ports) ; une
     restriction plus forte (`rrsync`, `command=`) est possible si l’hébergeur la permet, mais doit être essayée
     à la main avant (les chemins y deviennent relatifs au dossier autorisé) ;
   - facultatif, restriction `rrsync` : ligne `command="rrsync /home/compte/www",restrict ssh-ed25519 <clé
     publique> deploiement fan2harmonie` dans `authorized_keys`. La clé ne peut plus alors que lire et écrire
     sous la racine web ; le workflow, qui donne des chemins absolus (`REMOTE_PATH`), doit être essayé à la main
     avec cette restriction avant de l’adopter (non testé ici) ;
   - la clé **privée** est collée dans le secret `SSH_PRIVATE_KEY`, puis le fichier local est effacé.

**`SSH_KNOWN_HOSTS`** : la ligne `known_hosts` du serveur, **vérifiée** contre l’empreinte publiée par
   l’hébergeur (documentation ou support) — jamais un `ssh-keyscan` accepté les yeux fermés :

   ```sh
   ssh-keyscan -p <port> <serveur SSH> > known_hosts.tmp
   ssh-keygen -lf known_hosts.tmp      # comparer l’empreinte affichée avec celle publiée par l’hébergeur
   ```

   Pour un port autre que 22, la ligne commence par `[serveur]:port` (forme produite par `ssh-keyscan -p`).

## 6. GitHub : application OAuth pour la connexion à `/admin`

L’administration (`/admin`, Sveltia CMS) se connecte à GitHub par le relais PHP du site lui-même :
`https://fan2harmonie.fr/oauth/auth.php` (configuré dans `public/admin/config.yml`, `base_url` et
`auth_endpoint`).

1. Sur le compte GitHub du technicien (ou de l’organisation) propriétaire du dépôt : Settings > Developer
   settings > OAuth Apps > New OAuth App :
   - Application name : par exemple « Fan 2 Harmonie — administration » ;
   - Homepage URL : `https://fan2harmonie.fr` ;
   - Authorization callback URL : **exactement** `https://fan2harmonie.fr/oauth/callback.php` ;
   - « Enable Device Flow » : non coché.
2. Noter le **Client ID**, puis « Generate a new client secret ». Les deux valeurs vont **uniquement** dans
   `/home/compte/fan2harmonie-contact/oauth-config.php` sur le serveur (`client_id`, `client_secret`), saisies
   directement en SSH : jamais dans le dépôt, jamais dans un courriel ou une messagerie.
3. Portée (`scope` dans `oauth-config.php`) : **`public_repo`** (valeur par défaut du modèle) tant que le dépôt
   est public (cas actuel), **`repo`** seulement s’il devient privé. Les autres réglages du modèle (`origines_autorisees`, `url_callback`) ont
   déjà les bonnes valeurs ; les adresses de GitHub ne doivent jamais être changées.
4. **Qui peut modifier le site** : les collaborateurs du dépôt (Settings > Collaborators), avec le rôle
   « Write », jamais « Admin », et eux seuls. Ce sont les éditrices ; chacune a la double authentification.
5. **Révoquer** : changer le secret (« Generate a new client secret », nouvelle valeur dans `oauth-config.php`,
   ancienne supprimée) ne rend PAS invalides les jetons déjà donnés aux éditrices. Pour les couper, utiliser
   aussi « Revoke all user tokens » dans les réglages de l’application OAuth.

   **Procédure complète si un jeton, un ordinateur d’éditrice ou un compte GitHub est soupçonné compromis**
   (un jeton volé peut avoir servi à faire exécuter du code sur l’hébergeur, voir le point 6), aussitôt et
   dans cet ordre :
   1. « Revoke all user tokens » dans l’application OAuth ;
   2. retirer le collaborateur du dépôt (Settings > Collaborators) le temps de remettre son compte en ordre ;
   3. générer un nouveau `client_secret` et le mettre dans `oauth-config.php` (l’ancien supprimé) ;
   4. créer une nouvelle paire de clés de déploiement (étape 5.6), mettre la nouvelle clé privée dans
      `SSH_PRIVATE_KEY` et ne garder que la nouvelle clé publique dans `~/.ssh/authorized_keys` ;
   5. générer un nouveau `secret_limiteur` (même commande qu’à l’étape 4) et changer le mot de passe de la
      boîte mail (et celui du compte de l’hébergeur) ;
   6. vérifier sur le serveur `~/.ssh/authorized_keys` (aucune clé inconnue), la crontab (`crontab -l`), les
      fichiers hors de la racine web (`fan2harmonie-contact/`, dossier du compte) et la racine web ;
   7. relire l’historique de `main` (commits récents) pour `scripts/`, `package.json`, `public/**/*.php` et les `.htaccess` ;
      annuler toute modification suspecte par `git revert`, puis redéployer.
6. **Ce que permet un jeton volé (à lire).** Le jeton d’une éditrice (portée `public_repo` ou `repo`) n’expire
   jamais avec une application OAuth. Avec lui, un attaquant peut pousser sur `main`. Un jeton sans la portée
   `workflow` (cas de ce relais) ne peut pas modifier `.github/workflows/`, mais il peut modifier `scripts/`,
   `package.json` (lancés par la construction), les scripts PHP et les `.htaccess` : le déploiement publie
   alors du code sur l’hébergeur, d’où il peut lire le secret de l’application OAuth et la configuration du
   formulaire.
   Recommandations, dans l’ordre :
   1. le dépôt appartient au technicien ou à une organisation ; Stéphanie y a le rôle « Write », jamais
      « Admin » ;
   2. l’éditrice se connecte à `/admin` avec un compte GitHub DÉDIÉ au site (aucun autre dépôt, double
      authentification) ;
   3. amélioration à évaluer plus tard : remplacer l’application OAuth par une GitHub App installée sur ce seul
      dépôt (Contents en lecture-écriture, Metadata en lecture ; jetons d’utilisateur valables 8 heures) —
      non testé avec Sveltia CMS, à essayer à la mise en ligne ;
   4. limite connue : l’accès en écriture à `main` suffit à changer les fichiers exécutés sur le serveur. Une
      liste d’empreintes des fichiers autorisés dans le workflow ne protégerait pas les scripts que ce même
      workflow exécute ; elle n’est donc pas mise en place. Seules des éditrices de confiance ont l’accès.

## 7. Valeurs définitives dans le projet

1. `src/config/site.ts` :
   - `hebergeur.nom`, `hebergeur.adresse`, `hebergeur.siteWeb` (adresse `https://…`) : vraies valeurs de
     l’hébergeur (mentions légales) ;
   - `siret` : le vrai SIRET de Stéphanie si elle en a un, sinon `null` (la ligne disparaît et le statut affiché
     change, voir l’étape 11). L’exemple `123 456 789 00012` **bloque la mise en ligne** ;
   - `ville` : facultative (`null` = non affichée).
2. `public/admin/config.yml` : `repo` (`faresinside/fan2harmonie`), `base_url` (`https://fan2harmonie.fr`)
   et `auth_endpoint` (`oauth/auth.php`) sont déjà définitifs.
3. `docs/GUIDE-STEPHANIE.md` : remplacer `[adresse e-mail du technicien — à remplacer]` par la vraie adresse
   du technicien (le garde-fou refuse tout marqueur « [… à remplacer] » dans le guide).
4. Lancer le garde-fou jusqu’à ce qu’il réussisse (le déploiement le relance et s’arrête tant qu’il échoue) :

   ```sh
   docker compose run --rm app npm run verifier:mise-en-ligne
   ```

   Il vérifie aussi que `base_url` est exactement `https://<domaine de site.url>` et que `auth_endpoint` désigne
   un fichier existant de `public/`.

## 8. Premier déploiement, suivi pas à pas

Avant : la racine web ne contient que ce que l’hébergeur y a mis (page d’accueil par défaut, `cgi-bin/`…) et le
fichier `.fan2harmonie-site`. Retirer à la main la page par défaut si elle gêne. Les configurations
`fan2harmonie-contact/config.php` et `fan2harmonie-contact/oauth-config.php` existent déjà et sont complètes
(étapes 4 et 6) : le formulaire et la connexion à `/admin` fonctionnent dès cette première mise en ligne.

Le déploiement part à chaque modification de `main` (Actions > « Déploiement ») :

1. **construire** (sans aucun secret) : tests unitaires, garde-fou de mise en ligne, construction, contrôle de
   `dist/` (fichiers attendus, aucun fichier propre au serveur, aucun lien symbolique), `dist/` mis de côté ;
2. **deployer** (seulement depuis `main`, environnement `production`) :
   - contrôle de `SSH_HOST`, `SSH_USER`, `SSH_PORT` (`scripts/valider-ssh.sh`) et de `REMOTE_PATH`
     (`scripts/valider-remote-path.sh`) ;
   - clé et `known_hosts` écrits dans un dossier temporaire (droits 0600) ;
   - **fichier témoin** : `.fan2harmonie-site` doit exister dans `REMOTE_PATH`, sinon arrêt sans rien toucher
     (il protège contre un `REMOTE_PATH` valide mais faux, par exemple le dossier du compte) ;
   - **passage à blanc** de rsync (mêmes filtres, rien n’est modifié) : au-delà de **100 suppressions**, arrêt
     avant toute copie, avec les premiers fichiers concernés dans le journal ;
   - copie réelle (`rsync --delete-after --delay-updates --max-delete=200`) : au-delà de 200 suppressions,
     rsync s’arrête de lui-même ; les fichiers propres au serveur (`api/config.php`, `oauth/config.php`,
     `error_log`, `.well-known/acme-challenge/`, `cgi-bin/`, `.htpasswd`, `.user.ini` de la racine,
     `.fan2harmonie-site`) ne sont jamais envoyés ni supprimés ;
   - clé SSH effacée aussitôt ;
   - vérification que le site répond : erreur 5xx = échec du déploiement ; site injoignable (DNS pas encore
     pointé) = simple avertissement.

En cas d’erreur rsync, les 50 dernières lignes de son journal s’affichent dans l’étape concernée.

## 9. Vérifications après la mise en ligne (smoke test)

Remplacer `$S` par `https://fan2harmonie.fr` (ou utiliser `--resolve`, étape 1).

| Vérification | Commande ou geste | Résultat attendu |
|---|---|---|
| Accueil | `curl -sI $S/` | 200 ; `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` partielle |
| www et http | `curl -sI http://www.fan2harmonie.fr/` | 301 vers `https://fan2harmonie.fr/` |
| Dépôt git | `curl -s -o /dev/null -w '%{http_code}\n' $S/.git/config` | 403 ou 404 |
| Bibliothèque du formulaire | même commande sur `$S/api/lib/contact.php` | 403 ou 404 |
| Chemin en plus | même commande sur `$S/api/contact.php/x` | 404 |
| Méthode | `curl -s -o /dev/null -w '%{http_code}\n' $S/api/contact.php` | 405 |
| Trop gros (70 Ko) | `head -c 70000 /dev/zero \| tr '\0' x > gros.txt` puis `curl -s -o /dev/null -w '%{http_code}\n' -H "Origin: $S" --data-urlencode "x@gros.txt" $S/api/contact.php` | 413 |
| Origine étrangère | `curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://exemple.org' -d 'nom=a' $S/api/contact.php` | 403 |
| Vrai message | formulaire du site, depuis un téléphone | message reçu dans `contact@fan2harmonie.fr` (regarder aussi les indésirables) |
| Relais OAuth | `curl -s -D - -o /dev/null "$S/oauth/auth.php?provider=github"` (vrai GET ; un `curl -I` enverrait HEAD, refusé en 405) | 302 vers `https://github.com/login/oauth/authorize?client_id=…` et `Set-Cookie: __Host-fan2h_oauth_state=…; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax` |
| Relais : page de retour | `curl -sI https://fan2harmonie.fr/oauth/callback.php` | 405 (méthode HEAD) ; `Cache-Control: no-store`, `Referrer-Policy: no-referrer` et `Content-Security-Policy` à nonce, chacun UNE seule fois. Même chose avec `curl -s -D - -o /dev/null https://fan2harmonie.fr/oauth/callback.php` (GET sans cookie : 403) |
| Erreurs PHP jamais affichées | panneau de l’hébergeur (`php.ini`) ou une page qui provoque une erreur | `display_errors` à Off pour le compte (sinon vérifier que `api/.user.ini` et `oauth/.user.ini` sont bien pris en compte) |
| Relais : fichiers privés | `$S/oauth/lib/oauth.php`, `$S/oauth/config.php`, `$S/oauth/auth.php/x` | 403 ou 404 |
| Administration | `$S/admin`, « Se connecter avec GitHub » | connexion ; ajouter un rendez-vous de test, l’annuler (« Séance annulée »), le supprimer : chaque changement est en ligne en quelques minutes (mesurer le délai réel à ce premier essai et le noter dans le guide de Stéphanie) |
| Portée réelle du jeton | après la première vraie connexion : GitHub > Settings > Applications > Authorized OAuth Apps | l’application n’a que la portée prévue (`public_repo`, ou `repo` si le dépôt est privé) et Sveltia fonctionne avec elle seule |
| Actualité | publier une actualité de test avec une photo, puis la supprimer | visible puis retirée |
| Texte d’une page | corriger une virgule dans « Le Qi Gong » | correction en ligne |
| Mentions légales | `$S/mentions-legales/` | complètes : aucun `À_COMPLÉTER`, pas le SIRET d’exemple |
| Robots et plan du site | `$S/robots.txt`, `$S/sitemap-index.xml` | présents, avec le vrai domaine |
| Performance | Lighthouse (Chrome) sur `$S/` | scores proches de ceux de `npm run lighthouse` |
| Rendez-vous passés | Actions > Déploiement > Run workflow (une fois) | un rendez-vous de date passée a disparu après la reconstruction (ensuite : chaque nuit) |

**Adresse IP réelle des visiteurs (`REMOTE_ADDR`).** Le limiteur compte 5 messages par heure et par adresse.
Si l’hébergeur place un serveur intermédiaire qui donne la MÊME adresse à tous les visiteurs, 5 messages
bloqueraient tout le monde pendant une heure. Vérifier : visiter le site depuis deux réseaux différents
(Wi-Fi de la maison et 4G du téléphone) puis lire le journal d’accès dans le panneau de l’hébergeur : les deux
adresses publiques réelles doivent y apparaître (et pas deux fois la même adresse interne). En cas de doute,
demander au support si un mandataire est placé devant le site et si `REMOTE_ADDR` en est corrigé.

**Si l’hébergeur utilise LiteSpeed** (non testé ici, seul Apache l’a été) : refaire les vérifications du
tableau, et en particulier :
- `LimitRequestBody` : un envoi de 70 Ko doit donner 413 (si c’est la réponse JSON du script et non une page du
  serveur, la limite d’Apache est ignorée ; le script et `.user.ini` limitent quand même) ;
- conditions `env=` des en-têtes : `curl -sI` sur un fichier de `/_astro/` (cache d’un an), sur `/admin/` (pas de
  `Content-Security-Policy`, `Cache-Control: no-store`) et sur `/oauth/auth.php` (`Referrer-Policy: no-referrer`
  une seule fois) ;
- héritage des règles : `/api/contact.php/x` et `/oauth/auth.php/x` → 404, `/oauth/lib/oauth.php` → 403 ou 404.

Les mêmes vérifications, automatisées, sont dans `tests/apache/run.sh`.

## 10. Revenir en arrière

- **Durablement** : `git revert` du ou des commits fautifs sur `main` ; le site est reconstruit et republié
  aussitôt.
- **En urgence seulement** : Actions > « Déploiement » > Run workflow **depuis `main`**, champ `ref` = SHA
  complet (40 caractères) d’un ancien commit de `main`. C’est provisoire : le prochain push ou la reconstruction
  de la nuit remet la dernière version de `main`.
- Revenir avant un commit de durcissement (règles `.htaccess`, relais, déploiement) remet aussi les anciennes
  règles, plus faibles : préférer un `git revert` ciblé.
- **Sauvegardes de l’hébergeur** : vérifier qu’elles existent et couvrent le dossier privé
  `fan2harmonie-contact/` (les configurations ne sont pas dans GitHub).

## 11. À faire relire (juridique)

Points relevés pendant la réalisation, à faire relire par une personne compétente, puis à valider avec
Stéphanie :

- **Statut** affiché dans les mentions légales : avec un SIRET, « Entrepreneur individuel (micro-entreprise) » ;
  sans SIRET, « Personne physique, activité exercée à titre non professionnel et gratuit ». Confirmer le bon
  statut.
- **SIRET** : l’exemple `123 456 789 00012` doit être remplacé par le vrai, ou retiré (`null`). Le garde-fou
  bloque la mise en ligne tant qu’il est là.
- **Nom affiché** : « Éditrice du site et responsable de la publication : Stéphanie Gabalda ». Une éditrice non
  professionnelle peut rester anonyme envers le public si elle donne son identité à l’hébergeur : ici, elle
  choisit d’apparaître.
- **Journaux de l’hébergeur** : la phrase « L’hébergeur peut conserver les journaux techniques de connexion
  (adresse IP, date) conformément à la loi » est générale ; la vérifier auprès de l’hébergeur choisi.
- **Lutte contre les abus** : « une empreinte pseudonymisée de l’adresse IP et l’heure d’envoi sont conservées au
  plus une heure et supprimées au plus tard lors de la prochaine utilisation du formulaire » ; formulation à
  confirmer (voir aussi la purge quotidienne proposée à l’étape 14).
- **Transferts hors de l’Union européenne** : Formspree et Cloudflare ne sont plus utilisés, le paragraphe sur
  les transferts vers les États-Unis a donc été retiré. Confirmer qu’aucune autre mention n’est nécessaire
  (GitHub ne reçoit aucune donnée de visiteur).
- **Destinataire** : la page dit que le message est traité par l’hébergeur et envoyé à `contact@` ; cela suppose
  que la boîte mail est chez ce même hébergeur français.
- **Conservation** : « le temps nécessaire pour répondre à votre demande, puis supprimées » engage Stéphanie à
  effacer les messages de sa boîte une fois traités ; ou fixer une durée précise.
- **Crédits** : « sauf éléments de tiers mentionnés » ; à revoir quand les photos définitives seront choisies
  (étape 12).
- **Texte de Stéphanie** (page « Mon parcours ») : la phrase « j’ai créé ma petite entreprise » n’a pas été
  modifiée ; elle serait inexacte si Stéphanie n’a pas d’entreprise déclarée (voir le statut ci-dessus). À
  aborder avec elle.

## 12. Photos

- `src/assets/photos/hero.jpg` est **provisoire** : un recadrage flouté d’un fichier personnel de Stéphanie
  (`source/ImageAnimation.jpeg`). Le remplacer par une photo définitive (personnelle ou sous licence libre).
- Pour chaque photo : source et licence notées dans `source/CREDITS-PHOTOS.md`.
- Les images distantes ne sont pas affichées : une image insérée dans un texte par son adresse sur un autre
  site (`https://…`) est remplacée par son texte de remplacement ; seules les photos téléversées dans `/admin`
  (ou présentes dans le projet) s’affichent. Aucune ressource n’est chargée ailleurs que sur le site.
- Les images du site sont préparées depuis `source/` par `docker compose run --rm app npm run assets`, puis
  vérifiées (`npm test`, `npm run test:e2e`) avant d’être publiées. Les photos des actualités, elles, sont
  ajoutées par Stéphanie dans `/admin` (réduites automatiquement).

## 13. Risques qui restent (en clair)

- **Formulaire bloqué une heure** : au plus 20 envois par heure pour tout le monde. Une personne malveillante
  peut donc l’occuper pendant une heure ; les visiteurs voient alors le message d’erreur avec l’adresse e-mail
  de contact, qu’ils peuvent utiliser directement.
- **Empreinte d’adresse IP** : pseudonymisée (HMAC avec un secret), pas anonyme ; elle est supprimée à la
  première utilisation du formulaire qui suit l’heure écoulée.
- **Accès en écriture au dépôt = pouvoir d’exécuter du code sur l’hébergeur** : pousser sur `main` publie
  `.htaccess` et scripts PHP, et change `scripts/` et `package.json` lancés à la construction (le workflow
  lui-même demande en plus la portée `workflow`, que le relais ne donne pas) ; depuis le serveur, on lit le
  secret de l’application OAuth et la configuration du formulaire. En cas de doute : procédure complète de
  l’étape 6, point 5. Seulement des personnes de confiance, en double authentification, avec le rôle
  « Write » (jamais « Admin ») ; voir l’étape 6, point 6.
- **Jeton de connexion GitHub volé** : il n’expire jamais avec une application OAuth et ne peut pas être limité à
  un seul dépôt (il vaut pour tous les dépôts du compte, d’où le compte GitHub DÉDIÉ conseillé à l’étape 6).
  Se déconnecter de `/admin` ne le révoque pas. En cas de doute : « Revoke all user tokens » (étape 6), et
  Settings > Applications > Authorized OAuth Apps sur le compte de l’éditrice.
- **Dépôt public** : GitHub désactive la reconstruction de la nuit après 60 jours sans activité ; la réactiver
  dans Actions (un dépôt privé n’a pas cette limite). En attendant, les rendez-vous passés restent dans les
  pages, mais le navigateur des visiteurs les masque le jour même (script `src/scripts/rendezvous.ts` ; pas
  pour un visiteur sans JavaScript).
- **Limiteur et sauvegardes** : si le formulaire répond « Service momentanément indisponible » et que le journal
  parle du limiteur, un outil de sauvegarde a pu créer un lien physique vers `fan2harmonie-limiteur.json` :
  supprimer ce fichier dans le dossier `limiteur/`, il sera recréé.
- **Politique de sécurité du contenu (CSP) partielle** sur les pages du site (les pages du relais OAuth et du
  formulaire ont la leur, complète).
- **GitHub est un service américain**, mais ne reçoit aucune donnée de visiteur.
- **`/admin`** charge depuis le navigateur de l’éditrice des textes et polices sur unpkg.com et cdn.jsdelivr.net
  et l’état de GitHub sur githubstatus.com ; les visiteurs du site ne sont pas concernés.
- **Cookie du relais** : il s’appelle `__Host-fan2h_oauth_state` (Path=/, Secure, sans Domain). Sans ce
  préfixe, un sous-domaine compromis de `fan2harmonie.fr`, ou une réponse en http avant que HSTS soit connu du
  navigateur (première visite), pourrait imposer un cookie et connecter l’éditrice au compte GitHub d’un
  attaquant ; avec `__Host-`, le navigateur refuse de tels cookies.

## 14. Pour plus tard

- CSP complète avec empreintes (`sha256-…`) des scripts en ligne (voir le README).
- Actions GitHub épinglées par SHA de commit, et Dependabot pour les tenir à jour.
- Hébergement Git européen (Codeberg, Forgejo) : Sveltia CMS sait s’y connecter sans relais (PKCE) ; il faudrait
  alors adapter le déploiement.
- Purge quotidienne du fichier du limiteur par une tâche cron de l’hébergeur, pour que « au plus une heure » soit
  vrai même sans nouvel envoi.
- Application GitHub à la place de l’OAuth App (« GitHub App »), pour limiter l’accès au seul dépôt du site et
  avoir des jetons qui expirent.
- Évaluer les règles de poussée GitHub (push rulesets, restriction de chemins de fichiers) pour interdire aux
  comptes éditeurs de modifier tout sauf `src/content/**` et `src/assets/actualites/**` — disponibilité selon
  l’offre/le type de dépôt à vérifier.
- Restreindre la clé de déploiement avec `rrsync` (facultatif, étape 5.6) si l’hébergeur le permet.
