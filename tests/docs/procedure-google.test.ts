import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Procédure Google (docs/PROCEDURE-GOOGLE.md) : écrite pour Stéphanie, en français simple, sans mot technique.
 */

const RACINE = path.resolve(__dirname, '../..');
const CHEMIN = path.join(RACINE, 'docs/PROCEDURE-GOOGLE.md');
const texte = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';

/** Mêmes mots interdits que le guide (tests/docs/guide-stephanie.test.ts). */
const INTERDITS = ['commit', 'dépôt', 'depot', 'build', 'markdown', 'slug', 'front matter', 'workflow', 'rsync'];

/** Mot entier, casse ignorée, accents compris (`\p{L}` : le double antislash est indispensable dans ce littéral). */
const motEntier = (mot: string): RegExp => new RegExp(`(^|[^\\p{L}])${mot}([^\\p{L}]|$)`, 'iu');

describe('docs/PROCEDURE-GOOGLE.md', () => {
  it('existe et fait moins de 1 200 mots', () => {
    expect(texte.length).toBeGreaterThan(2000);
    expect(texte.split(/\s+/).filter(Boolean).length).toBeLessThan(1200);
  });

  it.each(INTERDITS)('aucun mot technique : « %s »', (mot) => {
    expect(texte).not.toMatch(motEntier(mot));
  });

  it('le motif des mots interdits repère les mots entiers et seulement eux', () => {
    expect('le build du site').toMatch(motEntier('build'));
    expect('Commit').toMatch(motEntier('commit'));
    expect('Le « front matter », ici').toMatch(motEntier('front matter'));
    expect('le dépôt.').toMatch(motEntier('dépôt'));
    expect('rebuilder').not.toMatch(motEntier('build'));
    expect('construction').not.toMatch(motEntier('build'));
    expect('commité').not.toMatch(motEntier('commit'));
    expect('pdépôt').not.toMatch(motEntier('dépôt'));
  });

  it('les rubriques', () => {
    for (const titre of [
      'Créer son compte Google',
      'S’inscrire à la Search Console',
      'Envoyer le plan du site',
      'Créer la fiche Google Business Profile',
      'Se faire connaître localement',
      'Suivre les résultats',
    ]) {
      expect(texte, titre).toMatch(new RegExp(`^## .*${titre}`, 'm'));
    }
  });

  it('les adresses et les libellés exacts', () => {
    for (const fragment of [
      'https://search.google.com/search-console',
      'https://fan2harmonie.fr/sitemap-index.xml',
      'https://fan2harmonie.fr/',
      'https://business.google.com',
      '« Référencement Google »',
      '« Code de vérification Google »',
      '« Réglages du site »',
      '« Préfixe de l’URL »',
      '« Balise HTML »',
      '« Valider »',
      '« Sitemaps »',
      '« Envoyer »',
      '« Inspection de l’URL »',
      '« Demander une indexation »',
      '« Pages »',
      '« Performances »',
      'OVH',
      'office de tourisme',
      'mairie de Rambouillet',
      'Facebook',
    ]) {
      expect(texte, fragment).toContain(fragment);
    }
  });

  it('colle seulement le code, pas toute la balise', () => {
    expect(texte).toMatch(/Collez seulement le code/);
    expect(texte).toContain('content=');
  });

  it('ce qu’il ne faut pas faire ; délai normal ; vouvoiement', () => {
    expect(texte).toMatch(/acheter des liens/i);
    expect(texte).toMatch(/faux avis/i);
    expect(texte).toMatch(/quelques jours à quelques semaines/);
    expect(texte).toMatch(/\bvous\b/);
    expect(texte).not.toMatch(/\b(tu|ton|ta|tes)\b/i);
  });
});
