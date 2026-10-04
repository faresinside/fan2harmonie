import { describe, expect, it } from 'vitest';
import { serialiserJsonLd } from '../../src/lib/jsonld';

describe('serialiserJsonLd', () => {
  it('échappe « < » : une chaîne ne peut pas fermer la balise script', () => {
    const sortie = serialiserJsonLd({ description: '</script><script>alert(1)</script>' });
    expect(sortie).not.toContain('<');
    expect(sortie).toContain('\\u003c/script>');
  });

  it('reste du JSON valide qui redonne les données d’origine', () => {
    const donnees = { name: 'Fan 2 Harmonie', note: 'a < b & c', geo: { latitude: 48.64703 } };
    expect(JSON.parse(serialiserJsonLd(donnees))).toEqual(donnees);
  });
});
