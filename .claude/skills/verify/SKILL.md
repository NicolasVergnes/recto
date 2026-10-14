---
name: verify
description: Recette pour vérifier Recto à l'exécution (navigateur piloté par Playwright) — build, spec temporaire, jeux de données, pièges. À charger pour /verify ou pour observer une modification dans l'application réelle.
---

# Vérifier Recto à l'exécution

## Lancer

1. `npm run build` (dist/ servi tel quel).
2. Écrire un spec **temporaire** `tests/e2e/zz-<nom>.tmp.spec.ts` (journaliser avec `console.log`, captures `page.screenshot` dans le scratchpad), puis :
   `PW_PORT=<port libre> npx playwright test zz-<nom> --project=desktop --reporter=line --workers=1`
   Le `webServer` de `playwright.config.ts` démarre `vite preview` sur ce port.
3. Supprimer le spec à la fin (ne jamais le committer).

Pièges d'environnement (Windows) :
- `npx vite preview` lancé seul en arrière-plan s'arrête sans message : passer par le `webServer` de Playwright.
- Un port déjà utilisé par une exécution précédente peut faire expirer le `webServer` (60 s) : changer `PW_PORT`.
- Pas de `curl` ni de boucle d'attente shell : laisser Playwright attendre.

## Données

- Paquet d'exemple : bouton « Essayer avec un paquet d'exemple » (101 cartes, texte seul).
- `data/samples/*.apkg` : fixtures (dont `multi-template.apkg`, type à 4 cartes).
- `docs/Les_dpartements_franais.apkg` s'il est présent : vrai paquet AnkiWeb (101 notes, 404 cartes, images). **Non suivi par git, ne jamais le committer** (`git add -A docs` l'embarque : ajouter les fichiers un par un).
- Chaque test Playwright a sa propre base IndexedDB : « Tout effacer » et les restaurations n'affectent rien d'autre.

## Parcours utiles

- Import Anki : `/#/import` › « Paquet Anki (.apkg) » › `setInputFiles` › bouton « Importer N notes ».
- Sauvegarde : Paramètres › « Sauvegarder maintenant » (`waitForEvent('download')`) ; ses compteurs se lisent sans restaurer en chargeant le fichier dans « Sauvegarde Recto » (ligne « Paquets : … révisions : … »).
- Mosaïque : `/#/cards`, radios « Mosaïque » / « Mosaïque recto-verso », sélecteur « Taille » ; une face déborde si `.side.scrollHeight > clientHeight`.

## Lire la page

- Toasts : `.toast` ; ils s'empilent (prendre `.last()`).
- Texte sur plusieurs lignes dans le balisage : `toContainText`, pas une RegExp sur `getByText`.
- Valeurs chargées par `liveQuery` (compteurs) : attendre avec `expect(...).toContainText` avant de lire.
- Toutes les cartes d'une note peuvent passer le même jour (M13, plus de `burySiblings`) ; chaque lot de la file (apprentissage, retards, du jour, nouvelles) est dans un ordre aléatoire stable dans la journée : ne pas attendre un ordre précis en révision.
