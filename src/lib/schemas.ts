// `astro/zod` : même instance de Zod que celle utilisée par les collections Astro.
import { z } from 'astro/zod';

export const LIEU_PAR_DEFAUT = 'Parc de Rambouillet, près de la bergerie';

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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide (AAAA-MM-JJ attendu)' });
      return z.NEVER;
    }
    return d;
  });

export const rendezvousSchema = z.object({
  date: dateSchema,
  heure: z.string().regex(HEURE_REGEX),
  lieu: z.string().default(LIEU_PAR_DEFAUT),
  remarque: z.string().optional(),
  annule: z.boolean().default(false),
});

export const actualiteSchema = z.object({
  titre: z.string().max(90),
  date: dateSchema,
  image: z.string().optional(),
});

export const pageSchema = z.object({
  titre: z.string(),
});
