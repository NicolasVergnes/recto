# STATUS — Recto

Dernière mise à jour : 2026-09-25 · Branche : claude/great-feynman-7vbb6d · Jalon en cours : M1

## Jalon en cours

M1 — Données et création de cartes (plan écrit au démarrage du jalon).

## Terminé

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

- M1 à M5 (docs/07-ROADMAP.md).

## Décisions prises en session

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

## À vérifier manuellement par Nicolas

- `npm install && npm run dev` puis ouvrir http://localhost:5173 : navigation entre les écrans (vides pour l'instant), thème sombre du système respecté.
- `npm run build && npm run preview -- --host` : installer la PWA depuis Chrome Android (HTTPS requis hors `localhost` : déployer sur Pages ou utiliser `mkcert`), couper le réseau, rouvrir l'app.
