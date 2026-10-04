// Copie Sveltia CMS (version épinglée dans package.json) dans public/admin/ : le script est servi
// par le site lui-même, sans CDN. Lancé par les scripts npm predev et prebuild.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../dist/sveltia-cms.js', import.meta.resolve('@sveltia/cms')));
const cible = fileURLToPath(new URL('../public/admin/sveltia-cms.js', import.meta.url));

mkdirSync(new URL('../public/admin/', import.meta.url), { recursive: true });
copyFileSync(source, cible);
console.log(`Sveltia CMS copié : ${cible}`);
