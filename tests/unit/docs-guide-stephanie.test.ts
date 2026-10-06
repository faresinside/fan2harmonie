import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guide de Stéphanie (docs/GUIDE-STEPHANIE.md) : en français simple, sans mot technique, toutes les rubriques
 * présentes, captures d'écran présentes et légères.
 */

const RACINE = path.resolve(__dirname, '../..');
const CHEMIN = path.join(RACINE, 'docs/GUIDE-STEPHANIE.md');
const texte = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';

/** Mots techniques interdits (casse ignorée), cherchés comme mots entiers, accents compris. */
const INTERDITS = ['commit', 'dépôt', 'depot', 'build', 'markdown', 'slug', 'front matter', 'workflow', 'rsync'];

describe('docs/GUIDE-STEPHANIE.md', () => {
  it('existe et tient en deux pages et demie environ (moins de 1 500 mots)', () => {
    expect(texte.length).toBeGreaterThan(2000);
    expect(texte.split(/\s+/).filter(Boolean).length).toBeLessThan(1500);
  });

  it.each(INTERDITS)('aucun mot technique : « %s »', (mot) => {
    expect(texte).not.toMatch(new RegExp(`(^|[^\\p{L}])${mot}([^\\p{L}]|$)`, 'iu'));
  });

  it('les neuf rubriques (a) à (i)', () => {
    for (const titre of [
      'Se connecter',
      'Ajouter un rendez-vous',
      'Annuler une séance',
      'Supprimer un rendez-vous',
      'Publier une actualité avec une photo',
      'Corriger un texte',
      'Quand le site se met-il à jour ?',
      'En cas de doute',
      'Bon à savoir',
    ]) {
      expect(texte, titre).toMatch(new RegExp(`^## .*${titre.replace(/[?]/g, '\\?')}`, 'm'));
    }
  });

  it('les informations attendues', () => {
    for (const fragment of [
      'https://fan2harmonie.fr/admin',
      '« Se connecter avec GitHub »',
      'double authentification',
      '16:00',
      '« Séance annulée »',
      '« Annulé »',
      'JPEG',
      'WebP',
      'ligne vide',
      'La pratique',
      'Le Qi Gong',
      'Mon parcours',
      'quelques minutes',
      '« Show Errors »',
      '« Restore Default »',
      'mot de passe GitHub',
    ]) {
      expect(texte, fragment).toContain(fragment);
    }
    // Vouvoiement.
    expect(texte).toMatch(/\bvous\b/);
    expect(texte).not.toMatch(/\b(tu|ton|ta|tes)\b/i);
  });

  it('captures d’écran référencées, présentes, en PNG de 150 Ko au plus', () => {
    const images = [...texte.matchAll(/!\[[^\]]+\]\((images\/guide\/[a-z-]+\.png)\)/g)].map((m) => m[1] ?? '');
    expect(images.sort()).toEqual([
      'images/guide/nouveau-rendez-vous.png',
      'images/guide/nouvelle-actualite.png',
      'images/guide/rendez-vous.png',
      'images/guide/textes-des-pages.png',
    ]);
    for (const image of images) {
      const fichier = path.join(RACINE, 'docs', image);
      expect(existsSync(fichier), image).toBe(true);
      expect(statSync(fichier).size, image).toBeLessThanOrEqual(150 * 1024);
      expect(readFileSync(fichier).subarray(1, 4).toString('latin1'), image).toBe('PNG');
    }
  });
});

describe('docs/GUIDE-STEPHANIE.md : points de la revue (round 1)', () => {
  it('pas de fausse promesse : c’est le technicien qui remet une version précédente', () => {
    expect(texte).not.toMatch(/rien de ce que vous faites ici n’est définitif|Vous ne pouvez rien casser/i);
    expect(texte).toContain('votre technicien peut toujours remettre une version précédente');
    expect(texte).not.toMatch(/deux minutes/);
  });

  it('photos : accord des personnes ; site public : l’historique garde ce qui est supprimé', () => {
    expect(texte).toMatch(/sans son accord/);
    expect(texte).toMatch(/reste visible dans l’historique/);
  });

  it('fenêtre GitHub : adresse et nom de l’application vérifiés ; se déconnecter ne retire pas l’accès', () => {
    expect(texte).toContain('https://github.com/');
    expect(texte).toContain('« Fan 2 Harmonie — administration »');
    expect(texte).toMatch(/avant de cliquer sur « Authorize »/);
    expect(texte).toMatch(/Se déconnecter ne retire pas l’accès/);
    expect(texte).toMatch(/perdez votre ordinateur/);
  });
});
