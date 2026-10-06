/**
 * Plugin remark des contenus Markdown écrits dans /admin (actualités, textes des pages) : NEUTRALISE, sans
 * jamais faire échouer la construction (une erreur bloquerait toutes les mises en ligne) :
 * - les images distantes (http:, https:, « //hôte », tout schéma) : remplacées par leur texte de
 *   remplacement, en texte simple. Le site ne charge rien ailleurs que chez lui (aucune donnée de visiteur ne
 *   part vers un autre service ; voir aussi la CSP « img-src 'self' » de public/.htaccess) ;
 * - les liens dont l'adresse n'est ni https:, http:, mailto:, tel:, ni « #… », ni un chemin relatif ou
 *   commençant par « / » (javascript:, data:, vbscript:, « //hôte »…, même écrits en majuscules, avec des
 *   espaces, tabulations ou caractères de contrôle au milieu, ou en entités HTML) : remplacés par leur texte.
 * Les formes « par référence » ([texte][ref], ![alt][ref]) suivent la même règle que leur définition.
 */
interface Noeud {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  value?: string;
  children?: Noeud[];
}

const SCHEMAS_PERMIS = new Set(['http', 'https', 'mailto', 'tel']);

/** Adresse sans espaces ni caractères de contrôle (les navigateurs les ignorent dans le schéma). */
function nettoyer(url: string): string {
  return Array.from(url)
    .filter((c) => {
      const n = c.codePointAt(0) ?? 0;
      return n > 0x20 && !(n >= 0x7f && n <= 0xa0) && n !== 0x2028 && n !== 0x2029;
    })
    .join('');
}

/** Adresse vers un autre hôte sans schéma (« //hôte », « \\hôte », « /\hôte »). */
const SANS_SCHEMA_DISTANTE = /^[\\/]{2}/;

/** Vrai si le lien peut rester un lien (voir l'en-tête du fichier). */
export function adresseLienSure(url: string): boolean {
  const propre = nettoyer(url);
  if (propre === '' || SANS_SCHEMA_DISTANTE.test(propre)) return false;
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(propre);
  return schema === null || SCHEMAS_PERMIS.has((schema[1] ?? '').toLowerCase());
}

/** Vrai si l'image est un fichier du site (chemin relatif ou « /… »), jamais une adresse distante. */
export function imageLocale(url: string): boolean {
  const propre = nettoyer(url);
  return propre !== '' && !SANS_SCHEMA_DISTANTE.test(propre) && !/^[a-z][a-z0-9+.-]*:/i.test(propre);
}

function definitions(noeud: Noeud, table: Map<string, string>): Map<string, string> {
  if (noeud.type === 'definition' && noeud.identifier !== undefined) table.set(noeud.identifier, noeud.url ?? '');
  for (const enfant of noeud.children ?? []) definitions(enfant, table);
  return table;
}

function neutraliser(parent: Noeud, table: Map<string, string>): void {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((noeud): Noeud[] => {
    const urlRef = noeud.identifier !== undefined ? table.get(noeud.identifier) : undefined;
    if (noeud.type === 'image' || noeud.type === 'imageReference') {
      const url = noeud.type === 'image' ? noeud.url ?? '' : urlRef ?? '';
      return imageLocale(url) ? [noeud] : [{ type: 'text', value: noeud.alt ?? '' }];
    }
    if (noeud.type === 'link' || noeud.type === 'linkReference') {
      neutraliser(noeud, table);
      const url = noeud.type === 'link' ? noeud.url ?? '' : urlRef ?? '';
      return adresseLienSure(url) ? [noeud] : noeud.children ?? [];
    }
    neutraliser(noeud, table);
    return [noeud];
  });
}

export function remarkLiensSurs() {
  return (arbre: unknown): void => neutraliser(arbre as Noeud, definitions(arbre as Noeud, new Map()));
}
