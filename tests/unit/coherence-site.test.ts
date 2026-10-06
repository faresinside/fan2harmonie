import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Cohérences entre fichiers du code (aucun contenu modifiable lu ici). */

const RACINE = path.resolve(__dirname, '../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

describe('formulaire de contact : mêmes limites dans la page et dans le script PHP', () => {
  const formulaire = lire('src/components/ContactForm.astro');
  const maxlength = (nom: string) => {
    const balise = new RegExp(`<(?:input|textarea)[^>]*name="${nom}"[^>]*>`, 's').exec(formulaire)?.[0] ?? '';
    return Number(/maxlength="(\d+)"/.exec(balise)?.[1]);
  };
  const constante = (nom: string) => Number(new RegExp(`const ${nom} = (\\d+);`).exec(lire('public/api/lib/contact.php'))?.[1]);

  it('nom : 100 caractères (LONGUEUR_MAX_NOM)', () => {
    expect(maxlength('nom')).toBe(100);
    expect(constante('LONGUEUR_MAX_NOM')).toBe(100);
  });

  it('e-mail : 254 caractères (LONGUEUR_MAX_EMAIL)', () => {
    expect(maxlength('email')).toBe(254);
    expect(constante('LONGUEUR_MAX_EMAIL')).toBe(254);
  });

  it('message : 5 000 caractères (taille_max_message du modèle de configuration)', () => {
    expect(maxlength('message')).toBe(5000);
    expect(Number(/'taille_max_message' => (\d+),/.exec(lire('public/api/config.sample.php'))?.[1])).toBe(5000);
  });
});

describe('liens internes vers les mentions légales : avec la barre finale', () => {
  const fichiers = readdirSync(path.join(RACINE, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(astro|ts)$/.test(f))
    .map((f) => path.join('src', f));

  it('toujours « /mentions-legales/ » (jamais « /mentions-legales » seul, qui ferait une redirection)', () => {
    for (const f of fichiers) {
      expect(lire(f), f).not.toMatch(/\/mentions-legales(?![\w/-])/);
    }
    expect(lire('src/components/Footer.astro')).toContain('href="/mentions-legales/"');
    expect(lire('src/components/ContactForm.astro')).toContain('href="/mentions-legales/#donnees-personnelles"');
  });
});
