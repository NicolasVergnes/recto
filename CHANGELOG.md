# Changelog

Toutes les évolutions notables de Recto. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### M6 — V1 : occlusion d'image, export Anki, optimiseur FSRS, formules

#### Added

- **Occlusion d'image** (type de note `image_occlusion`, 02 §2.1) : masques rectangulaires sur une image, une carte par masque ou par groupe de masques, réponse facultative par masque, modes « tout cacher, deviner une zone » et « ne cacher que la zone à deviner ». Éditeur de masques au pointeur (tracer, déplacer) et entièrement au clavier (ajouter, flèches pour déplacer, Maj + flèches pour redimensionner, Suppr, n° de carte) ; aperçu des deux faces ; en révision, la zone demandée s'ouvre au dévoilement et les réponses n'existent pas dans la page avant (P1).
- Import des notes « Image Occlusion » d'Anki ≥ 23.10 (ellipses, polygones et formes tournées convertis en rectangles, formes texte ignorées, rapport) et export vers ce même type natif ; fixture `data/samples/image-occlusion.apkg` exportée par le moteur d'Anki.
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
