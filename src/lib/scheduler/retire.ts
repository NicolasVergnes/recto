import type { Card, Review } from '../domain/types'

export const RETIRE_MIN_SUCCESSES = 3
export const RETIRE_MIN_SPACING_DAYS = 7

/**
 * P7 (Kornell & Bjork 2008; Karpicke & Roediger 2008): a card may be retired only once it is in
 * Review and has at least 3 successes (rating ≥ 3) each coming after an interval of ≥ 7 days.
 */
export function canRetire(
  card: Pick<Card, 'state'>,
  reviews: readonly Pick<Review, 'rating' | 'elapsedDays'>[],
): boolean {
  if (card.state !== 2) return false
  const spacedSuccesses = reviews.filter(
    (r) => r.rating >= 3 && r.elapsedDays >= RETIRE_MIN_SPACING_DAYS,
  ).length
  return spacedSuccesses >= RETIRE_MIN_SUCCESSES
}
