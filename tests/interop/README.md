# Interopérabilité Anki (vérification manuelle)

Vérifie qu'un `.apkg` produit par l'export de Recto (`src/lib/export/apkg.ts`, 05 §4) s'importe dans le **vrai moteur d'Anki** (paquet PyPI `anki`, le même code Rust qu'Anki desktop) : paquets représentatifs, types de notes personnalisés (M8) et aller-retour d'un vrai paquet AnkiWeb par-dessus l'original. Ce contrôle n'est **pas** lancé par `npm run verify` : Python et le paquet `anki` ne sont pas des dépendances du projet.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-sample.test.ts` | Écrit `test-results/interop/recto-sample.apkg` (ou `$RECTO_APKG_OUT` ; heure de début du jour d'étude : `$RECTO_DAY_START`, 4 par défaut) à partir de la collection représentative de `tests/helpers/apkg-collection.ts` : basique, inversée, texte à trous, sous-paquet, paquets FSRS et Memory Box, historique, carte suspendue, carte retirée, drapeau, médias (un absent). |
| `build-dst-sample.test.ts` | Écrit `recto-dst-h4.apkg`, `recto-dst-h22.apkg` et `recto-dst-h23.apkg` (dans `$RECTO_APKG_DIR`, par défaut `test-results/interop`) : une carte en retard depuis l'autre côté d'un changement d'heure (donc `crt` aussi) et une carte due dans 3 jours, pour trois heures de début de journée ; écrit les `due − today` attendus dans `recto-dst-expected.json`. |
| `build-occlusion-sample.test.ts` | Écrit `recto-occlusion.apkg` : une note d'occlusion d'image (4 masques, groupes 1, 2 et 4, réponses, mode « tout cacher ») avec l'image de `data/samples/image-occlusion.apkg`. `check_apkg.py` vérifie alors qu'Anki relit les masques (`get_image_occlusion_note`) et crée une carte par groupe. |
| `build-custom-sample.test.ts` | Écrit `recto-custom.apkg` à partir de `customTypeCollection` (`tests/helpers/apkg-collection.ts`) : un type personnalisé « Mot de vocabulaire » (4 champs, 3 modèles de carte dont un derrière une section `{{#Exemple}}…{{/Exemple}}` et un à réponse saisie `{{type:Mot}}`), 4 notes dont une sans exemple (son modèle à section rend une question vide : pas de carte, 11 cartes en tout), historique rejoué par les vrais planificateurs, une carte suspendue, un paquet FSRS et un paquet Memory Box. Écrit aussi `recto-custom-expected.json` : comptes, cartes par modèle (`ord`), questions et réponses telles que Recto les rend. |
| `build-departements-roundtrip.test.ts` | Aller-retour du **vrai** paquet AnkiWeb « Les départements français » (101 notes, 404 cartes, un type « Departements » à 5 champs et 4 modèles, 101 images), passé par `$RECTO_REAL_APKG` (jamais copié dans le dépôt ; le test est ignoré sans cette variable) : lu comme l'application le lit, planifié comme un import dans une collection Recto vide (`planApkgImport`, options par défaut de l'application), puis exporté (`buildApkg`) vers `recto-departements.apkg` et `recto-departements-expected.json`. Vérifie dans le test les comptes côté Recto (101 notes, 404 cartes, 1 type à 5 champs et 4 modèles, 101 images). |
| `expected.ts` | Écrit par les deux tests précédents : ce que Recto s'attend à voir dans Anki (`check_apkg.py --expect`), avec la même normalisation que le script. |
| `vitest.config.ts` | Configuration Vitest dédiée (hors `tests/unit`). |
| `check_apkg.py` | Importe un `.apkg` dans une collection Anki neuve, affiche un résumé JSON (journal d'import, cartes, `revlog`, médias, types de notes, « Vérifier la base de données ») puis un verdict ; code de sortie 1 en cas de problème. Avec `--base`, importe d'abord un paquet de base (aller-retour). |

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

# 4. Type de note personnalisé (M8) : l'étape 2 a aussi écrit recto-custom.apkg et recto-custom-expected.json
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-custom.apkg /tmp/anki-check-5 --twice --expect test-results/interop/recto-custom-expected.json
```

Aller-retour d'un vrai paquet (ici « Les départements français » d'AnkiWeb, 101 notes, 404 cartes, un type « Departements » à 5 champs et 4 modèles). Le paquet reste hors du dépôt, passé par `RECTO_REAL_APKG` ; sans cette variable, le test d'aller-retour est ignoré. Le test lit le paquet, le planifie comme un import dans une collection Recto vide, l'exporte, puis `check_apkg.py --base` importe ce paquet exporté **par-dessus l'original**, comme le ferait Nicolas en réimportant son export dans son Anki :

```sh
export RECTO_REAL_APKG=/chemin/vers/Les_dpartements_franais.apkg
npx vitest run --config tests/interop/vitest.config.ts tests/interop/build-departements-roundtrip.test.ts
D=test-results/interop/recto-departements

# 5a. Réglages par défaut d'Anki desktop (types : pas de fusion, mise à jour si plus récent)
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py $D.apkg /tmp/anki-check-6 --base "$RECTO_REAL_APKG" --desktop-defaults --twice --brief --expect $D-expected.json
# 5b. Même chose avec « Fusionner les types de notes »
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py $D.apkg /tmp/anki-check-7 --base "$RECTO_REAL_APKG" --desktop-defaults --merge-notetypes true --twice --brief --expect $D-expected.json
# 5c. Contournement : « Mettre à jour les types de notes » sur « Jamais »
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py $D.apkg /tmp/anki-check-8 --base "$RECTO_REAL_APKG" --desktop-defaults --update-notetypes never --twice --brief --expect $D-expected.json
# 5d. L'export seul, dans une collection neuve
PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py $D.apkg /tmp/anki-check-9 --twice --brief --expect $D-expected.json
```

Heure d'été (fuseau des tests : `Europe/Paris`, cf. `tests/setup.ts`) : l'étape 2 écrit aussi les paquets `recto-dst-h*.apkg` et, dans `recto-dst-expected.json`, les `due − today` attendus pour chacun ; les importer avec le même fuseau et comparer au champ `due` moins `today` de la sortie (cartes repérées par `front`) :

```sh
for h in 4 22 23; do TZ=Europe/Paris PYTHONPATH=/tmp/pyanki python3 tests/interop/check_apkg.py test-results/interop/recto-dst-h$h.apkg /tmp/anki-dst-$h; done
```

Options : `--twice` réimporte le paquet (les notes doivent revenir en doublons, pas en nouvelles notes), `--fsrs` active FSRS dans la collection cible, `--aged` recule la création de la collection cible de 100 jours (les échéances en jours doivent être recalées : `due = today + n`).

Options de l'aller-retour et des types de notes (sans elles, le script se comporte comme avant : fusion des types activée, mise à jour des notes et des types « si plus récent ») :

- `--base BASE.apkg` importe d'abord `BASE.apkg` avec les réglages que propose Anki desktop (ceux que rend le moteur, voir « Réglages par défaut » plus bas), puis le paquet vérifié. Le paquet vérifié est alors censé être un **réexport de la base** : il ne doit ajouter ni note, ni carte, ni paquet, ne pas copier de type de note (nom en « + ») et laisser les types de la base tels quels (nom, champs et leurs options, noms et texte des modèles, champ de tri, CSS ; seul `mod` peut changer). Le verdict liste ce qui n'est pas respecté (`base_notetype_changes` détaille les attributs modifiés, `notetypes_added` les types ajoutés).
- `--merge-notetypes {true,false}`, `--update-notes` et `--update-notetypes {if-newer,always,never}` règlent l'import du paquet vérifié ; `--desktop-defaults` reprend ces trois réglages du moteur (une option explicite l'emporte). La planification reste importée (c'est ce que le contrôle regarde).
- `--expect FICHIER.json` compare au moteur ce que le test attend : nombres de notes, de cartes, de cartes par modèle (`ord`) et de lignes `revlog`, lignes `revlog` du paquet présentes dans Anki, et pour chaque carte d'une note personnalisée la question et la réponse rendues par Recto contre `render_output()` d'Anki (au caractère près, espaces réduits ; le repère `[[type:Champ]]` d'une réponse saisie est ignoré, Recto n'affiche rien).
- `--brief` n'imprime ni le détail de chaque carte ni la liste des médias (gros paquets) ; `cards_by_ord` et `media_count` restent.

Le résumé liste les types de notes après chaque import (`notetypes_detail`, sans les types d'origine d'une collection neuve tant qu'aucune note ne s'en sert) : nom, identifiant, champs, modèles, champ de tri, `mod`, nombre de notes, et des empreintes (8 premiers chiffres hexadécimaux de SHA-1) du CSS, des options des champs et du recto et du verso de chaque modèle. Le cache Python de `col.models` n'est pas rafraîchi par un import : le script le vide avant chaque lecture, sans quoi un type mis à jour par l'import apparaît inchangé.

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

## Attendu : types personnalisés et aller-retour (anki 26.9.3, 2026-10-10)

Réglages par défaut d'Anki desktop : ceux que le moteur rend pour son dialogue d'import (`get_import_anki_package_presets()` sur une collection neuve, rien n'étant encore enregistré) : fusion des types de notes **désactivée**, mise à jour des notes **« si plus récent »**, mise à jour des types de notes **« si plus récent »**, planification et préréglages de paquet non importés. L'ancienne procédure (sans `--desktop-defaults`) importait avec la fusion activée : inchangé.

- Type personnalisé (`recto-custom.apkg`, `--twice --expect`) : import 1 = 4 notes nouvelles, 11 cartes (`ord` 0 : 4, `ord` 1 : 3, `ord` 2 : 4 ; la note « sempiternel », sans exemple, n'a pas de carte pour le modèle à section `{{#Exemple}}…{{/Exemple}}`, comme dans Recto), 16 lignes `revlog` présentes dans Anki avec les mêmes `ease`, `ivl`, `lastIvl`, `type` et `time` ; import 2 = 0 nouvelle, 4 doublons. Un seul type, « Mot de vocabulaire » (identifiant = `createdAt` du type Recto, 4 champs, 3 modèles dans l'ordre), sans copie « + » ni type « Recto · … » inutilisé (Anki n'importe que les types utilisés). Carte suspendue en `queue -1`, état mémoire FSRS conservé pour le paquet FSRS et absent pour Memory Box. Les 11 questions et les 11 réponses rendues par Anki (`render_output()`) sont identiques à celles de Recto, section comprise ; pour la réponse saisie `{{type:Mot}}`, Anki ajoute le repère `[[type:Mot]]` que Recto n'affiche pas (ignoré par le script). « Vérifier la base de données » : aucun problème. Verdict `OK`.
- Export seul (5d : `recto-departements.apkg`, collection neuve, `--twice`) : 101 notes nouvelles puis 101 doublons ; 404 cartes (101 par `ord`) ; un seul type « Departements » (identifiant 1342705100181 = celui du paquet d'origine, 5 champs, 4 modèles), pas de type « Recto · … » ; 101 médias ; un paquet « RB - Les départements français (101) » ; les 404 questions et réponses rendues par Anki sont identiques à celles de Recto ; « Vérifier la base de données » sans problème ; verdict `OK`.
- Export par-dessus le paquet d'origine (`--base`), réglages par défaut d'Anki desktop **comme avec la fusion** (5a et 5b) : le type est **réutilisé** (même identifiant, aucune copie « Departements+ », aucun type ajouté), les notes reviennent en **doublons** (101 ; ni nouvelles, ni mises à jour, ni conflits), 404 cartes, 101 médias (mêmes noms), un seul paquet (rattaché par son nom), « Vérifier la base de données » sans problème, 404 questions et réponses identiques à celles de Recto, et **le type d'Anki reste tel quel** : depuis M10, l'import garde le `mod` du type Anki (date du type dans Recto), son CSS, ses préambules LaTeX et son champ de tri, et l'export les rend (`resolveNoteType`, `customModel`) ; « si plus récent » ne voit donc rien de plus récent. Verdict `OK` (2026-10-10). Avec la fusion, Anki remet seulement `mod` à l'heure de l'import. Avant M10, le type d'Anki était remplacé (CSS 263 → 153 caractères, champ de tri 2 → 0, police des champs, préambule LaTeX) : verdict `note type 'Departements' of the base was altered`.
- « Mettre à jour les types de notes : jamais » (5c) : type de la base intact, verdict `OK`. Un type modifié dans Recto (nom, modèles) a une date récente : Anki le met à jour avec le CSS, le champ de tri et les préambules d'origine ; restent ceux de Recto les options des champs (police Arial 20) et le paquet par défaut du type. Ajouter, retirer ou réordonner un champ ou un modèle change le **schéma** du type pour Anki : avec ses réglages par défaut, il crée une copie « Nom+ » et laisse les notes de côté (conflits) ; cocher « Fusionner les types de notes ».
- Non-régression : les procédures 1 à 4 (`recto-sample.apkg --twice`, `--twice --fsrs`, `--aged`, `recto-occlusion.apkg --twice`) et les trois paquets d'heure d'été donnent le verdict `OK` ; leur résumé est identique à celui de l'ancienne version du script, aux clés nouvelles près (`anki`, `import_options`, `cards_by_ord`, `notetypes_detail`, `media_count`).

Ce que ces contrôles ne voient pas : tout ce qui demande l'interface (affichage des cartes, CSS appliquée, script du modèle d'occlusion, saisie de la réponse `{{type:…}}`, fenêtre d'import, synchronisation AnkiWeb), les autres importeurs (Anki antérieur à 2.1.50, AnkiDroid, AnkiMobile), et la collection réelle de l'utilisateur (autres types, extensions, historique de synchronisation) ; la réduction des images de plus de 1 280 px à l'import de l'application n'est pas rejouée par le test d'aller-retour (sans effet ici : les 101 images du paquet font au plus 374 px de côté).

AnkiDroid : les versions récentes embarquent, semble-t-il, le même moteur d'import ; non vérifié directement (à tester à la main sur le téléphone).
