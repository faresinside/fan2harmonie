import { parseFrontmatter } from '@astrojs/markdown-remark';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contenus réels (src/content/**\/*.md) : UTF-8 propre, sans « mojibake » (texte UTF-8 relu comme Windows-1252
 * puis réenregistré : « prÃ¨s », « J’espÃ¨re », « â€™ »…), et nom d'un rendez-vous = sa date.
 */

const RACINE = path.resolve(__dirname, '../..');
const fichiers = readdirSync(path.join(RACINE, 'src/content'), { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join('src/content', f).split(path.sep).join('/'))
  .sort();

/** Séquences typiques d'un double encodage (é, è, à, ô, ’, ê, ç, œ, Â d'une espace insécable…). */
const MOJIBAKE = /Ã[¨©  ´ª§¢®¯¹»]|â€[™œ\u009d“”˜¦]|Ã‰|Å“|Â[ «»°]/u;

describe('contenus : encodage', () => {
  it('il y a des contenus', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(4);
  });

  it('le motif reconnaît le double encodage et laisse passer le vrai français', () => {
    for (const casse of ['prÃ¨s', 'J’espÃ¨re', 'Ã©tÃ©', 'Ã  bientÃ´t', 'lâ€™heure', 'Â«', 'Ã‰cole']) {
      expect(MOJIBAKE.test(casse), casse).toBe(true);
    }
    for (const juste of ['près', 'J’espère', 'été', 'à bientôt', 'l’heure', '« Annulé »', 'École', 'cœur']) {
      expect(MOJIBAKE.test(juste), juste).toBe(false);
    }
  });

  it.each(fichiers)('%s : UTF-8 valide, sans double encodage ni BOM', (f) => {
    const octets = readFileSync(path.join(RACINE, f));
    expect(octets.subarray(0, 3).toString('hex')).not.toBe('efbbbf');
    const texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
    expect(texte).not.toMatch(MOJIBAKE);
    expect(texte).not.toContain('�');
  });

  it.each(fichiers.filter((f) => f.startsWith('src/content/rendezvous/')))('%s : nom du fichier = date du rendez-vous', (f) => {
    const date = String(parseFrontmatter(readFileSync(path.join(RACINE, f), 'utf8')).frontmatter['date'] ?? '');
    const iso = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
    // Deuxième séance du même jour : suffixe ajouté par l'administration (AAAA-MM-JJ-1.md).
    expect(path.basename(f)).toMatch(new RegExp(`^${iso}(-[a-z0-9-]+)?\\.md$`));
  });
});
