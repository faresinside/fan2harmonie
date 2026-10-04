// Prépare les assets du site depuis source/ (idempotent).
// Usage : npm run assets   (dans le conteneur Docker)
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const SRC = 'source';
const LOGO_DIR = 'src/assets/logo';
const PHOTO_DIR = 'src/assets/photos';

const GREEN = [0x2c, 0x4a, 0x2e];
const CREAM = [0xfa, 0xf5, 0xe8];
const PADDING = 16;
// Seuil doux sur l'encre (255 - luminance) : sous LOW -> transparent (voile gris),
// au-dessus de HIGH -> opaque, interpolation entre les deux (anticrénelage conservé).
const LOW = 40;
const HIGH = 170;

function smoothstep(x) {
  const t = Math.min(1, Math.max(0, (x - LOW) / (HIGH - LOW)));
  return t * t * (3 - 2 * t);
}

/** Encre noire sur blanc -> PNG transparent, trait de couleur constante, rogné + marge. */
async function inkToPng(file, [r, g, b]) {
  const { data, info } = await sharp(`${SRC}/${file}`)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rgba = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0; i < width * height; i++) {
    const a = Math.round(255 * smoothstep(255 - data[i]));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
    if (a > 0) {
      const x = i % width, y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

await mkdir(LOGO_DIR, { recursive: true });
await mkdir(PHOTO_DIR, { recursive: true });

const logo = await inkToPng('Logo_FondBlanc3.jpeg', GREEN);
await writeFile(`${LOGO_DIR}/logo.png`, logo);
await writeFile(`${LOGO_DIR}/logo-blanc.png`, await inkToPng('Logo_FondBlanc3.jpeg', CREAM));
await writeFile(`${LOGO_DIR}/logo-long.png`, await inkToPng('LogoLong.jpeg', GREEN));

// Favicon : logo centré (contain) sur carré transparent 512x512, avec marge.
await writeFile(
  `${LOGO_DIR}/favicon.png`,
  await sharp(logo)
    .resize(448, 448, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer(),
);

// Photo d'accueil PROVISOIRE : bande de feuillage ensoleillé (entre le logo et la
// bannière, au-dessus des voitures), sans texte ni panneau. Zone étroite, donc
// agrandie et floutée : ambiance seulement.
await writeFile(
  `${PHOTO_DIR}/hero.jpg`,
  await sharp(`${SRC}/ImageAnimation.jpeg`)
    .extract({ left: 590, top: 150, width: 140, height: 410 })
    .resize(1600, 900, { fit: 'cover', position: 'centre' })
    .blur(8)
    .jpeg({ quality: 85 })
    .toBuffer(),
);

console.log('Assets générés.');
