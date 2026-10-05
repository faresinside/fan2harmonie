/**
 * Porte de qualité Lighthouse (npm run lighthouse) : construit le site pour l'audit puis lance
 * Lighthouse CI (lighthouserc.json : mobile, 3 passages, seuils ≥ 0,95 sur les quatre catégories).
 *
 * lighthouserc.json (JSON, sans commentaires) : profil mobile explicite = valeurs par défaut de Lighthouse
 * (moto g power, 412×823, DPR 1,75, 4G lente simulée, CPU ×4) ; chaque assertion porte sur la MÉDIANE des
 * 3 passages (aggregationMethod "median"), pas sur le meilleur.
 *
 * AUDIT_SITE_URL : le site est construit avec l'origine du serveur d'audit (canonique, Open Graph,
 * plan du site, robots.txt) dans dist-audit/, jamais dans dist/ ni dans un fichier versionné.
 * Chrome : celui fourni par l'image Playwright (CHROME_PATH), sauf si CHROME_PATH est déjà défini.
 */
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const env = {
  ...process.env,
  AUDIT_SITE_URL: 'http://localhost:4400',
  CHROME_PATH: process.env.CHROME_PATH || chromium.executablePath(),
};

for (const commande of ['npm run build', 'npx lhci autorun']) {
  const { status } = spawnSync(commande, { stdio: 'inherit', shell: true, env });
  if (status !== 0) process.exit(status ?? 1);
}
