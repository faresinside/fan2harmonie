import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { contentBase } from './lib/fixture';
import { accueilSchema, actualiteSchema, lieuSchema, pageSchema, referencementSchema, rendezvousSchema } from './lib/schemas';

export const collections = {
  rendezvous: defineCollection({
    loader: glob({ pattern: '**/*.md', base: contentBase('rendezvous') }),
    schema: rendezvousSchema,
  }),
  actualites: defineCollection({
    loader: glob({ pattern: '**/*.md', base: contentBase('actualites') }),
    // Image facultative : chemin relatif au fichier Markdown, résolu en ImageMetadata pour astro:assets.
    schema: ({ image }) => actualiteSchema.extend({ image: image().optional() }),
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
};
