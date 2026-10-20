import { boxFromStability } from '../domain/leitner'
import type { Card, Deck, Review, SchedulerKind } from '../domain/types'
import { rescheduleFromHistory } from './fsrs'

/**
 * Converts a card when its deck changes scheduler (03 §4). Pure; the caller writes all cards in
 * one transaction.
 */
export function convertCard(
  card: Card,
  to: SchedulerKind,
  deck: Deck,
  history: readonly Pick<Review, 'rating' | 'reviewedAt'>[],
  now: number,
  fuzz = true,
): Card {
  if (to === 'fsrs') {
    const out = rescheduleFromHistory(card, history, deck.settings.fsrs, now, fuzz)
    return {
      ...out,
      suspended: card.suspended,
      retired: card.retired,
      flag: card.flag,
      updatedAt: now,
    }
  }
  // FSRS → Leitner: box from stability in the deck's box (approximation), due kept.
  const box =
    card.state === 0 ? 0 : boxFromStability(card.stability, deck.settings.leitner.intervals)
  return { ...card, box, updatedAt: now }
}
