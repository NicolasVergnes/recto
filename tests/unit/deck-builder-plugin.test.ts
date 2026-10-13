/**
 * The Claude plugin tools/deck-builder (05 §2, STATUS « Décisions ») writes .apkg packages with a
 * Python library: they must import into Recto as intended. Python 3 is required (preinstalled
 * on the CI runner); the packages are built here and read by the real Anki importer.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { parseOcclusion } from '$lib/domain/occlusion'
import {
  planApkgImport,
  readApkg,
  type ApkgExisting,
  type ApkgImportOptions,
} from '$lib/import/apkg'
import { sha256Hex } from '$lib/media/hash'

const skill = resolve(process.cwd(), 'tools/deck-builder/skills/deck-builder')
const library = join(skill, 'scripts')
const now = Date.UTC(2026, 9, 13, 8)
const options: ApkgImportOptions = {
  target: { mode: 'anki' },
  importHistory: false,
  scheduler: 'fsrs',
  dayStartHour: 4,
}
const empty: ApkgExisting = { decks: [], notes: [], cards: [], media: new Map() }

let SQL: SqlJsStatic
let python = ''
let dir = ''
let seq = 0
const newId = () => `id-${++seq}`

beforeAll(async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  SQL = await initSqlJs()
  // `python3` on Linux and macOS, `python` on Windows (where `python3` may be a Store stub).
  python =
    ['python3', 'python'].find((cmd) => {
      const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' })
      return r.status === 0 && /Python 3\./.test(r.stdout + r.stderr)
    }) ?? ''
  if (!python) throw new Error('Python 3 is required by the deck-builder plugin tests')
  dir = mkdtempSync(join(tmpdir(), 'recto-deck-builder-'))
})

/** Runs a Python file; returns its exit status and output. */
function run(args: string[]) {
  const r = spawnSync(python, args, {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

/** Writes and runs a build script that imports the library (argv[1] = library folder). */
function build(name: string, body: string) {
  const script = join(dir, `${name}.py`)
  writeFileSync(
    script,
    `import sys\nsys.path.insert(0, sys.argv[1])\nfrom recto_apkg import *\n${body}`,
    'utf8',
  )
  return run([script, library, join(dir, `${name}.apkg`)])
}

const read = (name: string) => readApkg(new Uint8Array(readFileSync(join(dir, name))), SQL)

describe('deck-builder plugin: the example package', () => {
  it('imports every note type of Recto, with its media', async () => {
    const out = join(dir, 'exemple.apkg')
    const built = run([join(skill, 'examples/exemple.py'), out])
    expect(built.out).toContain('OK : importable dans Recto')
    expect(built.status).toBe(0)

    const plan = await planApkgImport(read('exemple.apkg'), options, empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.report.missingMedia).toEqual([])
    expect(plan.report.decksCreated.sort()).toEqual(['Exemple', 'Pays', 'Sciences', 'Vocabulaire'])
    expect(plan.report.noteTypesCreated.sort()).toEqual(["Pays d'Europe", 'Recto · Question'])

    const kinds = plan.notes.map((n) => n.modelType)
    expect(kinds.filter((k) => k === 'custom')).toHaveLength(5)
    expect(kinds.filter((k) => k === 'basic')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'cloze')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'image_occlusion')).toHaveLength(1)
    // 4 countries × 2 cards (Drapeau → Pays, Pays ↔ Capitale), 2 basic, 1 question, 2 holes,
    // 4 masks.
    expect(plan.cards).toHaveLength(17)

    const country = plan.noteTypes?.find((t) => t.name === "Pays d'Europe")
    expect(country?.fields).toEqual(['Drapeau', 'Pays', 'Capitale', 'Continent'])
    expect(country?.templates[0]).toEqual({
      name: 'Drapeau → Pays',
      front: '{{Drapeau}}<br>Quel pays ?',
      back: '{{FrontSide}}<hr id=answer>{{Pays}}<br>{{Continent}}',
    })
    // « Pays ↔ Capitale »: one card, asked by either face (M16).
    expect(country?.templates[1]).toEqual({
      name: 'Pays ↔ Capitale',
      front: '{{Pays}}',
      back: '{{Capitale}}',
      twoWay: true,
    })
    const france = plan.notes.find((n) => n.fields[1] === 'France')
    expect(france?.fields[0]).toBe(
      '<img src="drapeau_france.svg" alt="Drapeau à bandes verticales">',
    )
    expect(france?.tags).toEqual(['europe', 'exemple'])

    const question = plan.noteTypes?.find((t) => t.name === 'Recto · Question')
    expect(question?.fields).toEqual(['Question', 'Réponse', 'Explication', 'Source'])
    const asked = plan.notes.find((n) => n.noteTypeId === question?.id)
    expect(plan.cards.filter((c) => c.noteId === asked?.id)).toHaveLength(1)

    const cloze = plan.notes.find((n) => n.modelType === 'cloze')
    expect(cloze?.fields[0]).toContain('{{c1::\\(E_c = \\tfrac{1}{2} m v^2\\)}}')

    const occlusion = plan.notes.find((n) => n.modelType === 'image_occlusion')
    expect(occlusion?.fields[0]).toBe(
      '<img src="couches_terre.svg" alt="Coupe schématique de la Terre">',
    )
    expect(occlusion?.fields[2]).toBe('Les couches de la Terre')
    const masks = parseOcclusion(occlusion?.fields[1] ?? '')
    expect(masks.mode).toBe('hideAll')
    expect(masks.masks.map((m) => [m.n, m.label])).toEqual([
      [1, 'Croûte'],
      [2, 'Manteau'],
      [3, 'Noyau externe'],
      [4, 'Noyau interne'],
    ])
    for (const m of masks.masks) {
      expect(m.x + m.w).toBeLessThanOrEqual(1)
      expect(m.y + m.h).toBeLessThanOrEqual(1)
    }

    expect(plan.media.map((m) => [m.name, m.mime]).sort()).toEqual([
      ['couches_terre.svg', 'image/svg+xml'],
      ['drapeau_allemagne.svg', 'image/svg+xml'],
      ['drapeau_belgique.svg', 'image/svg+xml'],
      ['drapeau_france.svg', 'image/svg+xml'],
      ['drapeau_italie.svg', 'image/svg+xml'],
    ])
  })
})

describe('deck-builder plugin: regenerating a package', () => {
  const deck = (now: number, prefecture: string) => `
pkg = Package(now=${now})
t = pkg.note_type("Département", ["Carte", "Nom", "Numéro", "Préfecture"], [
    one_way("Carte → Nom", "{{Carte}}<br>Quel département ?", "{{FrontSide}}<hr id=answer>{{Nom}}"),
    two_way("Nom ↔ Numéro", "{{Nom}}", "{{Numéro}}"),
    two_way("Nom ↔ Préfecture", "{{Nom}}", "{{Préfecture}}"),
])
carte = pkg.add_media(b"\\x89PNG\\r\\n\\x1a\\n" + bytes(8) + bytes([0,0,0,10,0,0,0,10]), name="departement_95.png")
pkg.add_note(t, "Géographie::Départements", {"Carte": img(carte, "Carte"), "Nom": "Val-d'Oise",
             "Numéro": "95", "Préfecture": "${prefecture}"})
son = pkg.add_media(b"ID3fake", name="bonjour.mp3")
pkg.add_basic("Langues", "bonjour " + sound(son), "hello")
pkg.write(sys.argv[2])
`

  it('updates the notes instead of duplicating them, and keeps the note type', async () => {
    expect(build('v1', deck(1_790_000_000, 'Pontoise')).status).toBe(0)
    expect(build('v2', deck(1_790_000_600, 'Cergy')).status).toBe(0)

    const first = await planApkgImport(read('v1.apkg'), options, empty, now, newId)
    expect(first.report.errors).toEqual([])
    // Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture: three cards, two of them asked both ways.
    expect(first.noteTypes?.[0]?.templates.map((t) => [t.name, t.twoWay ?? false])).toEqual([
      ['Carte → Nom', false],
      ['Nom ↔ Numéro', true],
      ['Nom ↔ Préfecture', true],
    ])
    expect(first.cards).toHaveLength(4)
    expect(first.report.missingMedia).toEqual([])
    expect(first.media.map((m) => [m.name, m.mime]).sort()).toEqual([
      ['bonjour.mp3', 'audio/mpeg'],
      ['departement_95.png', 'image/png'],
    ])
    expect(first.notes.find((n) => n.modelType === 'basic')?.fields[0]).toBe(
      'bonjour [sound:bonjour.mp3]',
    )

    const media = new Map<string, string>()
    for (const m of first.media)
      media.set(m.name, await sha256Hex(new Uint8Array(await m.blob.arrayBuffer())))
    const existing: ApkgExisting = {
      decks: first.decks,
      notes: first.notes,
      noteTypes: first.noteTypes ?? [],
      cards: first.cards,
      media,
    }
    const second = await planApkgImport(read('v2.apkg'), options, existing, now, newId)
    expect(second.report.errors).toEqual([])
    expect(second.report.notesCreated).toBe(0)
    expect(second.report.noteTypesCreated).toEqual([])
    expect(second.report.decksCreated).toEqual([])
    expect(second.report.mediaImported).toBe(0)
    expect(second.report.cardsCreated).toBe(0)
    const updated = second.updates.find((n) => n.modelType === 'custom')
    expect(updated?.fields[3]).toBe('Cergy')
    expect(updated?.id).toBe(first.notes.find((n) => n.modelType === 'custom')?.id)
  })
})

describe('deck-builder plugin: what the library refuses', () => {
  it('stops before writing what Recto would not import as intended', () => {
    const r = build(
      'refus',
      `
def refused(f):
    try:
        f()
    except DeckError as e:
        print("refusé :", str(e).splitlines()[0][:60])
        return
    print("ACCEPTÉ")

pkg = Package()
refused(lambda: pkg.note_type("Paire", ["A", "B"], [("A → B", "{{A}}", "{{B}}")]))
refused(lambda: pkg.note_type("Inconnu", ["A", "B", "C", "D"], [("A", "{{A}} {{Z}}", "{{B}}")]))
refused(lambda: pkg.note_type("Trous", ["A", "B", "C", "D"], [("A", "{{cloze:A}}", "{{B}}")]))
refused(lambda: pkg.note_type("Faces", ["A", "B", "C", "D"], [two_way("A ↔ B", "{{A}}", "{{FrontSide}}{{B}}")]))
refused(lambda: pkg.add_media(b"RIFF", name="son.wav"))
refused(lambda: pkg.add_cloze("P", "pas de trou"))
refused(lambda: pkg.add_occlusion("P", "absente.png", [Mask(1, 0.1, 0.1, 0.2, 0.2)]))
pkg.add_media(b"<svg width='10' height='10'/>", name="a.svg")
refused(lambda: pkg.add_occlusion("P", "a.svg", [Mask(1, 0.5, 0.5, 0.001, 0.2)]))
pkg.add_basic("P", "recto", "verso")
refused(lambda: pkg.add_basic("P", "recto", "autre verso"))
refused(lambda: pkg.add_basic("P", "<img src='manque.png' alt='x'>", "v") or pkg.build())
`,
    )
    expect(r.status).toBe(0)
    expect(r.out).not.toContain('ACCEPTÉ')
    expect(r.out.match(/refusé :/g)).toHaveLength(10)
  })

  it('check: refuses the zstd format and accepts a package exported by Anki', () => {
    const check = join(library, 'recto_apkg.py')
    const zstd = run([check, 'check', 'data/samples/unsupported-anki21b.apkg'])
    expect(zstd.status).toBe(1)
    expect(zstd.out).toContain('collection.anki21b')
    const anki = run([check, 'check', 'data/samples/image-occlusion.apkg'])
    expect(anki.status).toBe(0)
    expect(anki.out).toContain("occlusion d'image")
  })
})
