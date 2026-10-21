"""Exemple : un paquet qui applique la charte de rédaction (reference/format-cartes.md), sujet par sujet.

    python charte.py [sortie.rpkg]

Chaque bloc montre le format retenu et, en commentaire, la carte qu'on aurait pu écrire et la règle
qui l'interdit. Le rapport de write() ne doit afficher aucun avertissement « charte ».
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
from recto_rpkg import Package, img, one_way, pendu, two_way  # noqa: E402

pkg = Package()

# ─── Vocabulaire : paire symétrique, une acception par carte, usage en trou (R1, R5, R9) ─────────
# Pas « bank » ↔ « banque / rive » (deux réponses) : deux cartes, chacune avec son contexte.
pkg.add_basic("Charte::Anglais", "bank (argent)", "banque", tags="anglais")
pkg.add_basic("Charte::Anglais", "bank (rivière)", "rive", tags="anglais")
pkg.add_basic("Charte::Anglais", "la pomme", "the apple", extra="Nom comptable : an apple, two apples",
              tags="anglais")
# L'usage : le mot en trou dans une phrase, l'indice garde la réussite au-dessus de 50 % (R7, R10).
pkg.add_cloze("Charte::Anglais", "I {{c1::borrowed::emprunter, passé}} a book from the library.",
              extra="to borrow (emprunter) ≠ to lend (prêter)", tags="anglais")

# ─── Dates : étiquette ↔ date quand la date est unique ; sinon sens unique avec indice (R3, R9, R10)
# Pas add_basic("Quelle est l'année de la bataille de Marignan ?", "1515") : posée dans l'autre
# sens, la question deviendrait la réponse (R9). Pas de verso qui raconte la bataille (R1).
pkg.add_basic("Charte::Histoire", "Marignan : bataille", "1515",
              extra="13-14 septembre ; François I<sup>er</sup> bat les Suisses", tags="histoire dates")
pkg.add_basic("Charte::Histoire", "Bastille : prise", "14/07/1789", tags="histoire dates")
# Une réponse improbable sans indice : pendu() dans une question à sens unique (R10).
pkg.add_question("Charte::Histoire", f"DiCaprio : 1<sup>er</sup> Oscar, année ({pendu('2016')})", "2016",
                 explanation="Pour <i>The Revenant</i> ; cérémonie de février 2016.", tags="cinema")
# Un fait qui change porte sa date dans la question (R13).
pkg.add_basic("Charte::Histoire", "UE : nombre de pays (2024)", "27", extra="27 depuis le Brexit (2020)",
              tags="geo")

# ─── Séquence ordonnée : trous chevauchants, mnémotechnique dans Extra (R6, R11) ─────────────────
# Pas « Cite les planètes » → « Mercure, Vénus, … » (liste de 8, R6).
pkg.add_sequence("Charte::Astronomie", "Planètes, du Soleil vers l'extérieur",
                 ["Mercure", "Vénus", "Terre", "Mars", "Jupiter", "Saturne", "Uranus", "Neptune"],
                 extra="Astuce : <b>Me</b> <b>V</b>oici <b>T</b>out <b>M</b>ouillé, <b>J</b>e <b>S</b>uis <b>U</b>n "
                       "<b>N</b>uage", tags="astronomie", guid="planetes")
# Un ensemble sans ordre : une carte par élément, avec la relation (pas de liste).
for pays, annee in [("Autriche", "1995"), ("Suède", "1995"), ("Finlande", "1995")]:
    pkg.add_question("Charte::Astronomie", f"{pays} : entrée dans l'UE (" + pendu(annee) + ")", annee,
                     tags="geo ue")

# ─── Concepts : définition à trous, cartes « pourquoi / comment » pour le transfert (R2, R7) ──────
# Pas « {{c1::Se rappeler apprend plus que relire}} » (trou = toute la phrase, R7),
# pas « Parle-moi de l'effet de test » (R4).
pkg.add_cloze("Charte::Mémoire", "Effet de test : se {{c1::rappeler}} apprend plus que {{c2::relire}}.",
              extra="Roediger & Karpicke 2006 : 56 % contre 42 % à une semaine", tags="memoire")
pkg.add_question("Charte::Mémoire", "Pourquoi espacer deux révisions plutôt que les enchaîner ?",
                 "L'oubli entre les deux rend le rappel plus difficile, donc plus formateur.",
                 explanation="Effet d'espacement : g ≈ 0,74 espacé contre massé (Latimier 2021).",
                 source="Dossier-Flashcards, §1.2", tags="memoire")
pkg.add_question("Charte::Mémoire", "Quelle différence entre reconnaissance et rappel ?",
                 "Reconnaître : identifier la bonne réponse parmi d'autres ; rappeler : la produire soi-même.",
                 explanation="Seul le rappel (indicé) donne le plein effet de test (Rowland 2014).",
                 tags="memoire")

# ─── Facettes d'un objet : image-indice muette, deux sens seulement si la réponse est unique (R8, R9)
dep = pkg.note_type(
    "Département (charte)",
    fields=["Carte", "Nom", "Numéro", "Préfecture", "Région"],
    templates=[
        one_way("Carte → Nom", "{{Carte}}<br>Quel département ?",
                "{{FrontSide}}<hr id=answer><b>{{Nom}}</b> ({{Numéro}})<br>{{Région}}"),
        # Chaque face dit ce qu'on cherche de l'autre côté (« Bas-Rhin / numéro ? », « 67 / département ? ») :
        # Recto n'affiche pas le nom du modèle, et deux cartes de la note partageraient sinon la face « Bas-Rhin ».
        two_way("Nom ↔ Numéro", "<b>{{Nom}}</b><br><i>numéro ?</i>", "<b>{{Numéro}}</b><br><i>département ?</i>"),
        two_way("Nom ↔ Préfecture", "<b>{{Nom}}</b><br><i>préfecture ?</i>",
                "<b>{{Préfecture}}</b><br><i>département ?</i>"),
        one_way("Nom → Région", "{{Nom}} : région", "{{FrontSide}}<hr id=answer>{{Région}}"),  # pas two_way
    ],
)


def carte(numero: str) -> bytes:
    """Carte muette (R8) : un rectangle gris, le « département » en orange, rien d'écrit."""
    x = 40 + 20 * int(numero[-1])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">'
            f'<rect width="300" height="200" fill="#e6e6e6"/><rect x="{x}" y="70" width="40" height="40" '
            f'fill="#e8742c"/></svg>').encode()


for numero, nom, pref, region in [("67", "Bas-Rhin", "Strasbourg", "Grand Est"),
                                  ("68", "Haut-Rhin", "Colmar", "Grand Est"),
                                  ("01", "Ain", "Bourg-en-Bresse", "Auvergne-Rhône-Alpes")]:
    image = pkg.add_media(carte(numero), name=f"charte_dep_{numero}.svg")
    pkg.add_note(dep, "Charte::Départements", {
        "Carte": img(image, "Carte de France, un département en orange"),  # l'alt ne nomme pas (R8)
        "Nom": nom, "Numéro": numero, "Préfecture": pref, "Région": region,
    }, tags=["departements"], guid=f"charte-dep-{numero}")

# ─── Prioriser : une carte secondaire livrée suspendue, taguée bonus (R12) ───────────────────────
pkg.add_basic("Charte::Histoire", "Marignan : nombre de jours de bataille", "2", tags="histoire bonus",
              suspended=True)

pkg.write(sys.argv[1] if len(sys.argv) > 1 else "charte.rpkg")
