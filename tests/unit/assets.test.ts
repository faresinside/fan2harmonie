import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { existsSync } from 'node:fs';

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
  it('favicon.png fait 512x512', async () => {
    const meta = await sharp(`${LOGO_DIR}/favicon.png`).metadata();
    expect([meta.width, meta.height]).toEqual([512, 512]);
  });

  it('hero.jpg existe et fait au moins 1000 px de large', async () => {
    const file = 'src/assets/photos/hero.jpg';
    expect(existsSync(file)).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(1000);
  });
});
