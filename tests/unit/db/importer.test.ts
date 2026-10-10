import { describe, expect, it } from 'vitest'
import { applyImportPlan, existingCollection } from '$lib/db/importer'
import * as repo from '$lib/db/repo'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Note } from '$lib/domain/types'
import { defaultMapping, detectModelType, parseCsv, planCsvImport } from '$lib/import/csv'
import { emptyReport, type ImportPlan } from '$lib/import/plan'
import { review } from '../../helpers/fixtures'
import { cardProblems } from '../../helpers/invariants'
import { sampleText } from '../../helpers/samples'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
const now = Date.UTC(2026, 8, 25)

async function planDepartements(duplicates: 'skip' | 'update' = 'skip') {
  const target =
    (await repo.listDecks()).find((d) => d.name === 'Cible') ??
    (await repo.createDeck({ name: 'Cible' }, now))
  const data = parseCsv(sampleText('departements.csv'))
  const mapping = defaultMapping(data)
  return planCsvImport(
    data,
    {
      mapping,
      hasHeader: true,
      modelType: detectModelType(data, mapping, true),
      deckId: target.id,
      duplicates,
    },
    await existingCollection(),
    now,
    () => crypto.randomUUID(),
  )
}

describe('applyImportPlan', () => {
  it('writes decks, notes and cards in batches with progress', async () => {
    const plan = await planDepartements()
    const progress: [number, number][] = []
    const report = await applyImportPlan(plan, {
      batchSize: 40,
      onProgress: (d, t) => progress.push([d, t]),
    })
    expect(report).toMatchObject({ notesCreated: 101, cardsCreated: 101, cancelled: false })
    expect(progress).toEqual([
      [0, 101],
      [40, 101],
      [80, 101],
      [101, 101],
    ])
    expect(await repo.collectionCounts()).toMatchObject({ decks: 3, notes: 101, cards: 101 })
    // Invariant 1 holds for imported cards.
    const notes = new Map((await env.db.notes.toArray()).map((n) => [n.id, n]))
    for (const card of await env.db.cards.toArray())
      expect(card.deckId).toBe(notes.get(card.noteId)?.deckId)
  })

  it('skips duplicates on a second import and updates them when asked', async () => {
    await applyImportPlan(await planDepartements())
    const again = await planDepartements()
    expect(again.report.skipped).toBe(101)
    const upd = await planDepartements('update')
    const report = await applyImportPlan(upd)
    expect(report.notesUpdated).toBe(101)
    expect(await env.db.notes.count()).toBe(101)
  })

  it('stops between batches when cancelled, keeping written batches', async () => {
    const plan = await planDepartements()
    const controller = new AbortController()
    const report = await applyImportPlan(plan, {
      batchSize: 30,
      signal: controller.signal,
      onProgress: (done) => {
        if (done >= 60) controller.abort()
      },
    })
    expect(report.cancelled).toBe(true)
    expect(report.notesCreated).toBe(60)
    expect(await env.db.notes.count()).toBe(60)
  })

  it('stores media and reviews of a plan', async () => {
    const deck = makeDeck({ name: 'M' }, 'm', now)
    const report = await applyImportPlan({
      decks: [deck],
      notes: [],
      cards: [],
      reviews: [],
      updates: [],
      media: [{ name: 'a.png', blob: new Blob(['png']), mime: 'image/png' }],
      report: (await planDepartements()).report,
    })
    expect(report.mediaImported).toBe(1)
    expect((await env.db.media.get('a.png'))?.size).toBe(3)
  })
})

describe('applyImportPlan: updated notes with their cards (M10)', () => {
  const deck = makeDeck({ name: 'Paquet' }, 'deck', now)
  const text = (...holes: number[]) => holes.map((i) => `{{c${i}::mot${i}}}`).join(' ')

  /** `count` cloze notes with holes 1 and 2, a card per hole and one log row per card. */
  async function seed(count: number): Promise<Note[]> {
    const notes: Note[] = Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      deckId: deck.id,
      modelType: 'cloze',
      fields: [text(1, 2), ''],
      tags: [],
      sourceGuid: `guid${i}`,
      createdAt: 1,
      updatedAt: 10,
    }))
    const cards = notes.flatMap((n) => [0, 1].map((ord) => makeCard(n, ord, `${n.id}-${ord}`, 1)))
    await env.db.decks.add(deck)
    await env.db.notes.bulkAdd(notes)
    await env.db.cards.bulkAdd(cards)
    await env.db.reviews.bulkAdd(cards.map((c) => review(`log-${c.id}`, c)))
    return notes
  }

  /**
   * The plan of an import that gives every note the hole 3 and takes the hole 2 away: a card is
   * added with one replayed answer, another is removed.
   */
  function editing(notes: Note[]): ImportPlan {
    const cards: Card[] = notes.map((n) => makeCard(n, 2, `${n.id}-2`, 2))
    return {
      decks: [],
      notes: [],
      cards,
      reviews: cards.map((c) => review(`replayed-${c.id}`, c, 2000)),
      updates: notes.map((n) => ({ ...n, fields: [text(1, 3), ''], updatedAt: 20 })),
      removedCards: notes.map((n) => ({ id: `${n.id}-1`, noteId: n.id })),
      media: [],
      report: emptyReport(),
    }
  }

  const ordsOf = async (noteId: string) =>
    (await env.db.cards.where('noteId').equals(noteId).toArray())
      .map((c) => c.ord)
      .sort((a, b) => a - b)

  it('writes each batch of notes with its added cards and reviews and its removals', async () => {
    const notes = await seed(5)
    const logBefore = await env.db.reviews.toArray()
    const progress: number[] = []
    const report = await applyImportPlan(editing(notes), {
      batchSize: 2,
      onProgress: (done) => progress.push(done),
    })
    expect(progress).toEqual([0, 2, 4, 5])
    expect(report).toMatchObject({
      notesCreated: 0,
      notesUpdated: 5,
      cardsCreated: 5,
      cardsRemoved: 5,
      reviewsImported: 5,
      cancelled: false,
    })
    for (const note of notes) {
      expect((await env.db.notes.get(note.id))?.fields[0]).toBe(text(1, 3))
      expect(await ordsOf(note.id)).toEqual([0, 2])
    }
    expect(await cardProblems(env.db)).toEqual([])
    // The log of the removed cards stays; the replayed answers are added to it.
    const log = await env.db.reviews.toArray()
    expect(log).toHaveLength(logBefore.length + 5)
    for (const row of logBefore) expect(log).toContainEqual(row)
  })

  it('writes the updated notes after the new ones, in the same plan', async () => {
    const notes = await seed(1)
    const fresh: Note = {
      ...(notes[0] as Note),
      id: 'fresh',
      sourceGuid: 'fresh',
      fields: [text(1), ''],
    }
    const plan = editing(notes)
    plan.notes = [fresh]
    plan.cards = [...plan.cards, makeCard(fresh, 0, 'fresh-0', 3)]
    const report = await applyImportPlan(plan)
    expect(report).toMatchObject({
      notesCreated: 1,
      notesUpdated: 1,
      cardsCreated: 2,
      cardsRemoved: 1,
    })
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('never leaves half a batch: a failing write rolls its notes, cards and removals back', async () => {
    const notes = await seed(4)
    const plan = editing(notes)
    // The second batch (n2, n3) adds a card whose id is already taken: the whole batch fails.
    plan.cards = plan.cards.map((c) => (c.noteId === 'n3' ? { ...c, id: 'n3-0' } : c))
    await expect(applyImportPlan(plan, { batchSize: 2 })).rejects.toThrow()
    // The first batch was written whole…
    for (const id of ['n0', 'n1']) {
      expect((await env.db.notes.get(id))?.fields[0]).toBe(text(1, 3))
      expect(await ordsOf(id)).toEqual([0, 2])
    }
    // …the second one not at all: old fields, both old cards, no added card or review.
    for (const id of ['n2', 'n3']) {
      expect((await env.db.notes.get(id))?.fields[0]).toBe(text(1, 2))
      expect(await ordsOf(id)).toEqual([0, 1])
    }
    expect(await env.db.reviews.get('replayed-n2-2')).toBeUndefined()
    // Every note matches its content, updated or not: the batch is atomic.
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('stops between batches when cancelled: written batches are complete, the others untouched', async () => {
    const notes = await seed(5)
    const controller = new AbortController()
    const report = await applyImportPlan(editing(notes), {
      batchSize: 2,
      signal: controller.signal,
      onProgress: (done) => {
        if (done >= 2) controller.abort()
      },
    })
    expect(report).toMatchObject({
      cancelled: true,
      notesUpdated: 2,
      cardsCreated: 2,
      cardsRemoved: 2,
      reviewsImported: 2,
    })
    for (const id of ['n0', 'n1']) expect(await ordsOf(id)).toEqual([0, 2])
    for (const id of ['n2', 'n3', 'n4']) {
      expect((await env.db.notes.get(id))?.fields[0]).toBe(text(1, 2))
      expect(await ordsOf(id)).toEqual([0, 1])
    }
  })

  it('keeps updating the fields of notes whose cards do not change', async () => {
    const notes = await seed(2)
    const plan: ImportPlan = {
      ...editing(notes),
      cards: [],
      reviews: [],
      removedCards: [],
      updates: notes.map((n) => ({ ...n, tags: ['nouveau'], updatedAt: 20 })),
    }
    const report = await applyImportPlan(plan)
    expect(report).toMatchObject({ notesUpdated: 2, cardsCreated: 0, cardsRemoved: 0 })
    expect((await env.db.notes.get('n1'))?.tags).toEqual(['nouveau'])
    expect(await env.db.cards.count()).toBe(4)
  })
})
