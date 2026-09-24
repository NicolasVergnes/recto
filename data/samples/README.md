# Jeux d'essai (`data/samples`)

Fixtures utilisées par les tests unitaires et e2e et par le bouton « Essayer avec un paquet d'exemple ». Ne pas modifier sans mettre à jour les tests qui les lisent (`tests/unit/import/*.test.ts`, `tests/e2e/*.spec.ts`).

| Fichier | Format | Contenu | Sert à tester |
|---|---|---|---|
| `departements.csv` | CSV, `;`, UTF-8 avec BOM, en-tête `recto;verso;extra;tags;deck` | 101 départements français (numéro → nom, préfecture en Extra), paquet `Géographie::Départements` | Détection du séparateur `;` et du BOM, en-tête, colonne `deck` avec sous-paquet, paquet d'exemple de l'accueil (101 cartes) |
| `drapeaux.csv` | TSV, en-tête `recto	verso	tags` | 10 drapeaux dont le recto est `<img src="flag-xx.svg">` (fichiers absents) + 1 carte texte | Séparateur tabulation, guillemets échappés, **rapport de médias manquants** (10 fichiers), conservation des références |
| `cloze.csv` | CSV, `,`, tout entre guillemets, en-tête `texte,extra,tags` | 5 textes à trous (1 à 3 trous, un indice `::`) | Détection automatique du type `cloze`, génération d'une carte par index (9 cartes attendues), indice |
| `sample-legacy.apkg` | zip : `collection.anki21` (SQLite schéma 11), `media` (JSON), `0` (PNG 64×64) | 2 modèles (Basic, Cloze), 3 paquets (`Default` vide, `Géographie`, `Géographie::Départements`), 4 notes, 5 cartes (1 en révision avec 3 entrées de revlog, 3 nouvelles, 1 suspendue), 1 image référencée par la note cloze | Import `.apkg` complet : hiérarchie, modèles, états, `queue = -1`, médias, replay du revlog (`ease` 3 ×3 : learn, review, review) |
| `unsupported-anki21b.apkg` | zip : `collection.anki21b` (octets factices avec magic zstd), `collection.anki2` vide, `media` binaire, `meta` | Rien de lisible | Refus propre avec le message `import.anki21b` (erreur typée `Anki21bUnsupported`) |

## Valeurs attendues pour `sample-legacy.apkg`

- `col.crt = 1699934400` (secondes) ; la carte en révision a `due = 5` → échéance = `crt + 5 × 86400` s.
- Carte `1700000002001` : `type 2`, `ivl 10`, `factor 2500`, `reps 3` ; revlog aux instants `crt + 10 min` (type 0, learn), `crt + 1 j + 1 h` (type 1), `crt + 5 j + 1 h` (type 1), tous `ease = 3`.
- Note cloze `1700000001003` : champs `La {{c1::Lune}} tourne autour de la {{c2::Terre}}.<br><img src="lune.png">` / `Satellite naturel` → 2 cartes (`ord` 0 et 1).
- Note `1700000001004` : carte `queue = -1` → `suspended = true` après import.
- Média : `lune.png`, 410 octets, `sha256` à recalculer dans le test (ne pas coder en dur une valeur non vérifiée).

## Provenance

Fixtures **synthétiques**, générées le 25/09/2026 par script (Python `sqlite3` + `zipfile`), conformes au schéma legacy 11 d'Anki tel que documenté par le wiki AnkiDroid (« Database Structure »). Elles n'ont **pas** été réimportées dans Anki desktop : si un test d'interopérabilité avec Anki est souhaité, exporter un vrai paquet depuis Anki avec l'option « Prise en charge des anciennes versions d'Anki » et l'ajouter ici sous un autre nom (les paquets AnkiWeb sont sous licence de leurs auteurs : ne pas les commiter).
