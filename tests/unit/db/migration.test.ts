import { afterEach, describe, expect, it } from 'vitest'
import { at } from '../../helpers/at'
import Dexie from 'dexie'
import { RectoDB } from '$lib/db/schema'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import { cardOrds, renderCard } from '$lib/domain/notes'
import type { Note, NoteType } from '$lib/domain/types'

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

/** The published version 4 layout (M13), frozen here to open « old » databases. */
class RectoDBv4 extends RectoDBv3 {
  constructor(name: string) {
    super(name)
    this.version(4).stores({})
  }
}

/** The published version 5 layout (M14), frozen here to open « old » databases. */
class RectoDBv5 extends RectoDBv4 {
  constructor(name: string) {
    super(name)
    this.version(5).stores({})
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
    expect(db.verno).toBe(6)
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
    expect(current.verno).toBe(6)
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
    expect(db.verno).toBe(6)
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
    expect(db.verno).toBe(6)
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

  it('opens a version 4 database: custom notes, their cards and what they ask unchanged (M14)', async () => {
    const name = uniqueName('v4')
    const v4 = new RectoDBv4(name)
    const type: NoteType = {
      id: 't1',
      name: 'Departements',
      fields: ['Numero', 'Dept'],
      templates: [
        { name: 'QNumero', front: '{{Numero}}', back: '{{FrontSide}}<hr>{{Dept}}' },
        { name: 'QDept', front: '{{Dept}}', back: '{{FrontSide}}<hr>{{Numero}}' },
      ],
      createdAt: 1,
      updatedAt: 1,
    }
    const notes: Note[] = [
      { ...base('n1'), modelType: 'custom', noteTypeId: 't1', fields: ['01', 'Ain'] },
      { ...base('n2'), modelType: 'cloze', fields: ['{{c1::a}} {{c2::b}}', ''] },
    ]
    const cards = [
      makeCard(at(notes, 0), 0, 'c0', 10),
      makeCard(at(notes, 0), 1, 'c1', 10),
      makeCard(at(notes, 1), 0, 'z0', 10),
      makeCard(at(notes, 1), 1, 'z1', 10),
    ]
    await v4.table('noteTypes').add(type)
    await v4.table('notes').bulkAdd(notes)
    await v4.table('cards').bulkAdd(cards)
    v4.close()

    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(6)
    expect(await db.noteTypes.get('t1')).toEqual(type)
    expect(await db.notes.toArray()).toEqual(notes)
    expect(await db.cards.toArray()).toEqual(cards)
    // The cards their content asks for are the stored ones, asking what they asked before.
    expect(cardOrds(at(notes, 0), type)).toEqual([0, 1])
    expect(cardOrds(at(notes, 1))).toEqual([0, 1])
    expect(renderCard(at(notes, 0), at(cards, 1), false, type).question).toBe('Ain')
    expect(renderCard(at(notes, 1), at(cards, 3)).expected).toBe('b')
    db.close()
  })

  it('reads note types stored before M16: their templates are asked one way', async () => {
    const name = uniqueName('m16')
    const db = new RectoDB(name)
    const type = {
      id: 't',
      name: 'T',
      fields: ['A', 'B'],
      templates: [{ name: 'A → B', front: '{{A}}', back: '{{FrontSide}}<hr id=answer>{{B}}' }],
      createdAt: 1,
      updatedAt: 1,
    }
    await db.noteTypes.add(type)
    db.close()

    // Nothing to upgrade: an absent `twoWay` is the one-way template it always was.
    const again = new RectoDB(name)
    const stored = await again.noteTypes.get('t')
    expect(stored).toEqual(type)
    const note = { modelType: 'custom' as const, fields: ['a', 'b'] }
    const rendered = renderCard(note, { ord: 0, sideFlipped: true }, true, stored)
    expect([rendered.question, rendered.answer, rendered.flipped]).toEqual([
      'a',
      'a<hr id=answer>b',
      false,
    ])
    await again.noteTypes.put({
      ...type,
      templates: type.templates.map((t) => ({ ...t, twoWay: true })),
    })
    expect((await again.noteTypes.get('t'))?.templates[0]?.twoWay).toBe(true)
    again.close()
  })

  it('opens a version 5 database: no format paused, the decks keep their date (M17)', async () => {
    const name = uniqueName('v5')
    const v5 = new RectoDBv5(name)
    const deck = makeDeck({ name: 'D' }, 'd1', 10)
    const { pausedFormats: _p, newByFormat: _n, ...stored } = deck.settings
    await v5
      .table('decks')
      .add({ ...deck, settings: { ...stored, newOrder: 'added' }, updatedAt: 40 })
    v5.close()

    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(6)
    expect(await db.decks.get('d1')).toEqual({
      ...deck,
      settings: { ...deck.settings, newOrder: 'added' },
      updatedAt: 40,
    })
    db.close()
  })

  it('the published schema is version 6', async () => {
    const db = new RectoDB(uniqueName('schema'))
    await db.open()
    expect(db.verno).toBe(6)
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

function base(id: string) {
  return { id, deckId: 'd1', tags: [], createdAt: 1, updatedAt: 1 }
}
