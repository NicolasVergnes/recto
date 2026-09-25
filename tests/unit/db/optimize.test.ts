import { describe, expect, it } from 'vitest'
import { countDeckReviews, loadDeckReviews } from '$lib/db/optimize'
import * as repo from '$lib/db/repo'
import { setSetting } from '$lib/db/settings'
import { recordReview } from '$lib/db/study'
import { getScheduler } from '$lib/scheduler'
import { paris } from '../../helpers/fixtures'
import { useTestDatabase } from '../../helpers/db'

useTestDatabase()
const now = paris('2026-09-25T08:00:00Z')
const fsrs = getScheduler('fsrs', { fuzz: false })

async function deckWithAnswers(name: string, parentId: string | null, answers: number) {
  const deck = await repo.createDeck({ name, parentId, scheduler: 'fsrs' }, now)
  const { cards } = await repo.createNote(
    { deckId: deck.id, modelType: 'basic', fields: ['q', 'a'], tags: [] },
    now,
  )
  let card = cards[0]
  for (let i = 0; card && i < answers; i++) {
    const outcome = fsrs.answer(card, 3, now + i * 86_400_000, deck)
    await recordReview(outcome, 1000)
    card = outcome.card
  }
  return deck
}

describe('deck review log for the optimizer', () => {
  it('counts and loads the answers of the deck’s own cards only', async () => {
    const parent = await deckWithAnswers('Parent', null, 3)
    await deckWithAnswers('Child', parent.id, 2)
    await setSetting('dayStartHour', 5)
    expect(await countDeckReviews(parent.id)).toBe(3)
    const { reviews, dayStartHour } = await loadDeckReviews(parent.id)
    expect(dayStartHour).toBe(5)
    expect(reviews).toHaveLength(3)
    expect(Object.keys(reviews[0] ?? {}).sort()).toEqual([
      'cardId',
      'id',
      'rating',
      'reviewedAt',
      'stateBefore',
    ])
    expect(reviews.map((r) => r.stateBefore).sort()).toEqual([0, 1, 2])
  })

  it('returns nothing for an empty deck', async () => {
    const deck = await repo.createDeck({ name: 'Vide', scheduler: 'fsrs' }, now)
    expect(await countDeckReviews(deck.id)).toBe(0)
    expect((await loadDeckReviews(deck.id)).reviews).toEqual([])
  })
})
