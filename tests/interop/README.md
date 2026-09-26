# Interopérabilité Anki (vérification manuelle)

Vérifie qu'un `.apkg` produit par l'export de Recto (`src/lib/export/apkg.ts`, 05 §4) s'importe dans le **vrai moteur d'Anki** (paquet PyPI `anki`, le même code Rust qu'Anki desktop). Ce contrôle n'est **pas** lancé par `npm run verify` : Python et le paquet `anki` ne sont pas des dépendances du projet.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-sample.test.ts` | Écrit `test-results/interop/recto-sample.apkg` (ou `$RECTO_APKG_OUT` ; heure de début du jour d'étude : `$RECTO_DAY_START`, 4 par défaut) à partir de la collection représentative de `tests/helpers/apkg-collection.ts` : basique, inversée, texte à trous, sous-paquet, paquets FSRS et Memory Box, historique, carte suspendue, carte retirée, drapeau, médias (un absent). |
| `build-dst-sample.test.ts` | Écrit `recto-dst-h4.apkg`, `recto-dst-h22.apkg` et `recto-dst-h23.apkg` (dans `$RECTO_APKG_DIR`, par défaut `test-results/interop`) : une carte en retard depuis l'autre côté d'un changement d'heure (donc `crt` aussi) et une carte due dans 3 jours, pour trois heures de début de journée ; écrit les `due − today` attendus dans `recto-dst-expected.json`. |
| `build-occlusion-sample.test.ts` | Écrit `recto-occlusion.apkg` : une note d'occlusion d'image (4 masques, groupes 1, 2 et 4, réponses, mode « tout cacher ») avec l'image de `data/samples/image-occlusion.apkg`. `check_apkg.py` vérifie alors qu'Anki relit les masques (`get_image_occlusion_note`) et crée une carte par groupe. |
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
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-occlusion.apkg /tmp/anki-check-4 --twice
```

Heure d'été (fuseau des tests : `Europe/Paris`, cf. `tests/setup.ts`) : l'étape 2 écrit aussi les paquets `recto-dst-h*.apkg` et, dans `recto-dst-expected.json`, les `due − today` attendus pour chacun ; les importer avec le même fuseau et comparer au champ `due` moins `today` de la sortie (cartes repérées par `front`) :

```sh
for h in 4 22 23; do TZ=Europe/Paris PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-dst-h$h.apkg /tmp/anki-dst-$h; done
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
- Occlusion d'image (`recto-occlusion.apkg`, `--twice`) : 1 note nouvelle puis 1 doublon, type « Recto · Occlusion d'image » (type natif d'Anki, `originalStockKind` 6), 4 formes relues par `get_image_occlusion_note`, cartes `ord` 0, 1 et 3 = groupes 1, 2 et 4, image `carte-france.png` (6 308 octets), « Vérifier la base de données » sans problème. L'affichage des masques dans Anki desktop (script du modèle) n'est pas vérifiable sans interface : à contrôler à la main.
- Heure d'été (2026-09-25, `crt` en heure d'hiver, import en heure d'été) : `overdue` −253, −253 et −252 jours, `soon` +3 pour 4 h, 22 h et 23 h, comme attendu. Sans `conf.creationOffset`, 22 h et 23 h donnaient un jour de trop (05 §4).

AnkiDroid : les versions récentes embarquent, semble-t-il, le même moteur d'import ; non vérifié directement (à tester à la main sur le téléphone).
