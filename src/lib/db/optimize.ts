/**
 * Review log of a deck for the FSRS optimizer (03 §2.4): the answers given to the cards now in
 * the deck — its own cards only, since each sub-deck has its own settings.
 */
import { usableReviewCount, type TrainingReview } from '../scheduler/optimizer'
import { db } from './schema'
import { getSetting } from './settings'

export async function loadDeckReviews(
  deckId: string,
): Promise<{ reviews: TrainingReview[]; dayStartHour: number }> {
  const [ids, dayStartHour] = await Promise.all([
    db.cards.where('deckId').equals(deckId).primaryKeys(),
    getSetting('dayStartHour'),
  ])
  const rows = await db.reviews.where('cardId').anyOf(ids).toArray()
  const reviews = rows.map(({ id, cardId, reviewedAt, rating, stateBefore }) => ({
    id,
    cardId,
    reviewedAt,
    rating,
    stateBefore,
  }))
  return { reviews, dayStartHour }
}

/**
 * All the answers of the deck's cards, and those the optimizer can learn from (the threshold is
 * on the latter: an Anki import without history or a reset leaves answers it cannot use).
 */
export async function deckReviewCounts(deckId: string): Promise<{ total: number; usable: number }> {
  const { reviews, dayStartHour } = await loadDeckReviews(deckId)
  return { total: reviews.length, usable: usableReviewCount(reviews, dayStartHour) }
}
