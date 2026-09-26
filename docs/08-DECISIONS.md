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
Décision : `ts-fsrs` 5.x (FSRS-6, MIT) pour FSRS ; implémentation maison de Leitner à 7 compartiments avec deux modes (`interval`, `calendar`). Pas de SM-2.
Conséquences : les paramètres FSRS sont d'abord ceux par défaut ; optimisation locale en V1 avec `fsrs-browser`. Les deux planificateurs partagent une interface et le même journal.

## ADR-005 — Formats ouverts : CSV, `.apkg` legacy en import, sauvegarde zip JSON (2026-09-25)

Contexte : la captivité des données est le premier défaut des applications auditées (Quizlet, Memrise, Tinycards).
Décision : import CSV et `.apkg` (legacy via `sql.js`), sauvegarde complète en zip JSON + médias ; export `.apkg` en V1. Format `anki21b` (zstd) refusé avec message d'aide plutôt qu'une dépendance zstd supplémentaire.
Conséquences : `sql.js` (~1,2 Mo wasm) chargé à la demande ; test avec une fixture synthétique.

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
