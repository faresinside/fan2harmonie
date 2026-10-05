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
