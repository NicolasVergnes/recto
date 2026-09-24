# 05 — Import et export : CSV, `.apkg` Anki, sauvegarde

## 1. CSV / TSV (`src/lib/import/csv.ts`)

- Bibliothèque : `papaparse` (`header: false`, `skipEmptyLines: 'greedy'`, `delimiter: ''` = détection automatique parmi `,` `;` `\t` `|`). Lire le fichier en texte UTF-8 ; retirer le BOM ; accepter CRLF.
- Mappage par défaut : colonne 1 → Recto, 2 → Verso, 3 → Extra, colonne nommée `tags` → Tags (séparés par espaces), `deck` → Paquet (créé si absent, `::` pour un sous-paquet). Si la première ligne contient `recto|front|question|texte|text|cloze` (insensible à la casse) on la traite comme en-tête. Pour le type `cloze`, les colonnes mappées sont Texte et Extra (une colonne « verso » éventuelle est fusionnée dans Extra).
- Type de note : `basic` par défaut ; `cloze` si le champ Recto contient `{{c1::` ; `basic_reverse` sur choix de l'utilisateur.
- Doublons : clé = `deckId + normalize(front)` (`normalize` : NFC, minuscules, espaces réduits, HTML retiré). Stratégies : `skip` (défaut), `update` (remplace Verso/Extra/Tags, conserve cartes et journal), `duplicate`.
- Références média : `<img src="x.png">` et `[sound:x.mp3]` sont conservées telles quelles ; un rapport liste les fichiers manquants dans `media` (import de médias par sélection multiple de fichiers proposé après le CSV).
- Limites : 50 000 lignes par fichier ; traitement par lots de 500 dans des transactions séparées avec barre de progression ; import annulable (les lots déjà écrits restent, le rapport le dit).
- Export CSV : mêmes colonnes, séparateur `;` (Excel FR) ou `\t` au choix, UTF-8 avec BOM, guillemets échappés par `papaparse.unparse`.

Fixture : `data/samples/departements.csv`, `data/samples/drapeaux.csv` (références d'images sans fichiers, pour tester le rapport de médias manquants), `data/samples/cloze.csv`.

## 2. Paquets Anki `.apkg` (`src/lib/import/apkg.ts`)

### 2.1 Structure du fichier

Archive ZIP (lue avec `fflate` : `unzipSync` ou `Unzip` en flux pour les gros fichiers) contenant :

| Entrée | Contenu |
|---|---|
| `collection.anki21` | Base SQLite (schéma 11), format « legacy 2 » — **prioritaire** si présente |
| `collection.anki2` | Base SQLite legacy 1 (souvent un stub d'une note « à mettre à jour » quand `anki21` existe) |
| `collection.anki21b` | Base SQLite compressée **zstd** (format actuel) — **non supporté en V0** : détecter et afficher `import.anki21b` |
| `media` | JSON `{ "0": "nom-réel.jpg", "1": "son.mp3", … }` : mappe les entrées numériques du zip vers les noms de fichiers (au format `anki21b`, ce fichier est un protobuf zstd) |
| `0`, `1`, … | Fichiers médias |
| `meta` | Protobuf (format récent) — ignoré |

Ordre de détection : si `collection.anki21b` existe et pas `collection.anki21` → refus avec message ; sinon ouvrir `anki21` ou à défaut `anki2`.

### 2.2 Lecture SQLite

`sql.js` (WASM) chargé à la demande : `const SQL = await initSqlJs({ locateFile: f => \`${import.meta.env.BASE_URL}sql/${f}\` })` avec le `.wasm` copié dans `public/sql/` au build (script `postinstall` ou plugin Vite `viteStaticCopy`). Exécution dans un **Web Worker** pour ne pas bloquer l'interface (`src/lib/import/apkg.worker.ts`), messages de progression.

Tables utiles :

```sql
-- col : une ligne
SELECT crt, models, decks FROM col;
-- crt : création de la collection en secondes epoch (base des "due" en jours)
-- models : JSON { "<mid>": { id, name, type (0 standard, 1 cloze), flds: [{name, ord}], tmpls: [{name, ord, qfmt, afmt}], css } }
-- decks  : JSON { "<did>": { id, name } }  -- "Parent::Enfant" pour la hiérarchie

SELECT id, guid, mid, mod, tags, flds FROM notes;
-- flds : champs séparés par U+001F ; tags : " tag1 tag2 " (espaces de bord)

SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards;
-- type : 0 new, 1 learning, 2 review, 3 relearning
-- queue : -1 suspendue, -2/-3 enterrée, 0 new, 1 learn, 2 review, 3 day-learn
-- due : new → position ; review → jours depuis col.crt ; learn → secondes epoch
-- ivl : jours (négatif = secondes) ; factor : facilité en ‰ (2500 = 250 %)

SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id;
-- id : epoch ms de la révision ; ease 1–4 ; type 0 learn, 1 review, 2 relearn, 3 filtered, 4 manual
```

### 2.3 Conversion

- **Paquets** : `decks` → paquets Recto (hiérarchie sur un niveau : `A::B::C` devient `A::B` → sous-paquet `C` ; au-delà, le nom est aplati). Option « tout importer dans un seul paquet ».
- **Modèles** : `type = 1` → `cloze` (champ 0 → Texte, champ 1 → Extra, autres concaténés). `type = 0` avec 1 template → `basic` (champ 0 → Recto, champ 1 → Verso, reste → Extra concaténé avec `<br>`) ; avec 2 templates dont l'un a `{{Back}}`/`{{Verso}}` en question → `basic_reverse` ; sinon `basic` + entrée dans le rapport « modèle N converti, M champs fusionnés ». Le CSS du modèle est ignoré.
- **Notes** : `guid` → `sourceGuid` (déduplication à la réimportation : mise à jour des champs si `mod` plus récent). Tags découpés sur espaces, LaTeX `[latex]…[/latex]` conservé tel quel.
- **Cartes** : créer une carte Recto par carte Anki (`ord` conservé ; pour `basic_reverse`, `ord` 0/1). État :
  - `queue = -1` → `suspended = true`.
  - Sans historique importé : `type 0` → `New` ; `type 2` → `Review` avec `due = crt + due×86400 s`, `scheduledDays = ivl`, `stability = ivl` (approximation), `difficulty = clamp(11 − factor/1000 × 2, 1, 10)` ; `type 1/3` → `Learning` due maintenant. Pour un paquet cible Leitner, `box` selon la table de 03-SCHEDULING §4.
  - Avec historique (`revlog`, option cochée) : pour chaque carte, rejouer les entrées `type ∈ {0,1,2}` (ignorer 3 et 4) avec `const { collections, reschedule_item } = fsrs.reschedule(createEmptyCard(), history)` où `history = [{ rating: ease, review: new Date(id) }]` ; la carte finale est `reschedule_item?.card`, les journaux Recto sont dérivés de `collections[i].log` ; écrire les `Review` Recto correspondants (`scheduler = 'fsrs'`, `durationMs = time`). Pour Leitner, rejouer via `leitner.answer` séquentiellement.
- **Médias** : lire `media` (JSON), copier chaque fichier dans la table `media` sous son nom réel (renommer en cas de collision de nom avec un contenu différent : suffixe `-2`, et réécrire la référence dans les champs). Calculer `sha256` avec `crypto.subtle.digest`. Images > 1 280 px redimensionnées comme à la saisie (option « conserver les originaux »).
- **Rapport** : paquets créés, notes/cartes/médias importés, modèles convertis, fichiers média manquants, entrées ignorées, durée.

### 2.4 Tests

- `data/samples/sample-legacy.apkg` : fixture synthétique générée (voir `data/samples/README.md`) : 1 modèle basique, 1 modèle cloze, 3 paquets (`Default` vide, `Géographie`, sous-paquet `Géographie::Départements`), 4 notes, 5 cartes, 3 entrées de revlog, 1 image. Les tests vérifient les comptes, les états et la présence du média.
- Test de refus : `data/samples/unsupported-anki21b.apkg` (`collection.anki21b` factice, `collection.anki2` vide, `media` binaire, `meta`) → erreur typée `Anki21bUnsupported`.
- Test de robustesse : zip corrompu, base sans table `revlog`, `media` absent.

## 3. Sauvegarde Recto (`src/lib/export/backup.ts`, `src/lib/import/backup.ts`)

Format en 02-DATA-MODEL §5. Zip construit en flux avec `fflate` (`Zip` + `ZipDeflate` pour `data.json`, `ZipPassThrough` pour les médias déjà compressés). Téléchargement via `<a download>` (fonctionne dans la PWA installée). Sur mobile, proposer aussi le partage natif (`navigator.share({ files })`) si disponible.

Restauration : valider `manifest.format === 'recto-backup'` et `schemaVersion ≤ courant` (migrer si inférieur avec les mêmes fonctions `upgrade`) ; prévisualiser les comptes ; « Remplacer » ou « Fusionner » (02-DATA-MODEL §5).

## 4. Export `.apkg` (V1)

Générer une base `collection.anki2` avec `sql.js` (schéma 11 minimal : `col` avec un modèle basique/cloze, `notes`, `cards`, `revlog`), fichier `media` JSON et entrées numériques ; zipper avec `fflate`. Cible : réimportable dans Anki desktop ≥ 2.1.50 et AnkiDroid. Hors périmètre V0.
