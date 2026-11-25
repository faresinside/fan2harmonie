import type { ImageMetadata } from 'astro';
import { getEntry } from 'astro:content';
import photoParDefaut from '../assets/photos/hero.jpg';

/** Photos du dossier src/assets/photos (celles déposées depuis l'administration y arrivent), par nom de fichier. */
const PHOTOS = import.meta.glob<{ default: ImageMetadata }>('../assets/photos/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}', {
  eager: true,
});

/** Nom de fichier d'un chemin écrit par l'administration (« ../../assets/photos/x.jpg » → « x.jpg »). */
export const nomDeFichier = (chemin: string) => chemin.split(/[\\/]/).pop() ?? '';

/**
 * Photo de l'accueil (réglages « Page d'accueil », champ facultatif « Photo d'accueil »), qui sert aussi d'image de partage.
 * Champ vide, ou fichier introuvable dans src/assets/photos : la photo d'origine. Jamais de construction cassée.
 */
export async function photoAccueil(): Promise<ImageMetadata> {
  const chemin = (await getEntry('reglagesAccueil', 'accueil'))?.data.photo?.trim();
  if (!chemin) return photoParDefaut;
  const nom = nomDeFichier(chemin);
  const trouvee = Object.entries(PHOTOS).find(([cle]) => nomDeFichier(cle) === nom);
  return trouvee ? trouvee[1].default : photoParDefaut;
}
