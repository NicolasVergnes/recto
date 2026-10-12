#!/usr/bin/env python3
"""Vérifie un CSV de paquet Recto avant import.

Usage : python check_deck.py fichier.csv
Code de sortie : 0 = aucune erreur (des avertissements restent possibles), 1 = erreurs.
Bibliothèque standard uniquement.
"""
import csv
import io
import re
import sys

HEADER = re.compile(r"^(recto|front|question|texte|text|cloze)$", re.I)
CLOZE = re.compile(r"\{\{c\d+::")
ALLOWED = {"b", "i", "u", "br", "hr", "p", "ul", "ol", "li", "img", "sub", "sup", "span"}
TAG = re.compile(r"</?\s*([a-zA-Z][a-zA-Z0-9]*)")
MAX_LEN = 200


def plain(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def check(path: str) -> int:
    raw = open(path, "rb").read()
    errors: list[str] = []
    warnings: list[str] = []
    text = raw.decode("utf-8-sig")
    delim = max(";,\t|", key=text[:2000].count)
    rows = [
        r
        for r in csv.reader(io.StringIO(text, newline=""), delimiter=delim)
        if any(c.strip() for c in r)
    ]
    if not rows:
        return finish(["fichier vide"], warnings)
    if not any(HEADER.match(c.strip()) for c in rows[0]):
        return finish(
            ["ligne 1 : en-tête absent (une colonne doit s'appeler recto, texte, front, question ou cloze)"],
            warnings,
        )
    head = [c.strip().lower() for c in rows[0]]
    front = next(i for i, h in enumerate(head) if HEADER.match(h))
    typ = head.index("type") if "type" in head else -1
    seen: dict[str, int] = {}
    kinds: set[str] = set()
    for n, row in enumerate(rows[1:], start=2):
        if len(row) != len(head):
            errors.append(f"ligne {n} : {len(row)} colonnes au lieu de {len(head)}")
            continue
        f = row[front].strip()
        if not f:
            errors.append(f"ligne {n} : recto vide")
            continue
        explicit = row[typ].strip().lower() if typ >= 0 else ""
        is_cloze = explicit in ("cloze", "texte à trous") or (not explicit and bool(CLOZE.search(f)))
        kinds.add("cloze" if is_cloze else "basic")
        if is_cloze and not CLOZE.search(f):
            errors.append(f"ligne {n} : carte cloze sans {{{{c1::…}}}}")
        for cell in row:
            for t in TAG.findall(cell):
                if t.lower() not in ALLOWED:
                    warnings.append(f"ligne {n} : balise <{t}> non autorisée (sera retirée)")
            if re.search(r"<img\b|\[sound:", cell):
                warnings.append(f"ligne {n} : média référencé, à importer à part")
        if len(plain(f)) > MAX_LEN:
            warnings.append(f"ligne {n} : plus de {MAX_LEN} caractères, carte à découper ?")
        key = plain(f).lower()
        if key in seen:
            warnings.append(f"ligne {n} : même recto que la ligne {seen[key]} (ignorée à l'import)")
        seen.setdefault(key, n)
    if typ < 0 and len(kinds) > 1:
        errors.append("basique et cloze mélangés sans colonne « type » : ajouter la colonne ou séparer les fichiers")
    print(f"{len(rows) - 1} ligne(s), séparateur {delim!r}, types : {', '.join(sorted(kinds)) or '-'}")
    return finish(errors, warnings)


def finish(errors: list[str], warnings: list[str]) -> int:
    for w in warnings:
        print("avertissement :", w)
    for e in errors:
        print("ERREUR :", e)
    print("OK" if not errors else f"{len(errors)} erreur(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        sys.exit("usage : python check_deck.py fichier.csv")
    sys.exit(check(sys.argv[1]))
