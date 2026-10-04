import { defineConfig } from 'astro/config';
import { jeuDeTest } from './src/lib/fixture.ts';
import { remarkHtmlEnTexte } from './src/lib/remark-html-en-texte.ts';

// Jeu de contenus de test (CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>) : sortie et cache séparés.
const jeu = jeuDeTest();

export default defineConfig({
  output: 'static',
  ...(jeu && { outDir: `./dist-fixture-${jeu}`, cacheDir: `./node_modules/.astro-fixture-${jeu}` }),
  markdown: {
    // Le HTML brut des contenus Markdown s'affiche comme du texte, jamais interprété.
    remarkPlugins: [remarkHtmlEnTexte],
    remarkRehype: { allowDangerousHtml: false },
  },
});
