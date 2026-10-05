<?php

/**
 * MODÈLE de configuration du relais de connexion GitHub de /admin (oauth/auth.php, oauth/callback.php).
 *
 * Sur le serveur, le technicien copie ce fichier sous le nom « oauth-config.php », puis l'adapte.
 * Emplacement RECOMMANDÉ : le même dossier privé que la configuration du formulaire, voisin de la racine web,
 * donc hors de celle-ci :
 *     <compte>/fan2harmonie-contact/oauth-config.php   (droits 0600 ; la racine web étant par exemple <compte>/www/)
 * Autres emplacements reconnus, dans l'ordre : le chemin donné par la variable d'environnement
 * FAN2HARMONIE_OAUTH_CONFIG (cherché en premier), puis « oauth/config.php » à côté des scripts (dernier recours,
 * jamais écrasé par le déploiement). Le vrai fichier n'est JAMAIS versionné. Sans lui : page 500 générique.
 *
 * Copié tel quel, ce modèle est REFUSÉ (« configuration invalide » dans le journal) : client_id et client_secret
 * doivent d'abord être renseignés. Demandé directement par le web, ce fichier ne fait que renvoyer un tableau :
 * il n'affiche rien (et le serveur en refuse l'accès).
 */

declare(strict_types=1);

return [
    // OBLIGATOIRE : « Client ID » de l'OAuth App GitHub (GitHub > Settings > Developer settings > OAuth Apps),
    // dont l'adresse de rappel (« Authorization callback URL ») est exactement url_callback ci-dessous.
    'client_id' => 'CHANGER-MOI',

    // OBLIGATOIRE et SECRET : « Client secret » de la même OAuth App. Ne jamais l'écrire ailleurs que dans ce
    // fichier sur le serveur (ni dans le dépôt, ni dans un courriel). La valeur ci-dessous est refusée.
    'client_secret' => 'CHANGER-MOI',

    // Origines (schéma + hôte, en minuscules, sans barre finale) de l'administration /admin, seules à recevoir
    // le jeton. Par défaut : ['https://fan2harmonie.fr'].
    'origines_autorisees' => ['https://fan2harmonie.fr'],

    // Droits demandés à GitHub : « repo » si le dépôt du site est PRIVÉ (par défaut), « public_repo » s'il est
    // public (droits plus étroits). Aucune autre valeur n'est acceptée.
    'scope' => 'repo',

    // Adresse de retour, identique à celle déclarée dans l'OAuth App. Par défaut :
    // 'https://fan2harmonie.fr/oauth/callback.php'.
    'url_callback' => 'https://fan2harmonie.fr/oauth/callback.php',

    // Adresses de GitHub : valeurs par défaut correctes, à ne JAMAIS changer en production. Elles ne sont
    // modifiables, ici seulement, que pour les tests (faux GitHub local) :
    // 'github_url_autorisation' => 'https://github.com/login/oauth/authorize',
    // 'github_url_jeton' => 'https://github.com/login/oauth/access_token',
];
