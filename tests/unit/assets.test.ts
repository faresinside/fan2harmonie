import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';

const LOGO_DIR = 'src/assets/logo';

async function raw(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Pixel le plus opaque (trait) du logo : [r, g, b, a]. */
function strokePixel(img: { data: Buffer }): [number, number, number, number] {
  const d = img.data;
  let best = 0;
  for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > (d[best + 3] ?? 0)) best = i - 3;
  return [d[best] ?? 0, d[best + 1] ?? 0, d[best + 2] ?? 0, d[best + 3] ?? 0];
}

describe('logos transparents', () => {
  for (const name of ['logo', 'logo-blanc', 'logo-long']) {
    it(`${name}.png : alpha présent, fond transparent, trait opaque`, async () => {
      const file = `${LOGO_DIR}/${name}.png`;
      expect(existsSync(file)).toBe(true);
      const meta = await sharp(file).metadata();
      expect(meta.hasAlpha).toBe(true);
      const img = await raw(file);
      expect(img.data[3] ?? -1).toBe(0);
      expect(strokePixel(img)[3]).toBeGreaterThan(200);
    });
  }

  it('logo.png : trait vert forêt sombre', async () => {
    const [r, g, b] = strokePixel(await raw(`${LOGO_DIR}/logo.png`));
    expect(r).toBeLessThan(80);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('logo-blanc.png : trait crème', async () => {
    const [r, g, b] = strokePixel(await raw(`${LOGO_DIR}/logo-blanc.png`));
    expect(Math.min(r, g, b)).toBeGreaterThan(230);
  });
});

describe('favicon et photo', () => {
  it('icône SVG : lotus crème sur carré arrondi vert forêt (couleurs de tokens.css)', () => {
    const svg = readFileSync('public/favicon.svg', 'utf8');
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const jeton = (nom: string) => new RegExp(`--${nom}: (#[0-9a-f]{6});`).exec(tokens)?.[1];
    expect(svg).toContain(`fill="${jeton('foret')}"`);
    expect(svg).toContain(`stroke="${jeton('creme')}"`);
    expect(svg).toMatch(/viewBox="0 0 64 64"/);
    expect(svg).toMatch(/<rect [^>]*rx="\d+"/);
    // XML valide : aucun « -- » à l'intérieur d'un commentaire (sharp refuserait le fichier).
    expect(svg.replace(/<!--/g, '').replace(/-->/g, '')).not.toContain('--');
    expect(Number(/stroke-width="(\d+(?:\.\d+)?)"/.exec(svg)?.[1])).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['public/favicon-32.png', 32, true],
    ['public/apple-touch-icon.png', 180, false],
    ['public/icon-512.png', 512, true],
  ] as const)('%s : %i px, transparence %s', async (fichier, taille, alpha) => {
    expect(existsSync(fichier)).toBe(true);
    const meta = await sharp(fichier).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', taille, taille]);
    expect(Boolean(meta.hasAlpha)).toBe(alpha);
    // Centre crème (pétale) ou vert, coin : transparent (icônes arrondies) ou vert (apple-touch-icon opaque).
    const { data, info } = await sharp(fichier).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4));
    expect(pixel(0, 0)[3]).toBe(alpha ? 0 : 255);
    const centre = pixel(Math.floor(taille / 2), Math.floor(taille * 0.75));
    expect(centre[3]).toBe(255);
  });

  it('ancien favicon tiré du logo (trait trop fin) retiré', () => {
    expect(existsSync(`${LOGO_DIR}/favicon.png`)).toBe(false);
  });

  it('hero.jpg existe et fait au moins 1000 px de large', async () => {
    const file = 'src/assets/photos/hero.jpg';
    expect(existsSync(file)).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(1000);
  });
});
