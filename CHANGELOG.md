# Changelog

Toutes les évolutions notables de Recto. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### Navigateur de cartes sur petit téléphone

#### Fixed

- Sur un petit téléphone, la mosaïque et la liste des cartes ne passent plus sous la barre de navigation : la page défile quand les filtres prennent la place, et les boutons de la dernière tuile restent accessibles.

### M18 — Plus simple

#### Changed

- Le curseur « Taille du texte des cartes » s'applique pendant qu'on le déplace.
- Plus de codes techniques dans l'interface : « P6 » dans l'aide des révisions par jour, « P1… » dans les sources scientifiques, « → C2 » sous les boutons Memory Box (l'échéance seule, comme en FSRS).
- Gestes en révision : toucher la carte affiche la réponse ; la carte suit le doigt ; balayer à droite = Bien, à gauche = Encore.
- Les mentions d'Anki se limitent à l'import de ses paquets.

#### Fixed

- Balayage en révision sur téléphone : le geste n'est plus perdu quand le navigateur l'interrompt ou quand il commence sur la question.

#### Removed

- Export vers Anki (`.apkg`), depuis un paquet, une sélection ou Paramètres (ADR-012). L'import des paquets Anki reste ; pour tout garder, la sauvegarde `.recto.zip`.

### Suppression d'un paquet : sauvegarde proposée

#### Changed

- Supprimer un paquet ne télécharge plus d'office une sauvegarde `.recto.zip` : la fenêtre de confirmation propose « Télécharger une sauvegarde avant de supprimer » (décoché par défaut).

### M17 — Formats de cartes à introduire, par paquet

#### Added

- **Apprendre un paquet par étapes** : dans les paramètres d'un paquet, « Formats de cartes à introduire » liste ses formats (par exemple « Département · Carte → Nom », « Département · Nom ↔ Numéro ») avec leurs cartes nouvelles et commencées. Un format décoché ne fait plus entrer de nouvelles cartes ; ses cartes déjà commencées restent révisées.
- « Nouvelles cartes format par format » : toutes les nouvelles cartes d'un format avant celles du suivant, dans l'ordre des cartes du type de note.
- Import Anki : « Formats de cartes à introduire tout de suite » et « format par format », appliqués aux paquets que l'import crée ou remplit.
- Navigateur de cartes : filtre « Format de carte ».

#### Changed

- Sauvegarde au format 7 (les sauvegardes plus anciennes restent lisibles) ; base de données en version 6, migrée à l'ouverture.
- Le filtre du navigateur et ses champs sont dans leur propre composant (écran « Cartes » sous 200 lignes).

### Outils — plugin Claude « recto-deck-builder » 2.2.0 : charte de rédaction

#### Added

- `reference/format-cartes.md` : la **charte de rédaction des cartes**, treize règles (R1-R13) tirées du dossier de recherche (Wozniak 1999, Olicard & Holynski 2018, Rowland 2014, Carpenter & Olson 2012, Kornell & Bjork 2008, Kornell 2009, Pan & Rickard 2018, Pyc & Rawson 2009, Dunlosky 2013) : une information par carte, rappel et non reconnaissance, une seule bonne réponse jamais montrée, pas de listes, trous courts, image-indice muette, deux sens seulement si la relation est symétrique, indices récupérateurs, mnémotechnie dans Extra, priorisation, faits datés. Formats recommandés par sujet (vocabulaire, dates, drapeaux et départements, constellations, LSF, plantes, maths, cours), tableau avant/après, grille de relecture, sources.
- `recto_apkg.py` : `add_sequence()` (liste ordonnée en trous chevauchants : une note par élément qui ne montre que ses voisins et son rang), `pendu()` (indice « 1 _ _ _ ») ; la vérification relit chaque carte à l'aune de la charte et regroupe les manquements sous « Charte de rédaction » (`report.charte`) : réponse oui/non, QCM, « cite… », question ouverte, liste de plus de 4 éléments, réponse visible dans la question ou dans l'`alt`, réponse de plus de 25 mots, face « … ? » dans une carte à deux sens, verso ou face partagés par plusieurs notes (sens inverse ambigu), même question pour plusieurs notes, trou de plus de 6 mots, trou sans contexte. Non bloquant : le skill corrige ou justifie.
- `examples/charte.py` : un paquet qui applique la charte sujet par sujet, sans avertissement ; `deck-builder-plugin.test.ts` vérifie qu'il s'importe (séquence, indice, carte suspendue, région à sens unique) et que des cartes fautives sont signalées.

#### Changed

- `SKILL.md` : la démarche rédige selon la charte (étape 4) et relit la section « Charte » du rapport (étape 7) ; tableau des types avec `add_sequence` ; message de livraison avec les choix de format et les avertissements gardés. Aucun changement dans l'application.

### M14 — Texte à trous et occlusion d'image deviennent des types de cartes

#### Added

- **Types de cartes dans les types personnalisés** : chaque carte d'un type choisit son type — Classique, Texte à trous (le texte d'un champ, une carte par trou) ou Occlusion d'image (l'image d'un champ, une carte par groupe de masques). Un même type peut mélanger une occlusion, des cartes classiques et un texte à trous, plusieurs de chaque. Dans l'éditeur de notes, chaque champ image a son éditeur de masques et « Créer un trou » (Ctrl+Maj+C) agit dans les champs à trous.
- Case **« Génère une seule carte »** pour une carte à trous ou d'occlusion : tous les trous ou tous les masques sont demandés ensemble, sur une seule carte. Elle se coche ou se décoche sur une note existante ; la carte du premier trou garde sa planification.
- Types de notes : « Basique » apparaît en tête de liste, comme type intégré.

#### Changed

- **« Texte à trous » et « Occlusion d'image » ne sont plus des types de notes** : l'éditeur propose le type Basique (ou un type personnalisé), puis, pour Basique, le « Type de carte » (Classique, Texte à trous, Occlusion d'image). Les notes existantes ne changent pas.
- Export Anki : un type personnalisé part avec ses seules cartes classiques (Anki ne mélange pas les cartes à trous avec les autres dans un même type) ; le rapport d'export compte les cartes restées dans Recto.
- Sauvegarde au format 6 (les sauvegardes plus anciennes restent lisibles telles quelles) ; base de données en version 5.

### M16 — Cartes dans les deux sens dans les types de notes

#### Added

- Dans l'éditeur d'un type de note, chaque carte classique a la case **« Poser dans les deux sens »** : une seule carte (« Nom ↔ Numéro ») demandée par une face puis par l'autre après chaque réussite, comme une note basique (réglage « Interroger dans les deux sens » du paquet, FSRS et Memory Box, indicateur « ↔ Sens inversé », réponse tapée sur la face non demandée). Les autres cartes restent posées dans un seul sens (« Carte → Nom »). Les champs deviennent « Face 1 » et « Face 2 » ; cocher ou décocher garde les cartes, leur planification et leur historique.
- Export et import `.apkg` : l'option voyage (marque `rectoTwoWay` sur le modèle) ; Anki reçoit une carte à sens unique.

#### Changed

- Sauvegardes au schéma 6 (avec M14) : une version plus ancienne de Recto les refuse au lieu de poser ces cartes dans un seul sens. Les bases et sauvegardes existantes se lisent sans changement (cartes à sens unique).
- Plugin `recto-deck-builder` 2.1.0 : `one_way()` et `two_way()` ; « A ↔ B » donne une seule carte (et non deux) ; le skill applique les flèches à la lettre et ne dit plus qu'un `{{type:Champ}}` active seul la réponse tapée.

### Outils — plugin Claude « recto-deck-builder »

#### Added

- `tools/deck-builder/` : plugin Claude autonome qui crée des paquets **clé en main** au format `.apkg` (importés par « Paquet Anki ») : types de notes personnalisés à plusieurs champs et plusieurs cartes, notes basiques, questions à sens unique, texte à trous, occlusion d'image avec réponses, images, sons, formules, sous-paquets, tags. Bibliothèque Python `recto_apkg.py` (bibliothèque standard seulement) qui écrit les paquets sous la forme de l'export de Recto et les vérifie selon les règles de son importeur (`python recto_apkg.py check x.apkg`, utilisable aussi sur un paquet Anki) ; skill, références (API, médias) et exemple complet. `npm run plugin:zip` produit `recto-deck-builder.zip` à téléverser dans l'application Claude. Aucun changement dans l'application.
- Test `deck-builder-plugin.test.ts` (Python 3 requis) : les paquets du plugin passent par l'importeur `.apkg` de Recto (types, cartes, masques, médias, réimportation d'un paquet régénéré sans doublon, refus de ce qui serait mal importé).

### M13 — Révision au hasard, compteurs de l'accueil

#### Added

- Accueil : sous le nom de chaque paquet, son nombre de **notes** et de **cartes** (un paquet parent compte ses sous-paquets).

#### Changed

- **Révision au hasard** : les cartes en apprentissage, les retards et les cartes du jour sont chacun présentés dans un ordre aléatoire (le même toute la journée), jamais dans l'ordre d'ajout. Quand la limite de révisions coupe les retards, Recto garde toujours les cartes les plus fragiles.
- Les nouvelles cartes sont tirées **au hasard** par défaut, y compris dans les paquets existants ; « Ordre d'ajout » reste disponible dans les réglages du paquet.
- Sauvegarde au format 5 (les sauvegardes plus anciennes restent lisibles et sont mises au même réglage) ; base de données en version 4, migrée à l'ouverture.

#### Removed

- Réglage « Pas de cartes jumelles le même jour » : toutes les cartes d'une note peuvent passer le même jour, sans être espacées ; le hasard les répartit.

### M12 — Données prêtes pour plusieurs appareils

#### Added

- **Les suppressions sont enregistrées** (paquets, notes, cartes, révisions, types de notes, médias) et la fusion d'une sauvegarde les suit : une note supprimée sur un appareil ne revient plus en fusionnant la sauvegarde de l'autre, et l'autre la supprime à son tour. Ce qui a été modifié après sa suppression reste ; un paquet ou un type encore utilisé par une note reste.
- Chaque appareil a un identifiant, écrit dans ses sauvegardes ; le rapport de restauration dit ce qui a été supprimé comme sur l'autre appareil et les médias ignorés faute d'un contenu identique.

#### Changed

- Sauvegarde au format 4 (les sauvegardes plus anciennes restent lisibles) ; base de données en version 3, migrée à l'ouverture (chaque carte reçoit une date de modification).
- Fusion : la copie d'une carte la plus récemment **modifiée** gagne (suspension, drapeau, retrait, réinitialisation comprises), plus seulement la plus récemment révisée ; le journal des révisions est réuni en entier.
- Réglages : début de journée et limite globale de révisions passent d'un appareil à l'autre (le plus récent gagne) ; thème, taille du texte, dernier paquet utilisé et les autres réglages de l'appareil ne sont plus jamais écrasés par une sauvegarde, même en restauration « remplacer ».
- La sauvegarde est lue en une seule transaction : un instantané cohérent même si l'application écrit pendant l'export.

### M11 — Une carte, deux sens

#### Added

- **Interroger dans les deux sens** : réglage de chaque paquet, **FSRS compris** (il n'existait que pour Memory Box), activé par défaut. Une réussite retourne la carte, un échec la repose dans le même sens ; l'indicateur « ↔ Sens inversé » le signale.
- Éditeur de notes : « Ne jamais retourner cette note » pour une note basique dont la seconde face ne permet pas de répondre.
- Éditeur de types : retirer un champ qu'une carte utilise est refusé, avec le nom des cartes concernées ; un modèle qui cite un champ inexistant empêche l'enregistrement, avec la carte et le champ ; retirer un champ rempli annonce, avant l'enregistrement, combien de notes perdent son contenu.

#### Removed

- Le type **« Basique + inverse »** : une note basique a une seule carte, posée dans les deux sens. Le type inversé d'Anki et la colonne CSV « basique + inverse » donnent une note basique ; l'export Anki n'écrit plus le type « Recto · Basique et inversée ». Pas de migration : les notes et sauvegardes de ce type ne sont plus lues.
- L'**emoji** des paquets (doublon du nom) ; une sauvegarde qui en a reste lisible.

#### Fixed

- Éditeur de types : supprimer un champ cité par un modèle s'enregistrait sans avertissement et la carte n'affichait plus ce champ ; renommer un champ en un nom déjà pris, puis à nouveau, pouvait réécrire les références d'un autre champ.

### M10 — Dette technique

#### Added

- **Import CSV vers un type de note personnalisé** : les colonnes se mappent sur les champs du type (reconnus par l'en-tête), une carte par modèle dont la question n'est pas vide ; doublons cherchés parmi les notes du même type, « Mettre à jour » remplace les champs des colonnes choisies et les cartes suivent.
- Éditeur de types de notes : **« Monter » et « Descendre »** pour les champs et les modèles de cartes, au clavier comme à la souris ; les notes et les cartes suivent, planification et historique conservés.
- Formules d'Anki **`[$]…[/$]`** (en ligne) et **`[$$]…[/$$]`** (bloc) rendues comme `\( … \)` et `\[ … \]` ; aide « Écrire une formule » dans l'éditeur.
- Compatibilité : la suite E2E passe dans Firefox (`npm run e2e:firefox`) ; vérification de l'export Anki des types personnalisés avec le moteur d'Anki (`tests/interop/`).

#### Changed

- **Réimport Anki** : une note modifiée dans Anki dont les cartes changent (trou, masque ou modèle ajouté ou retiré) est mise à jour au lieu d'être ignorée ; une carte est créée pour ce qui s'ajoute, supprimée (historique conservé) pour ce qui disparaît.
- **Fusion de sauvegarde** : les cartes de chaque note fusionnée suivent le contenu retenu (plus de carte en trop ni de carte manquante, plus de doublon pour un même trou).
- Paramètres, Accueil, Statistiques, page Paquet, navigation et import CSV découpés en composants plus petits (aucun changement visible).

#### Fixed

- Firefox : après l'ajout de la première note, l'éditeur restait bloqué (formulaire non vidé) tant qu'on ne répondait pas à la demande de stockage persistant.
- Import CSV : « Mettre à jour » pouvait remplacer les champs d'une note d'un type personnalisé par Recto, Verso et Extra.
- Export Anki : réimporter dans Anki un paquet venu d'Anki remplaçait le style de son type de notes (CSS, champ de tri, préambule LaTeX).
- Annuler une réponse après avoir déplacé le modèle de la carte dans l'éditeur de types rendait à la carte son ancien numéro de modèle.

### M9 — Jumelles, Memory Box sans calendrier, conversion sans sauvegarde

#### Changed

- **Enterrement des jumelles** (03 §5.2) : seules les cartes jumelles d'une note (« numéro → nom » et « nom → numéro », les deux sens d'une note recto/verso, les trous d'un même texte, les zones d'une même occlusion) ne passent plus le même jour ; les autres cartes d'une note (« carte → nom » et « numéro → nom ») peuvent être révisées le même jour, espacées d'au moins 10 cartes. Activé par défaut, réglage de paquet renommé « Pas de cartes jumelles le même jour ».
- **Changement de planificateur** : plus de téléchargement de sauvegarde avant la conversion (la confirmation reste).

#### Removed

- Mode **« Calendrier du coffret »** de la Memory Box : il ne sert qu'à la boîte en papier. Les intervalles des compartiments restent réglables ; un paquet en mode calendrier (ou une sauvegarde plus ancienne) passe aux intervalles, ses échéances déjà calculées sont conservées.

### M8 — Types de notes multi-cartes

#### Added

- **Types de notes personnalisés** (ADR-010) : champs nommés et une carte par modèle de carte, comme dans Anki ; modèles en syntaxe Anki (`{{Champ}}`, `{{FrontSide}}`, `{{#Champ}}…{{/Champ}}`, `{{^Champ}}…{{/Champ}}`, `text:`, `type:`) ; une carte par modèle dont la question n'est pas vide.
- Écran **« Types de notes »** (Paramètres, éditeur de notes) : créer, renommer, modifier les champs (les modèles suivent un renommage) et les cartes (recto, verso), aperçu avec une vraie note, confirmation des cartes créées et supprimées (journal conservé) ; supprimer un type inutilisé.
- Éditeur de notes : types personnalisés dans le choix du type, un champ par champ nommé, aperçu de toutes les cartes.
- Fixture `data/samples/multi-template.apkg` (5 champs, 4 modèles, 11 cartes).

#### Changed

- Import Anki : un type de note qui ne se ramène pas à Basique ou Basique + inverse est conservé tel quel (champs, modèles, une carte par carte Anki) au lieu d'être converti en Basique avec ses champs fusionnés dans Extra ; le paquet « Les départements français » donne 404 cartes au lieu de 101. Une réimportation réutilise le type.
- Export Anki : les types personnalisés sont exportés tels quels (le type importé d'Anki est mis à jour dans Anki, pas copié). L'export CSV les laisse de côté et le dit, comme l'occlusion d'image.
- Sauvegarde : `schemaVersion` 3 (table `noteTypes`) ; les sauvegardes 1 et 2 se restaurent telles quelles. Base IndexedDB : version 2 (nouvelle table, sans migration des données).
- `<hr>` (séparateur des modèles Anki) est accepté dans le HTML des cartes.

### M7 — Vue mosaïque du navigateur

#### Added

- **Vue mosaïque** du navigateur de cartes (01 §5.2, 04 §2) : contrôle « Affichage » (Liste, Mosaïque, Mosaïque recto-verso) mémorisé ; tuiles au rendu réel des cartes (HTML, formules, images, occlusion) avec case de sélection, « Retourner » et « Modifier » ; barre « Tout sélectionner », « Trier par », « Ordre » ; mosaïque virtualisée (5 000 cartes, 1 colonne sur mobile).
- **Style de retournement** dans Paramètres › Affichage (01 §5.7) : sans animation, rotation horizontale (défaut), rotation verticale, fondu, glissement ; ≤ 400 ms, instantané avec `prefers-reduced-motion`.

#### Changed

- `Cards.svelte` découpé en `CardTable` et `BulkActions` (aucun changement de comportement) ; `VirtualList` accepte un rôle ARIA (`rowgroup` ou `list`).
- Réglages : nouvelles clés `browserView` et `flipStyle` (02 §2), sauvegardées et restaurées comme les autres.
- Mosaïque : le contenu d'une tuile est centré et ne défile jamais (les images rétrécissent d'abord, puis le contenu est réduit autant qu'il faut) ; « Taille » des tuiles (petites, moyennes, grandes), mémorisée (`tileSize`) ; les petites tuiles tiennent à deux de front sur un téléphone.
- Aperçu de l'éditeur : question et réponse de chaque carte dans deux faces de même taille, comme dans la mosaïque.
- « Déplacer » (actions groupées) : bouton « Nouveau paquet » pour créer la destination sans passer par l'accueil.

#### Fixed

- Mosaïque, rotation horizontale ou verticale : la question ne transparaît plus en miroir derrière la réponse (la face détournée est masquée à mi-rotation).

### Outillage

- `.gitattributes` force les fins de ligne LF : `npm run verify` passe aussi sous Windows avec `core.autocrlf=true`.

### M6 — V1 : occlusion d'image, export Anki, optimiseur FSRS, formules

#### Added

- **Occlusion d'image** (type de note `image_occlusion`, 02 §2.1) : masques rectangulaires sur une image, une carte par masque ou par groupe de masques, réponse facultative par masque, modes « tout cacher, deviner une zone » et « ne cacher que la zone à deviner ». Éditeur de masques au pointeur (tracer, déplacer) et entièrement au clavier (ajouter, flèches pour déplacer, Maj + flèches pour redimensionner, Suppr, n° de carte) ; aperçu des deux faces ; en révision, la zone demandée s'ouvre au dévoilement et les réponses n'existent pas dans la page avant (P1).
- Import des notes « Image Occlusion » d'Anki ≥ 23.10 (ellipses et polygones convertis en rectangles ; formes texte, tournées ou en pixels ignorées ; rapport) et export vers ce même type natif, réponses des masques conservées dans « Comments » et relues au réimport ; fixture `data/samples/image-occlusion.apkg` exportée par le moteur d'Anki.
- **Export Anki `.apkg`** (format legacy `collection.anki21`, 05 §4) d'un paquet et de ses sous-paquets, de la sélection du navigateur de cartes ou de toute la collection (Paramètres › Sauvegarde) : notes, cartes et planification (état mémoire FSRS compris), historique, paquets `Parent::Enfant`, médias ; construit dans un Web Worker ; rapport (médias introuvables, cartes retirées exportées comme suspendues) ; annulable. Vérifié avec le moteur d'Anki 26.9.3 (`tests/interop/`).
- **Optimiseur FSRS** dans le navigateur (03 §2.4) : bloc « Paramètres de mémoire » des paramètres FSRS d'un paquet, à partir de 1 000 révisions utilisables ; `fsrs-browser` 6.6 (WASM mono-thread) dans un worker à usage unique, disponible hors ligne ; comparaison avant acceptation (erreur du modèle, pénalité des erreurs, réussite prédite et réelle, intervalles d'exemple, 21 valeurs) ; « Appliquer » seulement si les nouveaux paramètres prédisent mieux l'historique ; retour aux valeurs par défaut. Les échéances existantes ne sont pas recalculées.
- **Formules LaTeX** rendues par KaTeX (ADR-009) : `\( … \)` en ligne, `\[ … \]` en bloc, en révision et dans l'aperçu ; module chargé à la demande et précaché avec ses polices ; MathML pour les lecteurs d'écran ; une formule trop large défile seule ; une formule invalide reste en source avec « Formule LaTeX invalide ».
- Tests : domaine de l'occlusion (masques, Anki aller-retour, édition), import de la fixture Anki, aller-retour export/import `.apkg` (occlusion comprise), optimiseur (jeu d'entraînement, évaluation, WASM réel sous Node), formules (repérage, rendu jsdom), E2E occlusion, formules, export `.apkg`, optimiseur ; vérifications manuelles avec le moteur d'Anki (`tests/interop/`).

#### Changed

- Sauvegarde : `schemaVersion` 2 (ajout du type d'occlusion) ; une sauvegarde de version 1 se restaure telle quelle, une version plus récente que l'application est refusée.
- Le dialogue d'export devient « Exporter (CSV, Anki) » avec le choix du format ; l'export CSV laisse de côté les notes d'occlusion et le dit.
- Réponse tapée : proposée seulement s'il y a un texte à taper (pas pour un verso image seule ni un masque sans réponse) ; une formule se tape sans ses délimiteurs (`x^2` pour `\(x^2\)`) ou telle qu'écrite.
- Écrans Révision (795 → 192 lignes) et Éditeur (373 → 196 lignes) et paramètres de paquet découpés en composants de 200 lignes au plus ; comportement inchangé.
- Nouvelles dépendances : `katex` 0.18 (ADR-009), `fsrs-browser` 6.6.0 (prévu par l'ADR-007).

#### Fixed

- Import CSV en mode « mettre à jour » : une ligne dont le recto est l'image d'une note d'occlusion n'écrase plus ses masques.
- Réimport Anki : une note dont le type de note ou les trous ont changé n'est plus mise à jour à moitié (ignorée et comptée) ; un paquet exporté par Recto puis réimporté ne crée plus de doublons.
- Import Anki : les échéances de révision sont comptées en jours calendaires depuis la date de `crt` (et non en secondes) : plus de décalage d'un jour autour d'un changement d'heure.
- Annuler une réponse ne fait plus revenir une carte supprimée entre-temps en modifiant sa note (trou ou masque retiré), et garde le nouveau paquet d'une note déplacée.

### M5 — Statistiques, finitions, V0

#### Added

- Écran Statistiques (SPEC §5.6), global ou filtré par paquet : aujourd'hui (dues, nouvelles, réponses, temps, réussite), rétention réelle 7/30/90 jours comparée à la cible, prévision sur 30 jours, calendrier des révisions sur 365 jours, répartition par état et par compartiment Memory Box.
- Graphiques SVG maison (`src/lib/ui/charts`) : colonnes, calendrier, barres ; info-bulle au survol, exploration au clavier (←/→), vue tableau, palette séquentielle validée en clair et en sombre.
- Déploiement GitHub Pages (`.github/workflows/pages.yml`, sous-chemin `/recto/`).
- README utilisateur : installation Android, sauvegarde, import Anki et CSV.
- Tests : statistiques (unitaires), E2E 6 hors ligne (révision et création sans réseau, lecteur Anki précaché), révision complète au clavier, `prefers-reduced-motion` et anneau de focus, file du jour de 20 000 cartes dans Chromium.

#### Changed

- Cibles tactiles d'au moins 44 px pour les liens isolés (retour au paquet parent, liens de liste), curseurs et sélecteurs de fichiers.
- Les tests E2E tournent à heure fixe (11:00 UTC) pour ne pas dépendre de la frontière de 04:00.

### M4 — Import `.apkg`

#### Added

- Import de paquets Anki legacy (`collection.anki21` / `collection.anki2`) dans un Web Worker : sql.js et son WASM chargés à la demande et disponibles hors ligne.
- Conversion : hiérarchie des paquets (ou un seul paquet), types de notes (cloze, basique, inverse ; autres convertis en basique avec rapport), tags, `sourceGuid` (réimport = mise à jour si plus récent), états des cartes, suspension, médias (collisions renommées, images réduites à 1 280 px sauf option).
- Option « importer l'historique de révisions » : rejeu FSRS ou Memory Box et journal conservé.
- Refus explicite du format `anki21b` avec la marche à suivre dans Anki.
- Tests : fixture, robustesse, paquet synthétique de 10 000 cartes ; E2E 4.

### M3 — Import CSV et sauvegarde

#### Added

- Import CSV/TSV (`src/lib/import/csv.ts`) : détection du séparateur et de l'en-tête, BOM, aperçu de 20 lignes, mappage des colonnes, type de note (auto `cloze`), colonne `Paquet` (sous-paquets créés), doublons (ignorer, mettre à jour, dupliquer), rapport par ligne, médias manquants ajoutables sous leur nom, écriture par lots de 500 annulable.
- Paquet d'exemple (101 départements) depuis l'accueil.
- Export CSV d'un paquet ou de la sélection (`;` ou tabulation, BOM, colonne Type).
- Restauration de sauvegarde `.recto.zip` : validation, « Remplacer » (transaction unique, sauvegarde préalable) ou « Fusionner » (plus récent gagne, journaux unionnés).
- Rappel de sauvegarde après 7 jours et bouton « Sauvegarder maintenant » sur l'accueil (partage natif sur mobile).
- Tests : CSV sur les fixtures, écriture par lots, aller-retour CSV, propriété aller-retour de la sauvegarde, validateurs ; E2E 3 et 5.

#### Fixed

- Doublons : les recto « image seule » ne sont plus considérés comme identiques.

### M2 — Planificateurs et révision

#### Added

- FSRS-6 via ts-fsrs (`src/lib/scheduler/fsrs.ts`) : prévisualisation, réponse, récupérabilité, validation des paramètres, rejeu d'historique, estimation de charge (P9).
- Memory Box à 7 compartiments (`src/lib/scheduler/leitner.ts`) : modes intervalles et calendrier du coffret, « Sûr » +2, alternance recto/verso, C7.
- Journée d'étude à 04:00 (heure locale, heure d'été), règle P7 (`canRetire`), conversion FSRS ↔ Leitner.
- File du jour (`src/lib/queue`) : apprentissage, retards par récupérabilité, révisions du jour en ordre aléatoire stable, nouvelles intercalées, round-robin entre paquets, plafonds par paquet et global, sœurs enterrées ou espacées ; file de séance en mémoire.
- Écran de révision : réponse masquée (P1), réponse tapée avec comparaison, boutons avec intervalles ou compartiments, raccourcis, annuler, modifier et reprendre, suspendre, retirer (P7), drapeau, infos, résumé, attente des cartes en apprentissage, rappel du sommeil, gestes optionnels.
- Accueil : « Réviser aujourd'hui » et compteurs par paquet ; paramètres de révision par paquet ; plafond global et gestes dans Paramètres.

#### Changed

- Pas d'apprentissage FSRS par défaut : `['10m', '10m']` (P11 avec la sémantique de ts-fsrs).

### M1 — Données et création de cartes

#### Added

- Schéma Dexie V1 (`src/lib/db/schema.ts`), dépôt typé (`repo.ts`) avec transactions, réglages typés et validés, lecture réactive `live()`.
- Domaine pur : génération des cartes (basique, inverse, texte à trous), syntaxe `{{cN::…::indice}}`, avertissements d'atomicité (P8), normalisation pour les doublons, filtres/tri du navigateur.
- Écrans Accueil (paquets), Paquet (créer, renommer, sous-paquets, déplacer, fusionner, supprimer après sauvegarde automatique), Éditeur (3 types, aperçu, doublons, tags avec suggestions, source, Ctrl+Entrée, Ctrl+Maj+C), Navigateur de cartes virtualisé (filtres dans l'URL, tri, sélection, actions groupées), Paramètres (thème, taille du texte, début de journée, stockage, persistance, médias orphelins, tout effacer, à propos).
- Médias : images (fichier, collage, glisser-déposer ; redimensionnement 1 280 px WebP/JPEG ; texte alternatif), audio (fichier, micro), stockage en blobs, déduplication sha256, cache d'URL objets révoquées.
- Rendu sécurisé des champs (`sanitize()`, DOMPurify, liste blanche) ; aucune image distante chargée.
- Sauvegarde complète `.recto.zip` (export) et partage natif sur mobile.
- Pluriels dans `t()`.
- Tests : invariants, migration factice V1→V2, médias, assainissement, e2e 1 et e2e médias/virtualisation/stockage.

### M0 — Squelette et outillage

#### Added

- Projet Vite 8 + Svelte 5 (runes) + TypeScript strict à la racine du dépôt ; dépendances de l'ADR-007.
- Scripts `dev`, `check`, `lint`, `format`, `format:check`, `test` (avec couverture), `e2e`, `build`, `verify`, `icons`.
- Structure des modules de SPEC §7 (`src/lib/*/index.ts` documentés) et écrans nommés dans `src/routes/`.
- Routeur par hash (`src/lib/url.ts`, `src/lib/router.svelte.ts`), navigation basse (mobile) / latérale (≥ 900 px), lien d'évitement.
- Jetons de design clair/sombre dans `src/app.css`, 20 icônes SVG inline.
- `src/lib/i18n/fr.ts` et `t()` typé (clé inconnue = erreur de compilation, espaces insécables français).
- PWA installable : manifeste, icônes générées depuis `public/logo.svg`, service worker précaché, bandeau « Nouvelle version disponible » (`registerType: 'prompt'`).
- Tests : unitaires (`i18n`, `url`), e2e (page affichée, routeur, manifeste, service worker, rechargement hors ligne).
- CI GitHub Actions (`.github/workflows/ci.yml`) : `npm ci` puis `npm run verify`.
