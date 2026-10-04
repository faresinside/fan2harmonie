/**
 * Amélioration progressive du formulaire de contact (src/components/ContactForm.astro).
 * Sans ce script, le formulaire part en POST classique et le service affiche sa propre page de remerciement.
 * Avec lui : envoi en arrière-plan, bouton « Envoi en cours… », puis message de réussite (formulaire vidé)
 * ou message d'erreur avec l'adresse e-mail de secours (la saisie est conservée).
 * La validation reste celle du navigateur : l'événement « submit » n'arrive qu'avec un formulaire valide.
 */
import { envoyerFormulaire } from '../lib/contact';

function brancher(formulaire: HTMLFormElement) {
  const bouton = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');
  const libelle = bouton?.querySelector<HTMLElement>('[data-libelle]');
  const zoneSucces = formulaire.querySelector<HTMLElement>('[data-succes]');
  const zoneErreur = formulaire.querySelector<HTMLElement>('[data-erreur]');
  const modeleSucces = formulaire.querySelector<HTMLElement>('[data-modele-succes]');
  const modeleErreur = formulaire.querySelector<HTMLElement>('[data-modele-erreur]');
  /** Copie du contenu d'un modèle masqué (texte et liens), prête à être affichée. */
  const copie = (modele: HTMLElement) => [...modele.childNodes].map((n) => n.cloneNode(true));
  // Élément manquant : on laisse l'envoi classique fonctionner plutôt que de risquer un formulaire muet.
  if (!bouton || !libelle || !zoneSucces || !zoneErreur || !modeleSucces || !modeleErreur) return;

  const texteBouton = libelle.textContent ?? '';

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    if (bouton.disabled) return;

    zoneSucces.replaceChildren();
    zoneErreur.replaceChildren();
    bouton.disabled = true;
    libelle.textContent = 'Envoi en cours…';
    formulaire.setAttribute('aria-busy', 'true');

    const issue = await envoyerFormulaire(formulaire.action, new FormData(formulaire));

    formulaire.removeAttribute('aria-busy');
    libelle.textContent = texteBouton;
    bouton.disabled = false;

    if (issue === 'succes') {
      formulaire.reset();
      zoneSucces.replaceChildren(...copie(modeleSucces));
    } else {
      zoneErreur.replaceChildren(...copie(modeleErreur));
    }
    // Le bouton désactivé a perdu le focus : on le lui rend pour ne pas renvoyer l'utilisateur en haut de page.
    bouton.focus();
  });
}

for (const formulaire of document.querySelectorAll<HTMLFormElement>('form[data-contact]')) brancher(formulaire);
