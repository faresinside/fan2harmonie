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
import { motDuMenu, ordreDuMenu } from '../../src/lib/menu';
import type { Textes } from '../../src/lib/schemas';

/** En-tête YAML d'un fichier Markdown du site (chemin relatif à la racine du projet). */
export const enTeteMd = <T>(chemin: string): T => parse(readFileSync(chemin, 'utf8').split('---')[1] ?? '') as T;

/** Petits textes du site (réglages « Petits textes du site ») : les tests lisent les valeurs actuelles, jamais en dur. */
export const petitsTextes = () => enTeteMd<Textes>('src/content/reglages/textes.md');

/** Titres de niveau 2 (« ## … ») du texte Markdown d'un fichier. */
export const titresNiveau2 = (chemin: string): string[] =>
  readFileSync(chemin, 'utf8').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());

/** Liens du menu dans l'ordre réglé (src/content/reglages/menu.md) : identifiants de LIENS_MENU. */
export function liensDuMenu(): string[] {
  return ordreDuMenu(enTeteMd<{ ordre?: string[] }>('src/content/reglages/menu.md').ordre);
}

/** Adresse de chaque lien du menu ; prefixe « / » hors de l'accueil. */
export function hrefsDuMenu(prefixe = ''): string[] {
  return liensDuMenu().map((id) => (id === 'offres' ? '/offres-de-seances/' : `${prefixe}#${id}`));
}

/**
 * Mots du menu, dans l'ordre réglé : ceux de menu.md ; pour les pages de texte, le mot choisi s'il existe, sinon le titre de la
 * page (coupé à 30 caractères, comme src/components/Header.astro).
 */
export function motsDuMenu(): string[] {
  const menu = enTeteMd<Record<string, string | undefined> & { ordre?: string[] }>('src/content/reglages/menu.md');
  const titre = (id: string) => enTeteMd<{ titre: string }>(`src/content/pages/${id}.md`).titre;
  const mot = motDuMenu;
  const mots: Record<string, string> = {
    rdv: menu['rdv'] ?? '',
    offres: mot(menu['offres'], titre('offres')),
    pratique: mot(menu['pratique'], titre('pratique')),
    qigong: mot(menu['qigong'], titre('qigong')),
    actualites: menu['actualites'] ?? '',
    qui: mot(menu['qui'], titre('parcours')),
    contact: menu['contact'] ?? '',
  };
  return ordreDuMenu(menu.ordre).map((id) => mots[id] ?? '');
}
