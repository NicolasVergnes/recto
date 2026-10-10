"""Imports an .apkg into a fresh collection with the real Anki backend (PyPI `anki`) and prints a
JSON summary followed by a verdict. Manual interoperability check, not run by `npm run verify`
(see tests/interop/README.md).

Usage:
  PYTHONPATH=<dir with the anki package> python3 check_apkg.py file.apkg <new work dir> [options]

--twice   imports the package a second time: the notes must come back as duplicates, not new ones.
--fsrs    enables FSRS in the target collection before importing.
--aged    moves the target collection's creation 100 days back (today = 100): review due days must
          be rebased on it (a card due in 3 days gets due = today + 3).

Round trip (a package exported by Recto over the package it came from, e.g. the real AnkiWeb deck):
--base BASE.apkg   imports BASE first, with the import settings Anki desktop proposes (what the
                   backend returns as presets for its import dialog). The verified package is then
                   expected to be a re-export of the base: it must add no note, card or deck, copy
                   no note type and leave the base's note types as they were (name, fields and
                   their options, templates, sort field, CSS; `mod` alone may change); the verdict
                   lists what it did not respect.

Settings of the verified import (without them: merge on, update if newer, as always before):
--merge-notetypes {true,false}
--update-notes {if-newer,always,never}
--update-notetypes {if-newer,always,never}
--desktop-defaults  takes the three settings above from the backend's presets (what Anki desktop
                    proposes in its import dialog); an explicit option wins over it. Scheduling
                    stays imported: it is what the check looks at.

Other:
--expect FILE.json  expectations written by the package builder: notes, cards, cards_by_ord,
                    revlog and the questions (and answers) rendered by Recto, compared to what
                    Anki renders (the `[[type:Field]]` placeholder of typed answers is ignored).
                    The package's own revlog rows must also be in Anki's.
--brief             leaves the detail of every card and the list of media files out of the summary
                    (large packages); the counts remain (`cards_by_ord`, `media_count`).

The summary lists the note types after each import (`notetypes_detail`; the stock types of a new
collection are left out while no note uses them): id, fields, templates, sort field, `mod` and
fingerprints (first 8 hex digits of SHA-1) of the CSS, of the fields' options and of the front and
back of every template.
"""
import argparse
import collections
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import zipfile

from anki.collection import Collection, ImportAnkiPackageOptions, ImportAnkiPackageRequest

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

LOG_KEYS = ("new", "updated", "duplicate", "conflicting", "first_field_match",
            "missing_notetype", "missing_deck", "empty_first_field")
CONDITIONS = {"if-newer": 0, "always": 1, "never": 2}

parser = argparse.ArgumentParser(allow_abbrev=False, description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("apkg")
parser.add_argument("work", help="new work directory (must not exist)")
parser.add_argument("--twice", action="store_true")
parser.add_argument("--fsrs", action="store_true")
parser.add_argument("--aged", action="store_true")
parser.add_argument("--base")
parser.add_argument("--merge-notetypes", choices=("true", "false"))
parser.add_argument("--update-notes", choices=tuple(CONDITIONS))
parser.add_argument("--update-notetypes", choices=tuple(CONDITIONS))
parser.add_argument("--desktop-defaults", action="store_true")
parser.add_argument("--expect")
parser.add_argument("--brief", action="store_true")
args = parser.parse_args()

apkg = os.path.abspath(args.apkg)
work = args.work
os.makedirs(work, exist_ok=False)
col = Collection(os.path.join(work, "check.anki2"))
if args.fsrs:
    col.set_config("fsrs", True)
if args.aged:
    col.db.execute("update col set crt = crt - 100 * 86400")


def dump(value, level=0):
    """JSON, one key per line (indent 1) but arrays of plain values on a single line."""
    if isinstance(value, dict):
        if not value:
            return "{}"
        pad = " " * (level + 1)
        items = [f"{pad}{json.dumps(str(k), ensure_ascii=False)}: {dump(v, level + 1)}"
                 for k, v in value.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * level + "}"
    if isinstance(value, list):
        if all(not isinstance(v, (dict, list)) for v in value):
            return json.dumps(value, ensure_ascii=False, default=str)
        pad = " " * (level + 1)
        return "[\n" + ",\n".join(pad + dump(v, level + 1) for v in value) + "\n" + " " * level + "]"
    return json.dumps(value, ensure_ascii=False, default=str)


def desktop_presets():
    """The import settings Anki desktop proposes: what the backend returns for its dialog."""
    get = getattr(col._backend, "get_import_anki_package_presets", None)
    if get is None:
        return ImportAnkiPackageOptions(), "fallback (all off, update if newer)"
    return get(), "backend presets"


def verified_options():
    """Settings of the verified import: the long-standing ones, unless an option says otherwise."""
    merge, notes, notetypes = True, 0, 0
    source = "script defaults"
    if args.desktop_defaults:
        presets, source = desktop_presets()
        merge, notes, notetypes = presets.merge_notetypes, presets.update_notes, presets.update_notetypes
    if args.merge_notetypes is not None:
        merge = args.merge_notetypes == "true"
    if args.update_notes is not None:
        notes = CONDITIONS[args.update_notes]
    if args.update_notetypes is not None:
        notetypes = CONDITIONS[args.update_notetypes]
    return ImportAnkiPackageOptions(with_scheduling=True, with_deck_configs=False,
                                    merge_notetypes=merge, update_notes=notes,
                                    update_notetypes=notetypes), source


def describe(options):
    return {"merge_notetypes": options.merge_notetypes, "update_notes": options.update_notes,
            "update_notetypes": options.update_notetypes, "with_scheduling": options.with_scheduling,
            "with_deck_configs": options.with_deck_configs}


def run_import(path, options):
    res = col.import_anki_package(ImportAnkiPackageRequest(package_path=path, options=options))
    return {k: len(getattr(res.log, k)) for k in LOG_KEYS}


def fingerprint(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def all_notetypes():
    """The note types as the backend holds them: an import does not refresh the Python-side cache
    of `col.models`, which would still show a note type an import has just updated."""
    getattr(col.models, "_clear_cache", lambda: None)()
    return col.models.all()


STOCK = {nt["id"] for nt in all_notetypes()}


def notetypes_summary():
    """The note types as the collection holds them now (mod, CSS and templates are fingerprinted).
    The stock types of a new collection are left out as long as no note uses them."""
    rows = []
    for nt in all_notetypes():
        if nt["id"] in STOCK and col.models.use_count(nt) == 0:
            continue
        css = nt.get("css", "")
        rows.append({
            "name": nt["name"], "id": nt["id"], "kind": nt.get("type"),
            "fields": [f["name"] for f in nt["flds"]],
            "fields_fp": fingerprint(json.dumps([[f.get("font"), f.get("size"), f.get("sticky"),
                                                  f.get("rtl")] for f in nt["flds"]])),
            "templates": [t["name"] for t in nt["tmpls"]],
            "sort_field": nt.get("sortf"),
            "css_len": len(css), "css_fp": fingerprint(css),
            "templates_fp": [[fingerprint(t["qfmt"]), fingerprint(t["afmt"])] for t in nt["tmpls"]],
            "mod": nt.get("mod"), "notes": col.models.use_count(nt),
        })
    return sorted(rows, key=lambda r: (r["name"], r["id"]))


def notetype_changes(before, after):
    """What an import changed in the note types that existed before it (`mod` alone is harmless)."""
    now = {n["id"]: n for n in after}
    changes = []
    for old in before:
        new = now.get(old["id"])
        if new is None:
            changes.append({"id": old["id"], "name": old["name"], "removed": True})
            continue
        changed = [k for k in ("name", "kind", "fields", "fields_fp", "templates", "sort_field",
                               "css_len", "css_fp", "templates_fp", "mod") if new[k] != old[k]]
        if changed:
            changes.append({"id": old["id"], "name": old["name"], "changed": changed})
    return changes


def normalized(html):
    """Question or answer HTML as compared with Recto's: no typed-answer placeholder, one space."""
    return re.sub(r"\s+", " ", re.sub(r"\[\[type:[^\]]*\]\]", "", html)).strip()


REVLOG_COLUMNS = "ease, ivl, lastIvl, type, time"


def package_revlog(path):
    """The revlog rows (ease, ivl, lastIvl, type, time) written in the package itself."""
    with zipfile.ZipFile(path) as z:
        name = "collection.anki21" if "collection.anki21" in z.namelist() else "collection.anki2"
        data = z.read(name)
    with tempfile.TemporaryDirectory() as tmp:
        copy = os.path.join(tmp, "package.sqlite")
        with open(copy, "wb") as f:
            f.write(data)
        con = sqlite3.connect(copy)
        try:
            return [tuple(r) for r in con.execute(f"select {REVLOG_COLUMNS} from revlog")]
        finally:
            con.close()


def check_expectations(path, cards_by_ord):
    """Counts and rendered sides written by the builder (`expect` in the summary)."""
    with open(path, encoding="utf-8") as f:
        expected = json.load(f)
    problems = []
    for key, got in (("notes", col.note_count()), ("cards", col.card_count()),
                     ("revlog", col.db.scalar("select count() from revlog")),
                     ("cards_by_ord", {str(k): v for k, v in cards_by_ord.items()})):
        if key in expected and expected[key] != got:
            problems.append(f"{key}: expected {expected[key]}, Anki has {got}")
    ours = collections.Counter(package_revlog(apkg))
    theirs = collections.Counter(tuple(r) for r in col.db.all(f"select {REVLOG_COLUMNS} from revlog"))
    if ours - theirs:
        problems.append(f"revlog: {sum((ours - theirs).values())} row(s) of the package are not in "
                        f"Anki's ({REVLOG_COLUMNS}), e.g. {sorted(ours - theirs)[:2]}")
    rendered = {}
    for cid in col.find_cards(""):
        card = col.get_card(cid)
        out = card.render_output(reload=True)
        rendered[(card.note().fields[0], card.ord)] = (normalized(out.question_text),
                                                       normalized(out.answer_text))
    checked = 0
    for q in expected.get("questions", []):
        got = rendered.get((q["front"], q["ord"]))
        if got is None:
            problems.append(f"no card for {q['front']!r} (ord {q['ord']})")
            continue
        checked += 1
        if got[0] != normalized(q["question"]):
            problems.append(f"question of {q['front']!r} (ord {q['ord']}): Recto {q['question']!r}, Anki {got[0]!r}")
        if "answer" in q and got[1] != normalized(q["answer"]):
            problems.append(f"answer of {q['front']!r} (ord {q['ord']}): Recto {q['answer']!r}, Anki {got[1]!r}")
    return {"file": os.path.basename(path), "rendered_checked": checked,
            "revlog_rows_checked": sum(ours.values()), "problems": problems}


try:
    out = {"anki": __import__("anki.buildinfo", fromlist=["version"]).version}
    snapshots = {}
    if args.base:
        base_options, source = desktop_presets()
        out["base"] = {"file": os.path.basename(args.base), "settings": source,
                       "options": describe(base_options),
                       "log": run_import(os.path.abspath(args.base), base_options)}
        out["base"].update({"notes": col.note_count(), "cards": col.card_count()})
        snapshots["base"] = notetypes_summary()
    options, source = verified_options()
    out["import_options"] = {"settings": source, **describe(options)}
    before = {"notes": col.note_count(), "cards": col.card_count(), "notetypes": notetypes_summary(),
              "ids": {nt["id"] for nt in all_notetypes()},
              "names": [nt["name"] for nt in all_notetypes()],
              "decks": sorted(d.name for d in col.decks.all_names_and_ids())}
    out["import1"] = run_import(apkg, options)
    snapshots["import1"] = notetypes_summary()
    notes_after_first = col.note_count()
    if args.twice:
        out["import2"] = run_import(apkg, options)
        snapshots["import2"] = notetypes_summary()
    cards = []
    for cid in col.find_cards(""):
        c = col.get_card(cid)
        ms = c.memory_state
        cards.append({
            "nid": c.nid, "ord": c.ord, "deck": col.decks.name(c.did), "type": c.type,
            "queue": c.queue, "due": c.due, "ivl": c.ivl, "factor": c.factor, "reps": c.reps,
            "lapses": c.lapses, "left": c.left, "flags": c.flags,
            "memory": None if ms is None else [round(ms.stability, 2), round(ms.difficulty, 2)],
            "front": c.note().fields[0][:40], "question": c.question()[:60],
        })
    notes, revlog = col.note_count(), col.db.scalar("select count() from revlog")
    cards_by_ord = {}
    for c in cards:
        cards_by_ord[c["ord"]] = cards_by_ord.get(c["ord"], 0) + 1
    out.update({
        "today": col.sched.today,
        "notes": notes,
        "cards": col.card_count(),
        "cards_by_ord": dict(sorted(cards_by_ord.items())),
        "revlog": revlog,
        "decks": sorted(d.name for d in col.decks.all_names_and_ids()),
        "notetypes": sorted(n.name for n in col.models.all_names_and_ids()),
        "notetypes_detail": snapshots,
        "media_count": len(os.listdir(col.media.dir())),
    })
    if not args.brief:
        out["media"] = sorted(os.listdir(col.media.dir()))
        out["cards_detail"] = cards
    # Image occlusion notes (Anki's own note type): Anki must parse the masks, one card per group.
    occlusions = []
    for nt in all_notetypes():
        if nt.get("originalStockKind") != 6:
            continue
        for nid in col.models.nids(nt["id"]):
            parsed = col.get_image_occlusion_note(nid)
            ords = sorted({o.ordinal - 1 for o in parsed.note.occlusions if o.ordinal > 0})
            occlusions.append({
                "nid": nid, "shapes": sum(len(o.shapes) for o in parsed.note.occlusions),
                "groups": ords, "cards": sorted(c.ord for c in col.get_note(nid).cards()),
                "image_bytes": len(parsed.note.image_data),
            })
    out["image_occlusion"] = occlusions
    if args.expect:
        out["expect"] = check_expectations(os.path.abspath(args.expect), cards_by_ord)
    problems, ok = col.fix_integrity()
    # "Database rebuilt and optimized." is always reported: it is not a problem.
    problems = [p for p in problems.splitlines() if p and not p.startswith("Database rebuilt")]
    out["check_database"] = {"ok": ok, "problems": problems}
    failures = []
    if args.base:
        # A re-export of the base: nothing new, no copied note type, base note types untouched.
        changes = notetype_changes(before["notetypes"], snapshots["import2" if args.twice else "import1"])
        out["base_notetype_changes"] = changes
        added = [nt["name"] for nt in all_notetypes() if nt["id"] not in before["ids"]]
        out["notetypes_added"] = sorted(added)
        if out["base"]["log"]["new"] != out["base"]["notes"]:
            failures.append("base import: new notes != notes in the collection")
        if out["import1"]["new"] != notes_after_first - before["notes"]:
            failures.append("first import: new notes != notes added to the collection")
        if notes != before["notes"]:
            failures.append(f"the verified package added {notes - before['notes']} note(s) to the base")
        if out["cards"] != before["cards"]:
            failures.append(f"cards: {before['cards']} in the base, {out['cards']} after the verified import")
        if "import2" in out and out["import2"]["new"]:
            failures.append("second import: notes were added instead of being recognised")
        for name in added:
            if any(name.lower() != old.lower() and name.lower().startswith(old.lower())
                   for old in before["names"]):
                failures.append(f"note type {name!r} is a copy of a note type of the base")
        for change in changes:
            if change.get("removed") or set(change["changed"]) - {"mod"}:
                failures.append(f"note type {change['name']!r} of the base was altered "
                                f"({', '.join(change.get('changed', ['removed']))})")
        new_decks = sorted(set(out["decks"]) - set(before["decks"]))
        if new_decks:
            failures.append(f"deck(s) added to the base: {new_decks}")
    else:
        if out["import1"]["new"] != notes:
            failures.append("first import: new notes != notes in the collection")
        if "import2" in out and (out["import2"]["new"] or out["import2"]["duplicate"] != notes):
            failures.append("second import: notes were added instead of being recognised")
    if any(n.endswith("+") for n in out["notetypes"]):
        failures.append("a note type was duplicated (name ending with '+')")
    if not ok or problems:
        failures.append("Check Database reported problems")
    if any(o["groups"] != o["cards"] or not o["image_bytes"] for o in occlusions):
        failures.append("an image occlusion note does not have one card per mask group, or no image")
    if "expect" in out:
        failures.extend(f"expectation: {p}" for p in out["expect"]["problems"])
    out["verdict"] = "OK" if not failures else failures
    print(dump(out))
    sys.exit(0 if not failures else 1)
finally:
    col.close()
