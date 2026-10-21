"""Exemple complet : un paquet qui utilise chaque type de note de Recto.

    python exemple.py [sortie.rpkg]

- type personnalisé « Pays d'Europe » : drapeau (image SVG générée), pays, capitale, continent ;
  deux cartes : Drapeau → Pays (toujours ce sens), Pays ↔ Capitale (une carte, posée dans les
  deux sens) ;
- basique (paire réversible), question à sens unique, texte à trous avec formule ;
- occlusion d'image sur un schéma SVG généré, masques placés en pixels.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
from recto_rpkg import Mask, Package, img, one_way, two_way  # noqa: E402

pkg = Package()

# ─── Type personnalisé : une note par pays ; « A → B » sens unique, « A ↔ B » une carte, deux sens
pays = pkg.note_type(
    "Pays d'Europe",
    fields=["Drapeau", "Pays", "Capitale", "Continent"],
    templates=[
        one_way("Drapeau → Pays", "{{Drapeau}}<br>Quel pays ?",
                "{{FrontSide}}<hr id=answer>{{Pays}}<br>{{Continent}}"),
        two_way("Pays ↔ Capitale", "{{Pays}}", "{{Capitale}}"),
    ],
)


def flag(colors: list[str], vertical: bool) -> bytes:
    """Drapeau à bandes égales, en SVG (300 × 200)."""
    n = len(colors)
    bands = "".join(
        f'<rect x="{i * 300 / n:.1f}" y="0" width="{300 / n + 0.5:.1f}" height="200" fill="{c}"/>'
        if vertical
        else f'<rect x="0" y="{i * 200 / n:.1f}" width="300" height="{200 / n + 0.5:.1f}" fill="{c}"/>'
        for i, c in enumerate(colors)
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">'
            f'{bands}<rect width="300" height="200" fill="none" stroke="#888"/></svg>').encode()


for name, capital, colors, vertical in [
    ("France", "Paris", ["#0055a4", "#ffffff", "#ef4135"], True),
    ("Italie", "Rome", ["#009246", "#ffffff", "#ce2b37"], True),
    ("Belgique", "Bruxelles", ["#000000", "#fdda24", "#ef3340"], True),
    ("Allemagne", "Berlin", ["#000000", "#dd0000", "#ffce00"], False),
]:
    file = pkg.add_media(flag(colors, vertical), name=f"drapeau_{name.lower()}.svg")
    pkg.add_note(
        pays,
        "Exemple::Pays",
        {"Drapeau": img(file, f"Drapeau à bandes {'verticales' if vertical else 'horizontales'}"),
         "Pays": name, "Capitale": capital, "Continent": "Europe"},
        tags=["europe", "exemple"],
    )

# ─── Basique : paire réversible (posée dans les deux sens) ─────────────────────────────────────
for fr, en in [("le chat", "the cat"), ("la pomme", "the apple")]:
    pkg.add_basic("Exemple::Vocabulaire", fr, en, extra="Nom commun", tags="anglais exemple")

# ─── Question à sens unique, avec sa source ────────────────────────────────────────────────────
pkg.add_question(
    "Exemple::Sciences",
    "Pourquoi le ciel est-il bleu en journée ?",
    "La diffusion de Rayleigh : l'air diffuse davantage les courtes longueurs d'onde (le bleu).",
    explanation="Au coucher du soleil, la lumière traverse plus d'air : le bleu est diffusé avant "
    "d'arriver, il reste le rouge.",
    source="Cours de physique, chapitre 4",
    tags=["physique", "exemple"],
)

# ─── Texte à trous (formule KaTeX autour de tout le trou) ──────────────────────────────────────
pkg.add_cloze(
    "Exemple::Sciences",
    "L'énergie cinétique d'une masse m à la vitesse v vaut {{c1::\\(E_c = \\tfrac{1}{2} m v^2\\)}}, "
    "en {{c2::joules::unité}}.",
    extra="m en kg, v en m/s",
    tags=["physique", "exemple"],
)

# ─── Occlusion d'image : schéma généré, un masque par étiquette ────────────────────────────────
layers = [("Croûte", "#a0522d", 40), ("Manteau", "#e07b39", 110), ("Noyau externe", "#f2b134", 190),
          ("Noyau interne", "#f7e07c", 260)]
W, H, FONT = 640, 340, 22
shapes, labels, masks = [], [], []
for i, (label, color, y) in enumerate(layers, start=1):
    shapes.append(f'<rect x="20" y="{y - 30}" width="300" height="{60 if i < 4 else 70}" fill="{color}"/>')
    tx, ty = 360, y + 8
    labels.append(f'<line x1="320" y1="{y}" x2="{tx - 8}" y2="{y}" stroke="#333"/>'
                  f'<text x="{tx}" y="{ty}" font-family="sans-serif" font-size="{FONT}">{label}</text>')
    # Boîte du texte : largeur estimée (0,6 × taille de police par caractère), marge de 6 px.
    masks.append(Mask.from_pixels(i, tx, ty - FONT, 0.6 * FONT * len(label), FONT * 1.3, (W, H),
                                  answer=label, padding=6))
schema = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
          f'<rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(shapes)}{"".join(labels)}</svg>')
image = pkg.add_media(schema.encode(), name="couches_terre.svg")
pkg.add_occlusion("Exemple::Sciences", image, masks, header="Les couches de la Terre",
                  alt="Coupe schématique de la Terre", tags=["geologie", "exemple"])

# ─── Réglages du paquet (appliqués quand l'import le crée ; le planificateur se choisit à l'import)
pkg.settings("Exemple", description="Un paquet de démonstration du plugin recto-deck-builder.",
             new_per_day=10, later=[(pays, "Pays ↔ Capitale")])
pkg.settings("Exemple::Vocabulaire", typed_answer=True)

pkg.write(sys.argv[1] if len(sys.argv) > 1 else "exemple.rpkg", author="recto-deck-builder", licence="CC0 1.0")
