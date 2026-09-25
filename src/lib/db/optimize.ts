/**
 * Review log of a deck for the FSRS optimizer (03 §2.4): the answers given to the cards now in
 * the deck — its own cards only, since each sub-deck has its own settings.
 */
import type { TrainingReview } from '../scheduler/optimizer'
import { db } from './schema'
import { getSetting } from './settings'

async function deckCardIds(deckId: string): Promise<string[]> {
  return db.cards.where('deckId').equals(deckId).primaryKeys()
}

export async function countDeckReviews(deckId: string): Promise<number> {
  return db.reviews
    .where('cardId')
    .anyOf(await deckCardIds(deckId))
    .count()
}

export async function loadDeckReviews(
  deckId: string,
): Promise<{ reviews: TrainingReview[]; dayStartHour: number }> {
  const [ids, dayStartHour] = await Promise.all([deckCardIds(deckId), getSetting('dayStartHour')])
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
