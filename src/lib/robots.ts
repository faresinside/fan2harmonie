/**
 * Contenu de robots.txt : tout le site est indexable sauf l'administration ; le plan du site est donné
 * en adresse absolue, dérivée de l'adresse du site (src/config/site.ts) pour ne jamais viser un ancien domaine.
 */
export function robotsTxt(urlSite: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /admin/', '', `Sitemap: ${new URL('/sitemap-index.xml', urlSite).href}`, ''].join('\n');
}
