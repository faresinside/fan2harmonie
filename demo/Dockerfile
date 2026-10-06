# Apache 2.4 + PHP 8.3 pour la DÉMONSTRATION de fan2harmonie sur le serveur Oracle (derrière Traefik, qui termine le HTTPS).
# Même pile que celle des tests (tests/apache) et proche d'un hébergement mutualisé français : mêmes .htaccess.
FROM php:8.3-apache

# Modules utilisés par public/.htaccess ; configuration PHP « production » (display_errors Off).
RUN a2enmod rewrite headers expires deflate setenvif \
    && a2dissite 000-default \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY apache-demo.conf /etc/apache2/sites-available/fan2harmonie-demo.conf
RUN a2ensite fan2harmonie-demo \
    && printf 'ServerName fan2harmonie.casticode.com\nServerTokens Prod\n' > /etc/apache2/conf-available/f2h-nom.conf \
    && a2enconf f2h-nom
