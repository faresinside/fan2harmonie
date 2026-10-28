import { parseFrontmatter } from '@astrojs/markdown-remark';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  CODE_GOOGLE_REGEX,
  HEURE_REGEX,
  ICONES_BIENFAIT,
  accueilSchema,
  actualiteSchema,
  dateSchema,
  lieuSchema,
  menuSchema,
  pageSchema,
  referencementSchema,
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
    expect(c.collections.map((x) => x.name).sort()).toEqual(['actualites', 'pages', 'reglages', 'rendezvous']);
  });

  it('connexion GitHub par le relais du site lui-même : base_url = https://<hôte de site.url>, auth_endpoint = oauth/auth.php', async () => {
    delete process.env['AUDIT_SITE_URL'];
    const { site } = await import('../../src/config/site');
    const backend = config().backend;
    expect(backend['base_url']).toBe(`https://${new URL(site.url).hostname}`);
    expect(backend['auth_endpoint']).toBe('oauth/auth.php');
    // Le point d'entrée existe (public/oauth/auth.php) ; son adresse de retour est oauth/callback.php.
    expect(existsSync(path.join(RACINE, 'public', backend['auth_endpoint'] as string))).toBe(true);
    expect(existsSync(path.join(RACINE, 'public/oauth/callback.php'))).toBe(true);
    // Adresse de la fenêtre de connexion telle que Sveltia la construit (base_url + « / » + auth_endpoint).
    expect(`${String(backend['base_url']).replace(/\/+$/, '')}/${String(backend['auth_endpoint']).replace(/^\/+/, '')}`).toBe(
      'https://fan2harmonie.fr/oauth/auth.php',
    );
    // Ni autre méthode de connexion, ni autre relais.
    for (const cle of ['auth_type', 'app_id', 'api_root', 'site_domain']) expect(backend[cle], cle).toBeUndefined();
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
      // « accroche » (phrase sous le titre) n'existe que pour la page « Activités proposées ».
      const attendus = cles(pageSchema.shape).filter((c) => c !== 'accroche' || f.name === 'offres');
      expect(champsFrontMatter(f), f.name).toEqual(attendus);
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
    expect(fichiers.map((f) => f.name).sort()).toEqual(['offres', 'parcours', 'pratique', 'qigong']);
    for (const f of fichiers) {
      expect(f.file).toBe(`src/content/pages/${f.name}.md`);
      expect(existsSync(path.join(RACINE, f.file)), f.file).toBe(true);
    }
    expect(Object.fromEntries(fichiers.map((f) => [f.name, f.label]))).toEqual({
      pratique: 'La pratique',
      offres: 'Activités proposées (page des séances)',
      qigong: 'Le Qi Gong',
      parcours: 'Mon parcours',
    });
  });

  it('rendez-vous et actualités : dossiers du site, création et suppression autorisées', () => {
    for (const nom of ['rendezvous', 'actualites']) {
      const c = collection(nom);
      expect(c.folder).toBe(`src/content/${nom}`);
      // Pas de contrôle d'existence : le dossier disparaît (git) si l'éditrice supprime toutes les fiches.
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
    expect(champ(rdv, 'lieu').default).toBeUndefined();
    expect(champ(rdv, 'lieu').hint).toContain('Laissez vide pour le lieu habituel');
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

  it('nom suffixé (2e rendez-vous du jour, AAAA-MM-JJ-1.md) lu par le site : glob **/*.md, déjà couvert par un jeu de test', () => {
    // Le nom du fichier n'est pas lu par le site : seule la date du front matter compte.
    expect(readFileSync(path.join(RACINE, 'src/content.config.ts'), 'utf8')).toContain("pattern: '**/*.md'");
    // Jeu e2e « melange » : 2099-03-14.md et 2099-03-14-matin.md, deux séances le même jour (tests/e2e/rdv-actus.spec.ts).
    expect(existsSync(path.join(RACINE, 'tests/fixtures/content/melange/rendezvous/2099-03-14-matin.md'))).toBe(true);
  });

  it('nom de fichier d’un rendez-vous : AAAA-MM-JJ.md, non modifiable à la main', () => {
    const slug = collection('rendezvous')['slug'] as { template: string; editable: boolean };
    expect(slug.template).toBe('{{fields.date}}');
    expect(slug.editable).toBe(false);
  });

  it('photos d’actualité : public_folder relatif au fichier .md = media_folder', () => {
    const actus = collection('actualites');
    const mediaFolder = actus['media_folder'] as string;
    const publicFolder = actus['public_folder'] as string;
    expect(mediaFolder.startsWith('/')).toBe(true);
    const depuisLaRacine = path.resolve(RACINE, `.${mediaFolder}`);
    const depuisLeFichier = path.resolve(RACINE, actus.folder ?? '', publicFolder);
    expect(depuisLeFichier).toBe(depuisLaRacine);
    expect(existsSync(depuisLaRacine)).toBe(true);
    expect(actus.fields?.map((f) => f.name)).not.toContain('image');
  });

  it('photos d’actualité : liste facultative de 0 à 12 photos, légende de 120 caractères au plus, lues dans le schéma', () => {
    const photos = champ(collection('actualites'), 'photos');
    expect(photos.widget).toBe('list');
    expect(photos.label).toBe('Photos');
    expect(photos.required).toBe(false);
    expect(photos.hint).toBe(
      'Ajoutez autant de photos que vous voulez (12 au plus). La légende est facultative, elle décrit la photo pour les personnes qui ne la voient pas.',
    );
    const unePhoto = { image: './p.jpg' };
    const acceptees = Array.from({ length: 30 }, (_, n) => n).filter(
      (n) => actualiteSchema.shape.photos.safeParse(Array.from({ length: n }, () => unePhoto)).success,
    );
    expect(Math.min(...acceptees)).toBe(0);
    expect(photos['min']).toBeUndefined();
    expect(photos['max']).toBe(Math.max(...acceptees));
    expect(photos['max']).toBe(12);
    const sous = photos['fields'] as Champ[];
    expect(sous.map((x) => x.name)).toEqual(['image', 'legende']);
    const image = champ({ fields: sous }, 'image');
    expect(image.widget).toBe('image');
    expect(image.required).not.toBe(false);
    expect(image['choose_url']).toBe(false);
    expect(image['accept']).toBe('image/jpeg,image/png,image/webp');
    const legende = champ({ fields: sous }, 'legende');
    expect(legende.widget).toBe('string');
    expect(legende.required).toBe(false);
    const forme = actualiteSchema.shape.photos.unwrap().element.shape;
    const longueurs = Array.from({ length: 301 }, (_, n) => n).filter((n) => forme.legende.safeParse('a'.repeat(n)).success);
    expect(legende['maxlength']).toBe(Math.max(...longueurs));
    expect(legende['maxlength']).toBe(120);
  });

  describe('réglages du site', () => {
    const fichier = (nom: string): Fichier => {
      const f = (collection('reglages').files ?? []).find((x) => x.name === nom);
      if (!f) throw new Error(`fichier ${nom} absent`);
      return f;
    };

    it('collection de fichiers fixes (ni création ni suppression), quatre fichiers présents', () => {
      const r = collection('reglages');
      expect(r.label).toBe('Réglages du site');
      expect(r.folder).toBeUndefined();
      expect(r['create']).not.toBe(true);
      expect(r['delete']).not.toBe(true);
      expect((r['editor'] as Record<string, unknown>)['preview']).toBe(false);
      const fichiers = r.files ?? [];
      expect(fichiers.map((f) => f.name).sort()).toEqual(['accueil', 'lieu', 'menu', 'referencement']);
      for (const f of fichiers) {
        expect(f.file).toBe(`src/content/reglages/${f.name}.md`);
        expect(existsSync(path.join(RACINE, f.file)), f.file).toBe(true);
      }
      expect(Object.fromEntries(fichiers.map((f) => [f.name, f.label]))).toEqual({
        accueil: 'Page d’accueil',
        lieu: 'Lieu de la pratique',
        menu: 'Menu et titres',
        referencement: 'Référencement Google',
      });
    });

    it('champs de chaque fichier (hors corps) = clés du schéma Zod', () => {
      expect(champsFrontMatter(fichier('accueil'))).toEqual(cles(accueilSchema.shape));
      expect(champsFrontMatter(fichier('lieu'))).toEqual(cles(lieuSchema.shape));
      expect(champsFrontMatter(fichier('referencement'))).toEqual(cles(referencementSchema.shape));
      expect(champsFrontMatter(fichier('menu'))).toEqual(cles(menuSchema.shape));
    });

    it('lieu : latitude et longitude en nombres décimaux, bornes du schéma', () => {
      const lieu = fichier('lieu');
      const bornes = { latitude: [-90, 90], longitude: [-180, 180] } as const;
      for (const [nom, [min, max]] of Object.entries(bornes)) {
        const f = champ(lieu, nom);
        expect(f.widget, nom).toBe('number');
        expect(f['value_type'], nom).toBe('float');
        expect(f['min'], nom).toBe(min);
        expect(f['max'], nom).toBe(max);
        expect(lieuSchema.shape[nom as 'latitude' | 'longitude'].safeParse(min).success, nom).toBe(true);
        expect(lieuSchema.shape[nom as 'latitude' | 'longitude'].safeParse(max + 1).success, nom).toBe(false);
      }
    });

    it('lieu : corps Markdown limité comme les pages', () => {
      const e = champ(fichier('lieu'), 'body');
      expect(e.widget).toBe('markdown');
      expect(e['modes']).toEqual(['rich_text']);
      expect(e['editor_components']).toEqual([]);
      expect(e['buttons']).toEqual(['bold', 'italic', 'link', 'bulleted-list']);
      expect(e.hint).toContain('Pour passer à la ligne, laissez une ligne vide entre deux paragraphes.');
    });

    it('code Google : motif du schéma, facultatif, refuse la balise <meta> entière', () => {
      const f = champ(fichier('referencement'), 'verificationGoogle');
      expect(f.required).toBe(false);
      expect(f.pattern?.[0]).toBe(CODE_GOOGLE_REGEX.source);
      expect(f.pattern?.[1]).toMatch(/balise/);
      expect(f.hint).toBe('Collez seulement le code (la suite de lettres et de chiffres), pas toute la balise');
      const code = 'abcdefghij_KLMNOP-1234567890';
      expect(motif(f).test(code)).toBe(true);
      expect(motif(f).test(`<meta name="google-site-verification" content="${code}" />`)).toBe(false);
      expect(motif(f).test('court')).toBe(false);
    });

    it('bienfaits : icônes du schéma, liste de 1 à 6', () => {
      const bienfaits = champ(fichier('accueil'), 'bienfaits');
      expect(bienfaits.widget).toBe('list');
      expect(bienfaits['min']).toBe(1);
      expect(bienfaits['max']).toBe(6);
      const sous = bienfaits['fields'] as Champ[];
      expect(sous.map((x) => x.name).sort()).toEqual(['icone', 'libelle']);
      const icone = sous.find((x) => x.name === 'icone') as Champ;
      expect(icone.widget).toBe('select');
      const valeurs = (icone['options'] as Array<string | { value: string }>).map((o) =>
        typeof o === 'string' ? o : o.value,
      );
      expect(valeurs).toEqual([...ICONES_BIENFAIT]);
    });

    it('infos : liste de 1 à 5 éléments', () => {
      const infos = champ(fichier('accueil'), 'infos');
      expect(infos.widget).toBe('list');
      expect(infos['min']).toBe(1);
      expect(infos['max']).toBe(5);
    });

    /** Bornes réellement appliquées par un schéma Zod, trouvées en l'interrogeant (longueurs 0 à 300 de `valeur`). */
    type Sonde = { safeParse(v: unknown): { success: boolean } };
    const bornes = (schema: Sonde, fabrique: (n: number) => unknown, sonde = 300): { min: number; max: number } => {
      const acceptees = Array.from({ length: sonde + 1 }, (_, n) => n).filter((n) => schema.safeParse(fabrique(n)).success);
      if (acceptees.length === 0) throw new Error('aucune longueur acceptée par le schéma');
      const min = Math.min(...acceptees);
      const max = Math.max(...acceptees);
      expect(max, 'borne haute trouvée trop proche de la limite de sonde').toBeLessThan(sonde);
      expect(acceptees.length, 'longueurs acceptées non contiguës').toBe(max - min + 1);
      return { min, max };
    };
    /** Mots du menu des pages de texte : facultatifs (le menu reprend alors le titre de la page). */
    const MOTS_FACULTATIFS = new Set(['pratique', 'offres', 'qigong', 'qui']);
    const chaine = (n: number) => 'a'.repeat(n);
    const liste = (n: number) => Array.from({ length: n }, () => 'a');

    /** Le champ texte du CMS impose les mêmes bornes que le schéma (obligatoire si le minimum est 1 ou plus). */
    const verifieChaine = (nom: string, f: Champ, schema: Sonde, sonde = 300) => {
      const { min, max } = bornes(schema, chaine, sonde);
      expect(f['maxlength'], `${nom} : maxlength`).toBe(max);
      if (min > 1) expect(f['minlength'], `${nom} : minlength`).toBe(min);
      else expect(f['minlength'], `${nom} : minlength`).toBeUndefined();
      if (min >= 1) expect(f.required, `${nom} : obligatoire`).not.toBe(false);
      else expect(f.required, `${nom} : facultatif`).toBe(false);
    };

    it('champs texte : minlength, maxlength et caractère obligatoire lus dans les schémas Zod', () => {
      const accueil = fichier('accueil');
      for (const nom of ['accroche', 'titre', 'sousTitre', 'devise', 'bouton'] as const) {
        verifieChaine(`accueil.${nom}`, champ(accueil, nom), accueilSchema.shape[nom]);
      }
      verifieChaine('lieu.nom', champ(fichier('lieu'), 'nom'), lieuSchema.shape.nom);
      // Menu : six libellés (30 caractères au plus) et trois titres de section (60 au plus), tous obligatoires.
      const menu = fichier('menu');
      for (const nom of Object.keys(menuSchema.shape) as Array<keyof typeof menuSchema.shape>) {
        if (MOTS_FACULTATIFS.has(nom)) {
          // Mot du menu facultatif : absent, le menu reprend le titre de la page ; sinon 30 caractères au plus.
          expect(champ(menu, nom).required, `menu.${nom} : facultatif`).toBe(false);
          expect(champ(menu, nom)['maxlength'], `menu.${nom} : maxlength`).toBe(30);
          expect(champ(menu, nom).hint, `menu.${nom} : aide`).toContain('Laissez VIDE');
        } else {
          verifieChaine(`menu.${nom}`, champ(menu, nom), menuSchema.shape[nom] as never);
        }
      }
      const ref = fichier('referencement');
      verifieChaine('referencement.titre', champ(ref, 'titre'), referencementSchema.shape.titre);
      verifieChaine('referencement.description', champ(ref, 'description'), referencementSchema.shape.description);
      // Code Google : facultatif, longueur portée par le motif (CODE_GOOGLE_REGEX), pas par minlength/maxlength.
      const code = champ(ref, 'verificationGoogle');
      expect(referencementSchema.shape.verificationGoogle.safeParse(undefined).success).toBe(true);
      expect(code.required).toBe(false);
      expect(code['minlength']).toBeUndefined();
      expect(code['maxlength']).toBeUndefined();
      const lg = bornes(referencementSchema.shape.verificationGoogle, chaine);
      for (const n of [lg.min - 1, lg.min, lg.max, lg.max + 1]) {
        expect(motif(code).test(chaine(n)), `code de ${n} caractères`).toBe(
          referencementSchema.shape.verificationGoogle.safeParse(chaine(n)).success,
        );
      }
    });

    it('listes : nombre d’éléments (min, max) et longueur des textes lus dans les schémas Zod', () => {
      const accueil = fichier('accueil');
      // infos : liste de textes.
      const infos = champ(accueil, 'infos');
      const nbInfos = bornes(accueilSchema.shape.infos, liste);
      expect(infos['min'], 'infos : min').toBe(nbInfos.min);
      expect(infos['max'], 'infos : max').toBe(nbInfos.max);
      verifieChaine('infos : élément', infos['field'] as Champ, accueilSchema.shape.infos.element);
      // bienfaits : liste de { icone, libelle }.
      const bienfaits = champ(accueil, 'bienfaits');
      const unBienfait = { icone: ICONES_BIENFAIT[0], libelle: 'a' };
      const nbBienfaits = bornes(accueilSchema.shape.bienfaits, (n) => Array.from({ length: n }, () => unBienfait));
      expect(bienfaits['min'], 'bienfaits : min').toBe(nbBienfaits.min);
      expect(bienfaits['max'], 'bienfaits : max').toBe(nbBienfaits.max);
      const forme = accueilSchema.shape.bienfaits.element.shape;
      verifieChaine('bienfaits.libelle', champ(bienfaits as { fields?: Champ[] }, 'libelle'), forme.libelle);
      expect(champ(bienfaits as { fields?: Champ[] }, 'icone').required, 'bienfaits.icone : obligatoire').not.toBe(false);
    });

    it('lieu : champs obligatoires comme dans le schéma', () => {
      const lieu = fichier('lieu');
      for (const nom of ['latitude', 'longitude'] as const) {
        expect(lieuSchema.shape[nom].safeParse(undefined).success, nom).toBe(false);
        expect(champ(lieu, nom).required, nom).not.toBe(false);
      }
    });

    it('menu : pas de corps Markdown, que des champs texte, motif refusant le vide et les espaces seuls comme le schéma', () => {
      const menu = fichier('menu');
      expect(menu.fields.map((f) => f.name)).not.toContain('body');
      for (const f of menu.fields) expect(f.widget, f.name).toBe('string');
      for (const nom of Object.keys(menuSchema.shape) as Array<keyof typeof menuSchema.shape>) {
        const f = champ(menu, nom);
        expect(f.pattern?.[1], `${nom} : message du motif`).toMatch(/caractère visible/);
        for (const ko of ['', '   ']) {
          expect(motif(f).test(ko), `${nom} : « ${ko} » refusé par le CMS`).toBe(false);
          expect(menuSchema.shape[nom].safeParse(ko).success, `${nom} : « ${ko} » refusé par le schéma`).toBe(false);
        }
        for (const ok of ['Contact', ' Contact ']) {
          expect(motif(f).test(ok), `${nom} : « ${ok} » accepté par le CMS`).toBe(true);
          expect(menuSchema.shape[nom].safeParse(ok).success, `${nom} : « ${ok} » accepté par le schéma`).toBe(true);
        }
      }
    });

    it('chaque champ a un libellé et une aide en français', () => {
      for (const f of collection('reglages').files ?? []) {
        for (const c of f.fields) {
          expect(c.label?.trim(), `${f.name}.${c.name} : label`).toBeTruthy();
          expect(c.hint?.trim(), `${f.name}.${c.name} : hint`).toBeTruthy();
        }
      }
    });
  });

  it('éditeur Markdown : sans HTML ni composants, mode texte enrichi seul, aide sur les paragraphes', () => {
    const editeurs: [string, Champ][] = [
      ['actualites', champ(collection('actualites'), 'body')],
      ...(collection('pages').files ?? []).map((f): [string, Champ] => [f.name, champ(f, 'body')]),
    ];
    // La page « Activités proposées » (titre de page en h1) écrit ses offres en titres de niveau 2 ; les autres
    // textes sont dans une section de l'accueil (h2) et n'ont que le niveau 3.
    for (const [nom, e] of editeurs) {
      expect(e.label).toBe('Texte');
      expect(e['editor_components']).toEqual([]);
      expect(e['modes']).toEqual(['rich_text']);
      const boutons = e['buttons'] as string[];
      expect(boutons).not.toContain('code');
      expect(boutons).not.toContain('heading-one');
      if (nom === 'offres') expect(boutons).toContain('heading-two');
      else expect(boutons).not.toContain('heading-two');
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
      'lieu: Salle des fêtes',
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

  it('actualité : photos relatives au fichier .md, résolues dans media_folder', () => {
    const actus = collection('actualites');
    const md = [
      '---',
      'titre: Stage de printemps',
      'date: 2026-10-04',
      'photos:',
      `  - image: ${actus['public_folder'] as string}/photo.webp`,
      '    legende: Le groupe sous les arbres',
      '---',
      '',
      'Texte.',
    ].join('\n');
    const fm = parseFrontmatter(md).frontmatter;
    expect(actualiteSchema.safeParse(fm).success).toBe(true);
    const photos = fm['photos'] as Array<{ image: string }>;
    const cible = path.resolve(RACINE, 'src/content/actualites', photos[0]?.image ?? '');
    expect(cible).toBe(path.join(RACINE, 'src/assets/actualites/photo.webp'));
  });
});
