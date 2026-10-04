// `astro/zod` : même instance de Zod que celle utilisée par les collections Astro.
import { z } from 'astro/zod';

export const LIEU_PAR_DEFAUT = 'Parc de Rambouillet, près de la bergerie';

export const rendezvousSchema = z.object({
  date: z.coerce.date(),
  heure: z.string().regex(/^\d{2}:\d{2}$/),
  lieu: z.string().default(LIEU_PAR_DEFAUT),
  remarque: z.string().optional(),
  annule: z.boolean().default(false),
});

export const actualiteSchema = z.object({
  titre: z.string().max(90),
  date: z.coerce.date(),
  image: z.string().optional(),
});

export const pageSchema = z.object({
  titre: z.string(),
});
