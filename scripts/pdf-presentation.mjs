/**
 * Génère docs/Fan2Harmonie-presentation-Stephanie.pdf depuis docs/presentation-stephanie.html (Chrome, via Playwright).
 * Usage : node scripts/pdf-presentation.mjs
 * CHROME_PATH : Chrome à utiliser (par défaut, celui installé par Playwright).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const racine = path.resolve(import.meta.dirname, '..');
const source = pathToFileURL(path.join(racine, 'docs/presentation-stephanie.html')).href;
const sortie = path.join(racine, 'docs/Fan2Harmonie-presentation-Stephanie.pdf');

const navigateur = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await navigateur.newPage();
await page.goto(source, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: sortie, format: 'A4', printBackground: true, preferCSSPageSize: true });
await navigateur.close();
console.log(`PDF écrit : ${sortie}`);
