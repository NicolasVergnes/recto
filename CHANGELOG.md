# Changelog

Toutes les évolutions notables de Recto. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

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
