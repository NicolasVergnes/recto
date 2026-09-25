import { describe, expect, it } from 'vitest'
import { deckReviewCounts, loadDeckReviews } from '$lib/db/optimize'
import * as repo from '$lib/db/repo'
import { setSetting } from '$lib/db/settings'
import { recordReview } from '$lib/db/study'
import type { Deck } from '$lib/domain/types'
import { getScheduler } from '$lib/scheduler'
import { paris } from '../../helpers/fixtures'
import { useTestDatabase } from '../../helpers/db'

useTestDatabase()
const now = paris('2026-09-25T08:00:00Z')
const fsrs = getScheduler('fsrs', { fuzz: false })

const DAY = 86_400_000

/** Answers Good to a new card of the deck, or to one imported as already known. */
async function answerCard(deck: Deck, answers: number, spacing = DAY, imported = false) {
  const { cards } = await repo.createNote(
    { deckId: deck.id, modelType: 'basic', fields: ['q', 'a'], tags: [] },
    now,
  )
  let card = cards[0]
  // Like an Anki card imported without its history: a review card, no answer while new.
  if (card && imported) card = { ...card, state: 2, stability: 10, difficulty: 5, lastReview: now }
  for (let i = 0; card && i < answers; i++) {
    const outcome = fsrs.answer(card, 3, now + DAY + i * spacing, deck)
    await recordReview(outcome, 1000)
    card = outcome.card
  }
}

async function deckWithAnswers(name: string, parentId: string | null, answers: number) {
  const deck = await repo.createDeck({ name, parentId, scheduler: 'fsrs' }, now)
  await answerCard(deck, answers)
  return deck
}

describe('deck review log for the optimizer', () => {
  it('counts and loads the answers of the deck’s own cards only', async () => {
    const parent = await deckWithAnswers('Parent', null, 3)
    await deckWithAnswers('Child', parent.id, 2)
    await setSetting('dayStartHour', 5)
    expect(await deckReviewCounts(parent.id)).toEqual({ total: 3, usable: 3 })
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

  it('tells apart the answers the optimizer cannot learn from', async () => {
    const deck = await deckWithAnswers('Anki', null, 3)
    await answerCard(deck, 4, DAY, true)
    // Learnt on a single day: no delay to learn from.
    await answerCard(deck, 2, 10 * 60_000)
    expect(await deckReviewCounts(deck.id)).toEqual({ total: 9, usable: 3 })
  })

  it('returns nothing for an empty deck', async () => {
    const deck = await repo.createDeck({ name: 'Vide', scheduler: 'fsrs' }, now)
    expect(await deckReviewCounts(deck.id)).toEqual({ total: 0, usable: 0 })
    expect((await loadDeckReviews(deck.id)).reviews).toEqual([])
  })
})
