/**
 * Plugin remark : tout HTML brut écrit dans un contenu Markdown (actualités, pages) est affiché comme
 * du texte, jamais interprété. « <script>…</script> » apparaît donc tel quel à l'écran et ne s'exécute pas.
 * Le nœud mdast « html » devient un nœud « text », que remark-rehype échappe ensuite (&lt; …).
 * Le HTML de bloc est placé dans un paragraphe ; le HTML en ligne reste à sa place dans la phrase.
 */
interface Noeud {
  type: string;
  value?: string;
  children?: Noeud[];
}

/** Conteneurs dont les enfants sont des blocs (un texte nu n'y est pas valide). */
const CONTENEURS_DE_BLOCS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);

function convertir(parent: Noeud): void {
  if (!parent.children) return;
  parent.children = parent.children.map((noeud) => {
    if (noeud.type !== 'html') {
      convertir(noeud);
      return noeud;
    }
    const texte: Noeud = { type: 'text', value: noeud.value ?? '' };
    return CONTENEURS_DE_BLOCS.has(parent.type) ? { type: 'paragraph', children: [texte] } : texte;
  });
}

export function remarkHtmlEnTexte() {
  return (arbre: Noeud): void => convertir(arbre);
}
