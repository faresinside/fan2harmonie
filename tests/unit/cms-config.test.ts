import { parseFrontmatter } from '@astrojs/markdown-remark';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  HEURE_REGEX,
  LIEU_PAR_DEFAUT,
  actualiteSchema,
  dateSchema,
  pageSchema,
  rendezvousSchema,
} from '../../src/lib/schemas';

/** Configuration de Sveltia CMS (public/admin/config.yml), lue comme le ferait le CMS. */
type Champ = {
  name: string;
  label?: string;
  hint?: string;
  widget?: string;
  required?: boolean;
  default?: unknown;
  pattern?: [string, string];
  [cle: string]: unknown;
};
type Fichier = { name: string; label?: string; file: string; fields: Champ[] };
type Collection = {
  name: string;
  label?: string;
  folder?: string;
  files?: Fichier[];
  fields?: Champ[];
  [cle: string]: unknown;
};
type Config = { backend: Record<string, unknown>; collections: Collection[]; [cle: string]: unknown };

const RACINE = path.resolve(__dirname, '../..');
const CHEMIN_CONFIG = path.join(RACINE, 'public/admin/config.yml');
const config = (): Config => parse(readFileSync(CHEMIN_CONFIG, 'utf8')) as Config;

function collection(nom: string): Collection {
  const c = config().collections.find((x) => x.name === nom);
  if (!c) throw new Error(`collection ${nom} absente de config.yml`);
  return c;
}
const champ = (c: { fields?: Champ[] }, nom: string): Champ => {
  const f = c.fields?.find((x) => x.name === nom);
  if (!f) throw new Error(`champ ${nom} absent`);
  return f;
};
/** Noms des champs écrits dans le front matter (le corps Markdown `body` n'en fait pas partie). */
const champsFrontMatter = (c: { fields?: Champ[] }) =>
  (c.fields ?? []).map((f) => f.name).filter((n) => n !== 'body').sort();
const cles = (shape: Record<string, unknown>) => Object.keys(shape).sort();
/** Expression du `pattern` d'un champ, compilée comme le fait le CMS. */
const motif = (f: Champ) => new RegExp(f.pattern?.[0] ?? '(?!)');

describe('config.yml de Sveltia CMS', () => {
  it('se charge, backend GitHub, publication simple', () => {
    const c = config();
    expect(c.backend['name']).toBe('github');
    expect(c.backend['branch']).toBe('main');
    expect(c['publish_mode']).toBe('simple');
    expect(c['local_backend']).toBeUndefined();
    expect(c.collections.map((x) => x.name).sort()).toEqual(['actualites', 'pages', 'rendezvous']);
  });

  it('champ facultatif vide non écrit (sinon `image: \'\'` casserait la construction, `lieu: \'\'` effacerait le lieu)', () => {
    expect((config()['output'] as Record<string, unknown>)['omit_empty_optional_fields']).toBe(true);
  });

  it('noms de fichiers ASCII sans accents, pas de banques d’images en ligne', () => {
    expect(config()['slug']).toMatchObject({ encoding: 'ascii', clean_accents: true });
    const medias = config()['media_libraries'] as Record<string, unknown>;
    expect(medias['stock_assets']).toBe(false);
  });

  it('rendez-vous : champs du CMS = clés du schéma Zod', () => {
    expect(champsFrontMatter(collection('rendezvous'))).toEqual(cles(rendezvousSchema.shape));
  });

  it('actualités : champs du CMS (hors corps) = clés du schéma Zod, corps Markdown présent', () => {
    const c = collection('actualites');
    expect(champsFrontMatter(c)).toEqual(cles(actualiteSchema.shape));
    expect(champ(c, 'body').widget).toBe('markdown');
  });

  it('pages : champs de chaque fichier (hors corps) = clés du schéma Zod', () => {
    for (const f of collection('pages').files ?? []) {
      expect(champsFrontMatter(f), f.name).toEqual(cles(pageSchema.shape));
      expect(champ(f, 'body').widget, f.name).toBe('markdown');
    }
  });

  it('heure : motif identique à HEURE_REGEX, message en français', () => {
    const heure = champ(collection('rendezvous'), 'heure');
    expect(heure.pattern?.[0]).toBe(HEURE_REGEX.source);
    expect(heure.pattern?.[1]).toMatch(/16:00/);
    for (const ok of ['16:00', '09:30', '23:59']) expect(motif(heure).test(ok), ok).toBe(true);
    for (const ko of ['16h00', '24:00', '9:30', '16:60']) expect(motif(heure).test(ko), ko).toBe(false);
  });

  it('titre d’actualité : 90 caractères acceptés et 91 refusés, par le CMS comme par le schéma', () => {
    const titre = champ(collection('actualites'), 'titre');
    const ok = 'a'.repeat(90);
    const ko = 'a'.repeat(91);
    const schema = actualiteSchema.shape.titre;
    expect(motif(titre).test(ok)).toBe(true);
    expect(schema.safeParse(ok).success).toBe(true);
    expect(motif(titre).test(ko)).toBe(false);
    expect(schema.safeParse(ko).success).toBe(false);
    expect(titre['maxlength']).toBe(90);
  });

  it('pages : collection de fichiers fixes (ni création ni suppression), fichiers présents', () => {
    const pages = collection('pages');
    expect(pages.folder).toBeUndefined();
    expect(pages['create']).not.toBe(true);
    expect(pages['delete']).not.toBe(true);
    const fichiers = pages.files ?? [];
    expect(fichiers.map((f) => f.name).sort()).toEqual(['parcours', 'pratique', 'qigong']);
    for (const f of fichiers) {
      expect(f.file).toBe(`src/content/pages/${f.name}.md`);
      expect(existsSync(path.join(RACINE, f.file)), f.file).toBe(true);
    }
    expect(Object.fromEntries(fichiers.map((f) => [f.name, f.label]))).toEqual({
      pratique: 'La pratique',
      qigong: 'Le Qi Gong',
      parcours: 'Mon parcours',
    });
  });

  it('rendez-vous et actualités : dossiers existants, création et suppression autorisées', () => {
    for (const nom of ['rendezvous', 'actualites']) {
      const c = collection(nom);
      expect(c.folder).toBe(`src/content/${nom}`);
      expect(existsSync(path.join(RACINE, c.folder ?? '')), nom).toBe(true);
      expect(c['create']).toBe(true);
      expect(c['delete']).toBe(true);
      expect(c['extension']).toBe('md');
      expect(c['format']).toBe('frontmatter');
    }
  });

  it('libellés et aides en français : jamais vides ni égaux au nom technique', () => {
    const tousLesChamps: Champ[] = config().collections.flatMap((c) => [
      ...(c.fields ?? []),
      ...(c.files ?? []).flatMap((f) => f.fields),
    ]);
    expect(tousLesChamps.length).toBeGreaterThan(0);
    for (const f of tousLesChamps) {
      expect(f.label?.trim(), `${f.name} : label`).toBeTruthy();
      expect(f.label, `${f.name} : label`).not.toBe(f.name);
      if (f.hint !== undefined) {
        expect(f.hint.trim(), `${f.name} : hint`).toBeTruthy();
        expect(f.hint, `${f.name} : hint`).not.toBe(f.name);
      }
    }
    for (const c of config().collections) {
      expect(c.label?.trim(), c.name).toBeTruthy();
      expect(c.label, c.name).not.toBe(c.name);
    }
  });

  it('rendez-vous : champs facultatifs, valeurs par défaut du schéma', () => {
    const rdv = collection('rendezvous');
    expect(champ(rdv, 'date').required).not.toBe(false);
    expect(champ(rdv, 'heure').required).not.toBe(false);
    expect(champ(rdv, 'lieu').default).toBe(LIEU_PAR_DEFAUT);
    expect(champ(rdv, 'lieu').required).toBe(false);
    expect(champ(rdv, 'remarque').required).toBe(false);
    expect(champ(rdv, 'annule').widget).toBe('boolean');
    expect(champ(rdv, 'annule').default).toBe(false);
    expect(champ(rdv, 'annule').label).toBe('Séance annulée');
  });

  it('dates : format AAAA-MM-JJ accepté par dateSchema, sans heure', () => {
    for (const nom of ['rendezvous', 'actualites']) {
      const date = champ(collection(nom), 'date');
      expect(date.widget, nom).toBe('datetime');
      expect(date['type'], nom).toBe('date');
      expect(date['format'], nom).toBe('YYYY-MM-DD');
      expect(date['time_format'], nom).toBe(false);
    }
    // Valeur produite par ce format (jeton Day.js YYYY-MM-DD) : acceptée par le schéma.
    expect(dateSchema.safeParse('2026-10-10').success).toBe(true);
  });

  it('nom de fichier d’un rendez-vous : AAAA-MM-JJ.md, non modifiable à la main', () => {
    const slug = collection('rendezvous')['slug'] as { template: string; editable: boolean };
    expect(slug.template).toBe('{{fields.date}}');
    expect(slug.editable).toBe(false);
  });

  it('image d’actualité : public_folder relatif au fichier .md = media_folder', () => {
    const actus = collection('actualites');
    const mediaFolder = actus['media_folder'] as string;
    const publicFolder = actus['public_folder'] as string;
    expect(mediaFolder.startsWith('/')).toBe(true);
    const depuisLaRacine = path.resolve(RACINE, `.${mediaFolder}`);
    const depuisLeFichier = path.resolve(RACINE, actus.folder ?? '', publicFolder);
    expect(depuisLeFichier).toBe(depuisLaRacine);
    expect(existsSync(depuisLaRacine)).toBe(true);
    const image = champ(actus, 'image');
    expect(image.widget).toBe('image');
    expect(image.required).toBe(false);
    expect(image['choose_url']).toBe(false);
  });

  it('éditeur Markdown : sans HTML ni composants, mode texte enrichi seul, aide sur les paragraphes', () => {
    const editeurs: Champ[] = [
      champ(collection('actualites'), 'body'),
      ...(collection('pages').files ?? []).map((f) => champ(f, 'body')),
    ];
    for (const e of editeurs) {
      expect(e.label).toBe('Texte');
      expect(e['editor_components']).toEqual([]);
      expect(e['modes']).toEqual(['rich_text']);
      const boutons = e['buttons'] as string[];
      expect(boutons).not.toContain('code');
      expect(boutons).not.toContain('heading-one');
      expect(boutons).not.toContain('heading-two');
      expect(e.hint).toContain('Pour passer à la ligne, laissez une ligne vide entre deux paragraphes.');
    }
  });
});

describe('fichiers tels qu’écrits par le CMS (YAML sans guillemets), lus par Astro', () => {
  it('rendez-vous : heure 16:00 non quotée lue comme texte, date AAAA-MM-JJ valide', () => {
    const md = [
      '---',
      'date: 2026-10-17',
      'heure: 16:00',
      `lieu: ${LIEU_PAR_DEFAUT}`,
      'remarque: Annulé en cas de pluie',
      'annule: false',
      '---',
      '',
    ].join('\n');
    const rdv = rendezvousSchema.parse(parseFrontmatter(md).frontmatter);
    expect(rdv.heure).toBe('16:00');
    expect(rdv.date.toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(rdv.annule).toBe(false);
  });

  it('actualité : image relative au fichier .md, résolue dans media_folder', () => {
    const actus = collection('actualites');
    const md = [
      '---',
      'titre: Stage de printemps',
      'date: 2026-10-04',
      `image: ${actus['public_folder'] as string}/photo.webp`,
      '---',
      '',
      'Texte.',
    ].join('\n');
    const fm = parseFrontmatter(md).frontmatter;
    expect(actualiteSchema.safeParse(fm).success).toBe(true);
    const cible = path.resolve(RACINE, 'src/content/actualites', fm['image'] as string);
    expect(cible).toBe(path.join(RACINE, 'src/assets/actualites/photo.webp'));
  });
});

describe('contenus réels : aucun HTML brut', () => {
  const fichiersMd = (dossier: string): string[] =>
    readdirSync(path.join(RACINE, dossier), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dossier, f));
  const fichiers = ['src/content/pages', 'src/content/actualites', 'src/content/rendezvous'].flatMap(fichiersMd);

  it('il y a des contenus à vérifier', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(5);
  });

  it.each(fichiers)('%s : ni <br ni commentaire HTML', (f) => {
    const texte = readFileSync(path.join(RACINE, f), 'utf8');
    expect(texte).not.toMatch(/<br/i);
    expect(texte).not.toContain('<!--');
  });
});
