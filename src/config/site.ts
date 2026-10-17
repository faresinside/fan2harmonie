export interface Hebergeur {
  /** Raison sociale de l'hébergeur (mentions légales). */
  nom: string;
  /** Adresse postale de l'hébergeur. */
  adresse: string;
  /** Téléphone de l'hébergeur (obligatoire dans les mentions légales, loi pour la confiance dans l'économie numérique). */
  telephone: string;
  /** Adresse de son site web (https://…). */
  siteWeb: string;
}

export const site: {
  nom: string;
  url: string;
  email: string;
  /** Script de contact PHP du même hébergement (public/api/contact.php) : même origine, rien ne sort de France. */
  formEndpoint: string;
  /** SIRET, facultatif : la ligne « SIRET » des mentions légales n'apparaît que s'il est renseigné. */
  siret: string | null;
  /** Ville, facultative : affichée dans les mentions légales seulement si elle est renseignée. */
  ville: string | null;
  /** Éditrice du site et responsable de la publication (mentions légales) : prénom et nom. */
  editeur: string;
  hebergeur: Hebergeur;
} = {
  nom: 'Fan 2 Harmonie',
  /**
   * Adresse publique du site (canonique, Open Graph, plan du site, robots.txt).
   * AUDIT_SITE_URL ne sert qu'à l'audit Lighthouse (scripts/lighthouse.mjs) : variable d'environnement
   * seulement, jamais écrite dans un fichier. Hors audit, c'est toujours la valeur ci-dessous qui compte.
   */
  url: process.env['AUDIT_SITE_URL'] || 'https://fan2harmonie.fr',
  email: 'contact@fan2harmonie.fr',
  formEndpoint: '/api/contact.php',
  // Stéphanie exerce à titre gratuit, sans entreprise : pas de SIRET.
  siret: null,
  ville: null,
  editeur: 'Stéphanie Gabalda',
  hebergeur: {
    nom: 'OVH SAS',
    adresse: '2 rue Kellermann, 59100 Roubaix, France',
    telephone: '+33 9 72 10 10 07 (ou 1007 depuis la France)',
    siteWeb: 'https://www.ovhcloud.com',
  },
};
