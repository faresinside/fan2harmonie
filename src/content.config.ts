import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { contentBase } from './lib/fixture';
import { accueilSchema, actualiteSchema, lieuSchema, menuSchema, pageSchema, photoSchema, referencementSchema, rendezvousSchema } from './lib/schemas';

export const collections = {
  rendezvous: defineCollection({
    loader: glob({ pattern: '**/*.md', base: contentBase('rendezvous') }),
    schema: rendezvousSchema,
  }),
  actualites: defineCollection({
    loader: glob({ pattern: '**/*.md', base: contentBase('actualites') }),
    // Photos (0 à 12) : chemins relatifs au fichier Markdown, résolus en ImageMetadata pour astro:assets.
    schema: ({ image }) =>
      actualiteSchema.extend({ photos: z.array(photoSchema.extend({ image: image() })).max(12).default([]) }),
  }),
  pages: defineCollection({
    loader: glob({ pattern: '**/*.md', base: contentBase('pages') }),
    schema: pageSchema,
  }),
  // Réglages : un fichier par collection (id = nom du fichier), jamais remplacés par un jeu de test.
  reglagesAccueil: defineCollection({
    loader: glob({ pattern: 'accueil.md', base: contentBase('reglages') }),
    schema: accueilSchema,
  }),
  reglagesLieu: defineCollection({
    loader: glob({ pattern: 'lieu.md', base: contentBase('reglages') }),
    schema: lieuSchema,
  }),
  reglagesReferencement: defineCollection({
    loader: glob({ pattern: 'referencement.md', base: contentBase('reglages') }),
    schema: referencementSchema,
  }),
  reglagesMenu: defineCollection({
    loader: glob({ pattern: 'menu.md', base: contentBase('reglages') }),
    schema: menuSchema,
  }),
};
