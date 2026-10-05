import { describe, expect, it } from 'vitest';
import { robotsTxt } from '../../src/lib/robots';

describe('robotsTxt', () => {
  const texte = robotsTxt('https://exemple.fr');
  const lignes = texte.split('\n');

  it('autorise tout le site sauf /admin/', () => {
    expect(lignes.slice(0, 3)).toEqual(['User-agent: *', 'Allow: /', 'Disallow: /admin/']);
  });

  it('donne le plan du site en adresse absolue, sur le domaine du site', () => {
    expect(lignes).toContain('Sitemap: https://exemple.fr/sitemap-index.xml');
    expect(robotsTxt('https://exemple.fr/').split('\n')).toContain('Sitemap: https://exemple.fr/sitemap-index.xml');
  });

  it('se termine par un saut de ligne', () => {
    expect(texte.endsWith('\n')).toBe(true);
  });
});
