# Serveur FTPS (vsftpd) et SFTP (OpenSSH) de TEST, avec lftp : contrôle de scripts/deployer.sh pour de vrai,
# sans compte d'hébergeur. Même version de lftp que le poste de GitHub Actions (ubuntu-latest = 24.04).
# Un seul conteneur (serveurs + tests), sans réseau extérieur : voir `npm run test:ftp`.
FROM ubuntu:24.04
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends lftp vsftpd openssh-server openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
