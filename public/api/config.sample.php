<?php

/**
 * MODÈLE de configuration du formulaire de contact (api/contact.php).
 *
 * Sur le serveur, la propriétaire ou son technicien copie ce fichier sous le nom « config.php », puis l'adapte.
 * Emplacement RECOMMANDÉ : un dossier voisin de la racine web, donc hors de celle-ci :
 *     <compte>/fan2harmonie-contact/config.php   (la racine web étant par exemple <compte>/www/)
 * Autres emplacements reconnus, dans l'ordre : le chemin donné par la variable d'environnement
 * FAN2HARMONIE_CONFIG (cherché en premier), puis « api/config.php » à côté du script (dernier recours).
 * config.php n'est jamais versionné (.gitignore). Sans lui, le formulaire répond « Configuration manquante ».
 *
 * Copié tel quel, ce modèle est REFUSÉ (« Configuration invalide ») : « dossier_limiteur » et
 * « secret_limiteur » doivent d'abord être renseignés. Demandé directement par le web, ce fichier ne fait
 * que renvoyer un tableau : il n'affiche rien.
 */

declare(strict_types=1);

return [
    // Seule adresse qui reçoit les messages du formulaire.
    'destinataire' => 'contact@fan2harmonie.fr',

    // Expéditeur technique : une boîte du domaine (alignement SPF/DKIM), aussi passée à sendmail par « -f ».
    'expediteur' => 'site@fan2harmonie.fr',

    // Origines (schéma + hôte, en minuscules, sans barre finale) depuis lesquelles le formulaire est accepté.
    'origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'],

    // Nombre maximal de messages acceptés par client (adresse IPv4, ou préfixe /64 en IPv6) par heure glissante.
    'limite_par_heure' => 5,

    // Nombre maximal de messages acceptés par heure glissante, tous clients confondus.
    'limite_globale_par_heure' => 20,

    // Nombre maximal de clients suivis à la fois par le limiteur ; au-delà, les nouveaux sont refusés (429).
    'entrees_max' => 2000,

    // OBLIGATOIRE : dossier privé du compte, inscriptible par PHP, HORS de la racine web, ni ouvert à tous ni
    // partagé (pas /tmp). Ex. '/home/<compte>/fan2harmonie-contact/limiteur' (droits 0700). Il ne contient que
    // des empreintes d'adresses IP et des instants, gardés une heure au plus. Le chemin ci-dessous est à remplacer.
    'dossier_limiteur' => '/chemin/vers/un/dossier/prive/a/creer',

    // OBLIGATOIRE : secret de l'empreinte (HMAC-SHA256) des adresses IP, 32 caractères au moins, propre à ce
    // site. Par exemple le résultat de : php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
    // La valeur ci-dessous est volontairement refusée.
    'secret_limiteur' => 'CHANGER-MOI',

    // Longueur maximale du message, en caractères.
    'taille_max_message' => 5000,

    // Transport de TEST (écrit les messages dans des fichiers au lieu de les envoyer) : JAMAIS en production.
    // Il ne s'active que si cette valeur vaut true, que « dossier_transport_test » est renseigné ET que la
    // variable d'environnement MAIL_TRANSPORT du serveur vaut « file ». En production : false.
    'transport_test' => false,
];
