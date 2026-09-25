import { beforeAll, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { SqlJsStatic } from 'sql.js'
import { makeDeck } from '$lib/domain/defaults'
import type { Note } from '$lib/domain/types'
import {
  Anki21bUnsupported,
  ApkgError,
  convertModel,
  describePackage,
  planApkgImport,
  readApkg,
  type ApkgExisting,
  type ApkgImportOptions,
  type ApkgPackage,
} from '$lib/import/apkg'
import { sha256Hex } from '$lib/media/hash'
import { sampleBytes } from '../../helpers/samples'

let SQL: SqlJsStatic
beforeAll(async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  SQL = await initSqlJs()
})

const now = Date.UTC(2026, 8, 25, 8)
const CRT = 1699934400
let seq = 0
const newId = () => `id-${++seq}`
const empty: ApkgExisting = { decks: [], notes: [], media: new Map() }
const options: ApkgImportOptions = {
  target: { mode: 'anki' },
  importHistory: false,
  scheduler: 'fsrs',
  dayStartHour: 4,
}

function sample(): ApkgPackage {
  return readApkg(sampleBytes('sample-legacy.apkg'), SQL)
}

describe('readApkg', () => {
  it('reads the legacy fixture', () => {
    const progress: number[] = []
    const pkg = readApkg(sampleBytes('sample-legacy.apkg'), SQL, (r) => progress.push(r))
    expect(pkg.format).toBe('anki21')
    expect(pkg.crt).toBe(CRT)
    expect(pkg.models.map((m) => [m.name, m.type, m.fields])).toEqual([
      ['Basic', 0, ['Front', 'Back']],
      ['Cloze', 1, ['Text', 'Back Extra']],
    ])
    expect(pkg.decks.map((d) => d.name).sort()).toEqual([
      'Default',
      'Géographie',
      'Géographie::Départements',
    ])
    expect(pkg.notes).toHaveLength(4)
    expect(pkg.cards).toHaveLength(5)
    expect(pkg.revlog.map((r) => [r.ease, r.type])).toEqual([
      [3, 0],
      [3, 1],
      [3, 1],
    ])
    expect(pkg.notes[0]).toMatchObject({
      guid: 'aB3dE5fG7h',
      tags: ['geographie', 'capitales'],
      fields: ['Capitale de la France', 'Paris'],
    })
    expect(pkg.media.map((m) => [m.name, m.data.byteLength])).toEqual([['lune.png', 410]])
    expect(pkg.missingMedia).toEqual([])
    expect(progress.at(-1)).toBe(1)
    expect(describePackage(pkg)).toMatchObject({
      decks: [
        { name: 'Géographie', cards: 4 },
        { name: 'Géographie::Départements', cards: 1 },
      ],
      notes: 4,
      cards: 5,
      media: 1,
      reviews: 3,
    })
  })

  it('refuses the anki21b format with a typed error', () => {
    expect(() => readApkg(sampleBytes('unsupported-anki21b.apkg'), SQL)).toThrow(Anki21bUnsupported)
  })

  it('reports corrupt zips, missing collections and broken databases', () => {
    const code = (bytes: Uint8Array) => {
      try {
        readApkg(bytes, SQL)
      } catch (e) {
        return e instanceof ApkgError ? e.code : 'other'
      }
      return 'none'
    }
    expect(code(strToU8('not a zip'))).toBe('notZip')
    expect(code(zipSync({ media: strToU8('{}') }))).toBe('noCollection')
    expect(code(zipSync({ 'collection.anki2': strToU8('garbage, not sqlite') }))).toBe('corrupt')
  })

  it('accepts a legacy anki2 base without revlog table nor media file', () => {
    const db = new SQL.Database()
    db.run(`CREATE TABLE col (crt INTEGER, models TEXT, decks TEXT);
      CREATE TABLE notes (id INTEGER, guid TEXT, mid INTEGER, mod INTEGER, tags TEXT, flds TEXT);
      CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER);`)
    db.run(
      `INSERT INTO col VALUES (1600000000, '{"5":{"name":"Rev","type":0,"flds":[{"name":"A","ord":0},{"name":"B","ord":1},{"name":"C","ord":2},{"name":"D","ord":3}],"tmpls":[{"name":"1","ord":0,"qfmt":"{{A}}"},{"name":"2","ord":1,"qfmt":"{{B}}"}]}}', '{"9":{"name":"A::B::C"}}')`,
    )
    db.run(
      `INSERT INTO notes VALUES (1600000000001, 'g1', 5, 1600000000, '', 'a' || char(31) || 'b' || char(31) || 'c' || char(31) || 'd')`,
    )
    db.run(`INSERT INTO cards VALUES (11, 1600000000001, 9, 0, 1, 1, 0, 0, 0, 1, 0)`)
    const bytes = zipSync({ 'collection.anki2': db.export(), media: strToU8('binary protobuf') })
    db.close()
    const pkg = readApkg(bytes, SQL)
    expect(pkg).toMatchObject({ format: 'anki2', revlog: [], media: [] })
    expect(pkg.notes[0]?.fields).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('convertModel', () => {
  it('maps cloze, basic, reverse and reports merged fields', () => {
    const [basic, cloze] = sample().models
    if (!basic || !cloze) throw new Error('fixture')
    expect(convertModel(basic)).toMatchObject({
      modelType: 'basic',
      converted: false,
      mergedFields: 0,
    })
    expect(convertModel(basic).map(['a', 'b'])).toEqual(['a', 'b', ''])
    expect(convertModel(cloze).map(['t', 'x', 'y'])).toEqual(['t', 'x<br>y'])
    const rev = {
      ...basic,
      fields: ['Front', 'Back', 'Note', 'Source'],
      templates: [
        { name: '1', qfmt: '{{Front}}' },
        { name: '2', qfmt: '{{Back}}' },
      ],
    }
    expect(convertModel(rev)).toMatchObject({
      modelType: 'basic_reverse',
      converted: true,
      mergedFields: 1,
    })
    expect(convertModel(rev).map(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c<br>d'])
    const odd = {
      ...basic,
      templates: [
        { name: '1', qfmt: '{{Front}}' },
        { name: '2', qfmt: '{{Front}} ?' },
      ],
    }
    expect(convertModel(odd)).toMatchObject({ modelType: 'basic', converted: true })
  })
})

describe('planApkgImport', () => {
  it('converts decks, notes, card states, suspension and media (no history)', async () => {
    const plan = await planApkgImport(sample(), options, empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.decks.map((d) => d.name)).toEqual(['Géographie', 'Départements'])
    expect(plan.decks[1]?.parentId).toBe(plan.decks[0]?.id)
    expect(plan.notes).toHaveLength(4)
    expect(plan.cards).toHaveLength(5)
    expect(plan.reviews).toEqual([])
    const byGuid = new Map(plan.notes.map((n) => [n.sourceGuid, n]))
    const review = plan.cards.find((c) => c.noteId === byGuid.get('aB3dE5fG7h')?.id)
    expect(review).toMatchObject({
      state: 2,
      due: (CRT + 5 * 86_400) * 1000,
      scheduledDays: 10,
      stability: 10,
      difficulty: 6,
      reps: 3,
      suspended: false,
    })
    const suspended = plan.cards.find((c) => c.noteId === byGuid.get('yZ1aB3cD5e')?.id)
    expect(suspended).toMatchObject({ state: 0, suspended: true })
    const cloze = byGuid.get('rS5tU7vW9x')
    expect(cloze).toMatchObject({
      modelType: 'cloze',
      fields: [
        'La {{c1::Lune}} tourne autour de la {{c2::Terre}}.<br><img src="lune.png">',
        'Satellite naturel',
      ],
    })
    expect(plan.cards.filter((c) => c.noteId === cloze?.id).map((c) => c.ord)).toEqual([0, 1])
    expect(byGuid.get('kL9mN1oP3q')?.deckId).toBe(plan.decks[1]?.id)
    expect(plan.media.map((m) => [m.name, m.mime, m.blob.size])).toEqual([
      ['lune.png', 'image/png', 410],
    ])
    expect(plan.report).toMatchObject({
      notesCreated: 4,
      cardsCreated: 5,
      mediaImported: 1,
      missingMedia: [],
      convertedModels: [],
    })
    // Invariant 1.
    const deckOf = new Map(plan.notes.map((n) => [n.id, n.deckId]))
    for (const c of plan.cards) expect(c.deckId).toBe(deckOf.get(c.noteId))
  })

  it('replays the review log with FSRS (05 §2.3)', async () => {
    const plan = await planApkgImport(
      sample(),
      { ...options, importHistory: true },
      empty,
      now,
      newId,
    )
    expect(plan.reviews).toHaveLength(3)
    expect(plan.reviews.map((r) => [r.rating, r.stateBefore, r.scheduler])).toEqual([
      [3, 0, 'fsrs'],
      [3, 1, 'fsrs'],
      [3, 2, 'fsrs'],
    ])
    expect(plan.reviews.map((r) => r.durationMs)).toEqual([8000, 6500, 5200])
    const card = plan.cards.find((c) => c.id === plan.reviews[0]?.cardId)
    expect(card).toMatchObject({ state: 2, reps: 3, lastReview: 1700370000000 })
    expect(card?.stability).toBeGreaterThan(1)
    expect(plan.report.reviewsImported).toBe(3)
  })

  it('replays with the Leitner scheduler for Memory Box decks', async () => {
    const plan = await planApkgImport(
      sample(),
      { ...options, importHistory: true, scheduler: 'leitner' },
      empty,
      now,
      newId,
    )
    const card = plan.cards.find((c) => c.id === plan.reviews[0]?.cardId)
    expect(card).toMatchObject({ box: 4, state: 2 })
    expect(plan.reviews.every((r) => r.scheduler === 'leitner')).toBe(true)
    const noHistory = await planApkgImport(
      sample(),
      { ...options, scheduler: 'leitner' },
      empty,
      now,
      newId,
    )
    expect(noHistory.cards.find((c) => c.state === 2)?.box).toBe(3)
  })

  it('imports everything into a single new or existing deck', async () => {
    const one = await planApkgImport(
      sample(),
      { ...options, target: { mode: 'single', newDeckName: 'Anki' } },
      empty,
      now,
      newId,
    )
    expect(one.decks.map((d) => d.name)).toEqual(['Anki'])
    expect(new Set(one.notes.map((n) => n.deckId)).size).toBe(1)
    const deck = makeDeck({ name: 'Existant' }, 'ex', now)
    const two = await planApkgImport(
      sample(),
      { ...options, target: { mode: 'single', deckId: 'ex' } },
      { ...empty, decks: [deck] },
      now,
      newId,
    )
    expect(two.decks).toEqual([])
    expect(two.notes.every((n) => n.deckId === 'ex')).toBe(true)
    const missing = await planApkgImport(
      sample(),
      { ...options, target: { mode: 'single', deckId: 'nope' } },
      empty,
      now,
      newId,
    )
    expect(missing.report.errors.map((e) => e.code)).toEqual([
      'orphanCard',
      'orphanCard',
      'orphanCard',
      'orphanCard',
    ])
  })

  it('deduplicates by Anki guid on re-import', async () => {
    const old: Note = {
      id: 'n1',
      deckId: 'd',
      modelType: 'basic',
      fields: ['old', '', ''],
      tags: [],
      sourceGuid: 'aB3dE5fG7h',
      createdAt: 0,
      updatedAt: 0,
    }
    const recent: Note = { ...old, id: 'n2', sourceGuid: 'kL9mN1oP3q', updatedAt: now }
    const plan = await planApkgImport(
      sample(),
      options,
      { ...empty, notes: [old, recent] },
      now,
      newId,
    )
    expect(plan.updates).toEqual([
      {
        ...old,
        fields: ['Capitale de la France', 'Paris', ''],
        tags: ['geographie', 'capitales'],
        updatedAt: 1758758400000,
      },
    ])
    expect(plan.notes).toHaveLength(2)
    expect(plan.report).toMatchObject({ notesUpdated: 1, skipped: 1 })
    // Same guid, other note type: the fields would not mean the same thing, nothing is written.
    const other = await planApkgImport(
      sample(),
      options,
      { ...empty, notes: [{ ...old, modelType: 'cloze', fields: ['{{c1::old}}', ''] }] },
      now,
      newId,
    )
    expect(other.updates).toEqual([])
    expect(other.report.skipped).toBe(1)
  })

  it('matches a Recto note whose id is the Anki guid (package exported by Recto)', async () => {
    const pkg = sample()
    const [first, second] = pkg.notes
    if (!first || !second) throw new Error('fixture')
    const own: Note = {
      id: first.guid,
      deckId: 'd',
      modelType: 'basic',
      fields: ['old', '', ''],
      tags: [],
      createdAt: 0,
      updatedAt: now,
    }
    // A note imported from Anki is only known by its sourceGuid, not by its id.
    const imported: Note = { ...own, id: second.guid, sourceGuid: 'elsewhere' }
    const plan = await planApkgImport(
      pkg,
      options,
      { ...empty, notes: [own, imported] },
      now,
      newId,
    )
    expect(plan.updates).toEqual([])
    expect(plan.notes.map((n) => n.sourceGuid)).not.toContain(first.guid)
    expect(plan.notes.map((n) => n.sourceGuid)).toContain(second.guid)
    expect(plan.report).toMatchObject({ notesCreated: 3, skipped: 1 })
  })

  it('renames media whose name is taken by another file and rewrites references', async () => {
    const pkg = sample()
    const sha = await sha256Hex(pkg.media[0]?.data ?? new Uint8Array())
    const same = await planApkgImport(
      pkg,
      options,
      { ...empty, media: new Map([['lune.png', sha]]) },
      now,
      newId,
    )
    expect(same.media).toEqual([])
    const other = await planApkgImport(
      pkg,
      options,
      {
        ...empty,
        media: new Map([
          ['lune.png', 'different'],
          ['lune-2.png', 'x'],
        ]),
      },
      now,
      newId,
    )
    expect(other.media.map((m) => m.name)).toEqual(['lune-3.png'])
    expect(other.notes.find((n) => n.modelType === 'cloze')?.fields[0]).toContain(
      '<img src="lune-3.png">',
    )
    expect(other.report.missingMedia).toEqual([])
  })

  it('reports unknown models, missing media files and unsupported media types', async () => {
    const pkg = sample()
    const broken: ApkgPackage = {
      ...pkg,
      notes: [...pkg.notes, { id: 5, guid: 'zz', mid: 'unknown', mod: 1, tags: [], fields: ['x'] }],
      media: [{ name: 'notes.pdf', data: new Uint8Array([1]) }],
      missingMedia: ['son.mp3'],
    }
    const plan = await planApkgImport(broken, options, empty, now, newId)
    expect(plan.report.errors).toEqual([{ line: 5, code: 'unknownModel' }])
    expect(plan.report.missingMedia).toEqual(['lune.png', 'son.mp3'])
    expect(plan.media).toEqual([])
    expect(plan.report.skipped).toBe(1)
  })
})
