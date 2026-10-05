<?php

/**
 * MODÈLE de configuration du formulaire de contact (api/contact.php).
 *
 * Sur le serveur : copier ce fichier en « config.php » dans le même dossier (api/), puis l'adapter.
 * config.php n'est jamais versionné (.gitignore) : il est créé sur le serveur par la propriétaire ou son
 * technicien. Sans lui, le formulaire répond « Configuration manquante » (500).
 * Demandé directement par le web, ce fichier ne fait que renvoyer un tableau : il n'affiche rien.
 */

declare(strict_types=1);

return [
    // Seule adresse qui reçoit les messages du formulaire.
    'destinataire' => 'contact@fan2harmonie.fr',

    // Expéditeur technique : une boîte du domaine (alignement SPF/DKIM), aussi passée à sendmail par « -f ».
    'expediteur' => 'site@fan2harmonie.fr',

    // Origines (schéma + hôte, en minuscules, sans barre finale) depuis lesquelles le formulaire est accepté.
    'origines_autorisees' => ['https://fan2harmonie.fr', 'https://www.fan2harmonie.fr'],

    // Nombre maximal de messages acceptés par adresse IP sur une heure glissante.
    'limite_par_heure' => 5,

    // Dossier inscriptible par PHP pour le limiteur, de préférence HORS de la racine web et propre au compte
    // (ex. '/home/<compte>/donnees-contact'). Il ne contient que des empreintes d'adresses IP et des instants,
    // gardés une heure au plus. À défaut : le dossier temporaire du système.
    'dossier_limiteur' => sys_get_temp_dir(),

    // Secret de l'empreinte (HMAC-SHA256) des adresses IP : 32 caractères au moins. Laisser vide pour qu'un
    // secret aléatoire soit créé et gardé dans dossier_limiteur.
    'secret_limiteur' => '',

    // Longueur maximale du message, en caractères.
    'taille_max_message' => 5000,

    // Transport de TEST (écrit les messages dans des fichiers au lieu de les envoyer) : JAMAIS en production.
    // Il ne s'active que si cette valeur vaut true, que « dossier_transport_test » est renseigné ET que la
    // variable d'environnement MAIL_TRANSPORT vaut « file ». En production : false.
    'transport_test' => false,
];
