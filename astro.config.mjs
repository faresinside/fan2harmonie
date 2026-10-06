import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/config/site.ts';
import { jeuDeTest } from './src/lib/fixture.ts';
import { remarkHtmlEnTexte } from './src/lib/remark-html-en-texte.ts';
import { remarkLiensSurs } from './src/lib/remark-liens-surs.ts';

// Jeu de contenus de test (CONTENT_FIXTURE=1 CONTENT_FIXTURE_SET=<jeu>) : sortie et cache séparés.
const jeu = jeuDeTest();
// Audit Lighthouse (npm run lighthouse) : site construit pour l'origine du serveur d'audit, dans sa propre sortie.
const audit = Boolean(process.env['AUDIT_SITE_URL']);

export default defineConfig({
  output: 'static',
  site: site.url,
  ...(process.env['ASTRO_BASE'] && { base: process.env['ASTRO_BASE'] }),
  ...(jeu && { outDir: `./dist-fixture-${jeu}`, cacheDir: `./node_modules/.astro-fixture-${jeu}` }),
  ...(audit && { outDir: './dist-audit' }),
  // Feuilles de style en ligne (le CSS du site est petit) : aucune requête ne bloque le premier affichage.
  build: { inlineStylesheets: 'always' },
  // /admin est un fichier statique de public/ : il n'est pas une page et n'entre donc pas dans le plan du site.
  integrations: [sitemap()],
  markdown: {
    // Le HTML brut des contenus Markdown s'affiche comme du texte, jamais interprété ; images distantes et liens
    // à schéma dangereux (javascript:, data:…) deviennent du texte, sans jamais faire échouer la construction.
    remarkPlugins: [remarkHtmlEnTexte, remarkLiensSurs],
    remarkRehype: { allowDangerousHtml: false },
  },
});
