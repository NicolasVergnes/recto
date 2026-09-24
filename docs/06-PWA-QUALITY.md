# 06 — PWA, stockage, qualité, tests, déploiement

## 1. PWA (`vite-plugin-pwa` 1.x)

```ts
// vite.config.ts (extrait)
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',          // '/recto/' sur GitHub Pages
  resolve: { alias: { $lib: '/src/lib' } },    // + "paths": { "$lib/*": ["src/lib/*"] } dans tsconfig.json
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',          // jamais 'autoUpdate' : il recharge la page en pleine séance
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Recto', short_name: 'Recto', lang: 'fr', display: 'standalone',
        start_url: '.', scope: '.', background_color: '#ffffff', theme_color: '#0e6f66',
        description: 'Flashcards à répétition espacée, hors ligne, sans compte.',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],   // noms produits par @vite-pwa/assets-generator (preset minimal-2023)
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,   // sql.js et fsrs-browser .wasm
        navigateFallback: 'index.html',
      },
    }),
  ],
})
```

- Bandeau « Nouvelle version disponible — Recharger » via `virtual:pwa-register/svelte` (`useRegisterSW` : `needRefresh` affiche le bandeau, `updateServiceWorker(true)` sur clic). Le rechargement n'a lieu que sur action de l'utilisateur, jamais pendant une séance.
- Les gros modules (`sql.js`, `fsrs-browser`) sont en `import()` dynamique ; leur `.wasm` est précaché pour l'usage hors ligne.
- Icônes générées une fois avec `@vite-pwa/assets-generator` depuis `public/logo.svg` (commande `npm run icons`).
- Test manuel Android : installer depuis Chrome, couper le réseau, réviser, créer une carte, rouvrir.

## 2. Stockage

- `navigator.storage.persist()` demandé après la première création de carte (Paramètres montre l'état `persisted()`).
- `navigator.storage.estimate()` : afficher `usage / quota` ; avertir à 80 %.
- Blobs média dans IndexedDB (Dexie) ; ne pas dupliquer en Cache Storage.
- Sauvegarde : rappel après 7 jours sans export (`settings.lastBackupAt`).
- Effacement : `db.delete()` puis rechargement ; jamais sans export proposé.

## 3. Outils de qualité

| Outil | Commande | Attendu |
|---|---|---|
| TypeScript strict + svelte-check | `npm run check` | 0 erreur, 0 warning |
| ESLint (`eslint-plugin-svelte`, `typescript-eslint`) | `npm run lint` | 0 erreur |
| Prettier (`prettier-plugin-svelte`) | `npm run format:check` | conforme |
| Vitest (unitaires, `happy-dom` + `fake-indexeddb` pour Dexie) | `npm run test` | verts ; couverture ≥ 90 % sur `scheduler`, `queue`, `import` |
| Playwright (e2e, Chromium) | `npm run e2e` | verts |
| Build | `npm run build` | OK, taille initiale < 300 Ko gzip hors `.wasm` (vérifier avec `rollup-plugin-visualizer` en option) |

`npm run verify` enchaîne check → lint → format:check → test → build → e2e. C'est la porte de sortie de tout jalon (skill `quality-gate`).

## 4. Stratégie de tests

### Unitaires (Vitest)
- `scheduler/leitner` : toutes les transitions de 03-SCHEDULING §3.3, les deux modes, `isBoxDue` sur un calendrier de 2 ans (table de vérité), alternance des faces, C7.
- `scheduler/fsrs` : conversions aller-retour Card ↔ ts-fsrs, `preview` cohérent avec `answer`, rollback restaure l'état, paramètres invalides rejetés.
- `queue` : cas de 03-SCHEDULING §5 (plafonds, entrelacement, sœurs, tri par R, changement de jour à 04:00, fuseau Europe/Paris et heure d'été).
- `import/csv` : séparateurs, BOM, en-tête, doublons, cloze auto, rapport.
- `import/apkg` : fixture synthétique, refus `anki21b`, replay revlog.
- `export/backup` + `import/backup` : aller-retour bit à bit (propriété : restaurer(exporter(db)) ≡ db).
- `db` : migrations, invariants de 02-DATA-MODEL §3, transaction atomique `recordReview` (simulation d'échec).
- `media` : redimensionnement (image 4 000 px → 1 280 px), refus des types non autorisés, sha256.

Horloge : tous les modules reçoivent `now: number` en paramètre ; les tests utilisent `vi.useFakeTimers()` et des dates fixes, jamais `Date.now()` direct dans le domaine.

### E2E (Playwright, Chromium mobile + desktop)
1. Premier lancement → créer un paquet → ajouter 3 notes (basique, inverse, cloze) → 5 cartes visibles dans le navigateur.
2. Réviser : réponse masquée, afficher, noter, compteur décrémenté, annuler, re-noter.
3. Import CSV d'exemple → 101 cartes → réviser 5.
4. Import `.apkg` fixture → rapport correct.
5. Export sauvegarde → effacer → restaurer → mêmes comptes.
6. Hors ligne : `context.setOffline(true)` → l'app se charge et révise.

## 5. Conventions de code

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Svelte 5 runes uniquement (`$state`, `$derived`, `$effect`, `$props`) ; pas de `export let`, pas de stores legacy, pas de `$:`.
- Domaine pur (scheduler, queue, import parsers) sans dépendance à Svelte ni au DOM ; effets (Dexie, fichiers, URL) dans `repo`/`media`.
- Nommage : fichiers `kebab-case.ts`, composants `PascalCase.svelte`, fonctions `camelCase`, types `PascalCase`.
- Pas de `any` ; `unknown` + validation (`zod` accepté si nécessaire, sinon validateurs manuels).
- Commentaires en anglais, courts, seulement quand le « pourquoi » n'est pas évident ; les règles pédagogiques citent leur numéro (`// P7`).
- Commits : Conventional Commits en anglais (`feat(scheduler): leitner calendar mode`), un jalon = une branche `m<N>-<slug>` fusionnée en squash sur `main`.

## 6. Déploiement

- `npm run build` → `dist/` statique. GitHub Pages via workflow `.github/workflows/pages.yml` (build sur push `main`, `BASE_PATH=/recto/`), ou Cloudflare Pages (connecter le dépôt, commande `npm run build`, dossier `dist`, `BASE_PATH=/`).
- `npm run preview` pour tester le build local ; sur Android via l'IP locale (HTTPS requis pour le service worker : utiliser `vite preview --host` + `mkcert`, ou déployer sur Pages dès M1).
- Aucune variable secrète ; aucun service externe.
