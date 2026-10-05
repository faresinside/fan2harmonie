/**
 * Amélioration progressive du formulaire de contact (src/components/ContactForm.astro).
 * Sans ce script, le formulaire part en POST classique et le script de contact (public/api/contact.php) répond\n * par une courte page HTML.
 * Avec lui : envoi en arrière-plan, bouton « Envoi en cours… », puis message de réussite (formulaire vidé)
 * ou message d'erreur avec l'adresse e-mail de secours (la saisie est conservée ; les champs refusés par le\n * script, réponse 422, sont marqués invalides comme après une saisie incorrecte).
 * La validation reste celle du navigateur : l'événement « submit » n'arrive qu'avec un formulaire valide.
 */
import { envoyerFormulaireDetaille } from '../lib/contact';

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

  /*
   * État invalide exposé aux lecteurs d'écran (aria-invalid) : posé quand le navigateur refuse un champ
   * (envoi bloqué) ou quand on quitte un champ mal rempli ; retiré dès que la saisie devient valide.
   * L'indication écrite est reliée au champ par aria-describedby dans le HTML.
   */
  const marquer = (champ: EventTarget | null, invalide: boolean) => {
    if (!(champ instanceof HTMLInputElement || champ instanceof HTMLTextAreaElement)) return;
    if (!champ.hasAttribute('aria-describedby')) return;
    if (invalide) champ.setAttribute('aria-invalid', 'true');
    else champ.removeAttribute('aria-invalid');
  };
  formulaire.addEventListener('invalid', (e) => marquer(e.target, true), true);

  /*
   * Clic sur « Envoyer » depuis un champ mal rempli : le champ perd le focus pendant le clic. Afficher son
   * indication à ce moment décalerait le bouton sous le pointeur et le clic serait perdu. Pendant un appui
   * sur le bouton, on laisse donc la validation de l'envoi marquer les champs (événements « invalid »).
   */
  let appuiSurBouton = false;
  bouton.addEventListener('pointerdown', () => (appuiSurBouton = true));
  const finAppui = () => (appuiSurBouton = false);
  document.addEventListener('pointerup', () => setTimeout(finAppui), true);
  document.addEventListener('pointercancel', finAppui, true);

  formulaire.addEventListener('focusout', (e) => {
    const champ = e.target;
    if (appuiSurBouton) return;
    if (champ instanceof HTMLInputElement || champ instanceof HTMLTextAreaElement) {
      // Un champ vide jamais touché n'est pas signalé en quittant (comme :user-invalid).
      if (!champ.validity.valid && (champ.value !== '' || champ.hasAttribute('aria-invalid'))) marquer(champ, true);
    }
  });
  const reverifier = (e: Event) => {
    const champ = e.target;
    if ((champ instanceof HTMLInputElement || champ instanceof HTMLTextAreaElement) && champ.validity.valid) {
      marquer(champ, false);
    }
  };
  formulaire.addEventListener('input', reverifier);
  formulaire.addEventListener('change', reverifier);

  // Désormais l'état invalide affiché suit aria-invalid (piloté ici), et non plus :user-invalid (voir le CSS).
  formulaire.setAttribute('data-validation', '');

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    if (bouton.disabled) return;

    zoneSucces.replaceChildren();
    zoneErreur.replaceChildren();
    bouton.disabled = true;
    libelle.textContent = 'Envoi en cours…';
    formulaire.setAttribute('aria-busy', 'true');

    const { issue, champs } = await envoyerFormulaireDetaille(formulaire.action, new FormData(formulaire));

    formulaire.removeAttribute('aria-busy');
    libelle.textContent = texteBouton;
    bouton.disabled = false;

    // Le bouton désactivé a perdu le focus : il va au message (tabindex="-1"), lu aussitôt au clavier ou au
    // lecteur d'écran. En cas d'échec, la saisie reste intacte.
    if (issue === 'succes') {
      formulaire.reset();
      for (const champ of formulaire.querySelectorAll('[aria-invalid]')) champ.removeAttribute('aria-invalid');
      zoneSucces.replaceChildren(...copie(modeleSucces));
      zoneSucces.focus();
    } else {
      // Noms déjà filtrés (champs connus du formulaire) : l'indication écrite du champ apparaît (voir le CSS).
      for (const nom of champs) {
        const champ = formulaire.elements.namedItem(nom);
        if (champ instanceof Element) marquer(champ, true);
      }
      zoneErreur.replaceChildren(...copie(modeleErreur));
      zoneErreur.focus();
    }
  });
}

for (const formulaire of document.querySelectorAll<HTMLFormElement>('form[data-contact]')) brancher(formulaire);
