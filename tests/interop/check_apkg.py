"""Imports an .apkg into a fresh collection with the real Anki backend (PyPI `anki`) and prints a
JSON summary followed by a verdict. Manual interoperability check, not run by `npm run verify`
(see tests/interop/README.md).

Usage:
  PYTHONPATH=<dir with the anki package> python3 check_apkg.py file.apkg <new work dir> [--twice] [--fsrs]

--twice  imports the package a second time: the notes must come back as duplicates, not new ones.
--fsrs   enables FSRS in the target collection before importing.
--aged   moves the target collection's creation 100 days back (today = 100): review due days must
         be rebased on it (a card due in 3 days gets due = today + 3).
"""
import json
import os
import sys

from anki.collection import Collection, ImportAnkiPackageOptions, ImportAnkiPackageRequest

LOG_KEYS = ("new", "updated", "duplicate", "conflicting", "first_field_match",
            "missing_notetype", "missing_deck", "empty_first_field")

apkg = os.path.abspath(sys.argv[1])
work = sys.argv[2]
os.makedirs(work, exist_ok=False)
col = Collection(os.path.join(work, "check.anki2"))
if "--fsrs" in sys.argv:
    col.set_config("fsrs", True)
if "--aged" in sys.argv:
    col.db.execute("update col set crt = crt - 100 * 86400")


def run_import():
    res = col.import_anki_package(ImportAnkiPackageRequest(
        package_path=apkg,
        options=ImportAnkiPackageOptions(with_scheduling=True, with_deck_configs=False,
                                         merge_notetypes=True, update_notes=0, update_notetypes=0)))
    return {k: len(getattr(res.log, k)) for k in LOG_KEYS}


try:
    out = {"import1": run_import()}
    if "--twice" in sys.argv:
        out["import2"] = run_import()
    cards = []
    for cid in col.find_cards(""):
        c = col.get_card(cid)
        ms = c.memory_state
        cards.append({
            "nid": c.nid, "ord": c.ord, "deck": col.decks.name(c.did), "type": c.type,
            "queue": c.queue, "due": c.due, "ivl": c.ivl, "factor": c.factor, "reps": c.reps,
            "lapses": c.lapses, "left": c.left, "flags": c.flags,
            "memory": None if ms is None else [round(ms.stability, 2), round(ms.difficulty, 2)],
            "question": c.question()[:60],
        })
    notes, revlog = col.note_count(), col.db.scalar("select count() from revlog")
    out.update({
        "today": col.sched.today,
        "notes": notes,
        "cards": col.card_count(),
        "revlog": revlog,
        "decks": sorted(d.name for d in col.decks.all_names_and_ids()),
        "notetypes": sorted(n.name for n in col.models.all_names_and_ids()),
        "media": sorted(os.listdir(col.media.dir())),
        "cards_detail": cards,
    })
    problems, ok = col.fix_integrity()
    # "Database rebuilt and optimized." is always reported: it is not a problem.
    problems = [p for p in problems.splitlines() if p and not p.startswith("Database rebuilt")]
    out["check_database"] = {"ok": ok, "problems": problems}
    failures = []
    if out["import1"]["new"] != notes:
        failures.append("first import: new notes != notes in the collection")
    if "import2" in out and (out["import2"]["new"] or out["import2"]["duplicate"] != notes):
        failures.append("second import: notes were added instead of being recognised")
    if any(n.endswith("+") for n in out["notetypes"]):
        failures.append("a note type was duplicated (name ending with '+')")
    if not ok or problems:
        failures.append("Check Database reported problems")
    out["verdict"] = "OK" if not failures else failures
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    sys.exit(0 if not failures else 1)
finally:
    col.close()
