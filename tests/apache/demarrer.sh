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
# Relais de connexion de /admin (écrit plus tard, versionné dans public/oauth/) : ébauches de test seulement.
mkdir -p "$racine/oauth/lib" "$racine/API/lib"
printf '<?php echo "OAUTH-AUTH-OK";\n' > "$racine/oauth/auth.php"
printf '<?php echo "OAUTH-CALLBACK-OK";\n' > "$racine/oauth/callback.php"
printf '%s\n' "$piege_php" > "$racine/oauth/lib/x.php"
printf '%s\n' "$piege_php" > "$racine/oauth/other.php"
printf '<?php return ["PIEGE-CONFIG"]; // PIEGE-SOURCE\n' > "$racine/oauth/config.php"
# Variantes de casse (système de fichiers sensible à la casse : ce sont d'autres fichiers) et double extension.
printf '%s\n' "$piege_php" > "$racine/API/lib/x.php"
printf '<?php return ["PIEGE-CONFIG"]; // PIEGE-SOURCE\n' > "$racine/api/CONFIG.PHP"
printf '%s\n' "$piege_php" > "$racine/api/Autre.PHP"
printf '%s\n' "$piege_php" > "$racine/x.php.jpg"
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
chown -R www-data:www-data "$prive"
chmod 0700 "$prive" "$prive/limiteur" "$prive/courriers"
chmod 0600 "$prive/config.php"

exec apache2-foreground
