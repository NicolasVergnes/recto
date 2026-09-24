# 07 — Feuille de route par jalons

Chaque jalon est autonome : il se termine par `npm run verify` vert, une entrée dans `CHANGELOG.md`, la mise à jour de `docs/STATUS.md` (ce qui est fait, ce qui reste, décisions prises) et un commit. Un jalon = une session Claude Code au maximum ; s'il ne tient pas, le découper et le dire dans `STATUS.md`. Ne pas commencer un jalon tant que le précédent n'est pas accepté.

Critères d'acceptation : chaque ligne « ✔ » doit être vérifiable par un test automatisé ou une manipulation décrite.

## M0 — Squelette et outillage

- ✔ `npm create vite` Svelte + TS, dépendances des ADR installées aux versions épinglées (08-DECISIONS), `npm run verify` passe sur un projet vide (un test unitaire trivial, un e2e « la page s'affiche »).
- ✔ Structure de dossiers de SPEC §7 créée avec des fichiers `index.ts` vides documentés.
- ✔ `app.css` avec tokens de 04-UI §4 (clair/sombre), `App.svelte` avec la navigation et des écrans vides nommés.
- ✔ PWA installable (manifest, icônes, service worker) : test Playwright sur le build (`manifest.webmanifest` servi avec `name`/`icons`, `navigator.serviceWorker.ready` résolu, page chargée hors ligne après une première visite) ; installation manuelle sur Android documentée dans STATUS.
- ✔ `fr.ts` initialisé avec les textes de 04-UI §3 et `t()` typé (clé inconnue = erreur de compilation).
- ✔ `.github/workflows/ci.yml` : `npm ci && npm run verify` sur push.

## M1 — Données et création de cartes

- ✔ Schéma Dexie V1 (02-DATA-MODEL), `repo.ts`, tests des invariants et d'une migration factice V1→V2 réalisée **uniquement dans le test** (sous-classe locale de `RectoDB` ajoutant `version(2)`), jamais dans `schema.ts`.
- ✔ Écran Paquet (créer, renommer, déplacer, fusionner, supprimer avec export automatique préalable), écran Éditeur (3 types, aperçu, avertissements P8, doublons, Ctrl+Entrée), navigateur de cartes (filtres, tri, sélection, actions groupées, virtualisation ≥ 5 000 lignes).
- ✔ Médias : image (fichier/coller/glisser, redimensionnement, `alt`), audio (fichier, enregistrement), stockage Dexie, rendu sécurisé (`dompurify` avec liste blanche : `b i u br p ul ol li img sub sup span`), URL objets révoquées.
- ✔ Persistance demandée après la première carte ; page Paramètres avec état du stockage.
- ✔ E2E 1.

## M2 — Planificateurs et révision

- ✔ `scheduler/fsrs.ts` et `scheduler/leitner.ts` conformes à 03-SCHEDULING, tests unitaires listés en 06 §4 verts, couverture ≥ 90 %.
- ✔ `queue/` conforme à 03 §5 avec ses tests.
- ✔ Écran Révision complet (04-UI §2.2) : masquage, réponse tapée, boutons avec prévisualisation, raccourcis, annuler, modifier, suspendre, retirer (P7), infos, résumé de fin, jour à 04:00.
- ✔ Accueil : compteurs du jour et « Réviser aujourd'hui » toutes cartes confondues.
- ✔ Paramètres de paquet : planificateur, plafonds, rétention (avec texte d'aide), mode Leitner, alternance ; changement de planificateur (03 §4) avec sauvegarde automatique.
- ✔ E2E 2.

## M3 — Import CSV et sauvegarde

- ✔ Import CSV/TSV complet (05 §1) avec fixtures ; paquet d'exemple depuis l'accueil.
- ✔ Export CSV ; sauvegarde `.recto.zip` complète et restauration (remplacer/fusionner) ; rappel 7 jours ; partage natif si disponible.
- ✔ Test de propriété aller-retour sauvegarde.
- ✔ E2E 3 et 5.

## M4 — Import `.apkg`

- ✔ Lecture `anki21`/`anki2` dans un worker (`sql.js`), refus `anki21b` avec message, médias, hiérarchie, modèles convertis, rapport (05 §2).
- ✔ Option « importer l'historique » avec `reschedule` (FSRS) ou replay (Leitner).
- ✔ Fixture `sample-legacy.apkg` importée en test ; import d'un vrai paquet AnkiWeb de ≥ 1 000 cartes testé manuellement (documenter lequel dans STATUS).
- ✔ E2E 4.

## M5 — Statistiques, finitions, V0

- ✔ Écran Statistiques (SPEC 5.6) : compteurs, prévision 30 j, rétention réelle 7/30/90 j vs cible, heatmap, répartition par état et par compartiment. Graphiques en SVG maison (pas de bibliothèque), lisibles clair/sombre.
- ✔ Accessibilité : audit clavier complet, contraste AA vérifié, `prefers-reduced-motion`, cibles 44 px ; Lighthouse Accessibilité ≥ 95.
- ✔ Performance : file du jour < 200 ms avec 20 000 cartes (test de charge en Vitest avec base générée), bundle initial < 300 Ko gzip.
- ✔ Hors ligne : E2E 6 ; test manuel Android documenté dans STATUS.
- ✔ Déploiement GitHub Pages ou Cloudflare Pages opérationnel, URL notée dans README.
- ✔ README utilisateur (installation sur Android, sauvegarde, import Anki) et `docs/STATUS.md` marqué « V0 livrée ».

## M6 — V1 (ouvert)

- Optimiseur FSRS dans le navigateur (`fsrs-browser`, worker, ≥ 1 000 révisions, prévisualisation avant acceptation).
- Occlusion d'image (type `image_occlusion` : masques rectangulaires sur une image, une carte par masque).
- Export `.apkg` legacy.
- KaTeX pour les formules.
- Synchronisation par fichier (export/import automatique vers un dossier via File System Access API) ou document CRDT.
- Empaquetage Android (Capacitor ou TWA) sans changer le code applicatif.
