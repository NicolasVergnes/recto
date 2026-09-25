import { beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import { cardOrds } from '$lib/domain/notes'
import type { Card, Note, Review } from '$lib/domain/types'
import {
  ANKI_MODEL_IDS,
  buildApkg,
  easeFromDifficulty,
  fieldChecksum,
  idAllocator,
  sortField,
  type ApkgExportInput,
} from '$lib/export/apkg'
import {
  convertModel,
  planApkgImport,
  readApkg,
  type ApkgExisting,
  type ApkgImportOptions,
} from '$lib/import/apkg'
import { dayKey, daysBetween, startOfDate } from '$lib/scheduler/day'
import { MP3, PNG, representativeCollection } from '../helpers/apkg-collection'

let SQL: SqlJsStatic
beforeAll(async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  SQL = await initSqlJs()
})

const now = Date.UTC(2026, 8, 25, 10)
const options = { now, dayStartHour: 4 }
let seq = 0
const newId = () => `new-${++seq}`
const empty: ApkgExisting = { decks: [], notes: [], media: new Map() }
const importOptions: ApkgImportOptions = {
  target: { mode: 'anki' },
  importHistory: false,
  scheduler: 'fsrs',
  dayStartHour: 4,
}

type Row = Record<string, SqlValue>

function rows(db: Database, sql: string): Row[] {
  const [result] = db.exec(sql)
  if (!result) return []
  return result.values.map((v) =>
    Object.fromEntries(result.columns.map((c, i) => [c, v[i] ?? null])),
  )
}

async function open(input: ApkgExportInput) {
  const { bytes, report } = await buildApkg(SQL, input, options)
  const entries = unzipSync(bytes)
  const collection = entries['collection.anki21']
  if (!collection) throw new Error('no collection')
  return { bytes, report, entries, db: new SQL.Database(collection) }
}

const json = (v: SqlValue | undefined): unknown => JSON.parse(String(v))

/** A note of `deck` with its cards (ords from its fields), created at `createdAt`. */
function noteWithCards(
  id: string,
  deckId: string,
  modelType: Note['modelType'],
  fields: string[],
  createdAt: number,
): { note: Note; cards: Card[] } {
  const note: Note = { id, deckId, modelType, fields, tags: [], createdAt, updatedAt: createdAt }
  const cards = cardOrds(modelType, fields).map((ord) =>
    makeCard(note, ord, `${id}-${ord}`, createdAt),
  )
  return { note, cards }
}

/** Runs SQL statements on the collection inside a package and zips it again. */
function editPackage(bytes: Uint8Array, statements: string[]): Uint8Array {
  const { 'collection.anki21': collection, ...rest } = unzipSync(bytes)
  const db = new SQL.Database(collection)
  for (const sql of statements) db.run(sql)
  const edited = db.export()
  db.close()
  return zipSync({ ...rest, 'collection.anki21': edited })
}

describe('buildApkg: legacy schema 11 package', () => {
  it('writes collection.anki21 with scheduler v2, the full schema and the media map', async () => {
    const { entries, db, report } = await open(representativeCollection(now))
    expect(Object.keys(entries).sort()).toEqual(['0', '1', 'collection.anki21', 'media'])
    expect(json(strFromU8(entries.media ?? new Uint8Array()))).toEqual({
      0: 'lune.png',
      1: 'bip.mp3',
    })
    expect(entries['0']).toEqual(PNG)
    expect(entries['1']).toEqual(MP3)
    const [col] = rows(db, 'SELECT * FROM col')
    expect(col).toMatchObject({ id: 1, ver: 11, usn: 0, mod: now, tags: '{}' })
    expect(json(col?.conf)).toMatchObject({ schedVer: 2, rollover: 4, curDeck: 1, nextPos: 3 })
    const tables = rows(db, "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
    expect(tables.filter((t) => t.type === 'table').map((t) => t.name)).toEqual([
      'col',
      'notes',
      'cards',
      'revlog',
      'graves',
    ])
    expect(tables.filter((t) => t.type === 'index').map((t) => t.name)).toEqual([
      'ix_notes_usn',
      'ix_cards_usn',
      'ix_revlog_usn',
      'ix_cards_nid',
      'ix_cards_sched',
      'ix_revlog_cid',
      'ix_notes_csum',
    ])
    const columns = (table: string) => rows(db, `PRAGMA table_info(${table})`).map((c) => c.name)
    expect(columns('cards')).toEqual(
      'id nid did ord mod usn type queue due ivl factor reps lapses left odue odid flags data'.split(
        ' ',
      ),
    )
    expect(columns('revlog')).toEqual('id cid usn ease ivl lastIvl factor time type'.split(' '))
    expect(report).toEqual({
      decks: 3,
      notes: 6,
      cards: 8,
      reviews: 15,
      media: 2,
      missingMedia: ['absent.png'],
      retired: 1,
    })
    db.close()
  })

  it('writes note types, decks and notes as Anki expects them', async () => {
    const { db } = await open(representativeCollection(now))
    const [col] = rows(db, 'SELECT models, decks FROM col')
    const models = Object.values(json(col?.models) as Record<string, { name: string }>)
    expect(models.map((m) => m.name)).toEqual([
      'Recto · Basique',
      'Recto · Basique et inversée',
      'Recto · Texte à trous',
      'Recto · Occlusion d’image',
    ])
    const decks = Object.values(json(col?.decks) as Record<string, { id: number; name: string }>)
    expect(decks.map((d) => d.name).sort()).toEqual([
      'Boîte',
      'Default',
      'Géo',
      'Géo::Départements',
    ])
    expect(decks.find((d) => d.name === 'Géo')).toMatchObject({
      desc: 'Cartes &lt;de&gt; géographie',
    })
    expect(decks.find((d) => d.name === 'Default')?.id).toBe(1)

    const notes = rows(db, 'SELECT *, typeof(id) AS tid, typeof(sfld) AS tsfld FROM notes')
    expect(notes).toHaveLength(6)
    expect(notes[0]).toMatchObject({
      guid: 'note-1',
      mid: ANKI_MODEL_IDS.basic,
      tags: ' geo tag-é ',
      flds: 'Capitale <b>France</b>\u001fParis\u001f',
      sfld: 'Capitale France',
      // The value Anki itself stores for this sort field.
      csum: 1447318239,
      tid: 'integer',
    })
    expect(notes[1]).toMatchObject({
      guid: 'aB3dE5fG7h',
      mid: ANKI_MODEL_IDS.basic_reverse,
      sfld: 75,
      tsfld: 'integer',
      tags: ' dep ',
    })
    expect(notes[2]).toMatchObject({ mid: ANKI_MODEL_IDS.cloze, tags: '' })
    expect(String(notes[2]?.flds).split('\u001f')).toHaveLength(2)
    db.close()
  })

  it('maps card states, suspension, retirement, flags and FSRS memory', async () => {
    const input = representativeCollection(now)
    const { db } = await open(input)
    const cards = rows(db, 'SELECT * FROM cards ORDER BY nid, ord')
    const [capital, forward, backward, moon, earth, fresh, dog, cat] = cards
    const [col] = rows(db, 'SELECT crt FROM col')
    const crt = Number(col?.crt) * 1000
    const original = (noteId: string, ord = 0) =>
      input.cards.find((c) => c.noteId === noteId && c.ord === ord)

    const reviewed = original('note-1')
    expect(capital).toMatchObject({ type: 2, queue: 2, left: 0, reps: 4, lapses: 0 })
    expect(capital?.due).toBe(daysBetween(crt, reviewed?.due ?? 0, 4))
    expect(capital?.ivl).toBe(reviewed?.scheduledDays)
    expect(capital?.factor).toBe(easeFromDifficulty(reviewed?.difficulty ?? 0))
    expect(json(capital?.data)).toEqual({
      s: reviewed?.stability,
      d: reviewed?.difficulty,
      dr: 0.9,
      lrt: Math.floor((reviewed?.lastReview ?? 0) / 1000),
    })
    expect(forward).toMatchObject({ type: 1, queue: 1, ivl: 0, left: 1 })
    expect(forward?.due).toBe(Math.floor((original('note-2')?.due ?? 0) / 1000))
    expect(backward).toMatchObject({ type: 3, queue: 1, flags: 2, lapses: 1, left: 1 })
    expect(Number(backward?.ivl)).toBeGreaterThanOrEqual(1)
    // Overdue and suspended: `crt` is early enough for every review due to be ≥ 0.
    expect(moon).toMatchObject({ type: 2, queue: -1, due: 0 })
    expect(earth).toMatchObject({ type: 0, queue: 0, due: 1, ivl: 0, factor: 0, data: '' })
    expect(fresh).toMatchObject({ type: 0, queue: 0, due: 2 })
    // Leitner: no FSRS memory state (only the last review time), neutral ease; retired → suspended.
    expect(dog).toMatchObject({ type: 2, queue: -1, factor: 2500, ivl: 90 })
    expect(json(dog?.data)).toEqual({
      lrt: Math.floor((original('note-5')?.lastReview ?? 0) / 1000),
    })
    expect(cat).toMatchObject({ type: 3, queue: 1, ivl: 1, left: 1, factor: 2500 })
    expect(Object.keys(json(cat?.data) as object)).toEqual(['lrt'])
    expect(cards.every((c) => c.usn === -1 && c.odue === 0 && c.odid === 0)).toBe(true)
    db.close()
  })

  it('writes the review log with learning intervals in seconds and previous intervals', async () => {
    const input = representativeCollection(now)
    const { db } = await open(input)
    const revlog = rows(db, 'SELECT r.*, c.nid, c.ord FROM revlog r JOIN cards c ON c.id = r.cid')
    expect(revlog).toHaveLength(input.reviews.length)
    // Revlog ids are review times (ms), bumped when several cards were answered at once.
    const times = input.reviews.map((r) => r.reviewedAt).sort((a, b) => a - b)
    const ids = revlog.map((r) => Number(r.id)).sort((a, b) => a - b)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.map((id, i) => id - (times[i] ?? 0))).toEqual([
      0, 1, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ])
    const capital = revlog.filter((r) => r.nid === revlog[0]?.nid)
    expect(capital.map((r) => [r.ease, r.type])).toEqual([
      [3, 0],
      [3, 0],
      [3, 1],
      [3, 1],
    ])
    expect(capital[0]).toMatchObject({ ivl: -600, lastIvl: 0, time: 4000, factor: 2500 })
    expect(capital[1]?.lastIvl).toBe(-600)
    expect(Number(capital[1]?.ivl)).toBeGreaterThanOrEqual(1)
    expect(capital[2]?.lastIvl).toBe(capital[1]?.ivl)
    const lapse = revlog.filter((r) => r.ease === 1 && r.factor !== 2500)
    expect(lapse).toHaveLength(1)
    expect(lapse[0]).toMatchObject({ type: 1, ivl: -600 })
    db.close()
  })

  it('allocates unique ids when timestamps collide and skips what is not exported', async () => {
    const deck = makeDeck({ name: 'Default' }, 'd', now)
    const other = makeDeck({ name: 'Autre' }, 'e', now)
    const note = (id: string, front: string): Note => ({
      id,
      deckId: deck.id,
      modelType: 'basic',
      fields: [front, 'R'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    const notes = [1, 2, 3].map((i) => note(`n${i}`, `Q${i}\u001f`))
    const cards: Card[] = notes.map((n) => makeCard(n, 0, `c-${n.id}`, now))
    const review = (cardId: string, i: number): Review => ({
      id: `r${cardId}${i}`,
      cardId,
      deckId: deck.id,
      reviewedAt: now,
      rating: 3,
      scheduler: 'fsrs',
      durationMs: 120_000,
      stateBefore: 0,
      dueBefore: now,
      stabilityBefore: 0,
      difficultyBefore: 0,
      boxBefore: 0,
      learningStepsBefore: 0,
      lastReviewBefore: null,
      stateAfter: 1,
      dueAfter: now,
      scheduledDays: 0,
      elapsedDays: 0,
      boxAfter: 0,
    })
    const input: ApkgExportInput = {
      decks: [deck, other],
      notes: [...notes, note('no-cards', 'x')],
      cards: [...cards, makeCard({ id: 'unknown', deckId: deck.id }, 0, 'stray', now)],
      reviews: [...cards.map((c, i) => review(c.id, i)), review('stray', 9)],
      media: [],
    }
    const { db, report, entries } = await open(input)
    const ids = (table: string) => rows(db, `SELECT id FROM ${table} ORDER BY id`).map((r) => r.id)
    expect(ids('notes')).toEqual([now, now + 1, now + 2])
    expect(ids('cards')).toEqual([now, now + 1, now + 2])
    expect(ids('revlog')).toEqual([now, now + 1, now + 2])
    expect(rows(db, 'SELECT DISTINCT time, ivl FROM revlog')).toEqual([{ time: 60_000, ivl: 0 }])
    expect(rows(db, 'SELECT flds FROM notes LIMIT 1')[0]?.flds).toBe('Q1\u001fR\u001f')
    // A deck named "Default" is Anki's default deck.
    const decks = json(rows(db, 'SELECT decks FROM col')[0]?.decks) as Record<string, unknown>
    expect(Object.keys(decks).length).toBe(2)
    expect(decks['1']).toMatchObject({ name: 'Default' })
    expect(rows(db, 'SELECT DISTINCT did FROM cards')).toEqual([{ did: 1 }])
    expect(report).toMatchObject({ notes: 3, cards: 3, reviews: 3, media: 0, missingMedia: [] })
    expect(strFromU8(entries.media ?? new Uint8Array())).toBe('{}')
    db.close()
  })

  it('allocates ids in constant time when thousands of rows share a timestamp', () => {
    const next = idAllocator()
    const start = performance.now()
    // Two rows per millisecond (CSV reverse notes): a probing allocator would walk ~n²/4 ids.
    const ids = Array.from({ length: 200_000 }, (_, i) => next(now + Math.floor(i / 2)))
    expect(performance.now() - start).toBeLessThan(1000)
    expect(ids.slice(0, 3)).toEqual([now, now + 1, now + 2])
    expect(ids.every((id, i) => i === 0 || id > (ids[i - 1] ?? 0))).toBe(true)
    // Later timestamps are kept as they are; ids stay above the floor (decks: 1 is Default).
    expect(next(now + 1_000_000)).toBe(now + 1_000_000)
    const deckIds = idAllocator(1)
    expect([deckIds(0), deckIds(1), deckIds(Number.NaN), deckIds(50)]).toEqual([2, 3, 4, 50])
  })

  it('exports thousands of CSV-imported reverse notes sharing timestamps with unique ids', async () => {
    const deck = makeDeck({ name: 'CSV' }, 'csv', now)
    const notes: Note[] = []
    const cards: Card[] = []
    // The CSV importer: createdAt = now + line, both cards of a note at the same instant.
    for (let i = 0; i < 3000; i++) {
      const made = noteWithCards(`n${i}`, deck.id, 'basic_reverse', [`Q${i}`, `R${i}`, ''], now + i)
      notes.push(made.note)
      cards.push(...made.cards)
    }
    const { db, report } = await open({ decks: [deck], notes, cards, reviews: [], media: [] })
    expect(report).toMatchObject({ notes: 3000, cards: 6000 })
    const ids = (table: string) =>
      rows(db, `SELECT id FROM ${table} ORDER BY id`).map((r) => Number(r.id))
    expect(new Set(ids('notes')).size).toBe(3000)
    expect(ids('notes')[2999]).toBe(now + 2999)
    const byNote = rows(db, 'SELECT n.sfld, c.ord, c.id FROM cards c JOIN notes n ON n.id = c.nid')
    expect(new Set(byNote.map((c) => c.id)).size).toBe(6000)
    // Card ids keep the creation order, then the ord: Anki's "order added".
    const sorted = [...byNote].sort((a, b) => Number(a.id) - Number(b.id))
    expect(sorted.slice(0, 4).map((c) => [c.sfld, c.ord])).toEqual([
      ['Q0', 0],
      ['Q0', 1],
      ['Q1', 0],
      ['Q1', 1],
    ])
    db.close()
  })

  it('dates crt on the study day of the earliest review due, whatever the day start', async () => {
    const input = representativeCollection(now)
    const earliest = Math.min(...input.cards.filter((c) => c.state === 2).map((c) => c.due))
    for (const dayStartHour of [0, 4, 12, 23]) {
      const { bytes } = await buildApkg(SQL, input, { now, dayStartHour })
      const collection = unzipSync(bytes)['collection.anki21']
      const db = new SQL.Database(collection)
      const [col] = rows(db, 'SELECT crt, conf FROM col')
      const crt = Number(col?.crt) * 1000
      // Anki's day 0 is crt's local date: the study date of the earliest due, read with crt's own
      // UTC offset (Europe/Paris, summer time: 120 minutes east), not the offset at import time.
      expect(dayKey(crt, 0)).toBe(dayKey(earliest, dayStartHour))
      expect(dayKey(crt, dayStartHour)).toBe(dayKey(earliest, dayStartHour))
      expect(json(col?.conf)).toMatchObject({ rollover: dayStartHour, creationOffset: -120 })
      const dues = rows(db, 'SELECT due FROM cards WHERE type = 2').map((r) => Number(r.due))
      expect(Math.min(...dues)).toBe(0)
      db.close()
    }
  })

  it('computes the sort field and checksum like Anki', async () => {
    expect(sortField('<img src="a.png"> &amp; <i>b</i>')).toBe(' a.png  & b')
    expect(sortField("<img alt=x src='c d.png'>")).toBe(' c d.png ')
    expect(await fieldChecksum('Capitale France')).toBe(1447318239)
    expect(easeFromDifficulty(1)).toBe(5000)
    expect(easeFromDifficulty(10)).toBe(1300)
    expect(easeFromDifficulty(5.2)).toBe(2900)
  })
})

describe('round trip through the Recto importer', () => {
  it('reads back decks, note types, fields, tags, states and media (no history)', async () => {
    const input = representativeCollection(now)
    const { bytes } = await open(input)
    const pkg = readApkg(bytes, SQL)
    expect(pkg.format).toBe('anki21')
    expect(pkg.models.map((m) => convertModel(m)).map((c) => [c.modelType, c.converted])).toEqual([
      ['basic', false],
      ['basic_reverse', false],
      ['cloze', false],
      ['image_occlusion', false],
    ])
    const plan = await planApkgImport(pkg, importOptions, empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.decks.map((d) => d.name).sort()).toEqual(['Boîte', 'Départements', 'Géo'])
    const byName = new Map(plan.decks.map((d) => [d.name, d]))
    expect(byName.get('Départements')?.parentId).toBe(byName.get('Géo')?.id)
    expect(plan.notes.map((n) => [n.modelType, n.fields, n.tags])).toEqual(
      input.notes.map((n) => [n.modelType, n.fields, n.tags]),
    )
    expect(plan.notes.map((n) => n.sourceGuid)).toEqual([
      'note-1',
      'aB3dE5fG7h',
      'note-3',
      'note-4',
      'note-5',
      'note-6',
    ])
    expect(plan.cards).toHaveLength(input.cards.length)
    const states = (cards: readonly Card[]) =>
      cards.map((c) => [c.ord, c.state === 3 ? 1 : c.state, c.suspended || c.retired, c.reps])
    const noteOf = new Map(plan.notes.map((n, i) => [n.id, input.notes[i]?.id]))
    const sorted = (cards: readonly Card[], note: (c: Card) => string | undefined) =>
      [...cards].sort((a, b) => String(note(a)).localeCompare(String(note(b))) || a.ord - b.ord)
    expect(states(sorted(plan.cards, (c) => noteOf.get(c.noteId)))).toEqual(
      states(sorted(input.cards, (c) => c.noteId)),
    )
    const review = plan.cards.find((c) => noteOf.get(c.noteId) === 'note-1')
    const originalDue = input.cards.find((c) => c.noteId === 'note-1')?.due ?? 0
    expect(review?.state).toBe(2)
    expect(daysBetween(originalDue, review?.due ?? 0, 4)).toBe(0)
    expect(plan.media.map((m) => m.name)).toEqual(['lune.png', 'bip.mp3'])
    const image = plan.media[0]?.blob ?? new Blob()
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG)
    expect(plan.report.missingMedia).toEqual(['absent.png'])
  })

  it('replays the exported history (FSRS and Leitner)', async () => {
    const input = representativeCollection(now)
    const { bytes } = await open(input)
    const pkg = readApkg(bytes, SQL)
    const fsrs = await planApkgImport(
      pkg,
      { ...importOptions, importHistory: true },
      empty,
      now,
      newId,
    )
    expect(fsrs.reviews).toHaveLength(input.reviews.length)
    const ratings = (reviews: readonly Review[]) => reviews.map((r) => r.rating).sort()
    expect(ratings(fsrs.reviews)).toEqual(ratings(input.reviews))
    /** The imported card of the note whose front is `front` (first card). */
    const cardOf = (plan: typeof fsrs, front: string) => {
      const note = plan.notes.find((n) => n.fields[0] === front)
      return plan.cards.find((c) => c.noteId === note?.id && c.ord === 0)
    }
    const original = (noteId: string) => input.cards.find((c) => c.noteId === noteId)
    const capital = cardOf(fsrs, 'Capitale <b>France</b>')
    expect(capital).toMatchObject({ state: 2, reps: 4, lapses: 0 })
    expect(capital?.stability).toBeCloseTo(original('note-1')?.stability ?? 0, 6)
    expect(capital?.difficulty).toBeCloseTo(original('note-1')?.difficulty ?? 0, 6)
    expect(fsrs.cards.filter((c) => c.suspended)).toHaveLength(2)

    // Memory Box decks: replaying the same answers gives back the same boxes.
    const leitner = await planApkgImport(
      pkg,
      { ...importOptions, importHistory: true, scheduler: 'leitner' },
      empty,
      now,
      newId,
    )
    expect(cardOf(leitner, 'Chien')).toMatchObject({
      box: original('note-5')?.box,
      suspended: true,
    })
    expect(cardOf(leitner, 'Chat')).toMatchObject({ box: original('note-6')?.box, state: 3 })
    expect(original('note-5')?.box).toBe(5)
  })

  it('skips the notes on re-import into the same collection instead of duplicating them', async () => {
    const input = representativeCollection(now)
    const { bytes } = await open(input)
    const plan = await planApkgImport(
      readApkg(bytes, SQL),
      importOptions,
      { ...empty, decks: input.decks, notes: input.notes },
      now,
      newId,
    )
    expect(plan.notes).toEqual([])
    expect(plan.updates).toEqual([])
    expect(plan.report).toMatchObject({ notesCreated: 0, skipped: 6 })
  })

  it('updates a re-imported note edited in Anki unless its cards would change', async () => {
    const deck = makeDeck({ name: 'Trous' }, 'deck', now)
    const cloze = noteWithCards('cz', deck.id, 'cloze', ['{{c1::a}} {{c2::b}}', ''], now)
    const text = noteWithCards('tx', deck.id, 'cloze', ['{{c1::x}}', 'old'], now + 1)
    const basic = noteWithCards('bs', deck.id, 'basic', ['Q', 'R', ''], now + 2)
    const made = [cloze, text, basic]
    const input: ApkgExportInput = {
      decks: [deck],
      notes: made.map((m) => m.note),
      cards: made.flatMap((m) => m.cards),
      reviews: [],
      media: [],
    }
    const { bytes } = await open(input)
    // In Anki: a third cloze, an edited Extra, a note type changed to "basic and reversed".
    const edited = editPackage(bytes, [
      "UPDATE notes SET flds = '{{c1::a}} {{c2::b}} {{c3::c}}' || char(31), mod = mod + 60 WHERE guid = 'cz'",
      "UPDATE notes SET flds = '{{c1::x}}' || char(31) || 'new', mod = mod + 60 WHERE guid = 'tx'",
      `UPDATE notes SET mid = ${ANKI_MODEL_IDS.basic_reverse}, mod = mod + 60 WHERE guid = 'bs'`,
    ])
    const plan = await planApkgImport(
      readApkg(edited, SQL),
      importOptions,
      { ...empty, decks: input.decks, notes: input.notes },
      now + 120_000,
      newId,
    )
    // Only the Extra edit is applied: the other two would need cards added (invariant 2).
    expect(plan.updates).toEqual([
      // Anki's `mod` is in seconds.
      { ...text.note, fields: ['{{c1::x}}', 'new'], updatedAt: now + 60_000 },
    ])
    expect(plan.notes).toEqual([])
    expect(plan.cards).toEqual([])
    expect(plan.report).toMatchObject({ notesUpdated: 1, skipped: 2 })
  })

  // tests/setup.ts sets TZ=Europe/Paris: the due and `crt` sit on both sides of a DST change.
  it('keeps review dues on their study day across daylight saving', async () => {
    const deck = makeDeck({ name: 'Heure' }, 'deck', now)
    const cases = [
      { exportAt: Date.UTC(2026, 6, 1, 10), due: { year: 2026, month: 11, day: 15 } },
      { exportAt: Date.UTC(2026, 0, 15, 10), due: { year: 2026, month: 6, day: 15 } },
    ]
    for (const { exportAt, due } of cases)
      for (const dayStartHour of [0, 4, 12, 22, 23])
        for (const at of [
          startOfDate(due, dayStartHour),
          startOfDate(due, dayStartHour, 1) - 60_000,
        ]) {
          const { note, cards } = noteWithCards('n', deck.id, 'basic', ['Q', 'R', ''], exportAt)
          const card: Card = {
            ...(cards[0] ?? makeCard(note, 0, 'c', exportAt)),
            state: 2,
            due: at,
            scheduledDays: 30,
            stability: 30,
            difficulty: 5,
            reps: 3,
            lastReview: exportAt,
          }
          const { bytes } = await buildApkg(
            SQL,
            { decks: [deck], notes: [note], cards: [card], reviews: [], media: [] },
            { now: exportAt, dayStartHour },
          )
          const plan = await planApkgImport(
            readApkg(bytes, SQL),
            { ...importOptions, dayStartHour },
            empty,
            exportAt,
            newId,
          )
          const imported = plan.cards[0]?.due ?? 0
          expect([dayStartHour, dayKey(imported, dayStartHour)]).toEqual([
            dayStartHour,
            dayKey(at, dayStartHour),
          ])
        }
  })

  it("exports occlusion notes to Anki's own note type and reads them back", async () => {
    const deck = makeDeck({ name: 'Cartes' }, 'deck-io', now)
    const masks = JSON.stringify({
      v: 1,
      mode: 'hideAll',
      masks: [
        { n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.25, label: 'Paris <1>' },
        { n: 2, x: 0.5, y: 0.5, w: 0.25, h: 0.125 },
        { n: 2, x: 0, y: 0, w: 0.05, h: 0.05, label: 'Lyon' },
      ],
    })
    const { note, cards } = noteWithCards(
      'io-1',
      deck.id,
      'image_occlusion',
      ['<img src="carte.png" alt="Carte">', masks, 'Villes', 'Source'],
      now - 1000,
    )
    const input: ApkgExportInput = {
      decks: [deck],
      notes: [note],
      cards,
      reviews: [],
      media: [{ name: 'carte.png', data: PNG }],
    }
    const { bytes, db, report } = await open(input)
    const [col] = rows(db, 'SELECT models FROM col')
    const models = json(col?.models) as Record<string, Record<string, unknown>>
    const io = models[String(ANKI_MODEL_IDS.image_occlusion)]
    expect(io).toMatchObject({ type: 1, originalStockKind: 6 })
    expect((io?.flds as { name: string; tag: number }[]).map((f) => [f.name, f.tag])).toEqual([
      ['Occlusion', 0],
      ['Image', 1],
      ['Header', 2],
      ['Back Extra', 3],
      ['Comments', 4],
    ])
    const [row] = rows(db, 'SELECT flds, mid FROM notes')
    expect(row?.mid).toBe(ANKI_MODEL_IDS.image_occlusion)
    expect(String(row?.flds).split('\u001f')).toEqual([
      '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.25:oi=1}}<br>' +
        '{{c2::image-occlusion:rect:left=.5:top=.5:width=.25:height=.125:oi=1}}<br>' +
        '{{c2::image-occlusion:rect:left=0:top=0:width=.05:height=.05:oi=1}}',
      '<img src="carte.png" alt="Carte">',
      'Villes',
      'Source',
      '1 : Paris &lt;1&gt;<br>2 : Lyon',
    ])
    expect(rows(db, 'SELECT ord FROM cards ORDER BY ord').map((r) => r.ord)).toEqual([0, 1])
    expect(report).toMatchObject({ notes: 1, cards: 2, media: 1, missingMedia: [] })
    db.close()

    // Back into Recto: masks and fields come back; answers, which Anki has no place for, land
    // in the extra field through Comments.
    const plan = await planApkgImport(readApkg(bytes, SQL), importOptions, empty, now, newId)
    const back = plan.notes[0]
    expect(back?.modelType).toBe('image_occlusion')
    expect(back?.fields.slice(0, 3)).toEqual([
      '<img src="carte.png" alt="Carte">',
      JSON.stringify({
        v: 1,
        mode: 'hideAll',
        masks: [
          { n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.25 },
          { n: 2, x: 0.5, y: 0.5, w: 0.25, h: 0.125 },
          { n: 2, x: 0, y: 0, w: 0.05, h: 0.05 },
        ],
      }),
      'Villes',
    ])
    expect(back?.fields[3]).toBe('Source<br>1 : Paris &lt;1&gt;<br>2 : Lyon')
    expect(plan.cards.map((c) => c.ord)).toEqual([0, 1])
  })

  it('exports an empty selection as a valid package', async () => {
    const { bytes, report } = await buildApkg(
      SQL,
      { decks: [], notes: [], cards: [], reviews: [], media: [] },
      options,
    )
    const pkg = readApkg(bytes, SQL)
    expect(pkg.notes).toEqual([])
    expect(pkg.decks.map((d) => d.name)).toEqual(['Default'])
    expect(report).toMatchObject({ notes: 0, cards: 0, decks: 0 })
  })
})
