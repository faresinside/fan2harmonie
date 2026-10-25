// `astro/zod` : même instance de Zod que celle utilisée par les collections Astro.
import { z } from 'astro/zod';

/** Format HH:MM, 00:00 à 23:59 (réutilisable, p. ex. par la config du CMS). */
export const HEURE_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Format AAAA-MM-JJ. */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date stricte, sortie : Date (minuit UTC du jour).
 * Accepte un Date valide (le chargeur glob d'Astro convertit `date: 2026-10-10`
 * non quoté en Date) ou une chaîne AAAA-MM-JJ sans débordement (2026-02-30 rejeté).
 */
export const dateSchema = z
  .union([z.date(), z.string().regex(DATE_REGEX)])
  .transform((v, ctx) => {
    const d = typeof v === 'string' ? new Date(`${v}T00:00:00.000Z`) : v;
    const invalid =
      Number.isNaN(d.getTime()) || (typeof v === 'string' && d.toISOString().slice(0, 10) !== v);
    if (invalid) {
      ctx.addIssue({ code: 'custom', message: 'Date invalide (AAAA-MM-JJ attendu)' });
      return z.NEVER;
    }
    return d;
  });

export const rendezvousSchema = z.object({
  date: dateSchema,
  heure: z.string().regex(HEURE_REGEX),
  /** Facultatif : absent ou vide, la séance a lieu au lieu habituel (réglages « Lieu de la pratique »). */
  lieu: z.string().optional(),
  remarque: z.string().optional(),
  annule: z.boolean().default(false),
});

export type Rendezvous = z.infer<typeof rendezvousSchema>;

/** Une photo d'actualité : fichier (chemin relatif au .md) et légende facultative, qui sert de texte alternatif. */
export const photoSchema = z.object({
  image: z.string(),
  legende: z.string().max(120).optional(),
});

export const actualiteSchema = z.object({
  titre: z.string().max(90),
  date: dateSchema,
  photos: z.array(photoSchema).max(12).optional(),
});

export const pageSchema = z.object({
  titre: z.string(),
  /** Phrase d'accroche sous le titre (seulement la page « Les offres de séances »). */
  accroche: z.string().max(200).optional(),
});

/** Icônes disponibles pour les bienfaits de l'accueil (composants Icon*.astro). */
export const ICONES_BIENFAIT = ['souffle', 'lotus', 'silhouette', 'yinyang'] as const;

/** Textes de la page d'accueil (src/content/reglages/accueil.md). */
export const accueilSchema = z.object({
  accroche: z.string().min(1).max(60),
  titre: z.string().min(1).max(40),
  sousTitre: z.string().min(1).max(60),
  devise: z.string().min(1).max(80),
  infos: z.array(z.string().min(1).max(60)).min(1).max(5),
  bouton: z.string().min(1).max(30),
  bienfaits: z
    .array(
      z.object({
        icone: z.enum(ICONES_BIENFAIT),
        libelle: z.string().min(1).max(60),
      }),
    )
    .min(1)
    .max(6),
});

export type Accueil = z.infer<typeof accueilSchema>;

/** Lieu de la pratique (src/content/reglages/lieu.md ; les indications d'accès sont le corps du fichier). */
export const lieuSchema = z.object({
  nom: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type Lieu = z.infer<typeof lieuSchema>;

/** Code de vérification Google Search Console : seulement la valeur de `content`, pas la balise. */
export const CODE_GOOGLE_REGEX = /^[A-Za-z0-9_-]{20,100}$/;

/** Référencement de l'accueil (src/content/reglages/referencement.md). */
export const referencementSchema = z.object({
  titre: z.string().min(10).max(70),
  description: z.string().min(50).max(170),
  verificationGoogle: z.string().regex(CODE_GOOGLE_REGEX).optional(),
});

export type Referencement = z.infer<typeof referencementSchema>;

/** Un libellé ou un titre modifiable : sans espaces autour, jamais vide (ni fait seulement d'espaces). */
const texteReglable = (max: number) => z.string().trim().min(1).max(max);

/**
 * Menu du haut et titres des sections de l'accueil (src/content/reglages/menu.md).
 * Seuls les mots changent : l'ordre des liens et les sections visées sont fixes.
 */
export const menuSchema = z.object({
  rdv: texteReglable(30),
  pratique: texteReglable(30),
  offres: texteReglable(30),
  qigong: texteReglable(30),
  qui: texteReglable(30),
  actualites: texteReglable(30),
  contact: texteReglable(30),
  titreRdv: texteReglable(60),
  titreActualites: texteReglable(60),
  titreContact: texteReglable(60),
});

export type Menu = z.infer<typeof menuSchema>;
