import { parseFrontmatter } from '@astrojs/markdown-remark';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accueilSchema,
  actualiteSchema,
  CODE_GOOGLE_REGEX,
  ICONES_BIENFAIT,
  lieuSchema,
  menuSchema,
  referencementSchema,
  rendezvousSchema,
} from '../../src/lib/schemas';

describe('rendezvousSchema', () => {
  it('accepte une date et une heure valides, avec valeurs par défaut', () => {
    const r = rendezvousSchema.parse({ date: '2026-10-10', heure: '16:00' });
    expect(r.lieu).toBeUndefined();
    expect(r.annule).toBe(false);
    expect(r.remarque).toBeUndefined();
  });

  it("rejette une heure au mauvais format", () => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure: '4pm' }).success).toBe(false);
  });

  it('rejette une date invalide', () => {
    expect(rendezvousSchema.safeParse({ date: '2026-13-40', heure: '16:00' }).success).toBe(false);
  });

  it.each(['2026-02-30', '2026-04-31', '2026-10-10T00:00', '10/10/2026'])(
    'rejette la date %s (pas de débordement)',
    (date) => {
      expect(rendezvousSchema.safeParse({ date, heure: '16:00' }).success).toBe(false);
    },
  );

  it('accepte une date en chaîne ou en objet Date (YAML non quoté) et produit un Date UTC', () => {
    const a = rendezvousSchema.parse({ date: '2026-10-10', heure: '16:00' });
    const b = rendezvousSchema.parse({ date: new Date('2026-10-10'), heure: '16:00' });
    expect(a.date.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(b.date.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(rendezvousSchema.safeParse({ date: new Date('invalid'), heure: '16:00' }).success).toBe(false);
  });

  it.each(['23:59', '00:00'])('accepte l\'heure %s', (heure) => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure }).success).toBe(true);
  });

  it.each(['25:00', '12:60', '99:99', '24:00'])("rejette l'heure %s", (heure) => {
    expect(rendezvousSchema.safeParse({ date: '2026-10-10', heure }).success).toBe(false);
  });
});

describe('actualiteSchema', () => {
  it('accepte un titre de 90 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(90), date: '2026-10-04' }).success).toBe(true);
  });

  it('rejette un titre de 91 caractères', () => {
    expect(actualiteSchema.safeParse({ titre: 'a'.repeat(91), date: '2026-10-04' }).success).toBe(false);
  });

  describe('photos', () => {
    const base = { titre: 'Stage', date: '2026-10-04' };
    const photos = (n: number, legende?: string) =>
      Array.from({ length: n }, (_, i) => ({ image: `./p${i}.jpg`, ...(legende === undefined ? {} : { legende }) }));

    it('accepte l’absence de photos', () => {
      expect(actualiteSchema.safeParse(base).success).toBe(true);
      expect(actualiteSchema.safeParse({ ...base, photos: [] }).success).toBe(true);
    });

    it.each([0, 1, 12])('accepte %i photo(s)', (n) => {
      expect(actualiteSchema.safeParse({ ...base, photos: photos(n) }).success).toBe(true);
    });

    it('rejette 13 photos', () => {
      expect(actualiteSchema.safeParse({ ...base, photos: photos(13) }).success).toBe(false);
    });

    it('légende facultative, de 120 caractères au plus', () => {
      expect(actualiteSchema.safeParse({ ...base, photos: [{ image: './p.jpg' }] }).success).toBe(true);
      expect(actualiteSchema.safeParse({ ...base, photos: photos(1, 'a'.repeat(120)) }).success).toBe(true);
      expect(actualiteSchema.safeParse({ ...base, photos: photos(1, 'a'.repeat(121)) }).success).toBe(false);
    });

    it('une photo a toujours une image, et l’ancien champ `image` n’existe plus', () => {
      expect(actualiteSchema.safeParse({ ...base, photos: [{ legende: 'x' }] }).success).toBe(false);
      expect(Object.keys(actualiteSchema.shape)).not.toContain('image');
    });
  });
});

describe('lieuSchema', () => {
  const base = { nom: 'Parc', latitude: 48.64703, longitude: 1.811268 };

  it('accepte un lieu valide', () => {
    expect(lieuSchema.safeParse(base).success).toBe(true);
  });

  it.each([90.1, -90.1])('rejette la latitude %s', (latitude) => {
    expect(lieuSchema.safeParse({ ...base, latitude }).success).toBe(false);
  });

  it('rejette la longitude 180.1', () => {
    expect(lieuSchema.safeParse({ ...base, longitude: 180.1 }).success).toBe(false);
  });

  it('rejette une latitude en texte', () => {
    expect(lieuSchema.safeParse({ ...base, latitude: '48,647' }).success).toBe(false);
  });

  it('rejette un nom vide', () => {
    expect(lieuSchema.safeParse({ ...base, nom: '' }).success).toBe(false);
  });
});

describe('accueilSchema', () => {
  const base = {
    accroche: '1 heure pour vous…',
    titre: 'Qi Gong',
    sousTitre: 'Animation découverte',
    devise: 'Respirez, Bougez, Équilibrez-vous',
    infos: ['Parc de Rambouillet', 'gratuit'],
    bouton: 'Venez essayer',
    bienfaits: [{ icone: 'souffle', libelle: 'Faire circuler l’énergie' }],
  };

  it('accepte un accueil valide', () => {
    expect(accueilSchema.safeParse(base).success).toBe(true);
    expect(ICONES_BIENFAIT).toEqual(['souffle', 'lotus', 'silhouette', 'yinyang']);
  });

  it('rejette infos vide', () => {
    expect(accueilSchema.safeParse({ ...base, infos: [] }).success).toBe(false);
  });

  it('rejette six infos', () => {
    expect(accueilSchema.safeParse({ ...base, infos: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
  });

  it('rejette une icône hors liste', () => {
    expect(accueilSchema.safeParse({ ...base, bienfaits: [{ icone: 'etoile', libelle: 'x' }] }).success).toBe(false);
  });

  it('rejette un bouton de 31 caractères', () => {
    expect(accueilSchema.safeParse({ ...base, bouton: 'a'.repeat(31) }).success).toBe(false);
  });
});

describe('referencementSchema', () => {
  const base = { titre: 'a'.repeat(10), description: 'd'.repeat(50) };

  it('accepte un code Google de 20 caractères', () => {
    expect(CODE_GOOGLE_REGEX.test('a'.repeat(20))).toBe(true);
    expect(referencementSchema.safeParse({ ...base, verificationGoogle: 'Ab0_-'.repeat(4) }).success).toBe(true);
  });

  it("accepte l'absence de code", () => {
    expect(referencementSchema.safeParse(base).success).toBe(true);
  });

  it('rejette une balise meta collée à la place du code', () => {
    const verificationGoogle = '<meta name="google-site-verification" content="abc">';
    expect(referencementSchema.safeParse({ ...base, verificationGoogle }).success).toBe(false);
  });

  it('rejette un code de 19 caractères', () => {
    expect(referencementSchema.safeParse({ ...base, verificationGoogle: 'a'.repeat(19) }).success).toBe(false);
  });

  it('rejette un titre de 71 caractères', () => {
    expect(referencementSchema.safeParse({ ...base, titre: 'a'.repeat(71) }).success).toBe(false);
  });

  it('rejette une description de 49 caractères', () => {
    expect(referencementSchema.safeParse({ ...base, description: 'd'.repeat(49) }).success).toBe(false);
  });
});

describe('menuSchema', () => {
  const base = {
    rdv: 'Rendez-vous',
    pratique: 'La pratique',
    qigong: 'Le Qi Gong',
    qui: 'Qui est Fan 2 Harmonie',
    actualites: 'Actualités',
    contact: 'Contact',
    titreRdv: 'Prochains rendez-vous',
    titreActualites: 'Actualités',
    titreContact: 'Contactez-moi',
  };
  const libelles = ['rdv', 'pratique', 'qigong', 'qui', 'actualites', 'contact'] as const;
  const titres = ['titreRdv', 'titreActualites', 'titreContact'] as const;

  it('accepte les valeurs actuelles du site', () => {
    expect(menuSchema.safeParse(base).success).toBe(true);
  });

  it.each(libelles)('libellé « %s » : 30 caractères acceptés, 31 refusés', (cle) => {
    expect(menuSchema.safeParse({ ...base, [cle]: 'a'.repeat(30) }).success).toBe(true);
    expect(menuSchema.safeParse({ ...base, [cle]: 'a'.repeat(31) }).success).toBe(false);
  });

  it.each(titres)('titre « %s » : 60 caractères acceptés, 61 refusés', (cle) => {
    expect(menuSchema.safeParse({ ...base, [cle]: 'a'.repeat(60) }).success).toBe(true);
    expect(menuSchema.safeParse({ ...base, [cle]: 'a'.repeat(61) }).success).toBe(false);
  });

  it.each([...libelles, ...titres])('« %s » : vide ou seulement des espaces refusé', (cle) => {
    expect(menuSchema.safeParse({ ...base, [cle]: '' }).success).toBe(false);
    expect(menuSchema.safeParse({ ...base, [cle]: '   ' }).success).toBe(false);
  });

  it('refuse un libellé absent', () => {
    const { contact: _contact, ...sansContact } = base;
    expect(menuSchema.safeParse(sansContact).success).toBe(false);
  });

  it('retire les espaces autour du texte', () => {
    expect(menuSchema.parse({ ...base, rdv: '  Séances  ' }).rdv).toBe('Séances');
  });
});

describe('jeu de test « galerie »', () => {
  const dossier = path.resolve(__dirname, '../fixtures/content/galerie/actualites');
  const photosDe = (nom: string) => {
    const fm = parseFrontmatter(readFileSync(path.join(dossier, `${nom}.md`), 'utf8')).frontmatter;
    expect(actualiteSchema.safeParse(fm).success, nom).toBe(true);
    return (fm['photos'] ?? []) as Array<{ image: string; legende?: string }>;
  };

  it('une photo, cinq photos (dont 2 sans légende et une légende de 120 caractères), aucune photo', () => {
    expect(photosDe('une-photo')).toHaveLength(1);
    expect(photosDe('une-photo')[0]?.legende).toBeTruthy();
    const cinq = photosDe('cinq-photos');
    expect(cinq).toHaveLength(5);
    expect(cinq.filter((p) => !p.legende)).toHaveLength(2);
    expect(Math.max(...cinq.map((p) => p.legende?.length ?? 0))).toBe(120);
    expect(photosDe('sans-photo')).toEqual([]);
  });

  it('les cinq images existent', () => {
    for (const p of photosDe('cinq-photos')) expect(existsSync(path.join(dossier, p.image)), p.image).toBe(true);
  });
});
