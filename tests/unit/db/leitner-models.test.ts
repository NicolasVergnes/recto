import { describe, expect, it } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import { setSetting } from '$lib/db/settings'
import { saveCustomBox, switchDeckModel } from '$lib/db/study'
import type { Card } from '$lib/domain/types'
import { card } from '../../helpers/fixtures'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
const now = Date.UTC(2026, 9, 21)
const DAY = 86_400_000

/** Cards of a deck in the given compartments, last changed at 1. */
async function cardsIn(deckId: string, boxes: number[]): Promise<Card[]> {
  const cards = boxes.map((box, i) =>
    card(
      `${deckId}-${i}`,
      { box, state: 2, due: now + (i + 1) * DAY, updatedAt: 1 },
      `n${i}`,
      deckId,
    ),
  )
  await env.db.cards.bulkAdd(cards)
  return cards
}

describe('new decks (M19)', () => {
  it('follow the « planificateur des nouveaux paquets », FSRS by default', async () => {
    expect((await repo.createDeck({ name: 'A' }, now)).scheduler).toBe('fsrs')
    await setSetting('newDeckModel', 'five')
    const five = await repo.createDeck({ name: 'B' }, now)
    expect(five).toMatchObject({ scheduler: 'leitner', settings: { leitner: { model: 'five' } } })
    expect(five.settings.leitner.intervals).toEqual([1, 3, 7, 14, 30])
    await setSetting('newDeckModel', 'custom')
    await setSetting('leitnerCustom', [1, 4, 10])
    const mine = await repo.createDeck({ name: 'C' }, now)
    expect(mine.settings.leitner).toMatchObject({ model: 'custom', intervals: [1, 4, 10] })
    // A choice made on the spot wins.
    const chosen = await repo.createDeck({ name: 'D', model: { model: 'fsrs', custom: [] } }, now)
    expect(chosen.scheduler).toBe('fsrs')
  })
})

describe('switchDeckModel (03 §4, M19)', () => {
  it('another box: cards keep their compartment, at most the last, and their due date', async () => {
    const deck = await repo.createDeck({ name: 'D', model: { model: 'seven', custom: [] } }, now)
    const [low, high, top] = await cardsIn(deck.id, [3, 6, 7])
    expect(await switchDeckModel(deck.id, 'five', now)).toBe(2)
    expect((await repo.getDeck(deck.id))?.settings.leitner).toMatchObject({
      model: 'five',
      intervals: [1, 3, 7, 14, 30],
    })
    expect(await env.db.cards.get(low?.id ?? '')).toEqual(low)
    expect(await env.db.cards.get(high?.id ?? '')).toMatchObject({
      box: 5,
      due: high?.due,
      updatedAt: now,
    })
    expect((await env.db.cards.get(top?.id ?? ''))?.box).toBe(5)

    await setSetting('leitnerCustom', [1, 4, 10])
    expect(await switchDeckModel(deck.id, 'custom', now + 1)).toBe(2)
    expect((await env.db.cards.toArray()).map((c) => c.box)).toEqual([3, 3, 3])
    expect((await repo.getDeck(deck.id))?.settings.leitner.intervals).toEqual([1, 4, 10])
    expect(await switchDeckModel(deck.id, 'custom', now + 2)).toBe(0)
  })

  it('FSRS → a box: the compartment of that box closest to the stability', async () => {
    const deck = await repo.createDeck({ name: 'D' }, now)
    await env.db.cards.bulkAdd([
      card('s25', { state: 2, stability: 25 }, 'n1', deck.id),
      card('new', {}, 'n2', deck.id),
    ])
    expect(await switchDeckModel(deck.id, 'five', now)).toBe(2)
    expect((await env.db.cards.get('s25'))?.box).toBe(5)
    expect((await env.db.cards.get('new'))?.box).toBe(0)
    expect(await switchDeckModel(deck.id, 'fsrs', now)).toBe(2)
    expect((await repo.getDeck(deck.id))?.scheduler).toBe('fsrs')
  })
})

describe('saveCustomBox (M19)', () => {
  it('saves « Ma boîte » and the decks that follow it, in one go', async () => {
    await setSetting('leitnerCustom', [1, 2, 4, 8])
    const mine = { model: 'custom', custom: [1, 2, 4, 8] } as const
    const a = await repo.createDeck({ name: 'A', model: mine }, now)
    const b = await repo.createDeck({ name: 'B', model: mine }, now)
    const seven = await repo.createDeck({ name: 'C', model: { model: 'seven', custom: [] } }, now)
    const fsrsDeck = await repo.createDeck({ name: 'F', model: { model: 'fsrs', custom: [] } }, now)
    await cardsIn(a.id, [1, 4])
    await cardsIn(b.id, [3])
    const [kept] = await cardsIn(seven.id, [6])

    expect(await saveCustomBox([1, 5], now + 9)).toBe(2)
    expect(await env.db.settings.get('leitnerCustom')).toEqual({
      key: 'leitnerCustom',
      value: [1, 5],
      updatedAt: now + 9,
    })
    for (const id of [a.id, b.id])
      expect(await repo.getDeck(id)).toMatchObject({
        settings: { leitner: { model: 'custom', intervals: [1, 5] } },
        updatedAt: now + 9,
      })
    // Deck by deck: decks have random ids, so one query over both would list them in any order.
    const boxes = async (deckId: string) =>
      (await env.db.cards.where('deckId').equals(deckId).sortBy('id')).map((c) => c.box)
    expect(await boxes(a.id)).toEqual([1, 2])
    expect(await boxes(b.id)).toEqual([2])
    expect(await env.db.cards.get(kept?.id ?? '')).toEqual(kept)
    expect(await repo.getDeck(seven.id)).toEqual(seven)
    expect(await repo.getDeck(fsrsDeck.id)).toEqual(fsrsDeck)
  })

  it('refuses a box that « Ma boîte » cannot hold', async () => {
    await expect(saveCustomBox([3, 2], now)).rejects.toSatisfy(
      (e) => e instanceof RepoError && e.code === 'leitnerBox',
    )
    expect(await env.db.settings.get('leitnerCustom')).toBeUndefined()
  })
})
