#!/usr/bin/env python3
"""Construit et vérifie des paquets .apkg importables dans Recto (et dans Anki).

Bibliothèque standard uniquement (Python 3.9 ou plus). Le paquet écrit a la forme exacte de
l'export .apkg de Recto (mêmes types de notes, mêmes identifiants), que Recto relit sans perte :
notes basiques, questions à sens unique, texte à trous, occlusion d'image, types de notes
personnalisés (plusieurs champs, une carte par modèle), images, sons, formules.

Construire :

    import sys; sys.path.insert(0, "<dossier du skill>/scripts")
    from recto_apkg import Package, Mask, img, sound, one_way, two_way

    pkg = Package()
    pays = pkg.note_type(
        "Pays",
        fields=["Drapeau", "Pays", "Capitale", "Continent"],
        templates=[
            one_way("Drapeau → Pays", "{{Drapeau}}<br>Quel pays ?", "{{FrontSide}}<hr id=answer>{{Pays}}"),
            two_way("Pays ↔ Capitale", "{{Pays}}", "{{Capitale}}"),   # une carte, posée dans les deux sens
        ],
    )
    drapeau = pkg.add_media("drapeau_fr.png")          # chemin d'un fichier, ou (bytes, name=…)
    pkg.add_note(pays, "Géographie::Pays", {"Drapeau": img(drapeau, "Drapeau"), "Pays": "France",
                                            "Capitale": "Paris", "Continent": "Europe"}, tags=["europe"])
    pkg.write("paquet.apkg")   # vérifie, affiche le rapport, lève DeckError en cas d'erreur

Vérifier un .apkg (celui-ci ou un autre) : python recto_apkg.py check paquet.apkg
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import sqlite3
import struct
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import NamedTuple

__all__ = [
    "DeckError",
    "Mask",
    "NoteType",
    "Package",
    "Report",
    "Template",
    "check_apkg",
    "check_bytes",
    "image_size",
    "img",
    "one_way",
    "pendu",
    "sound",
    "two_way",
]


class DeckError(Exception):
    """Une note, un type ou un média que Recto ne pourrait pas importer tel quel."""


# ─── Règles de Recto (src/lib/media/mime.ts, sanitize.ts, domain/*) ──────────────────────────────

EXTENSIONS = {
    "jpg": "image",
    "jpeg": "image",
    "png": "image",
    "webp": "image",
    "gif": "image",
    "svg": "image",
    "mp3": "audio",
    "ogg": "audio",
    "oga": "audio",
    "opus": "audio",
    "webm": "audio",
    "m4a": "audio",
    "mp4": "audio",
}
MAX_IMAGE_SIDE = 1280
HEAVY_IMAGE_BYTES = 600 * 1024
HEAVY_AUDIO_BYTES = 3 * 1024 * 1024
ALLOWED_TAGS = {"b", "i", "u", "br", "hr", "p", "ul", "ol", "li", "img", "sub", "sup", "span"}
ALLOWED_ATTRS = {"src", "alt", "title", "class"}
SPECIAL_FIELDS = {"FrontSide", "Tags", "Type", "Deck", "Subdeck", "Card", "CardFlag"}
MIN_MASK_SIZE = 0.005
LONG_TEXT = 200

# ─── Charte de rédaction (reference/format-cartes.md) : seuils des avertissements « charte » ────
LONG_ANSWER_WORDS = 25  # R1 : une réponse courte, le reste dans Extra
MAX_LIST_ITEMS = 4  # R6 : pas de liste de plus de 4 éléments (Olicard règle 7, Wozniak 8-9)
LONG_HOLE_WORDS = 6  # R7 : un trou = un mot, un nombre, une expression courte
MIN_CLOZE_CONTEXT = 15  # R7 : le texte visible doit poser une question
INTERFERENCE_MIN = 3  # R5 : même réponse pour 3 cartes ou plus = interférence (Wozniak 11)
YES_NO_ANSWERS = {"oui", "non", "vrai", "faux", "yes", "no", "true", "false", "si"}
RECOGNITION_RE = re.compile(r"^\s*(est-ce\s+qu|vrai\s+ou\s+faux|v\s*/\s*f\b|qcm\b)", re.I)
MCQ_OPTION_RE = re.compile(r"(?:^|[\s(])[a-dA-D1-4][).]\s+\S")
ENUMERATION_RE = re.compile(
    r"^\s*(?:cite[sz]?|liste[sz]?|[ée]num[èe]re[sz]?|nomme[sz]?|donne[sz]?\s+(?:les|tous|toutes)|"
    r"quel(?:le)?s\s+sont\s+(?:les|tous|toutes)|combien\s+(?:et\s+)?lesquel)",
    re.I,
)
SENTENCE_QUESTION_RE = re.compile(
    r"^\s*(?:quel(?:le)?s?|qui|que|qu'|quoi|quand|où|combien|comment|pourquoi|lequel|laquelle|lesquel(?:le)?s|"
    r"est-ce|[àade]\s+quel(?:le)?s?|dans\s+quel(?:le)?s?|en\s+quel(?:le)?s?|what|which|who|when|where|how|why)\b"
    r"|(?:\w-t-(?:il|elle)s?\b|\w-(?:vous|tu|nous|ils|elles|on)\b)[^?]*\?\s*$",
    re.I,
)
OPEN_RE = re.compile(
    r"^\s*(?:parle[sz]?[- ]moi|d[ée]cri[st]|r[ée]sume[sz]?|pr[ée]sente[sz]?|raconte[sz]?|que\s+sais[- ]tu|"
    r"explique[sz]?\s+(?:en\s+d[ée]tail|tout|le\s+fonctionnement\s+complet))\b",
    re.I,
)

# Types intégrés : identifiants, noms, champs et modèles de l'export .apkg de Recto
# (src/lib/export/apkg.ts) ; le type « Question » est propre à ce plugin (4 champs : il reste un
# type personnalisé, une seule carte, jamais retournée).
BASIC_ID = 1758758400001
CLOZE_ID = 1758758400003
OCCLUSION_ID = 1758758400004
QUESTION_ID = 1758758400005
BUILT_IN_MOD = 1758758400

CSS = (
    ".card { font-family: sans-serif; font-size: 20px; text-align: center; color: black; "
    "background-color: white; }\n.cloze { font-weight: bold; color: blue; }"
)
LATEX_PRE = (
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n"
    "\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n"
    "\\begin{document}\n"
)
EXTRA = "{{#Extra}}<br><br>{{Extra}}{{/Extra}}"
IO_FRONT = """{{#Header}}<div>{{Header}}</div>{{/Header}}
<div style="display: none">{{cloze:Occlusion}}</div>
<div id="err"></div>
<div id="image-occlusion-container">
    {{Image}}
    <canvas id="image-occlusion-canvas"></canvas>
</div>
<script>
try {
    anki.imageOcclusion.setup();
} catch (exc) {
    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;
}
</script>
"""
IO_BACK = (
    IO_FRONT
    + """
<div><button id="toggle">Toggle Masks</button></div>
{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}
"""
)
IO_CSS = """#image-occlusion-canvas {
    --inactive-shape-color: #ffeba2;
    --active-shape-color: #ff8e8e;
    --inactive-shape-border: 1px #212121;
    --active-shape-border: 1px #212121;
    --highlight-shape-color: #ff8e8e00;
    --highlight-shape-border: 1px #ff8e8e;
}

.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
}
"""

# ─── Texte, modèles de carte, médias (portage de src/lib/domain) ─────────────────────────────────

TAG_RE = re.compile(r"\{\{\s*([^{}]*?)\s*\}\}")
SECTION_RE = re.compile(
    r"\{\{\s*([#^])\s*([^{}]+?)\s*\}\}((?:(?!\{\{\s*[#^])[\s\S])*?)\{\{\s*/\s*\2\s*\}\}"
)
CLOZE_RE = re.compile(r"\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}")
IMG_SRC_RE = re.compile(r"""<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", re.I)
IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.I)
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
HTML_TAG_RE = re.compile(r"<\s*/?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>")
ATTR_RE = re.compile(r"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?")
REMOTE_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//)", re.I)
SHAPE_RE = re.compile(r"\{\{c(\d+)::image-occlusion:([\s\S]*?)\}\}")


def strip_html(s: str) -> str:
    """Texte d'un champ : sons et balises retirés, entités décodées, espaces réduits."""
    s = SOUND_RE.sub(" ", s)
    s = re.sub(r"<(br|/p|/div|/li|li)\b[^>]*>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]*>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def is_empty_field(s: str) -> bool:
    return strip_html(s) == "" and not re.search(r"<img\b", s, re.I) and "[sound:" not in s


def media_refs(s: str) -> list[str]:
    """Noms des médias locaux cités par un champ (<img src> et [sound:]), sans les URL."""
    names: list[str] = []
    for m in IMG_SRC_RE.finditer(s):
        src = html.unescape(m.group(1) or m.group(2) or m.group(3) or "").strip()
        if src and not REMOTE_RE.match(src) and src not in names:
            names.append(src)
    for m in SOUND_RE.finditer(s):
        name = m.group(1).strip()
        if name and name not in names:
            names.append(name)
    return names


def remote_images(s: str) -> list[str]:
    out = []
    for m in IMG_SRC_RE.finditer(s):
        src = html.unescape(m.group(1) or m.group(2) or m.group(3) or "").strip()
        if REMOTE_RE.match(src):
            out.append(src)
    return out


def _substitute(tag: str, values: dict[str, str], front_side: str) -> str:
    parts = [p.strip() for p in tag.split(":")]
    name = parts.pop() if parts else ""
    if name == "FrontSide" and not parts:
        return front_side
    if name not in values:
        return ""
    out = values[name]
    for flt in reversed(parts):
        if flt == "type":
            return ""
        if flt == "text":
            out = html.escape(strip_html(out))
    return out


def render_template(template: str, values: dict[str, str], front_side: str = "") -> str:
    """Rendu d'une face, comme Recto (src/lib/domain/templates.ts)."""
    s = template
    m = SECTION_RE.search(s)
    while m:
        kind, name, body = m.group(1), m.group(2), m.group(3)
        filled = not is_empty_field(values.get(name, ""))
        keep = filled if kind == "#" else not filled
        s = s[: m.start()] + (body if keep else "") + s[m.end() :]
        m = SECTION_RE.search(s)
    return TAG_RE.sub(
        lambda t: "" if re.match(r"^[#^/]", t.group(1)) else _substitute(t.group(1), values, front_side),
        s,
    )


def referenced_fields(template: str) -> list[str]:
    names: list[str] = []
    for m in TAG_RE.finditer(template):
        name = re.sub(r"^[#^/]\s*", "", m.group(1)).split(":")[-1].strip()
        if name and name != "FrontSide" and name not in names:
            names.append(name)
    return names


class Template(NamedTuple):
    """Modèle de carte : nom, question (ou face 1), réponse (ou face 2), posé dans les deux sens."""

    name: str
    front: str
    back: str
    two_way: bool = False


def one_way(name: str, question: str, answer: str) -> Template:
    """Carte toujours posée dans le même sens (« A → B ») ; la réponse reprend la question par
    {{FrontSide}} : "{{FrontSide}}<hr id=answer>{{B}}"."""
    return Template(name, question, answer)


def two_way(name: str, face1: str, face2: str) -> Template:
    """Une seule carte posée dans les deux sens (« A ↔ B ») : la face 1 est demandée, puis la face 2
    après une réussite (réglage « Interroger dans les deux sens » du paquet, actif par défaut).
    Chaque face s'écrit seule, sans {{FrontSide}}."""
    return Template(name, face1, face2, True)


ANSWER_OPENING = re.compile(r"^\s*\{\{\s*FrontSide\s*\}\}\s*(?:<hr\b[^>]*>\s*)?", re.I)


def face_of_answer(back: str) -> str:
    """Face 2 d'un modèle à deux sens à partir de la réponse d'Anki (son ouverture retirée)."""
    return ANSWER_OPENING.sub("", back, count=1)


def answer_of_face(face: str) -> str:
    """Réponse d'Anki pour la face 2 d'un modèle à deux sens (Recto, src/lib/domain/templates.ts)."""
    return "{{FrontSide}}\n\n<hr id=answer>\n\n" + face


def template_ords(fields: list[str], templates: list[Template], values: list[str]) -> list[int]:
    """Cartes d'une note : un modèle dont la question n'est pas vide et dépend de la note ; un modèle
    à deux sens demande ses deux faces, il faut donc que chacune le permette."""
    filled = {n: (values[i] if i < len(values) else "") for i, n in enumerate(fields)}
    blank = {n: "" for n in fields}

    def asks(side: str) -> bool:
        q = render_template(side, filled)
        return not is_empty_field(q) and q != render_template(side, blank)

    return [i for i, t in enumerate(templates) if asks(t.front) and (not t.two_way or asks(t.back))]


def cloze_indices(text: str) -> list[int]:
    return sorted({int(m.group(1)) for m in CLOZE_RE.finditer(text) if int(m.group(1)) >= 1})


def _round4(v: float) -> float:
    return round(v * 10_000) / 10_000


def _anki_number(v: float) -> str:
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return re.sub(r"^0(?=\.)", "", s) or "0"


def sort_field(s: str) -> str:
    """Champ de tri d'Anki : HTML retiré, noms d'images gardés."""
    s = IMG_TAG_RE.sub(lambda m: f" {(media_refs(m.group(0)) or [''])[0]} ", s)
    return html.unescape(re.sub(r"<[^>]*>", "", s))


def _checksum(s: str) -> int:
    return int(hashlib.sha1(s.encode("utf-8")).hexdigest()[:8], 16)


def image_size(data: bytes) -> tuple[float, float] | None:
    """Largeur et hauteur d'une image PNG, JPEG, GIF, WebP ou SVG (None si illisible)."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", data[16:24])
            return float(w), float(h)
        if data[:6] in (b"GIF87a", b"GIF89a"):
            w, h = struct.unpack("<HH", data[6:10])
            return float(w), float(h)
        if data[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xD8, 0x01, 0xFF) or 0xD0 <= marker <= 0xD7:
                    i += 1 if marker == 0xFF else 2
                    continue
                length = struct.unpack(">H", data[i + 2 : i + 4])[0]
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                    return float(w), float(h)
                i += 2 + length
            return None
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            chunk = data[12:16]
            if chunk == b"VP8X":
                w = 1 + int.from_bytes(data[24:27], "little")
                h = 1 + int.from_bytes(data[27:30], "little")
                return float(w), float(h)
            if chunk == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                return float(w & 0x3FFF), float(h & 0x3FFF)
            if chunk == b"VP8L":
                bits = int.from_bytes(data[21:25], "little")
                return float((bits & 0x3FFF) + 1), float(((bits >> 14) & 0x3FFF) + 1)
            return None
        head = data[:4096].decode("utf-8", "ignore")
        svg = re.search(r"<svg\b[^>]*>", head)
        if svg:
            tag = svg.group(0)
            num = lambda a: re.search(rf'\b{a}\s*=\s*["\']\s*([\d.]+)(?:px)?\s*["\']', tag)  # noqa: E731
            w, h = num("width"), num("height")
            if w and h:
                return float(w.group(1)), float(h.group(1))
            box = re.search(r'\bviewBox\s*=\s*["\']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', tag)
            if box:
                return float(box.group(1)), float(box.group(2))
    except (struct.error, ValueError, IndexError):
        return None
    return None


def img(name: str, alt: str = "") -> str:
    """Balise d'image d'un champ : <img src="nom" alt="…"> (alt : texte lu par les lecteurs d'écran)."""
    return f'<img src="{html.escape(name)}" alt="{html.escape(alt)}">'


def sound(name: str) -> str:
    """Son d'un champ : [sound:nom.mp3] (lu par Recto, à la demande ou automatiquement)."""
    return f"[sound:{name}]"


def pendu(answer: str, keep: int = 1) -> str:
    """Indice récupérateur « façon pendu » (Olicard, règle 4 et p. 38) : un trait par caractère de
    la réponse, les `keep` premiers caractères révélés ; espaces, traits d'union et apostrophes
    gardés. pendu("1969") → "1 _ _ _", pendu("Strasbourg", 2) → "St _ _ _ _ _ _ _ _",
    pendu("1515", 0) → "_ _ _ _". À placer dans une question à sens unique ou comme indice
    d'un trou ({{c1::1969::1 _ _ _}}) ; jamais dans la face d'une carte à deux sens."""
    text = strip_html(str(answer))
    if not text:
        raise DeckError("pendu : réponse vide")
    tokens: list[str] = []
    shown, run = 0, False  # `run` : le dernier jeton est une suite de lettres révélées
    for c in text:
        if c == " ":
            tokens.append("/")  # séparation des mots : « R _ _ / _ _ / _ _ _ _ _ _ _ »
            run = False
        elif not c.isalnum():
            tokens.append(c)
            run = False
        elif shown < max(0, keep):
            if run:
                tokens[-1] += c
            else:
                tokens.append(c)
            shown, run = shown + 1, True
        else:
            tokens.append("_")
            run = False
    # Un espace entre les traits pour qu'on puisse les compter (« 1 _ _ _ »).
    return " ".join(tokens)


# ─── Types de notes et masques ───────────────────────────────────────────────────────────────────


@dataclass
class NoteType:
    """Type de note : champs nommés et modèles de carte (nom, question, réponse)."""

    id: int
    name: str
    fields: list[str]
    templates: list[Template]
    kind: str  # basic, question, cloze, occlusion, custom
    css: str = CSS
    mod: int = BUILT_IN_MOD


@dataclass
class Mask:
    """Masque d'occlusion : groupe (une carte par groupe), rectangle normalisé (0–1), réponse."""

    group: int
    x: float
    y: float
    w: float
    h: float
    answer: str = ""

    @classmethod
    def from_pixels(
        cls,
        group: int,
        left: float,
        top: float,
        width: float,
        height: float,
        image: tuple[float, float],
        answer: str = "",
        padding: float = 0,
    ) -> "Mask":
        """Masque à partir d'un rectangle en pixels sur une image de taille `image` (largeur, hauteur)."""
        iw, ih = image
        return cls(
            group,
            (left - padding) / iw,
            (top - padding) / ih,
            (width + 2 * padding) / iw,
            (height + 2 * padding) / ih,
            answer,
        )


def _classify(model_type: int, fields: list[str], templates: list[Template]) -> str:
    """Ce que Recto fait d'un type Anki (src/lib/import/apkg.ts, convertModel)."""
    if model_type == 1 and any("image-occlusion" in t[1] for t in templates):
        return "occlusion"
    if model_type == 1:
        return "cloze"

    def asks(ord_: int, f: int) -> bool:
        return f < len(fields) and bool(fields[f]) and ord_ < len(templates) and (
            "{{" + fields[f] + "}}"
        ) in templates[ord_][1]

    basic = len(templates) == 1 and asks(0, 0)
    reverse = len(templates) == 2 and asks(0, 0) and asks(1, 1)
    return "basic" if len(fields) <= 3 and (basic or reverse) else "custom"


BASIC = NoteType(
    BASIC_ID,
    "Recto · Basique",
    ["Recto", "Verso", "Extra"],
    [Template("Recto → Verso", "{{Recto}}", "{{FrontSide}}\n\n<hr id=answer>\n\n{{Verso}}" + EXTRA)],
    "basic",
)
QUESTION = NoteType(
    QUESTION_ID,
    "Recto · Question",
    ["Question", "Réponse", "Explication", "Source"],
    [
        Template(
            "Question → Réponse",
            "{{Question}}",
            "{{FrontSide}}\n\n<hr id=answer>\n\n{{Réponse}}"
            "{{#Explication}}<br><br>{{Explication}}{{/Explication}}"
            "{{#Source}}<br><br><i>{{Source}}</i>{{/Source}}",
        )
    ],
    "question",
)
CLOZE = NoteType(
    CLOZE_ID,
    "Recto · Texte à trous",
    ["Texte", "Extra"],
    [Template("Texte à trous", "{{cloze:Texte}}", "{{cloze:Texte}}" + EXTRA)],
    "cloze",
)
OCCLUSION = NoteType(
    OCCLUSION_ID,
    "Recto · Occlusion d’image",
    ["Occlusion", "Image", "Header", "Back Extra", "Comments"],
    [Template("Image Occlusion", IO_FRONT, IO_BACK)],
    "occlusion",
    css=IO_CSS,
)


def _field_name_problem(name: str) -> str | None:
    if not name.strip():
        return "nom de champ vide"
    if any(c in name for c in '{}:"'):
        return f"le nom de champ « {name} » contient {{, }}, : ou \""
    if name.lstrip()[0] in "#^/":
        return f"le nom de champ « {name} » commence par #, ^ ou /"
    return None


def _template_problems(fields: list[str], templates: list[Template]) -> list[str]:
    problems = []
    known = set(fields) | SPECIAL_FIELDS
    for name, front, back, both in templates:
        if both and any(re.search(r"\{\{\s*FrontSide\s*\}\}", side) for side in (front, back)):
            problems.append(f"le modèle à deux sens « {name} » : chaque face s'écrit seule, sans {{{{FrontSide}}}}")
        for side in (front, back):
            for ref in referenced_fields(side):
                if ref not in known:
                    problems.append(f"le modèle « {name} » cite le champ inconnu « {ref} »")
            if re.search(r"\{\{\s*cloze\s*:", side):
                problems.append(
                    f"le modèle « {name} » utilise {{{{cloze:…}}}} : réservé au texte à trous (add_cloze)"
                )
    return problems


def _html_problems(s: str) -> list[tuple[str, str]]:
    """(clé d'avertissement, exemple) pour les balises et attributs que Recto retire à l'affichage."""
    out = []
    for m in HTML_TAG_RE.finditer(s):
        tag = m.group(1).lower()
        if tag not in ALLOWED_TAGS:
            hint = " (pas de retour à la ligne : utiliser <br> ou <p>)" if tag in ("div", "table", "tr", "td") else ""
            out.append((f"balise <{tag}> retirée par Recto à l'affichage, son texte reste{hint}", m.group(0)[:60]))
            continue
        for a in ATTR_RE.finditer(m.group(2)):
            attr = a.group(1).lower()
            # `id` (<hr id=answer> d'Anki) disparaît sans rien changer à l'affichage.
            if attr not in ALLOWED_ATTRS and attr != "id":
                out.append((f"attribut « {attr} » retiré par Recto (style ignoré)", m.group(0)[:60]))
    return out


# ─── Rapport ─────────────────────────────────────────────────────────────────────────────────────


class Report:
    """Erreurs (le paquet ne s'importerait pas comme voulu), avertissements regroupés, résumé."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: dict[str, list[str]] = {}
        self.lines: list[str] = []

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, message: str) -> None:
        if message not in self.errors:
            self.errors.append(message)

    def warn(self, key: str, example: str = "") -> None:
        self.warnings.setdefault(key, [])
        if example:
            self.warnings[key].append(example)

    @property
    def charte(self) -> dict[str, list[str]]:
        """Les avertissements de la charte de rédaction (clés « charte Rn — … »)."""
        return {k: v for k, v in self.warnings.items() if k.startswith("charte ")}

    def text(self) -> str:
        out = list(self.lines)

        def line(key: str, examples: list[str]) -> str:
            if not examples:
                return f"avertissement : {key}"
            shown = " ; ".join(dict.fromkeys(examples[:3]))
            more = f" (et {len(examples) - 3} autres)" if len(examples) > 3 else ""
            return f"avertissement : {key} — {len(examples)} : {shown}{more}"

        out += [line(k, v) for k, v in self.warnings.items() if not k.startswith("charte ")]
        charte = self.charte
        if charte:
            out.append("Charte de rédaction (reference/format-cartes.md) : "
                       f"{sum(len(v) for v in charte.values())} carte(s) à revoir ou à justifier")
            out += ["  " + line(k, v) for k, v in charte.items()]
        out += [f"ERREUR : {e}" for e in self.errors]
        out.append("OK : importable dans Recto" if self.ok else f"{len(self.errors)} erreur(s) : à corriger")
        return "\n".join(out)


# ─── Construction ────────────────────────────────────────────────────────────────────────────────


@dataclass
class _Note:
    type: NoteType
    deck: str
    fields: list[str]
    tags: list[str]
    guid: str
    suspended: bool
    ords: list[int] = field(default_factory=list)


def _deck_name(deck: str) -> str:
    parts = [p.strip() for p in deck.split("::")]
    if not deck.strip() or any(not p for p in parts):
        raise DeckError(f"nom de paquet invalide : « {deck} » (exemple : « Géographie::Départements »)")
    return "::".join(parts)


def _tags(tags) -> list[str]:
    out = []
    for t in tags.split() if isinstance(tags, str) else tags:
        t = str(t).strip()
        if not t:
            continue
        if re.search(r"\s", t):
            raise DeckError(f"tag « {t} » : pas d'espace dans un tag (utiliser _ ou -)")
        if t not in out:
            out.append(t)
    return out


def _stable_id(name: str) -> int:
    """Identifiant Anki stable d'un type personnalisé : une réimportation retrouve le même type."""
    return 1_700_000_000_000 + int(hashlib.sha1(name.encode("utf-8")).hexdigest()[:12], 16) % 50_000_000_000


class Package:
    """Un paquet .apkg en construction. `now` (secondes) fixe les dates ; par défaut, l'heure courante."""

    def __init__(self, now: float | None = None) -> None:
        self.now_ms = int((time.time() if now is None else now) * 1000)
        self._types: dict[str, NoteType] = {}
        self._notes: list[_Note] = []
        self._guids: dict[str, int] = {}
        self._media: dict[str, bytes] = {}

    # Types ---------------------------------------------------------------------------------------

    def note_type(
        self,
        name: str,
        fields: list[str],
        templates: list,
        css: str | None = None,
    ) -> NoteType:
        """Type de note personnalisé : `templates` = [one_way(…) ou two_way(…), …] ; un tuple
        (nom, question, réponse) vaut one_way.

        one_way : une carte par modèle dont la question rendue n'est pas vide. two_way : une seule
        carte, demandée par une face puis par l'autre ; elle existe si ses deux faces ont un contenu.
        Syntaxe : {{Champ}}, {{FrontSide}} (la question, dans la réponse d'un one_way),
        {{#Champ}}…{{/Champ}} (si rempli), {{^Champ}}…{{/Champ}} (si vide), {{text:Champ}},
        {{type:Champ}} (champ attendu en réponse tapée).
        """
        name = name.strip()
        fields = [str(f).strip() for f in fields]
        if not name:
            raise DeckError("un type de note doit avoir un nom")
        if name.casefold() in (t.name.casefold() for t in (BASIC, QUESTION, CLOZE, OCCLUSION)):
            raise DeckError(f"« {name} » est un type intégré : utiliser add_basic, add_question, add_cloze…")
        problems = [p for p in (_field_name_problem(f) for f in fields) if p]
        folded = [f.strip().casefold() for f in fields]
        if len(set(folded)) != len(folded):
            problems.append("deux champs portent le même nom (sans tenir compte de la casse)")
        if not templates:
            problems.append("au moins un modèle de carte est nécessaire")
        templates = [
            Template(str(t[0]).strip() or f"Carte {i + 1}", t[1], t[2], bool(t[3]) if len(t) > 3 else False)
            for i, t in enumerate(templates)
        ]
        problems += _template_problems(fields, templates)
        if problems:
            raise DeckError(f"type « {name} » : " + " ; ".join(problems))
        if _classify(0, fields, templates) == "basic":
            raise DeckError(
                f"type « {name} » : avec au plus 3 champs et un modèle qui demande le 1er champ (ou deux "
                "modèles qui demandent le 1er puis le 2e), Recto en fait une note basique, posée dans les "
                "deux sens. Utiliser add_basic pour une paire réversible, add_question pour une question à "
                "sens unique, ou ajouter un champ (Source, Exemple…) pour garder ce type."
            )
        known = self._types.get(name.casefold())
        if known:
            if known.fields != fields or known.templates != templates:
                raise DeckError(f"type « {name} » défini deux fois avec des champs ou des modèles différents")
            return known
        t = NoteType(_stable_id(name), name, list(fields), templates, "custom", css or CSS, self.now_ms // 1000)
        self._types[name.casefold()] = t
        return t

    # Médias --------------------------------------------------------------------------------------

    def add_media(self, source: str | bytes, name: str | None = None) -> str:
        """Ajoute un fichier (chemin, ou octets avec `name`) ; renvoie le nom à citer dans les champs."""
        if isinstance(source, (bytes, bytearray)):
            if not name:
                raise DeckError("add_media(octets) : préciser name=")
            data = bytes(source)
        else:
            with open(source, "rb") as f:
                data = f.read()
            name = name or os.path.basename(source)
        name = name.strip()
        if not name or re.search(r'[\\/:*?"<>|\x00-\x1f]', name) or name.startswith("."):
            raise DeckError(f"nom de média invalide : « {name} » (lettres, chiffres, - _ . seulement)")
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in EXTENSIONS:
            raise DeckError(
                f"média « {name} » : format refusé par Recto. Images : jpg, png, webp, gif, svg ; "
                "sons : mp3, ogg, opus, webm, m4a (convertir un .wav en .mp3 ou .ogg)"
            )
        known = self._media.get(name)
        if known is not None and known != data:
            raise DeckError(f"deux médias différents portent le nom « {name} »")
        self._media[name] = data
        return name

    # Notes ---------------------------------------------------------------------------------------

    def add_note(self, note_type: NoteType, deck: str, fields, tags=(), guid: str | None = None,
                 suspended: bool = False) -> None:
        """Note d'un type personnalisé ; `fields` : dict {champ: html} ou liste dans l'ordre des champs."""
        if note_type.kind != "custom" or self._types.get(note_type.name.casefold()) is not note_type:
            raise DeckError("add_note attend un type créé par Package.note_type()")
        if isinstance(fields, dict):
            unknown = [k for k in fields if k not in note_type.fields]
            if unknown:
                raise DeckError(f"type « {note_type.name} » : champ(s) inconnu(s) {unknown}")
            values = [str(fields.get(f) or "") for f in note_type.fields]
        else:
            values = [str(v or "") for v in fields]
            if len(values) != len(note_type.fields):
                raise DeckError(
                    f"type « {note_type.name} » : {len(values)} valeurs pour {len(note_type.fields)} champs"
                )
        if is_empty_field(values[0]):
            raise DeckError(f"type « {note_type.name} » : le premier champ (« {note_type.fields[0]} ») est vide")
        ords = template_ords(note_type.fields, note_type.templates, values)
        if not ords:
            raise DeckError(
                f"note « {strip_html(values[0])[:40]} » : aucune carte (chaque question rendue est vide)"
            )
        self._add(note_type, deck, values, tags, guid, suspended, ords, sort_field(values[0]))

    def add_basic(self, deck: str, front: str, back: str, extra: str = "", tags=(), guid: str | None = None,
                  suspended: bool = False) -> None:
        """Paire réversible : une carte, posée Recto → Verso puis Verso → Recto (le paquet alterne)."""
        if is_empty_field(front) or is_empty_field(back):
            raise DeckError(f"note basique « {strip_html(front)[:40]} » : recto et verso sont obligatoires")
        self._add(BASIC, deck, [front, back, extra], tags, guid, suspended, [0], sort_field(front))

    def add_question(self, deck: str, question: str, answer: str, explanation: str = "", source: str = "",
                     tags=(), guid: str | None = None, suspended: bool = False) -> None:
        """Question à sens unique (jamais retournée) ; explication et source affichées après la réponse."""
        if is_empty_field(question) or is_empty_field(answer):
            raise DeckError(f"question « {strip_html(question)[:40]} » : question et réponse sont obligatoires")
        values = [question, answer, explanation, source]
        self._add(QUESTION, deck, values, tags, guid, suspended, [0], sort_field(question))

    def add_cloze(self, deck: str, text: str, extra: str = "", tags=(), guid: str | None = None,
                  suspended: bool = False) -> None:
        """Texte à trous : {{c1::réponse}} ou {{c1::réponse::indice}} ; une carte par numéro."""
        numbers = cloze_indices(text)
        if not numbers:
            raise DeckError(f"texte à trous sans {{{{c1::…}}}} : « {strip_html(text)[:60]} »")
        self._add(CLOZE, deck, [text, extra], tags, guid, suspended, [n - 1 for n in numbers], sort_field(text))

    def add_sequence(self, deck: str, title: str, items: list, window: int = 1, numbered: bool = True,
                     extra: str = "", tags=(), guid: str | None = None, suspended: bool = False) -> int:
        """Liste ordonnée (planètes, étapes, couches, rois…) en trous chevauchants (Wozniak, règle 9 ;
        Olicard, règle 7) : une note à trous par élément, qui ne montre que ses voisins.

            add_sequence("Astronomie", "Planètes, du Soleil vers l'extérieur",
                         ["Mercure", "Vénus", "Terre", "Mars", "Jupiter", "Saturne", "Uranus", "Neptune"])
            → « Planètes, du Soleil vers l'extérieur — 3/8 : …, Vénus, [Terre], Mars, … »

        `window` : voisins montrés de chaque côté (1 par défaut) ; `numbered` : rang « 3/8 » dans la
        question (un indice de plus, et la position elle-même est apprise). `guid` sert de préfixe
        (`guid-1`, `guid-2`…). Renvoie le nombre de notes créées. Pour un ensemble sans ordre, ne
        pas s'en servir : une carte par élément, ou des groupes de 4 au plus (format-cartes.md, R6).
        """
        items = [str(x).strip() for x in items]
        if len(items) < 2:
            raise DeckError(f"add_sequence « {strip_html(title)[:40]} » : au moins 2 éléments")
        for it in items:
            if not it or "{{" in it or "}}" in it or "::" in it:
                raise DeckError(f"add_sequence « {strip_html(title)[:40]} » : élément vide ou contenant {{{{, }}}} ou :: ({it!r})")
        if "{{" in title or window < 0:
            raise DeckError("add_sequence : titre sans {{…}} et window ≥ 0")
        n = len(items)
        for i, it in enumerate(items):
            lo, hi = max(0, i - window), min(n, i + window + 1)
            parts = (["…"] if lo > 0 else []) + [
                f"{{{{c1::{items[j]}}}}}" if j == i else items[j] for j in range(lo, hi)
            ] + (["…"] if hi < n else [])
            head = f"{title} — {i + 1}/{n} : " if numbered else f"{title} : "
            self.add_cloze(deck, head + ", ".join(parts), extra=extra, tags=tags,
                           guid=f"{guid}-{i + 1}" if guid else None, suspended=suspended)
        return n

    def add_occlusion(self, deck: str, image: str, masks: list[Mask], header: str = "", extra: str = "",
                      hide_all: bool = True, alt: str = "", tags=(), guid: str | None = None,
                      suspended: bool = False) -> None:
        """Occlusion d'image : `image` = nom rendu par add_media ; une carte par groupe de masques.

        hide_all=True : tous les masques cachent leur zone, celui de la carte est mis en évidence ;
        False : seul le masque de la carte est dessiné. La réponse d'un masque s'affiche après la
        demande (et sert à la réponse tapée).
        """
        if image not in self._media:
            raise DeckError(f"occlusion : image « {image} » absente (l'ajouter d'abord avec add_media)")
        if EXTENSIONS.get(image.rsplit(".", 1)[-1].lower()) != "image":
            raise DeckError(f"occlusion : « {image} » n'est pas une image")
        if not masks:
            raise DeckError(f"occlusion sur « {image} » : aucun masque")
        shapes, answers = [], {}
        for m in masks:
            if not isinstance(m.group, int) or m.group < 1:
                raise DeckError(f"occlusion sur « {image} » : groupe {m.group!r} (entier ≥ 1 attendu)")
            x0, y0 = _round4(min(1, max(0, m.x))), _round4(min(1, max(0, m.y)))
            x1, y1 = _round4(min(1, max(0, m.x + m.w))), _round4(min(1, max(0, m.y + m.h)))
            if x1 - x0 < MIN_MASK_SIZE or y1 - y0 < MIN_MASK_SIZE:
                raise DeckError(
                    f"occlusion sur « {image} » : masque {m} trop petit ou hors de l'image "
                    "(coordonnées normalisées 0–1 ; Mask.from_pixels convertit des pixels)"
                )
            oi = ":oi=1" if hide_all else ""
            shapes.append(
                f"{{{{c{m.group}::image-occlusion:rect:left={_anki_number(x0)}:top={_anki_number(y0)}"
                f":width={_anki_number(_round4(x1 - x0))}:height={_anki_number(_round4(y1 - y0))}{oi}}}}}"
            )
            answer = re.sub(r"\s+", " ", m.answer).strip()
            if answer and answer not in answers.setdefault(m.group, []):
                answers[m.group].append(answer)
        comments = "<br>".join(
            f"{n} : {html.escape(', '.join(answers[n]))}" for n in sorted(answers) if answers[n]
        )
        values = ["<br>".join(shapes), img(image, alt), header, extra, comments]
        groups = sorted({m.group for m in masks})
        self._add(OCCLUSION, deck, values, tags, guid, suspended, [g - 1 for g in groups],
                  f"{image}\x1f{strip_html(header)}")

    def _add(self, t: NoteType, deck: str, values: list[str], tags, guid: str | None, suspended: bool,
             ords: list[int], key: str) -> None:
        deck = _deck_name(deck)
        guid = guid or "r" + hashlib.sha1(f"{t.name}\x1f{key.strip()}".encode("utf-8")).hexdigest()[:15]
        if guid in self._guids:
            raise DeckError(
                f"deux notes « {t.name} » ont la même clé (« {strip_html(key)[:40]} ») : doublon, ou "
                "donner un guid= explicite à chacune"
            )
        self._guids[guid] = len(self._notes)
        values = [v.replace("\x1f", "") for v in values]
        self._notes.append(_Note(t, deck, values, _tags(tags), guid, suspended, ords))

    # Écriture ------------------------------------------------------------------------------------

    def build(self) -> tuple[bytes, list[str]]:
        """Octets du .apkg et noms des médias ajoutés mais cités par aucune note (laissés de côté)."""
        if not self._notes:
            raise DeckError("paquet vide : aucune note")
        now_s = self.now_ms // 1000
        used = []
        for n in self._notes:
            for v in n.fields:
                for name in media_refs(v):
                    if name not in used:
                        used.append(name)
        missing = [m for m in used if m not in self._media]
        if missing:
            raise DeckError(f"média(s) cité(s) mais non ajouté(s) avec add_media : {missing[:10]}")
        unused = [m for m in self._media if m not in used]

        last = [1]

        def next_id() -> int:
            last[0] = max(self.now_ms, last[0] + 1)
            return last[0]

        decks: dict[str, int] = {}
        for n in self._notes:
            parts = n.deck.split("::")
            for i in range(1, len(parts) + 1):
                path = "::".join(parts[:i])
                if path.casefold() == "default":
                    decks[path] = 1
                decks.setdefault(path, next_id())
        decks_json = {
            str(i): {
                "id": i, "name": name, "mod": now_s, "usn": -1, "desc": "", "dyn": 0, "conf": 1,
                "collapsed": False, "browserCollapsed": False, "extendNew": 0, "extendRev": 0,
                "newToday": [0, 0], "revToday": [0, 0], "lrnToday": [0, 0], "timeToday": [0, 0],
            }
            for name, i in list(decks.items()) + ([] if 1 in decks.values() else [("Default", 1)])
        }

        types = []
        for n in self._notes:
            if n.type not in types:
                types.append(n.type)
        models = {str(t.id): _model_json(t) for t in types}
        offset = datetime.fromtimestamp(now_s).astimezone().utcoffset()
        conf = {
            "schedVer": 2, "rollover": 4,
            "creationOffset": int(-(offset.total_seconds() // 60)) if offset is not None else 0,
            "activeDecks": [1], "curDeck": 1, "curModel": types[0].id, "nextPos": len(self._notes) + 1,
            "newSpread": 0, "collapseTime": 1200, "timeLim": 0, "estTimes": True, "dueCounts": True,
            "sortType": "noteFld", "sortBackwards": False, "addToCur": True,
        }
        dconf = {"1": {
            "id": 1, "name": "Default", "mod": 0, "usn": 0, "maxTaken": 60, "autoplay": True, "timer": 0,
            "replayq": True, "dyn": False,
            "new": {"bury": False, "delays": [10, 10], "initialFactor": 2500, "ints": [1, 4, 0], "order": 1,
                    "perDay": 20},
            "rev": {"bury": False, "ease4": 1.3, "ivlFct": 1, "maxIvl": 36500, "perDay": 200, "hardFactor": 1.2},
            "lapse": {"delays": [10], "leechAction": 1, "leechFails": 8, "minInt": 1, "mult": 0},
        }}

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "collection.anki21")
            con = sqlite3.connect(path)
            try:
                con.executescript(SCHEMA)
                for pos, n in enumerate(self._notes, start=1):
                    nid = next_id()
                    sfld = sort_field(n.fields[0])
                    con.execute(
                        "INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')",
                        (nid, n.guid, n.type.id, now_s, f" {' '.join(n.tags)} " if n.tags else "",
                         "\x1f".join(n.fields), sfld, _checksum(sfld)),
                    )
                    for ord_ in n.ords:
                        con.execute(
                            "INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                            (next_id(), nid, decks[n.deck], ord_, now_s, -1 if n.suspended else 0, pos),
                        )
                con.execute(
                    "INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')",
                    (now_s, self.now_ms, self.now_ms, json.dumps(conf), json.dumps(models, ensure_ascii=False),
                     json.dumps(decks_json, ensure_ascii=False), json.dumps(dconf)),
                )
                con.commit()
            finally:
                con.close()
            with open(path, "rb") as f:
                collection = f.read()

        buf = io.BytesIO()
        stamp = datetime.fromtimestamp(max(now_s, 315532800)).timetuple()[:6]
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr(zipfile.ZipInfo("collection.anki21", stamp), collection, zipfile.ZIP_DEFLATED)
            z.writestr(zipfile.ZipInfo("media", stamp),
                       json.dumps({str(i): name for i, name in enumerate(used)}, ensure_ascii=False))
            for i, name in enumerate(used):
                z.writestr(zipfile.ZipInfo(str(i), stamp), self._media[name], zipfile.ZIP_STORED)
        return buf.getvalue(), unused

    def write(self, path: str, quiet: bool = False) -> Report:
        """Construit, vérifie comme Recto l'importera, puis écrit `path` ; DeckError s'il y a des erreurs."""
        data, unused = self.build()
        report = check_bytes(data)
        for name in unused:
            report.warn("média ajouté mais cité par aucune note (laissé de côté)", name)
        if not report.ok:
            raise DeckError("paquet non écrit :\n" + report.text())
        with open(path, "wb") as f:
            f.write(data)
        report.lines.insert(0, f"Écrit : {path} ({len(data) / 1024 / 1024:.1f} Mo)")
        if not quiet:
            print(report.text())
        return report


SCHEMA = """
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
"""


def _model_json(t: NoteType) -> dict:
    occlusion = t.kind == "occlusion"
    flds = [
        {"name": f, "ord": i, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": [],
         **({"tag": i, "preventDeletion": i < 4} if occlusion else {})}
        for i, f in enumerate(t.fields)
    ]
    # Deux sens (Recto M16) : Anki pose la face 1 et répond par la face 2 ; la marque rectoTwoWay
    # rend l'option à Recto (src/lib/export/apkg.ts).
    tmpls = [
        {"name": n, "ord": i, "qfmt": q, "afmt": answer_of_face(a) if both else a, "bqfmt": "", "bafmt": "",
         "did": None, "bfont": "", "bsize": 0, **({"rectoTwoWay": True} if both else {})}
        for i, (n, q, a, both) in enumerate(t.templates)
    ]
    req = [
        [i, "any", [t.fields.index(f) for f in referenced_fields(tpl.front) if f in t.fields]]
        for i, tpl in enumerate(t.templates)
    ]
    if t.kind == "cloze":
        req = [[0, "any", [0]]]
    if occlusion:
        req = [[0, "any", [0, 1, 2]]]
    model = {
        "id": t.id, "mod": t.mod, "usn": -1, "sortf": 0, "did": 1, "css": t.css, "latexPre": LATEX_PRE,
        "latexPost": "\\end{document}", "latexsvg": False, "tags": [], "vers": [], "name": t.name,
        "type": 1 if t.kind in ("cloze", "occlusion") else 0, "flds": flds, "tmpls": tmpls, "req": req,
    }
    if occlusion:
        model["originalStockKind"] = 6
    return model


# ─── Vérification (lecture d'un .apkg comme l'importeur de Recto) ────────────────────────────────


def _split_shape(body: str) -> list[str]:
    parts, cur, i = [], "", 0
    while i < len(body):
        c = body[i]
        if c == "\\" and i + 1 < len(body):
            cur += body[i + 1]
            i += 2
            continue
        if c == ":":
            parts.append(cur)
            cur = ""
        else:
            cur += c
        i += 1
    parts.append(cur)
    return parts


def _occlusion_groups(text: str) -> tuple[list[int], int]:
    """Groupes lisibles par Recto et nombre de formes ignorées (pivotées, texte, en pixels)."""
    groups, skipped = set(), 0
    for m in SHAPE_RE.finditer(text):
        shape, *props = _split_shape(m.group(2))
        p = dict(x.split("=", 1) for x in props if "=" in x and x.index("=") > 0)
        try:
            if shape not in ("rect", "ellipse", "polygon") or float(p.get("angle", 0)) != 0:
                skipped += 1
                continue
            if shape == "rect":
                x, y, w, h = (float(p[k]) for k in ("left", "top", "width", "height"))
            elif shape == "ellipse":
                x, y, w, h = float(p["left"]), float(p["top"]), 2 * float(p["rx"]), 2 * float(p["ry"])
            else:
                pts = [tuple(map(float, q.split(","))) for q in p.get("points", "").split()]
                xs, ys = [q[0] for q in pts], [q[1] for q in pts]
                x, y, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
        except (KeyError, ValueError, IndexError):
            skipped += 1
            continue
        if not all(v <= 1.0001 for v in (x, y, x + w, y + h)):
            skipped += 1
            continue
        x0, y0 = min(1, max(0, x)), min(1, max(0, y))
        x1, y1 = min(1, max(0, x + w)), min(1, max(0, y + h))
        if x1 - x0 < MIN_MASK_SIZE or y1 - y0 < MIN_MASK_SIZE or int(m.group(1)) < 1:
            skipped += 1
            continue
        groups.add(int(m.group(1)))
    return sorted(groups), skipped


def _preview(s: str, limit: int = 90) -> str:
    s = IMG_TAG_RE.sub(lambda m: f" [image {(media_refs(m.group(0)) or ['?'])[0]}] ", s)
    s = SOUND_RE.sub(lambda m: f" [son {m.group(1)}] ", s)
    s = strip_html(s)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _cloze_side(text: str, n: int, answer: bool) -> str:
    def repl(m: re.Match) -> str:
        if int(m.group(1)) != n:
            return m.group(2)
        if answer:
            return f"[{m.group(2)}]"
        return f"[{m.group(3)}]" if m.group(3) else "[…]"

    return CLOZE_RE.sub(repl, text)


# ─── Charte de rédaction : avertissements « charte Rn » (reference/format-cartes.md) ─────────────


def _words(s: str) -> int:
    return len(strip_html(s).split())


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", strip_html(s)).strip().casefold()


def _norm_with_images(s: str) -> str:
    """Comme _norm, mais les noms d'images restent (deux questions-images différentes diffèrent)."""
    return re.sub(r"\s+", " ", sort_field(SOUND_RE.sub(" ", s))).strip().casefold()


def _list_items(s: str) -> int:
    """Nombre d'éléments si le champ est une liste (puces, ou éléments courts séparés par , ; • ·
    ou des retours à la ligne) de plus de MAX_LIST_ITEMS éléments ; 0 sinon."""
    n_li = len(re.findall(r"<li\b", s, re.I))
    if n_li:
        return n_li if n_li > MAX_LIST_ITEMS else 0
    text = strip_html(re.sub(r"<br\s*/?>|</p>|</li>", " ¦ ", s, flags=re.I))
    parts = [p.strip() for p in re.split(r"\s*[;,¦•·]\s*", text) if p.strip()]
    if len(parts) > MAX_LIST_ITEMS and max(len(p) for p in parts) <= 40 and sum(map(len, parts)) / len(parts) <= 25:
        return len(parts)
    return 0


def _answer_in(question: str, answer: str) -> bool:
    """La réponse (2 à 60 caractères) se lit telle quelle dans la question."""
    q, a = _norm(question), _norm(answer)
    return 2 <= len(a) <= 60 and re.search(r"(?<!\w)" + re.escape(a) + r"(?!\w)", q) is not None


def _asked_value(front: str, back: str, fields: list[str], values: list[str]) -> str:
    """Ce qu'une carte one_way demande : le premier champ cité par la réponse et pas par la question."""
    shown = set(referenced_fields(front))
    asked = [f for f in referenced_fields(back) if f in fields and f not in shown]
    return values[fields.index(asked[0])] if asked else ""


def _alts(s: str) -> list[str]:
    return [html.unescape(a or b) for a, b in re.findall(r"""\balt\s*=\s*(?:"([^"]*)"|'([^']*)')""", s, re.I)]


ALT_STOP = {"avec", "sans", "dans", "pour", "carte", "image", "photo", "schéma", "dessin", "plan", "vue", "fond"}


def _alt_leaks(question: str, answer: str) -> bool:
    """Un mot de la réponse (4 lettres ou plus) se lit dans le texte alternatif d'une image de la question."""
    words = [w for w in re.findall(r"\w+", _norm(answer)) if len(w) >= 4 and w not in ALT_STOP]
    for alt in _alts(question):
        a = _norm(alt)
        if any(re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", a) for w in words):
            return True
    return False


def _charte_question(r: Report, q: str, label: str) -> None:
    """Face posée : reconnaissance (R4), énumération (R6), question ouverte (R4)."""
    t = strip_html(q)
    if RECOGNITION_RE.search(t) or len(MCQ_OPTION_RE.findall(t)) >= 2:
        r.warn("charte R4 — question de reconnaissance (vrai/faux, « est-ce que », QCM) : demander la valeur "
               "elle-même (« Australie : capitale » → Canberra)", label)
    if ENUMERATION_RE.search(t):
        r.warn("charte R6 — la question demande une énumération (« cite », « quels sont les ») : une carte par "
               "élément, des groupes de 4 au plus, ou add_sequence si l'ordre compte", label)
    if OPEN_RE.search(t):
        r.warn("charte R4 — question ouverte sans réponse unique (« décris », « parle-moi de », « résume ») : "
               "découper en faits, ou add_question « pourquoi / comment » à réponse courte", label)


def _charte_answer(r: Report, a: str, label: str) -> None:
    """Face attendue : oui/non (R4), réponse longue (R1), liste (R6)."""
    t = strip_html(a)
    if t.casefold().strip(" .!") in YES_NO_ANSWERS:
        r.warn("charte R4 — réponse oui/non ou vrai/faux (une chance sur deux, aucun rappel) : demander la "
               "valeur elle-même", label)
    if _words(a) > LONG_ANSWER_WORDS:
        r.warn(f"charte R1 — réponse de plus de {LONG_ANSWER_WORDS} mots : garder l'essentiel, le reste dans "
               "Extra ou Explication", label)
    n = _list_items(a)
    if n:
        r.warn(f"charte R6 — réponse en liste de {n} éléments (plus de {MAX_LIST_ITEMS}) : découper (une carte "
               "par élément, groupes de 4, ou add_sequence si l'ordre compte)", label)


def _charte_pair(r: Report, q: str, a: str, label: str, two_way: bool) -> None:
    """Question et réponse ensemble : réponse visible (R5), alt bavard (R8), face « ? » (R9)."""
    if _answer_in(q, a):
        r.warn("charte R5 — la question contient la réponse : ne montrer que ce qui est demandé", label)
    if _alt_leaks(q, a):
        r.warn("charte R8 — le texte alternatif (alt) de l'image donne la réponse : décrire l'image sans la "
               "nommer", label)
    if two_way:
        if _answer_in(a, q):
            r.warn("charte R5 — la face 2 contient la face 1 : dans l'autre sens, la question contiendrait "
                   "la réponse", label)
        if any(strip_html(face).endswith("?") and SENTENCE_QUESTION_RE.search(strip_html(face))
               for face in (q, a)):
            r.warn("charte R9 — face en phrase interrogative (« Quel est … ? ») dans une carte posée dans les "
                   "deux sens : elle deviendra une réponse ; écrire chaque face comme une étiquette qui dit ce "
                   "qu'on cherche (« Terre : périmètre ? » ↔ « 40 075 km : de quoi ? ») ou passer en sens "
                   "unique (add_question, one_way)", label)


def _charte_cloze(r: Report, text: str, ords: list[int], label: str) -> None:
    """Texte à trous : trou long (R7), trou-liste (R6), sans contexte (R7), réponse visible (R5)."""
    for o in ords:
        n = o + 1
        answers = [m.group(2) for m in CLOZE_RE.finditer(text) if int(m.group(1)) == n]
        visible = _cloze_side(text, n, False)
        context = strip_html(re.sub(r"\[[^\]]*\]", " ", visible))
        lab = f"{label} [trou {n}]"
        for ans in answers:
            if _words(ans) > LONG_HOLE_WORDS:
                r.warn(f"charte R7 — trou de plus de {LONG_HOLE_WORDS} mots : un trou = un mot, un nombre, une "
                       "expression courte ; sinon plusieurs trous", lab)
            if _list_items(ans):
                r.warn("charte R6 — un trou cache une liste : un trou par élément, ou add_sequence", lab)
            if _answer_in(visible, ans):
                r.warn("charte R5 — la réponse du trou se lit ailleurs dans le texte", lab)
        if len(context) < MIN_CLOZE_CONTEXT:
            r.warn("charte R7 — texte à trous presque sans contexte : le texte visible doit poser une question "
                   "(sujet, précision de lieu ou de date)", lab)


def _charte_note(r: Report, kind: str, question_type: bool, mfields: list[str], tmpls: list[Template],
                 values: list[str], ords: list[int], label: str, groups: dict, group_key: tuple) -> None:
    """Applique la charte à une note ; `groups` accumule les faces pour les contrôles entre notes."""

    def group(part: str, name: str, value: str) -> None:
        if value:
            groups.setdefault((group_key, name, part), {}).setdefault(value, []).append(label)

    if kind == "basic":
        front, back = values[0], values[1]
        _charte_question(r, front, label)
        _charte_answer(r, back, label)
        _charte_answer(r, front, label)
        _charte_pair(r, front, back, label, True)
        if _alt_leaks(back, front):
            r.warn("charte R8 — le texte alternatif (alt) de l'image donne la réponse : décrire l'image sans la "
                   "nommer", label)
        group("verso", "basique", _norm(back))
    elif question_type:
        _charte_question(r, values[0], label)
        _charte_answer(r, values[1], label)
        _charte_pair(r, values[0], values[1], label, False)
    elif kind == "custom":
        vals = dict(zip(mfields, values))
        asked_faces: dict[str, str] = {}  # face posée (normalisée) → nom du modèle qui la pose
        for o in ords:
            t = tmpls[o]
            lab = f"{label} [{t.name}]"
            q = render_template(t.front, vals)
            for face in (q, render_template(t.back, vals)) if t.two_way else (q,):
                key = _norm_with_images(face)
                other = asked_faces.get(key)
                if other and other != t.name:
                    r.warn("charte R5 — deux cartes d'une même note posent la même face : l'apprenant ne sait "
                           "pas ce qu'on lui demande ; écrire sur la face ce qui est cherché "
                           "(« {{Nom}} : numéro ? » et « {{Nom}} : préfecture ? »)",
                           f"{label} [{other} / {t.name}] « {_preview(face, 40)} »")
                asked_faces.setdefault(key, t.name)
            if t.two_way:
                a = render_template(t.back, vals)
                _charte_answer(r, q, lab)
                _charte_answer(r, a, lab)
                _charte_pair(r, q, a, lab, True)
                if _alt_leaks(a, q):
                    r.warn("charte R8 — le texte alternatif (alt) de l'image donne la réponse : décrire l'image "
                           "sans la nommer", lab)
                group("face 1", t.name, _norm_with_images(q))
                group("face 2", t.name, _norm_with_images(a))
            else:
                a = render_template(t.back, vals, front_side="")
                asked = _asked_value(t.front, t.back, mfields, values)
                _charte_question(r, q, lab)
                _charte_answer(r, a, lab)
                _charte_pair(r, q, asked or a, lab, False)
                group("question", t.name, _norm_with_images(q))
    elif kind == "cloze":
        _charte_cloze(r, values[0], ords, label)


def _charte_groups(r: Report, groups: dict) -> None:
    for (_key, name, part), by_value in groups.items():
        for value, labels in by_value.items():
            if len(labels) < 2:
                continue
            example = f"« {value[:40]} » × {len(labels)} ({labels[0]}…)"
            if part == "question":
                r.warn(f"charte R5 — même question pour plusieurs notes (modèle « {name} ») : ambiguë, une seule "
                       "bonne réponse attendue", example)
            else:
                r.warn(f"charte R9 — {part} identique pour plusieurs notes (« {name} ») : posée dans l'autre sens, "
                       "la carte aurait plusieurs bonnes réponses ; sens unique (add_question, one_way) ou "
                       "préciser la face (Olicard, règle 8)", example)


def check_apkg(path: str) -> Report:
    with open(path, "rb") as f:
        return check_bytes(f.read())


def check_bytes(data: bytes) -> Report:
    """Lit un .apkg comme Recto (05-IMPORT-EXPORT §2) et liste ce qui n'irait pas."""
    r = Report()
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        r.error("ce n'est pas une archive .apkg (zip illisible)")
        return r
    names = set(z.namelist())
    if "collection.anki21" in names:
        collection = z.read("collection.anki21")
    elif "collection.anki21b" in names:
        r.error("format récent d'Anki (collection.anki21b) non lu par Recto : réexporter depuis Anki en "
                "cochant « Prendre en charge les anciennes versions d'Anki »")
        return r
    elif "collection.anki2" in names:
        collection = z.read("collection.anki2")
    else:
        r.error("aucune collection (collection.anki21) dans l'archive")
        return r
    media: dict[str, bytes] = {}
    if "media" in names:
        try:
            mapping = json.loads(z.read("media").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            r.error("fichier « media » illisible (format récent d'Anki ?)")
            mapping = {}
        for key, name in mapping.items():
            if key in names:
                media[name] = z.read(key)
            else:
                r.error(f"média « {name} » listé mais absent de l'archive")

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "c.db")
        with open(path, "wb") as f:
            f.write(collection)
        con = sqlite3.connect(path)
        try:
            models_json, decks_json = con.execute("SELECT models, decks FROM col").fetchone()
            notes = con.execute("SELECT id, guid, mid, tags, flds FROM notes ORDER BY id").fetchall()
            cards = con.execute("SELECT nid, did FROM cards ORDER BY id").fetchall()
        except (sqlite3.DatabaseError, TypeError) as e:
            r.error(f"collection illisible : {e}")
            return r
        finally:
            con.close()

    models = {}
    for mid, m in json.loads(models_json).items():
        flds = [f["name"] for f in sorted(m.get("flds", []), key=lambda f: f.get("ord", 0))]
        tmpls = [
            Template(t.get("name", ""), t.get("qfmt", ""), face_of_answer(t.get("afmt", "")), True)
            if t.get("rectoTwoWay") is True
            else Template(t.get("name", ""), t.get("qfmt", ""), t.get("afmt", ""))
            for t in sorted(m.get("tmpls", []), key=lambda t: t.get("ord", 0))
        ]
        kind = _classify(int(m.get("type", 0)), flds, tmpls)
        models[str(mid)] = (m.get("name", "?"), flds, tmpls, kind)
    deck_names = {str(k): v.get("name", "?") for k, v in json.loads(decks_json).items()}
    deck_of = {}
    for nid, did in cards:
        deck_of.setdefault(nid, deck_names.get(str(did), "Default"))

    # Types de notes : ce que Recto en fera.
    for mid, (name, flds, tmpls, kind) in models.items():
        if kind != "custom":
            continue
        for p in [p for p in (_field_name_problem(f) for f in flds) if p] + _template_problems(flds, tmpls):
            r.error(f"type « {name} » : {p}")
        for tpl in tmpls:
            for key, ex in _html_problems(tpl.front + tpl.back):
                r.warn(f"type « {name} » : {key}", ex)

    cards_per_deck: dict[str, int] = {}
    notes_per_model: dict[str, int] = {}
    previews: dict[str, list[str]] = {}
    referenced: set[str] = set()
    seen_guid: set[str] = set()
    seen_front: set[tuple] = set()
    charte_groups: dict = {}
    total_cards = 0
    for nid, guid, mid, _tags, flds in notes:
        mid = str(mid)
        model = models.get(mid)
        if not model:
            r.error(f"note {nid} : type de note absent du paquet")
            continue
        mname, mfields, tmpls, kind = model
        values = flds.split("\x1f")
        label = _preview(values[0] if kind != "occlusion" else (values[1] if len(values) > 1 else ""))
        if len(values) != len(mfields):
            r.error(f"note « {label} » : {len(values)} champs pour {len(mfields)} dans « {mname} »")
            continue
        deck = deck_of.get(nid, "Default")
        if guid in seen_guid:
            r.warn("deux notes avec le même guid (Recto ignore la seconde)", label)
        seen_guid.add(guid)
        if (mid, deck, sort_field(values[0]).strip()) in seen_front and kind != "occlusion":
            r.warn("même premier champ, même type, même paquet : doublon probable", label)
        seen_front.add((mid, deck, sort_field(values[0]).strip()))
        if kind == "basic":
            ords = [0]
        elif kind == "cloze":
            ords = [n - 1 for n in cloze_indices(values[0])]
        elif kind == "occlusion":
            groups, skipped = _occlusion_groups(values[0])
            ords = [g - 1 for g in groups]
            if skipped:
                r.warn("forme d'occlusion ignorée par Recto (pivotée, texte ou en pixels)", label)
        else:
            ords = template_ords(mfields, tmpls, values)
        if not ords:
            r.error(f"note « {label} » ({mname}) : aucune carte pour Recto")
            continue
        total_cards += len(ords)
        cards_per_deck[deck] = cards_per_deck.get(deck, 0) + len(ords)
        notes_per_model[mid] = notes_per_model.get(mid, 0) + 1
        _charte_note(r, kind, int(mid) == QUESTION_ID, mfields, tmpls, values, ords, label, charte_groups,
                     (deck, mid))
        for v in values:
            for name in media_refs(v):
                referenced.add(name)
                if name not in media:
                    r.error(f"note « {label} » : média « {name} » absent du paquet")
            for url in remote_images(v):
                r.warn("image distante : Recto ne la charge jamais (l'inclure comme média)", url[:60])
            for tag in IMG_TAG_RE.findall(v):
                if not re.search(r"\balt\s*=\s*[\"'][^\"']+", tag) and kind != "occlusion":
                    r.warn("image sans texte alternatif (alt)", label)
            if kind != "occlusion":
                for key, ex in _html_problems(v):
                    r.warn(key, ex)
        texts = values[:2] if kind == "basic" else values if kind == "custom" else values[:1]
        if kind in ("basic", "custom", "cloze") and any(len(strip_html(v)) > LONG_TEXT for v in texts):
            r.warn(f"champ de plus de {LONG_TEXT} caractères : carte à découper ?", label)
        # Aperçu : la première note de chaque type, chacune de ses cartes.
        shown = previews.setdefault(mid, [])
        if not shown:
            for o in ords[:6]:
                if kind == "custom":
                    vals = dict(zip(mfields, values))
                    q = render_template(tmpls[o].front, vals)
                    a = render_template(tmpls[o].back, vals, front_side="")
                    if tmpls[o].two_way:
                        shown.append(f"    [{tmpls[o].name}] {_preview(q)} ↔ {_preview(a)} "
                                     "(une carte : l'une ou l'autre face est demandée)")
                    else:
                        shown.append(f"    [{tmpls[o].name}] Q : {_preview(q)} | R : {_preview(a)}")
                elif kind == "cloze":
                    answers = [m.group(2) for m in CLOZE_RE.finditer(values[0]) if int(m.group(1)) == o + 1]
                    shown.append(f"    [trou {o + 1}] Q : {_preview(_cloze_side(values[0], o + 1, False), 140)}"
                                 f" | R : {_preview(' … '.join(answers))}")
                elif kind == "basic":
                    shown.append(f"    Q : {_preview(values[0])} | R : {_preview(values[1])}")
                else:
                    lines = {ln.split(" : ", 1)[0].strip(): ln.split(" : ", 1)[-1]
                             for ln in re.split(r"<br\s*/?>", values[4] if len(values) > 4 else "") if " : " in ln}
                    answer = _preview(lines.get(str(o + 1), "")) or "(pas de réponse écrite)"
                    shown.append(f"    [masque {o + 1}] image : {label} | R : {answer}")

    for name, data_ in media.items():
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        kind = EXTENSIONS.get(ext)
        if kind is None:
            (r.error if name in referenced else r.warn)(f"média « {name} » : format refusé par Recto")
            continue
        if name not in referenced:
            r.warn("média inclus mais cité par aucune note (importé inutilement)", name)
        if kind == "image":
            size = image_size(data_)
            if size and max(size) > MAX_IMAGE_SIDE and ext in ("png", "jpg", "jpeg", "webp"):
                r.warn(f"image de plus de {MAX_IMAGE_SIDE} px (Recto la réduit à l'import)", name)
            if len(data_) > HEAVY_IMAGE_BYTES:
                r.warn(f"image de plus de {HEAVY_IMAGE_BYTES // 1024} Ko (paquet lourd sur téléphone)", name)
        elif len(data_) > HEAVY_AUDIO_BYTES:
            r.warn(f"son de plus de {HEAVY_AUDIO_BYTES // 1024 // 1024} Mo", name)
    for deck in cards_per_deck:
        if deck.count("::") > 1:
            r.warn("paquet à plus de deux niveaux : Recto aplatit au-delà de « A::B »", deck)
    _charte_groups(r, charte_groups)

    kinds = {
        "basic": "basique (une carte, posée dans les deux sens si le paquet alterne)",
        "question": "question à sens unique",
        "cloze": "texte à trous (une carte par numéro)",
        "occlusion": "occlusion d'image (une carte par groupe de masques)",
    }
    size = sum(len(d) for d in media.values()) / 1024 / 1024
    r.lines.append(f"{len(notes)} notes, {total_cards} cartes, {len(media)} médias ({size:.1f} Mo)")
    r.lines.append("Paquets :")
    r.lines += [f"  {d} : {n} cartes" for d, n in sorted(cards_per_deck.items())]
    r.lines.append("Types de notes :")
    for mid, (name, _f, tmpls, kind) in models.items():
        if mid not in notes_per_model:
            continue
        desc = kinds.get(kind, "")
        if kind == "custom":
            desc = ("question à sens unique" if int(mid) == QUESTION_ID else
                    f"type personnalisé, {len(tmpls)} carte(s) par note : "
                    + ", ".join(f"{t.name} (deux sens)" if t.two_way else t.name for t in tmpls))
        r.lines.append(f"  {name} ({notes_per_model[mid]} notes) : {desc}")
        r.lines += previews.get(mid, [])
    return r


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) != 3 or argv[1] != "check":
        print("usage : python recto_apkg.py check paquet.apkg", file=sys.stderr)
        return 2
    report = check_apkg(argv[2])
    print(report.text())
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
