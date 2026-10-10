import type { Card, Deck, Rating } from '../domain/types'

/**
 * The side asked next (03 §1.1, both schedulers): with `alternateSides`, a success turns the card
 * over; a failure asks the same side again. Only basic notes are rendered turned over (notes.ts).
 */
export function flipAfter(card: Pick<Card, 'sideFlipped'>, rating: Rating, deck: Deck): boolean {
  const success = rating >= 2
  return success && deck.settings.alternateSides ? !card.sideFlipped : card.sideFlipped
}
