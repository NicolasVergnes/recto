import { beforeAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { applyImportPlan, existingForApkg } from '$lib/db/importer'
import { newId } from '$lib/db/schema'
import type { Card, Note } from '$lib/domain/types'
import {
  planApkgImport,
  readApkg,
  type ApkgExisting,
  type ApkgImportOptions,
  type ApkgPackage,
  type ApkgRevlog,
} from '$lib/import/apkg'
import type { ImportPlan } from '$lib/import/plan'
import { boxFromStability, LEITNER_PRESETS } from '$lib/domain/leitner'
import {
  ankiPackage,
  ankiReview,
  BASIC_MODEL,
  CLOZE_MODEL,
  COUNTRY_MODEL,
  REVIEW_STATE,
  type AnkiNote,
} from '../../helpers/anki-package'
import { review } from '../../helpers/fixtures'
import { cardProblems } from '../../helpers/invariants'
import { useTestDatabase } from '../../helpers/db'
import { sampleBytes } from '../../helpers/samples'

const env = useTestDatabase()
let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await (await import('sql.js/dist/sql-wasm.js')).default()
})

const now = Date.UTC(2026, 8, 25, 8)
const DAY = 86_400_000
const options: ApkgImportOptions = {
  target: { mode: 'anki' },
  importHistory: false,
  model: { model: 'fsrs', custom: [] },
  dayStartHour: 4,
}

/** Anki's modification times (seconds): the first export, then one hour later each edit. */
const T1 = 1_700_000_000
const HOUR = 3600
const CLOZE_ID = 1_700_000_000_001
const COUNTRY_ID = 1_700_000_000_002

const holes = (...n: number[]) => n.map((i) => `{{c${i}::mot${i}}}`).join(' ')
const clozeNote = (text: string, mod: number, cards: AnkiNote['cards']): AnkiNote => ({
  id: CLOZE_ID,
  guid: 'cloze-guid',
  model: CLOZE_MODEL,
  fields: [text, 'Extra'],
  mod,
  cards,
})
/** The « Pays » note: its third card exists only when the hint is filled. */
const countryNote = (hint: string, mod: number, cards: AnkiNote['cards']): AnkiNote => ({
  id: COUNTRY_ID,
  guid: 'country-guid',
  model: COUNTRY_MODEL,
  fields: ['France', 'Paris', hint],
  mod,
  cards,
})

/** Imports `pkg` as the importer screen does (planner, then the batched writer). */
async function importPackage(pkg: ApkgPackage, patch: Partial<ApkgImportOptions> = {}) {
  const existing = await existingForApkg()
  const plan = await planApkgImport(pkg, { ...options, ...patch }, existing, now, newId)
  const report = await applyImportPlan(plan, { now })
  return { plan, report }
}

/** What the planner sees once `plan` has been written, without the database. */
const existingAfter = (plan: ImportPlan): ApkgExisting => ({
  decks: plan.decks,
  notes: plan.notes,
  noteTypes: plan.noteTypes ?? [],
  cards: plan.cards,
  media: new Map(),
})

const plan = (pkg: ApkgPackage, existing: ApkgExisting, patch: Partial<ApkgImportOptions> = {}) =>
  planApkgImport(pkg, { ...options, ...patch }, existing, now, newId)

/** What studying in Recto leaves on the card of an ord, with a log row: it must be kept. */
async function study(noteId: string, ord: number): Promise<Card> {
  const stored = await env.db.cards.where('[noteId+ord]').equals([noteId, ord]).first()
  if (!stored) throw new Error('no card')
  const studied: Card = {
    ...stored,
    state: 2,
    reps: 7,
    lapses: 2,
    stability: 41,
    difficulty: 4.5,
    scheduledDays: 41,
    lastReview: now - 3 * DAY,
    due: now + 38 * DAY,
  }
  await env.db.cards.put(studied)
  await env.db.reviews.add(review(`log-${studied.id}`, studied, now - 3 * DAY))
  return studied
}

const ordsOf = async (noteId: string) =>
  (await env.db.cards.where('noteId').equals(noteId).toArray())
    .map((c) => c.ord)
    .sort((a, b) => a - b)

describe('re-importing a note that changed in Anki: its cards follow (invariant 2)', () => {
  it('creates the card of a hole added in Anki from the Anki card, the others left alone', async () => {
    await importPackage(ankiPackage([clozeNote(holes(1, 2), T1, [0, 1])]))
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    const kept = [await study(note.id, 0), await study(note.id, 1)]

    const edited = ankiPackage([
      clozeNote(holes(1, 2, 3), T1 + HOUR, [0, 1, { ord: 2, ...REVIEW_STATE }]),
    ])
    const { plan: written, report } = await importPackage(edited)

    expect(written.updates).toHaveLength(1)
    expect(written.cards).toHaveLength(1)
    expect(written.cards[0]).toMatchObject({
      noteId: note.id,
      deckId: note.deckId,
      ord: 2,
      state: 2,
      scheduledDays: 30,
      stability: 30,
      reps: 4,
      lapses: 1,
      suspended: false,
      // Day 0 of the collection (2023-11-14) + 20 calendar days, at the 04:00 day start.
      due: new Date(2023, 11, 4, 4).getTime(),
    })
    expect(written.removedCards).toEqual([])
    expect(report).toMatchObject({
      notesCreated: 0,
      notesUpdated: 1,
      cardsCreated: 1,
      cardsRemoved: 0,
      skipped: 0,
      reviewsImported: 0,
    })
    expect((await env.db.notes.get(note.id))?.fields[0]).toBe(holes(1, 2, 3))
    expect(await ordsOf(note.id)).toEqual([0, 1, 2])
    // The cards that kept their ord: schedule and log exactly as Recto had them.
    for (const card of kept) expect(await env.db.cards.get(card.id)).toEqual(card)
    expect(await env.db.reviews.count()).toBe(2)
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('replays the Anki history of the new card only, with its log rows', async () => {
    const first = ankiPackage([clozeNote(holes(1), T1, [0])], [ankiReview(CLOZE_ID, 0, 5)])
    await importPackage(first, { importHistory: true })
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    const [kept] = await env.db.cards.toArray()
    const logBefore = await env.db.reviews.toArray()

    const day = (d: number) => Date.UTC(2023, 10, d, 10)
    const edited = ankiPackage(
      [clozeNote(holes(1, 2), T1 + HOUR, [0, { ord: 1, ...REVIEW_STATE }])],
      // The log of the card that exists in Recto is not replayed again.
      [
        ankiReview(CLOZE_ID, 0, day(16)),
        ankiReview(CLOZE_ID, 1, day(18)),
        ankiReview(CLOZE_ID, 1, day(25)),
      ],
    )
    const { plan: written, report } = await importPackage(edited, { importHistory: true })

    const created = written.cards[0]
    expect(written.cards).toHaveLength(1)
    expect(created).toMatchObject({ noteId: note.id, ord: 1, reps: 2, lastReview: day(25) })
    expect(written.reviews).toHaveLength(2)
    expect(written.reviews.every((r) => r.cardId === created?.id && r.deckId === note.deckId)).toBe(
      true,
    )
    expect(report).toMatchObject({ cardsCreated: 1, reviewsImported: 2, notesUpdated: 1 })
    expect(await env.db.cards.get(kept?.id ?? '')).toEqual(kept)
    const log = await env.db.reviews.toArray()
    expect(log).toHaveLength(logBefore.length + 2)
    for (const row of logBefore) expect(log).toContainEqual(row)
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('makes a new card when Anki has no card for the added hole', async () => {
    await importPackage(ankiPackage([clozeNote(holes(1), T1, [0])]))
    const edited = ankiPackage([clozeNote(holes(1, 2), T1 + HOUR, [0])])
    const { plan: written } = await importPackage(edited)
    expect(written.cards).toHaveLength(1)
    expect(written.cards[0]).toMatchObject({
      ord: 1,
      state: 0,
      reps: 0,
      // Like a new note's cards: the Anki note id + ord, which keeps the order of new cards.
      createdAt: CLOZE_ID + 1,
      due: CLOZE_ID + 1,
    })
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('removes the card of a hole removed in Anki, its log kept', async () => {
    await importPackage(ankiPackage([clozeNote(holes(1, 2, 3), T1, [0, 1, 2])]))
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    const [first, doomed, third] = [
      await study(note.id, 0),
      await study(note.id, 1),
      await study(note.id, 2),
    ]

    // Anki keeps the card of a removed hole until « Empty Cards » is run: it is neither imported
    // nor counted among the ignored duplicates.
    const edited = ankiPackage([clozeNote(holes(1, 3), T1 + HOUR, [0, 1, 2])])
    const { plan: written, report } = await importPackage(edited)

    expect(written.removedCards?.map((c) => c.id)).toEqual([doomed.id])
    expect(written.cards).toEqual([])
    expect(report).toMatchObject({ notesUpdated: 1, cardsCreated: 0, cardsRemoved: 1, skipped: 0 })
    expect(await ordsOf(note.id)).toEqual([0, 2])
    expect(await env.db.cards.get(doomed.id)).toBeUndefined()
    expect(await env.db.cards.get(first.id)).toEqual(first)
    expect(await env.db.cards.get(third.id)).toEqual(third)
    // Append-only log (invariant 3): the removed card keeps its row.
    expect((await env.db.reviews.toArray()).map((r) => r.cardId).sort()).toEqual(
      [first.id, doomed.id, third.id].sort(),
    )
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('adds and removes mask groups of an image occlusion note', async () => {
    const fixture = readApkg(sampleBytes('image-occlusion.apkg'), SQL)
    const [anki] = fixture.notes
    if (!anki) throw new Error('fixture')
    const shapes = anki.fields[0] ?? ''
    const withFields = (field: string, mod: number): ApkgPackage => ({
      ...fixture,
      notes: [{ ...anki, mod, fields: [field, ...anki.fields.slice(1)] }],
    })
    await importPackage(fixture)
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    expect(await ordsOf(note.id)).toEqual([0, 1, 2])
    const group2 = await study(note.id, 1)

    // A fourth group appears in Anki (a card exists for it).
    const fourth = '{{c4::image-occlusion:rect:left=.6:top=.6:width=.2:height=.2:oi=1}}'
    const added = withFields(`${shapes}<br>${fourth}`, anki.mod + HOUR)
    const [template] = added.cards
    if (!template) throw new Error('fixture')
    added.cards = [...added.cards, { ...template, id: template.id + 100, ord: 3, ...REVIEW_STATE }]
    const gained = await importPackage(added)
    expect(gained.plan.cards.map((c) => [c.ord, c.state])).toEqual([[3, 2]])
    expect(gained.report).toMatchObject({ cardsCreated: 1, cardsRemoved: 0, notesUpdated: 1 })
    expect(await ordsOf(note.id)).toEqual([0, 1, 2, 3])

    // Then the group 2 (an ellipse and a rectangle) is deleted: ord 1 goes, 0, 2 and 3 stay.
    const [first, , , third] = shapes.split('<br>')
    const lost = await importPackage(
      withFields([first, third, fourth].join('<br>'), anki.mod + 2 * HOUR),
    )
    expect(lost.plan.removedCards?.map((c) => c.id)).toEqual([group2.id])
    expect(lost.report).toMatchObject({ cardsRemoved: 1, notesUpdated: 1, cardsCreated: 0 })
    expect(await ordsOf(note.id)).toEqual([0, 2, 3])
    expect(await env.db.reviews.where('cardId').equals(group2.id).count()).toBe(1)
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('follows a card template of a custom type that becomes non-empty, then empty again', async () => {
    const started = await importPackage(ankiPackage([countryNote('', T1, [0, 1])]))
    expect(started.report.noteTypesCreated).toEqual(['Pays'])
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    expect(await ordsOf(note.id)).toEqual([0, 1])

    const hinted = await importPackage(
      ankiPackage([
        countryNote('Sur le Vieux Continent', T1 + HOUR, [0, 1, { ord: 2, ...REVIEW_STATE }]),
      ]),
    )
    // The type already exists: neither a second type nor a rename.
    expect(hinted.plan.noteTypes).toEqual([])
    expect(await env.db.noteTypes.count()).toBe(1)
    expect(hinted.plan.cards.map((c) => [c.ord, c.state])).toEqual([[2, 2]])
    expect(await ordsOf(note.id)).toEqual([0, 1, 2])
    const hint = await study(note.id, 2)

    const emptied = await importPackage(ankiPackage([countryNote('', T1 + 2 * HOUR, [0, 1, 2])]))
    expect(emptied.plan.removedCards?.map((c) => c.id)).toEqual([hint.id])
    expect(emptied.report).toMatchObject({ cardsRemoved: 1, cardsCreated: 0, notesUpdated: 1 })
    expect(await ordsOf(note.id)).toEqual([0, 1])
    expect(await env.db.reviews.where('cardId').equals(hint.id).count()).toBe(1)
    expect(await cardProblems(env.db)).toEqual([])
  })

  describe('in a Leitner deck', () => {
    const edited = (revlog: ApkgRevlog[] = []) =>
      ankiPackage([clozeNote(holes(1, 2), T1 + HOUR, [0, { ord: 1, ...REVIEW_STATE }])], revlog)

    // The option names the scheduler of the decks an import creates, not of existing ones.
    it('puts the new card in a box from the state of the Anki card', async () => {
      await importPackage(ankiPackage([clozeNote(holes(1), T1, [0])]), {
        model: { model: 'seven', custom: [] },
      })
      const [deck] = await env.db.decks.toArray()
      expect(deck?.scheduler).toBe('leitner')
      const { plan: written } = await importPackage(edited(), {
        model: { model: 'fsrs', custom: [] },
      })
      expect(written.cards[0]).toMatchObject({ deckId: deck?.id, ord: 1, state: 2 })
      expect(written.cards[0]?.box).toBe(boxFromStability(30, LEITNER_PRESETS.seven))
    })

    it('replays the Anki history with the Leitner scheduler', async () => {
      await importPackage(ankiPackage([clozeNote(holes(1), T1, [0])]), {
        model: { model: 'seven', custom: [] },
      })
      const log = [
        ankiReview(CLOZE_ID, 1, Date.UTC(2023, 10, 20, 10)),
        ankiReview(CLOZE_ID, 1, Date.UTC(2023, 10, 22, 10)),
      ]
      const { plan: written } = await importPackage(edited(log), {
        model: { model: 'fsrs', custom: [] },
        importHistory: true,
      })
      expect(written.reviews.map((r) => r.scheduler)).toEqual(['leitner', 'leitner'])
      expect(written.cards[0]?.box).toBeGreaterThan(1)
    })
  })

  it('removes the older of two cards that share an ord, keeping the studied one', async () => {
    await importPackage(ankiPackage([clozeNote(holes(1), T1, [0])]))
    const [note] = await env.db.notes.toArray()
    if (!note) throw new Error('no note')
    const studied = await study(note.id, 0)
    // The leftover of a former merge: a second, never reviewed card for the same hole.
    const twin: Card = { ...studied, id: 'twin', state: 0, reps: 0, lastReview: null }
    await env.db.cards.add(twin)

    const { plan: written, report } = await importPackage(
      ankiPackage([clozeNote(holes(1), T1 + HOUR, [0])]),
    )
    expect(written.removedCards?.map((c) => c.id)).toEqual(['twin'])
    expect(report).toMatchObject({ cardsCreated: 0, cardsRemoved: 1 })
    expect(await ordsOf(note.id)).toEqual([0])
    expect(await env.db.cards.get(studied.id)).toEqual(studied)
    expect(await cardProblems(env.db)).toEqual([])
  })
})

describe('re-importing: what stays untouched', () => {
  const noteOf = (id: string, patch: Partial<Note> = {}): Note => ({
    id,
    deckId: 'deck',
    modelType: 'cloze',
    fields: [holes(1, 2), 'Extra'],
    tags: [],
    sourceGuid: 'cloze-guid',
    createdAt: 0,
    updatedAt: T1 * 1000,
    ...patch,
  })

  /** A known cloze note with its two cards, as the first import wrote them. */
  async function known(): Promise<ApkgExisting> {
    const first = await plan(ankiPackage([clozeNote(holes(1, 2), T1, [0, 1])]), {
      decks: [],
      notes: [],
      cards: [],
      media: new Map(),
    })
    return existingAfter(first)
  }

  it('ignores a note that is not more recent in Anki, and counts it', async () => {
    const existing = await known()
    for (const mod of [T1, T1 - HOUR]) {
      const edited = ankiPackage([clozeNote(holes(1, 2, 3), mod, [0, 1, 2])])
      const again = await plan(edited, existing)
      expect(again.updates).toEqual([])
      expect(again.cards).toEqual([])
      expect(again.removedCards).toEqual([])
      expect(again.report).toMatchObject({ notesUpdated: 0, cardsCreated: 0, cardsRemoved: 0 })
      expect(again.report.skipped).toBe(1)
    }
  })

  it('updates a known note once when the package lists its guid twice, counting the other', async () => {
    const existing = await known()
    const listedTwice = ankiPackage([
      clozeNote(holes(1, 2, 3), T1 + HOUR, [0, 1, 2]),
      { ...clozeNote(holes(1, 2, 4), T1 + 2 * HOUR, [0, 1, 3]), id: CLOZE_ID + 1 },
    ])
    const again = await plan(listedTwice, existing)
    // Two updates would each add their card: two cards for one hole is what invariant 2 forbids.
    expect(again.updates.map((n) => n.fields[0])).toEqual([holes(1, 2, 3)])
    expect(again.cards.map((c) => c.ord)).toEqual([2])
    expect(again.removedCards).toEqual([])
    expect(again.report).toMatchObject({ notesUpdated: 1, cardsCreated: 1, skipped: 1 })
  })

  it('still ignores a note that would change type, whatever its cards', async () => {
    const existing = await known()
    // Same guid, now a basic note in Anki: the fields would not mean the same thing.
    const basic: AnkiNote = {
      id: CLOZE_ID,
      guid: 'cloze-guid',
      model: BASIC_MODEL,
      fields: ['Question', 'Réponse'],
      mod: T1 + HOUR,
      cards: [0],
    }
    const changed = await plan(ankiPackage([basic]), existing)
    expect(changed.updates).toEqual([])
    expect(changed.removedCards).toEqual([])
    expect(changed.report).toMatchObject({ notesCreated: 0, notesUpdated: 0, skipped: 1 })
  })

  it('still ignores a custom note whose Anki note type changed its fields', async () => {
    const first = await plan(ankiPackage([countryNote('', T1, [0, 1])]), {
      decks: [],
      notes: [],
      cards: [],
      media: new Map(),
    })
    // A field was added to the type in Anki: Recto would keep it as another type, « Pays (2) ».
    const wider = ankiPackage([
      {
        ...countryNote('', T1 + HOUR, [0, 1]),
        model: { ...COUNTRY_MODEL, fields: [...COUNTRY_MODEL.fields, 'Région'] },
        fields: ['France', 'Paris', '', 'Europe'],
      },
    ])
    const changed = await plan(wider, existingAfter(first))
    expect(changed.updates).toEqual([])
    expect(changed.noteTypes).toEqual([])
    expect(changed.report).toMatchObject({ notesUpdated: 0, skipped: 1, noteTypesCreated: [] })
  })

  it('leaves a note whose new content makes no card as it is, and reports it', async () => {
    const existing = await known()
    const none = await plan(ankiPackage([clozeNote('plus de trou', T1 + HOUR, [0, 1])]), existing)
    expect(none.updates).toEqual([])
    expect(none.removedCards).toEqual([])
    expect(none.report.errors).toEqual([{ line: CLOZE_ID, code: 'noCloze' }])
    expect(none.report).toMatchObject({ notesUpdated: 0, cardsRemoved: 0, skipped: 0 })

    const country = await plan(ankiPackage([countryNote('', T1, [0, 1])]), {
      decks: [],
      notes: [],
      cards: [],
      media: new Map(),
    })
    const blank: AnkiNote = { ...countryNote('', T1 + HOUR, [0, 1]), fields: ['', '', ''] }
    const empty = await plan(ankiPackage([blank]), existingAfter(country))
    expect(empty.report.errors).toEqual([{ line: COUNTRY_ID, code: 'emptyFront' }])
    expect(empty.updates).toEqual([])
  })

  it('reports masks it cannot read in an update that would leave the note without any', async () => {
    const fixture = readApkg(sampleBytes('image-occlusion.apkg'), SQL)
    const first = await plan(fixture, { decks: [], notes: [], cards: [], media: new Map() })
    const [anki] = fixture.notes
    if (!anki) throw new Error('fixture')
    const text = '{{c1::image-occlusion:text:left=.1:top=.1:text=Paris:scale=1:fs=.05}}'
    const edited: ApkgPackage = {
      ...fixture,
      notes: [{ ...anki, mod: anki.mod + HOUR, fields: [text, ...anki.fields.slice(1)] }],
    }
    const again = await plan(edited, existingAfter(first))
    expect(again.report.errors).toEqual([{ line: anki.id, code: 'noMask' }])
    expect(again.report).toMatchObject({ notesUpdated: 0, shapesSkipped: 1, shapesConverted: 0 })
    expect(again.updates).toEqual([])
  })

  it('leaves a note whose deck is gone as it is, reporting it', async () => {
    const edited = ankiPackage([clozeNote(holes(1, 2, 3), T1 + HOUR, [0, 1, 2])])
    const orphan = await plan(edited, {
      decks: [],
      notes: [noteOf('n1', { deckId: 'gone' })],
      cards: [],
      media: new Map(),
    })
    expect(orphan.report.errors).toEqual([{ line: CLOZE_ID, code: 'orphanCard' }])
    expect(orphan.updates).toEqual([])
    expect(orphan.cards).toEqual([])
  })
})
