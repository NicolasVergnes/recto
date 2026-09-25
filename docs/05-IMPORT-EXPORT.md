# 05 — Import et export : CSV, `.apkg` Anki, sauvegarde

## 1. CSV / TSV (`src/lib/import/csv.ts`)

- Bibliothèque : `papaparse` (`header: false`, `skipEmptyLines: 'greedy'`, `delimiter: ''` = détection automatique parmi `,` `;` `\t` `|`). Lire le fichier en texte UTF-8 ; retirer le BOM ; accepter CRLF.
- Mappage par défaut : colonne 1 → Recto, 2 → Verso, 3 → Extra, colonne nommée `tags` → Tags (séparés par espaces), `deck` → Paquet (créé si absent, `::` pour un sous-paquet). Si la première ligne contient `recto|front|question|texte|text|cloze` (insensible à la casse) on la traite comme en-tête. Pour le type `cloze`, les colonnes mappées sont Texte et Extra (une colonne « verso » éventuelle est fusionnée dans Extra).
- Type de note : `basic` par défaut ; `cloze` si le champ Recto contient `{{c1::` ; `basic_reverse` sur choix de l'utilisateur.
- Doublons : clé = `deckId + normalize(front)` (`normalize` : NFC, minuscules, espaces réduits, HTML retiré). Stratégies : `skip` (défaut), `update` (remplace Verso/Extra/Tags, conserve cartes et journal), `duplicate`.
- Références média : `<img src="x.png">` et `[sound:x.mp3]` sont conservées telles quelles ; un rapport liste les fichiers manquants dans `media` (import de médias par sélection multiple de fichiers proposé après le CSV).
- Limites : 50 000 lignes par fichier ; traitement par lots de 500 dans des transactions séparées avec barre de progression ; import annulable (les lots déjà écrits restent, le rapport le dit).
- Export CSV : mêmes colonnes, séparateur `;` (Excel FR) ou `\t` au choix, UTF-8 avec BOM, guillemets échappés par `papaparse.unparse`. Les notes d'occlusion d'image (V1) n'ont pas de forme CSV et sont laissées de côté (la sauvegarde et l'export `.apkg` les gardent) ; à l'import, une ligne CSV n'est jamais considérée comme doublon d'une note d'occlusion (« mettre à jour » écraserait ses masques).

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
- **Occlusion d'image** (V1) : un modèle `type = 1` dont un template contient `image-occlusion` (type natif « Image Occlusion » d'Anki ≥ 23.10 ; noms de champs traduits, d'où la détection par le template) → `image_occlusion` : champs dans l'ordre [Occlusion, Image, En-tête, Back Extra, Comments] → [Image, masques, En-tête, Back Extra + Comments]. Chaque forme `{{cN::image-occlusion:rect:left=…:top=…:width=…:height=…[:oi=1]}}` devient un masque du groupe N (`oi=1` sur une forme → mode « tout cacher ») ; ellipses, polygones et formes tournées deviennent leur rectangle englobant, les formes texte et les coordonnées en pixels sont ignorées (comptées dans le rapport) ; une note sans masque lisible est une erreur « occlusion d'image sans masque lisible ». Fixture : `data/samples/image-occlusion.apkg` (exportée par Anki).
- **Modèles** : `type = 1` → `cloze` (champ 0 → Texte, champ 1 → Extra, autres concaténés). `type = 0` avec 1 template → `basic` (champ 0 → Recto, champ 1 → Verso, reste → Extra concaténé avec `<br>`) ; avec 2 templates dont l'un a `{{Back}}`/`{{Verso}}` en question → `basic_reverse` ; sinon `basic` + entrée dans le rapport « modèle N converti, M champs fusionnés ». Le CSS du modèle est ignoré.
- **Notes** : `guid` → `sourceGuid` (déduplication à la réimportation : mise à jour des champs si `mod` plus récent, sinon note ignorée ; ignorée aussi quand la mise à jour changerait ses cartes — autre type de note, trou ajouté ou retiré — car une mise à jour ne touche ni aux cartes ni au journal, elle compte alors parmi les doublons ignorés). Une note existante est reconnue par `sourceGuid ?? id`, la clé qu'écrit l'export (§4) : un paquet exporté par Recto puis réimporté ne crée pas de doublons. Tags découpés sur espaces, LaTeX `[latex]…[/latex]` (ainsi que `[$]…[/$]` et `[$$]…[/$$]`) conservé tel quel et affiché en source ; les formules MathJax `\( … \)` et `\[ … \]` sont rendues par KaTeX.
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

`src/lib/export/apkg.ts` (pur : `sql.js`, `now` et `dayStartHour` en paramètres ; asynchrone pour SHA-1 seulement), exécuté dans un Web Worker (`src/lib/export/apkg.worker.ts`, sql.js chargé comme à l'import) ; données lues par `src/lib/db/export-apkg.ts` (une transaction en lecture, octets des médias lus après). Portée : un paquet avec ses sous-paquets ou la sélection du navigateur (dialogue « Exporter », format CSV ou Paquet Anki), ou toute la collection (Paramètres › Sauvegarde › « Exporter pour Anki (.apkg) »). Planification et historique toujours inclus (Anki a son propre choix à l'import). Cible : Anki et AnkiDroid ; seul le moteur d'import d'Anki 26.9.3 est vérifié (`tests/interop/`) : Anki 2.1.50 à 2.1.x et AnkiDroid restent **à vérifier** à la main (le texte d'aide ne cite donc qu'Anki).

- **Archive** (`fflate`) : `collection.anki21`, `media` (JSON `{"0": "nom.png"}`), entrées `0`, `1`… stockées sans compression. **Écart avec la version initiale de ce document** (`collection.anki2`) : la base est écrite en `collection.anki21` avec `conf.schedVer = 2`, comme le fait Anki ; sans `schedVer 2`, Anki la traite comme planificateur v1 et réécrit les `ease` d'apprentissage du journal.
- **Base** : schéma 11 complet (`col`, `notes`, `cards`, `revlog`, `graves` et leurs index), `col.ver = 11`, `conf.rollover = dayStartHour`, `conf.creationOffset` = décalage UTC de `crt` (minutes à l'ouest), un préréglage de paquet « Default ». Requêtes préparées dans `BEGIN…COMMIT` ; nombres liés en `double` (jamais de `BigInt`) et stockés en entiers par l'affinité des colonnes.
- **Types de notes** : quatre modèles à identifiants et `mod` fixes, aux noms distinctifs (une réimportation dans Anki les réutilise, sans copie « + », et n'écrase pas un type modifié dans Anki) : « Recto · Basique » (Recto, Verso, Extra), « Recto · Basique et inversée » (2 modèles de carte, le 2ᵉ demande `{{Verso}}`), « Recto · Texte à trous » (Texte, Extra, `{{cloze:Texte}}`), « Recto · Occlusion d'image » : copie du type natif « Image Occlusion » d'Anki ≥ 23.10 (`type = 1`, `originalStockKind = 6`, champs Occlusion, Image, Header, Back Extra, Comments avec leurs `tag` 0–4, modèle et CSS d'Anki 26.9) pour que le script d'Anki dessine les masques et que son éditeur de masques ouvre ces notes. Champs d'une note d'occlusion : `{{cN::image-occlusion:rect:left=…:top=…:width=…:height=…[:oi=1]}}` par masque (joints par `<br>`, nombres sans zéros inutiles, `oi=1` en mode « tout cacher »), l'image, l'en-tête, l'extra, et dans Comments (non affiché par Anki) les réponses des masques (`2 : Lyon`), qu'Anki ne sait pas représenter ; réimportées dans Recto, elles rejoignent l'extra. Vérifié avec le moteur d'Anki 26.9.3 (`tests/interop/`).
- **Paquets** : `Parent::Enfant`, parents inclus ; `Default` (id 1) toujours présent, réutilisé par un paquet Recto nommé « Default ».
- **Notes** : `id` = `createdAt` (ms ; les lignes étant écrites par date croissante, identifiant précédent + 1 s'il est déjà atteint, en temps constant même quand des milliers de cartes partagent un instant), `guid = sourceGuid ?? id` (stable : réexporter met à jour ou ignore au lieu de dupliquer, dans Anki comme dans Recto), `mod` = `updatedAt` (s), tags ` a b `, `sfld` = premier champ sans HTML (noms d'images conservés), `csum` = 8 premiers chiffres hexadécimaux de SHA-1(`sfld`) (Anki recalcule les deux à l'import).
- **Cartes** : `id` = `createdAt` (même règle de collision), `ord` inchangé, `flags` = drapeau, `reps`/`lapses` copiés ; `suspended` **ou `retired`** → `queue = −1` (Anki n'a pas d'équivalent à « retirée » : signalé dans le rapport) ; f(D) = clamp(round((11 − D) × 500), 1300, 5000), inverse de la conversion à l'import, pour FSRS, 2500 pour Memory Box.

  | Recto | `type` | `queue` | `due` | `ivl` | `factor` | `left` |
  |---|---|---|---|---|---|---|
  | Nouvelle | 0 | 0 | position (ordre de création, partagée par les cartes d'une note) | 0 | 0 | 0 |
  | Apprentissage | 1 | 1 | secondes epoch | 0 | f(D) | étapes restantes (≥ 1) |
  | Révision | 2 | 2 | jours depuis `crt` | `scheduledDays` (≥ 1) | f(D) | 0 |
  | Réapprentissage | 3 | 1 | secondes epoch | round(stabilité) (≥ 1) | f(D) | étapes restantes (≥ 1) |

  `cards.data` : `{"s", "d", "dr", "lrt"}` (état mémoire FSRS, paquets FSRS seulement) ou `{"lrt"}` (date de dernière révision, que « Vérifier la base de données » ajouterait sinon). `col.crt` : sa date locale est le « jour 0 » d'Anki, ici le jour d'étude de l'échéance de révision la plus ancienne (au plus aujourd'hui), donc toutes les échéances en jours sont ≥ 0. Anki lit cette date avec `conf.creationOffset` : sans lui, il la lirait avec le décalage UTC du moment de l'import, et une `crt` en heure d'hiver importée en heure d'été décalait toutes les échéances d'un jour pour un début de journée à 22 h ou 23 h (vérifié avec Anki 26.9.3, corrigé par `creationOffset`). `crt` est placé à mi-chemin entre le début du jour d'étude et minuit pour que `crt + n × 86 400 s` (lecture par l'import de Recto) reste dans le bon jour malgré l'heure d'été : la marge, (24 − h)/2 heures, couvre le décalage d'une heure jusqu'à un début de journée à 22 h. **Limite connue à 23 h** : si `crt` est en heure d'été et l'échéance en heure d'hiver, la réimportation dans Recto avance cette échéance d'un jour d'étude (Anki n'est pas concerné) ; aucun `crt` ne convient à la fois à Anki et à ce calcul. La correction relève de l'import (ajouter des jours calendaires à la date de `crt` au lieu de secondes), qui a le même défaut avec les paquets d'Anki. Anki recale les échéances sur son propre « aujourd'hui » à l'import (vérifié).
- **Journal** : une ligne `revlog` par `Review` des cartes exportées, par `reviewedAt` croissant : `id` = `reviewedAt` (ms, +1 si collision ; Anki ignore les `id` déjà présents), `ease` = note, `ivl` = jours (≥ 1) ou −secondes si l'état après est Apprentissage/Réapprentissage, `lastIvl` = `ivl` précédent de la carte, `factor` = f(D avant) ou 2500, `time` = durée (≤ 60 s), `type` = 0 si l'état avant est Nouvelle ou Apprentissage, 1 Révision, 2 Réapprentissage.
- **Médias** : seuls les fichiers référencés par les notes exportées (`<img src>`, `[sound:]`) ; ceux absents de la table `media` sont listés dans le rapport.
- **Non transmis** : réglages des paquets, compartiments et `sideFlipped` Memory Box (réimporté dans Recto sans historique, le compartiment est déduit de l'intervalle ; avec historique, il est rejoué), champ `source` des notes.
- **Rapport** (dans le dialogue ou sous le bouton des Paramètres) : notes, cartes, révisions, médias, médias manquants, cartes retirées exportées comme suspendues.
- **Tests** : `tests/unit/export-apkg.test.ts` (SQL brut, identifiants uniques, aller-retour `readApkg` + `planApkgImport` avec et sans historique, FSRS et Memory Box, réimport sans doublons), `tests/unit/db/export-apkg.test.ts` (portées), `tests/e2e/export-apkg.spec.ts` ; contrôle manuel avec le moteur d'Anki : `tests/interop/README.md`.
