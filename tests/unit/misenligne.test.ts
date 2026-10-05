import { describe, expect, it } from 'vitest';
import {
  contientPlaceholder,
  listerPlaceholders,
  validerDepot,
  validerEmail,
  SIRETS_EXEMPLES,
  validerEndpointContact,
  validerSiret,
  validerUrlHttps,
  validerUrlSite,
  verifierBackendCms,
  verifierSite,
} from '../../src/lib/misenligne';

/**
 * Luhn écrit indépendamment de l'implémentation testée (table des doubles), pour fabriquer des SIRET
 * valides sans utiliser de données d'une vraie entreprise.
 */
const DOUBLE = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
function cleLuhn(debut13: string): string {
  // Le chiffre de contrôle sera en position 0 (à droite) : les chiffres du préfixe en positions impaires sont doublés.
  const chiffres = [...debut13].reverse().map(Number);
  const somme = chiffres.reduce((s, c, i) => s + (i % 2 === 0 ? DOUBLE[c] ?? 0 : c), 0);
  return debut13 + String((10 - (somme % 10)) % 10);
}
const siretValides = ['1234567890123', '9876543210987', '5555555555555', '1000000000000'].map(cleLuhn);

describe('validerSiret', () => {
  it('cas vérifié à la main : 123 456 789 01237 valide, 12345678901236 invalide', () => {
    expect(validerSiret('123 456 789 01237')).toBe(true);
    expect(validerSiret('12345678901236')).toBe(false);
  });

  it.each(siretValides)('SIRET fabriqué %s : valide, avec ou sans espaces', (s) => {
    expect(validerSiret(s)).toBe(true);
    expect(validerSiret(`${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`)).toBe(true);
  });

  it.each(siretValides)('SIRET fabriqué %s : un chiffre modifié fait échouer la clé', (s) => {
    const dernier = Number(s.at(-1));
    expect(validerSiret(s.slice(0, -1) + String((dernier + 1) % 10))).toBe(false);
  });

  it.each([
    ['vide', ''],
    ['13 chiffres', '1234567890123'],
    ['15 chiffres', '123456789012370'],
    ['lettres', '1234567890123A'],
    ['tirets', '123-456-789-01237'],
    ['valeur de substitution', 'À_COMPLÉTER'],
  ])('refuse : %s', (_cas, valeur) => {
    expect(validerSiret(valeur)).toBe(false);
  });
});

describe('validerEndpointContact', () => {
  it('accepte exactement le script de contact du même hébergement', () => {
    expect(validerEndpointContact('/api/contact.php')).toBe(true);
  });

  it.each([
    'À_COMPLÉTER',
    '',
    'https://formspree.io/f/xyzabcde',
    'https://fan2harmonie.fr/api/contact.php',
    '//evil.example/api/contact.php',
    '/api/contact.php?x=1',
    '/api/contact.php ',
    'api/contact.php',
    '/api/autre.php',
  ])('refuse « %s »', (url) => {
    expect(validerEndpointContact(url)).toBe(false);
  });
});

describe('SIRET d’exemple', () => {
  it('les valeurs d’exemple sont listées sans espaces, et 123 456 789 00012 échoue déjà à la clé de Luhn', () => {
    expect(SIRETS_EXEMPLES).toEqual(['12345678900012', '00000000000000']);
    expect(validerSiret('123 456 789 00012')).toBe(false);
  });
});
describe('validerEmail', () => {
  it('accepte une adresse simple', () => {
    expect(validerEmail('contact@exemple.fr')).toBe(true);
    expect(validerEmail('prenom.nom+site@exemple.co.uk')).toBe(true);
  });

  it.each(['À_COMPLÉTER', '', 'contact@', '@exemple.fr', 'contact@exemple', 'con tact@exemple.fr', 'a@b@c.fr'])(
    'refuse « %s »',
    (email) => {
      expect(validerEmail(email)).toBe(false);
    },
  );
});

describe('validerUrlSite', () => {
  it('accepte une adresse https avec un vrai nom de domaine', () => {
    expect(validerUrlSite('https://www.exemple.fr')).toBe(true);
    expect(validerUrlSite('https://exemple.fr/')).toBe(true);
  });

  it.each([
    'https://a-completer.invalid',
    'http://www.exemple.fr',
    'https://localhost',
    'http://localhost:4400',
    'https://exemple.localhost',
    'https://127.0.0.1',
    'https://exemple',
    'https://exemple.test',
    'https://exemple.example',
    'À_COMPLÉTER',
    '',
  ])('refuse %s', (url) => {
    expect(validerUrlSite(url)).toBe(false);
  });
});

describe('validerDepot et validerUrlHttps (config.yml)', () => {
  it('dépôt GitHub « propriétaire/dépôt »', () => {
    expect(validerDepot('stephanie-exemple/fan2harmonie')).toBe(true);
    expect(validerDepot('Owner_1/site.web-2')).toBe(true);
    for (const ko of ['À_COMPLÉTER', 'fan2harmonie', 'a/b/c', '/fan2harmonie', 'owner/', 'own er/repo']) {
      expect(validerDepot(ko), ko).toBe(false);
    }
  });

  it('adresse https', () => {
    expect(validerUrlHttps('https://auth.exemple.workers.dev')).toBe(true);
    for (const ko of ['À_COMPLÉTER', 'http://auth.exemple.org', 'auth.exemple.org', '']) {
      expect(validerUrlHttps(ko), ko).toBe(false);
    }
  });
});

describe('contientPlaceholder et listerPlaceholders', () => {
  it('reconnaît la valeur de substitution, même écrite sans accents ou décomposée', () => {
    expect(contientPlaceholder('À_COMPLÉTER')).toBe(true);
    expect(contientPlaceholder('A_COMPLETER')).toBe(true);
    expect(contientPlaceholder('À_COMPLÉTER'.normalize('NFD'))).toBe(true);
    expect(contientPlaceholder('https://a-completer.invalid/page')).toBe(true);
    expect(contientPlaceholder('Valeurs à compléter à la mise en ligne')).toBe(false);
    expect(contientPlaceholder('https://www.exemple.fr')).toBe(false);
  });

  it('liste chaque fichier et chaque ligne concernés, numéros de ligne à partir de 1', () => {
    const trouves = listerPlaceholders([
      { chemin: 'src/config/site.ts', contenu: "a\n  email: 'À_COMPLÉTER',\n  url: 'https://a-completer.invalid',\n" },
      { chemin: 'src/propre.ts', contenu: 'rien à signaler\n' },
      { chemin: 'public/admin/config.yml', contenu: 'backend:\n  repo: À_COMPLÉTER\n' },
    ]);
    expect(trouves).toEqual([
      { chemin: 'src/config/site.ts', ligne: 2, texte: "email: 'À_COMPLÉTER'," },
      { chemin: 'src/config/site.ts', ligne: 3, texte: "url: 'https://a-completer.invalid'," },
      { chemin: 'public/admin/config.yml', ligne: 2, texte: 'repo: À_COMPLÉTER' },
    ]);
  });
});

describe('garde-fou de mise en ligne : séparé de npm test', () => {
  it('npm test ne charge que tests/unit/ ; verifier:mise-en-ligne ne charge que tests/deploy/', async () => {
    const unitaire = (await import('../../vitest.config')).default as { test?: { include?: string[] } };
    const deploiement = (await import('../../vitest.deploy.config')).default as { test?: { include?: string[] } };
    expect(unitaire.test?.include).toEqual(['tests/unit/**/*.test.ts']);
    expect(deploiement.test?.include).toEqual(['tests/deploy/**/*.test.ts']);
    const paquet = (await import('../../package.json')).default as { scripts: Record<string, string> };
    expect(paquet.scripts['test']).toBe('vitest run');
    expect(paquet.scripts['verifier:mise-en-ligne']).toBe('vitest run --config vitest.deploy.config.ts');
  });
});

describe('verifierSite et verifierBackendCms', () => {
  const siteRempli = {
    url: 'https://fan2harmonie.fr',
    email: 'contact@fan2harmonie.fr',
    formEndpoint: '/api/contact.php',
    siret: '123 456 789 01237',
    ville: 'Rambouillet',
    editeur: 'Prénom Nom',
    hebergeur: { nom: 'Hébergeur SAS', adresse: '1 rue de l’Exemple, 75000 Paris', siteWeb: 'https://www.hebergeur.example.fr' },
  };

  it('aucun problème quand tout est correctement rempli', () => {
    expect(verifierSite(siteRempli)).toEqual([]);
    expect(verifierBackendCms({ repo: 'proprietaire/fan2harmonie', base_url: 'https://auth.exemple.workers.dev' })).toEqual(
      [],
    );
  });

  it('SIRET et ville facultatifs : null ou vides, aucun problème', () => {
    expect(verifierSite({ ...siteRempli, siret: null, ville: null })).toEqual([]);
    expect(verifierSite({ ...siteRempli, siret: '  ', ville: '' })).toEqual([]);
  });

  it('SIRET renseigné : 14 chiffres et clé de Luhn exigés', () => {
    for (const s of siretValides) expect(verifierSite({ ...siteRempli, siret: s }), s).toEqual([]);
    const problemes = verifierSite({ ...siteRempli, siret: '12345678901236' });
    expect(problemes).toHaveLength(1);
    expect(problemes[0]).toMatch(/^site\.siret .*n'est pas un SIRET valide/);
  });

  it.each(['123 456 789 00012', '12345678900012', '000 000 000 00000', '00000000000000'])(
    'SIRET d’exemple %s : refusé avec un message explicite (même si la clé de Luhn est juste)',
    (siret) => {
      const problemes = verifierSite({ ...siteRempli, siret });
      expect(problemes).toHaveLength(1);
      expect(problemes[0]).toMatch(/^site\.siret /);
      expect(problemes[0]).toContain("SIRET d'exemple : à remplacer par le vrai SIRET");
    },
  );

  it('ville renseignée mais provisoire : signalée', () => {
    expect(verifierSite({ ...siteRempli, ville: 'À_COMPLÉTER' })).toHaveLength(1);
  });

  it('un message en français par valeur à reprendre, avec le nom du champ', () => {
    const problemes = verifierSite({
      url: 'https://a-completer.invalid',
      email: 'À_COMPLÉTER',
      formEndpoint: 'https://formspree.io/f/xyzabcde',
      siret: '12345678901236',
      ville: 'À_COMPLÉTER',
      editeur: '  ',
      hebergeur: { nom: 'À_COMPLÉTER', adresse: '', siteWeb: 'http://hebergeur.fr' },
    });
    const champs = ['url', 'email', 'formEndpoint', 'siret', 'ville', 'editeur', 'hebergeur.nom', 'hebergeur.adresse', 'hebergeur.siteWeb'];
    expect(problemes).toHaveLength(champs.length);
    for (const champ of champs) {
      expect(problemes.some((p) => p.startsWith(`site.${champ} `)), champ).toBe(true);
    }
    expect(problemes.join('\n')).toMatch(/SIRET/);
  });

  it('config.yml : repo et base_url', () => {
    const problemes = verifierBackendCms({ repo: 'À_COMPLÉTER', base_url: 'À_COMPLÉTER' });
    expect(problemes).toHaveLength(2);
    expect(problemes[0]).toMatch(/^backend\.repo /);
    expect(problemes[1]).toMatch(/^backend\.base_url /);
    expect(verifierBackendCms({})).toHaveLength(2);
  });
});