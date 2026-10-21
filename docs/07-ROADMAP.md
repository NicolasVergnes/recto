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

## M13 — Révision au hasard, compteurs de l'accueil, plus de jumelles (demande de Nicolas, 2026-10-14)

Hors roadmap initiale. Les jalons Android, Play Store et synchronisation automatique sont en attente (`STATUS.md`). En révision, les cartes sont tirées au hasard dans le paquet, par défaut. L'accueil dit combien de notes et de cartes compte chaque paquet. L'option « Pas de cartes jumelles le même jour » disparaît : une carte posée dans les deux sens est une seule carte (M11), il n'y a plus de jumelles à séparer.

Critères d'acceptation :
- [x] File du jour : apprentissage, puis retards, puis cartes du jour (nouvelles insérées tous les *k*), chaque lot dans un ordre aléatoire stable dans la journée ; sous plafond, les retards gardés restent les plus fragiles (P6).
- [x] Nouvelles cartes tirées au hasard par défaut (`newOrder: 'random'`), « Ordre d'ajout » toujours au choix ; paquets existants migrés (Dexie version 4, sauvegarde `schemaVersion` 5).
- [x] Plus d'enterrement ni d'espacement des cartes d'une note ; réglage `burySiblings` retiré (écran, données, sauvegardes anciennes lisibles).
- [x] Accueil : « n notes · n cartes » sous chaque paquet, sous-paquets compris dans le parent.
- [x] Tests unitaires et E2E mis à jour ; `npm run verify` vert.

## M14 — Texte à trous et occlusion d'image deviennent des types de cartes (demande de Nicolas, 2026-10-14)

Hors roadmap initiale (ADR-011). « Texte à trous » et « Occlusion d'image » ne sont plus des types de notes mais des types de cartes : le type de note Basique (un modèle de carte) laisse choisir le type de sa carte ; dans un type personnalisé, chaque carte choisit le sien, et un même type peut produire une occlusion, deux cartes classiques et un texte à trous. Une carte à trous ou d'occlusion produit une carte par trou ou groupe, ou une seule (« Génère une seule carte »). L'export Anki n'est pas un but : un type mixte n'y part qu'avec ses cartes classiques.

Critères d'acceptation :
- [x] Éditeur de notes : Type (Basique, types personnalisés) ; pour Basique, « Type de carte » (Classique, Texte à trous, Occlusion d'image) ; « Génère une seule carte » pour une carte à trous ou d'occlusion, modifiable sur une note existante (la carte du premier trou ou groupe garde sa planification).
- [x] Éditeur de types : « Type de carte » de chaque carte ; à trous : champ du texte, ajout au verso ; occlusion : champ de l'image, en-tête, ajout au verso ; « Génère une seule carte » ; plusieurs cartes de chaque type, chacune sur son champ ; le champ source d'une carte ne se retire pas ; « Basique » listé comme type intégré.
- [x] Note d'un type mixte : éditeur de masques pour chaque champ image, « Créer un trou » et Ctrl+Maj+C dans les champs à trous, aperçu nommé par carte et par trou ou groupe, révision de chaque type de carte.
- [x] Données : aucune note ni carte réécrite ; Dexie version 5, sauvegarde `schemaVersion` 6 ; une base version 4 et une sauvegarde au schéma 5 s'ouvrent et se lisent telles quelles.
- [x] Export Anki : cartes classiques seulement pour un type personnalisé, cartes laissées comptées dans le rapport ; au réimport, un type mixte n'est pas réutilisé.
- [x] Tests unitaires et E2E mis à jour ; `npm run verify` vert.

## M16 — Cartes dans les deux sens dans les types de notes (demande de Nicolas, 2026-10-14)

Hors roadmap initiale (M13 à M15, Android et synchronisation, restent suspendus). Dans un type de note personnalisé, une carte peut être posée dans un seul sens (« Carte → Nom » : toujours la même question) ou dans les deux (« Nom ↔ Numéro » : **une seule carte**, posée dans un sens puis dans l'autre comme une note basique), et non deux cartes jumelles. Le plugin Claude `recto-deck-builder` produit ces cartes.

Critères d'acceptation :
- [x] Un modèle de carte a l'option « Poser dans les deux sens » (`twoWay`) : ses deux faces sont des questions possibles ; la carte suit le réglage « Interroger dans les deux sens » du paquet (FSRS et Memory Box), avec l'indicateur « ↔ Sens inversé » ; la réponse tapée compare la face non demandée.
- [x] La carte n'existe que si ses deux faces ont un contenu propre à la note ; cocher ou décocher l'option dans l'éditeur garde les cartes, leur planification et leur historique.
- [x] Sauvegarde `schemaVersion` 5 sur sa branche, 6 après la fusion avec M13 et M14 (une version plus ancienne la refuse au lieu de perdre l'option) ; une base et une sauvegarde de la version précédente se lisent (modèles à sens unique).
- [x] Export et import `.apkg` : l'option voyage (aller-retour Recto sans perte) ; Anki reçoit une carte à sens unique.
- [x] Plugin : `two_way()` dans la bibliothèque, vérificateur et skill à jour ; un paquet « Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » donne 3 cartes par note.
- [x] Tests unitaires et E2E ; `npm run verify` vert.

## M17 — Formats de cartes à introduire, par paquet (demande de Nicolas, 2026-10-14)

Hors roadmap initiale. Apprendre un paquet par étapes sans le découper en notes ou en paquets : commencer les départements par « Carte → Nom », puis passer à « Nom ↔ Numéro ». Le choix se fait par paquet, et dès l'import, puisque la plupart des paquets sont importés. Un format en pause retient ses nouvelles cartes ; ses cartes déjà commencées restent révisées (P7).

Critères d'acceptation :
- [x] Format de carte : un modèle d'un type personnalisé, ou le type de carte d'une note Basique ; réglages de paquet `pausedFormats` et `newByFormat` (Dexie version 6, sauvegarde `schemaVersion` 7, paquets et sauvegardes plus anciens lus avec les défauts).
- [x] File du jour : nouvelles cartes d'un format en pause écartées avant le plafond, cartes commencées toujours révisées ; « format par format » dans l'ordre des modèles, puis l'ordre du paquet ; l'accueil et les statistiques du jour suivent.
- [x] Paramètres du paquet : une case par format présent (nouvelles et commencées) et « Nouvelles cartes format par format ».
- [x] Import `.apkg` : formats à introduire tout de suite et « format par format », appliqués aux paquets créés ou remplis ; un réimport ne réactive rien.
- [x] Éditeur de types : un modèle déplacé garde sa pause, un modèle retiré ou changé de type la perd ; supprimer un type retire ses clés.
- [x] Navigateur : filtre « Format de carte ».
- [x] Tests unitaires et E2E ; `npm run verify` vert.

## M18 — Plus simple : curseur en direct, moins de jargon, gestes réparés, Recto sans export Anki (demande de Nicolas, 2026-10-15)

Hors roadmap initiale. Retours d'usage : l'utilisateur a besoin de quelque chose de simple, pas de codes techniques qu'il ne connaît pas ; il peut creuser dans les paramètres s'il le veut. Recto est un concurrent d'Anki, pas un complément : il en importe les paquets, il n'en écrit pas (ADR-012).

Critères d'acceptation :
- [x] Paramètres : le curseur « Taille du texte des cartes » s'applique pendant qu'on le déplace.
- [x] Plus de codes de principes (« P6 ») ni de compartiments (« → C2 ») dans l'interface : l'aide des révisions par jour, les sources scientifiques et les boutons de révision Memory Box (l'échéance seule, comme en FSRS).
- [x] Gestes en révision, réglage activé : toucher la carte affiche la réponse ; ensuite balayer à droite = Bien (Réussi), à gauche = Encore (Oublié) ; un geste trop court ou vertical ne note rien ; la carte suit le doigt ; un geste repris par le navigateur (défilement, bord d'écran) est abandonné proprement.
- [x] Export `.apkg` retiré (dialogue d'export CSV seul, plus de bouton dans Paramètres) ; l'import des paquets Anki reste entier ; les mentions d'Anki se limitent à l'import.
- [x] Tests unitaires et E2E (dont des gestes tactiles réels sur le profil mobile) ; `npm run verify` vert.

## M19 — Boîte de Leitner : trois modèles, un défaut pour les nouveaux paquets (demande de Nicolas, 2026-10-21)

Hors roadmap initiale. « Memory Box » est le nom d'un produit (le coffret Larousse) : le planificateur prend le nom générique de la méthode, « Boîte de Leitner », et la Memory Box reste citée dans les sources. L'utilisateur choisit sa boîte et le planificateur de ses nouveaux paquets (ADR-013).

Critères d'acceptation :
- [x] Plus aucun « Memory Box » dans l'interface, sauf la source scientifique (livret de Fabien Olicard et Céline Holynski, Larousse 2018).
- [x] Trois boîtes : 7 compartiments (1, 2, 7, 30, 90, 180, 365 j ; défaut), 5 compartiments (1, 3, 7, 14, 30 j), « Ma boîte » (une seule, 2 à 10 compartiments, jours choisis dans les Paramètres). Les deux premières sont fixes ; enregistrer Ma boîte change les paquets qui la suivent.
- [x] Paramètres › « Planificateur des nouveaux paquets » : FSRS (défaut), Leitner 7, Leitner 5 ou Ma boîte ; vaut pour les paquets créés à la main et par un import (CSV, paquet d'exemple, `.apkg` où il reste modifiable).
- [x] Chaque paquet peut changer de planificateur ou de boîte ensuite : d'une boîte à l'autre, une carte garde son compartiment (au plus le dernier) et son échéance.
- [x] Données : migration Dexie (paquets nommant leur boîte ; intervalles modifiés à la main conservés dans « Ma boîte »), sauvegardes plus anciennes lues de même, réglages partagés entre appareils.
- [x] Tests unitaires et E2E ; `npm run verify` vert.

## M20 — Paquet Recto `.rpkg` : partager, importer, exporter un paquet (demande de Nicolas, 2026-10-21)

Hors roadmap initiale. Pour une bibliothèque de paquets comme celle d'Anki, mais propre à Recto, il faut d'abord un format de paquet (ADR-014). Le partage passe par le fichier : la SPEC exclut le partage en ligne (§2).

Critères d'acceptation :
- [x] Format `.rpkg` documenté (05 §5) : manifeste (titre, description, auteur, licence), paquet et sous-paquets avec leurs réglages (sans planificateur), types de notes, notes, médias ; contenu seul, sans progression.
- [x] Export depuis la page Paquet (« Exporter », format par défaut), fichier partagé ou téléchargé.
- [x] Import (Importer › Paquet Recto) : résumé, planificateur choisi à l'import ; réimporter une version plus récente met les notes à jour sans doublon, n'en supprime aucune ; un paquet existant garde ses réglages.
- [x] Plugin `recto-deck-builder` 3.0.0 : écrit et vérifie des `.rpkg` (réglages de paquet compris), plus de `.apkg`.
- [x] Tests unitaires (lecture, plan, aller-retour entre deux bases, plugin) et E2E ; `npm run verify` vert.
