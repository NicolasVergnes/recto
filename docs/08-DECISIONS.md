# 08 — Décisions d'architecture (ADR)

Format court : contexte → décision → conséquences. Une nouvelle décision = une nouvelle entrée datée ; on ne réécrit pas l'histoire.

## ADR-001 — PWA locale-first plutôt qu'application Android native (2026-09-25)

Contexte : usage personnel, saisie au clavier sur PC, révision sur Android, maintenance par une seule personne. Google Play impose 25 $, vérification d'identité, 12 testeurs pendant 14 jours et un relèvement annuel du `targetSdk` (API 36 au 31/08/2026) ; la vérification des développeurs pour le sideload se généralise en 2027.
Décision : application web installable, statique, sans serveur ; empaquetage TWA/Capacitor possible plus tard sans réécrire.
Conséquences : pas de notifications fiables ni de widget en V0 ; synchronisation par fichier ; hébergement gratuit ; aucun cycle de mise à jour imposé.

## ADR-002 — Svelte 5 + Vite 8 + TypeScript strict (2026-09-25)

Contexte : surface de code minimale, réactivité simple, build statique.
Décision : Svelte 5 (runes), `@sveltejs/vite-plugin-svelte` 7, Vite 8, TypeScript 5.9+/7 strict. Pas de SvelteKit (pas de SSR ni de routage serveur nécessaires) ; routeur par hash maison (< 100 lignes) ou `svelte-spa-router` si le maison devient gênant.
Conséquences : peu de dépendances ; les compétences requises sont HTML/CSS/TS ; ne pas utiliser la syntaxe Svelte 4.

## ADR-003 — Dexie 4 sur IndexedDB, médias en blobs (2026-09-25)

Contexte : stockage local structuré, requêtes indexées (cartes dues), blobs, réactivité (`liveQuery`), migrations versionnées.
Décision : Dexie 4 ; médias en `Blob` dans une table dédiée ; pas d'OPFS ni de SQLite-WASM en V0.
Conséquences : quota large (jusqu'à ~60 % du disque sur Chrome/Safari 17+) ; demander `persist()` ; sauvegardes régulières indispensables car aucune copie serveur.

## ADR-004 — FSRS-6 via `ts-fsrs` comme planificateur principal, Leitner comme mode fidèle (2026-09-25)

Contexte : le benchmark ouvert (10 000 utilisateurs Anki, 350 M de révisions) place FSRS loin devant SM-2/Leitner ; la méthode Memory Box est celle de départ de l'utilisateur.
Décision : `ts-fsrs` 5.x (FSRS-6, MIT) pour FSRS ; implémentation maison de Leitner à 7 compartiments avec un intervalle par compartiment (le mode `calendar` du livret, présent jusqu'en M8, est retiré en M9 ; boîtes à 5 compartiments et « Ma boîte » en M19, ADR-013). Pas de SM-2.
Conséquences : les paramètres FSRS sont d'abord ceux par défaut ; optimisation locale en V1 avec `fsrs-browser`. Les deux planificateurs partagent une interface et le même journal.

## ADR-005 — Formats ouverts : CSV, `.apkg` legacy en import, sauvegarde zip JSON (2026-09-25)

Contexte : la captivité des données est le premier défaut des applications auditées (Quizlet, Memrise, Tinycards).
Décision : import CSV et `.apkg` (legacy via `sql.js`), sauvegarde complète en zip JSON + médias ; export `.apkg` en V1 (retiré en M18, ADR-012). Format `anki21b` (zstd) refusé avec message d'aide plutôt qu'une dépendance zstd supplémentaire.
Conséquences : `sql.js` (~1,2 Mo wasm) chargé à la demande ; test avec une fixture synthétique.
Mise à jour (2026-10-10, M10) : une note mise à jour hors de l'éditeur — réimport `.apkg`, fusion de sauvegarde — voit ses cartes suivre son nouveau contenu (invariant 2) au lieu d'être ignorée ou de garder des cartes en trop ; une même fonction pure (`reconcileCards`) sert l'éditeur, le réimport et la fusion (05 §2.3, 02 §5).

## ADR-006 — Pas de bibliothèque de graphiques ni d'UI (2026-09-25)

Contexte : 5 graphiques simples, thème clair/sombre, bundle petit.
Décision : SVG maison pour les statistiques ; composants UI maison ; `dompurify` seule dépendance de rendu.
Conséquences : un peu plus de code, aucune dépendance lourde à suivre.

## ADR-007 — Versions épinglées au démarrage du projet (2026-09-25)

`svelte` 5.57, `vite` 8.3, `@sveltejs/vite-plugin-svelte` 7.3, `typescript` ≥ 5.9, `dexie` 4.4, `ts-fsrs` 5.4, `vite-plugin-pwa` 1.3 (+ `workbox-window` 7.4), `sql.js` 1.14, `fflate` 0.8, `papaparse` 5.7, `dompurify` (dernière 3.x), `vitest` 5.0, `@playwright/test` 1.63, `eslint` 10, `prettier` 3.9, `prettier-plugin-svelte` 4.1, `svelte-check` 4.7, `fake-indexeddb` (dernière), `happy-dom` (dernière). `fsrs-browser` 6.6 en V1. Vérifier les versions au moment de `npm install` (elles ont été relevées le 25/09/2026) et noter tout écart dans `STATUS.md`.

## ADR-008 — Outillage de développement complémentaire (2026-09-25)

Contexte : `docs/06-PWA-QUALITY.md` impose ESLint (`typescript-eslint`, `eslint-plugin-svelte`), une couverture ≥ 90 % et des icônes générées ; certaines briques nécessaires à ces outils ne figurent pas dans l'ADR-007.
Décision : dépendances **de développement uniquement** (aucune n'est livrée dans le bundle) : `@eslint/js` et `globals` (configuration plate d'ESLint 10), `@vitest/coverage-v8` (mesure de couverture de Vitest), `@types/papaparse`, `@types/sql.js`, `@types/node` (typages), `jsdom` (environnement Vitest des seuls tests qui exercent DOMPurify : sous happy-dom, DOMPurify perd le premier nœud et laisse passer `<script>` — vérifié le 2026-09-25 —, alors que jsdom est l'environnement de référence de DOMPurify ; happy-dom reste l'environnement par défaut). TypeScript est épinglé en `~6.0` : `svelte-check` 4.7 et `typescript-eslint` 8.70 n'acceptent pas encore TypeScript 7 (`peerDependencies` ≤ 6.0).
Conséquences : aucune incidence sur la taille de l'application ; passer à TypeScript 7 quand ces deux outils le prendront en charge.

## ADR-009 — KaTeX pour les formules LaTeX (2026-09-25)

Contexte : la SPEC (§5.2) prévoit en V1 le rendu des formules `\( … \)` (et `\[ … \]` en bloc, syntaxe MathJax des paquets Anki). L'ADR-006 faisait de `dompurify` la seule dépendance de rendu et l'ADR-007 ne liste aucun moteur de formules.
Décision : `katex` 0.18 (0.18.9 installée), MIT, types TypeScript inclus (pas de `@types/katex` ; `commander`, sa seule dépendance, ne sert qu'à la CLI et n'est pas empaqueté).
- Chargement à la demande seulement (`import()` depuis `CardContent`, module `src/lib/math/katex.ts` réexporté par aucun barrel) : un bloc séparé d'environ 78 Ko gzip plus 8 Ko de CSS ; le bundle initial reste sous 170 Ko gzip. Le bloc, sa CSS et les 19 polices woff2 (≈ 256 Ko) sont précachés : les formules s'affichent hors ligne.
- Les formules sont repérées par une fonction pure (`markMath`, `src/lib/domain/math.ts`) avant `sanitize()` ; KaTeX les rend ensuite dans le DOM.
- **Exception à « tout HTML de champ passe par `sanitize()` »** : la sortie de KaTeX, et elle seule, n'y passe pas (ses `style`, son SVG et son MathML seraient supprimés : formule fausse et muette pour les lecteurs d'écran). La sécurité repose sur la configuration : `trust: false` (refuse `\href`, `\url`, `\includegraphics`, `\html…`), texte échappé par KaTeX, `maxSize: 10`, `maxExpand` par défaut, pas d'objet de macros partagé entre formules, `strict: 'ignore'`, `renderToString` avec `throwOnError: true` et l'exception interceptée (une formule invalide reste en source, avec « Formule LaTeX invalide » en infobulle et pour les lecteurs d'écran).
- Écartés : MathJax (plus lourd, rendu asynchrone et plus lent, API plus complexe) ; la sortie MathML seule (symboles extensibles mal rendus sur Android faute de police mathématique).
Conséquences : la toute première formule affichée en ligne montre brièvement sa source pendant le téléchargement ; `[latex]…[/latex]`, `[$]…[/$]` et `[$$]…[/$$]` d'Anki ne sont pas rendus (conservés tels quels, 05 §2.3) ; les commandes refusées par `trust: false` s'affichent dans le rouge de KaTeX ; les mises à jour de sécurité de `katex` sont à suivre. Complète l'ADR-006 (dépendances de rendu) et l'ADR-007 (versions).

Mise à jour du 2026-10-10 (M10) : `[$]…[/$]` (en ligne) et `[$$]…[/$$]` (bloc), les écritures du LaTeX d'Anki, sont rendues par KaTeX comme `\( … \)` et `\[ … \]`, ce qui corrige la phrase des « Conséquences » qui les disait non rendues. `markMath` les repère avec les mêmes règles de jetons que les deux autres et laisse dans le `span.math` la source échappée avec les délimiteurs tapés, que `renderMath` relit avec `parseFormula` : le champ n'est jamais réécrit, ni à l'export Anki ni à l'écran, où cette source, délimiteurs d'origine compris, reste visible tant que KaTeX n'a pas rendu ou si la formule est invalide (alternative écartée : la normaliser en `\( … \)`, qui montrerait des délimiteurs que l'auteur n'a pas tapés). Rien ne change pour la sécurité : `markMath` s'exécute avant `sanitize()` et n'écrit que `<span class="math">` autour de texte échappé, la sortie de KaTeX reste la seule exception ; des tests le prouvent pour chaque écriture (HTML en entrée, sortie du `span`, `\href` et `\html…` refusés). `[latex]…[/latex]` reste en source : c'est du LaTeX en mode texte, compilé par Anki, que KaTeX ne rend pas.

## ADR-010 — Types de notes à modèles de cartes, syntaxe d'Anki (2026-10-02)

Contexte : un paquet Anki courant (« Les départements français », 101 notes, 4 modèles de carte) était importé en `basic` avec ses champs fusionnés dans Extra : 101 cartes au lieu de 404. Nicolas demande qu'une note puisse produire plusieurs cartes comme dans Anki, avec un éditeur de types.
Décision : un 5ᵉ type de note `custom` qui référence un `NoteType` (table `noteTypes`, Dexie version 2, sauvegarde `schemaVersion` 3) : champs nommés et modèles de cartes recto/verso écrits dans un **sous-ensemble de la syntaxe d'Anki** (`{{Champ}}`, `{{FrontSide}}`, sections `#`/`^`, filtres `text:` et `type:`), rendu par un module pur (`src/lib/domain/templates.ts`, quelques expressions régulières), **sans nouvelle dépendance**. Le rendu passe par `sanitize()` ; le CSS des types Anki est ignoré (Recto centre le contenu). Les types intégrés (basique, inverse, texte à trous, occlusion) restent tels quels : un type Anki n'est conservé en `custom` que s'il ne se ramène pas à `basic`/`basic_reverse` sans perte. (M11 : `basic_reverse` retiré, le type inversé d'Anki devient une note `basic` posée dans les deux sens.)
- Écartés : un moteur de gabarits (Mustache, Handlebars) — dépendance pour quatre constructions, et syntaxe qui diverge d'Anki sur les filtres ; transformer les types intégrés en types personnalisés — migration de toutes les notes et risque sur l'éditeur, l'occlusion et le texte à trous.
Conséquences : les filtres avancés d'Anki (`furigana:`, `tts:`, `cloze:` hors type texte à trous) rendent la valeur brute ; les scripts et styles des modèles sont retirés ; modifier un type peut supprimer des cartes (journal conservé), ce qu'annonce la confirmation. Complète l'ADR-006 (rendu) et l'ADR-009.
Mise à jour (2026-10-10, M10) : le CSS des types Anki reste ignoré à l'affichage, mais il est gardé (avec les préambules LaTeX, le champ de tri et la date `mod` du modèle) dans `NoteType.anki` et rendu par l'export (retiré en M18, ADR-012 ; les données restent) : sans cela, réexporter vers Anki un paquet importé remplaçait le style du type dans Anki (vérifié avec le moteur d'Anki, `tests/interop/`). Pas de version Dexie (champ facultatif non indexé) ni de nouvelle `schemaVersion` (une application plus ancienne ignore le champ).

## ADR-011 — Texte à trous et occlusion d'image : des types de cartes, plus des types de notes (2026-10-14)

Contexte : « Texte à trous » et « Occlusion d'image » étaient des types de notes à côté de « Basique » ; dans un type personnalisé, chaque modèle de carte était forcément recto/verso. Nicolas demande que ce soient des **types de cartes** : le type de note Basique (un modèle de carte) laisse choisir le type de sa carte, et chaque carte d'un type personnalisé choisit le sien (un même type peut produire une occlusion, deux cartes classiques et un texte à trous, plusieurs de chaque, chacune sur son champ). Une carte à trous ou d'occlusion produit une carte par trou ou par groupe de masques, ou, case « Génère une seule carte », une seule carte qui les demande tous. L'export Anki n'est pas un but (« le but c'est d'utiliser Recto »).
Décision :
- Notes intégrées : la valeur stockée `modelType` (`basic`, `cloze`, `image_occlusion`) ne change pas ; elle se lit désormais « note Basique, carte classique / à trous / d'occlusion ». Seule l'interface change (Type : Basique ou un type personnalisé ; « Type de carte » pour Basique). `note.single` pour une note à trous ou d'occlusion.
- Types personnalisés : `CardTemplate.kind` (`classic` par défaut, `cloze`, `occlusion`), `field` (champ du texte ou de l'image) et `single`. Les masques d'un champ image sont dans `note.masks`, aligné sur `fields` (ils suivent leur champ quand les champs sont réordonnés).
- `ord` d'une carte personnalisée : `indice du modèle + 1000 × sous-indice` (trou ou groupe − 1). Les cartes d'avant M14 ont un sous-indice nul : aucune ne change, l'index `[noteId+ord]` et `reconcileCards` servent tels quels.
- Dexie version 5 sans `upgrade()` et sauvegarde `schemaVersion` 6 sans transformation : une propriété absente garde le comportement d'avant ; les versions servent de verrou, pour qu'une copie plus ancienne de l'application, encore en cache, refuse la base ou la sauvegarde au lieu de réconcilier comme classiques — donc de supprimer — les cartes à trous d'un type.
- Export Anki (retiré en M18, ADR-012) : un type personnalisé part avec ses seules cartes classiques (un type Anki est standard ou à trous, jamais les deux) ; le rapport compte les cartes laissées dans Recto.
- Écartés : migrer les notes intégrées vers un type Basique stocké avec un champ `cardKind` — réécriture de toutes les notes des testeurs, des sauvegardes et de l'import pour un nom ; ajouter `Card.template` au lieu d'encoder l'`ord` — migration de toutes les cartes personnalisées, de la fusion de sauvegarde et de l'export, pour le même résultat ; stocker les masques dans un champ caché du type — champ visible dans Anki et dans l'éditeur de types ; découper un type mixte en plusieurs notes Anki à l'export — le réimport ne reformerait pas la note.
Conséquences : un type mixte n'a pas d'équivalent dans Anki (cartes à trous et d'occlusion non exportées, type jamais réutilisé au réimport) ; « Génère une seule carte » n'a pas d'équivalent dans Anki ni dans le CSV ; changer le type d'une carte remplace ses cartes (journal conservé), ce qu'annonce la confirmation. Remplace l'alternative écartée « transformer les types intégrés en types personnalisés » de l'ADR-010 par cette voie plus légère.

## ADR-012 — Retrait de l'export `.apkg` (2026-10-15)

Contexte : Recto est un concurrent d'Anki, pas un complément ni un partenaire (Nicolas). L'export vers Anki (M6, repris en M8, M10, M14, M16) coûtait cher à maintenir : chaque évolution du modèle (types de cartes, cartes à deux sens) demandait sa traduction en Anki, avec ses pertes à expliquer.
Décision : l'export `.apkg` est retiré (code, interface, tests, contrôle manuel `tests/interop/`). L'import des paquets Anki reste, entier : c'est la porte d'entrée des utilisateurs qui viennent d'Anki. Les mentions d'Anki dans l'interface se limitent à l'import.
- Rien n'est migré : `NoteType.anki` (style, champ de tri, `mod`) reste stocké et lu par la sauvegarde, sans plus servir ; l'import reconnaît toujours une note par `sourceGuid ?? id`, et lit toujours la marque `rectoTwoWay` et les réponses des masques dans « Comments », qu'écrit le plugin deck-builder.
- Aucune dépendance ne part : `sql.js` et `fflate` servent à l'import et à la sauvegarde.
- Écarté : garder l'export caché ou en option avancée (un code à maintenir pour un usage qui contredit le positionnement).
Conséquences : pour quitter Recto avec tout, la sauvegarde `.recto.zip` (format documenté, 05 §3) et l'export CSV.

## ADR-013 — Boîte de Leitner à trois modèles (2026-10-21)

Contexte : « Memory Box » est le nom d'un produit (le coffret Larousse de Fabien Olicard) ; la méthode est la boîte de Leitner. Nicolas veut une boîte à 7 compartiments (défaut), une à 5, ou la sienne, et choisir le planificateur des nouveaux paquets. L'ADR-004 prévoyait une boîte à 7 compartiments seulement, aux intervalles réglables par paquet (M9).
Décision : trois modèles (`seven`, `five`, `custom` « Ma boîte »), `domain/leitner.ts`. Les deux premiers sont fixes ; Ma boîte est unique (2 à 10 compartiments, réglage partagé `leitnerCustom`). Un paquet nomme sa boîte et garde une copie de ses jours (`settings.leitner.model`, `intervals`) : le planificateur ne lit que le paquet, et enregistrer Ma boîte recopie ses jours dans ses paquets, dans la même transaction. Le planificateur des nouveaux paquets (`newDeckModel`, FSRS par défaut, partagé) vaut aussi pour les imports.
- Changer de boîte : une carte garde son compartiment, au plus le dernier, et son échéance. FSRS → boîte : compartiment dont l'intervalle est le plus proche de la stabilité, en échelle logarithmique (généralise la table de l'ADR-004 ; seuils de la boîte à 7 légèrement déplacés).
- Écarté : plusieurs modèles personnels nommés (une table de plus à fusionner entre appareils, pour un besoin non exprimé) ; une boîte réglée paquet par paquet (le défaut des nouveaux paquets ne pourrait pas la désigner) ; des paquets qui ne référencent que leur modèle sans copie de ses jours (planificateur et conversions dépendraient d'un réglage global).
Conséquences : Dexie version 7, sauvegardes en version 8 ; des intervalles modifiés à la main avant M19 deviennent « Ma boîte » (ceux du paquet modifié le plus récemment ; les autres paquets gardent les leurs jusqu'au prochain enregistrement de Ma boîte). Après des modifications de Ma boîte sur deux appareils à la fois, un paquet peut garder les jours de l'autre version jusqu'au prochain enregistrement : rien n'est perdu.
