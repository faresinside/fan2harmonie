#!/bin/sh
# Adapte une COPIE du code du site à la démonstration (casticode.com). Ne touche JAMAIS au dépôt lui-même :
# le script est lancé par mettre-a-jour.sh sur un clone jetable, avant la construction.
#
# Usage : sh appliquer-demo.sh <dossier du clone>
#
# Ce qui change pour la démonstration (et seulement cela) :
#   - adresse du site       : https://fan2harmonie.fr  ->  https://fan2harmonie.casticode.com
#                             (site.ts, règle de domaine canonique de public/.htaccess, base_url de l'administration)
#   - SIRET                 : masqué (pas de ligne SIRET dans les mentions légales)
#   - hébergeur             : « Serveur de démonstration » (le vrai hébergeur français sera renseigné plus tard)
# Chaque remplacement est VÉRIFIÉ : le script s'arrête si une valeur attendue n'a pas été trouvée.
set -eu

RACINE="${1:?Usage : appliquer-demo.sh <dossier du clone>}"
HOTE_DEMO="fan2harmonie.casticode.com"

SITE_TS="$RACINE/src/config/site.ts"
HTACCESS="$RACINE/public/.htaccess"
CONFIG_YML="$RACINE/public/admin/config.yml"

for f in "$SITE_TS" "$HTACCESS" "$CONFIG_YML"; do
  [ -f "$f" ] || { echo "Fichier introuvable : $f" >&2; exit 1; }
done

verifier() { # verifier <description> <fichier> <motif attendu>
  grep -q -F -- "$3" "$2" || { echo "ÉCHEC de l'adaptation : $1 (« $3 » absent de $2)" >&2; exit 1; }
}

# 1. src/config/site.ts
sed -i "s#|| 'https://fan2harmonie\.fr'#|| 'https://$HOTE_DEMO'#" "$SITE_TS"
sed -i "s#^  siret: '.*',#  siret: null,#" "$SITE_TS"
sed -i "s#^    nom: 'À_COMPLÉTER',#    nom: 'Serveur de démonstration',#" "$SITE_TS"
sed -i "s#^    adresse: 'À_COMPLÉTER',#    adresse: 'Version de démonstration (hébergement définitif en France)',#" "$SITE_TS"
sed -i "s#^    siteWeb: 'À_COMPLÉTER',#    siteWeb: 'https://$HOTE_DEMO',#" "$SITE_TS"
verifier "adresse du site" "$SITE_TS" "https://$HOTE_DEMO'"
verifier "SIRET masqué" "$SITE_TS" "siret: null,"
verifier "hébergeur (nom)" "$SITE_TS" "Serveur de démonstration"
verifier "hébergeur (site web)" "$SITE_TS" "siteWeb: 'https://$HOTE_DEMO'"
if grep -q "À_COMPLÉTER" "$SITE_TS"; then echo "ÉCHEC : il reste une valeur À_COMPLÉTER dans site.ts" >&2; exit 1; fi

# 2. public/.htaccess : nom de domaine canonique (écrit sous deux formes : expression régulière et adresse)
sed -i 's#fan2harmonie\\\.fr#fan2harmonie\\.casticode\\.com#g' "$HTACCESS"
sed -i "s#fan2harmonie\.fr#$HOTE_DEMO#g" "$HTACCESS"
verifier "domaine canonique (adresse)" "$HTACCESS" "https://$HOTE_DEMO%{REQUEST_URI}"
verifier "domaine canonique (expression)" "$HTACCESS" '^fan2harmonie\.casticode\.com\.?(:443)?$'
if grep -q 'fan2harmonie\.fr' "$HTACCESS"; then echo "ÉCHEC : le domaine d'origine subsiste dans .htaccess" >&2; exit 1; fi

# 3. public/admin/config.yml : adresse du relais de connexion
sed -i "s#https://fan2harmonie\.fr#https://$HOTE_DEMO#g" "$CONFIG_YML"
verifier "base_url de l'administration" "$CONFIG_YML" "https://$HOTE_DEMO"

echo "Adaptation à la démonstration appliquée : $HOTE_DEMO"
