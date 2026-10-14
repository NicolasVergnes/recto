import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { RectoDB } from '$lib/db/schema'
import { makeCard, makeDeck } from '$lib/domain/defaults'

/** The published version 1 layout (V0–M7), frozen here to open « old » databases. */
class RectoDBv1 extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      decks: 'id, parentId, name',
      notes: 'id, deckId, modelType, *tags, sourceGuid, updatedAt',
      cards: 'id, noteId, deckId, due, state, box, [deckId+due], [deckId+state], [noteId+ord]',
      reviews: 'id, cardId, reviewedAt, [cardId+reviewedAt]',
      media: 'name, sha256, createdAt',
      settings: 'key',
    })
  }
}

/** The published version 2 layout (M8–M11), frozen here to open « old » databases. */
class RectoDBv2 extends RectoDBv1 {
  constructor(name: string) {
    super(name)
    this.version(2).stores({
      notes: 'id, deckId, modelType, noteTypeId, *tags, sourceGuid, updatedAt',
      noteTypes: 'id, name, sourceId',
    })
  }
}

/** The published version 3 layout (M12), frozen here to open « old » databases. */
class RectoDBv3 extends RectoDBv2 {
  constructor(name: string) {
    super(name)
    this.version(3).stores({
      cards:
        'id, noteId, deckId, due, state, box, updatedAt, [deckId+due], [deckId+state], [noteId+ord]',
      deletions: 'id, table, deletedAt',
    })
  }
}

/**
 * Fake next migration, defined ONLY in this test (07-ROADMAP M1): it indexes `cards.flag` and
 * backfills a missing flag with 0. `schema.ts` must never contain it.
 */
class RectoDBNext extends RectoDB {
  constructor(name: string) {
    super(name)
    this.version(99)
      .stores({
        cards:
          'id, noteId, deckId, due, state, box, flag, updatedAt, [deckId+due], [deckId+state], [noteId+ord]',
      })
      .upgrade((tx) =>
        tx
          .table('cards')
          .toCollection()
          .modify((card: { flag?: number }) => {
            card.flag ??= 0
          }),
      )
  }
}

const names: string[] = []
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name)
})

const uniqueName = (prefix: string) => {
  const name = `${prefix}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

describe('schema migrations', () => {
  it('opens a version 1 database with the current schema (M8 note types)', async () => {
    const name = uniqueName('v1')
    const v1 = new RectoDBv1(name)
    await v1.table('decks').add(makeDeck({ name: 'D' }, 'd1', 1))
    await v1.table('notes').add({
      id: 'n1',
      deckId: 'd1',
      modelType: 'basic',
      fields: ['a', 'b', ''],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })
    v1.close()

    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(4)
    expect((await db.notes.get('n1'))?.fields).toEqual(['a', 'b', ''])
    expect(await db.noteTypes.count()).toBe(0)
    await db.noteTypes.add({
      id: 't1',
      name: 'T',
      fields: ['A'],
      templates: [{ name: 'C', front: '{{A}}', back: '{{A}}' }],
      createdAt: 1,
      updatedAt: 1,
    })
    await db.notes.update('n1', { noteTypeId: 't1' })
    expect(await db.notes.where('noteTypeId').equals('t1').primaryKeys()).toEqual(['n1'])
    db.close()
  })

  it('runs a later upgrade on existing data, once', async () => {
    const name = uniqueName('migration')
    const current = new RectoDB(name)
    const deck = makeDeck({ name: 'D' }, 'd1', 1)
    await current.decks.add(deck)
    const card = makeCard({ id: 'n1', deckId: 'd1' }, 0, 'c1', 1)
    const { flag: _omitted, ...legacy } = card
    await current.table('cards').add(legacy)
    await current
      .table('cards')
      .add({ ...makeCard({ id: 'n1', deckId: 'd1' }, 1, 'c2', 1), flag: 3 })
    expect(current.verno).toBe(4)
    current.close()

    const next = new RectoDBNext(name)
    await next.open()
    expect(next.verno).toBe(99)
    expect(await next.decks.get('d1')).toEqual(deck)
    expect((await next.cards.get('c1'))?.flag).toBe(0)
    expect(await next.cards.where('flag').equals(3).primaryKeys()).toEqual(['c2'])
    next.close()

    // Re-opening is a no-op (upgrade is idempotent and not re-run).
    const again = new RectoDBNext(name)
    expect((await again.cards.get('c1'))?.flag).toBe(0)
    again.close()
  })

  it('opens a version 2 database: cards dated, deletions table (M12)', async () => {
    const name = uniqueName('v2')
    const v2 = new RectoDBv2(name)
    const { updatedAt: _new, ...reviewed } = {
      ...makeCard({ id: 'n1', deckId: 'd1' }, 0, 'c1', 10),
      lastReview: 50,
    }
    const { updatedAt: _none, ...fresh } = makeCard({ id: 'n1', deckId: 'd1' }, 1, 'c2', 20)
    await v2.table('cards').bulkAdd([reviewed, fresh])
    await v2.table('settings').add({ key: 'dayStartHour', value: 5 })
    v2.close()

    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(4)
    // Dated by their last review, else by their creation.
    expect((await db.cards.get('c1'))?.updatedAt).toBe(50)
    expect((await db.cards.get('c2'))?.updatedAt).toBe(20)
    expect(await db.cards.where('updatedAt').above(30).primaryKeys()).toEqual(['c1'])
    expect(await db.deletions.count()).toBe(0)
    expect(await db.settings.get('dayStartHour')).toEqual({ key: 'dayStartHour', value: 5 })
    db.close()
    // Re-opening does not run the upgrade again.
    const again = new RectoDB(name)
    expect((await again.cards.get('c2'))?.updatedAt).toBe(20)
    again.close()
  })

  it('opens a version 3 database: no twin burying, new cards in random order (M13)', async () => {
    const name = uniqueName('v3')
    const v3 = new RectoDBv3(name)
    const deck = makeDeck({ name: 'D' }, 'd1', 10)
    const { newOrder: _o, ...current } = deck.settings
    const stored = { ...deck, settings: { ...current, newOrder: 'added', burySiblings: true } }
    const leitner = { ...stored, id: 'd2', scheduler: 'leitner', updatedAt: 30 }
    await v3.table('decks').bulkAdd([stored, leitner])
    await v3.table('cards').add(makeCard({ id: 'n1', deckId: 'd1' }, 0, 'c1', 10))
    v3.close()

    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(4)
    // Same settings as a deck created today; the change dates are kept.
    expect(await db.decks.get('d1')).toEqual(deck)
    expect(await db.decks.get('d2')).toEqual({
      ...deck,
      id: 'd2',
      scheduler: 'leitner',
      updatedAt: 30,
    })
    expect((await db.cards.get('c1'))?.updatedAt).toBe(10)
    db.close()
  })

  it('the published schema is version 4', async () => {
    const db = new RectoDB(uniqueName('schema'))
    await db.open()
    expect(db.verno).toBe(4)
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'cards',
      'decks',
      'deletions',
      'media',
      'noteTypes',
      'notes',
      'reviews',
      'settings',
    ])
    db.close()
  })
})
