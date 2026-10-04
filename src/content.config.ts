import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { actualiteSchema, pageSchema, rendezvousSchema } from './lib/schemas';

export const collections = {
  rendezvous: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/rendezvous' }),
    schema: rendezvousSchema,
  }),
  actualites: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/actualites' }),
    schema: actualiteSchema,
  }),
  pages: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
    schema: pageSchema,
  }),
};
