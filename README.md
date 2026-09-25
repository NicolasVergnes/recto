# Recto

Application de flashcards à répétition espacée : locale-first, hors ligne, sans compte ni serveur. Deux planificateurs : FSRS-6 et la boîte à sept compartiments de la « Memory Box ». Import CSV et Anki (`.apkg`), sauvegarde complète en un clic.

**Adresse : <https://nicolasvergnes.github.io/recto/>** — à activer une fois dans GitHub : _Settings → Pages → Source : GitHub Actions_ ; chaque fusion sur `main` republie ensuite l'application (`.github/workflows/pages.yml`).

Statut : **V0 livrée** (jalons M0 à M5) ; **V1 (M6) en relecture** : occlusion d'image, export Anki, optimiseur FSRS, formules. Voir `docs/STATUS.md` et `CHANGELOG.md`.

## Installer sur Android

1. Ouvrir l'adresse ci-dessus dans **Chrome**.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »), puis confirmer.
3. Lancer Recto depuis son icône : l'application s'ouvre en plein écran et fonctionne **sans réseau** dès la première visite terminée.
4. Dans **Paramètres → Stockage**, demander le stockage persistant : le navigateur n'effacera plus vos cartes pour libérer de la place.

Quand une nouvelle version est publiée, un bandeau « Nouvelle version disponible » propose de recharger ; rien ne se recharge pendant une révision.

Sur ordinateur, Chrome et Edge proposent aussi l'installation (icône dans la barre d'adresse) ; Firefox et Safari utilisent l'application dans un onglet.

## Premiers pas

- **Essayer avec un paquet d'exemple** (accueil) : 101 départements français, pour voir une session sans rien saisir.
- **Créer un paquet**, puis **Ajouter** des notes : recto/verso, recto/verso + inverse, ou texte à trous (`{{c1::réponse}}`). Images (fichier, appareil photo sur Android, coller ou glisser) et sons (fichier ou micro) sont stockés sur l'appareil.
- **Réviser aujourd'hui** : cherchez la réponse, affichez-la, puis notez honnêtement **Encore / Difficile / Bien / Facile** (FSRS) ou **Oublié / Réussi / Sûr** (Memory Box). Chaque bouton annonce le prochain intervalle.
- Clavier : `Espace` ou `Entrée` affiche la réponse, `1` à `4` notent, `Ctrl+Z` annule la dernière note, `E` modifie la carte, `R` réécoute le son.
- **Cartes** : recherche, filtres, modification et actions groupées ; **Statistiques** : charge prévue sur 30 jours, rétention réelle, calendrier de l'année.
- **Occlusion d'image** (type « Occlusion d'image » dans l'éditeur) : choisissez une image, tracez un rectangle sur chaque zone à cacher (ou « Ajouter un masque » puis les flèches du clavier), donnez éventuellement la réponse de chaque masque. Chaque masque — ou groupe de masques portant le même « Carte n° » — devient une carte : la zone demandée est cachée, puis s'ouvre quand vous affichez la réponse.
- **Formules** : écrivez `\( x^2 \)` dans un champ pour une formule en ligne, `\[ … \]` pour une formule centrée (rendu KaTeX, aussi hors ligne).
- **Paramètres de mémoire FSRS** : dans les paramètres d'un paquet FSRS, à partir de 1 000 révisions, « Optimiser » calcule des paramètres adaptés à votre historique et les compare aux actuels avant que vous les appliquiez.

## Sauvegarder

Toutes les données restent dans le navigateur de l'appareil : **la sauvegarde est votre seule copie de secours.**

- **Paramètres → Sauvegarde → Sauvegarder maintenant** produit un fichier `recto-sauvegarde-AAAA-MM-JJ-HHMM.recto.zip` (cartes, historique, médias, réglages). Sur Android, la feuille de partage permet de l'envoyer vers Drive, un e-mail ou Fichiers.
- L'accueil rappelle de sauvegarder au-delà de 7 jours sans sauvegarde.
- **Importer → Sauvegarde Recto** restaure un fichier : _Remplacer toutes les données_ (l'appareil devient identique à la sauvegarde ; les données actuelles sont d'abord téléchargées) ou _Fusionner avec les données actuelles_ (ajoute ce qui manque, garde la version la plus récente de chaque note).
- Pour passer sur un nouveau téléphone : sauvegarder sur l'ancien, restaurer sur le nouveau.

## Importer depuis Anki

1. Dans Anki (ordinateur) : _Fichier → Exporter_, format **Paquet de cartes Anki (`.apkg`)**, cocher **« Inclure les informations de planification »** et **« Inclure les médias »**, et **« Prise en charge des anciennes versions d'Anki »** (le nouveau format compressé n'est pas lu).
2. Dans Recto : **Importer → Paquet Anki (.apkg)**, choisir le fichier. Un résumé s'affiche (paquets, types de notes, médias, révisions).
3. Choisir : garder les paquets Anki ou tout mettre dans un seul paquet, le planificateur (FSRS ou Memory Box), la reprise de l'historique des révisions.
4. Le rapport final liste les notes créées, les types de notes convertis et les médias manquants.

Réimporter le même paquet met à jour les notes modifiées dans Anki au lieu de créer des doublons (une note dont les cartes changeraient — type de note, trous ou masques ajoutés ou retirés — est laissée telle quelle et comptée parmi les doublons ignorés). Les notes « Image Occlusion » d'Anki (≥ 23.10) deviennent des occlusions d'image Recto.

## Exporter vers Anki

**Exporter (CSV, Anki)** sur la page d'un paquet (ou d'une sélection dans **Cartes**), format **Paquet Anki (.apkg)** ; toute la collection : **Paramètres › Sauvegarde › Exporter pour Anki (.apkg)**. Le fichier contient notes, cartes, planification, historique et médias ; dans Anki : _Fichier › Importer_. Vérifié avec le moteur d'Anki 26.9 ; les versions plus anciennes et AnkiDroid restent à essayer. Les cartes retirées arrivent suspendues ; les réponses des masques d'occlusion, qu'Anki ne sait pas afficher, sont gardées dans le champ « Comments » et reviennent si le paquet est réimporté dans Recto.

## Importer un tableur (CSV)

**Importer → Fichier CSV ou TSV**. Séparateur détecté automatiquement (`,` `;` tabulation `|`), UTF-8. Colonnes par défaut : 1 → Recto, 2 → Verso, 3 → Extra ; une colonne `tags` et une colonne `deck` (`Parent::Enfant` pour un sous-paquet) sont reconnues. Un aperçu permet de changer le mappage et signale les doublons avant l'import. Des exemples sont dans `data/samples/`.

L'export CSV (depuis un paquet, ou une sélection dans **Cartes**) produit `Recto;Verso;Extra;Tags;Paquet;Type`, lisible par Excel ; les médias n'y sont pas inclus et les occlusions d'image non plus (un message les compte) : pour tout garder, utiliser la sauvegarde ou l'export Anki.

## Ce que Recto ne fait pas

Pas de compte, pas de serveur, pas de synchronisation, pas de télémétrie, pas d'IA, pas de notifications ni de gamification. Rien ne quitte l'appareil, sauf les fichiers que vous exportez vous-même.

## Développement

Svelte 5 (runes) + Vite 8 + TypeScript strict, Dexie 4 (IndexedDB), ts-fsrs 5, vite-plugin-pwa. Node 22.

```
npm install
npm run dev            # http://localhost:5173
npm run check          # svelte-check + tsc
npm run lint           # eslint
npm run test           # vitest (+ couverture ≥ 90 % sur scheduler, queue, import)
npm run e2e            # playwright (build + preview automatiques)
npm run verify         # porte de qualité complète (check, lint, format, test, build, e2e)
npm run icons          # icônes PWA depuis public/logo.svg
```

`BASE_PATH=/recto/ npm run build` produit la version publiée sous un sous-chemin (GitHub Pages). Le routage par `#` évite toute configuration serveur.

## Contenu du dépôt

```
src/                      application (lib/ : domaine pur, db, import, export, ui ; routes/ : écrans)
tests/                    unit/ (vitest), e2e/ (playwright), helpers/
docs/                     cahier des charges 01–08, STATUS.md (état courant)
data/samples/             jeux d'essai CSV et .apkg
CLAUDE.md                 instructions pour Claude Code
PROMPT-KICKOFF.md         prompts de lancement, session par session
.claude/                  permissions et skills de Claude Code
Dossier-Flashcards.html   état de l'art, méthode, audit des applications
```
