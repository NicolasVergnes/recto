# API de `scripts/recto_rpkg.py`

Python 3.9 ou plus, bibliothèque standard seulement. Tous les champs sont du **HTML** : un texte brut qui contient `<` ou `&` passe par `html.escape()` (sauf dans une formule, voir `medias.md`).

```python
import sys
sys.path.insert(0, "<dossier du skill>/scripts")
from recto_rpkg import Package, Mask, DeckError, img, sound, pendu, image_size, one_way, two_way
```

## Paquet

| Appel | Effet |
|---|---|
| `Package(now=None)` | Nouveau paquet ; `now` (secondes epoch) fixe les dates, par défaut l'heure courante. |
| `pkg.write("x.rpkg", title=None, description=None, author=None, licence=None, quiet=False) -> Report` | Construit, **vérifie comme Recto l'importera**, affiche le rapport, écrit le fichier `.rpkg`. `title` (par défaut le nom du premier paquet), `description`, `author` et `licence` (« CC BY 4.0 », « CC BY-SA 4.0 », « CC0 1.0 »…) s'affichent dans Recto avant l'import. Lève `DeckError` (avec le rapport) s'il y a une erreur : rien n'est écrit. |
| `pkg.settings(paquet, …)` | Réglages et description d'un paquet (section « Réglages du paquet » ci-dessous). |
| `python recto_rpkg.py check x.rpkg` | Vérifie un `.rpkg` existant : code 0 si importable, 1 sinon. Un paquet Anki (`.apkg`) ne se vérifie pas ici : Recto l'importe directement. |

Les méthodes `add_*` et `settings` lèvent `DeckError` dès qu'une note serait mal importée (champ inconnu, question vide, doublon, média absent…) : le message dit quoi corriger.

Arguments communs des notes :

- `deck` : nom du paquet, `"Matière::Chapitre"` pour un sous-paquet (un niveau ; un de plus est refusé).
- `tags` : liste (`["histoire", "dates"]`) ou chaîne (`"histoire dates"`) ; pas d'espace dans un tag.
- `guid` : identifiant stable de la note (Recto le garde : réimporter le paquet régénéré met la note à jour). Par défaut, il dérive du type et du premier champ (texte sans HTML, noms d'images gardés) ; deux notes de même type et même premier champ sont refusées comme doublon. Le donner (`guid=f"dep-{numero}"`) quand le premier champ peut changer d'une génération à l'autre.
- `suspended=True` : cartes importées suspendues (utile pour une carte triviale).

## Types intégrés

```python
pkg.add_basic(deck, front, back, extra="", tags=(), guid=None, suspended=False)
```
Paire réversible : une carte, posée Recto → Verso puis Verso → Recto. `extra` s'affiche après la réponse, dans les deux sens. Chaque face est une étiquette à réponse unique (« Terre : périmètre » ↔ « 40 075 km »), jamais une question « … ? » (charte R9) ; pour une relation à sens unique, `add_question`.

```python
pkg.add_question(deck, question, answer, explanation="", source="", tags=(), guid=None, suspended=False)
```
Question à sens unique : une note Basique qui n'est jamais retournée (« Ne jamais retourner cette note »), une carte ; `explanation` puis `source` (en italique) dans son champ Extra, sous la réponse.

```python
pkg.add_cloze(deck, text, extra="", tags=(), guid=None, suspended=False)
```
Texte à trous : `{{c1::réponse}}`, `{{c1::réponse::indice}}` ; une carte par numéro, les trous de même numéro sont cachés ensemble. Un trou = un mot, un nombre, une expression courte (charte R7).

```python
pkg.add_sequence(deck, title, items, window=1, numbered=True, extra="", tags=(), guid=None, suspended=False) -> int
```
Liste **ordonnée** en trous chevauchants (charte R6) : une note à trous par élément, qui ne montre que ses `window` voisins de chaque côté et, si `numbered`, son rang. `add_sequence("Astronomie", "Planètes, du Soleil vers l'extérieur", ["Mercure", "Vénus", "Terre", …])` donne « Planètes, du Soleil vers l'extérieur — 3/8 : …, Vénus, [Terre], Mars, … ». `guid` sert de préfixe (`guid-1`, `guid-2`…). Renvoie le nombre de notes. Pour un ensemble sans ordre, ne pas s'en servir (une carte par élément, ou des groupes de 4 au plus).

```python
pendu(answer, keep=1) -> str
```
Indice récupérateur « façon pendu » (charte R10) : un trait par caractère, les `keep` premiers révélés, espaces rendus par « / ». `pendu("1515")` → `1 _ _ _`, `pendu("Strasbourg", 2)` → `St _ _ _ _ _ _ _ _`, `pendu("Rio de Janeiro")` → `R _ _ / _ _ / _ _ _ _ _ _ _`. À placer dans la question d'un `add_question` / `one_way` (`f"Marignan : année ({pendu('1515')})"`) ou comme indice d'un trou (`{{c1::1515::1 _ _ _}}`). Jamais dans une face `two_way` (elle deviendrait une réponse).

```python
pkg.add_occlusion(deck, image, masks, header="", extra="", hide_all=True, alt="", tags=(), guid=None, suspended=False)
```
Occlusion d'image : `image` est un nom rendu par `add_media` ; une carte par groupe de masques. `header` s'affiche des deux côtés, `extra` après la réponse. `hide_all=True` : tous les masques cachent leur zone, celui de la carte est mis en évidence ; `False` : seul le masque de la carte est dessiné.

```python
Mask(group, x, y, w, h, answer="")                         # coordonnées normalisées 0–1, origine en haut à gauche
Mask.from_pixels(group, left, top, width, height, image=(largeur, hauteur), answer="", padding=0)
```
Plusieurs masques du même `group` sont révélés ensemble (une seule carte). `answer` est la réponse affichée après la demande et attendue en réponse tapée : la donner pour chaque groupe. Côté minimal d'un masque : 0,5 % de l'image.

## Types personnalisés

```python
t = pkg.note_type(name, fields, templates, css=None)     # templates = [one_way(…), two_way(…), …]
one_way(nom, question, réponse)   # « A → B » : toujours posée ainsi ; réponse = "{{FrontSide}}<hr id=answer>…"
two_way(nom, face1, face2)        # « A ↔ B » : UNE carte, posée par la face 1 puis par la face 2
pkg.add_note(t, deck, fields, tags=(), guid=None, suspended=False)   # fields = {champ: html} ou liste
```

- `one_way` : une carte si la question rendue n'est pas vide (et dépend de la note). Un tuple `(nom, question, réponse)` vaut `one_way`.
- `two_way` : une seule carte, demandée par la face 1, puis par la face 2 après une réussite (réglage « Interroger dans les deux sens » du paquet, actif par défaut ; indicateur « ↔ Sens inversé »). Chaque face s'écrit seule : pas de `{{FrontSide}}` (refusé). La carte n'existe que si **les deux** faces ont un contenu.
- Syntaxe des modèles : `{{Champ}}`, `{{FrontSide}}` (dans une réponse `one_way`), `{{#Champ}}…{{/Champ}}`, `{{^Champ}}…{{/Champ}}`, `{{text:Champ}}`, `{{type:Champ}}`. Un champ inconnu ou `{{cloze:…}}` est refusé.
- Le nom du type fixe son identifiant : régénérer avec le même nom et les mêmes champs réutilise le type déjà importé.
- Un type peut avoir deux champs ou plus, autant de modèles que voulu. `css` est ignoré : Recto centre et met en forme lui-même.

Exemple : la note demandée « Carte de France avec le département en couleur, Nom, Numéro, Préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » :

```python
pkg = Package()
dep = pkg.note_type(
    "Département",
    fields=["Carte", "Nom", "Numéro", "Préfecture", "Région"],
    templates=[
        one_way("Carte → Nom", "{{Carte}}<br>Quel département ?",
                "{{FrontSide}}<hr id=answer><b>{{Nom}}</b> ({{Numéro}}), préfecture {{Préfecture}}<br>{{Région}}"),
        # Chaque face dit ce qu'on cherche de l'autre côté : posée seule, « Bas-Rhin » ne dirait pas
        # s'il faut trouver le numéro ou la préfecture, et « 67 » ne dirait pas qu'on cherche un département.
        two_way("Nom ↔ Numéro", "<b>{{Nom}}</b><br><i>numéro ?</i>", "<b>{{Numéro}}</b><br><i>département ?</i>"),
        two_way("Nom ↔ Préfecture", "<b>{{Nom}}</b><br><i>préfecture ?</i>",
                "<b>{{Préfecture}}</b><br><i>département ?</i>"),
    ],
)
for d in departements:                      # liste de dicts : numero, nom, prefecture, region
    carte = pkg.add_media(f"cartes/departement_{d['numero']}.png")
    pkg.add_note(dep, "Départements", {
        "Carte": img(carte, "Carte de France, un département en orange"),
        "Nom": d["nom"], "Numéro": d["numero"], "Préfecture": d["prefecture"], "Région": d["region"],
    }, tags=["departements"], guid=f"dep-{d['numero']}")
pkg.settings("Départements", description="Les 101 départements français",
             later=[(dep, "Nom ↔ Numéro"), (dep, "Nom ↔ Préfecture")])   # « Carte → Nom » d'abord
pkg.write("departements.rpkg", author="…", licence="CC BY 4.0")
```

Résultat : 3 cartes par note, dans un seul paquet : Carte → Nom toujours dans ce sens, Nom ↔ Numéro et Nom ↔ Préfecture posées tantôt dans un sens, tantôt dans l'autre (numéro et préfecture sont uniques : chaque face n'a qu'une réponse). Recto n'affiche ni le nom du modèle ni le nom du champ pendant la révision (seulement un badge « ↔ Sens inversé ») : c'est la face qui dit ce qu'on cherche. Convention : **valeur en gras, puis en italique l'attribut demandé de l'autre côté** (« Bas-Rhin / numéro ? », « 67 / département ? », « Strasbourg / département ? ») ; une face partagée par deux cartes d'une note (« Département : Bas-Rhin » pour Nom ↔ Numéro et Nom ↔ Préfecture) est signalée (charte R5). Le champ Région n'est demandé par aucune carte, il sert de contexte dans les réponses ; pour l'apprendre, ajouter `one_way("Nom → Région", "{{Nom}} : région", "{{FrontSide}}<hr id=answer>{{Région}}")`, pas un `two_way` (plusieurs départements par région : le sens inverse serait ambigu, charte R9).

## Réglages du paquet

```python
pkg.settings("Vocabulaire", description="Anglais, niveau A2", new_per_day=10, reviews_per_day=None,
             new_order="added", typed_answer=True, autoplay_audio=True, alternate_sides=None,
             later=[(type, "Nom du modèle"), "cloze"], new_by_format=False)
```

Tous les arguments sont facultatifs ; `None` laisse le réglage par défaut de Recto. Ils s'appliquent **quand l'import crée le paquet** (jamais à un paquet que l'utilisateur a déjà) ; l'utilisateur peut les changer ensuite. Le planificateur (FSRS ou boîte de Leitner) et la rétention se choisissent dans Recto, pas dans le paquet.

- `new_per_day`, `reviews_per_day` : plafonds (entiers ≥ 0) ; `new_order` : `"random"` (défaut de Recto) ou `"added"` (ordre du script).
- `typed_answer` : réponse tapée, comparée caractère par caractère ; `autoplay_audio` : lecture automatique des sons ; `alternate_sides` : notes basiques et `two_way` posées dans les deux sens (défaut `True`).
- `later` : formats dont les nouvelles cartes attendent, activés plus tard dans les réglages du paquet : `(type, "nom du modèle")` pour une carte d'un type personnalisé, ou `"basic"`, `"question"`, `"cloze"`, `"occlusion"`. `new_by_format=True` : les nouvelles cartes viennent format après format, dans l'ordre des modèles.

## Médias

```python
name = pkg.add_media("chemin/fichier.png")            # nom = nom du fichier
name = pkg.add_media(octets, name="schema.svg")       # octets produits en mémoire
img(name, alt="description")                          # <img src="…" alt="…"> à mettre dans un champ
sound(name)                                           # [sound:…] à mettre dans un champ
image_size(octets) -> (largeur, hauteur) | None       # PNG, JPEG, GIF, WebP, SVG
```

Formats acceptés par Recto : images `png jpg jpeg webp gif svg`, sons `mp3 ogg opus webm m4a` (pas de `wav`). Un média ajouté mais cité par aucune note est laissé de côté (avertissement). Un média cité mais non ajouté est une erreur.

## Rapport

`write()` et `check` affichent : notes, cartes, médias, cartes par paquet, puis chaque type de note avec ce que Recto en fera et l'aperçu de sa première note, carte par carte. Ensuite viennent les avertissements regroupés (balises retirées, images sans `alt`, champs trop longs, images de plus de 1 280 px (paquet lourd : les réduire avant), doublons probables), puis la section **« Charte de rédaction »** et les erreurs. `report.charte` donne ces avertissements seuls (`{clé: [exemples]}`).

Avertissements « charte » (`reference/format-cartes.md`) : ils n'empêchent pas l'écriture, mais chacun se corrige ou se justifie à la livraison.

| Clé | Ce qui est détecté |
|---|---|
| charte R1 | réponse de plus de 25 mots |
| charte R4 | question de reconnaissance (« est-ce que », vrai/faux, options a) b) c)), réponse oui/non, question ouverte (« décris », « parle-moi de », « résume ») |
| charte R5 | la question contient la réponse (pour un `one_way`, la valeur du champ demandé) ; la réponse d'un trou se lit ailleurs dans le texte ; même question rendue pour plusieurs notes d'un modèle |
| charte R6 | question « cite / quels sont les… » ; réponse ou trou qui est une liste de plus de 4 éléments |
| charte R7 | trou de plus de 6 mots ; texte à trous presque sans contexte |
| charte R8 | `alt` d'une image de la question qui contient un mot de la réponse |
| charte R9 | face « … ? » dans une note basique ou un `two_way` ; verso ou face identique pour plusieurs notes (sens inverse ambigu) |

Ce que la vérification ne voit pas (à relire soi-même sur l'aperçu) : un nom écrit sur une image, une carte qui n'est répondable qu'avec ses voisines, un fait non daté, l'absence de cartes « pourquoi / comment » dans un paquet de concepts.
