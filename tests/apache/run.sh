#!/bin/sh
# Tests du site construit (dist/) sur un VRAI Apache 2.4 + PHP 8.3, par de vraies requêtes HTTP(S) (curl).
# Lancement : `npm run test:apache` (après `npm run build`), c'est-à-dire
#   docker compose --profile apache up --build --force-recreate --abort-on-container-exit \
#     --exit-code-from apache-tests apache apache-tests
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

# En-têtes de sécurité communs à toutes les réponses (pages, erreurs, script PHP).
entetes_securite() {
    attendre_entete "$1" X-Content-Type-Options "nosniff"
    attendre_entete "$1" Referrer-Policy "strict-origin-when-cross-origin"
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
requete GET "http://autre-nom.example/x"
attendre_statut "http://autre-nom.example/x (Host quelconque)" 301
attendre_entete "Host quelconque en http → domaine canonique" Location "https://$DOMAINE/x"
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

echo "== /admin/ et /oauth/ : sans CSP du site, jamais en cache =="
for chemin in /admin/ /oauth/; do
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "$chemin" 200
    attendre_entete "$chemin" Cache-Control "no-store"
    attendre_absent "$chemin" "Content-Security-Policy"
    entetes_securite "$chemin"
done
requete GET "https://$DOMAINE/admin/config.yml"
attendre_statut "/admin/config.yml (lu par Sveltia CMS)" 200
attendre_entete "/admin/config.yml" Cache-Control "no-store"

echo "== Fichiers jamais servis (403 ou 404, ni source ni exécution) =="
for chemin in \
    /api/lib/contact.php /api/lib/exigences.php /api/lib/ /api/lib \
    /api/config.sample.php /api/config.php /api/.user.ini /api/.htaccess /.htaccess \
    /README.md /api/LISEZMOI.md /api/autre.php /api/autre.phtml /script.php \
    /.git/config /.git/ /.git /.env /index.html.bak '/index.html~' /.index.html.swp /api/contact.php.orig \
    /error_log /api/error_log /composer.json \
    //api//lib/contact.php /api/lib/../lib/contact.php /api/./lib/contact.php /api/%6cib/contact.php \
    /API/lib/contact.php /api/LIB/contact.php /api/CONFIG.SAMPLE.PHP /%2eenv /.%65nv /api/contact.php/../lib/contact.php
do
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "$chemin" "403|404"
    for piege in PIEGE '<?php' 'namespace Fan2Harmonie' 'Index of'; do
        if grep -Fq -- "$piege" "$TMP/corps"; then ko "$chemin" "« $piege » dans le corps"; fi
    done
done
requete POST "https://$DOMAINE/api/autre.php" -d 'x=1'
attendre_statut "POST /api/autre.php" "403|404"
refuser_corps "POST /api/autre.php non exécuté" "PIEGE"
requete GET "https://$DOMAINE/.well-known/acme-challenge/jeton"
attendre_statut "/.well-known/ reste accessible (certificats)" 200
requete TRACE "https://$DOMAINE/"
attendre_statut "TRACE /" "403|405"

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
requete GET "https://$DOMAINE/.git/config"
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

head -c 40000 /dev/zero | tr '\0' 'x' > "$TMP/gros"
poster "https://$DOMAINE" application/json --data-urlencode "remplissage@$TMP/gros"
attendre_statut "corps de plus de 32 Ko (LimitRequestBody)" 413
refuser_corps "corps de plus de 32 Ko" "PIEGE"
head -c 25000 /dev/zero | tr '\0' 'x' > "$TMP/moyen"
poster "https://$DOMAINE" application/json --data-urlencode "remplissage@$TMP/moyen"
attendre_statut "corps de 25 Ko (refusé par le script, > 20 Ko)" 413
attendre_corps "corps de 25 Ko" '"ok":false'

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
    requete GET "https://$DOMAINE$chemin"
    attendre_statut "sans mod_headers : $chemin toujours refusé" "403|404"
    refuser_corps "sans mod_headers : $chemin" "PIEGE"
done
SERVEUR=apache

echo
if [ "$echecs" -eq 0 ]; then
    echo "RÉUSSITE : $reussis vérification(s) sur le vrai Apache."
    exit 0
fi
echo "ÉCHEC : $echecs vérification(s) en échec ($reussis réussie(s))."
exit 1
