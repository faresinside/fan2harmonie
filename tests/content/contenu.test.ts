import { parseFrontmatter } from '@astrojs/markdown-remark';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { actualiteSchema, pageSchema, rendezvousSchema } from '../../src/lib/schemas';

/**
 * Contrôle du contenu RÉEL (src/content/**\/*.md), écrit par l'éditrice dans /admin : `npm run verifier:contenu`.
 * NON bloquant dans le déploiement (avertissement seulement). Aucun nombre minimal de fichiers : supprimer
 * toutes les actualités ou tous les rendez-vous est un geste normal. Le nom des fichiers n'est pas contrôlé :
 * le site ne s'en sert pas (seule la date écrite dans le fichier compte).
 */

const RACINE = path.resolve(__dirname, '../..');
const fichiers = (dossier: string): string[] =>
  existsSync(path.join(RACINE, dossier))
    ? readdirSync(path.join(RACINE, dossier), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(dossier, f).split(path.sep).join('/'))
        .sort()
    : [];
const tous = fichiers('src/content');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

/** Séquences typiques d'un double encodage (é, è, à, ô, ’, ê, ç, œ, Â d'une espace insécable…). */
const MOJIBAKE = /Ã[¨©  ´ª§¢®¯¹»]|â€[™œ\u009d“”˜¦]|Ã‰|Å“|Â[ «»°]/u;

describe('contenus : encodage', () => {
  it('le motif reconnaît le double encodage et laisse passer le vrai français', () => {
    for (const casse of ['prÃ¨s', 'J’espÃ¨re', 'Ã©tÃ©', 'Ã  bientÃ´t', 'lâ€™heure', 'Â«', 'Ã‰cole']) {
      expect(MOJIBAKE.test(casse), casse).toBe(true);
    }
    for (const juste of ['près', 'J’espère', 'été', 'à bientôt', 'l’heure', '« Annulé »', 'École', 'cœur']) {
      expect(MOJIBAKE.test(juste), juste).toBe(false);
    }
  });

  it.each(tous)('%s : UTF-8 valide, sans double encodage ni BOM', (f) => {
    const octets = readFileSync(path.join(RACINE, f));
    expect(octets.subarray(0, 3).toString('hex')).not.toBe('efbbbf');
    const texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
    expect(texte).not.toMatch(MOJIBAKE);
    expect(texte).not.toContain('�');
  });

  it.each(tous)('%s : ni <br ni commentaire HTML', (f) => {
    expect(lire(f)).not.toMatch(/<br/i);
    expect(lire(f)).not.toContain('<!--');
  });
});

describe('contenus : conformes aux schémas du site', () => {
  it.each(fichiers('src/content/rendezvous'))('%s : rendez-vous valide', (f) => {
    const r = rendezvousSchema.safeParse(parseFrontmatter(lire(f)).frontmatter);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it.each(fichiers('src/content/actualites'))('%s : actualité valide (photo présente si indiquée)', (f) => {
    const fm = parseFrontmatter(lire(f)).frontmatter;
    const r = actualiteSchema.safeParse(fm);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    if (typeof fm['image'] === 'string') {
      expect(existsSync(path.resolve(RACINE, path.dirname(f), fm['image'])), String(fm['image'])).toBe(true);
    }
  });

  it.each(fichiers('src/content/pages'))('%s : texte de page valide', (f) => {
    expect(pageSchema.safeParse(parseFrontmatter(lire(f)).frontmatter).success).toBe(true);
  });
});
