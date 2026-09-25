# Changelog

Toutes les évolutions notables de Recto. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

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
