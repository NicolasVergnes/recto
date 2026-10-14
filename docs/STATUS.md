# STATUS — Recto

Dernière mise à jour : 2026-10-14 · Branche : `main` · **M13, M14, M16, M17 et le plugin `recto-deck-builder` 2.2.0 fusionnés sur `main` et publiés** (2026-10-14)

## Jalon en cours

Aucun : M13 à M17 sont terminés et fusionnés. Recto reste une PWA installable (décision du 2026-10-12). En attente, sans numéro ni date :

- Application Android avec Capacitor (couche plateforme, projet `android/`, bouton retour, micro, sons, flux Maestro, APK de débogage en CI) ; l'identifiant d'application (`appId`) sera à décider à ce moment (proposition : `fr.nicolasvergnes.recto`).
- Publication sur le Play Store (politique de confidentialité, signature, fiche, test fermé : 12 testeurs pendant 14 jours).
- Synchronisation automatique PC ↔ Android (dossier, Drive ou Syncthing).

## Terminé

### M17 — Formats de cartes à introduire, par paquet (2026-10-14)

Demande de Nicolas : pouvoir activer ou désactiver des parties d'un paquet, par exemple commencer les départements par « Carte → Nom » avant « Nom ↔ Numéro », sans notes ni paquets distincts. Avis donné : pas de sous-paquet par format (une carte est dans le paquet de sa note, et un sous-paquet ne se désactive pas), mais une pause des nouvelles cartes par format. Choix de Nicolas : réglage **par paquet**, proposé **dès l'import** (« les utilisateurs importent la plupart de leurs paquets ») ; cartes commencées toujours révisées ; en plus le filtre « Format de carte » du navigateur et l'ordre « format par format ».

Plan suivi :

1. Domaine (tests d'abord) : `domain/formats.ts` (`cardFormat`, `formatName`, `parseFormat`, `remapFormats`, `byFormatOrder`), `queue/build.ts` (`formatOf` : pause avant le plafond, tri par rang stable), `planNoteTypeEdit` → `templateMoves` — `tests/unit/domain/formats.test.ts`, `tests/unit/queue/build.test.ts` › « card formats (M17) ».
2. Chargement de la file : `db/study.ts` `newCardFormats` (notes lues seulement si un paquet de la séance s'en sert) — `tests/unit/db/study.test.ts`.
3. Données : `DeckSettings.pausedFormats` / `newByFormat`, Dexie version 6 (`migrateDeckSettingsM17`), `SCHEMA_VERSION` 7, `readSettings` ; `repo.ts` `followTemplates` (édition et suppression d'un type), `deckFormats` — `migration.test.ts`, `backup.test.ts`, `tests/unit/db/formats.test.ts`.
4. Paramètres du paquet : `src/lib/ui/deck/FormatFields.svelte`.
5. Import `.apkg` : `packageFormats`, options `pausedFormats`/`newByFormat`, `ImportPlan.deckUpdates`, `src/lib/ui/import/ApkgFormats.svelte` — `tests/unit/import/apkg.test.ts`.
6. Navigateur : `rowFormats`, `BrowserFilter.format`, `src/lib/ui/browser/BrowserFilters.svelte` (filtres sortis de `Cards.svelte`, 223 → 193 lignes) — `tests/unit/domain/browse.test.ts`.
7. E2E `tests/e2e/card-formats.spec.ts` ; docs 02, 03, 04 (§2.9), 05, 07, skill `srs-rules`, CHANGELOG.

Critères (07-ROADMAP M17) :

- ✔ Formats et réglages, migration — `formats.test.ts`, `migration.test.ts` › « opens a version 5 database… (M17) », `backup.test.ts` › « card formats of decks (M17) ».
- ✔ File : pause avant le plafond, cartes commencées révisées, format par format — `build.test.ts`, `study.test.ts` › « lets every card of a custom note share the day (M13) » (partie M17 : pause, ordre, compteurs de l'accueil).
- ✔ Paramètres du paquet, import, navigateur — E2E `card-formats.spec.ts` (bureau et mobile : import de `multi-template.apkg` avec « Qcarte » seul → 2 nouvelles ; réglages : « QDept » réactivé et format par format → 3 nouvelles ; filtre « QCh-lieu » → 3 cartes, gardé au rechargement) ; `apkg.test.ts` › « lists its formats and leaves those unchecked for later… ».
- ✔ Éditeur de types et suppression d'un type — `tests/unit/db/formats.test.ts`.
- ✔ `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 588 tests unitaires (couverture 92,3 % des lignes), build, E2E 115 réussis et 1 ignoré. Vérifié dans l'application réelle avec `paquets/departements.apkg` (101 notes, 3 formats) : import avec « Carte → Nom » seul → séance « 20 nouvelles », toutes « Quel département ? » ; paramètres du paquet : trois formats, 101 nouvelles chacun, seul « Carte → Nom » coché ; lisible sur téléphone.

### Plugin `recto-deck-builder` 2.2.0 — charte de rédaction des cartes (2026-10-14)

Demande de Nicolas : à partir de l'analyse bibliographique (`Dossier-Flashcards.html` §1.4, §2.1-2.3) et de la théorie du format des cartes (vingt règles de Wozniak, dix règles d'or et chapitre « Améliorer ses flashcards » du livret Memory Box), mettre à jour le plugin pour qu'il produise des cartes dans un format pertinent pour l'apprentissage. Fait hors jalon, dans `tools/deck-builder/` seulement (aucun changement dans l'application) :

- `reference/format-cartes.md` (charte R1-R13 sourcée, formats par sujet, avant/après, grille de relecture) ; `SKILL.md` réécrit autour de la charte ; `api.md`, `README.md`, `plugin.json` 2.2.0.
- `recto_apkg.py` : `add_sequence()`, `pendu()`, avertissements « charte Rn » dans le rapport (`Report.charte`), non bloquants ; `examples/charte.py`. Convention des faces d'une carte à deux sens (question de Nicolas, 17 h 41) : Recto n'affichant pas le nom du modèle en révision, chaque face dit ce qu'on cherche (`<b>{{Nom}}</b><br><i>numéro ?</i>` ↔ `<b>{{Numéro}}</b><br><i>département ?</i>`) ; deux cartes d'une note qui posent la même face sont signalées (R5). Le paquet `paquets/departements.apkg` (2.1.0) a cette ambiguïté sur ses 101 notes (« Département : Ain » pour Nom ↔ Numéro et Nom ↔ Préfecture) : corriger les deux modèles dans Recto (Types de notes › Département) pour garder la progression, ou régénérer.
- Vérifié : `tests/unit/deck-builder-plugin.test.ts` (6 tests, dont 2 nouveaux : `charte.py` importé par l'importeur de Recto sans avertissement ; cartes fautives signalées), `tsc -p tsconfig.test.json`, eslint, prettier ; `recto_apkg.py check` sur `paquets/departements.apkg` (303 cartes) et `docs/Les_dpartements_franais.apkg` (404 cartes) : aucun avertissement « charte » (pas de faux positif). `npm run verify` vert (573 tests unitaires, E2E 113 réussis et 1 ignoré), commité sur `main`. À faire par Nicolas : téléverser le nouveau `recto-deck-builder.zip` dans l'application Claude.

### M14 — Texte à trous et occlusion d'image deviennent des types de cartes (2026-10-14)

Demande de Nicolas : « Textes à trous » et « Occlusion d'images » ne doivent pas être des types de notes mais des types de cartes ; dans le type Basique (une carte), on choisit le type de carte ; dans un type personnalisé, chaque carte ajoutée choisit le sien (« un type de note qui génère une occlusion, 2 basiques et un texte à trous »). Précisions de Nicolas : une carte par trou par défaut, avec une case « Génère une seule carte » ; plusieurs cartes à trous ou d'occlusion par type, sans limite ; export Anki : « le but c'est d'utiliser Recto », cartes classiques seulement.

Plan suivi :

1. Domaine (tests d'abord) : `cloze.ts` (index `null` = tous les trous), `templates.ts` (`kindOf`, `customOrd`/`templateIndex`/`subIndex`, `templateOrds` par type de carte, `sourceFields`), `notes.ts` (`cardOrds(note, type)`, `single`, rendu à trous et d'occlusion des types personnalisés, `OcclusionCard.target: null`), `note-types.ts` (champ source protégé et exigé, `storedTemplate`, cartes et masques qui suivent les modèles et les champs) — `tests/unit/domain/card-kinds.test.ts`, `cloze.test.ts`.
2. Base et sauvegardes : Dexie version 5, `SCHEMA_VERSION` 6, `readNoteType`/`readNote` (`kind`, `field`, `single`, `masks`), `repo.ts` (`single`, `masks` canoniques) — `tests/unit/db/migration.test.ts`, `tests/unit/import/backup.test.ts`, `tests/unit/db/card-kinds.test.ts`.
3. Éditeur de types (`TemplateList`, nouveau `TemplateSides`, `draft.svelte.ts` `setKind`) et liste des types (« Basique » intégré).
4. Éditeur de notes (`NoteTypeRow` : Type + Type de carte + « Génère une seule carte » ; `Editor` : éditeur de masques par champ image ; `NoteFields`/`slots.ts` : trou dans le champ à trous actif ; `CardPreview` nommé par carte et trou) ; `OcclusionView` (carte unique), `browse.ts`.
5. Export `.apkg` (`ankiOrds`, rapport `leftOut`), import (`resolveNoteType` ne réutilise pas un type mixte) — `tests/unit/export-apkg.test.ts`.
6. E2E `tests/e2e/card-kinds.spec.ts` et sélecteurs des specs existantes ; docs 01, 02, 04, 05, 07, 08 (ADR-011), CHANGELOG ; `npm run verify`.

Critères (07-ROADMAP M14) :

- ✔ Éditeur de notes : Type (Basique, types personnalisés), Type de carte, « Génère une seule carte » — E2E `create-notes.spec.ts` (options, 2 cartes ↔ 1 carte), `card-kinds.spec.ts` › « a Basique cloze note can ask every hole on one card » ; carte du premier trou gardée — `tests/unit/db/card-kinds.test.ts` › « keeps the card of the first hole… ».
- ✔ Éditeur de types : type de chaque carte, champ source, en-tête, ajout au verso, carte unique, champ source protégé, Basique listé — `card-kinds.spec.ts` › « a note type mixes… », `tests/unit/domain/card-kinds.test.ts` (validation, `fieldUsers`, déplacement des cartes de chaque trou, masques qui suivent leur champ, changement de type ou de champ, carte unique).
- ✔ Note d'un type mixte : masques par champ image, trous au bouton et au clavier, aperçu « Carte 4 · 2 », révision des 6 cartes (2 occlusions, 2 classiques, 2 trous) — `card-kinds.spec.ts` (bureau et mobile) ; réconciliation — `tests/unit/db/card-kinds.test.ts`.
- ✔ Données : aucune réécriture ; base version 4 ouverte en version 5 (notes, cartes et rendu identiques) — `migration.test.ts` › « opens a version 4 database… (M14) » ; sauvegardes — `backup.test.ts` › « card kinds (M14) » (lecture, refus par une version 5, aller-retour).
- ✔ Export Anki : cartes classiques renumérotées, `leftOut` compté, type sans carte classique laissé, type mixte non réutilisé au réimport — `export-apkg.test.ts` › « custom types with card kinds (M14) ».
- ✔ `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 558 tests unitaires (couverture 92,2 % des lignes), build, E2E 111 réussis et 1 ignoré (bureau et mobile). Vérifié dans l'application réelle : le vrai paquet « Les départements français » s'importe toujours en 404 cartes ; son type affiche « Classique » pour ses 4 cartes ; y ajouter une carte à trous sur un champ sans trou ne crée aucune carte (404 cartes) ; éditeur de note Basique « Texte à trous » + carte unique lisible sur ordinateur et téléphone.

### M13 — Révision au hasard, compteurs de l'accueil, plus de jumelles (2026-10-14)

Demande de Nicolas : en révision, les cartes tirées au hasard dans le paquet, par défaut (apprentissage, révisions, découverte des nouvelles) ; dans la liste des paquets de l'accueil, le nombre de notes et de cartes ; retirer l'option « Pas de cartes jumelles le même jour » (« il ne doit pas exister de cartes jumelles : soit une carte peut apparaître dans les deux sens, soit pas »). Précisions de Nicolas : garder « retards puis du jour », chaque lot au hasard ; pas d'espacement entre deux cartes d'une même note (« ça se régulera avec l'aléatoire ») ; paquets existants passés en aléatoire ; sous-paquets comptés dans le parent ; il revoit lui-même le modèle « Departements » (paires numéro → nom et nom → numéro).

Plan suivi :

1. File du jour (`src/lib/queue/build.ts`) : apprentissage, retards, cartes du jour mélangés chacun (graine = jour) ; sélection sous plafond inchangée (R / box) ; retrait de l'enterrement des jumelles et de `spaceSiblings` — `tests/unit/queue/build.test.ts`.
2. Retrait de `areTwins` (`domain/notes.ts`), de `twinsOf` (`db/study.ts`), de `burySiblings` (types, défauts, formulaire, libellé, lecture des sauvegardes) ; `newOrder: 'random'` par défaut.
3. Migration : Dexie version 4 (`upgrade()` des paquets), sauvegarde `schemaVersion` 5 (`migrate()`), fonction commune `migrateDeckSettingsM13` (`domain/defaults.ts`) — `tests/unit/db/migration.test.ts`, `tests/unit/import/backup.test.ts`.
4. Accueil : `familyCounts` (`domain/decks.ts`), ligne « n notes · n cartes » dans `DeckList.svelte` — `tests/unit/domain/decks.test.ts`.
5. E2E rendus indépendants de l'ordre de révision ; docs (01, 02, 03, 04, 06, 07, skills `srs-rules` et `verify`), CHANGELOG ; `npm run verify`.

Critères (07-ROADMAP M13) :

- ✔ Lots de la file au hasard, stables dans la journée, retards puis du jour ; plafond qui garde les retards les plus fragiles — `build.test.ts` › « M13: overdue reviews come first, then today's… », « M13: shuffles the learning cards… », « P6: a capped deck keeps its overdue FSRS reviews… » et « …Leitner… ».
- ✔ Nouvelles au hasard par défaut, « Ordre d'ajout » au choix — `build.test.ts` › « M13: picks new cards at random by default… » ; migration des paquets existants — `migration.test.ts` › « opens a version 3 database… (M13) », `backup.test.ts` › « reads a version 4 backup… (M13) », `validate.test.ts`.
- ✔ Cartes d'une note le même jour, ni enterrées ni espacées — `build.test.ts` › « M13: cards of a note share the day… », `tests/unit/db/study.test.ts` › « lets every card of a custom note share the day (M13) ».
- ✔ Accueil « n notes · n cartes », sous-paquets compris — `decks.test.ts` › « M13: counts the notes and cards… » ; E2E `review.spec.ts` › « the home screen counts notes and cards, and new decks draw cards at random ».
- ✔ E2E rendus indépendants de l'ordre (`review`, `note-types`, `occlusion`, `import-backup`, `offline-stats`) ; `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 531 tests unitaires (couverture 92,05 % des lignes), build, E2E 107 réussis et 1 ignoré (bureau et mobile). Vérifié dans l'application réelle : une base version 3 (paquet parent et sous-paquet en « ordre d'ajout » avec `burySiblings`) s'ouvre en version 4, paquets en « Aléatoire » sans `burySiblings`, `updatedAt` gardé ; accueil « 5 notes · 6 cartes » / « 4 notes · 5 cartes » lisible sur ordinateur et téléphone ; séance mélangée où les deux trous d'un même texte passent.
### M16 — Cartes dans les deux sens dans les types de notes (2026-10-14)

Branche `m16-two-way-templates` (créée depuis `worktree-deck-builder-plugin`), fusionnée sur `main` après M13 et M14 : `twoWay` ne vaut que pour une carte classique (M14), sa sauvegarde est au schéma 6 avec les types de cartes (le schéma 5 étant pris par M13), et le compte des jumelles a disparu avec M13. Critères (`docs/07-ROADMAP.md`) :

- [x] Option « Poser dans les deux sens » (`CardTemplate.twoWay`) : rendu à deux faces et alternance comme une note basique (`domain/notes.ts`, `tests/unit/domain/templates.test.ts` › « ask a two-way template by either face »), E2E `tests/e2e/note-types.spec.ts` › « a card asked both ways: one card, turned over after a success » ; vérifié dans l'application avec le paquet Départements (Carte → Nom reste dans son sens, Nom ↔ Numéro revient « ↔ Sens inversé » après une réussite).
- [x] Carte seulement si les deux faces ont un contenu (`templateOrds`) ; cocher ou décocher garde les cartes (`tests/unit/domain/note-types.test.ts` › « asks a template both ways or one way », « removes a two-way card when its second face is empty »).
- [x] Sauvegarde schéma 5, lecture des versions précédentes (`tests/unit/import/backup.test.ts` › « reads two-way templates (version 5) », allers-retours avec un modèle à deux sens dans `tests/helpers/generate.ts`), base d'avant M16 (`tests/unit/db/migration.test.ts` › « reads note types stored before M16 »).
- [x] `.apkg` : `tests/unit/export-apkg.test.ts` › « exports a two-way template as a one-way Anki card that comes back two-way ».
- [x] Plugin 2.1.0 : `one_way()`, `two_way()`, vérificateur et skill (`tests/unit/deck-builder-plugin.test.ts`) ; paquet Départements : 3 cartes par note.
- [x] `npm run verify` vert.

### M12 — Données prêtes pour plusieurs appareils et pour des testeurs (2026-10-12)

Critères (07-ROADMAP M12) :

- ✔ Règle de migration écrite dans `CLAUDE.md` et `quality-gate` §4 ; Dexie version 3 (`card.updatedAt` indexé, table `deletions`) avec `upgrade()`, sauvegarde `schemaVersion` 4 (`readCard` date les cartes des sauvegardes plus anciennes comme l'`upgrade`) — `tests/unit/db/migration.test.ts` (« opens a version 2 database »), `tests/unit/import/backup.test.ts` (« reads a version 3 backup », « reads deletions and setting dates »).
- ✔ Traces de suppression (`db/deletions.ts`, `recordDeletions` dans la transaction de chaque suppression : `deleteDeck`, `mergeDecks`, `deleteNotes`, `updateNote`, `updateNoteType`, `deleteNoteType`, import, `undoReview`, `deleteMedia`) ; `card.updatedAt` mis à jour par chaque modification (réponse dans les deux planificateurs, annulation, suspension, drapeau, retrait, réinitialisation, déplacement, `ord`, changement de planificateur) — `tests/unit/db/repo.test.ts` › « deletions and change dates », `tests/unit/db/study.test.ts`.
- ✔ Fusion qui suit les suppressions (`db/restore.ts`) — `tests/unit/db/sync-merge.test.ts` (deux bases jouent A et B : note supprimée ici ou là, modifiée après sa suppression, paquet gardé pour une note ajoutée, annulation, copie la plus récente d'une carte, journal d'une note supprimée sans le savoir, médias, réglages ; propriété : huit graines de modifications aléatoires sur chaque appareil, fusion dans les deux sens → même contenu, idempotence, invariants) ; E2E `tests/e2e/backup-merge.spec.ts` (« a note deleted on one device stays deleted after merging both ways », deux profils de navigateur).
- ✔ `deviceId` (réglage propre à l'appareil, dans le manifeste) ; réglages partagés `dayStartHour` et `globalReviewsPerDay` datés et fusionnés, les autres jamais importés (fusion et « remplacer ») — `sync-merge.test.ts` › « shares the collection settings », `backup.test.ts` (aller-retour).
- ✔ `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 533 tests unitaires (couverture 92,2 % des lignes), build, E2E 105 réussis et 1 ignoré (bureau et mobile). Vérifié dans l'application réelle : une base créée en version 2 s'ouvre migrée (version 3, carte datée, table `deletions`), révision et sauvegarde fonctionnent, le thème de l'appareil est gardé.

### M11 — Une carte, deux sens ; champs protégés ; plus d'emoji (2026-10-11)

Demande de Nicolas : supprimer l'emoji des paquets ; supprimer « Basique + inversé » (une carte doit pouvoir être vue dans les deux sens sans créer de carte jumelle ; le sens est un réglage) ; rendre « retourner après chaque réussite » disponible en FSRS ; empêcher de supprimer un champ utilisé par les cartes (le champ « Numero » des départements disparaissait des cartes sans avertissement) ; la réponse tapée doit suivre le sens de la carte (nom ↔ photo : rien à taper quand la réponse est la photo). Plan validé : sens réglé par paquet avec exception par note, activé partout par défaut, aucune migration.

Critères (07-ROADMAP M11) :

- ✔ `basic_reverse` retiré (types, éditeur, CSV, import et export Anki, validation) ; le type inversé d'Anki et la colonne CSV « basique + inverse » donnent une note `basic` à une carte — `tests/unit/import/apkg.test.ts`, `apkg-large.test.ts`, `apkg-robust.test.ts`, `csv.test.ts`, `validate.test.ts`.
- ✔ `DeckSettings.alternateSides` (défaut `true`) pour les deux planificateurs (`scheduler/sides.ts` `flipAfter`) ; `Note.oneWay` (« Ne jamais retourner cette note ») ; rendu dans `renderCard` — `tests/unit/scheduler/fsrs.test.ts`, `leitner.test.ts`, `tests/unit/domain/notes.test.ts`, `tests/unit/db/repo.test.ts`, E2E `review.spec.ts` (« an FSRS deck asks a basic card both ways »), `create-notes.spec.ts`.
- ✔ Réponse tapée : face non demandée comparée, rien à taper quand c'est une image — `notes.test.ts` › « types the side that is not asked ».
- ✔ Champs : retrait refusé si une carte l'utilise (`fieldUsers`), référence inconnue refusée (`unknownReference`, `noteTypeUnknownField`), contenu perdu annoncé (`NoteTypeEditPlan.lost`), renommage qui ne prend plus les références d'un autre champ — `tests/unit/domain/note-types.test.ts`, `tests/unit/note-type-draft.test.ts`, E2E `note-types.spec.ts` (« a field used by a card stays »). Vérifié sur le vrai paquet des départements : retirer « Numero » est refusé, les cartes « QNumero », « QDept », « QCh-lieu », « Qcarte » sont nommées.
- ✔ Emoji retiré ; sauvegardes anciennes lisibles (valeur ignorée) — `validate.test.ts`.
- ✔ Interopérabilité : échantillon, `--fsrs`, type personnalisé et aller-retour des départements revérifiés avec le moteur d'Anki 26.9.3, verdict OK (7 notes, 8 cartes ; `tests/interop/README.md`).
- ✔ `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 516 tests unitaires (couverture 91,9 % des lignes), build, E2E 103 réussis et 1 ignoré (bureau et mobile).

### M10 — Dette technique (2026-10-10)


Demande de Nicolas du 2026-10-10 : « Continue les étapes de dev qui ne nécessitent pas mon intervention ». Périmètre retenu : la dette de « Reste à faire » qui ne demande ni décision produit ni manipulation de Nicolas. La V2 (synchronisation par fichier, empaquetage Android) attend sa confirmation (« Écarts », M6 ; l'empaquetage demande aussi des comptes et des clés de signature) : non commencée. Branche créée depuis `m9-review-tweaks` (M10 touche au code de M8 et M9, non fusionnés).

Plan :

1. Réimport `.apkg` et fusion de sauvegarde : les cartes des notes mises à jour sont réconciliées (trou, masque ou modèle ajouté ou retiré) au lieu d'ignorer la note ou de laisser des cartes en trop — `src/lib/import/{apkg,plan}.ts`, `src/lib/db/{importer,restore}.ts` ; tests `tests/unit/import/apkg*.test.ts`, `tests/unit/db/importer.test.ts`, `tests/unit/import/backup.test.ts`.
2. Éditeur de types : monter et descendre un champ ou un modèle de carte — `src/lib/ui/note-types/` ; tests `tests/unit/domain/note-types.test.ts`, E2E `tests/e2e/note-types.spec.ts`.
3. Formules : `[$]…[/$]` et `[$$]…[/$$]` d'Anki rendues par KaTeX ; aide de syntaxe dans l'éditeur — `src/lib/domain/math.ts`, `src/lib/ui/editor/` ; tests `tests/unit/domain/{math,typed}.test.ts`, E2E `tests/e2e/math.spec.ts`.
4. Import CSV vers un type personnalisé (colonnes → champs du type) ; une ligne d'un type intégré ne met plus jamais à jour une note personnalisée — `src/lib/import/csv.ts`, `src/lib/ui/import/CsvImport.svelte` ; tests `tests/unit/import/csv.test.ts`, E2E.
5. Composants de plus de 200 lignes découpés sans changement de comportement (svelte5-conventions §3) : `Settings`, `Home`, `Deck`, `CsvImport`, `Stats`, `App`, `Heatmap`, `ApkgImport`, `Cards`, `ColumnChart`, `CardMosaic`, `Editor` ; E2E existants inchangés.
6. Favicon dans `index.html` sans requête (hors ligne, plus d'échec de `logo.svg`).
7. Interopérabilité : export d'un type personnalisé vérifié avec le moteur d'Anki (`tests/interop/`).
8. Firefox et WebKit : suite E2E lancée hors `verify` ; écarts corrigés ou consignés.
9. Relecture adversariale de l'ensemble, `npm run verify`, docs (02, 04, 05, 08, STATUS, CHANGELOG).

Déroulement : points 1 à 3, l'interopérabilité et les découpages de `Home`, `Stats`, `Settings`, `Deck` et `App` développés sur des branches de travail `m10-*` (copies isolées) puis intégrés un commit par point ; les relectures automatiques prévues n'ont pas abouti (agents interrompus par les limites d'usage de la session) : chaque branche a été relue et vérifiée par l'intégrateur (contrôles, E2E, captures). Points 4, Firefox et fidélité Anki faits directement sur `m10-tech-debt`.

Critères (07-ROADMAP M10) :

- ✔ Réimport `.apkg` avec réconciliation des cartes (créées comme à l'import, supprimées avec journal conservé, type changé toujours ignoré) — `tests/unit/import/apkg-reimport.test.ts`, `tests/unit/db/importer.test.ts`, E2E `tests/e2e/apkg-reimport.spec.ts`.
- ✔ Fusion de sauvegarde : invariant 2 sur toute la base après fusion, doublons d'`ord` réduits, carte de la sauvegarde adoptée — `tests/unit/import/backup.test.ts` › merge, `tests/helpers/invariants.ts`, E2E `tests/e2e/backup-merge.spec.ts`.
- ✔ Éditeur de types : « Monter » / « Descendre » (souris, clavier, focus suivi, annonce) ; champs des notes et `ord` des cartes suivent ; annuler une réponse après un déplacement garde le nouvel `ord` — `tests/unit/domain/note-types.test.ts`, `tests/unit/db/note-types.test.ts`, `tests/unit/note-type-draft.test.ts`, `tests/unit/db/study.test.ts`, E2E `tests/e2e/note-types.spec.ts`.
- ✔ Formules `[$]…[/$]` et `[$$]…[/$$]` rendues (révision, aperçu, mosaïque, réponse tapée), `[latex]` en source, aide repliable dans l'éditeur — `tests/unit/domain/math.test.ts`, `tests/unit/domain/typed.test.ts`, E2E `tests/e2e/math.spec.ts`.
- ✔ Import CSV vers un type personnalisé ; une ligne d'un type intégré ne met plus à jour une note personnalisée (défaut corrigé : « mettre à jour » remplaçait ses champs par Recto/Verso/Extra) — `tests/unit/import/csv.test.ts` › custom note types, E2E `tests/e2e/csv-custom.spec.ts`.
- ◐ Composants ≤ 200 lignes : `Home`, `Stats`, `Settings`, `Deck`, `App`, `CsvImport` découpés (captures avant/après identiques au pixel près, bureau et mobile, clair et sombre — sauf un décalage sous le pixel dans un état du dialogue « Nouveau paquet » de l'écran Paquet —, E2E complets verts) ; restent `Heatmap` (271), `ApkgImport` (249), `Cards` (223), `ColumnChart` (210), `Editor` (205), `CardMosaic` (203), voir « Reste à faire ».
- ✔ Interopérabilité : export d'un type personnalisé et aller-retour du vrai paquet des départements vérifiés avec le moteur d'Anki 26.9.3 (`tests/interop/README.md`, verdict OK) ; défaut trouvé et corrigé : l'export remplaçait le style du type dans Anki (CSS, champ de tri, préambule LaTeX) — `tests/unit/export-apkg.test.ts` › « gives Anki back… ».
- ✔ Firefox : suite E2E entière verte (`npm run e2e:firefox`, 49 tests) ; défaut corrigé : l'éditeur attendait la demande de persistance, que Firefox laisse en suspens jusqu'à la réponse de l'utilisateur (formulaire non vidé, éditeur bloqué) — `tests/unit/db/storage.test.ts`. WebKit de Playwright : au mieux, échecs expliqués (06 §4). Favicon hors ligne : non reproductible avec Playwright, non modifié (voir « Écarts »).
- ✔ `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 510 tests unitaires (couverture 91,8 % des lignes, seuils tenus), build (bundle initial ≈ 188 Ko gzip), E2E 99 réussis et 1 ignoré (bureau et mobile).

### M9 — Jumelles, Memory Box sans calendrier, conversion sans sauvegarde (2026-10-10)

Demande de Nicolas du 2026-10-10 (07-ROADMAP « M9 ») : ne pas réviser le même jour deux cartes jumelles (« numéro → nom », « nom → numéro ») mais permettre, par défaut, « numéro → nom » et « carte → nom » ; retirer le calendrier du coffret (utile seulement pour la boîte en papier) en gardant les intervalles réglables ; ne plus forcer le téléchargement d'une sauvegarde au changement de planificateur. Plan suivi : 1) domaine `areTwins` (`domain/notes.ts`) et ses tests ; 2) file (`queue/build.ts`, entrée `twins`, `TodayReview.ord`) ; 3) chargement (`db/study.ts`, notes et types des seules notes à plusieurs cartes candidates) ; 4) retrait du mode `calendar` (type, planificateur, validation, écran, libellés) ; 5) `SchedulerSwitch` sans sauvegarde ; 6) docs (SPEC, 02, 03, 04, 06, 07, 08, skill `srs-rules`) ; 7) `npm run verify`.

Critères (07-ROADMAP M9) :

- ✔ `areTwins` : recto/verso, trous, occlusion, types personnalisés — `tests/unit/domain/twins.test.ts` (les 4 modèles réels du paquet des départements : QNumero, QDept et QCh-lieu jumelles entre elles, Qcarte jumelle d'aucune).
- ✔ File : jumelles enterrées, autres sœurs le même jour à ≥ 10 positions, jumelle répondue aujourd'hui — `tests/unit/queue/build.test.ts` › « buries twins only… » ; chargement depuis la base avec un type personnalisé — `tests/unit/db/study.test.ts` › « lets non-twin cards of a custom note share the day ».
- ✔ Memory Box sans mode : `tests/unit/scheduler/leitner.test.ts` (intervalles), `tests/unit/import/validate.test.ts` (ancien `mode: 'calendar'` ignoré) ; E2E `review.spec.ts` › « Memory Box decks… » (intervalle C1 éditable, pas de « Calendrier du coffret »).
- ✔ Changement de planificateur sans téléchargement — même E2E (aucun événement `download`).
- ✔ `npm run verify` vert (une première passe a échoué sur `export-apkg.spec.ts` en projet mobile, délai de 5 s dépassé sous charge ; 12/12 en relance isolée puis E2E complets verts).

### M8 — Types de notes multi-cartes (2026-10-02)

Demande de Nicolas du 2026-10-02 (07-ROADMAP « M8 », ADR-010) : une note produit plusieurs cartes comme dans Anki ; l'import du paquet « Les départements français » (5 champs, 4 modèles) ne fusionne plus rien dans Extra ; éditeur de types inclus (choix de Nicolas). Plan suivi : 1) domaine pur `templates.ts` (syntaxe Anki) et `note-types.ts` (validation, plan de modification) avec leurs tests ; 2) `notes.ts` (`custom`) ; 3) Dexie version 2 (`noteTypes`) et dépôt (notes, CRUD des types, réconciliation en une transaction) ; 4) révision, navigateur, éditeur de notes ; 5) import `.apkg` (types conservés, réimport), export `.apkg`, CSV, sauvegarde v3 ; 6) écrans « Types de notes » ; 7) fixture `multi-template.apkg`, E2E ; 8) vérification avec le vrai paquet, docs, `npm run verify`.

Critères (07-ROADMAP M8) :

- ✔ Type `custom`, table `noteTypes`, Dexie version 2, sauvegarde `schemaVersion` 3 — `tests/unit/db/migration.test.ts` (base version 1 ouverte en version 2), `tests/unit/import/backup.test.ts` (aller-retour avec types, sauvegarde v2 sans types, note orpheline rejetée).
- ✔ Modèles en syntaxe Anki, une carte par modèle dont la question n'est pas vide — `tests/unit/domain/templates.test.ts`, `tests/unit/domain/note-types.test.ts`.
- ✔ Import `.apkg` — `tests/unit/import/apkg.test.ts` › « multi-card note types » (fixture `multi-template.apkg` : 3 notes, 11 cartes) ; `tests/unit/export-apkg.test.ts` › « keeps a multi-card note type » (export, réimport, réimport sans doublon ni nouveau type). Vérifié avec le vrai `docs/Les_dpartements_franais.apkg` (non commité) : 101 notes, **404 cartes**, type « Departements » à 5 champs, 101 médias ; aucune face de tuile ne défile, dans les deux mosaïques et les trois tailles, bureau et mobile.
- ✔ Écran « Types de notes » et éditeur de type — `tests/unit/db/note-types.test.ts` (réconciliation : modèle retiré avec décalage des `ord` et journal conservé, champ ajouté, suppression refusée), E2E `tests/e2e/note-types.spec.ts` › « a note type is created, used and given a second card ».
- ✔ Éditeur de notes (types personnalisés, champs nommés, aperçu de toutes les cartes) — E2E `note-types.spec.ts` (les deux tests).
- ✔ `npm run verify` vert.

### M7 — Vue mosaïque du navigateur (2026-09-29)

Demande de Nicolas du 2026-09-29, hors roadmap initiale (07-ROADMAP « M7 »). Plan suivi : 1) réglages `browserView` et `flipStyle` + écran Paramètres ; 2) découpage de `Cards.svelte` (`CardTable`, `BulkActions`) sans changement de comportement ; 3) helpers purs `grid.ts` + composants `CardMosaic`, `CardTile`, `TileFace`, `FlipFaces` ; 4) intégration du contrôle « Affichage » ; 5) E2E ; 6) docs ; 7) relecture croisée et `npm run verify`.

Critères (07-ROADMAP M7) :

- ✔ Contrôle « Affichage » (Liste, Mosaïque, Mosaïque recto-verso) mémorisé (`browserView`) — `tests/e2e/browser-mosaic.spec.ts` (rechargement), `tests/unit/db/settings.test.ts`.
- ✔ Tuile : contenu rendu par `CardContent`/`OcclusionView` (HTML nettoyé, formules, images, occlusion), case de sélection, « Retourner », « Modifier » ; verso hors du DOM avant le premier retournement — E2E (`<b>` rendu, réponse absente puis visible, `inert` sur la face cachée, cloze révélé au verso).
- ✔ Barre de la mosaïque : « Tout sélectionner », « Trier par », « Ordre » — E2E (tri par question décroissant).
- ✔ 5 styles de retournement dont « Sans animation » (`flipStyle`), ≤ 400 ms, instantané avec `prefers-reduced-motion` — E2E (choix dans Paramètres persistant, `data-flip-style`, `transitionDuration` = 0 s).
- ✔ Mosaïque virtualisée : 5 000 cartes gardent un DOM borné (`tests/e2e/media-and-browser.spec.ts`) ; 1 colonne sur mobile, recto-verso empilé — E2E projet `mobile`, `tests/unit/browser-grid.test.ts`.
- ✔ `Cards.svelte` découpé (460 → 219 lignes) sans changement de comportement ; E2E existants inchangés et verts ; `npm run verify` vert.

Retours de Nicolas (2026-09-30), traités sur la même branche :

- ✔ Rotation : la question ne transparaît plus en miroir derrière la réponse — `FlipFaces.svelte` masque la face détournée à mi-rotation en plus de `backface-visibility` ; E2E (`.face.front` masquée après retournement). Défaut non reproduit dans Chromium sans interface : à confirmer sur l'appareil de Nicolas (voir plus bas).
- ✔ Contenu ajusté sans barre de défilement : `fit.ts` réduit le contenu d'une face (`zoom`, jusqu'à 50 %) et les images sont plafonnées à la hauteur de la face (`100cqh`) ; E2E (paquet d'exemple, 2 vues × 3 tailles, aucune face ne défile), `tests/unit/browser-grid.test.ts` (`fitZoom`).
- ✔ « Taille » (petites, moyennes, grandes) dans la barre de la mosaïque, mémorisée (`tileSize`) ; petites = 2 colonnes sur téléphone, boutons en icône seule — E2E (colonnes, rechargement), `tests/unit/db/settings.test.ts`.
- ✔ « Déplacer » : bouton « Nouveau paquet » (réutilise `NewDeckDialog`, ouvert par-dessus ; le paquet créé devient la destination) — E2E `move: a new deck is created from the move dialog`.

### M6 — V1 : occlusion d'image, export Anki, optimiseur FSRS, formules (2026-09-25)

Périmètre retenu : celui de la SPEC (prioritaire sur la roadmap) — §8 « M6 (optimiseur, occlusion, export apkg) ouvre la V1 » et §5.2 « LaTeX … rendu par KaTeX en V1 ». La synchronisation par fichier et l'empaquetage Android, listés dans 07-ROADMAP M6, sont placés en **V2** par la SPEC (§2 et §3) : reportés, contradiction signalée ci-dessous (« Écarts »).

Plan suivi (branches de travail `v1-*` relues chacune par deux relecteurs puis corrigées, fusionnées dans la branche de session, puis relecture adversariale de l'ensemble avec vérification indépendante des défauts graves) :

1. Dette : `Review.svelte` (795 → 192 lignes) et `Editor.svelte` (373 → 196) découpés en composants de `src/lib/ui/review/` (contrôleur `ReviewController`, `Flashcard`, `AnswerBar`, `ReviewMenu`…, raccourcis purs `keys.ts`) et `src/lib/ui/editor/` (`NoteDraft`, emplacements de champs `slots.ts`, `NoteFields`…) ; paramètres de paquet découpés (`src/lib/ui/deck/`).
2. KaTeX (ADR-009) : repérage pur `src/lib/domain/math.ts` (scanner linéaire), rendu à la demande `src/lib/math/katex.ts` dans `CardContent`, réponse tapée avec ou sans délimiteurs.
3. Export `.apkg` legacy (05 §4) : `src/lib/export/apkg.ts` (pur, sql.js), worker, `src/lib/db/export-apkg.ts`, dialogue « Exporter (CSV, Anki) », export de la collection dans Paramètres ; réimport sans doublons ; `tests/interop/` (moteur d'Anki).
4. Optimiseur FSRS (03 §2.4) : `src/lib/scheduler/optimizer.ts`, worker `fsrs-browser`, `src/lib/db/optimize.ts`, bloc « Paramètres de mémoire » (`src/lib/ui/deck/FsrsOptimizer.svelte`).
5. Occlusion d'image : domaine `src/lib/domain/occlusion.ts` (masques, groupes, édition, syntaxe Anki), `notes.ts`, composants `src/lib/ui/occlusion/` (vue, éditeur, zone de dessin, liste de masques), intégration éditeur/aperçu/révision, sauvegarde (`schemaVersion` 2), CSV exclu, import et export Anki (type natif « Image Occlusion »).
6. Relecture adversariale finale (4 angles + vérification), corrections, `npm run verify`, docs 01/02/03/04/05/08, README, CHANGELOG, STATUS.

Critères (07-ROADMAP M6, périmètre SPEC) :

- [x] Optimiseur FSRS dans le navigateur (`fsrs-browser` 6.6.0, worker à usage unique, seuil de 1 000 révisions utilisables, comparaison avant acceptation) : `tests/unit/scheduler/optimizer.test.ts`, `tests/unit/scheduler/fsrs-browser.test.ts` (WASM réel sous Node), `tests/unit/db/optimize.test.ts`, `tests/unit/optimizer-client.test.ts`, e2e `tests/e2e/optimizer.spec.ts` (1 440 révisions, Optimiser, Appliquer, 21 paramètres enregistrés ; message de seuil).
- [x] Occlusion d'image (type `image_occlusion` : masques rectangulaires sur une image, **une carte par groupe de masques** — un masque par défaut, voir « Écarts ») : `tests/unit/domain/occlusion.test.ts`, `tests/unit/domain/notes.test.ts`, `tests/unit/db/repo.test.ts` › « reconciles occlusion cards by mask group… », `tests/unit/import/apkg-occlusion.test.ts` (fixture exportée par Anki), `tests/unit/export-apkg.test.ts` › « exports occlusion notes… », e2e `tests/e2e/occlusion.spec.ts` (pointeur, clavier seul, regroupement, Ctrl+Entrée, P1, réponse lisible, mode « une zone »).
- [x] Export `.apkg` legacy : `tests/unit/export-apkg.test.ts` (SQL brut, aller-retour avec et sans historique, FSRS et Memory Box, heure d'été, occlusion), `tests/unit/db/export-apkg.test.ts`, e2e `tests/e2e/export-apkg.spec.ts` (export puis réimport) ; moteur d'Anki 26.9.3 : `tests/interop/README.md` (verdict OK, occlusion comprise).
- [x] KaTeX pour les formules : `tests/unit/domain/math.test.ts`, `tests/unit/katex.test.ts`, `tests/unit/domain/typed.test.ts`, e2e `tests/e2e/math.spec.ts` (éditeur, révision, formule invalide, formule large sans défilement de la page, hors ligne).
- [x] `npm run verify` vert : check 0 erreur 0 avertissement, lint, format, 308 tests unitaires (seuils de couverture tenus : scheduler, queue, import), build (bundle initial 166 Ko gzip, KaTeX 78 Ko et WASM hors bundle, précachés), E2E (bureau et mobile).

Versions installées en M6 : `katex` 0.18.9 (ADR-009), `fsrs-browser` 6.6.0 épinglé exactement (prévu par l'ADR-007, BSD-3-Clause).


### M5 — Statistiques, finitions, V0 (2026-09-25)

Plan suivi :

1. `src/lib/stats/index.ts` (pur, `now` en paramètre) + tests : aujourd'hui, prévision 30 j, rétention réelle 7/30/90 j, rétention cible, heatmap 365 j, répartitions par état et par compartiment.
2. `loadStatsData` (`src/lib/db/study.ts`) : paquets, cartes et un an de journal, filtrés par paquet (sous-paquets inclus), compteurs du jour issus de la file réelle.
3. Graphiques SVG maison `src/lib/ui/charts/` (ColumnChart, Heatmap, BarList) suivant le skill dataviz : barres ≤ 24 px à sommet arrondi, grille fine, info-bulle, clavier, vue tableau ; rampe séquentielle validée par le script du skill en clair et en sombre.
4. Écran `Stats.svelte` (filtre par paquet dans l'URL).
5. Passe accessibilité : audit axe-core et Lighthouse ponctuels, cibles 44 px, `prefers-reduced-motion`, focus visible ; E2E clavier.
6. Hors ligne : E2E 6 (chargement, révision, création sans réseau ; worker Anki et WASM précachés) et vérification du build sous `/recto/`.
7. Performance : test Vitest existant (file de 20 000 cartes) + mesure E2E dans Chromium ; taille du bundle.
8. `.github/workflows/pages.yml`, README utilisateur, STATUS, CHANGELOG.

Critères :

- [x] Écran Statistiques (SPEC §5.6) : compteurs, prévision 30 j, rétention réelle 7/30/90 j vs cible, heatmap, répartition par état et par compartiment, filtre par paquet ; SVG maison, clair/sombre (`tests/unit/stats.test.ts`, `tests/unit/db/study.test.ts` › loadStatsData, e2e « the statistics screen reflects today's reviews »).
- [x] Accessibilité : Lighthouse Accessibilité **100** (et Bonnes pratiques 100) sur Accueil, Ajouter, Cartes, Importer, Statistiques, Paramètres ; axe-core (règles WCAG 2.1 AA, dont le contraste) : **0 violation** sur 11 écrans × clair/sombre × ordinateur/mobile ; toutes les cibles interactives ≥ 44 px (script de mesure) ; `prefers-reduced-motion` et anneau de focus (e2e `a11y-perf.spec.ts`) ; révision complète au clavier seul (même fichier).
- [x] Performance : file du jour de 20 000 cartes calculée en < 200 ms (`tests/unit/queue/build.test.ts` › « 20 000 cards ») ; dans Chromium, première carte affichée 0,4 à 0,9 s après la navigation avec 20 000 cartes en base (e2e, seuil 2 s) ; bundle initial **≈ 158 Ko gzip** (JS 151,5 + CSS 5,5 + HTML 0,4 ; lecteur Anki et WASM chargés à la demande).
- [x] Hors ligne : E2E 6 (`tests/e2e/offline-stats.spec.ts`) ; test manuel Android décrit ci-dessous (« À vérifier »).
- [x] Déploiement : `.github/workflows/pages.yml` (check + tests unitaires, build `BASE_PATH=/recto/`, publication) ; build `/recto/` vérifié localement (service worker à la portée `/recto/`, révision hors ligne). URL notée dans le README : <https://nicolasvergnes.github.io/recto/> — **effective après activation de Pages et fusion sur `main`** (voir « À vérifier »).
- [x] README utilisateur (Android, sauvegarde, import Anki et CSV, commandes) ; STATUS marqué « V0 livrée ».

### M4 — Import `.apkg` (2026-09-25)

Plan suivi :

1. `src/lib/import/apkg-read.ts` : dézippage (fflate), détection `anki21b` → `Anki21bUnsupported`, lecture SQLite (sql.js passé en paramètre), `revlog` optionnelle, table `media` JSON.
2. `src/lib/import/apkg.ts` : conversion (paquets et hiérarchie, modèles, notes, `sourceGuid`, états des cartes, suspension, médias et collisions de noms, rapport), rejeu de l'historique.
3. `src/lib/import/apkg.worker.ts` + `src/lib/ui/import/apkg-client.ts` : lecture dans un Web Worker, sql.js et son `.wasm` chargés à la demande et précachés ; réduction des images > 1 280 px.
4. Section « Paquet Anki » de l'écran Importer : analyse, options (paquets Anki ou un seul paquet, historique, planificateur), progression, rapport.
5. Tests : fixture, refus `anki21b`, robustesse (zip corrompu, base sans `revlog`, `media` absent ou binaire, JSON de modèles irrégulier), paquet synthétique de 5 000 notes / 10 000 cartes ; E2E 4.

Critères :

- [x] Lecture `anki21`/`anki2` dans un worker (`sql.js`), refus `anki21b` avec message (e2e « refuses the anki21b format… », `tests/unit/import/apkg.test.ts`), médias, hiérarchie, modèles convertis, rapport (05 §2).
- [x] Option « importer l'historique » : rejeu FSRS ou Leitner (`tests/unit/import/apkg.test.ts` › « replays the review log with FSRS », « …with the Leitner scheduler »).
- [x] Fixture `sample-legacy.apkg` importée en test (comptes, états, carte suspendue, média `lune.png` de 410 octets avec sha256 calculé) ; paquet de ≥ 1 000 cartes : **synthétique** en test automatique (`tests/unit/import/apkg-large.test.ts`, 10 000 cartes avec historique, lots de 500). L'import d'un vrai paquet AnkiWeb reste à faire à la main (voir « À vérifier »).
- [x] E2E 4 (`tests/e2e/apkg.spec.ts`).

### M3 — Import CSV et sauvegarde (2026-09-25)

Plan suivi :

1. `src/lib/import/plan.ts` (plan et rapport communs), `import/decks.ts` (`Parent::Enfant`), `splitDeckPath`.
2. `src/lib/import/csv.ts` + `tests/unit/import/csv.test.ts` (fixtures `data/samples/*.csv`).
3. `src/lib/db/importer.ts` (lots de 500, transactions, progression, annulation) + `tests/unit/db/importer.test.ts`.
4. `src/lib/export/csv.ts` + `tests/unit/export-csv.test.ts` (aller-retour).
5. `src/lib/import/{backup,validate}.ts`, `src/lib/db/restore.ts` + `tests/unit/import/{backup,validate}.test.ts` (propriété sur 5 graines).
6. Écran Importer (CSV, sauvegarde), paquet d'exemple et rappel de sauvegarde sur l'accueil, export CSV (paquet, sélection).
7. E2E 3 et 5 (`tests/e2e/import-backup.spec.ts`).

Critères :

- [x] Import CSV/TSV complet (05 §1) : séparateur détecté, BOM, CRLF, en-tête, mappage modifiable, type auto `cloze` / `basic_reverse` au choix / colonne `Type`, colonne `Paquet` avec sous-paquet, doublons ignorer / mettre à jour / dupliquer, rapport par ligne, médias manquants listés puis ajoutables sous leur nom, images distantes signalées et jamais chargées, 50 000 lignes max, lots de 500 annulables (`tests/unit/import/csv.test.ts`, `tests/unit/db/importer.test.ts`, e2e « CSV import screen… ») ; paquet d'exemple depuis l'accueil (e2e « the sample deck imports 101 cards… »).
- [x] Export CSV (`;` ou tabulation, BOM, colonnes Recto/Verso/Extra/Tags/Paquet/Type) depuis un paquet ou la sélection du navigateur ; sauvegarde `.recto.zip` complète et restauration « remplacer » (une transaction, sauvegarde des données actuelles téléchargée avant) ou « fusionner » ; rappel après 7 jours sur l'accueil ; partage natif sur mobile si disponible (`shareOrDownload`).
- [x] Test de propriété aller-retour sauvegarde (`tests/unit/import/backup.test.ts` › « restores seed … bit for bit », 5 collections aléatoires, médias comparés octet par octet).
- [x] E2E 3 et 5 (`tests/e2e/import-backup.spec.ts`).

### M2 — Planificateurs et révision (2026-09-25)

Plan suivi :

1. `src/lib/scheduler/day.ts` (journée d'étude à 04:00, heure locale, heure d'été) + tests en Europe/Paris.
2. `scheduler/leitner.ts` (deux modes, table `isBoxDue`, alternance, C7) + tests, puis `scheduler/fsrs.ts` (adaptateur ts-fsrs, fuzz désactivé en test) + tests ; `retire.ts` (P7), `convert.ts` (03 §4), `index.ts`.
3. `src/lib/queue/{build,session,random}.ts` + tests (plafonds, entrelacement, sœurs, tri par R, 04:00, heure d'été, 20 000 cartes).
4. `src/lib/db/study.ts` : `recordReview` atomique, `undoReview`, `loadTodayQueue`, `setRetired`, `switchScheduler` + tests.
5. Écran Révision, accueil (« Réviser aujourd'hui », compteurs par paquet), paramètres de paquet (planificateur, plafonds, rétention + charge estimée, mode Leitner), réglages globaux.
6. E2E 2 + e2e Leitner, réponse tapée, modification en cours de séance.

Critères :

- [x] `scheduler/fsrs.ts` et `scheduler/leitner.ts` conformes à 03 (`tests/unit/scheduler/*.test.ts` : transitions, deux modes, `isBoxDue` sur deux ans, alternance, C7, conversions Card ↔ ts-fsrs, preview = answer, paramètres invalides rejetés) ; couverture scheduler 98 % lignes / 94 % branches, queue 100 % / 97 %.
- [x] `queue/` conforme à 03 §5 (`tests/unit/queue/build.test.ts`, `session.test.ts`).
- [x] Écran Révision complet : réponse absente du DOM avant la demande (e2e « review: reveal, rate, undo and rate again »), réponse tapée (e2e « typed answers… »), boutons avec prévisualisation (« 10 min », « → C2 · dans 2 j »), raccourcis 1–4, Espace, Ctrl+Z, E, R, annuler, modifier puis reprendre la séance, suspendre, retirer (P7, bouton désactivé avec explication), drapeau, infos, résumé de fin, rappel du sommeil une fois par jour, jour à 04:00.
- [x] Accueil : compteurs du jour et « Réviser aujourd'hui » toutes cartes confondues, avant la liste des paquets (P5).
- [x] Paramètres de paquet : planificateur, plafonds, ordre, réponse tapée, audio, enterrement des sœurs, rétention 0,80–0,97 avec texte d'aide et charge estimée (P9), pas, 4/2 boutons, mode Leitner, intervalles, alternance, « Sûr » ; changement de planificateur converti en une transaction après téléchargement d'une sauvegarde (`tests/unit/db/study.test.ts` › « converts Leitner → FSRS… »).
- [x] E2E 2 (`tests/e2e/review.spec.ts`).

### M1 — Données et création de cartes (2026-09-25)

Plan suivi :

1. Domaine pur : `src/lib/domain/{types,defaults,notes,cloze,text,decks,browse}.ts` + tests `tests/unit/domain/*`.
2. Dexie : `src/lib/db/{schema,repo,settings,errors,storage,live.svelte}.ts` + tests des invariants (`tests/unit/db/repo.test.ts`), de la migration factice (`tests/unit/db/migration.test.ts`) et des réglages.
3. Médias : `src/lib/media/{mime,hash,resize,store,url,audio}.ts`, `src/lib/sanitize.ts` + tests (`tests/unit/media.test.ts`, `tests/unit/sanitize.test.ts`).
4. Infrastructure UI : dialogue natif, confirmations, notifications, `CardContent` (HTML assaini + médias IndexedDB), liste virtualisée.
5. Écrans : Accueil (paquets), Paquet, Éditeur, Navigateur de cartes, Paramètres.
6. Sauvegarde complète `.recto.zip` (export) utilisée avant toute suppression de paquet et avant « Tout effacer ».
7. E2E 1 + e2e médias, assainissement, virtualisation, stockage.

Critères :

- [x] Schéma Dexie V1, `repo.ts`, invariants 1 à 3 et 5 testés (`tests/unit/db/repo.test.ts`, `tests/unit/media.test.ts` › « lists orphan and missing media ») ; migration factice V1→V2 dans le test uniquement (`tests/unit/db/migration.test.ts`, sous-classe locale `RectoDBv2`). Invariants 4, 6, 7 : M2 (file et planificateurs).
- [x] Écran Paquet : créer, renommer, déplacer, fusionner, supprimer avec sauvegarde téléchargée juste avant (`src/routes/Deck.svelte`) ; Éditeur : 3 types, aperçu, avertissements P8, doublons, Ctrl+Entrée (`tests/e2e/create-notes.spec.ts`) ; Navigateur : filtres, tri, sélection, actions groupées, virtualisation (`tests/e2e/media-and-browser.spec.ts` › « the card browser is virtualised with 5 000 cards » : moins de 80 lignes dans le DOM pour 5 000 cartes).
- [x] Médias : image par fichier/collage/glisser-déposer, redimensionnement à 1 280 px (`tests/e2e/media-and-browser.spec.ts` › « images are resized to 1280 px… »), texte alternatif, audio par fichier ou micro (MediaRecorder), stockage Dexie, rendu assaini (`tests/unit/sanitize.test.ts`, e2e « field HTML is sanitised and remote images are never fetched »), URL objets révoquées (cache LRU de 50, `tests/unit/media.test.ts` › « media object URLs »).
- [x] Persistance demandée après la première carte (`requestPersistenceOnce`) ; Paramètres avec état du stockage (e2e « settings show the storage state after the first card »).
- [x] E2E 1 (`tests/e2e/create-notes.spec.ts` › « create a deck and three notes, then see five cards »).

### M0 — Squelette et outillage (2026-09-25)

Plan suivi :

1. `package.json`, configurations (`tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`, `playwright.config.ts`), `npm install`.
2. Structure de SPEC §7 avec `index.ts` documentés.
3. `fr.ts` + `t()` typé + test.
4. `app.css` (tokens), routeur hash, `App.svelte`, écrans vides.
5. PWA : logo, icônes, `vite-plugin-pwa`, bandeau de mise à jour.
6. Tests unitaires et e2e.
7. CI.
8. `verify` vert, CHANGELOG, STATUS, commit.

Critères :

- [x] Projet Vite Svelte + TS, dépendances des ADR installées, `npm run verify` vert (test unitaire `tests/unit/i18n.test.ts`, e2e `tests/e2e/smoke.spec.ts` › « the home page is displayed »).
- [x] Structure de SPEC §7 avec `index.ts` documentés (`src/lib/*/index.ts`).
- [x] `app.css` avec tokens clair/sombre ; `App.svelte` avec navigation et écrans nommés (`tests/e2e/smoke.spec.ts` › « the hash router shows each screen »).
- [x] PWA installable : `tests/e2e/pwa.spec.ts` › « the web app manifest is served with name and icons » et « the service worker becomes ready and the app loads offline ».
- [x] `fr.ts` + `t()` typé (clé inconnue = erreur `svelte-check`/`tsc`, type `MessageKey`).
- [x] `.github/workflows/ci.yml` : `npm ci`, installation de Chromium, `npm run verify`.

Versions réellement installées (vs ADR-007) : svelte 5.57.1, vite 8.3.1, @sveltejs/vite-plugin-svelte 7.3.1, **typescript 6.0.3** (écart, voir ci-dessous), dexie 4.4.6, ts-fsrs 5.4.2, vite-plugin-pwa 1.3.0, workbox-window 7.4.1, sql.js 1.14.2, fflate 0.8.3, papaparse 5.7.0, dompurify 3.4.16, vitest 5.0.1, @playwright/test 1.63.0, eslint 10.11.0, prettier 3.9.9, prettier-plugin-svelte 4.1.1, svelte-check 4.7.6, fake-indexeddb 6.2.5, happy-dom 20.14.5, @vite-pwa/assets-generator 1.0.4.

## Reste à faire / dettes

- V2, en attente (« Jalon en cours ») : synchronisation automatique PC ↔ Android et application Android (Capacitor). Les suppressions sont déjà enregistrées et suivies par la fusion de sauvegardes (M12) : seul le transport automatique manque.
- Composants de plus de 200 lignes restants : `Heatmap.svelte` (271), `ApkgImport.svelte` (264), `ColumnChart.svelte` (210), `CardMosaic.svelte` (203), `Editor.svelte` (202). `Cards.svelte` est repassé sous 200 lignes en M17 (193). Une copie de travail M10 a commencé l'extraction de la navigation clavier commune des deux graphiques : branche locale `wip/chart-keys` (`src/lib/ui/charts/keys.ts` et son test, non intégrés).
- Optimiseur : évaluation sur les révisions mêmes de l'entraînement (pas de validation croisée, comme Anki) ; il fonctionne dans Firefox (M10) ; Safari non testé (le WebKit de Playwright refuse les `Blob` dans IndexedDB).
- Les filtres avancés d'Anki (`furigana:`, `tts:`…) rendent la valeur brute ; `[latex]…[/latex]` reste en source (LaTeX en mode texte, que KaTeX ne rend pas).
- Réimport Anki : un type dont on a réordonné ou modifié les champs dans Recto n'est plus reconnu (ses notes sont ignorées et comptées) ; un type dont Anki a changé les champs aussi. L'export rend le style d'un type importé, pas les options de ses champs (police, taille).
- CSV : l'export laisse de côté les notes des types personnalisés (pas de colonnes communes), alors que l'import sait désormais en créer.
- E2E : Firefox et WebKit côte à côte se figent parfois quelques secondes (projets à 15 s d'attente) ; `export-apkg.spec.ts` (mobile) avait dépassé une fois son délai en M9, pas revu en M10.
- Couverture globale ≈ 92 % des lignes (seuils de 90 % appliqués au domaine : scheduler, queue, import) ; `db/`, `export/` et `domain/` couverts sans seuil.

## Décisions prises en session

- 2026-10-14 (M17) : un format désigne un modèle par son **indice** (`<noteTypeId>:<i>`) ; l'éditeur de types réécrit les clés des paquets dans la même transaction (déplacé : suit ; retiré ou changé de type : perdu). Alternative écartée : un identifiant stable par modèle (migration de tous les types, identifiants différents d'un appareil à l'autre pour la fusion).
- 2026-10-14 (M17) : la pause et l'ordre valent pour les cartes **du paquet lui-même** (un sous-paquet a ses réglages, comme `newPerDay`) ; à l'import, ils s'appliquent à tous les paquets créés ou remplis. Un réimport ajoute des pauses, n'en retire jamais.
- 2026-10-14 (M17) : la section n'apparaît qu'à partir de deux formats (un seul : « Nouvelles cartes par jour » suffit) ; le libellé du type de carte classique d'une note Basique devient « Basique · classique » (aussi dans le rapport d'analyse d'un paquet Anki).
- 2026-10-14 (M17) : `ApkgImport.svelte` passe de 249 à 264 lignes (dette déjà là : choix des formats sorti dans `ApkgFormats.svelte`, mais pas encore le reste).

- 2026-10-14 (fusion M13 + M14 + M16 sur `main`, demandée par Nicolas) : `twoWay` réservé aux cartes classiques (une carte à trous ou d'occlusion n'a pas de faces) ; `twoWay` lu dans la sauvegarde au schéma 6 avec les types de cartes, le schéma 5 étant celui de M13 (le schéma 5 « M16 » n'a jamais été publié) ; le compte des jumelles de M16 disparaît avec `areTwins` (M13) ; l'E2E « a card asked both ways » rendu indépendant de l'ordre de révision (M13). `npm run verify` vert après fusion : 571 tests unitaires (couverture 92,2 % des lignes), E2E 113 réussis et 1 ignoré.
- 2026-10-14 (M14) : les notes intégrées gardent leur `modelType` stocké (`basic`, `cloze`, `image_occlusion`), lu comme « Basique + type de carte » : aucune note des testeurs n'est réécrite. Alternative écartée : un champ `cardKind` sur des notes `basic` (migration de toutes les notes, des sauvegardes et de l'import pour un nom).
- 2026-10-14 (M14) : `ord` d'une carte personnalisée = indice du modèle + 1000 × (trou ou groupe − 1) ; les cartes existantes ont un sous-indice nul et ne changent pas. Alternative écartée : un champ `Card.template` (migration de toutes les cartes personnalisées, de la fusion et de l'export).
- 2026-10-14 (M14) : masques d'un type personnalisé dans `note.masks`, aligné sur les champs (un champ image partagé par deux occlusions partage ses masques). Alternative écartée : un champ caché par occlusion dans le type.
- 2026-10-14 (M14) : Dexie version 5 sans `upgrade()` et sauvegarde `schemaVersion` 6 sans transformation (propriétés facultatives) ; les numéros servent de verrou contre une ancienne copie de l'application qui réconcilierait les cartes à trous d'un type comme classiques (et les supprimerait).
- 2026-10-14 (M14) : changer le type d'une carte (ou le champ source d'une carte à trous ou d'occlusion) remplace ses cartes, journal conservé ; revenir au type d'origine avant d'enregistrer ne change rien. Cocher « Génère une seule carte » garde la carte du premier trou ou groupe.
- 2026-10-14 (M14) : le type et le type de carte d'une note existante restent verrouillés dans l'éditeur, comme avant ; « Génère une seule carte » reste modifiable.
- 2026-10-14 (M14) : « Créer un trou » sans champ à trous affiche « Pour créer un trou, choisissez le type de carte « Texte à trous » » ; avec un champ à trous, il agit dans le dernier champ à trous actif, sinon dans le premier.

- 2026-10-14 (M13) : retards mélangés, mais quand le plafond de révisions coupe, les retards gardés restent ceux de plus faible récupérabilité (FSRS) ou de plus petit compartiment (Leitner) : P6 tenu, seul l'ordre de présentation est tiré au hasard. Alternative écartée : tirer au hasard aussi la sélection (on pourrait laisser de côté la carte la plus fragile).
- 2026-10-14 (M13) : plus d'enterrement ni d'espacement des cartes d'une note (choix de Nicolas, il revoit le modèle « Departements ») ; renverse M9 (jumelles) et l'espacement de 10 positions (03 §5.6). Les trous d'un texte à trous et les zones d'une occlusion peuvent donc passer le même jour.
- 2026-10-14 (M13) : la migration passe tous les paquets en `newOrder: 'random'` sans changer leur `updatedAt` : chaque appareil et chaque sauvegarde migrent de même, une fusion ne voit pas de différence. Alternative écartée : dater le paquet à la migration (une ancienne sauvegarde ne pourrait plus faire gagner un réglage modifié après).
- 2026-10-14 (M13) : les jalons Android, Play Store et synchronisation perdent leurs numéros M13–M15 (en attente sans date) ; M13 est ce jalon-ci.
- 2026-10-14 (M16) : une carte « A ↔ B » d'un type personnalisé est **une seule carte** à deux faces (demande de Nicolas : pas deux cartes A → B et B → A). Option par modèle de carte (`twoWay`), pas par note ni par paquet : c'est la définition de la carte. Ses deux faces s'écrivent seules (`back` = face 2, sans `{{FrontSide}}`), comme Recto/Verso d'une note basique ; alternative écartée : garder la réponse d'Anki et en déduire la face 2 au rendu (fragile). Le sens suit le réglage « Interroger dans les deux sens » du paquet et `sideFlipped`, déjà basculé par les deux planificateurs pour toutes les cartes : rien ne change dans `scheduler/`. La carte existe si ses deux faces passent la règle d'Anki (chacune sera une question). Jumelles : une carte à deux sens demande et révèle les champs de ses deux faces.
- 2026-10-14 (M16) : **pas de version Dexie** pour `twoWay` (champ facultatif, aucun index, rien à transformer : absent = sens unique, comme avant) ; `SCHEMA_VERSION` 5 sur sa branche (6 après la fusion avec M13 et M14) pour qu'une version plus ancienne refuse une sauvegarde qui en contient au lieu de poser ces cartes dans un seul sens. Tests : base et sauvegarde d'avant M16 lues telles quelles. Alternative écartée : une `version(4)` Dexie vide, sans rien à migrer.
- 2026-10-14 (M16) : export `.apkg` d'un modèle à deux sens = carte à sens unique pour Anki (`afmt` = `{{FrontSide}}<hr id=answer>` + face 2) avec la marque `"rectoTwoWay": true` dans le JSON du modèle, relue par l'import de Recto (aller-retour sans perte) ; le plugin écrit la même marque. Anki ignore les clés inconnues des modèles (à vérifier à la main avec le moteur d'Anki, voir plus bas).
- 2026-10-13 : création de paquets avec l'IA **hors de l'application**, par un plugin Claude autonome (`tools/deck-builder/`, zip `recto-deck-builder.zip`, `npm run plugin:zip`). La spec §2 (« génération de cartes par IA ») et §6 (aucune requête réseau) restent intactes : Recto n'appelle aucune API. Le plugin livre des **`.apkg`** (première version en CSV abandonnée le même jour : le CSV ne porte ni types de notes ni médias, Nicolas veut des paquets clé en main), écrits par une bibliothèque Python sans dépendance (`recto_apkg.py`) qui reprend la forme de l'export `.apkg` de Recto (types intégrés aux identifiants de 05 §4) et vérifie un paquet selon les règles de l'importeur (05 §2.3). Choix : une question à sens unique devient un type personnalisé « Recto · Question » à 4 champs (identifiant fixe 1758758400005), car `oneWay` ne voyage pas dans un `.apkg` et un type de 3 champs au plus serait converti en note basique, posée dans les deux sens ; un type personnalisé a un identifiant dérivé de son nom, pour qu'une réimportation d'un paquet régénéré le retrouve. `tests/unit/deck-builder-plugin.test.ts` lance Python 3 (préinstallé sur le runner de la CI ; `python3` ou `python`) et fait lire ses paquets par l'importeur de Recto : un changement de l'import `.apkg` qui casserait le plugin fait échouer le test. Vérifié dans l'application (Playwright) avec le paquet Départements de Nicolas : 101 notes, 505 cartes, 101 cartes de France.

- 2026-10-12 : Nicolas garde **la PWA installable** pour l'instant ; la publication sur le Play Store viendra plus tard. M13 (Capacitor) et M14 (publication) sont suspendus, l'`appId` n'a pas à être décidé maintenant. M15 (synchronisation automatique PC ↔ Android) est également en attente : Nicolas teste la PWA telle quelle, fait des évolutions, et en reparlera plus tard. Entre appareils, la sauvegarde `.recto.zip` + « Fusionner » (M12) fait office de synchronisation manuelle.
- 2026-10-12 (M12) : V2 = application Android avec **Capacitor** (choix de Nicolas, pour permettre plus tard une synchronisation automatique par dossier sur le téléphone, impossible depuis la PWA : pas de File System Access API dans Chrome Android) ; découpage M12 (données), M13 (application), M14 (publication), M15 (transport de la synchronisation).
- 2026-10-12 (M12) : traces de suppression par ligne, jamais purgées pour l'instant (quelques dizaines d'octets par ligne ; une purge demandera une date au-delà de laquelle une sauvegarde plus ancienne n'est plus fusionnable). Règle : une suppression l'emporte sur une ligne dont la dernière modification est antérieure ou égale ; « Tout effacer » efface aussi les traces (l'appareil repart de zéro).
- 2026-10-12 (M12) : cartes fusionnées en entier par `updatedAt` (alternative écartée : planification de la copie la plus récemment révisée et drapeaux de la plus récemment modifiée ; elle annulait une réinitialisation faite sur un seul appareil). Limite assumée : une suspension faite sur A après une réponse donnée sur B remet la planification d'avant la réponse ; la réponse reste au journal.
- 2026-10-12 (M12) : journal (P10) : une révision n'est supprimée par une fusion que si un appareil l'a supprimée en la connaissant (annulation, note supprimée) ; une réponse donnée à une note que l'autre appareil supprimait sans la connaître reste dans le journal des deux. Alternative écartée : supprimer les révisions des cartes d'une note supprimée ; les deux appareils ne connaissent pas forcément les mêmes cartes d'une note (une carte retirée d'un côté), et les journaux divergeaient selon l'ordre des fusions (trouvé par le test de propriété).
- 2026-10-12 (M12) : un paquet ou un type de note supprimé d'un côté mais encore utilisé par une note de l'autre est gardé, daté de la fusion, et sa trace oubliée (sinon la fusion suivante le supprimerait ailleurs, notes orphelines) ; un média supprimé mais encore affiché par une note est gardé de même.
- 2026-10-12 (M12) : `lastBackupAt` reste écrit par `createBackup` : son écriture après un enregistrement réussi demande de savoir si le fichier a été enregistré, ce que M13 apporte (`saveFile`).
- 2026-10-11 (M11) : sens des cartes réglé par paquet (`alternateSides`, sorti de `leitner`, défaut `true` pour FSRS comme Memory Box) avec une exception par note (`oneWay`, notes basiques seulement) ; les textes à trous, masques et types personnalisés gardent le sens de leurs modèles (un type personnalisé définit ses sens par ses modèles). Avec FSRS, les deux sens partagent un état mémoire : prix accepté d'une seule carte. Aucune migration (phase de test, choix de Nicolas) : une note `basic_reverse` d'une ancienne base ou sauvegarde n'est plus lue ; l'ancienne clé `leitner.alternateSides` est ignorée (défaut).
- 2026-10-11 (M11) : export Anki d'une note posée dans les deux sens en « Recto · Basique » (une carte), **et non** en « Basique et inversée » comme prévu au plan : le réglage étant activé par défaut, toutes les notes basiques auraient changé de type dans Anki d'un export à l'autre, ce que l'import d'Anki gère mal (copie « + » ou type remplacé, vu en M10). Anki ne sait pas retourner une carte : dans Anki, la note n'est posée que Recto → Verso.
- 2026-10-11 (M11) : retirer un champ cité par un modèle est refusé (message nommant les cartes) plutôt que de réécrire les modèles ; tout modèle citant un champ absent invalide le type (garde-fou aussi pour les renommages), sauf les champs spéciaux d'Anki. Retirer un champ rempli mais non cité est permis, après confirmation chiffrée.
- 2026-10-11 (M11) : libellé « Ne jamais retourner cette note » (et non « Toujours dans ce sens (recto → verso) », qui aurait aussi répondu au libellé « Recto » des champs pour les lecteurs d'écran et les tests).
- 2026-10-10 (M10) : périmètre de la session autonome = la dette de « Reste à faire » sans décision produit ; la V2 attend la confirmation de Nicolas (empaquetage : comptes et clés de signature). Branche créée depuis `m9-review-tweaks`.
- 2026-10-10 (M10) : une seule fonction pure `reconcileCards` (`domain/notes.ts`) décide des cartes gardées, créées et supprimées d'une note pour l'éditeur, le réimport, la fusion et le CSV ; à `ord` égal, la carte la plus récemment révisée reste. Le plan d'import porte `removedCards`, écrits avec la note dans la transaction de son lot.
- 2026-10-10 (M10) : fusion de sauvegarde, `ord` manquant : la carte de la sauvegarde est adoptée (remappée sur la note locale si celle-ci a été trouvée par guid Anki), avec ses révisions (P10), plutôt qu'une carte neuve ; un contenu qui ne produit aucune carte laisse les cartes telles quelles.
- 2026-10-10 (M10) : CSV vers un type personnalisé : le type choisi vaut pour toutes les lignes (pas de colonne Type) ; « mettre à jour » remplace les champs qui ont une colonne et garde les autres (une mise à jour qui viderait les champs absents du fichier serait destructrice), les tags sont remplacés comme pour les types intégrés ; nouvelle erreur « aucune carte ».
- 2026-10-10 (M10) : style des types Anki gardé dans un champ facultatif `NoteType.anki` (CSS, préambules LaTeX, champ de tri), jamais appliqué par Recto, rendu par l'export ; date du type = `mod` du modèle Anki. Alternatives écartées : garder seulement la date (un type modifié dans Recto aurait encore écrasé le style), stocker le modèle Anki brut (fusion délicate avec les champs modifiés). Pas de version Dexie ni de `schemaVersion`.
- 2026-10-10 (M10) : la demande de persistance n'est plus attendue par l'éditeur et est notée avant sa réponse (`persistGranted = false`, puis la réponse) : demandée une seule fois même si Firefox ne répond jamais.
- 2026-10-10 (M10) : projets Playwright `firefox` et `webkit` définis dans la configuration mais hors `verify` et hors CI (`npm run e2e` cible `desktop` et `mobile`) ; `npm run e2e:firefox` ; WebKit seulement à la main, ses échecs connus venant du portage de Playwright.
- 2026-10-10 (M10) : éditeur de types, boutons « Monter » / « Descendre » en flèche avec libellé masqué, comme « Retirer » : le jeu d'icônes est à son maximum de 20.

- 2026-10-10 (M9) : deux cartes sont **jumelles** quand la question de chacune montre ce que l'autre demande. Type personnalisé : la question de A contient un champ que la réponse de B ajoute (champs du verso absents du recto) et réciproquement. Trous et occlusion restent toujours jumeaux (chaque question montre les réponses des autres ; en occlusion « tout cacher » c'est moins vrai, mais la règle reste simple et prudente). Alternative écartée : une liste de paires à cocher dans l'éditeur de types (plus de réglages, rien d'automatique à l'import).
- 2026-10-10 (M9) : le réglage `burySiblings` garde son nom et sa valeur par défaut (`true`) mais n'enterre plus que les jumelles ; désactivé, toutes les sœurs restent, espacées. Pas de migration : les paquets existants passent d'eux-mêmes au nouveau comportement. Alternative écartée : un choix à trois valeurs (aucune / jumelles / toutes).
- 2026-10-10 (M9) : `leitner.mode` des paquets déjà enregistrés n'est pas effacé de la base (champ ignoré, pas de version Dexie 3) ; la relecture d'une sauvegarde le laisse tomber.
- 2026-10-10 (M9) : note sans fiche trouvée au chargement de la file : ses cartes sont traitées comme jumelles (comportement d'avant M9).

- 2026-09-29 (M7) : un seul contrôle « Affichage » à trois positions (Liste, Mosaïque, Mosaïque recto-verso) plutôt que deux niveaux ; `browserView` mémorisé en silence (comme `lastDeckId`), `flipStyle` réglé dans Paramètres › Affichage, défaut « Rotation horizontale » (choix de Nicolas). Deux clés `settings` de plus, sans changement de `schemaVersion` (la sauvegarde exporte les lignes telles quelles).
- 2026-09-29 (M7) : la mosaïque réutilise `VirtualList` avec des lignes de N tuiles de hauteur fixe (15 rem ; 21 rem pour une tuile recto-verso seule sur sa ligne, faces empilées), N calculé depuis la largeur du conteneur (`columnsFor`, largeur minimale 18 rem / 26 rem) ; `overscan` 1 ligne pour rester sous les 50 URL d'objets du cache média. `VirtualList` reçoit un rôle ARIA (`list` hors tableau : un `rowgroup` sans `table` est invalide). Alternative écartée : grille CSS avec `content-visibility` (5 000 `CardContent` montés).
- 2026-09-29 (M7) : le verso d'une tuile n'est monté qu'au premier retournement (moitié moins de `CardContent` à l'écran), puis reste monté pour l'animation de retour ; les identifiants retournés vivent dans `CardMosaic` pour survivre à la virtualisation ; la face cachée est `inert`. Le clic sur la face retourne la tuile sauf sur un bouton ou un lien interne (sons) ; le contrôle accessible est le bouton « Retourner » (`aria-pressed`).
- 2026-09-29 (M7) : le navigateur montre les faces canoniques (`renderCard` sans inversion Leitner), comme le tableau ; en mosaïque, le tri se règle par deux listes (« Trier par », « Ordre ») pilotant l'état de tri partagé avec le tableau (choix de Nicolas).
- 2026-09-29 (M7) : retournement en CSS pur (`data-flip-style`, 400 ms) ; la règle globale `prefers-reduced-motion` de `app.css` annule la transition, donc pas de helper `motionOk()`.

- 2026-09-25 (M6) : périmètre V1 = SPEC §8 et §5.2 (optimiseur, occlusion, export `.apkg`, KaTeX) ; synchronisation et empaquetage Android en V2 (voir « Écarts »).
- 2026-09-25 (M6, occlusion) : quatre champs `[image, masques JSON, en-tête, extra]` (02 §2.1) ; coordonnées normalisées arrondies à 4 décimales, côté minimal 0,5 % ; **une carte par groupe** `n` (sémantique `cN` d'Anki, `ord = n − 1`) : chaque nouveau masque ouvre un groupe (une carte par masque par défaut), « Carte n° » permet d'en réunir plusieurs ; `n` n'est jamais renuméroté et un nouveau masque ne reprend jamais un groupe de la note telle qu'ouverte (sinon une nouvelle zone hériterait de l'échéance d'une carte existante). Alternative écartée : index = position du masque (supprimer un masque changerait l'identité des cartes suivantes).
- 2026-09-25 (M6, occlusion) : mode « tout cacher, deviner une zone » par défaut (Anki `oi=1`) ; couleurs fixes d'Anki (les masques sont sur l'image, quel que soit le thème), cible distinguée aussi par un contour plus épais sur un halo blanc (lisible sur image sombre).
- 2026-09-25 (M6, occlusion) : P1 — les réponses des masques ne sont pas dans le DOM avant la demande ; les pixels sous les masques le sont (image entière, comme Anki).
- 2026-09-25 (M6, occlusion) : réponses de masque (texte simple, extension propre à Recto) : affichées après la demande, attendues en réponse tapée ; exportées vers Anki dans « Comments » (une ligne `n : réponse` par groupe) et relues au réimport (premier masque du groupe) ; tout autre contenu de Comments rejoint l'extra.
- 2026-09-25 (M6, occlusion) : import Anki : type détecté par son modèle (`image-occlusion` dans la question), champs par position ; ellipses et polygones → rectangle englobant ; formes **tournées ignorées** (la rotation se fait en pixels, le rapport d'aspect de l'image est inconnu : aucun rectangle normalisé n'est sûr de couvrir la zone, P1), comme les formes texte et en pixels ; comptes dans le rapport pour les notes écrites.
- 2026-09-25 (M6, occlusion) : pas d'avertissement de doublon pour l'occlusion (plusieurs notes sur une même image sont légitimes) ; une ligne CSV n'est jamais doublon d'une occlusion ; l'export CSV les laisse de côté et le dit (aucun fichier si le choix n'en contient que) ; type verrouillé à l'édition (comme le texte à trous) ; changer de type à la création garde recto/en-tête, verso et extra.
- 2026-09-25 (M6, occlusion) : dans le navigateur de cartes, une carte d'occlusion s'intitule « en-tête (ou texte alternatif, ou nom de l'image) #n » : `#n` est un symbole, pas un texte à traduire (calculé dans le domaine pour la recherche et le tri).
- 2026-09-25 (M6) : sauvegarde `schemaVersion` 2 sans nouvelle version Dexie (le stockage IndexedDB n'a pas changé) : une application V0 refuse une sauvegarde V1 au lieu de perdre les notes d'occlusion ; une sauvegarde V1 se restaure telle quelle.
- 2026-09-25 (M6) : réponse tapée proposée seulement s'il y a un texte à taper (`canTypeAnswer`) : pas pour un verso image seule ni un masque sans réponse.
- 2026-09-25 (M6) : annuler une réponse refuse de recréer une carte supprimée entre-temps par la modification de sa note (nouvelle erreur `undoGone`, l'entrée est oubliée) et garde le paquet actuel d'une note déplacée (invariants 1 et 2).
- 2026-09-25 (M6, import Anki) : échéance d'une révision = début du jour d'étude situé `due` jours **calendaires** après la date locale de `crt` (au lieu de `crt + due × 86 400 s`, décalé d'un jour au changement d'heure près du début de journée) ; réimport : une note n'est mise à jour que si son type et ses cartes restent les mêmes, sinon ignorée et comptée.
- 2026-09-25 (M6, KaTeX) : voir ADR-009 : repérage pur avant `sanitize()`, rendu KaTeX après `{@html}`, sortie de KaTeX seule exception à `sanitize()` (consignée aussi dans CLAUDE.md) ; `[latex]`, `[$]` et `[$$]` d'Anki laissés en source ; un `<` dans une formule n'est une balise que s'il en ouvre une complète ; retours à la ligne d'Anki dans une formule = espaces ; une formule trop large défile seule (conteneur `inline-block`, `.card-content { contain: inline-size }`) ; une formule invalide reste en source avec un message aussi lu par les lecteurs d'écran ; limite : une cloze dans une formule n'est pas surlignée (mettre la cloze autour de toute la formule).
- 2026-09-25 (M6, export `.apkg`) : `collection.anki21` avec `conf.schedVer = 2` (sans lui, Anki réécrit les `ease` d'apprentissage) et `conf.creationOffset` ; guid = `sourceGuid ?? id` (réexporter ou réimporter met à jour au lieu de dupliquer, dans Anki comme dans Recto) ; quatre types de notes à identifiants fixes et noms distinctifs (« Recto · … », aucune copie « + ») dont une copie du type natif « Image Occlusion » ; cartes retirées exportées suspendues ; état mémoire FSRS dans `cards.data` pour les paquets FSRS seulement ; réglages de paquet, compartiments Memory Box et `source` non transmis ; annulable.
- 2026-09-25 (M6, optimiseur) : seuil de 1 000 révisions **utilisables** (cartes suivies depuis l'état Nouvelle dans Recto, avec au moins une réponse un jour ultérieur), des cartes propres au paquet ; réponses Memory Box incluses (notes 1/3/4 valides en FSRS) ; historique coupé à la dernière réponse à l'état Nouvelle ; écarts en jours d'étude ; WASM mono-thread (jamais `initThreadPool` : ni COOP/COEP ni isolation), worker à usage unique, délai de 2 min, annulé si l'on quitte les paramètres ; « Appliquer » seulement si la perte logarithmique baisse, « pas assez de données » si fsrs-rs rend les valeurs par défaut ; les échéances existantes ne sont pas recalculées (s'appliquent à la prochaine réponse) ; `fsrs-browser` épinglé exactement (les paramètres dépendent de l'implémentation de l'entraînement).
- 2026-09-25 (M6, découpage) : état et actions de la révision dans une classe `ReviewController` (effets créés à l'initialisation du composant) ; raccourcis en fonction pure `reviewKeyAction` ; `Flashcard.svelte` vue unique de la carte (point de branchement de l'occlusion) ; éditeur décrit par des emplacements `{ label, index }` par type (`slots.ts`, point de branchement de l'occlusion), médias et trous insérés seulement dans un champ affiché.
- 2026-09-25 (M6) : les fonctions ont été développées en parallèle sur des branches `v1-*` (copies de travail isolées), chacune relue par deux relecteurs indépendants puis corrigée, puis fusionnées dans la branche de session ; ports E2E paramétrables (`PW_PORT`) pour faire tourner plusieurs suites côte à côte ; `.claude/` ignoré par ESLint et `.claude/worktrees/` par git.

- 2026-09-25 (M5) : rétention réelle = réponses ≠ Encore / réponses données en état Révision, sur 7/30/90 **journées d'étude** ; cible = moyenne des `desiredRetention` des paquets FSRS pondérée par leurs cartes (pas de cible pour la Memory Box). Le temps du jour plafonne chaque réponse à 60 s (comme le journal).
- 2026-09-25 (M5) : prévision : retards comptés aujourd'hui ; nouvelles, suspendues et retirées exclues. Heatmap : 365 journées d'étude, semaines commençant le lundi, 5 niveaux (0 + quartiles du jour le plus chargé). Pas de série de jours ni de record (pas de gamification, SPEC §2).
- 2026-09-25 (M5) : graphiques explorables au clavier par un rôle `slider` (←/→, Début/Fin, `aria-valuetext` décrit la colonne ou le jour), survol sur toute la bande de la colonne, vue tableau repliable ; rampe du calendrier validée par le validateur du skill dataviz (`--ordinal`) : clair `#6fb9af → #0a5a53`, sombre `#2e6860 → #98dfd3`, cases vides `--heat-0`.
- 2026-09-25 (M5) : Lighthouse et axe-core exécutés ponctuellement (via `npx` hors du projet) plutôt qu'ajoutés en dépendances : aucune ADR nécessaire, résultats notés dans les critères. À relancer à la main avant une version majeure.
- 2026-09-25 (M5) : les E2E fixent l'horloge de la page à 11:00 UTC du jour (`tests/e2e/fixtures.ts`, `page.clock.install`) : lancés entre minuit et 04:00, des cartes en apprentissage basculaient sur la journée d'étude suivante.
- 2026-09-25 (M5) : le test E2E des 20 000 cartes remplit IndexedDB directement (40 000 lignes, 25 à 40 s en Chromium sans tête, délai du test porté à 180 s) ; le critère « < 200 ms » reste mesuré par Vitest, la mesure navigateur (seuil 2 s = démarrage SPEC) le complète.
- 2026-09-25 (M5) : `pages.yml` lance `check` et les tests unitaires avant de publier ; la porte complète (`verify`, E2E compris) reste dans `ci.yml`. Routage par `#` : pas de `404.html` nécessaire.

- 2026-09-25 (M4) : le `.wasm` de sql.js est importé avec `?url` (Vite l'émet avec un nom haché, le service worker le précache) au lieu d'être copié dans `public/sql/` : pas de plugin ni de script `postinstall`. Worker au format ES (`worker.format: 'es'`).
- 2026-09-25 (M4) : l'historique Anki est rejoué avec `scheduler.answer` carte par carte (types 0/1/2, notes 1–4) : même algorithme que `fsrs.reschedule` (qui rejoue avec `next`), mais produit directement les lignes `Review` de Recto et fonctionne à l'identique pour Leitner.
- 2026-09-25 (M4) : cartes Anki en apprentissage/réapprentissage (type 1/3) importées sans historique en « Apprentissage » dues maintenant, avec stabilité et difficulté à 0 : ts-fsrs traite cet état comme une première révision (pas de valeurs inventées) ; en Memory Box, compartiment 1.
- 2026-09-25 (M4) : seuls les paquets Anki contenant des cartes sont créés (le « Default » vide ne l'est pas) ; toutes les cartes d'une note vont dans le paquet de sa première carte (invariant 1) ; une carte Anki dont l'`ord` n'existe pas dans le type converti est ignorée et comptée ; une carte attendue absente (ex. `basic_reverse` sans carte 2) est créée nouvelle (invariant 2).
- 2026-09-25 (M4) : `createdAt` d'une note importée = identifiant Anki (horodatage de création en ms), ce qui garde l'ordre d'origine des nouvelles cartes.
- 2026-09-25 (M4) : médias de types non autorisés ignorés et comptés ; nom déjà pris par un autre contenu → suffixe `-2`, `-3`… et références réécrites ; même contenu → non réimporté.

- 2026-09-25 (M3) : la clé de doublon ajoute au texte normalisé les noms des médias référencés (`frontKey`) : sans cela, les 10 recto « image seule » de `drapeaux.csv` étaient tous doublons les uns des autres (texte vide après retrait du HTML). Même clé pour l'avertissement de l'éditeur.
- 2026-09-25 (M3) : à l'import CSV, chaque ligne reçoit `createdAt = maintenant + n° de ligne` (ms) pour que « ordre d'ajout » respecte l'ordre du fichier.
- 2026-09-25 (M3) : une colonne `Type` (valeurs `basic`, `basic_reverse`, `cloze` ou libellés français) est reconnue : l'export CSV l'écrit, l'aller-retour conserve le type des notes.
- 2026-09-25 (M3) : chemins de paquets à plus de deux niveaux : `A::B::C` → paquet principal « A › B », sous-paquet « C » (05 §2.3, séparateur d'affichage `›` pour ne pas réintroduire `::` dans un nom).
- 2026-09-25 (M3) : paquet de destination « Nouveau paquet… » créé seulement si une ligne n'a pas de colonne Paquet.
- 2026-09-25 (M3) : restauration « Remplacer » : vidage et remplissage des tables dans **une seule transaction** (équivalent atomique de `db.delete()` puis import) après téléchargement d'une sauvegarde des données actuelles. « Fusionner » : paquets par id ou par nom (unicité entre frères), notes par id puis `sourceGuid` (la plus récente gagne), cartes par id (la plus récemment révisée gagne, `deckId` suit la note), journaux unionnés, réglages et médias ajoutés s'ils manquent.
- 2026-09-25 (M3) : les lignes invalides d'une sauvegarde sont ignorées et comptées (validateurs manuels `import/validate.ts`) ; les paramètres de paquet absents prennent les valeurs par défaut ; des paramètres FSRS invalides rejettent le paquet.

- 2026-09-25 (M2) : pas d'apprentissage FSRS par défaut `['10m', '10m']` au lieu de `['10m']` : avec un seul pas, ts-fsrs 5 fait graduer « Bien » immédiatement, ce qui contredit P11 (SPEC prioritaire). Docs 02, 03 §2.5 et skill `srs-rules` mis à jour.
- 2026-09-25 (M2) : l'annulation restaure l'instantané exact de la carte gardé en mémoire pendant la séance et supprime la ligne de journal (transaction) ; `f.rollback` de ts-fsrs n'est pas utilisé car il remet `due` à l'heure de la révision et ne connaît pas Leitner. Annulation possible jusqu'à 20 réponses en arrière dans la séance.
- 2026-09-25 (M2) : `retrievability` FSRS calculée directement par la courbe d'oubli (`forgetting_curve`, jours fractionnaires) : même modèle que `get_retrievability`, beaucoup plus rapide pour trier des milliers de retards.
- 2026-09-25 (M2) : `elapsedDays` du journal = nombre de journées d'étude (bornes à 04:00) entre deux révisions, pour les deux planificateurs ; P7 compte les réussites dont `elapsedDays ≥ 7`.
- 2026-09-25 (M2) : Leitner : « Oublié » compte un oubli (`lapses`) par épisode (les re-présentations d'une carte déjà en réapprentissage n'en ajoutent pas) ; « Difficile » n'existe pas et serait traité comme « Réussi ». Le libellé sous « Oublié » est « → C1 · maintenant » (la carte revient dans la séance, 03 §3.4).
- 2026-09-25 (M2) : mode calendrier : une carte due un jour de compartiment manqué reste due les jours suivants (rattrapage, P6) plutôt que d'attendre la prochaine date du compartiment.
- 2026-09-25 (M2) : file du jour : retards triés par R croissante **dans chaque paquet**, puis paquets entrelacés en round-robin (retards, puis révisions du jour) ; plafond `reviewsPerDay` par paquet (sous-paquets inclus séparément), puis plafond global. Les cartes en apprentissage gardent leur place et enterrent leurs sœurs.
- 2026-09-25 (M2) : la séance vit dans `src/lib/state/session.svelte.ts` : « Modifier » ouvre l'éditeur et le retour reprend la séance (cartes et notes relues). Modifier les paramètres d'un paquet termine la séance en cours.
- 2026-09-25 (M2) : Espace = « Bien » seulement en mode 2 boutons (04-UI) ; en mode 4 boutons, Espace ne note pas (évite les notes involontaires).
- 2026-09-25 (M2) : P9 : la « charge estimée » est un facteur relatif à 90 % calculé sur la courbe d'oubli FSRS-6 (intervalle inversé, + 2 révisions par oubli).
- 2026-09-25 (M2) : tout objet `$state` passé à Dexie est d'abord copié (`$state.snapshot`) : un Proxy ne peut pas être stocké dans IndexedDB.

- 2026-09-25 (M1) : clés `settings` ajoutées à la liste réservée : `lastDeckId` (l'éditeur mémorise le dernier paquet), `sleepTipDay` (rappel de sommeil une fois par jour), `swipeGestures` (option de balayage, 04-UI §2.2). `persistGranted` vaut `null` tant que la persistance n'a jamais été demandée.
- 2026-09-25 (M1) : les noms de paquets sont uniques entre frères (insensible à la casse) pour que les chemins `Parent::Enfant` (CSV, Anki) ne soient pas ambigus.
- 2026-09-25 (M1) : supprimer un paquet supprime ses sous-paquets ; fusionner rattache les sous-paquets de la source au paquet principal de la cible. Les lignes `reviews` gardent leur `deckId` historique (journal jamais modifié) ; les statistiques par paquet passeront par la carte.
- 2026-09-25 (M1) : « Supprimer » dans le navigateur supprime les **notes** des cartes sélectionnées (supprimer une seule carte d'une note inverse violerait l'invariant 2) ; le message le dit.
- 2026-09-25 (M1) : en édition, une note `cloze` ne change pas de type et une note basique ne devient pas `cloze` (les champs n'ont pas le même sens) ; à la création, le changement de type convertit les champs (`convertFields`).
- 2026-09-25 (M1) : `sanitize()` transforme `src` en `data-media` : aucune image ne se charge d'elle-même, `CardContent` résout le nom dans IndexedDB ; les URL distantes ne sont jamais chargées (message « Image distante non chargée »). `<div>`, `<strong>`, `<em>` (fréquents dans Anki) sont convertis vers la liste blanche avant assainissement ; attributs gardés : `src`, `alt`, `title`, `class`.
- 2026-09-25 (M1) : images : ré-encodage WebP 0,82 (JPEG 0,85 sinon) et 1 280 px, sauf GIF (animation) et SVG (assaini par DOMPurify) ; si le ré-encodage d'une petite image la grossit, l'original est gardé. Déduplication par `sha256`.
- 2026-09-25 (M1) : `t()` gère le pluriel simple `'{n} carte|{n} cartes'` (singulier pour 0 et 1, règle française).
- 2026-09-25 (M1) : les tests qui exercent DOMPurify tournent sous jsdom (`// @vitest-environment jsdom`), happy-dom restant l'environnement par défaut ; `tests/setup.ts` installe le `Blob` natif de Node pour que les médias traversent fake-indexeddb comme dans un navigateur (ADR-008 complété).
- 2026-09-25 (M1) : `tsconfig.test.json` (types Node pour les tests) séparé de `tsconfig.json` (application, sans types Node) ; `npm run check` vérifie les trois configurations.

- 2026-09-25 : développement sur la branche imposée par la session cloud `claude/great-feynman-7vbb6d` au lieu de `m<N>-<slug>` (contrainte de l'environnement) ; un commit par jalon pour garder une relecture jalon par jalon.
- 2026-09-25 : projet Vite écrit à la main à la racine plutôt que par `npm create vite` (l'assistant interactif crée un sous-dossier et des fichiers de démonstration à supprimer) ; contenu équivalent au modèle `svelte-ts`.
- 2026-09-25 : enregistrement du service worker via `virtual:pwa-register` (API sans store) et un module `src/lib/state/pwa.svelte.ts`, plutôt que `virtual:pwa-register/svelte` qui expose des stores `writable` (interdits pour l'état applicatif par le skill svelte5-conventions). Le bandeau est masqué pendant une séance de révision.
- 2026-09-25 : `npm run e2e` = `npm run build && playwright test` (le serveur de test est `vite preview`) ; `verify` n'appelle donc pas `build` séparément, l'ordre check → lint → format → test → build → e2e est conservé sans double build.
- 2026-09-25 : `playwright.config.ts` accepte `PW_CHROMIUM_PATH` pour réutiliser un Chromium préinstallé (conteneur cloud) ; en local ou en CI, `npx playwright install chromium` suffit.
- 2026-09-25 : navigation basse mobile à 4 entrées (Accueil, Cartes, Statistiques, Paramètres) ; la barre latérale ≥ 900 px ajoute « Ajouter » et « Importer » (création surtout sur PC, SPEC §3).
- 2026-09-25 : `t()` applique automatiquement les espaces insécables françaises (avant « : ; ! ? % » et dans les guillemets) pour que `fr.ts` reste lisible.
- 2026-09-25 : les fonctions pures du routeur sont dans `src/lib/url.ts` (testées) ; `router.svelte.ts` ne contient que l'état réactif.
- 2026-09-30 : `.gitattributes` (`* text=auto eol=lf`) : fins de ligne LF dans la copie de travail quel que soit `core.autocrlf` ; sous Windows, `format:check` échouait sur tous les fichiers (CRLF). Node local ≥ 22.14 (des dépendances de test l'exigent).
- 2026-09-30 (M7) : contenu des tuiles réduit par la propriété CSS `zoom` (le texte se réorganise sur toute la largeur, contrairement à `transform: scale`) ; images plafonnées à la hauteur de la face par une unité de conteneur (`container-type: size`, `100cqh`) pour qu'elles rétrécissent avec le texte.
- 2026-10-02 (M7, retours de Nicolas) : une face de tuile ne défile jamais (`overflow: hidden`) et la réduction n'a plus de plancher de lisibilité (choix de Nicolas : « réduire sans limite ») ; avant la réduction, les images rétrécissent pour laisser la place au texte (`--fit-img`, au moins un cinquième de la face, `imageCap`). Contenu des tuiles centré comme en révision. L'aperçu de l'éditeur réutilise les faces de tuile (`TileFace`) : question et réponse dans deux boîtes de même taille (15rem), côte à côte ou empilées.
- 2026-10-02 (M8) : un type Anki standard ne reste `basic`/`basic_reverse` que s'il a au plus 3 champs et des modèles qui demandent le 1er (puis le 2ᵉ) champ ; sinon type personnalisé (plutôt que de convertir tous les types : les types intégrés gardent leur éditeur, leurs avertissements et leur export CSV). Les types intégrés ne deviennent pas des types personnalisés (migration de toutes les notes écartée).
- 2026-10-02 (M8) : règle de génération d'Anki (question rendue non vide et différente de la question à champs vides), appliquée à la création, à la modification d'une note et d'un type : une carte dont la question devient vide est supprimée (journal conservé), comme un trou retiré ; la confirmation de l'éditeur de types annonce ces suppressions.
- 2026-10-02 (M8) : retirer un modèle de carte décale l'`ord` des cartes suivantes au lieu de les recréer, pour que planification et historique restent avec ce que la carte demande. Renommer un champ réécrit ses références dans les modèles (à la validation du champ, pas à chaque touche, pour ne jamais fusionner deux champs) ; un nom déjà pris n'est pas propagé et l'enregistrement le refuse.
- 2026-10-02 (M8) : réponse d'une carte personnalisée = verso rendu, qui remplace la question en révision (il la reprend par `{{FrontSide}}`) ; dans le tableau du navigateur, la colonne Réponse retire ce qui précède `<hr id=answer>` (comme Anki). Réponse tapée seulement avec `{{type:Champ}}`. `<hr>` ajouté à la liste blanche de `sanitize()` ; les `style` en ligne des modèles Anki restent retirés.
- 2026-10-02 (M8) : réimport : le type de même `sourceId` (id Anki) et mêmes noms de champs est réutilisé, sinon un nouveau « Nom (2) » ; l'export réutilise `sourceId` comme id de type Anki (le type importé est mis à jour dans Anki, pas copié). Fixture synthétique `data/samples/multi-template.apkg` plutôt que le paquet AnkiWeb (licence de son auteur, 6,4 Mo) ; ce dernier sert à la vérification manuelle seulement.
- 2026-10-02 (M8) : supprimer un type utilisé est refusé avec l'explication (bouton actif, message) plutôt qu'un bouton désactivé sans raison.
- 2026-09-30 (M7) : tailles des tuiles (rem, largeur mini une face / deux faces, hauteur, hauteur empilée) : petites 11 / 20 / 12 / 17, moyennes 18 / 26 / 15 / 21 (celles de M7), grandes 24 / 34 / 20 / 28. « Taille » dans la barre de la mosaïque (comme « Trier par »), pas dans Paramètres ; mémorisée en silence comme `browserView`.
- 2026-09-30 (M7) : « Nouveau paquet » dans « Déplacer » ouvre le dialogue de création existant par-dessus la fenêtre (paquet parent possible) ; créer et déplacer restent deux actions, chacune dans sa transaction, pour que l'utilisateur voie la destination avant de confirmer.
- 2026-09-30 (M7) : e2e mosaïque — la mosaïque est virtualisée, donc une tuile hors de la vue n'existe pas dans le DOM : le test cherche la carte longue au lieu de la faire défiler (sur mobile, une tuile recto-verso occupe toute une rangée). Un réglage s'affiche aussitôt et s'écrit ensuite : les tests attendent l'écriture dans IndexedDB avant `reload()`.

## Écarts par rapport aux docs

- M11 : 01-SPEC §5.1 (emoji, alternance Leitner seulement) et §5.2 (`basic_reverse` à deux cartes) changent à la demande de Nicolas ; 02, 03 (§1.1 nouveau, §3.3, §5.2), 04, 05, 06 §4 (E2E 1 : 4 cartes au lieu de 5), ADR-010 et `srs-rules` mis à jour. Écart au plan validé : l'export Anki garde « Recto · Basique » (décision ci-dessus).
- M10 : 05 §1 disait que l'import CSV ne crée jamais de note d'un type personnalisé, 05 §2.3 qu'une note réimportée dont les cartes changent est ignorée, ADR-010 que le CSS des types Anki est ignoré (il l'est encore à l'affichage) : docs mises à jour (02, 04, 05, 06, ADR-005, ADR-009, ADR-010), comportement décrit tel qu'il est.
- M10 : favicon hors ligne (écart noté en M5, plus bas) non reproduit avec Playwright (Chromium sans tête et nouveau mode sans tête : aucune requête en échec ni erreur console) ; `index.html` non modifié. À observer dans un vrai Chrome.

- M9 : 03 §3.2 (calendrier du coffret), §4 (sauvegarde automatique avant conversion) et §5.2 (une carte par note et par jour) ainsi que SPEC §5 changent à la demande de Nicolas ; docs mises à jour. `07-ROADMAP` M2 garde son historique avec une mention du retrait.

- M8 : 05 §2.3 disait qu'un type Anki à plus de 3 champs ou aux modèles non basiques devient `basic` avec ses champs fusionnés dans Extra ; il devient désormais un type personnalisé (doc mise à jour, ADR-010). Le texte à trous Anki à plus de 2 champs garde la fusion.

- M7 : 04-UI §4 limitait les transitions à 150 ms sans animation décorative ; le retournement d'une tuile (≤ 400 ms, style réglable, « Sans animation » disponible) est une demande explicite de Nicolas — 04-UI §4 mis à jour.
- M7 : jalon hors 07-ROADMAP initiale (ajouté comme « M7 ») ; développé sur la branche de session après la fusion de la PR #1 sur `main`.
- M6 : 07-ROADMAP dit « une carte par masque » ; Recto fait une carte par **groupe** de masques, un nouveau masque ouvrant son propre groupe (donc une carte par masque par défaut), comme `cN` dans Anki, pour pouvoir révéler plusieurs zones ensemble.
- M6 : 05 §4 prévoyait `collection.anki2` ; l'export écrit `collection.anki21` avec `schedVer 2` (vérifié avec Anki ; 05 §4 mis à jour). 05 §2.2 décrivait une copie du `.wasm` de sql.js dans `public/sql/` : c'est un import `?url` depuis M4 (doc corrigée).
- M6 : développement sur la branche imposée par la session cloud (`claude/compassionate-albattani-f8qn5u`) plutôt que `m6-<slug>`.
- M6 : la vérification d'interopérabilité (`tests/interop/`) dépend du paquet Python `anki`, hors `npm run verify`.
- M6 : 07-ROADMAP met la synchronisation par fichier et l'empaquetage Android (Capacitor/TWA) dans M6 (V1), alors que la SPEC, prioritaire, les place en V2 (§3 « synchronisation par fichier … envisagée en V2 », §2 « empaquetage TWA/Capacitor en V2 ») et limite la V1 à l'optimiseur, l'occlusion et l'export `.apkg` (§8) plus KaTeX (§5.2). M6 suit la SPEC ; les deux éléments restent à planifier en V2 (à confirmer par Nicolas).
- TypeScript 6.0.3 au lieu de 7.x (ADR-002/007 disent « 5.9+/7 ») : `svelte-check` et `typescript-eslint` exigent TypeScript ≤ 6.0. Consigné en ADR-008.
- `@vite-pwa/assets-generator` 1.0.4 au lieu de 2.0.0 : `vite-plugin-pwa` 1.3 déclare `^1.0.0` en dépendance paire.
- Le manifeste déclare aussi l'icône `pwa-64x64.png` produite par le preset `minimal-2023`.
- Licence : l'écran « À propos » et `package.json` indiquent MIT (choix par défaut, aucune licence n'étant fixée dans les docs) — à confirmer par Nicolas.
- M5 : la roadmap demande un déploiement « opérationnel » ; le workflow est prêt et le build `/recto/` vérifié, mais la publication elle-même exige d'activer Pages dans les réglages du dépôt et de fusionner sur `main`, ce que seule une personne peut faire.
- Chromium ne passe pas la requête du favicon SVG par le service worker : hors ligne, la console signale l'échec de `logo.svg` (sans effet sur l'application, les icônes du manifeste sont précachées).

## À vérifier manuellement par Nicolas

- M17 — Importer `paquets/departements.apkg` en ne gardant que « Carte → Nom » ; réviser quelques jours ; puis, dans les paramètres du paquet, cocher « Nom ↔ Numéro » : ses nouvelles cartes arrivent, les cartes de la carte continuent. Essayer « Nouvelles cartes format par format » et le filtre « Format de carte » du navigateur. Sur le paquet déjà importé, les trois formats sont cochés : décocher ceux à garder pour plus tard.

- M14 — Éditeur de notes : « Type » propose Basique puis vos types ; avec Basique, « Type de carte » (Classique, Texte à trous, Occlusion d'image) ; cocher « Génère une seule carte » sur un texte à trous à deux trous (1 carte qui demande les deux), puis la décocher sur la note enregistrée.
- M14 — Types de notes : créer un type qui mélange une occlusion, deux cartes classiques et un texte à trous ; ajouter une note (masques sur l'image, trous avec « Créer un trou »), la réviser sur le téléphone. Exporter ce paquet pour Anki : le rapport annonce les cartes restées dans Recto.

- M16 — Dans un type de note, cocher « Poser dans les deux sens » sur une carte, réviser : après « Bien », la carte revient dans l'autre sens (« ↔ Sens inversé ») ; les autres cartes du type restent dans leur sens. Exporter un tel type en `.apkg` et l'importer dans Anki : une carte à sens unique (face 1 → face 2), sans erreur.
- M16 — Paquet `paquets/departements.apkg` (101 notes, 3 cartes par note : Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture) : si la version d'hier (5 cartes par note) a été importée, supprimer d'abord le paquet « Départements » et le type « Département » (une réimportation garde les modèles d'un type déjà présent).
- Plugin `recto-deck-builder` — Téléverser `tools/deck-builder/recto-deck-builder.zip` dans l'application Claude (exécution de code activée), redemander le paquet des départements (note Carte, Nom, Numéro, Préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture) : le résultat doit être un seul `.apkg` (type « Département », 3 cartes par note dont deux posées dans les deux sens, images comprises) qui s'importe par Importer › Paquet Anki sans rien terminer à la main.
- M12 — Sur le PC et le téléphone (PWA) : faire une sauvegarde de chaque côté, supprimer une note sur l'un, puis fusionner la sauvegarde de l'autre : la note ne revient pas ; fusionner dans l'autre sens : elle disparaît aussi (le rapport l'indique). La première ouverture après la mise à jour migre la base (aucune action, rien ne doit changer à l'écran).
- M13 — Révision : sur le paquet des départements, les cartes du jour arrivent dans un ordre mélangé (plus dans l'ordre d'ajout) ; deux cartes d'une même note peuvent passer dans la même séance. Réglages d'un paquet : plus de case « Pas de cartes jumelles », « Ordre des nouvelles cartes » sur « Aléatoire » (aussi pour les paquets existants, après la mise à jour).
- M13 — Accueil : « n notes · n cartes » sous chaque paquet, lisible sur téléphone ; un paquet parent compte ses sous-paquets.
- M11 — Effacer les données de test (« Tout effacer ») avant d'essayer : les anciennes notes « Basique + inverse » ne sont plus lues. Réviser une note basique dans un paquet FSRS : après une réussite, elle revient retournée (« ↔ Sens inversé ») ; cocher « Ne jamais retourner cette note » sur une autre.
- M11 — Réponse tapée sur une note nom ↔ photo : pas de saisie quand la réponse attendue est la photo, saisie du nom quand la photo est la question.
- M11 — Types de notes : dans « Departements », tenter de retirer « Numero » (refus nommant les 4 cartes) ; retirer un champ rempli que les modèles n'utilisent plus (confirmation avec le nombre de notes).
- M10 — Anki : réimporter dans Anki (desktop) un export Recto d'un paquet venu d'Anki, avec les réglages par défaut : le type garde son style (vérifié avec le moteur sans interface, pas à l'écran). Dans Recto : réimporter un paquet Anki après y avoir ajouté un trou, voir la nouvelle carte ; fusionner une sauvegarde du téléphone sur le PC après des modifications des deux côtés.
- M10 — Firefox sur le PC : ajouter plusieurs notes à la suite, y compris la toute première (une demande d'autorisation de stockage peut apparaître : l'éditeur doit rester utilisable sans y répondre) ; importer un CSV dans le type « Departements ».
- M10 — Éditeur de types : monter et descendre champs et cartes au clavier, avec un lecteur d'écran (annonce de la position).
- M10 — Revoir les écrans découpés (Accueil, Statistiques, Paramètres, Paquet, navigation) : aucun changement attendu.

- M9 — paquet des départements : sur deux ou trois jours, une même note ne doit jamais proposer « numéro → nom » et « nom → numéro » (ni « préfecture → … ») le même jour, mais peut proposer l'une d'elles et « Quel est ce département ? ». Changer le planificateur d'un paquet : confirmation seule, aucun fichier téléchargé. Paramètres d'un paquet Memory Box : plus de choix « Calendrier du coffret », intervalles modifiables.

- M8 — supprimer l'ancien paquet des départements (importé en Basique, champs dans Extra), réimporter `Les_dpartements_franais.apkg` : 404 cartes, une note s'ouvre avec ses 5 champs ; réviser quelques cartes des 4 sortes ; dans « Types de notes », ajouter une carte au type puis la retirer (confirmation des cartes créées et supprimées) ; exporter le paquet pour Anki et le rouvrir dans Anki (type « Departements » mis à jour, pas copié).

- M7 (retours du 2026-09-30) — sur le navigateur où le reflet apparaissait : retourner des tuiles en rotation horizontale et verticale, avec et sans images, et confirmer que la question ne transparaît plus ; essayer les trois tailles avec le paquet qui avait des barres de défilement.
- M7 — essayer les cinq styles de retournement (Paramètres › Affichage) sur bureau et téléphone, en thème sombre, puis dire lesquels retirer ; retournement au clavier (Tab jusqu'à « Retourner », Entrée) ; tuiles avec images, sons (le bouton de lecture ne retourne pas la tuile), formules, occlusion ; « Mosaïque recto-verso » sur téléphone (faces empilées) ; actions groupées depuis la mosaïque ; ajuster au besoin la taille des tuiles (constantes de `src/lib/ui/browser/grid.ts`).
- M6 — confirmer le report en V2 de la synchronisation par fichier et de l'empaquetage Android (SPEC prioritaire sur 07-ROADMAP) et mettre 07-ROADMAP à jour en conséquence.
- M6 — occlusion sur téléphone : tracer et déplacer des masques au doigt, zoomer l'image en révision (pincement), réviser en thème sombre ; parcours au clavier seul et avec un lecteur d'écran (TalkBack ou NVDA).
- M6 — Anki desktop : importer un `.apkg` exporté par Recto (Paramètres › « Exporter pour Anki ») contenant des occlusions : les masques doivent être dessinés par le script d'Anki et la note s'ouvrir dans son éditeur de masques ; « Outils › Vérifier la base de données » sans problème ; réimporter : aucune note ajoutée. Essayer aussi Anki 2.1.5x et AnkiDroid (seul le moteur d'Anki 26.9.3 a été vérifié).
- M6 — Anki vers Recto : importer un vrai paquet contenant des occlusions faites dans Anki et des formules MathJax (`\( … \)`, `\[ … \]` avec `<br>`, `aligned` avec `&amp;`).
- M6 — formules sur Android : rendu, formule large qui défile seule, thème sombre, lecture MathML par TalkBack ; en mode avion après une première visite.
- M6 — optimiseur sur le téléphone avec un vrai paquet de plus de 1 000 révisions (durée, mémoire) ; Firefox et Safari si utilisés (message « indisponible » attendu au pire) ; relire la clarté du tableau de comparaison.
- M6 — ouvrir une sauvegarde V1 sur une application V0 non mise à jour : elle doit être refusée (« version plus récente »).

- M5 — publication : dans GitHub, _Settings → Pages → Source : GitHub Actions_, puis fusionner sur `main` ; le workflow « Pages » publie <https://nicolasvergnes.github.io/recto/>.
- M5 — test Android hors ligne (à consigner ici avec le modèle du téléphone et la date) : ouvrir l'URL dans Chrome Android → menu ⋮ → « Installer l'application » ; ouvrir l'app installée, « Essayer avec un paquet d'exemple », Paramètres → Stockage → demander la persistance ; activer le mode avion ; fermer l'app (liste des apps récentes) et la rouvrir ; faire une séance, ajouter une note avec une photo, ouvrir Statistiques ; désactiver le mode avion, « Sauvegarder maintenant » et partager le fichier vers Drive.
- M5 — Statistiques : lisibilité des graphiques en thème sombre et sur petit écran (le calendrier défile horizontalement, semaines récentes visibles d'abord).

- M4 : importer un vrai paquet AnkiWeb d'au moins 1 000 cartes exporté d'Anki avec « Prise en charge des anciennes versions d'Anki » (par exemple « Ultimate Geography », cité dans le dossier) ; noter ici son nom, sa taille et la durée affichée dans le rapport ; vérifier images et sons. Les paquets AnkiWeb ne sont pas commités (licences).

- M3 : ouvrir un export CSV `;` dans Excel (accents, colonnes) ; sauvegarder depuis le téléphone (feuille de partage Android) puis restaurer sur le PC en « Fusionner » ; importer un CSV personnel avec une colonne `deck`.

- M2 : une vraie séance sur téléphone (sons en lecture automatique, gestes de balayage activés dans Paramètres), passage d'un paquet en Memory Box mode calendrier, rappel « une nuit de sommeil » en fin de première séance.

- M1 : créer un paquet, un sous-paquet, des notes des trois types ; coller une image (Ctrl+V) et glisser-déposer un fichier dans un champ ; enregistrer un son au micro (autorisation du navigateur) ; fusionner/supprimer un paquet (une sauvegarde `.recto.zip` doit se télécharger avant la suppression) ; thème sombre et taille de texte dans Paramètres.

- `npm install && npm run dev` puis ouvrir http://localhost:5173 : navigation entre les écrans (vides pour l'instant), thème sombre du système respecté.
- `npm run build && npm run preview -- --host` : installer la PWA depuis Chrome Android (HTTPS requis hors `localhost` : déployer sur Pages ou utiliser `mkcert`), couper le réseau, rouvrir l'app.
