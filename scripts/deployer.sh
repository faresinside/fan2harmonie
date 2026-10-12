#!/bin/bash
# Mise en ligne de dist/ chez l'hébergeur par FTPS (FTP avec chiffrement) ou SFTP, avec lftp.
# Lancé par .github/workflows/deploiement.yml (job « deployer ») et par les tests (tests/ftp/).
#
# Paramètres, TOUS par variables d'environnement (jamais en argument : ils apparaîtraient dans la liste des
# processus) :
#   DEPLOY_PROTOCOL     ftps | sftp
#   DEPLOY_HOST         nom du serveur (lettres, chiffres, . _ -)
#   DEPLOY_USER         compte FTP / SFTP
#   DEPLOY_PASSWORD     mot de passe (donné à lftp par son entrée standard, jamais dans un fichier ni un argument)
#   DEPLOY_PORT         port (vide = 21 en FTPS, 22 en SFTP)
#   REMOTE_PATH         dossier distant RELATIF à la racine du compte (ex. www)
#   DEPLOY_KNOWN_HOSTS  fichier known_hosts, OBLIGATOIRE en SFTP (empreinte du serveur vérifiée, jamais acceptée à l'aveugle)
#   DEPLOY_CA_FILE      facultatif : certificat d'autorité en plus de ceux du système (tests, serveur de test)
#   SOURCE              dossier à envoyer (défaut : dist)
#   SEUIL_SUPPRESSIONS  nombre maximal de fichiers supprimables sur le serveur (défaut : 100)
#
# Déroulement (le même garde-fou qu'avec rsync, en quatre couches) :
#   1. forme des paramètres (scripts/valider-connexion.sh, scripts/valider-remote-path.sh) ;
#   2. fichier témoin .fan2harmonie-site, créé à la main une fois sur le serveur, dans REMOTE_PATH : absent, arrêt
#      sans rien copier ni supprimer ;
#   3. passage à blanc (rien n'est modifié) : plus de SEUIL_SUPPRESSIONS suppressions, arrêt avant toute copie ;
#   4. copie réelle. Les fichiers propres au serveur (config, error_log, .htpasswd…) ne sont jamais envoyés ni supprimés.
# La vérification du certificat est TOUJOURS active : aucune option pour la désactiver.
set -euo pipefail

cd "$(dirname "$0")/.."
SOURCE=${SOURCE:-dist}
SEUIL_SUPPRESSIONS=${SEUIL_SUPPRESSIONS:-100}
PROTOCOLE=${DEPLOY_PROTOCOL:-}
HOTE=${DEPLOY_HOST:-}
UTILISATEUR=${DEPLOY_USER:-}
PORT=${DEPLOY_PORT:-}
DISTANT=${REMOTE_PATH:-}
DISTANT=${DISTANT%/}

erreur() {
    echo "::error::$1" >&2
    exit 1
}

sh scripts/valider-connexion.sh "$PROTOCOLE" "$HOTE" "$UTILISATEUR" "$PORT" || erreur "Paramètres de connexion invalides (voir ci-dessus)."
sh scripts/valider-remote-path.sh "$DISTANT" || erreur "REMOTE_PATH invalide (voir scripts/valider-remote-path.sh)."
[ -n "${DEPLOY_PASSWORD:-}" ] || erreur "DEPLOY_PASSWORD vide."
case $DEPLOY_PASSWORD in *$'\n'*) erreur "DEPLOY_PASSWORD contient un retour à la ligne." ;; esac
[ -d "$SOURCE" ] || erreur "Dossier $SOURCE introuvable."
[ -f "$SOURCE/index.html" ] || erreur "$SOURCE/index.html absent : la construction est incomplète."

# Réglages lftp. Les valeurs interpolées ont été validées plus haut (lettres, chiffres, . _ - /).
reglages=(
    "set cmd:fail-exit yes"
    "set cmd:interactive no"
    "set net:max-retries 3"
    "set net:timeout 30"
    "set net:reconnect-interval-base 5"
    # Les fichiers cachés (.htaccess, .user.ini…) doivent apparaître dans les listings FTP.
    "set ftp:list-options -a"
    "set mirror:parallel-transfer-count 2"
    "set xfer:clobber yes"
)
case $PROTOCOLE in
    ftps)
        reglages+=(
            "set ftp:ssl-force yes"
            "set ftp:ssl-protect-data yes"
            "set ftp:ssl-protect-list yes"
            "set ftp:ssl-allow yes"
            "set ssl:verify-certificate yes"
            "set ssl:check-hostname yes"
            # Pas de SSL 3 ni de TLS 1.0 / 1.1 (lftp de Ubuntu : GnuTLS).
            "set ssl:priority NORMAL:-VERS-SSL3.0:-VERS-TLS1.0:-VERS-TLS1.1"
        )
        [ -z "${DEPLOY_CA_FILE:-}" ] || reglages+=("set ssl:ca-file \"$DEPLOY_CA_FILE\"")
        url="ftp://$HOTE${PORT:+:$PORT}"
        ;;
    sftp)
        [ -n "${DEPLOY_KNOWN_HOSTS:-}" ] && [ -s "$DEPLOY_KNOWN_HOSTS" ] || erreur "DEPLOY_KNOWN_HOSTS (fichier known_hosts) exigé en SFTP."
        reglages+=(
            "set sftp:auto-confirm no"
            "set sftp:connect-program \"ssh -a -x -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no\""
        )
        url="sftp://$HOTE${PORT:+:$PORT}"
        ;;
esac

# Mot de passe : transmis à lftp sur son entrée standard (jamais en argument, donc invisible dans la liste des
# processus, ni dans un fichier), entre guillemets, « \ » et « " » protégés par un « \ ».
mdp_lftp=${DEPLOY_PASSWORD//\\/\\\\}
mdp_lftp=${mdp_lftp//\"/\\\"}
dossier_temp=$(mktemp -d)
trap 'rm -rf "$dossier_temp"' EXIT
journal=$dossier_temp/lftp.log

# Exécute des commandes lftp sur le serveur (entrée standard = les commandes après la connexion).
lftp_sur_serveur() {
    {
        printf '%s\n' "${reglages[@]}"
        printf 'open -u "%s,%s" "%s"\n' "$UTILISATEUR" "$mdp_lftp" "$url"
        printf 'cd "%s"\n' "$DISTANT"
        cat
    } | lftp -f /dev/stdin
}

# Fichiers propres au serveur : exclus de l'envoi ET de la suppression (expressions régulières de lftp,
# appliquées au chemin relatif ; un dossier se termine par « / »).
exclusions=(
    -x '^\.fan2harmonie-site$'
    -x '^api/config\.php$'
    -x '^oauth/config\.php$'
    -x '(^|/)error_log$'
    -x '^\.well-known/'
    -x '^cgi-bin/'
    -x '^\.htpasswd$'
    -x '^\.user\.ini$'
)

# Connexion et dossier distant (la commande « cd » est dans lftp_sur_serveur), avant tout le reste.
if ! printf 'pwd\n' | lftp_sur_serveur > /dev/null 2> "$journal"; then
    echo "Journal lftp :" >&2
    tail -n 20 "$journal" >&2
    erreur "connexion ou dossier $DISTANT impossible (voir le journal ci-dessus ; vérifier les identifiants et REMOTE_PATH)."
fi

# Couche 2 : fichier témoin (absent : « cls » échoue ou ne renvoie rien selon le serveur).
temoin=$(printf 'cls -1 .fan2harmonie-site\n' | lftp_sur_serveur 2> /dev/null || true)
if [ "$(printf '%s' "$temoin" | tr -d '\r' | tail -n 1)" != ".fan2harmonie-site" ]; then
    erreur "fichier témoin .fan2harmonie-site absent : REMOTE_PATH n'est pas la racine du site"
fi

# Couche 3 : passage à blanc, mêmes exclusions que la vraie copie.
if ! printf 'mirror -R --dry-run --delete --no-perms --verbose=3 %s "%s" .\n' "$(printf "'%s' " "${exclusions[@]}")" "$SOURCE" \
    | lftp_sur_serveur > "$journal.essai" 2>> "$journal"; then
    tail -n 50 "$journal" >&2
    erreur "échec du passage à blanc (fin du journal ci-dessus)."
fi
suppressions=$(grep -Ec '^(rm|rmdir)( |$)' "$journal.essai" || true)
if [ "$suppressions" -gt "$SEUIL_SUPPRESSIONS" ]; then
    echo "$suppressions fichiers seraient supprimés sur le serveur (seuil : $SEUIL_SUPPRESSIONS). Rien n'a été copié. Premiers fichiers concernés :" >&2
    grep -E '^(rm|rmdir)( |$)' "$journal.essai" | head -n 20 >&2
        erreur "trop de suppressions : vérifier REMOTE_PATH et $SOURCE/."
fi

# Couche 4 : copie réelle (les suppressions viennent à la fin : lftp ne supprime qu'après avoir tout envoyé).
if ! printf 'mirror -R --delete --no-perms --verbose=1 %s "%s" .\n' "$(printf "'%s' " "${exclusions[@]}")" "$SOURCE" \
    | lftp_sur_serveur > "$journal.copie" 2>> "$journal"; then
    tail -n 50 "$journal" >&2
    erreur "échec de la copie (fin du journal ci-dessus)."
fi
envoyes=$(grep -Ec '^(Transferring file|Removing|Making directory|Removing old)' "$journal.copie" || true)
tail -n 15 "$journal.copie"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## Mise en ligne"
        echo ""
        echo "- Version : \`${VERSION:-inconnue}\` (déclencheur : ${GITHUB_EVENT_NAME:-manuel})"
        echo "- Protocole : $PROTOCOLE ; éléments envoyés ou supprimés : $envoyes ; suppressions prévues : $suppressions"
    } >> "$GITHUB_STEP_SUMMARY"
fi
echo "Mise en ligne terminée."
