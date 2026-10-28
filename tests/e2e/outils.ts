import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Règles WCAG 2.0, 2.1 et 2.2 (A et AA) et bonnes pratiques d'axe. */
export const REGLES_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Zéro violation axe sur la page (ou sur la zone donnée).
 * Sans `regles` : toutes les règles actives par défaut d'axe.
 */
export async function sansViolationAxe(page: Page, { zone, regles }: { zone?: string; regles?: string[] } = {}) {
  let axe = new AxeBuilder({ page });
  if (zone) axe = axe.include(zone);
  if (regles) axe = axe.withTags(regles);
  const { violations } = await axe.analyze();
  expect(violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Aucun défilement horizontal. */
export async function sansDebordement(page: Page) {
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(deborde).toBe(false);
}

/** Attend la fin des animations d'entrée (axe ne doit pas analyser un texte à demi transparent). */
export async function animationsTerminees(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

// ---------------------------------------------------------------------------------------------------------
// Contenu modifiable dans /admin : les tests le LISENT au lieu de recopier ses valeurs (l'éditrice les change).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { motDuMenu } from '../../src/lib/menu';

/** En-tête YAML d'un fichier Markdown du site (chemin relatif à la racine du projet). */
export const enTeteMd = <T>(chemin: string): T => parse(readFileSync(chemin, 'utf8').split('---')[1] ?? '') as T;

/** Titres de niveau 2 (« ## … ») du texte Markdown d'un fichier. */
export const titresNiveau2 = (chemin: string): string[] =>
  readFileSync(chemin, 'utf8').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());

/**
 * Mots du menu, dans l'ordre : ceux de menu.md ; pour les pages de texte, le mot choisi s'il existe, sinon le titre de la
 * page (coupé à 30 caractères, comme src/components/Header.astro).
 */
export function motsDuMenu(): string[] {
  const menu = enTeteMd<Record<string, string | undefined>>('src/content/reglages/menu.md');
  const titre = (id: string) => enTeteMd<{ titre: string }>(`src/content/pages/${id}.md`).titre;
  const mot = motDuMenu;
  return [
    menu['rdv'] ?? '',
    mot(menu['pratique'], titre('pratique')),
    mot(menu['offres'], titre('offres')),
    mot(menu['qigong'], titre('qigong')),
    mot(menu['qui'], titre('parcours')),
    menu['actualites'] ?? '',
    menu['contact'] ?? '',
  ];
}
