#!/bin/sh
# Démarrage du conteneur Apache de TEST (tests/apache/) :
# 1. racine web = copie de dist/ (le site construit, .htaccess compris) ;
# 2. ajout de fichiers « pièges » (contenu PIEGE-…) que le serveur ne doit JAMAIS servir ni exécuter ;
# 3. configuration du formulaire HORS de la racine web, désignée par FAN2HARMONIE_CONFIG (environnement du
#    conteneur, voir docker-compose.yml), avec le transport de test (MAIL_TRANSPORT=file) ;
# 4. Apache au premier plan.
set -eu

racine=/var/www/html
prive=/srv/fan2harmonie-test

if [ ! -f /dist/index.html ]; then
    echo "dist/ absent : lancer d'abord la construction du site (npm run build)." >&2
    exit 1
fi

rm -rf "$racine"
mkdir -p "$racine"
cp -a /dist/. "$racine/"

piege_php='<?php echo "PIEGE-EXECUTE"; // PIEGE-SOURCE'
mkdir -p "$racine/.git" "$racine/.well-known/acme-challenge" "$racine/vide"
printf '[core]\n\tpiege = PIEGE-GIT\n' > "$racine/.git/config"
printf 'SECRET=PIEGE-ENV\n' > "$racine/.env"
printf '# PIEGE-README\n' > "$racine/README.md"
printf '# PIEGE-README\n' > "$racine/api/LISEZMOI.md"
printf 'PIEGE-BAK\n' > "$racine/index.html.bak"
printf 'PIEGE-TILDE\n' > "$racine/index.html~"
printf 'PIEGE-SWP\n' > "$racine/.index.html.swp"
printf 'PIEGE-ORIG\n' > "$racine/api/contact.php.orig"
printf 'PIEGE-LOG\n' > "$racine/error_log"
printf 'PIEGE-LOG\n' > "$racine/api/error_log"
printf '{"PIEGE": "composer"}\n' > "$racine/composer.json"
printf '%s\n' "$piege_php" > "$racine/api/autre.php"
printf '%s\n' "$piege_php" > "$racine/api/autre.phtml"
printf '%s\n' "$piege_php" > "$racine/script.php"
printf '<?php return ["PIEGE-CONFIG"]; // PIEGE-SOURCE\n' > "$racine/api/config.php"
# Relais de connexion de /admin : les VRAIS scripts de dist/oauth/ (auth.php, callback.php, lib/), plus des pièges.
if [ ! -f "$racine/oauth/auth.php" ] || [ ! -f "$racine/oauth/callback.php" ] || [ ! -f "$racine/oauth/lib/oauth.php" ]; then
    echo "dist/oauth/ incomplet : relancer la construction du site (npm run build)." >&2
    exit 1
fi
mkdir -p "$racine/API/lib"
printf '%s\n' "$piege_php" > "$racine/oauth/lib/x.php"
printf '%s\n' "$piege_php" > "$racine/oauth/other.php"
printf '<?php return ["PIEGE-CONFIG"]; // PIEGE-SOURCE\n' > "$racine/oauth/config.php"
# Variantes de casse (système de fichiers sensible à la casse : ce sont d'autres fichiers) et double extension.
printf '%s\n' "$piege_php" > "$racine/API/lib/x.php"
printf '<?php return ["PIEGE-CONFIG"]; // PIEGE-SOURCE\n' > "$racine/api/CONFIG.PHP"
printf '%s\n' "$piege_php" > "$racine/api/Autre.PHP"
printf '%s\n' "$piege_php" > "$racine/x.php.jpg"
printf '%s\n' "$piege_php" > "$racine/x.pht.jpg"
printf '%s\n' "$piege_php" > "$racine/x.inc.txt"
# Variantes de casse de /oauth/ (autres fichiers sur ce système sensible à la casse) : refusées par les
# règles du projet, pas parce qu'elles n'existent pas.
mkdir -p "$racine/OAUTH"
printf '%s\n' "$piege_php" > "$racine/OAUTH/auth.php"
printf '%s\n' "$piege_php" > "$racine/oauth/Auth.PHP"
# Fichiers inoffensifs (ni PHP, ni caché) dans les dossiers lib/ : seuls les refus de lib/ les couvrent.
printf 'PIEGE-LIB\n' > "$racine/api/lib/inoffensif.txt"
printf 'PIEGE-LIB\n' > "$racine/oauth/lib/inoffensif.txt"
printf 'jeton-acme\n' > "$racine/.well-known/acme-challenge/jeton"
chown -R root:root "$racine"
chmod -R u=rwX,go=rX "$racine"

# Variante « module manquant » (services apache-sans-rewrite et apache-sans-headers) : les refus ne doivent
# jamais disparaître en silence.
if [ -n "${DESACTIVER_MODULE:-}" ]; then
    a2dismod -f "$DESACTIVER_MODULE" > /dev/null
fi

# Variante « sans refus mod_rewrite » (service apache-sans-refus-rewrite) : .htaccess de la racine privé de
# ses règles de refus (RewriteRule … [F] et leurs RewriteCond), « RewriteEngine On » et les redirections
# gardés. Les autres couches (FilesMatch, RedirectMatch, lib/.htaccess) doivent suffire.
if [ -n "${RETIRER_REFUS_REWRITE:-}" ]; then
    sed -i -e '/^RewriteRule .* - \[F/d' -e '/^RewriteCond %{REQUEST_URI}/d' -e '/^RewriteCond %{REQUEST_METHOD}/d' "$racine/.htaccess"
    if grep -Eq -e ' - \[F' -e '^RewriteCond %\{REQUEST_(URI|METHOD)\}' "$racine/.htaccess" || ! grep -q '^RewriteEngine On$' "$racine/.htaccess"; then
        echo "Variante sans refus mod_rewrite : .htaccess mal préparé." >&2
        exit 1
    fi
fi
rm -rf "$prive"
mkdir -p "$prive/limiteur" "$prive/courriers"
cp /tests/config-test.php "$prive/config.php"
# Configuration de TEST du relais OAuth, désignée par FAN2HARMONIE_OAUTH_CONFIG (service « apache » seulement ;
# les autres serveurs tombent sur le piège oauth/config.php, invalide : page 500 générique).
cp /tests/oauth-config-test.php "$prive/oauth-config.php"
chown -R www-data:www-data "$prive"
chmod 0700 "$prive" "$prive/limiteur" "$prive/courriers"
chmod 0600 "$prive/config.php" "$prive/oauth-config.php"

exec apache2-foreground
