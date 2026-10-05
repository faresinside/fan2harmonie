#!/bin/sh
# Tests du site construit (dist/) sur un VRAI Apache 2.4 + PHP 8.3, par de vraies requêtes HTTP(S) (curl).
# Lancement : `npm run test:apache` (après `npm run build`) ; commande Docker complète dans package.json.
# Le serveur « apache » (tests/apache/Dockerfile, demarrer.sh) sert une copie de dist/ et des fichiers pièges ;
# ce script tourne dans le conteneur « apache-tests », sur un réseau Docker interne sans accès à Internet.
# Tout nom d'hôte (fan2harmonie.fr, www.…) est envoyé vers le conteneur « apache » (curl --connect-to).
# Sans dépendance : sh + curl. Code de sortie non nul au moindre échec.
set -u

SERVEUR=apache
DOMAINE=fan2harmonie.fr
CSP="base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
reussis=0
echecs=0

ok() { reussis=$((reussis + 1)); printf '✓ %s\n' "$1"; }
ko() { echecs=$((echecs + 1)); printf '✗ %s\n    %s\n' "$1" "$2"; }

# requete MÉTHODE URL [options curl…] : remplit $statut, $TMP/entetes et $TMP/corps.
requete() {
    methode=$1
    url=$2
    shift 2
    statut=$(curl -sk --path-as-is --max-time 10 --connect-to "::$SERVEUR:" -X "$methode" \
        -o "$TMP/corps" -D "$TMP/entetes" -w '%{http_code}' "$@" "$url") || statut="erreur-curl"
}

# Valeurs (une par ligne) de l'en-tête NOM dans la dernière réponse.
valeurs() {
    tr -d '\r' < "$TMP/entetes" | grep -i "^$1:" | sed 's/^[^:]*:[[:space:]]*//'
}

# attendre_statut LIBELLÉ ATTENDU (ex. « 301 » ou « 403|404 »).
attendre_statut() {
    case "|$2|" in
        *"|$statut|"*) ok "$1 → $statut" ;;
        *) ko "$1" "statut attendu $2, obtenu $statut" ;;
    esac
}

# attendre_entete LIBELLÉ NOM VALEUR : l'en-tête est présent exactement une fois, avec cette valeur exacte.
attendre_entete() {
    trouve=$(valeurs "$2")
    nombre=$(printf '%s' "$trouve" | grep -c '' || true)
    if [ "$nombre" = 1 ] && [ "$trouve" = "$3" ]; then
        ok "$1 : $2: $3"
    else
        ko "$1 : $2" "attendu une fois « $3 », obtenu $nombre fois : « $(printf '%s' "$trouve" | tr '\n' '|') »"
    fi
}

# attendre_absent LIBELLÉ MOTIF : aucun en-tête dont le nom correspond au motif (grep -E, sans « : »).
attendre_absent() {
    if tr -d '\r' < "$TMP/entetes" | grep -Eiq "^($2):"; then
        ko "$1 : aucun en-tête $2" "présent : $(tr -d '\r' < "$TMP/entetes" | grep -Ei "^($2):" | tr '\n' '|')"
    else
        ok "$1 : aucun en-tête $2"
    fi
}

# attendre_corps LIBELLÉ TEXTE / refuser_corps LIBELLÉ TEXTE
attendre_corps() {
    if grep -Fq -- "$2" "$TMP/corps"; then ok "$1 : contient « $2 »"; else ko "$1" "« $2 » absent du corps"; fi
}
refuser_corps() {
    if grep -Fq -- "$2" "$TMP/corps"; then ko "$1" "« $2 » présent dans le corps"; else ok "$1 : sans « $2 »"; fi
}

# En-têtes de sécurité communs à toutes les réponses (pages, erreurs, script PHP). $2 facultatif : la valeur
# attendue de Referrer-Policy (no-referrer sous /oauth/).
entetes_securite() {
    attendre_entete "$1" X-Content-Type-Options "nosniff"
    attendre_entete "$1" Referrer-Policy "${2:-strict-origin-when-cross-origin}"
    attendre_entete "$1" Permissions-Policy "camera=(), microphone=(), geolocation=()"
    attendre_entete "$1" X-Frame-Options "DENY"
    attendre_entete "$1" Strict-Transport-Security "max-age=31536000"
    attendre_absent "$1" "Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy|Cross-Origin-Resource-Policy|Access-Control-[A-Za-z-]+|X-Powered-By"
}

# Envoi du formulaire (application/x-www-form-urlencoded) ; $1 = Origin, $2 = Accept, autres options curl ensuite.
poster() {
    origine=$1
    accepte=$2
    shift 2
    requete POST "https://$DOMAINE/api/contact.php" -H "Origin: $origine" -H "Accept: $accepte" \
        --data-urlencode 'nom=Héloïse Dupré' --data-urlencode 'email=heloise@example.org' \
        --data-urlencode 'message=Bonjour, à samedi ?' --data-urlencode 'consentement=oui' \
        --data-urlencode '_gotcha=' "$@"
}

echo "== Redirections : HTTPS et nom canonique =="
# info LIBELLÉ : constat affiché sans être compté (comportement qui ne dépend pas des règles du projet).
info() { printf 'ℹ %s\n' "$1"; }

# refus_sans_source CHEMIN [LIBELLÉ] : 403 ou 404, et ni piège, ni source PHP, ni liste de dossier.
refus_sans_source() {
    requete GET "https://$DOMAINE$1"
    attendre_statut "${2:-$1}" "403|404"
    for piege in PIEGE '<?php' 'namespace Fan2Harmonie' 'Index of' 'OAUTH-'; do
        if grep -Fq -- "$piege" "$TMP/corps"; then ko "${2:-$1}" "« $piege » dans le corps"; fi
    done
}

requete GET "http://$DOMAINE/mentions-legales/?a=1"
attendre_statut "http://$DOMAINE/mentions-legales/?a=1" 301
attendre_entete "http → https" Location "https://$DOMAINE/mentions-legales/?a=1"
requete GET "http://www.$DOMAINE/mentions-legales/"
attendre_statut "http://www.$DOMAINE/mentions-legales/" 301
attendre_entete "http www → https sans www, en un seul saut" Location "https://$DOMAINE/mentions-legales/"
requete GET "https://www.$DOMAINE/?b=2"
attendre_statut "https://www.$DOMAINE/?b=2" 301
attendre_entete "https www → https sans www" Location "https://$DOMAINE/?b=2"
requete GET "https://WWW.FAN2HARMONIE.FR/"
attendre_statut "https://WWW.FAN2HARMONIE.FR/ (majuscules)" 301
attendre_entete "https www en majuscules → domaine canonique" Location "https://$DOMAINE/"
requete GET "https://FAN2HARMONIE.FR/"
attendre_statut "https://FAN2HARMONIE.FR/ (domaine en majuscules : déjà canonique)" 200
requete GET "http://autre-nom.example/x"
attendre_statut "http://autre-nom.example/x (Host quelconque)" 301
attendre_entete "Host quelconque en http → domaine canonique" Location "https://$DOMAINE/x"
requete GET "https://autre-nom.example/x?y=1"
attendre_statut "https://autre-nom.example/x?y=1 (Host étranger en HTTPS)" 301
attendre_entete "Host étranger en HTTPS → domaine canonique, nom jamais repris" Location "https://$DOMAINE/x?y=1"
requete GET "https://hebergeur-provisoire.example:443/"
attendre_entete "adresse provisoire de l'hébergeur → domaine canonique" Location "https://$DOMAINE/"
requete GET "https://$DOMAINE/admin"
attendre_statut "/admin (sans barre finale)" 301
attendre_entete "/admin → /admin/ (mod_dir) sur le domaine canonique" Location "https://$DOMAINE/admin/"
requete GET "https://autre-nom.example/admin"
attendre_statut "/admin avec un Host étranger" 301
attendre_entete "/admin avec un Host étranger : jamais renvoyé vers ce Host" Location "https://$DOMAINE/admin"
requete GET "http://$DOMAINE/a%0d%0aSet-Cookie:%20piege=1"
attendre_statut "http avec CR LF encodés dans le chemin" "301|400|403|404"
attendre_absent "pas d'injection d'en-tête par le chemin" "Set-Cookie"
requete GET "http://$DOMAINE/" -H 'X-Forwarded-Proto: https'
attendre_statut "http derrière un frontal HTTPS (X-Forwarded-Proto: https) : pas de boucle" 200

echo "== Accueil en HTTPS : en-têtes =="
requete GET "https://$DOMAINE/"
attendre_statut "https://$DOMAINE/" 200
entetes_securite "/"
attendre_entete "/" Content-Security-Policy "$CSP"
attendre_entete "/ (HTML)" Cache-Control "no-cache"
attendre_entete "/" Content-Type "text/html; charset=UTF-8"
attendre_corps "/" "Fan 2 Harmonie"
requete GET "https://$DOMAINE/mentions-legales/"
attendre_statut "/mentions-legales/" 200
attendre_entete "/mentions-legales/ (HTML)" Cache-Control "no-cache"
attendre_entete "/mentions-legales/" Content-Security-Policy "$CSP"
requete GET "https://$DOMAINE/" -H 'Accept-Encoding: gzip'
attendre_entete "/ compressé" Content-Encoding "gzip"

echo "== Cache =="
fichier_astro=$(ls /dist/_astro | head -n 1)
requete GET "https://$DOMAINE/_astro/$fichier_astro"
attendre_statut "/_astro/$fichier_astro" 200
attendre_entete "/_astro/ (nom haché)" Cache-Control "public, max-age=31536000, immutable"
entetes_securite "/_astro/"
requete GET "https://$DOMAINE/robots.txt"
attendre_entete "/robots.txt" Cache-Control "no-cache"
requete GET "https://$DOMAINE/_astro/nexiste-pas.js"
attendre_statut "/_astro/nexiste-pas.js" 404
attendre_entete "404 sous /_astro/ : jamais gardée un an" Cache-Control "no-cache"

echo "== /admin/ : sans CSP du site, jamais en cache =="
requete GET "https://$DOMAINE/admin/"
attendre_statut "/admin/" 200
attendre_entete "/admin/" Cache-Control "no-store"
attendre_absent "/admin/" "Content-Security-Policy"
entetes_securite "/admin/"
requete GET "https://$DOMAINE/admin/config.yml"
attendre_statut "/admin/config.yml (lu par Sveltia CMS)" 200
attendre_entete "/admin/config.yml" Cache-Control "no-store"

echo "== /oauth/ : relais de connexion GitHub (vrais scripts), seuls auth.php et callback.php s'exécutent =="
# CSP propre aux pages du relais : un seul script, autorisé par un nonce tiré à chaque réponse.
CSP_OAUTH="^default-src 'none'; script-src 'nonce-([0-9a-f]{32})'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\$"
# page_oauth LIBELLÉ : page du relais avec la CSP à nonce (une fois) et le même nonce sur sa balise <script>.
page_oauth() {
    csp=$(valeurs Content-Security-Policy)
    if [ "$(printf '%s' "$csp" | grep -c '')" = 1 ] && printf '%s' "$csp" | grep -Eq "$CSP_OAUTH"; then
        nonce=$(printf '%s' "$csp" | sed -E "s/$CSP_OAUTH/\\1/")
        ok "$1 : CSP à nonce"
        attendre_corps "$1 : même nonce dans la balise" "<script nonce=\"$nonce\">"
    else
        ko "$1 : CSP à nonce" "obtenu : « $(printf '%s' "$csp" | tr '\n' '|') »"
    fi
    attendre_entete "$1" Content-Type "text/html; charset=utf-8"
    attendre_entete "$1" Cache-Control "no-store"
    entetes_securite "$1" "no-referrer"
    attendre_corps "$1" '<html lang="fr">'
    refuser_corps "$1" '"*"'
    for fuite in PIEGE '<?php' 'namespace Fan2Harmonie' 'secret0de0test' 'Iv1.apachetest0001'; do
        if grep -Fq -- "$fuite" "$TMP/corps"; then ko "$1" "« $fuite » dans le corps"; fi
    done
}
EFFACE='fan2h_oauth_state=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/oauth/; Secure; HttpOnly; SameSite=Lax'

# auth.php, comme l'ouvre Sveltia : 302 vers GitHub (valeurs de la configuration, jamais de la requête), state
# dans un cookie HttpOnly, Secure, SameSite=Lax, limité à /oauth/.
requete GET "https://$DOMAINE/oauth/auth.php?provider=github&site_id=$DOMAINE&scope=repo%2Cuser&redirect_uri=https%3A%2F%2Fevil.example%2F"
attendre_statut "/oauth/auth.php exécuté (configuration de test)" 302
location=$(valeurs Location)
etat=$(printf '%s' "$location" | sed -n 's/^https:\/\/github\.com\/login\/oauth\/authorize?client_id=Iv1\.apachetest0001&redirect_uri=https%3A%2F%2Ffan2harmonie\.fr%2Foauth%2Fcallback\.php&scope=repo&state=\([0-9a-f]\{64\}\)$/\1/p')
if [ -n "$etat" ]; then ok "/oauth/auth.php → GitHub, paramètres de la configuration seulement"; else ko "/oauth/auth.php : Location" "obtenu : $location"; fi
attendre_entete "/oauth/auth.php : cookie du state" Set-Cookie "fan2h_oauth_state=$etat; Max-Age=600; Path=/oauth/; Secure; HttpOnly; SameSite=Lax"
attendre_entete "/oauth/auth.php" Cache-Control "no-store"
attendre_absent "/oauth/auth.php (redirection)" "Content-Security-Policy"
entetes_securite "/oauth/auth.php" "no-referrer"
requete GET "https://$DOMAINE/oauth/auth.php?provider=gitlab"
attendre_statut "/oauth/auth.php?provider=gitlab" 400
page_oauth "/oauth/auth.php?provider=gitlab"
attendre_absent "/oauth/auth.php?provider=gitlab : ni cookie ni redirection" "Set-Cookie|Location"
for methode in POST HEAD; do
    requete "$methode" "https://$DOMAINE/oauth/auth.php"
    attendre_statut "$methode /oauth/auth.php" 405
    attendre_entete "$methode /oauth/auth.php" Allow "GET"
done

# callback.php : state sans cookie → 403, page générique, cookie effacé ; erreur de GitHub → 400 sans détail.
requete GET "https://$DOMAINE/oauth/callback.php?code=abc123&state=$etat"
attendre_statut "/oauth/callback.php sans cookie" 403
page_oauth "/oauth/callback.php sans cookie"
attendre_entete "/oauth/callback.php : cookie effacé" Set-Cookie "$EFFACE"
attendre_corps "/oauth/callback.php" "authorization:github:error:"
requete GET "https://$DOMAINE/oauth/callback.php?error=access_denied&error_description=DETAIL-GITHUB&state=$etat" -H "Cookie: fan2h_oauth_state=$etat"
attendre_statut "/oauth/callback.php?error=…" 400
page_oauth "/oauth/callback.php?error=…"
refuser_corps "/oauth/callback.php?error=… : description jamais reprise" "DETAIL-GITHUB"
requete POST "https://$DOMAINE/oauth/callback.php" -d 'code=x'
attendre_statut "POST /oauth/callback.php" 405
attendre_entete "POST /oauth/callback.php" Allow "GET"

for chemin in /oauth/lib/x.php /oauth/lib/ /oauth/lib /oauth/config.php /oauth/other.php /oauth/ /OAUTH/auth.php \
    /oauth/lib/.htaccess /oauth/Auth.PHP /oauth/lib/inoffensif.txt /api/lib/inoffensif.txt \
    /oauth/lib/oauth.php /oauth/lib/exigences.php /oauth/config.sample.php /oauth/.htaccess; do
    refus_sans_source "$chemin"
done
# Les .htaccess des dossiers lib/ et de oauth/ sont bien ceux du projet (copiés dans dist/).
for fichier in /dist/api/lib/.htaccess /dist/oauth/lib/.htaccess /dist/oauth/.htaccess; do
    if [ -f "$fichier" ]; then ok "$fichier présent dans dist/"; else ko "$fichier" "absent de dist/"; fi
done
requete GET "https://$DOMAINE/"
attendre_entete "/ garde la CSP partielle (absente seulement sous /admin, /oauth, /api)" Content-Security-Policy "$CSP"

echo "== Fichiers jamais servis (403 ou 404, ni source ni exécution) =="
# Chaque chemin désigne un fichier qui EXISTE dans la racine de test (dist/ ou piège de demarrer.sh).
for chemin in \
    /api/lib/contact.php /api/lib/exigences.php /api/lib/ /api/lib /api/lib/.htaccess \
    /api/config.sample.php /api/config.php /api/.user.ini /api/.htaccess \
    /README.md /api/LISEZMOI.md /api/autre.php /api/autre.phtml /script.php \
    /.git/config /.git/ /.git /.env /index.html.bak '/index.html~' /.index.html.swp /api/contact.php.orig \
    /error_log /api/error_log /composer.json /x.php.jpg /x.pht.jpg /x.inc.txt \
    /API/lib/x.php /api/CONFIG.PHP /api/Autre.PHP \
    //api//lib/contact.php /api/lib/../lib/contact.php /api/./lib/contact.php /api/%6cib/contact.php \
    /%2eenv /.%65nv
do
    refus_sans_source "$chemin"
done
requete POST "https://$DOMAINE/api/autre.php" -d 'x=1'
attendre_statut "POST /api/autre.php" "403|404"
refuser_corps "POST /api/autre.php non exécuté" "PIEGE"
requete GET "https://$DOMAINE/.well-known/acme-challenge/jeton"
attendre_statut "/.well-known/ reste accessible (certificats)" 200

echo "== Chemin en plus après le script (AcceptPathInfo Off dans api/ et oauth/) =="
for chemin in /api/contact.php/x /api/contact.php/x.md; do
    requete GET "https://$DOMAINE$chemin" -H 'Accept: application/json'
    attendre_statut "$chemin" "403|404"
    refuser_corps "$chemin : le script n'est pas exécuté" '"ok"'
done
# Sans « AcceptPathInfo Off » (oauth/.htaccess), PHP exécuterait le script pour ces adresses.
for chemin in /oauth/auth.php/x /oauth/callback.php/x/y.css; do
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "$chemin" 404
    attendre_absent "$chemin : le script n'est pas exécuté" "Set-Cookie|Location"
    refuser_corps "$chemin : le script n'est pas exécuté" 'authorization:github'
done

echo "== Constats informatifs (refusés par le serveur lui-même, quelles que soient nos règles) =="
requete TRACE "https://$DOMAINE/"
info "TRACE / → $statut (Debian : TraceEnable Off ; notre règle TRACE/TRACK sert ailleurs)"
requete GET "https://$DOMAINE/.htaccess"
info "/.htaccess → $statut (aussi refusé par la configuration Debian <FilesMatch \"^\\.ht\">)"
requete GET "https://$DOMAINE/api/contact.php%2f..%2flib%2fcontact.php"
info "/api/contact.php%2f..%2flib%2fcontact.php → $statut (« %2f » refusé par Apache lui-même : AllowEncodedSlashes Off)"

echo "== Listes de dossiers =="
for chemin in /_astro/ /api/ /vide/ /admin/../api/; do
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "liste de $chemin" "403|404"
    refuser_corps "liste de $chemin" "Index of"
done

echo "== Page 404 =="
requete GET "https://$DOMAINE/cette-page-nexiste-pas/"
attendre_statut "adresse inconnue" 404
attendre_corps "page 404" "Page introuvable"
attendre_corps "page 404" "Retour à l’accueil"
entetes_securite "page 404"
attendre_entete "page 404" Content-Security-Policy "$CSP"
requete GET "https://$DOMAINE/api/lib/contact.php"
attendre_statut "réponse 403" 403
attendre_corps "403 : même page que 404 (rien n'indique ce qui existe)" "Page introuvable"
entetes_securite "réponse 403"

echo "== Formulaire de contact (vrai PHP sous Apache) =="
poster "https://$DOMAINE" application/json
attendre_statut "POST /api/contact.php, origine du site" 200
if [ "$(cat "$TMP/corps")" = '{"ok":true}' ]; then ok 'réponse {"ok":true}'; else ko 'réponse {"ok":true}' "obtenu : $(cat "$TMP/corps")"; fi
attendre_entete "/api/contact.php" Cache-Control "no-store"
attendre_entete "/api/contact.php" Content-Type "application/json; charset=utf-8"
attendre_absent "/api/contact.php (JSON)" "Content-Security-Policy"
entetes_securite "/api/contact.php"

poster "https://evil.example" application/json
attendre_statut "POST, origine étrangère" 403
attendre_corps "origine étrangère" '"ok":false'

requete GET "https://$DOMAINE/api/contact.php" -H 'Accept: application/json'
attendre_statut "GET /api/contact.php" 405
attendre_entete "GET /api/contact.php" Allow "POST"
attendre_entete "GET /api/contact.php" Content-Type "application/json; charset=utf-8"
attendre_corps "GET /api/contact.php" '"ok":false'

# Pire cas d'un envoi sans JavaScript : 5 000 caractères de 4 octets encodés (%XX) ≈ 45 Ko ; le script
# accepte 56 Ko, Apache 64 Ko (LimitRequestBody), PHP 72 Ko (post_max_size de .user.ini).
head -c 70000 /dev/zero | tr '\0' 'x' > "$TMP/gros"
poster "https://$DOMAINE" application/json --data-urlencode "remplissage@$TMP/gros"
attendre_statut "corps de plus de 64 Ko (LimitRequestBody)" 413
# La réponse est celle d'Apache (page 413 HTML, en-tête text/html), pas le JSON du script. Avec PHP en module
# Apache (mod_php), le script est tout de même lancé ensuite, sans corps, et son propre refus 413 s'ajoute
# après la page d'Apache : sans conséquence (rien n'est lu ni envoyé), simple particularité de mod_php.
if [ "$(head -c 14 "$TMP/corps")" = '<!DOCTYPE HTML' ]; then ok "corps de plus de 64 Ko : page 413 d'Apache"; else ko "corps de plus de 64 Ko" "la réponse ne commence pas par la page 413 d'Apache"; fi
refuser_corps "page d'erreur d'Apache sans signature (ServerSignature Off)" '<address>'
if valeurs Content-Type | grep -qi json; then ko "corps de plus de 64 Ko" "réponse JSON : c'est le script qui a répondu"; else ok "corps de plus de 64 Ko : réponse d'Apache (pas de JSON)"; fi
head -c 60000 /dev/zero | tr '\0' 'x' > "$TMP/moyen"
poster "https://$DOMAINE" application/json --data-urlencode "remplissage@$TMP/moyen"
attendre_statut "corps de 60 Ko (refusé par le script, > 56 Ko)" 413
attendre_corps "corps de 60 Ko" '"ok":false'
message_long=$(head -c 5000 /dev/zero | tr '\0' 'e' | sed 's/e/é/g')
requete POST "https://$DOMAINE/api/contact.php" -H "Origin: https://$DOMAINE" -H 'Accept: text/html' \
    --data-urlencode 'nom=Zoé' --data-urlencode 'email=zoe@example.org' --data-urlencode "message=$message_long" \
    --data-urlencode 'consentement=oui' --data-urlencode '_gotcha='
attendre_statut "envoi sans JavaScript du plus long message permis (5 000 « é »)" 200

poster "https://$DOMAINE" 'text/html'
attendre_statut "envoi sans JavaScript (page HTML)" 200
attendre_entete "page HTML du script : sa propre CSP" Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

echo "== Module manquant : les refus ne disparaissent jamais en silence =="
SERVEUR=apache-sans-rewrite
for chemin in / /README.md /api/lib/contact.php /.git/config; do
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "sans mod_rewrite : $chemin (erreur plutôt que site sans refus)" 500
    refuser_corps "sans mod_rewrite : $chemin" "PIEGE"
done
SERVEUR=apache-sans-headers
requete GET "https://$DOMAINE/"
attendre_statut "sans mod_headers : / reste servi" 200
for chemin in /README.md /api/lib/contact.php /api/config.sample.php /.git/config /.env /api/autre.php; do
    refus_sans_source "$chemin" "sans mod_headers : $chemin toujours refusé"
done

echo "== Règles de refus mod_rewrite retirées : les autres couches suffisent =="
SERVEUR=apache-sans-refus-rewrite
requete GET "https://$DOMAINE/"
attendre_statut "sans refus mod_rewrite : / reste servi" 200
# Ce serveur n'a pas FAN2HARMONIE_OAUTH_CONFIG : le relais trouve le piège oauth/config.php (invalide) → page 500
# générique, sans rien du piège.
requete GET "https://$DOMAINE/oauth/auth.php"
attendre_statut "sans refus mod_rewrite : /oauth/auth.php exécuté, configuration invalide" 500
page_oauth "sans refus mod_rewrite : /oauth/auth.php"
attendre_corps "sans refus mod_rewrite : /oauth/auth.php" "Connexion impossible"
attendre_absent "sans refus mod_rewrite : /oauth/auth.php" "Set-Cookie|Location"
for chemin in /.git/config /.git/ /.env /api/lib/contact.php /api/lib/exigences.php /oauth/lib/x.php \
    /api/config.php /api/config.sample.php /oauth/config.php /oauth/other.php /api/autre.php /script.php \
    /README.md /x.php.jpg /x.pht.jpg /x.inc.txt /API/lib/x.php /api/CONFIG.PHP /api/Autre.PHP /index.html.bak /error_log \
    /composer.json /oauth/lib/inoffensif.txt /api/lib/inoffensif.txt /oauth/lib/oauth.php /oauth/config.sample.php; do
    refus_sans_source "$chemin" "sans refus mod_rewrite : $chemin toujours refusé"
done
SERVEUR=apache

echo
if [ "$echecs" -eq 0 ]; then
    echo "RÉUSSITE : $reussis vérification(s) sur le vrai Apache."
    exit 0
fi
echo "ÉCHEC : $echecs vérification(s) en échec ($reussis réussie(s))."
exit 1
