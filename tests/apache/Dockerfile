# Apache 2.4 + PHP 8.3 (module Apache) pour tester dist/ et ses .htaccess comme sur l'hébergeur.
# Image de TEST seulement (tests/apache/run.sh) : jamais déployée.
FROM php:8.3-apache

# Modules utilisés par public/.htaccess ; certificat auto-signé (HTTPS nécessaire pour tester les réponses
# non redirigées), créé à la construction de l'image, sans réseau.
RUN a2enmod rewrite headers expires deflate ssl \
    && a2dissite 000-default \
    && mkdir -p /etc/apache2/certs \
    && openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
        -subj "/CN=fan2harmonie.fr" \
        -addext "subjectAltName=DNS:fan2harmonie.fr,DNS:www.fan2harmonie.fr,DNS:localhost" \
        -keyout /etc/apache2/certs/test.key -out /etc/apache2/certs/test.crt 2>/dev/null

COPY site.conf /etc/apache2/sites-available/fan2harmonie-test.conf
RUN a2ensite fan2harmonie-test

COPY demarrer.sh /usr/local/bin/demarrer-apache-test
CMD ["sh", "/usr/local/bin/demarrer-apache-test"]
