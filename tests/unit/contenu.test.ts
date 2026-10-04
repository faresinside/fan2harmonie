import { describe, expect, it } from 'vitest';
import { contentBase, jeuDeTest } from '../../src/lib/fixture';
import { remarkHtmlEnTexte } from '../../src/lib/remark-html-en-texte';

describe('contentBase (jeux de contenus de test)', () => {
  it('sans CONTENT_FIXTURE : dossiers réels', () => {
    expect(contentBase('rendezvous', {})).toBe('./src/content/rendezvous');
    expect(jeuDeTest({ CONTENT_FIXTURE_SET: 'vide' })).toBeUndefined();
  });

  it('CONTENT_FIXTURE=1 : rendez-vous et actualités du jeu, textes des pages réels', () => {
    const env = { CONTENT_FIXTURE: '1', CONTENT_FIXTURE_SET: 'vide' };
    expect(jeuDeTest(env)).toBe('vide');
    expect(contentBase('rendezvous', env)).toBe('./tests/fixtures/content/vide/rendezvous');
    expect(contentBase('actualites', env)).toBe('./tests/fixtures/content/vide/actualites');
    expect(contentBase('pages', env)).toBe('./src/content/pages');
  });

  it.each([undefined, '', '../src', 'a/b'])('jeu absent ou invalide (%s) : erreur explicite', (jeu) => {
    const env: Record<string, string | undefined> = { CONTENT_FIXTURE: '1', CONTENT_FIXTURE_SET: jeu };
    expect(() => contentBase('rendezvous', env)).toThrow(/CONTENT_FIXTURE_SET/);
  });
});

describe('remarkHtmlEnTexte', () => {
  it('le HTML brut devient du texte : en bloc dans un paragraphe, en ligne tel quel', () => {
    const arbre = {
      type: 'root',
      children: [
        { type: 'html', value: '<script>window.__x=1</script>' },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Un ' },
            { type: 'html', value: '<b>' },
            { type: 'text', value: 'x' },
            { type: 'html', value: '</b>' },
          ],
        },
        { type: 'blockquote', children: [{ type: 'html', value: '<div>' }] },
      ],
    };
    remarkHtmlEnTexte()(arbre);
    expect(arbre).toEqual({
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: '<script>window.__x=1</script>' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Un ' },
            { type: 'text', value: '<b>' },
            { type: 'text', value: 'x' },
            { type: 'text', value: '</b>' },
          ],
        },
        { type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', value: '<div>' }] }] },
      ],
    });
  });
});
