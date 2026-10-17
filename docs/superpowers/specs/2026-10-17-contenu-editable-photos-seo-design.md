# Contenu éditable (accueil, lieu), photos d'actualités multiples, référencement : conception

Date : 2026-10-17. Branche de travail : `preprod`. Mise en production (`main`) seulement après recette sur `preprod` et accord explicite.

## Objectif

Le site est en ligne. Trois besoins :

1. Que Stéphanie modifie elle-même, depuis `/admin`, le texte de la page d'accueil (accroche, titre, devise, ligne lieu / jours / heure, bouton, bienfaits) et le lieu de la pratique (nom, coordonnées GPS, indications d'accès), aujourd'hui écrits en dur dans le code.
2. Qu'une actualité puisse porter plusieurs photos (Stéphanie veut illustrer ses évènements). Aujourd'hui : une seule (`image`).
3. Que le site et l'activité soient trouvables sur Google (« Qi Gong Rambouillet »). Constat : le site est techniquement correct (canonique, sitemap, robots.txt, HTTPS, données structurées) mais Google ne le connaît pas : `site:fan2harmonie.fr` ne renvoie rien. Le site n'est pas inscrit dans la Search Console.

Critères de réussite : Stéphanie change l'accueil, le lieu et les photos sans développeur ; rien ne change visuellement tant qu'elle n'a rien modifié ; tous les tests passent ; le site est inscrit à Google avec une procédure qu'elle peut suivre seule.

## Point de départ constaté (2026-10-18)

- **`main` est la source de vérité du contenu.** Stéphanie utilise déjà l'admin : 15 commits de contenu (rendez-vous du 25 octobre, textes « pratique », « qigong », « parcours », actualité « bienvenue ») ont été créés directement sur `main`. `preprod` a été remise à niveau en rebasant sur `origin/main`. Règle : avant chaque recette et avant la fusion finale, resynchroniser `preprod` avec `origin/main` (jamais écraser ces contenus) ; la fusion finale vérifie qu'aucun fichier de `src/content/` de `main` n'est perdu.
- **Incohérence déjà en ligne** : le texte « La pratique » de Stéphanie annonce « samedi à 16h00 ou dimanche à **10h00** », alors que le bandeau d'accueil et la description Google disent « samedis ou dimanches à 16h00 ». Les réglages éditables (accueil, référencement) la corrigent à la source ; les valeurs initiales seront celles que Stéphanie confirme (à lui demander avant la mise en production), pas une copie aveugle des textes en dur.
- **Son texte est repris à l'identique** : l'itinéraire (parking, fanion, coordonnées) déplacé dans `lieu.md` reprend ses mots actuels de `pratique.md` sans les modifier. Ses autres modifications de contenu ne sont pas touchées.
- **Tests sous Windows** : 4 cas de `tests/unit/scripts-deploiement.test.ts` échouent sur ce poste (arguments avec guillemet ou retour à la ligne transmis par `spawnSync` à bash sous Windows ; lancés à la main, les scripts refusent correctement ces valeurs). La CI Linux de `main` est verte. Hors périmètre : ces 4 échecs sont connus, pas des régressions ; tout autre échec bloque la recette.

## Hors périmètre

Refonte graphique, nouvelles pages, multilingue, analytics, base de données ou serveur (le site reste statique, construit par GitHub, mis en ligne par FTPS).

## Conception

### 1. Réglages éditables : stockage

Nouvelle collection de contenu Astro `reglages`, trois fichiers Markdown à en-tête (front matter), comme les `pages`, dans `src/content/reglages/` : `accueil.md`, `lieu.md`, `referencement.md`. Même chargeur (glob) et mêmes plugins remark que les `pages` (le HTML brut reste neutralisé) ; le lieu a un corps Markdown (indications d'accès). Elle suit la règle des `pages` : toujours lue dans `src/content/` même avec un jeu de test (`src/lib/fixture.ts`, type `Collection`). Schémas Zod dans `src/lib/schemas.ts` (source unique, vérifiée contre `public/admin/config.yml` par `tests/unit/cms-config.test.ts`). Dans l'admin : une collection « Réglages du site » (type `files`, comme « Textes des pages »), trois entrées.

Les valeurs initiales reprennent exactement les textes actuels : la construction avant et après est identique tant que rien n'est modifié.

### 2. Accueil

`accueil.md` : `accroche` (« 1 heure pour vous… »), `titre` (« Qi Gong »), `sousTitre` (« Animation découverte »), `devise`, `infos` (liste d'éléments affichés séparés par « · »), `bouton` (texte du bouton, ancre `#rdv` inchangée), `bienfaits` (liste de 4 : `libelle`, `icone` parmi les 4 icônes existantes). `Hero.astro` les lit ; les animations, l'ordre du DOM et l'accessibilité (h1, séparateurs `aria-hidden`) restent identiques.

### 3. Lieu

`lieu.md` : `nom` (« Parc de Rambouillet, près de la bergerie »), `latitude`, `longitude`, corps Markdown `acces` (parking, fanion…). Utilisé par :

- `LienCarte.astro` (coordonnées affichées, lien Google Maps) ;
- la section « La pratique » : l'itinéraire (paragraphe « Dans le parc de Rambouillet… fanion « Fan 2 Harmonie » ») sort de `pratique.md` pour venir de `lieu.md`, mot pour mot, sans dupliquer les coordonnées ;
- le lieu des rendez-vous : le champ `lieu` du schéma des rendez-vous n'a plus de défaut figé ; vide, il prend `lieu.nom` à la construction (et le champ de l'admin n'a plus de valeur par défaut). Les rendez-vous existants portent explicitement `lieu: Parc de Rambouillet, près de la bergerie` (valeur par défaut écrite par l'admin) : migration prévue, qui supprime la ligne `lieu:` quand elle est égale à l'ancien nom par défaut, faite à l'implémentation puis refaite avant la fusion finale pour les fichiers créés entre-temps par la propriétaire ;
- `jsonld.ts` : « lieu habituel » = `lieu.nom` reçu en paramètre ; coordonnées depuis `lieu.md`. Plus de `LIEU_PAR_DEFAUT` ni de `site.gps` en dur.

Validation : latitude entre -90 et 90, longitude entre -180 et 180.

### 4. Photos d'actualités multiples

Schéma d'actualité : `photos` (liste, 0 à 12) d'objets `{ image, legende? }` remplace `image`. Vérifier à l'implémentation qu'aucune actualité de `main` n'utilise `image` ; sinon prévoir la migration du fichier. Champ de l'admin : liste de widgets image, `omit_empty_optional_fields` conservé, mêmes dossiers médias et mêmes conversions WebP / 2000 px. La légende sert de texte alternatif (à défaut, le titre de l'actualité).

Affichage (`ActualiteCard.astro`) :

- 0 photo : inchangé ; 1 photo : mise en page actuelle ;
- 2 photos ou plus : galerie en grille sous le texte ; clic sur une photo = agrandissement dans un `<dialog>` natif (fermeture au clavier, focus rendu, `prefers-reduced-motion` respecté), script en ligne court, aucune bibliothèque externe, compatible avec la CSP partielle du site ;
- images en `loading="lazy"` et tailles adaptées (`widths`, `sizes`) pour le poids de la page.

Nombre d'actualités affichées sur l'accueil : de 3 à 6 (`dernieresActualites`).

### 5. Plan de test et recette sur preprod

- Unitaires : nouveaux schémas, cohérence `config.yml` ↔ schémas, `dernieresActualites`, `jsonld` avec le lieu paramétré, garde-fou « valeurs provisoires » inchangé.
- Jeux de contenu de test : actualité à 1 photo, à 5 photos, sans photo ; légendes longues ; contenus hostiles (le HTML brut reste neutralisé).
- E2E (Playwright) : accueil lu depuis les réglages ; lieu et lien Maps ; galerie (ouverture, fermeture à Échap, focus) ; édition via l'admin dans `tests/e2e/admin.spec.ts`.
- Qualité : axe (accessibilité), Lighthouse (page avec 6 actualités illustrées), CSP sans violation.
- Recette : build et déploiement de `preprod`, vérification visuelle par le propriétaire, puis fusion dans `main` sur accord explicite.
- Documentation : mise à jour de `docs/GUIDE-STEPHANIE.md`, du PDF et du README pour les nouveaux écrans ; les tests de `tests/docs/` doivent passer.

### 6. Référencement (dernier chantier)

Dans le code :

- Titre et description de la page, modifiables dans `referencement.md` (valeurs actuelles par défaut) ; champ facultatif `verificationGoogle` rendu en `<meta name="google-site-verification">` : Stéphanie colle elle-même le code donné par la Search Console, sans développeur.
- Titres et textes mieux alignés sur les requêtes réelles (« Qi Gong Rambouillet », « gratuit », « en plein air »), sans bourrage de mots-clés.
- Courte FAQ visible (où, quand, tarif, tenue), éditable (stockée dans `accueil.md`) et ne mentionnant jamais d'horaire d'ouverture, pour ne pas contredire les horaires éditables, avec données structurées `FAQPage` ; données structurées des évènements enrichies avec le lieu éditable (une actualité n'est pas une séance : pas de photos dans le JSON-LD).
- Sitemap : date de dernière modification.
- Vérifier que la page est servie sans blocage d'indexation et que `noindex` ne concerne que la 404.

Hors code (procédure écrite pour Stéphanie, `docs/PROCEDURE-GOOGLE.md`, à lui envoyer, rédigée comme le guide existant) :

1. Inscription à la Google Search Console avec son compte Google (propriété de type « préfixe d'URL » `https://fan2harmonie.fr/`), vérification par la balise HTML (code collé dans l'admin, rubrique Référencement) ou, à défaut, par l'enregistrement DNS chez OVH.
2. Envoi du plan du site `https://fan2harmonie.fr/sitemap-index.xml`, puis « Demander une indexation » de l'accueil.
3. Création de la fiche Google Business Profile (activité de plein air gratuite, lieu en zone de service ou lieu public, sans adresse postale privée).
4. Liens entrants locaux : office de tourisme et mairie de Rambouillet, annuaires d'associations ou de bien-être, Facebook, affichage du fanion avec l'adresse du site.
5. Suivi : comment lire « Couverture » et « Performances » dans la Search Console ; délai normal d'apparition de quelques jours à quelques semaines.

## Risques et points de vigilance

- Une valeur invalide saisie dans l'admin (latitude hors limites, liste de photos trop longue) doit faire échouer la construction avec un message clair, jamais publier un site cassé : le déploiement s'arrête, le site en ligne reste tel quel.
- Aucune donnée de visiteur ne quitte la France : pas de carte intégrée, pas de bibliothèque externe, pas de script tiers.
- Le délai d'indexation Google ne dépend pas du code : la procédure hors code est la partie qui produit le résultat.

## Ordre de réalisation

1. Réglages (stockage, schémas, admin) → 2. Accueil → 3. Lieu → 4. Photos multiples → 5. Recette complète sur `preprod` → 6. Référencement dans le code → 7. Procédure Google pour Stéphanie → 8. Mise en production sur accord.
