import { getEntry } from 'astro:content';

/** Petits textes du site (réglages « Petits textes du site », src/content/reglages/textes.md). */
export async function petitsTextes() {
  const entree = await getEntry('reglagesTextes', 'textes');
  if (!entree) throw new Error('Texte manquant : src/content/reglages/textes.md');
  return entree.data;
}
