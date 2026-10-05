// Copie Sveltia CMS (version épinglée dans package.json) dans public/admin/ : le script est servi
// par le site lui-même, sans CDN. Lancé par les scripts npm postinstall, predev et prebuild.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE =
  'Sveltia CMS introuvable : la structure du paquet a-t-elle changé ? vérifier le chemin dans scripts/copy-cms.mjs ' +
  '(Sveltia CMS bundle not found: has the package layout changed? check the path in scripts/copy-cms.mjs)';

/** Bundle navigateur du paquet @sveltia/cms installé, ou undefined si le paquet est absent. */
export function sourceParDefaut() {
  try {
    return fileURLToPath(new URL('../dist/sveltia-cms.js', import.meta.resolve('@sveltia/cms')));
  } catch {
    return undefined;
  }
}

export const CIBLE_PAR_DEFAUT = fileURLToPath(new URL('../public/admin/sveltia-cms.js', import.meta.url));

/** Copie le bundle ; erreur explicite si la source manque. Renvoie le chemin écrit. */
export function copierCms({ source = sourceParDefaut(), cible = CIBLE_PAR_DEFAUT } = {}) {
  if (!source || !existsSync(source)) throw new Error(`${MESSAGE} — ${source ?? '@sveltia/cms non installé'}`);
  mkdirSync(dirname(cible), { recursive: true });
  copyFileSync(source, cible);
  return cible;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`Sveltia CMS copié : ${copierCms()}`);
}
