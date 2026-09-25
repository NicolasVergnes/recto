# Recto — Cahier des charges du prototype (V0)

Version 1.0 — 25 septembre 2026. Propriétaire : Nicolas. Ce document est la source de vérité fonctionnelle. Les documents 02 à 08 le détaillent ; en cas de contradiction, ce fichier prime, puis l'ordre numérique.

> Le nom de code **Recto** est provisoire (nom du paquet npm `recto`, titre PWA « Recto »). Il se change en un seul endroit : `src/lib/config/app.ts`.

## 1. Vision

Une application de flashcards **personnelle, locale-first, sans serveur ni compte**, qui applique ce que la recherche a établi sur l'apprentissage par cartes (rappel actif, espacement, auto-évaluation, feedback) et qui reste fidèle à la méthode « Memory Box » de Fabien Olicard (boîte à sept compartiments, cartes réversibles, une information par carte) tout en offrant un planificateur moderne (FSRS-6).

Elle est faite pour un seul utilisateur qui apprend « un peu de tout » : langues, dates, personnages, drapeaux, départements, constellations, langue des signes, plantes, mathématiques. Les cartes doivent donc porter du texte, des images et du son.

Le fondement scientifique et l'audit concurrentiel sont dans `Dossier-Flashcards.html` (racine du dépôt) ; la synthèse opérationnelle est le skill `.claude/skills/srs-rules/SKILL.md`.

## 2. Objectifs et non-objectifs

### Objectifs V0

1. Créer, éditer, organiser des cartes (texte, image, audio, texte à trous) dans des paquets.
2. Réviser chaque jour avec une **file unique mélangée** entre tous les paquets, avec réponse masquée jusqu'à une tentative, feedback systématique et auto-évaluation.
3. Deux planificateurs au choix par paquet : **FSRS-6** (`ts-fsrs`, rétention cible réglable) et **Leitner « Memory Box »** (sept compartiments, fidèle au livret).
4. Importer des paquets existants : **CSV/TSV** et **`.apkg` Anki** (legacy `collection.anki2` / `collection.anki21`).
5. Exporter tout à tout moment : CSV, sauvegarde complète (zip JSON + médias).
6. Statistiques : cartes dues, prévision de charge, rétention réelle, heatmap, distribution des compartiments.
7. Fonctionner **hors ligne**, installée sur Android (PWA) et sur PC, sans dégradation.
8. Être maintenable par une personne seule : dépendances peu nombreuses, tests sur le cœur, aucune infrastructure.

### Non-objectifs V0 (explicitement hors périmètre)

- Comptes utilisateurs, synchronisation serveur, partage en ligne, multi-utilisateurs.
- Application native (Play Store), notifications push, widgets. (Prévu : empaquetage TWA/Capacitor en V2 sans changer le code.)
- Génération de cartes par IA, OCR.
- Occlusion d'image (V1), export `.apkg` (V1), optimisation des paramètres FSRS dans le navigateur (V1, voir 03-SCHEDULING).
- Jeux de groupe du livret (Record, Poker, Ying Yang), gamification (points, séries, ligues).
- Format `collection.anki21b` (zstd) : détecté et refusé avec un message expliquant comment exporter en format legacy depuis Anki.

## 3. Utilisateur et contexte d'usage

- Un seul utilisateur, francophone, à l'aise avec l'informatique.
- **Création des cartes surtout au clavier sur PC** (Windows, Chrome/Edge/Firefox), par saisie ou import CSV.
- **Révision surtout sur téléphone Android** (Chrome, PWA installée), sessions courtes de 5 à 15 minutes, souvent hors ligne.
- Les données vivent dans le navigateur de chaque appareil ; le transfert entre appareils se fait par **export/import de sauvegarde** (V0). Une synchronisation par fichier (Drive/Dropbox) ou CRDT est envisagée en V2.

## 4. Principes non négociables (issus des preuves)

Ces règles s'appliquent à tout le produit ; le skill `srs-rules` les détaille avec leurs sources.

| # | Règle | Conséquence produit |
|---|---|---|
| P1 | Rappel actif avant feedback | Le verso n'est jamais visible avant que l'utilisateur ait demandé la réponse (bouton ou touche). Option « réponse tapée » avec comparaison. |
| P2 | Feedback systématique | La bonne réponse est toujours affichée avant l'auto-évaluation. |
| P3 | Auto-évaluation simple | FSRS : 4 boutons (Encore / Difficile / Bien / Facile), avec option 2 boutons (Encore / Bien). Leitner : Oublié / Réussi / Sûr. |
| P4 | Espacement réel, par carte | Les échéances sont calculées par carte, jamais « tout revoir ». |
| P5 | Une seule file quotidienne mélangée | L'écran d'accueil propose « Réviser aujourd'hui » toutes cartes dues confondues, entrelacées par paquet. La révision par paquet reste possible mais secondaire. |
| P6 | Plafonds de charge | Nouvelles cartes/jour et révisions/jour par paquet, avec plafond global ; les retards sont triés par récupérabilité croissante, sans pénalité. |
| P7 | Pas d'abandon prématuré | « Retirer » une carte n'est possible qu'après ≥ 3 succès espacés (intervalles ≥ 7 j) ; sinon le bouton est désactivé avec l'explication. « Suspendre » (mettre en pause) reste possible à tout moment. |
| P8 | Cartes atomiques | L'éditeur avertit (sans bloquer) si un champ dépasse 200 caractères ou contient une liste de plus de 4 puces/virgules ; il propose le type « texte à trous ». |
| P9 | Rétention cible visible | FSRS : réglage 0,80–0,97 (défaut 0,90) avec estimation de charge affichée. |
| P10 | Données libres | Export complet à un clic ; aucune donnée n'est hors de portée de l'utilisateur ; le journal de révisions n'est jamais effacé (sauf suppression explicite). |
| P11 | Premier rappel différé | Une nouvelle carte est revue une première fois en séance (10 min) puis au plus tôt le lendemain. |

## 5. Périmètre fonctionnel détaillé

### 5.1 Paquets (decks)

- Arborescence à un niveau (paquet → sous-paquet) suffisante en V0 ; nom, description, couleur/emoji optionnels.
- Paramètres par paquet : planificateur (`fsrs` | `leitner`), nouvelles cartes/jour (défaut 20), révisions/jour (défaut 200), ordre des nouvelles cartes (ordre d'ajout | aléatoire), rétention cible (FSRS), pas d'apprentissage (FSRS), mode Leitner (`interval` | `calendar`), alternance des faces (Leitner, défaut activé), bouton « Sûr » (Leitner, défaut activé), enterrement des sœurs (défaut activé).
- Changer de planificateur sur un paquet existant convertit l'état des cartes (règles en 03-SCHEDULING §4).
- Actions : créer, renommer, déplacer, fusionner, exporter, supprimer (avec confirmation et compte de cartes ; le journal de révisions est conservé dans la sauvegarde exportée automatiquement avant suppression).

### 5.2 Notes, cartes et types

Une **note** porte le contenu ; une note génère une ou plusieurs **cartes** (comme Anki).

| Type | Champs | Cartes générées |
|---|---|---|
| `basic` | Recto, Verso, Extra (optionnel) | 1 : Recto → Verso |
| `basic_reverse` | Recto, Verso, Extra | 2 : Recto → Verso et Verso → Recto |
| `cloze` | Texte, Extra | 1 par index `{{cN::…}}` (syntaxe Anki, indice optionnel `{{c1::réponse::indice}}`) |
| `image_occlusion` (V1) | Image, masques, En-tête, Extra | 1 par groupe de masques rectangulaires (02 §2.1) ; importé/exporté vers le type « Image Occlusion » d'Anki ≥ 23.10 |

- Les champs sont du HTML restreint (gras, italique, listes, `<img src="nom">`, `[sound:nom]`, LaTeX inline `\( … \)` rendu par KaTeX en V1 seulement — en V0 affiché tel quel).
- Tags libres (chaîne, séparés par des espaces), autocomplétion.
- Champ « Source » optionnel (URL ou référence) sur la note.
- Médias : images (JPEG/PNG/WebP/GIF/SVG), audio (MP3/OGG/WebM/M4A). À l'ajout, les images sont redimensionnées côté client (côté max 1 280 px, WebP qualité 0,82 si supporté, sinon JPEG 0,85) ; taille max après traitement 600 Ko pour une image, 3 Mo pour un audio. Les médias sont stockés dans IndexedDB, référencés par nom de fichier unique (voir 02-DATA-MODEL).
- Éditeur : formulaire simple (pas d'éditeur riche en V0), aperçu de la carte, ajout d'image par fichier, collage ou glisser-déposer, enregistrement audio par micro (MediaRecorder) ou fichier. Raccourci Ctrl+Entrée = « Ajouter » (vide le formulaire, garde le focus sur Recto).
- Navigateur de cartes : tableau filtrable (paquet, tag, état, texte), tri, sélection multiple, actions groupées (déplacer, taguer, suspendre, supprimer, réinitialiser la planification — remet les cartes à l'état « nouvelle » sans toucher au journal de révisions — avec double confirmation).
- Détection de doublons à la création (même Recto normalisé dans le même paquet) : avertissement non bloquant.

### 5.3 Révision

- **File du jour** : cartes en apprentissage dues, puis révisions dues (retards d'abord, triés par récupérabilité croissante), puis nouvelles cartes jusqu'aux plafonds ; les paquets sont entrelacés (round-robin) et par défaut une seule carte par note et par jour (« enterrement des sœurs », option `burySiblings` par paquet ; désactivée, les sœurs sont seulement espacées dans la file).
- Écran de carte : recto plein écran, bouton « Afficher la réponse » (Espace/Entrée), puis verso + Extra, boutons de notation avec l'intervalle prévu affiché (FSRS) ou le compartiment cible (Leitner). Raccourcis 1–4 (FSRS) ou 1–3 (Leitner). Mode « réponse tapée » par paquet : champ de saisie, comparaison caractère par caractère, notation proposée mais toujours modifiable.
- Audio : lecture automatique à l'affichage du côté qui le contient (option), bouton de relecture (R).
- Barre de progression de la séance (restant : apprentissage / révisions / nouvelles). Chronomètre par carte (durée enregistrée dans le journal, plafonnée à 60 s pour les stats).
- Actions pendant la révision : annuler la dernière réponse (`rollback`), éditer la carte, suspendre, marquer (drapeau), voir les infos de la carte (état, stabilité, difficulté, historique).
- Fin de séance : résumé (cartes vues, taux de réussite, temps), rappel « une nuit de sommeil avant la prochaine révision » la première fois.
- Le jour change à **04:00 heure locale** (paramètre), comme Anki ; les échéances sont stockées en UTC et comparées au « début de journée » local.

### 5.4 Import

- **CSV/TSV** : détection du séparateur, encodage UTF-8 (BOM géré), aperçu des 20 premières lignes, mappage colonnes → champs (Recto, Verso, Extra, Tags, Paquet), choix du type de note, option « la première ligne est un en-tête », détection des doublons (ignorer | mettre à jour | dupliquer). Les images référencées par URL ne sont pas téléchargées en V0 (message).
- **`.apkg`** : voir 05-IMPORT-EXPORT. Notes, cartes, paquets, tags, médias ; option « importer l'historique de révisions » qui reconstruit l'état FSRS avec `fsrs.reschedule` ; les modèles inconnus sont convertis en `basic` (premier champ → Recto, deuxième → Verso, champs restants concaténés → Extra) avec un rapport d'import.
- **Sauvegarde Recto** (`.recto.zip`) : restauration complète (remplacer | fusionner).

### 5.5 Export

- CSV d'un paquet ou de la sélection (Recto, Verso, Extra, Tags, Paquet, type ; médias non inclus, noms de fichiers conservés).
- Sauvegarde complète `.recto.zip` : `manifest.json` (version du schéma, date, appareil), `data.json` (toutes les tables), `media/` (fichiers). Bouton unique « Sauvegarder maintenant » sur l'accueil ; rappel visible si la dernière sauvegarde date de plus de 7 jours.
- V1 : export `.apkg` legacy.

### 5.6 Statistiques

- Aujourd'hui : dues (apprentissage / révisions / nouvelles), faites, temps, taux de réussite.
- Prévision : histogramme des cartes dues sur 30 jours.
- Rétention réelle (« true retention ») : sur 7 / 30 / 90 jours, part des révisions d'état *Review* notées ≠ Encore ; comparée à la rétention cible.
- Heatmap 365 jours des révisions.
- Répartition des cartes par état (nouvelles, apprentissage, révision, réapprentissage, suspendues, retirées) et, pour Leitner, par compartiment.
- Par paquet : mêmes indicateurs filtrés.

### 5.7 Paramètres

- Heure de début de journée, thème (système/clair/sombre), taille du texte, langue (fr seul en V0, structure prête), raccourcis affichés.
- Stockage : espace utilisé (`navigator.storage.estimate()`), état de persistance, bouton « Demander la persistance », bouton « Vider le cache des médias orphelins ».
- Danger : tout effacer (double confirmation, export préalable proposé).
- À propos : version, licence, liens vers les sources scientifiques.

## 6. Exigences non fonctionnelles

- **Hors ligne** : toutes les fonctions sans réseau après le premier chargement ; mise à jour de l'app proposée par un bandeau « Nouvelle version disponible » avec bouton Recharger (`registerType: 'prompt'`), jamais imposée pendant une séance.
- **Performance** : file du jour calculée en < 200 ms pour 20 000 cartes ; navigateur de cartes virtualisé ; démarrage < 2 s sur un mobile milieu de gamme ; bundle initial < 300 Ko gzip hors WASM (fsrs-browser chargé à la demande).
- **Fiabilité des données** : chaque révision est écrite en une transaction (carte + journal) ; `navigator.storage.persist()` demandé à la première création de carte ; avertissement si le quota estimé est à 80 %.
- **Accessibilité** : navigation clavier complète, focus visible, contraste AA, `prefers-reduced-motion` respecté, cibles tactiles ≥ 44 px, textes alternatifs des images éditables.
- **Confidentialité** : aucune requête réseau hors chargement des assets de l'app ; aucun script tiers ; aucune télémétrie.
- **Compatibilité** : Chrome/Edge ≥ 120 (Android et desktop), Firefox ≥ 120, Safari ≥ 17 (best effort).
- **Qualité** : voir 06-PWA-QUALITY et le skill `quality-gate`. Couverture de tests unitaires ≥ 90 % sur `src/lib/scheduler`, `src/lib/queue`, `src/lib/import`.

## 7. Architecture cible (résumé)

Svelte 5 (runes) + Vite 8 + TypeScript strict ; Dexie 4 (IndexedDB) ; `ts-fsrs` 5 (FSRS-6) ; `fsrs-browser` (WASM, optimiseur, V1) ; `vite-plugin-pwa` ; `sql.js` (lecture et, en V1, écriture `.apkg`, chargé à la demande) ; `fflate` (zip) ; `papaparse` (CSV) ; `dompurify` (rendu HTML des champs). Aucun backend. Déploiement statique (GitHub Pages ou Cloudflare Pages). Détails et justification : 08-DECISIONS.

```
src/
  app.css, App.svelte, main.ts
  lib/
    config/app.ts            nom, version, constantes
    db/                      schéma Dexie, migrations, accès typés
    domain/                  types métier (Deck, Note, Card, Review, Media)
    scheduler/               fsrs.ts (adaptateur ts-fsrs), leitner.ts, index.ts (interface commune)
    queue/                   construction de la file du jour
    import/ csv.ts apkg.ts backup.ts
    export/ csv.ts backup.ts
    media/                   redimensionnement, stockage, URL objets
    stats/                   calculs
    i18n/ fr.ts, t.ts
    ui/                      composants réutilisables
  routes/                    écrans (routeur minimal par hash ou svelte-spa-router)
tests/ unit/ (vitest) e2e/ (playwright)
```

## 8. Livrables et critères d'acceptation

Les jalons M0 à M6 sont définis dans 07-ROADMAP avec leurs critères d'acceptation vérifiables. La V0 est livrée quand M0–M5 sont acceptés ; M6 (optimiseur, occlusion, export apkg) ouvre la V1.

## 9. Glossaire

- **Note / carte** : contenu saisi / unité révisée générée à partir de la note.
- **État FSRS** : `New`, `Learning`, `Review`, `Relearning`. **D** difficulté (1–10), **S** stabilité (jours), **R** récupérabilité (probabilité de rappel).
- **Compartiment (Leitner)** : niveau 1 à 7 de la Memory Box.
- **Retirée** : carte considérée acquise, sortie de la file (réversible). **Suspendue** : carte mise en pause manuellement.
- **Journal de révisions (revlog)** : historique immuable de chaque réponse.
