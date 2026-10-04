import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { contentBase } from './lib/fixture';
import { actualiteSchema, pageSchema, rendezvousSchema } from './lib/schemas';

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
};
