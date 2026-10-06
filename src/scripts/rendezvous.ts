/**
 * Amélioration progressive des « Prochains rendez-vous » (src/components/RdvList.astro) : le site est
 * statique et les rendez-vous passés ne sont retirés qu'à la construction (chaque nuit). Si cette
 * reconstruction est en retard ou suspendue, ce script masque (attribut hidden) le jour même, dans le
 * navigateur, les rendez-vous dont la date est passée à Paris, met en avant le prochain non annulé et affiche
 * « Prochaines dates bientôt » s'il n'en reste aucun. Sans JavaScript, la page reste celle de la construction.
 * Aucun déplacement dans le document (l'ordre de lecture reste chronologique), aucun HTML injecté.
 */
import { aujourdhuiParis, etatRendezvous } from '../lib/rdv-client';

/** Copie l'attribut de portée des styles d'Astro (data-astro-cid-…) sur un élément créé ici. */
function memePortee(modele: Element, element: Element): void {
  for (const { name } of Array.from(modele.attributes)) {
    if (name.startsWith('data-astro-cid-')) element.setAttribute(name, '');
  }
}

function retirerMiseEnAvant(li: HTMLElement): void {
  li.classList.remove('rdv--prochain');
  li.querySelector('.rdv__etiquette')?.remove();
  const mentions = li.querySelector('.rdv__mentions');
  if (mentions && mentions.children.length === 0) mentions.remove();
}

function mettreEnAvant(li: HTMLElement): void {
  li.classList.add('rdv--prochain');
  const infos = li.querySelector('.rdv__infos');
  if (!infos || li.querySelector('.rdv__etiquette')) return;
  let mentions = infos.querySelector('.rdv__mentions');
  if (!mentions) {
    mentions = document.createElement('p');
    mentions.className = 'rdv__mentions';
    memePortee(li, mentions);
    infos.prepend(mentions);
  }
  const etiquette = document.createElement('span');
  etiquette.className = 'rdv__etiquette';
  etiquette.textContent = 'Prochain rendez-vous';
  memePortee(li, etiquette);
  mentions.prepend(etiquette);
}

export function appliquerDates(racine: ParentNode, maintenant: Date = new Date()): void {
  const liste = racine.querySelector<HTMLElement>('.rdv-liste');
  const vide = racine.querySelector<HTMLElement>('.rdv-vide');
  if (!liste) return;
  const feuillets = Array.from(liste.querySelectorAll<HTMLElement>(':scope > li[data-date]'));
  const etat = etatRendezvous(
    feuillets.map((li) => ({ date: li.dataset['date'] ?? '', annule: li.classList.contains('rdv--annule') })),
    aujourdhuiParis(maintenant),
  );
  const ancien = feuillets.findIndex((li) => li.classList.contains('rdv--prochain'));
  const masques = etat.visibles.filter((v) => !v).length;
  if (masques === 0 && ancien === etat.prochain) return;

  feuillets.forEach((li, i) => {
    li.hidden = !etat.visibles[i];
  });
  if (ancien !== etat.prochain) {
    const avant = feuillets[ancien];
    const apres = feuillets[etat.prochain];
    if (avant) retirerMiseEnAvant(avant);
    if (apres) mettreEnAvant(apres);
  }
  // Mise en page sur une colonne dès que la liste a changé (jamais de réordonnancement).
  liste.classList.remove('rdv-liste--deux-colonnes');
  if (masques === feuillets.length) {
    liste.hidden = true;
    if (vide) vide.hidden = false;
  }
}
