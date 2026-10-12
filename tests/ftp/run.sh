#!/bin/bash
# Teste scripts/deployer.sh contre un VRAI serveur FTPS (vsftpd, certificat auto-signé donné par DEPLOY_CA_FILE)
# et un VRAI serveur SFTP (OpenSSH), dans ce conteneur. Lancement : `npm run test:ftp`.
# Code de sortie non nul au moindre échec.
set -u

MOT_DE_PASSE="p@ss w\"or'd\$HOME#\\x"
reussis=0
echecs=0
ok() { reussis=$((reussis + 1)); printf '✓ %s\n' "$1"; }
ko() { echecs=$((echecs + 1)); printf '✗ %s\n    %s\n' "$1" "$2"; }

# --- Mise en place des serveurs -------------------------------------------------------------------------------
useradd -m -s /bin/bash deploy
printf 'deploy:%s\n' "$MOT_DE_PASSE" | chpasswd
mkdir -p /etc/ssl/ftp-test /var/run/vsftpd/empty /run/sshd
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' \
    -keyout /etc/ssl/ftp-test/cle.pem -out /etc/ssl/ftp-test/cert.pem 2> /dev/null
cp /tests/vsftpd.conf /etc/vsftpd.conf
vsftpd /etc/vsftpd.conf &
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
/usr/sbin/sshd
ssh-keyscan -t ed25519 localhost 2> /dev/null > /tmp/known_hosts
# known_hosts FAUX : même type de clé, autre empreinte.
ssh-keygen -q -t ed25519 -N '' -f /tmp/autre_cle
printf 'localhost %s\n' "$(cut -d' ' -f1,2 /tmp/autre_cle.pub)" > /tmp/known_hosts_faux
for _ in $(seq 1 50); do
    (exec 3<> /dev/tcp/127.0.0.1/21) 2> /dev/null && break
    sleep 0.2
done

# --- Site de test : dist/ factice -----------------------------------------------------------------------------
SRC=/tmp/dist
rm -rf "$SRC"
mkdir -p "$SRC/_astro" "$SRC/api" "$SRC/oauth/lib" "$SRC/actualites/a b"
echo '<html>accueil v1</html>' > "$SRC/index.html"
echo 'Options -Indexes' > "$SRC/.htaccess"
echo 'body{}' > "$SRC/_astro/a.css"
echo '<?php // contact' > "$SRC/api/contact.php"
echo '<?php // MAUVAIS : ne doit jamais partir' > "$SRC/api/config.php"
echo '<?php // MAUVAIS' > "$SRC/oauth/config.php"
echo '<?php // auth' > "$SRC/oauth/auth.php"
echo 'x' > "$SRC/oauth/lib/oauth.php"
echo 'page' > "$SRC/actualites/a b/index.html"

WWW=/home/deploy/www
reinitialiser() {
    rm -rf "$WWW"
    mkdir -p "$WWW/api" "$WWW/oauth" "$WWW/cgi-bin" "$WWW/.well-known/acme-challenge"
    touch "$WWW/.fan2harmonie-site"
    echo 'SECRET-FORMULAIRE' > "$WWW/api/config.php"
    echo 'SECRET-OAUTH' > "$WWW/oauth/config.php"
    echo 'journal' > "$WWW/error_log"
    echo 'journal api' > "$WWW/api/error_log"
    echo 'cgi' > "$WWW/cgi-bin/script"
    echo 'defi' > "$WWW/.well-known/acme-challenge/jeton"
    echo 'user:hash' > "$WWW/.htpasswd"
    echo 'display_errors=Off' > "$WWW/.user.ini"
    echo 'page par défaut' > "$WWW/ancienne-page.html"
    chown -R deploy:deploy "$WWW"
}

# deployer PROTOCOLE [VARIABLE=valeur…] : lance scripts/deployer.sh ; sortie dans /tmp/sortie.
deployer() {
    local proto=$1
    shift
    local env_proto=(DEPLOY_PROTOCOL="$proto" DEPLOY_HOST=localhost DEPLOY_USER=deploy DEPLOY_PASSWORD="$MOT_DE_PASSE" REMOTE_PATH=www SOURCE="$SRC")
    if [ "$proto" = ftps ]; then env_proto+=(DEPLOY_CA_FILE=/etc/ssl/ftp-test/cert.pem); else env_proto+=(DEPLOY_KNOWN_HOSTS=/tmp/known_hosts); fi
    env "${env_proto[@]}" "$@" bash /app/scripts/deployer.sh > /tmp/sortie 2>&1
}

existe() { [ -e "$WWW/$1" ]; }
contient() { grep -qF -- "$2" "$WWW/$1" 2> /dev/null; }

verifier_site_en_ligne() { # $1 = libellé
    local manque=""
    for f in index.html .htaccess _astro/a.css api/contact.php oauth/auth.php oauth/lib/oauth.php "actualites/a b/index.html"; do
        existe "$f" || manque="$manque $f"
    done
    if [ -z "$manque" ]; then ok "$1 : tous les fichiers (cachés et avec espace compris) sont envoyés"; else ko "$1 : fichiers manquants" "$manque"; fi
    if contient index.html 'accueil v1'; then ok "$1 : contenu envoyé"; else ko "$1 : contenu" "index.html n'est pas la v1"; fi
}
verifier_fichiers_serveur_intacts() { # $1 = libellé
    local abime=""
    contient api/config.php SECRET-FORMULAIRE || abime="$abime api/config.php"
    contient oauth/config.php SECRET-OAUTH || abime="$abime oauth/config.php"
    existe error_log || abime="$abime error_log"
    existe api/error_log || abime="$abime api/error_log"
    existe cgi-bin/script || abime="$abime cgi-bin/script"
    existe .well-known/acme-challenge/jeton || abime="$abime acme-challenge"
    existe .htpasswd || abime="$abime .htpasswd"
    existe .user.ini || abime="$abime .user.ini"
    existe .fan2harmonie-site || abime="$abime .fan2harmonie-site"
    if [ -z "$abime" ]; then ok "$1 : fichiers propres au serveur intacts"; else ko "$1 : fichiers du serveur abîmés" "$abime"; fi
}

for proto in ftps sftp; do
    echo "=== $proto ==="
    reinitialiser
    if deployer "$proto"; then ok "$proto : première mise en ligne réussie"; else ko "$proto : première mise en ligne" "$(tail -n 15 /tmp/sortie)"; fi
    verifier_site_en_ligne "$proto"
    verifier_fichiers_serveur_intacts "$proto"
    if existe ancienne-page.html; then ko "$proto : fichier périmé" "ancienne-page.html aurait dû être supprimé"; else ok "$proto : fichier périmé supprimé"; fi

    # Deuxième passage : un fichier modifié (même taille, contenu différent) est bien renvoyé.
    sleep 1
    echo '<html>accueil v2</html>' > "$SRC/index.html"
    if deployer "$proto"; then ok "$proto : seconde mise en ligne réussie"; else ko "$proto : seconde mise en ligne" "$(tail -n 15 /tmp/sortie)"; fi
    if contient index.html 'accueil v2'; then ok "$proto : fichier modifié renvoyé"; else ko "$proto : fichier modifié" "index.html est resté en v1"; fi
    echo '<html>accueil v1</html>' > "$SRC/index.html"

    # Un fichier supprimé de dist/ disparaît du serveur.
    rm "$SRC/oauth/lib/oauth.php"
    deployer "$proto" || ko "$proto : retrait d'un fichier" "$(tail -n 15 /tmp/sortie)"
    if existe oauth/lib/oauth.php; then ko "$proto : fichier retiré de dist/" "toujours présent sur le serveur"; else ok "$proto : fichier retiré de dist/ supprimé du serveur"; fi
    echo 'x' > "$SRC/oauth/lib/oauth.php"

    # Fichier témoin absent : rien n'est copié ni supprimé.
    reinitialiser
    rm "$WWW/.fan2harmonie-site"
    if deployer "$proto"; then
        ko "$proto : témoin absent" "le déploiement aurait dû échouer"
    elif grep -q 'témoin' /tmp/sortie; then
        ok "$proto : témoin absent → refus, message clair"
    else
        ko "$proto : témoin absent" "message inattendu : $(tail -n 5 /tmp/sortie)"
    fi
    if existe index.html || ! existe ancienne-page.html; then ko "$proto : témoin absent" "le serveur a été modifié"; else ok "$proto : témoin absent → serveur intact"; fi

    # Trop de suppressions : arrêt avant toute copie.
    reinitialiser
    for i in 1 2 3 4 5; do echo x > "$WWW/vieux-$i.html"; done
    chown -R deploy:deploy "$WWW"
    if deployer "$proto" SEUIL_SUPPRESSIONS=3; then
        ko "$proto : seuil de suppressions" "le déploiement aurait dû échouer"
    elif grep -q 'suppr' /tmp/sortie; then
        ok "$proto : trop de suppressions → refus, message clair"
    else
        ko "$proto : seuil" "message inattendu : $(tail -n 5 /tmp/sortie)"
    fi
    if existe index.html || ! existe vieux-1.html; then ko "$proto : seuil" "le serveur a été modifié"; else ok "$proto : trop de suppressions → serveur intact"; fi

    # Mauvais mot de passe.
    reinitialiser
    if deployer "$proto" DEPLOY_PASSWORD=mauvais; then ko "$proto : mauvais mot de passe" "le déploiement aurait dû échouer"; else ok "$proto : mauvais mot de passe → refus"; fi
    if existe index.html; then ko "$proto : mauvais mot de passe" "des fichiers ont été envoyés"; else ok "$proto : mauvais mot de passe → rien d'envoyé"; fi

    # Mauvais dossier distant.
    if deployer "$proto" REMOTE_PATH=nexiste/pas; then ko "$proto : dossier absent" "le déploiement aurait dû échouer"; else ok "$proto : dossier distant absent → refus"; fi
done

echo "=== garde-fous propres à chaque protocole ==="
reinitialiser
# FTPS sans le certificat de confiance : le certificat auto-signé du serveur doit être REFUSÉ.
if deployer ftps DEPLOY_CA_FILE=; then ko "ftps : certificat inconnu" "le déploiement aurait dû échouer"; else ok "ftps : certificat non reconnu → refus"; fi
if existe index.html; then ko "ftps : certificat inconnu" "des fichiers ont été envoyés"; else ok "ftps : certificat non reconnu → rien d'envoyé"; fi
# Nom d'hôte qui ne correspond pas au certificat.
if deployer ftps DEPLOY_HOST=127.0.0.1; then ko "ftps : nom d'hôte différent du certificat" "le déploiement aurait dû échouer"; else ok "ftps : nom d'hôte différent du certificat → refus"; fi
# SFTP : known_hosts erroné ou absent.
if deployer sftp DEPLOY_KNOWN_HOSTS=/tmp/known_hosts_faux; then ko "sftp : empreinte fausse" "le déploiement aurait dû échouer"; else ok "sftp : empreinte du serveur fausse → refus"; fi
if existe index.html; then ko "sftp : empreinte fausse" "des fichiers ont été envoyés"; else ok "sftp : empreinte fausse → rien d'envoyé"; fi
if deployer sftp DEPLOY_KNOWN_HOSTS=; then ko "sftp : sans known_hosts" "le déploiement aurait dû échouer"; else ok "sftp : sans known_hosts → refus"; fi
# Paramètres invalides.
for mauvais in "DEPLOY_PROTOCOL=ftp" "DEPLOY_HOST=-oProxyCommand=id" "DEPLOY_USER=a;b" "REMOTE_PATH=/www" "REMOTE_PATH=../etc" "DEPLOY_PORT=abc" "DEPLOY_PASSWORD="; do
    if deployer ftps "$mauvais"; then ko "paramètre invalide $mauvais" "le déploiement aurait dû échouer"; else ok "paramètre invalide $mauvais → refus"; fi
done

echo
echo "$reussis réussis, $echecs échecs"
[ "$echecs" -eq 0 ]
