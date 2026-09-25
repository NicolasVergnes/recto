# STATUS — Recto

Dernière mise à jour : 2026-09-25 · Branche : claude/great-feynman-7vbb6d · Jalon en cours : M4

## Jalon en cours

M4 — Import `.apkg` (plan écrit au démarrage du jalon).

## Terminé

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

- M3 à M5 (docs/07-ROADMAP.md).
- Plusieurs écrans dépassent 200 lignes (Review, Editor, Cards, Settings, Deck) : extraire des sous-composants lors des finitions (M5).

## Décisions prises en session

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

## Écarts par rapport aux docs

- TypeScript 6.0.3 au lieu de 7.x (ADR-002/007 disent « 5.9+/7 ») : `svelte-check` et `typescript-eslint` exigent TypeScript ≤ 6.0. Consigné en ADR-008.
- `@vite-pwa/assets-generator` 1.0.4 au lieu de 2.0.0 : `vite-plugin-pwa` 1.3 déclare `^1.0.0` en dépendance paire.
- Le manifeste déclare aussi l'icône `pwa-64x64.png` produite par le preset `minimal-2023`.
- Licence : l'écran « À propos » et `package.json` indiquent MIT (choix par défaut, aucune licence n'étant fixée dans les docs) — à confirmer par Nicolas.

## À vérifier manuellement par Nicolas

- M3 : ouvrir un export CSV `;` dans Excel (accents, colonnes) ; sauvegarder depuis le téléphone (feuille de partage Android) puis restaurer sur le PC en « Fusionner » ; importer un CSV personnel avec une colonne `deck`.

- M2 : une vraie séance sur téléphone (sons en lecture automatique, gestes de balayage activés dans Paramètres), passage d'un paquet en Memory Box mode calendrier, rappel « une nuit de sommeil » en fin de première séance.

- M1 : créer un paquet, un sous-paquet, des notes des trois types ; coller une image (Ctrl+V) et glisser-déposer un fichier dans un champ ; enregistrer un son au micro (autorisation du navigateur) ; fusionner/supprimer un paquet (une sauvegarde `.recto.zip` doit se télécharger avant la suppression) ; thème sombre et taille de texte dans Paramètres.

- `npm install && npm run dev` puis ouvrir http://localhost:5173 : navigation entre les écrans (vides pour l'instant), thème sombre du système respecté.
- `npm run build && npm run preview -- --host` : installer la PWA depuis Chrome Android (HTTPS requis hors `localhost` : déployer sur Pages ou utiliser `mkcert`), couper le réseau, rouvrir l'app.
