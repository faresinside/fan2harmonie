export interface Hebergeur {
  /** Raison sociale de l'hébergeur (mentions légales). */
  nom: string;
  /** Adresse postale de l'hébergeur. */
  adresse: string;
  /** Adresse de son site web (https://…). */
  siteWeb: string;
}

export const site: {
  nom: string;
  url: string;
  email: string;
  /** Script de contact PHP du même hébergement (public/api/contact.php) : même origine, rien ne sort de France. */
  formEndpoint: string;
  gps: { lat: 48.64703; lon: 1.811268 };
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
  gps: { lat: 48.64703, lon: 1.811268 },
  // EXEMPLE — à remplacer par le vrai SIRET de Stéphanie
  siret: '123 456 789 00012',
  ville: null,
  editeur: 'Stéphanie Gabalda',
  hebergeur: {
    nom: 'À_COMPLÉTER',
    adresse: 'À_COMPLÉTER',
    siteWeb: 'À_COMPLÉTER',
  },
};
