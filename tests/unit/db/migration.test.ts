import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { RectoDB } from '$lib/db/schema'
import { makeCard, makeDeck } from '$lib/domain/defaults'

/**
 * Fake V1 → V2 migration, defined ONLY in this test (07-ROADMAP M1): V2 indexes `cards.flag`
 * and backfills a missing flag with 0. `schema.ts` must never contain it.
 */
class RectoDBv2 extends RectoDB {
  constructor(name: string) {
    super(name)
    this.version(2)
      .stores({
        cards:
          'id, noteId, deckId, due, state, box, flag, [deckId+due], [deckId+state], [noteId+ord]',
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

describe('schema migrations', () => {
  it('opens a V1 database with V2 and migrates its data', async () => {
    const name = `migration-${crypto.randomUUID()}`
    names.push(name)
    const v1 = new RectoDB(name)
    const deck = makeDeck({ name: 'D' }, 'd1', 1)
    await v1.decks.add(deck)
    const card = makeCard({ id: 'n1', deckId: 'd1' }, 0, 'c1', 1)
    const { flag: _omitted, ...legacy } = card
    await v1.table('cards').add(legacy)
    await v1.table('cards').add({ ...makeCard({ id: 'n1', deckId: 'd1' }, 1, 'c2', 1), flag: 3 })
    expect(v1.verno).toBe(1)
    v1.close()

    const v2 = new RectoDBv2(name)
    await v2.open()
    expect(v2.verno).toBe(2)
    expect(await v2.decks.get('d1')).toEqual(deck)
    expect((await v2.cards.get('c1'))?.flag).toBe(0)
    expect(await v2.cards.where('flag').equals(3).primaryKeys()).toEqual(['c2'])
    v2.close()

    // Re-opening is a no-op (upgrade is idempotent and not re-run).
    const again = new RectoDBv2(name)
    expect((await again.cards.get('c1'))?.flag).toBe(0)
    again.close()
  })

  it('the published schema is version 1', async () => {
    const name = `schema-${crypto.randomUUID()}`
    names.push(name)
    const db = new RectoDB(name)
    await db.open()
    expect(db.verno).toBe(1)
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'cards',
      'decks',
      'media',
      'notes',
      'reviews',
      'settings',
    ])
    db.close()
  })
})
