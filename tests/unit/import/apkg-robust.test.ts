import { beforeAll, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { SqlJsStatic } from 'sql.js'
import { planApkgImport, readApkg } from '$lib/import/apkg'

let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await (await import('sql.js/dist/sql-wasm.js')).default()
})

const now = Date.UTC(2026, 8, 25)
let seq = 0
const newId = () => `r-${++seq}`

function build(
  sql: (db: InstanceType<SqlJsStatic['Database']>) => void,
  media: Record<string, Uint8Array> = {},
) {
  const db = new SQL.Database()
  db.run(`CREATE TABLE col (crt INTEGER, models TEXT, decks TEXT);
    CREATE TABLE notes (id INTEGER, guid TEXT, mid INTEGER, mod INTEGER, tags TEXT, flds TEXT);
    CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER);
    CREATE TABLE revlog (id INTEGER, cid INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER);`)
  sql(db)
  const bytes = zipSync({ 'collection.anki21': db.export(), ...media })
  db.close()
  return bytes
}

describe('robustness of the Anki reader and converter', () => {
  it('tolerates odd model/deck JSON and null values', () => {
    const models = {
      7: { type: 'x', flds: 'nope', tmpls: [null, { ord: 1 }] },
      8: {
        name: 'Reverse',
        type: 0,
        flds: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        tmpls: [
          { name: '1', ord: 0, qfmt: '{{Front}}' },
          { name: '2', ord: 1, qfmt: '{{Back}}' },
        ],
      },
      9: 3,
    }
    const decks = { 1: { name: 'Default' }, 2: 'bad', 3: { nom: 'x' }, 4: { name: 'Vocabulaire' } }
    const bytes = build((db) => {
      db.run('INSERT INTO col VALUES (?, ?, ?)', [
        1600000000,
        JSON.stringify(models),
        JSON.stringify(decks),
      ])
      db.run(`INSERT INTO notes VALUES (1, 'g1', 7, 1, NULL, NULL)`)
      db.run(`INSERT INTO notes VALUES (2, 'g2', 8, 1, 'a  b', 'chien' || char(31) || 'dog')`)
      db.run(`INSERT INTO notes VALUES (3, 'g3', 8, 1, '', 'chat' || char(31) || 'cat')`)
      // Note 2: learning card (type 1) with history of every grade, ord 1 missing; note 3: relearning card, extra ord 5.
      db.run(`INSERT INTO cards VALUES (21, 2, 4, 0, 1, 1, 1600000000, -600, 2500, 4, 1)`)
      db.run(`INSERT INTO cards VALUES (31, 3, 4, 0, 3, 1, 1600000000, 3, 2000, 5, 2)`)
      db.run(`INSERT INTO cards VALUES (35, 3, 4, 5, 0, 0, 1, 0, 0, 0, 0)`)
      for (const [id, ease, type] of [
        [1, 1, 0],
        [2, 2, 0],
        [3, 3, 0],
        [4, 4, 1],
        [5, 3, 3],
        [6, 3, 4],
        [7, 0, 1],
      ]) {
        db.run('INSERT INTO revlog VALUES (?, 21, ?, 1, 0, 2500, 90000, ?)', [
          1600000000000 + (id ?? 0) * 3_600_000,
          ease ?? 0,
          type ?? 0,
        ])
      }
    })
    const pkg = readApkg(bytes, SQL)
    expect(pkg.models.find((m) => m.id === '7')).toMatchObject({
      name: '7',
      type: 0,
      fields: [],
      templates: [{ name: '', qfmt: '' }],
    })
    expect(pkg.decks.map((d) => d.name).sort()).toEqual(['Default', 'Vocabulaire'])
    expect(pkg.notes[0]).toMatchObject({ tags: [], fields: [''] })
  })

  it('converts learning cards, replays every grade and creates missing sibling cards', async () => {
    const models = {
      8: {
        name: 'Reverse',
        type: 0,
        flds: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        tmpls: [
          { name: '1', ord: 0, qfmt: '{{Front}}' },
          { name: '2', ord: 1, qfmt: '{{Back}}' },
        ],
      },
      9: { name: 'Cloze', type: 1, flds: [{ name: 'Text', ord: 0 }], tmpls: [] },
    }
    const bytes = build(
      (db) => {
        db.run('INSERT INTO col VALUES (?, ?, ?)', [
          1600000000,
          JSON.stringify(models),
          JSON.stringify({ 4: { name: 'Vocabulaire' } }),
        ])
        db.run(`INSERT INTO notes VALUES (2, 'g2', 8, 1, '', 'chien' || char(31) || 'dog')`)
        db.run(`INSERT INTO notes VALUES (3, 'g3', 8, 1, '', 'chat' || char(31) || 'cat')`)
        db.run(`INSERT INTO notes VALUES (4, 'g4', 9, 1, '', 'pas de trou')`)
        db.run(`INSERT INTO notes VALUES (5, 'g5', 8, 1, '', 'sans' || char(31) || 'cartes')`)
        db.run(`INSERT INTO cards VALUES (21, 2, 4, 0, 1, 1, 1600000000, -600, 2500, 4, 1)`)
        db.run(`INSERT INTO cards VALUES (31, 3, 4, 0, 3, -1, 1600000000, 3, 2000, 5, 2)`)
        db.run(`INSERT INTO cards VALUES (35, 3, 4, 5, 0, 0, 1, 0, 0, 0, 0)`)
        db.run(`INSERT INTO cards VALUES (41, 4, 4, 0, 0, 0, 1, 0, 0, 0, 0)`)
        for (const [id, ease, type] of [
          [1, 1, 0],
          [2, 2, 0],
          [3, 3, 0],
          [4, 4, 1],
          [5, 3, 3],
          [6, 3, 4],
          [7, 0, 1],
        ]) {
          db.run('INSERT INTO revlog VALUES (?, 21, ?, 1, 0, 2500, 90000, ?)', [
            1600000000000 + (id ?? 0) * 3_600_000,
            ease ?? 0,
            type ?? 0,
          ])
        }
      },
      { media: strToU8('{"0": "son.mp3", "1": "absent.png"}'), 0: new Uint8Array([1, 2, 3]) },
    )
    const pkg = readApkg(bytes, SQL)
    expect(pkg.missingMedia).toEqual(['absent.png'])
    for (const scheduler of ['fsrs', 'leitner'] as const) {
      const noHistory = await planApkgImport(
        pkg,
        { target: { mode: 'anki' }, importHistory: false, scheduler, dayStartHour: 4 },
        { decks: [], notes: [], media: new Map() },
        now,
        newId,
      )
      const learning = noHistory.cards.filter((c) => c.state === 1)
      expect(learning).toHaveLength(2)
      expect(learning.every((c) => c.due === now)).toBe(true)
      expect(learning.every((c) => c.box === (scheduler === 'leitner' ? 1 : 0))).toBe(true)
      expect(noHistory.cards.find((c) => c.suspended)?.state).toBe(1)
      // Reverse notes get both cards; the Anki card of ord 5 is dropped; the note without cards gets new ones.
      expect(noHistory.cards).toHaveLength(6)
      expect(noHistory.report.skipped).toBe(1)
      expect(noHistory.report.errors).toEqual([{ line: 4, code: 'noCloze' }])
      expect(noHistory.media.map((m) => m.name)).toEqual(['son.mp3'])

      const replay = await planApkgImport(
        pkg,
        { target: { mode: 'anki' }, importHistory: true, scheduler, dayStartHour: 4 },
        { decks: [], notes: [], media: new Map() },
        now,
        newId,
      )
      // Filtered (3), manual (4) and invalid (ease 0) entries are ignored.
      expect(replay.reviews.map((r) => r.rating)).toEqual([1, 2, 3, 4])
      expect(replay.reviews.every((r) => r.durationMs === 60_000)).toBe(true)
    }
  })
})
