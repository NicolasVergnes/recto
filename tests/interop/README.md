# Interopérabilité Anki (vérification manuelle)

Vérifie qu'un `.apkg` produit par l'export de Recto (`src/lib/export/apkg.ts`, 05 §4) s'importe dans le **vrai moteur d'Anki** (paquet PyPI `anki`, le même code Rust qu'Anki desktop). Ce contrôle n'est **pas** lancé par `npm run verify` : Python et le paquet `anki` ne sont pas des dépendances du projet.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-sample.test.ts` | Écrit `test-results/interop/recto-sample.apkg` (ou `$RECTO_APKG_OUT` ; heure de début du jour d'étude : `$RECTO_DAY_START`, 4 par défaut) à partir de la collection représentative de `tests/helpers/apkg-collection.ts` : basique, inversée, texte à trous, sous-paquet, paquets FSRS et Memory Box, historique, carte suspendue, carte retirée, drapeau, médias (un absent). |
| `vitest.config.ts` | Configuration Vitest dédiée (hors `tests/unit`). |
| `check_apkg.py` | Importe un `.apkg` dans une collection Anki neuve, affiche un résumé JSON (journal d'import, cartes, `revlog`, médias, « Vérifier la base de données ») puis un verdict ; code de sortie 1 en cas de problème. |

## Procédure

```sh
# 1. Moteur Anki (≈ 40 Mo, une fois) dans un dossier hors du dépôt
pip install --target /tmp/pyanki anki

# 2. Paquet de test
npx vitest run --config tests/interop/vitest.config.ts

# 3. Import (le dossier de travail ne doit pas exister)
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-sample.apkg /tmp/anki-check-1 --twice
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-sample.apkg /tmp/anki-check-2 --twice --fsrs
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-sample.apkg /tmp/anki-check-3 --aged
```

Options : `--twice` réimporte le paquet (les notes doivent revenir en doublons, pas en nouvelles notes), `--fsrs` active FSRS dans la collection cible, `--aged` recule la création de la collection cible de 100 jours (les échéances en jours doivent être recalées : `due = today + n`).

Pour un paquet réel : exporter depuis Recto (Paramètres › « Exporter pour Anki (.apkg) ») et passer ce fichier à `check_apkg.py`.

## Attendu (anki 26.9.3, 2026-09-25)

- Import 1 : 6 notes nouvelles, 8 cartes, 15 entrées `revlog` identiques à la source (`ease`, `ivl`, `lastIvl`, `type`, `time`), médias `bip.mp3` et `lune.png`.
- Paquets `Boîte`, `Géo`, `Géo::Départements` ; types de notes « Recto · Basique », « Recto · Basique et inversée », « Recto · Texte à trous » sans copie « + ».
- États : révision (`type 2`, échéance en jours recalée), apprentissage et réapprentissage (`queue 1`, échéance en secondes), nouvelles (`due` = position), suspendue et retirée (`queue -1`), drapeau conservé ; état mémoire FSRS (stabilité, difficulté) conservé pour les paquets FSRS, absent pour Memory Box.
- Import 2 (`--twice`) : 0 nouvelle, 6 doublons.
- « Vérifier la base de données » : aucun problème (hors la ligne « Database rebuilt and optimized. »).
- Verdict `OK`, code de sortie 0.

AnkiDroid : les versions récentes embarquent, semble-t-il, le même moteur d'import ; non vérifié directement (à tester à la main sur le téléphone).
