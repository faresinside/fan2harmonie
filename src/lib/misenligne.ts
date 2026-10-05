/**
 * Contrôles de mise en ligne : aucune valeur de substitution ne doit subsister, et les vraies valeurs
 * (adresse du site, e-mail, formulaire, SIRET, dépôt GitHub, relais d'authentification) doivent être plausibles.
 * Utilisé par le garde-fou `npm run verifier:mise-en-ligne` (tests/deploy/) ; fonctions pures, testées dans tests/unit/.
 */

/**
 * Hôte provisoire de `site.url` en développement. Écrit en morceaux (comme le motif ci-dessous) pour que
 * ce fichier lui-même ne soit pas signalé par le garde-fou, qui parcourt tout src/.
 */
export const HOTE_PROVISOIRE = ['a-completer', 'invalid'].join('.');

/**
 * Vrai si le texte contient la valeur de substitution « À », « _ », « COMPLÉTER » (même sans accents ou en
 * Unicode décomposé) ou l'hôte provisoire.
 */
export function contientPlaceholder(texte: string): boolean {
  const sansAccents = texte.normalize('NFD').replace(/\p{M}/gu, '');
  return /a[_]completer/i.test(sansAccents) || sansAccents.toLowerCase().includes(HOTE_PROVISOIRE);
}

export interface Occurrence {
  chemin: string;
  /** Numéro de ligne, à partir de 1. */
  ligne: number;
  texte: string;
}

/** Chaque ligne de chaque fichier qui contient encore une valeur de substitution. */
export function listerPlaceholders(fichiers: ReadonlyArray<{ chemin: string; contenu: string }>): Occurrence[] {
  return fichiers.flatMap(({ chemin, contenu }) =>
    contenu.split(/\r?\n/).flatMap((texte, i) => (contientPlaceholder(texte) ? [{ chemin, ligne: i + 1, texte: texte.trim() }] : [])),
  );
}

/** SIRET : 14 chiffres (espaces ignorés) dont la clé de Luhn est juste. */
export function validerSiret(siret: string): boolean {
  const chiffres = siret.replace(/ /g, '');
  if (!/^\d{14}$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    // De droite à gauche, un chiffre sur deux est doublé (en retirant 9 s'il dépasse 9).
    let c = Number(chiffres[13 - i]);
    if (i % 2 === 1) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somme += c;
  }
  return somme % 10 === 0;
}

/** Adresse d'envoi d'un formulaire Formspree : https://formspree.io/f/<identifiant>. */
export function validerFormspree(url: string): boolean {
  return /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(url);
}

/** Adresse e-mail plausible (contrôle simple : un @, un domaine avec un point, aucun espace). */
export function validerEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** Domaines réservés aux tests ou au réseau local, jamais publics. */
const SUFFIXES_RESERVES = ['invalid', 'test', 'example', 'localhost', 'local'];

/** Adresse publique définitive du site : https, vrai nom de domaine (ni .invalid, ni localhost, ni adresse IP). */
export function validerUrlSite(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const hote = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || !hote.includes('.')) return false;
  if (/^\d+(\.\d+){3}$/.test(hote) || hote.startsWith('[')) return false;
  const suffixe = hote.split('.').at(-1) ?? '';
  return !SUFFIXES_RESERVES.includes(suffixe) && !contientPlaceholder(url);
}

/** Dépôt GitHub au format « propriétaire/dépôt ». */
export function validerDepot(repo: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(repo);
}

/** Adresse absolue en https. */
export function validerUrlHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface SiteAVerifier {
  url: string;
  email: string;
  formEndpoint: string;
  siret: string;
  ville: string;
  editeur: string;
}

const decrire = (v: unknown) => `« ${String(v)} »`;

/** Problèmes de src/config/site.ts, un message en français par champ (vide si tout est prêt). */
export function verifierSite(s: SiteAVerifier): string[] {
  const problemes: string[] = [];
  if (!validerUrlSite(s.url)) {
    problemes.push(`site.url : ${decrire(s.url)} n'est pas l'adresse définitive du site (attendu : https://votre-domaine.fr ; ni .invalid, ni localhost).`);
  }
  if (!validerEmail(s.email) || contientPlaceholder(s.email)) {
    problemes.push(`site.email : ${decrire(s.email)} n'est pas une adresse e-mail (attendu : l'adresse qui reçoit les messages).`);
  }
  if (!validerFormspree(s.formEndpoint)) {
    problemes.push(`site.formEndpoint : ${decrire(s.formEndpoint)} n'est pas une adresse de formulaire Formspree (attendu : https://formspree.io/f/xxxxxxxx).`);
  }
  if (!validerSiret(s.siret)) {
    problemes.push(`site.siret : ${decrire(s.siret)} n'est pas un SIRET valide (14 chiffres, clé de contrôle juste).`);
  }
  for (const [champ, valeur, attendu] of [
    ['ville', s.ville, 'la ville de domiciliation de l’entreprise'],
    ['editeur', s.editeur, 'prénom et nom de la responsable de la publication'],
  ] as const) {
    if (valeur.trim() === '' || contientPlaceholder(valeur)) {
      problemes.push(`site.${champ} : ${decrire(valeur)} est vide ou provisoire (attendu : ${attendu}).`);
    }
  }
  return problemes;
}

/** Problèmes de la section `backend` de public/admin/config.yml (vide si tout est prêt). */
export function verifierBackendCms(backend: Record<string, unknown>): string[] {
  const problemes: string[] = [];
  const repo = backend['repo'];
  const baseUrl = backend['base_url'];
  if (typeof repo !== 'string' || !validerDepot(repo) || contientPlaceholder(repo)) {
    problemes.push(`backend.repo : ${decrire(repo)} n'est pas un dépôt GitHub (attendu : proprietaire/depot).`);
  }
  if (typeof baseUrl !== 'string' || !validerUrlHttps(baseUrl) || contientPlaceholder(baseUrl)) {
    problemes.push(`backend.base_url : ${decrire(baseUrl)} n'est pas l'adresse https du relais d'authentification (sveltia-cms-auth).`);
  }
  return problemes;
}
