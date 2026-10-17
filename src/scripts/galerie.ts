/**
 * Galeries de photos des actualités (src/components/GaleriePhotos.astro) : un clic sur une vignette ouvre la
 * photo agrandie dans le <dialog> de la galerie (showModal : focus piégé et Échap natifs). L'image agrandie
 * n'est chargée qu'à ce moment (adresse lue dans data-grand). Fermeture : Échap, clic sur le fond, bouton
 * « Fermer » ; le focus revient alors à la vignette (comportement natif de <dialog>, assuré ici aussi).
 * Sans JavaScript, les vignettes restent visibles, simplement non agrandissables.
 */
export function initialiserGaleries(racine: ParentNode): void {
  for (const galerie of Array.from(racine.querySelectorAll<HTMLElement>('[data-galerie]'))) {
    const dialogue = galerie.querySelector('dialog');
    const image = dialogue?.querySelector('img');
    if (!dialogue || !image) continue;
    let vignetteOuverte: HTMLButtonElement | null = null;

    for (const vignette of Array.from(galerie.querySelectorAll<HTMLButtonElement>('[data-galerie-vignette]'))) {
      vignette.addEventListener('click', () => {
        const miniature = vignette.querySelector('img');
        image.src = vignette.dataset['grand'] ?? '';
        image.alt = miniature?.alt ?? '';
        vignetteOuverte = vignette;
        dialogue.showModal();
      });
    }

    // Clic sur le fond : la cible est le <dialog> lui-même (son contenu le remplit entièrement).
    dialogue.addEventListener('click', (e) => {
      if (e.target === dialogue) dialogue.close();
    });
    dialogue.querySelector('[data-galerie-fermer]')?.addEventListener('click', () => dialogue.close());
    // Échap déclenche « cancel » puis « close » nativement ; toutes les fermetures passent par « close ».
    dialogue.addEventListener('close', () => {
      vignetteOuverte?.focus();
      vignetteOuverte = null;
    });
  }
}
