import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';
import { remarkHtmlEnTexte } from '../../src/lib/remark-html-en-texte';
import { adresseLienSure, remarkLiensSurs } from '../../src/lib/remark-liens-surs';

/**
 * Plugin remark des contenus écrits dans /admin : images distantes et liens à schéma dangereux NEUTRALISÉS
 * (remplacés par leur texte), jamais une erreur de construction (qui bloquerait les mises en ligne).
 */

const processeur = createMarkdownProcessor({ remarkPlugins: [remarkHtmlEnTexte, remarkLiensSurs], remarkRehype: { allowDangerousHtml: false } });
const rendre = async (md: string) => (await (await processeur).render(md)).code;

describe('adresseLienSure', () => {
  it.each(['https://fan2harmonie.fr', 'http://exemple.org/a', 'mailto:contact@fan2harmonie.fr', 'tel:+33100000000', '#contact', '/mentions-legales/', 'page.html', './a/b', '../c', 'HTTPS://EXEMPLE.ORG', '?q=1'])(
    'accepte %s',
    (url) => {
      expect(adresseLienSure(url)).toBe(true);
    },
  );
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'jav\u0000ascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example/x',
    '/\\evil.example',
    '\\\\evil.example',
    'ftp://exemple.org',
    'blob:https://x/y',
  ])('refuse %j', (url) => {
    expect(adresseLienSure(url)).toBe(false);
  });
});

describe('remarkLiensSurs (rendu réel)', () => {
  it('image distante → son texte de remplacement, en texte simple', async () => {
    for (const md of ['![Photo du parc](https://evil.example/p.jpg)', '![Photo du parc](//evil.example/p.jpg)', '![Photo du parc](http://evil.example/p.jpg)']) {
      const html = await rendre(md);
      expect(html, md).not.toContain('<img');
      expect(html, md).not.toContain('evil.example');
      expect(html, md).toContain('Photo du parc');
    }
  });

  it('image distante par référence → texte aussi', async () => {
    const html = await rendre('![Photo][p]\n\n[p]: https://evil.example/p.jpg');
    expect(html).not.toContain('<img');
    expect(html).toContain('Photo');
  });

  it('liens dangereux (en ligne, par référence, automatiques, obscurcis par entités) → texte simple', async () => {
    for (const md of [
      '[clic](javascript:alert(1))',
      '[clic](JaVaScRiPt:alert(1))',
      '[clic](vbscript:x)',
      '[clic](data:text/html,x)',
      '[clic](//evil.example)',
      '[clic](&#106;avascript:alert(1))',
      '[clic](<java\tscript:alert(1)>)',
      '[clic][r]\n\n[r]: javascript:alert(1)',
      '<javascript:alert(1)>',
    ]) {
      const html = await rendre(md);
      expect(html, md).not.toMatch(/href=/i);
      // Le texte peut rester visible (il n'est plus qu'un texte) ; aucun lien ni attribut ne le porte.
      expect(html, md).not.toMatch(/<a[\s>]|src=/i);
    }
    expect(await rendre('[clic](javascript:alert(1))')).toContain('clic');
  });

  it('liens et images sûrs inchangés', async () => {
    expect(await rendre('[Contact](mailto:contact@fan2harmonie.fr) et [site](https://fan2harmonie.fr/)')).toBe(
      '<p><a href="mailto:contact@fan2harmonie.fr">Contact</a> et <a href="https://fan2harmonie.fr/">site</a></p>',
    );
    expect(await rendre('[ici](#contact) [là](/mentions-legales/)')).toContain('<a href="#contact">ici</a>');
    expect(await rendre('![Lotus](./lotus.png)')).toContain('<img');
  });
});
