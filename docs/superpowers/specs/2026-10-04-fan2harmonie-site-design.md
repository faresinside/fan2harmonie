# Site Fan 2 Harmonie — document de conception

Date : 2026-10-04

## Objectif
Site vitrine de Stéphanie (Qi Gong gratuit en plein air, parc de Rambouillet, samedis/dimanches 16h). Il doit être remis à une utilisatrice **non technique** qui gère seule ses rendez-vous, ses communications et ses textes, sans jamais toucher au code. Priorités : robustesse, rapidité sur mobile, ambiance douce de l'affiche.

## Contraintes et décisions validées
- Structure de Stéphanie conservée : La pratique / Le Qi Gong / Qui est Fan 2 Harmonie, plus Accueil et Contact. Ordre du fichier d'origine : 1 La pratique, 2 Le Qi Gong, 3 Qui est Fan 2 Harmonie.
- Utilisatrice autonome via un espace d'administration à formulaires (accepte de créer un compte gratuit).
- Textes de Stéphanie repris sans reformulation (fautes de frappe corrigées seulement). Une reformulation « bien-être » reste possible plus tard, sur sa demande.
- Mentions légales obligatoires (entreprise).

## Technologies
- **Astro** : site statique, aucune base de données, aucun serveur à maintenir.
- **Sveltia CMS** sous `/admin` (remplace Decap : même configuration, interface plus rapide et plus claire, pensé pour les éditeurs non techniques) : formulaires en français, champs obligatoires, validation des dates. Connexion GitHub via un petit relais d'authentification sur Cloudflare Workers.
- **Cloudflare Pages** : hébergement gratuit, HTTPS automatique.
- **Dépôt GitHub** au nom de Stéphanie : sauvegarde et historique complet (retour arrière possible).
- **Formulaire de contact** avec anti-spam, envoi par e-mail.
- WordPress écarté : plus lourd, mises à jour et sécurité à entretenir, sans bénéfice ici.

> **Mise à jour (hébergement français), octobre 2026.** Les deux lignes Cloudflare ci-dessus et le service de
> formulaire tiers sont remplacés, pour qu’aucune donnée de visiteur ne quitte la France :
> - **Hébergement** : hébergeur mutualisé 100 % français (PHP ≥ 8.1, Apache ou LiteSpeed, SSH), site copié par
>   GitHub Actions (rsync sur SSH) ; HTTPS par certificat Let’s Encrypt de l’hébergeur ; règles dans `.htaccess`.
> - **Formulaire de contact** : script PHP du même hébergement (`/api/contact.php`), envoi par la messagerie de
>   l’hébergeur, limiteur anti-abus ; ni Formspree ni autre service tiers.
> - **Connexion de Sveltia CMS à GitHub** : relais PHP servi par le site lui-même (`/oauth/auth.php`,
>   `/oauth/callback.php`), plus de Cloudflare Workers.
> - **Dépôt GitHub** : il appartient au technicien (ou à une organisation) ; Stéphanie y est collaboratrice
>   « Write » (jamais « Admin »), avec un compte GitHub dédié au site et la double authentification.
> - **Image de partage** (`og:image`) : le recadrage de la photo d’accueil ; l’affiche n’est pas utilisée pour
>   le partage.
> - GitHub ne garde que le contenu public et construit le site. Détails : `README.md`,
>   `docs/MISE-EN-LIGNE.md`, `docs/GUIDE-STEPHANIE.md`.

## Contenus gérés par l'administration
- Rendez-vous : date, heure, lieu, remarque (ex. « annulé si pluie »).
- Communications : titre, date, texte, image facultative.
- Textes des pages, photos.

## Comportements
- Les rendez-vous passés disparaissent automatiquement de l'accueil.
- Aucun rendez-vous à venir : afficher « Prochaines dates bientôt ».
- Lien cliquable vers la carte (GPS 48,64703°N 1,811268°E).

## Visuel
- Palette de l'affiche : vert forêt, doré, rose, crème.
- Logo principal : Logo_FondBlanc3 converti en PNG/SVG à fond transparent. LogoLong en motif décoratif (bandeau, pied de page).
- Accueil : fond de forêt lumineuse + texte réel (« 1 heure pour vous… »), prochains rendez-vous, bouton « Venez essayer ». L'affiche ImageAnimation est conservée telle quelle pour le partage.
- Responsive, mobile d'abord.

## Direction « premium » (validée : ambiance de la maquette, niveau de finition à relever)
Constat sur la maquette : trop « gabarit » (dégradés génériques, pastilles à emoji, cartes uniformes).
Décisions :
- **Pas de thème acheté** : les thèmes Astro wellness du marché (Calmlyss, Revaya payants ; Fit Page gratuit, orienté fitness) sont génériques et reconnaissables. Conception sur mesure, pour que le site ait l'identité de Stéphanie. Source d'inspiration seulement.
- **Identité** : les traits au crayon des logos et le lotus deviennent le fil graphique (tracés SVG, séparateurs, animation douce de dessin à l'arrivée). Pas d'emoji, pas de dégradés violacés, pas d'icônes génériques : icônes dessinées sur mesure, au même trait que le logo.
- **Typographie** : une police d'écriture manuscrite réservée aux titres d'accent, une serif ou sans-serif élégante et lisible pour le texte (échelle fluide, interlignage 1,6-1,7, 60-70 caractères par ligne).
- **Couleurs** : vert forêt profond, doré, rose poudré, crème chaud ; contraste texte/fond d'au moins 4,5:1 (WCAG AA).
- **Photographie** : le fond d'accueil utilise de vraies photos (forêt, parc de Rambouillet, séance). **Pré-requis : Stéphanie fournit ou autorise 5 à 8 photos réelles** ; à défaut, la photo de l'affiche est recadrée provisoirement.
- **Mouvement** : animations discrètes et lentes (apparition au défilement, respiration du logo), désactivées si l'utilisateur demande « réduire les animations ».
- **Mise en page** : espaces généreux, grille cohérente sur 8 px, hiérarchie claire, un seul appel à l'action principal par écran.
- **Ton rédactionnel** : phrases de Stéphanie conservées, pas de formules génériques ; vocabulaire bien-être.

## Pratiques d'ingénierie
- Spécification d'abord, puis plan, puis réalisation par petites étapes vérifiées (spec-driven).
- Test de chaque étape avant la suivante ; contenu validé par un schéma (dates, champs obligatoires).
- Accessibilité : HTML sémantique, navigation clavier, textes alternatifs, focus visible.
- Performance : images optimisées (AVIF/WebP, tailles adaptées), polices hébergées localement, aucun script inutile ; objectifs Lighthouse ≥ 95 partout.
- SEO local : titres, descriptions, données structurées (activité, lieu), plan du site, `robots.txt`.
- Confidentialité : pas de traceurs ; carte en simple lien (pas de widget tiers) ; formulaire avec anti-spam et mention RGPD.
- Sécurité : HTTPS, en-têtes de sécurité, aucun secret dans le dépôt.

## Qualité et tests
Affichage mobile/tablette/ordinateur, vitesse (Lighthouse), accessibilité, liens, fonctionnement de l'admin (ajout, modification, suppression d'un rendez-vous).

## Informations à fournir
- Nom de domaine souhaité.
- Informations légales (SIRET, ville).
- Adresse e-mail de réception du formulaire.
- Corrections de texte validées par Stéphanie.

## Étapes
1. Validation de ce document.
2. Maquette visuelle de l'accueil (jetable) à valider.
3. Construction du site.
4. Espace d'administration et tests.
5. Mise en ligne, domaine, mentions légales.
6. Guide d'une page et démonstration à l'utilisatrice.
