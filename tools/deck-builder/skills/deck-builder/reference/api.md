# API de `scripts/recto_apkg.py`

Python 3.9 ou plus, bibliothèque standard seulement. Tous les champs sont du **HTML** : un texte brut qui contient `<` ou `&` passe par `html.escape()` (sauf dans une formule, voir `medias.md`).

```python
import sys
sys.path.insert(0, "<dossier du skill>/scripts")
from recto_apkg import Package, Mask, DeckError, img, sound, image_size
```

## Paquet

| Appel | Effet |
|---|---|
| `Package(now=None)` | Nouveau paquet ; `now` (secondes epoch) fixe les dates, par défaut l'heure courante. |
| `pkg.write("x.apkg", quiet=False) -> Report` | Construit, **vérifie comme Recto l'importera**, affiche le rapport, écrit le fichier. Lève `DeckError` (avec le rapport) s'il y a une erreur : rien n'est écrit. |
| `python recto_apkg.py check x.apkg` | Vérifie un `.apkg` existant (le tien ou un paquet Anki) : code 0 si importable, 1 sinon. |

Les méthodes `add_*` lèvent `DeckError` dès qu'une note serait mal importée (champ inconnu, question vide, doublon, média absent…) : le message dit quoi corriger.

Arguments communs des notes :

- `deck` : nom du paquet, `"Matière::Chapitre"` pour un sous-paquet (un niveau).
- `tags` : liste (`["histoire", "dates"]`) ou chaîne (`"histoire dates"`) ; pas d'espace dans un tag.
- `guid` : identifiant stable de la note. Par défaut, il dérive du type et du premier champ (texte sans HTML, noms d'images gardés) ; deux notes de même type et même premier champ sont refusées comme doublon. Le donner (`guid=f"dep-{numero}"`) quand le premier champ peut changer d'une génération à l'autre.
- `suspended=True` : cartes importées suspendues (utile pour une carte triviale).

## Types intégrés

```python
pkg.add_basic(deck, front, back, extra="", tags=(), guid=None, suspended=False)
```
Paire réversible : une carte, posée Recto → Verso puis Verso → Recto. `extra` s'affiche après la réponse, dans les deux sens.

```python
pkg.add_question(deck, question, answer, explanation="", source="", tags=(), guid=None, suspended=False)
```
Question à sens unique (type « Recto · Question ») : une carte, jamais retournée ; `explanation` puis `source` (en italique) sous la réponse.

```python
pkg.add_cloze(deck, text, extra="", tags=(), guid=None, suspended=False)
```
Texte à trous : `{{c1::réponse}}`, `{{c1::réponse::indice}}` ; une carte par numéro, les trous de même numéro sont cachés ensemble.

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
t = pkg.note_type(name, fields, templates, css=None)     # templates = [(nom, question, réponse), …]
pkg.add_note(t, deck, fields, tags=(), guid=None, suspended=False)   # fields = {champ: html} ou liste
```

- Une carte par modèle dont la question rendue n'est pas vide (et dépend de la note).
- Syntaxe des modèles : `{{Champ}}`, `{{FrontSide}}`, `{{#Champ}}…{{/Champ}}`, `{{^Champ}}…{{/Champ}}`, `{{text:Champ}}`, `{{type:Champ}}`. Un champ inconnu ou `{{cloze:…}}` est refusé.
- Le nom du type fixe son identifiant : régénérer avec le même nom et les mêmes champs réutilise le type déjà importé.
- `css` sert à Anki seulement ; Recto centre et met en forme lui-même.

Exemple : la note demandée « Carte de France avec le département en couleur, Nom, Numéro, Préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » :

```python
pkg = Package()
dep = pkg.note_type(
    "Département",
    fields=["Carte", "Nom", "Numéro", "Préfecture", "Région"],
    templates=[
        ("Carte → Nom", "{{Carte}}<br>Quel département ?",
         "{{FrontSide}}<hr id=answer><b>{{Nom}}</b> ({{Numéro}})<br>{{Région}}"),
        ("Nom → Numéro", "Numéro du département : <b>{{Nom}}</b> ?", "{{FrontSide}}<hr id=answer><b>{{Numéro}}</b>"),
        ("Numéro → Nom", "Département n° <b>{{Numéro}}</b> ?", "{{FrontSide}}<hr id=answer><b>{{Nom}}</b>"),
        ("Nom → Préfecture", "Préfecture : <b>{{Nom}}</b> ?", "{{FrontSide}}<hr id=answer><b>{{Préfecture}}</b>"),
        ("Préfecture → Nom", "<b>{{Préfecture}}</b> est la préfecture de… ?",
         "{{FrontSide}}<hr id=answer><b>{{Nom}}</b> ({{Numéro}})"),
    ],
)
for d in departements:                      # liste de dicts : numero, nom, prefecture, region
    carte = pkg.add_media(f"cartes/departement_{d['numero']}.png")
    pkg.add_note(dep, "Départements", {
        "Carte": img(carte, "Carte de France, un département en orange"),
        "Nom": d["nom"], "Numéro": d["numero"], "Préfecture": d["prefecture"], "Région": d["region"],
    }, tags=["departements"], guid=f"dep-{d['numero']}")
pkg.write("departements.apkg")
```

Résultat : 5 cartes par note, dans un seul paquet ; le champ Région n'est demandé par aucune carte, il sert de contexte dans les réponses.

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

`write()` et `check` affichent : notes, cartes, médias, cartes par paquet, puis chaque type de note avec ce que Recto en fera et l'aperçu de sa première note, carte par carte. Ensuite viennent les avertissements regroupés (balises retirées, images sans `alt`, champs trop longs, images de plus de 1 280 px que Recto réduit, doublons probables) et les erreurs.
