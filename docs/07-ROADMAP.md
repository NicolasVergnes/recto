# 07 — Feuille de route par jalons

Chaque jalon est autonome : il se termine par `npm run verify` vert, une entrée dans `CHANGELOG.md`, la mise à jour de `docs/STATUS.md` (ce qui est fait, ce qui reste, décisions prises) et un commit. Un jalon = une session Claude Code au maximum ; s'il ne tient pas, le découper et le dire dans `STATUS.md`. Ne pas commencer un jalon tant que le précédent n'est pas accepté.

Critères d'acceptation : chaque ligne « ✔ » doit être vérifiable par un test automatisé ou une manipulation décrite.

## M0 — Squelette et outillage

- ✔ `npm create vite` Svelte + TS, dépendances des ADR installées aux versions épinglées (08-DECISIONS), `npm run verify` passe sur un projet vide (un test unitaire trivial, un e2e « la page s'affiche »).
- ✔ Structure de dossiers de SPEC §7 créée avec des fichiers `index.ts` vides documentés.
- ✔ `app.css` avec tokens de 04-UI §4 (clair/sombre), `App.svelte` avec la navigation et des écrans vides nommés.
- ✔ PWA installable (manifest, icônes, service worker) : test Playwright sur le build (`manifest.webmanifest` servi avec `name`/`icons`, `navigator.serviceWorker.ready` résolu, page chargée hors ligne après une première visite) ; installation manuelle sur Android documentée dans STATUS.
- ✔ `fr.ts` initialisé avec les textes de 04-UI §3 et `t()` typé (clé inconnue = erreur de compilation).
- ✔ `.github/workflows/ci.yml` : `npm ci && npm run verify` sur push.

## M1 — Données et création de cartes

- ✔ Schéma Dexie V1 (02-DATA-MODEL), `repo.ts`, tests des invariants et d'une migration factice V1→V2 réalisée **uniquement dans le test** (sous-classe locale de `RectoDB` ajoutant `version(2)`), jamais dans `schema.ts`.
- ✔ Écran Paquet (créer, renommer, déplacer, fusionner, supprimer avec export automatique préalable), écran Éditeur (3 types, aperçu, avertissements P8, doublons, Ctrl+Entrée), navigateur de cartes (filtres, tri, sélection, actions groupées, virtualisation ≥ 5 000 lignes).
- ✔ Médias : image (fichier/coller/glisser, redimensionnement, `alt`), audio (fichier, enregistrement), stockage Dexie, rendu sécurisé (`dompurify` avec liste blanche : `b i u br p ul ol li img sub sup span`), URL objets révoquées.
- ✔ Persistance demandée après la première carte ; page Paramètres avec état du stockage.
- ✔ E2E 1.

## M2 — Planificateurs et révision

- ✔ `scheduler/fsrs.ts` et `scheduler/leitner.ts` conformes à 03-SCHEDULING, tests unitaires listés en 06 §4 verts, couverture ≥ 90 %.
- ✔ `queue/` conforme à 03 §5 avec ses tests.
- ✔ Écran Révision complet (04-UI §2.2) : masquage, réponse tapée, boutons avec prévisualisation, raccourcis, annuler, modifier, suspendre, retirer (P7), infos, résumé de fin, jour à 04:00.
- ✔ Accueil : compteurs du jour et « Réviser aujourd'hui » toutes cartes confondues.
- ✔ Paramètres de paquet : planificateur, plafonds, rétention (avec texte d'aide), mode Leitner, alternance ; changement de planificateur (03 §4) avec sauvegarde automatique (mode Leitner et sauvegarde retirés en M9).
- ✔ E2E 2.

## M3 — Import CSV et sauvegarde

- ✔ Import CSV/TSV complet (05 §1) avec fixtures ; paquet d'exemple depuis l'accueil.
- ✔ Export CSV ; sauvegarde `.recto.zip` complète et restauration (remplacer/fusionner) ; rappel 7 jours ; partage natif si disponible.
- ✔ Test de propriété aller-retour sauvegarde.
- ✔ E2E 3 et 5.

## M4 — Import `.apkg`

- ✔ Lecture `anki21`/`anki2` dans un worker (`sql.js`), refus `anki21b` avec message, médias, hiérarchie, modèles convertis, rapport (05 §2).
- ✔ Option « importer l'historique » avec `reschedule` (FSRS) ou replay (Leitner).
- ✔ Fixture `sample-legacy.apkg` importée en test ; import d'un vrai paquet AnkiWeb de ≥ 1 000 cartes testé manuellement (documenter lequel dans STATUS).
- ✔ E2E 4.

## M5 — Statistiques, finitions, V0

- ✔ Écran Statistiques (SPEC 5.6) : compteurs, prévision 30 j, rétention réelle 7/30/90 j vs cible, heatmap, répartition par état et par compartiment. Graphiques en SVG maison (pas de bibliothèque), lisibles clair/sombre.
- ✔ Accessibilité : audit clavier complet, contraste AA vérifié, `prefers-reduced-motion`, cibles 44 px ; Lighthouse Accessibilité ≥ 95.
- ✔ Performance : file du jour < 200 ms avec 20 000 cartes (test de charge en Vitest avec base générée), bundle initial < 300 Ko gzip.
- ✔ Hors ligne : E2E 6 ; test manuel Android documenté dans STATUS.
- ✔ Déploiement GitHub Pages ou Cloudflare Pages opérationnel, URL notée dans README.
- ✔ README utilisateur (installation sur Android, sauvegarde, import Anki) et `docs/STATUS.md` marqué « V0 livrée ».

## M6 — V1 (ouvert)

- Optimiseur FSRS dans le navigateur (`fsrs-browser`, worker, ≥ 1 000 révisions, prévisualisation avant acceptation).
- Occlusion d'image (type `image_occlusion` : masques rectangulaires sur une image, une carte par masque).
- Export `.apkg` legacy.
- KaTeX pour les formules.
- Synchronisation par fichier (export/import automatique vers un dossier via File System Access API) ou document CRDT.
- Empaquetage Android (Capacitor ou TWA) sans changer le code applicatif.

## M7 — Vue mosaïque du navigateur (demande de Nicolas, 2026-09-29)

Hors roadmap initiale. Dans « Cartes », afficher les cartes en liste (existant) ou en mosaïque de tuiles montrant le rendu réel : une face retournable au clic, ou recto et verso côte à côte. Style de retournement choisi dans Paramètres.

Critères d'acceptation :
- [x] Contrôle « Affichage » (Liste, Mosaïque, Mosaïque recto-verso) mémorisé (`browserView`).
- [x] Tuile : contenu rendu (HTML, formules, images, occlusion), case de sélection, « Retourner », « Modifier » ; verso hors du DOM avant le premier retournement.
- [x] Barre de la mosaïque : « Tout sélectionner », « Trier par », « Ordre ».
- [x] 5 styles de retournement dont « Sans animation » (`flipStyle`), ≤ 400 ms, instantané avec `prefers-reduced-motion`.
- [x] Mosaïque virtualisée : 5 000 cartes gardent un DOM borné ; 1 colonne sur mobile (recto-verso empilé).
- [x] `Cards.svelte` découpé (CardTable, BulkActions) sans changement de comportement ; tests E2E bureau et mobile.

Retours de Nicolas (2026-09-30) :
- [x] Rotation : la question ne transparaît jamais en miroir derrière la réponse.
- [x] Le contenu d'une tuile tient sans barre de défilement (réduit si besoin) ; « Taille » des tuiles (petites, moyennes, grandes) mémorisée (`tileSize`).
- [x] « Déplacer » : bouton « Nouveau paquet » dans la fenêtre.

## M8 — Types de notes multi-cartes (demande de Nicolas, 2026-10-02)

Hors roadmap initiale. Une note produit une carte par modèle de carte de son type, comme dans Anki ; l'import Anki conserve les types qui ne se ramènent pas à Basique / Basique + inverse ; un éditeur de types permet de créer et modifier champs et modèles.

Critères d'acceptation :
- [x] Type `custom` et table `noteTypes` (Dexie version 2, sauvegarde `schemaVersion` 3, sauvegardes 1 et 2 relues telles quelles).
- [x] Modèles en syntaxe Anki (`{{Champ}}`, `{{FrontSide}}`, sections, `text:`, `type:`) ; une carte par modèle dont la question n'est pas vide.
- [x] Import `.apkg` : `Les départements français` donne 1 type à 5 champs et 404 cartes ; réimport sans doublon ni nouveau type ; export `.apkg` du type tel quel.
- [x] Écran « Types de notes » : créer, modifier (champs, cartes, aperçu, confirmation des cartes créées et supprimées), supprimer un type inutilisé.
- [x] Éditeur de notes : types personnalisés, champs nommés, aperçu de toutes les cartes.
- [x] Tests unitaires (gabarits, réconciliation, migration, sauvegarde, import, export) et E2E bureau et mobile.

## M9 — Jumelles, Memory Box sans calendrier, conversion sans sauvegarde (demande de Nicolas, 2026-10-10)

Hors roadmap initiale. L'enterrement ne vise plus toutes les cartes sœurs d'une note mais seulement les jumelles (« numéro → nom » et « nom → numéro ») ; « carte → nom » et « numéro → nom » peuvent passer le même jour, par défaut. Le calendrier du coffret, utile seulement pour la boîte en papier, est retiré ; les intervalles des compartiments restent réglables. Le changement de planificateur ne télécharge plus de sauvegarde.

Critères d'acceptation :
- [x] `areTwins` (03 §5.2) : recto/verso, texte à trous, occlusion, types personnalisés (champs demandés et ajoutés) ; la file enterre les jumelles et espace les autres sœurs.
- [x] Le paquet « Les départements français » propose chaque jour une carte « numéro / nom / préfecture » et la carte « Quel est ce département ? ».
- [x] Memory Box : plus de choix de mode ; intervalles réglables ; sauvegardes et paquets plus anciens en mode calendrier lus en intervalles.
- [x] Changement de planificateur : confirmation, aucun téléchargement.
- [x] Tests unitaires (jumelles, file, chargement de la file, validation) et E2E mis à jour.

## M10 — Dette technique (session autonome, 2026-10-10)

Hors roadmap initiale. Nicolas demande de poursuivre sans lui les étapes qui ne demandent pas son intervention : la dette de `STATUS.md` (« Reste à faire »), sans la V2, qui attend sa confirmation.

Critères d'acceptation :
- [x] Réimport `.apkg` : une note plus récente dans Anki dont les cartes changent (trou, masque ou modèle ajouté ou retiré) est mise à jour avec ses cartes (nouvelles cartes converties comme à l'import, cartes en trop supprimées, journal conservé), sans changer de type ; une note qui changerait de type reste ignorée et comptée.
- [x] Fusion de sauvegarde : chaque note fusionnée a exactement les cartes de son contenu (invariant 2) ; deux cartes d'une même note pour le même `ord` n'en font plus qu'une.
- [x] Éditeur de types : monter et descendre un champ ou un modèle de carte, au clavier comme à la souris ; les notes et les cartes suivent (planification et journal conservés).
- [x] Formules `[$]…[/$]` et `[$$]…[/$$]` d'Anki rendues par KaTeX ; aide de syntaxe des formules dans l'éditeur.
- [x] Import CSV vers un type personnalisé (colonnes → champs du type, doublons et mise à jour parmi les notes du même type) ; une ligne d'un type intégré ne met jamais à jour une note d'un type personnalisé.
- [ ] Aucun composant de plus de 200 lignes ; comportement inchangé (E2E existants verts). — partiel : 6 composants restent au-delà (STATUS « Reste à faire »).
- [x] Favicon sans requête réseau ; export d'un type personnalisé vérifié avec le moteur d'Anki ; suite E2E lancée dans Firefox et WebKit, écarts corrigés ou consignés. — favicon : défaut non reproductible avec Playwright, `index.html` non modifié (STATUS « Écarts »).
- [x] `npm run verify` vert.

## M11 — Une carte, deux sens ; champs protégés ; plus d'emoji (demande de Nicolas, 2026-10-11)

Hors roadmap initiale. Une carte doit pouvoir être vue dans les deux sens sans en créer une seconde, jumelle : le type « Basique + inversé » disparaît, le sens se règle par paquet (avec une exception par note) et vaut pour FSRS comme pour Memory Box. Dans l'éditeur de types, un champ utilisé par une carte ne se supprime plus en silence. L'emoji des paquets, doublon du nom, est retiré. Aucune migration des données (phase de test).

Critères d'acceptation :
- [x] Plus de type `basic_reverse` (éditeur, CSV, import et export Anki) ; une note basique a une seule carte ; le type inversé d'Anki et la colonne CSV « basique + inverse » donnent une note basique.
- [x] « Interroger dans les deux sens » (défaut activé) dans les réglages de tout paquet, FSRS compris : une réussite retourne la carte, un échec la repose dans le même sens ; « Ne jamais retourner cette note » dans l'éditeur.
- [x] Réponse tapée : la face non demandée est comparée ; rien à taper quand c'est une image.
- [x] Éditeur de types : retirer un champ qu'une carte utilise est refusé avec les cartes concernées ; un modèle citant un champ inexistant empêche l'enregistrement ; le contenu perdu des champs retirés est annoncé avant l'enregistrement.
- [x] Emoji retiré (création, détails, affichage) ; les sauvegardes qui en ont restent lisibles.
- [x] Tests unitaires et E2E mis à jour ; `npm run verify` vert.

## M12 — Données prêtes pour plusieurs appareils et pour des testeurs (V2, 2026-10-12)

Hors roadmap initiale, premier jalon de la V2 (synchronisation et application Android, Capacitor, décidé par Nicolas). Avant que des testeurs aient leurs données dans Recto : plus de changement du modèle sans migration, et une fusion de sauvegarde qui suit les suppressions des deux appareils (aujourd'hui, elle ramène tout ce qui a été supprimé).

Critères d'acceptation :
- [x] Règle écrite (CLAUDE.md, `quality-gate`) : tout changement du modèle stocké a sa migration (Dexie et sauvegardes) et son test ; première application : Dexie version 3, sauvegarde `schemaVersion` 4.
- [x] Chaque suppression laisse sa trace dans la même transaction (paquets, notes, cartes, révisions, types de notes, médias) ; chaque modification d'une carte la date (`updatedAt`).
- [x] Fusion : une ligne supprimée d'un côté ne revient pas, sauf modifiée après sa suppression ; un paquet ou un type encore utilisé reste ; les deux appareils convergent quel que soit l'ordre des fusions (test de propriété).
- [x] Identifiant d'appareil dans les sauvegardes ; réglages partagés (début de journée, limite globale) fusionnés, réglages de l'appareil jamais importés.
- [x] Une base version 2 et une sauvegarde au schéma 3 s'ouvrent et se lisent ; `npm run verify` vert.

## M16 — Cartes dans les deux sens dans les types de notes (demande de Nicolas, 2026-10-14)

Hors roadmap initiale (M13 à M15, Android et synchronisation, restent suspendus). Dans un type de note personnalisé, une carte peut être posée dans un seul sens (« Carte → Nom » : toujours la même question) ou dans les deux (« Nom ↔ Numéro » : **une seule carte**, posée dans un sens puis dans l'autre comme une note basique), et non deux cartes jumelles. Le plugin Claude `recto-deck-builder` produit ces cartes.

Critères d'acceptation :
- [x] Un modèle de carte a l'option « Poser dans les deux sens » (`twoWay`) : ses deux faces sont des questions possibles ; la carte suit le réglage « Interroger dans les deux sens » du paquet (FSRS et Memory Box), avec l'indicateur « ↔ Sens inversé » ; la réponse tapée compare la face non demandée.
- [x] La carte n'existe que si ses deux faces ont un contenu propre à la note ; cocher ou décocher l'option dans l'éditeur garde les cartes, leur planification et leur historique.
- [x] Sauvegarde `schemaVersion` 5 (une version plus ancienne la refuse au lieu de perdre l'option) ; une base et une sauvegarde de la version précédente se lisent (modèles à sens unique).
- [x] Export et import `.apkg` : l'option voyage (aller-retour Recto sans perte) ; Anki reçoit une carte à sens unique.
- [x] Plugin : `two_way()` dans la bibliothèque, vérificateur et skill à jour ; un paquet « Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » donne 3 cartes par note.
- [x] Tests unitaires et E2E ; `npm run verify` vert.
