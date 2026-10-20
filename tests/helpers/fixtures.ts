import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Deck, DeckSettings, Review } from '$lib/domain/types'

export const paris = (iso: string) => new Date(iso).getTime()

type SettingsPatch = Partial<Omit<DeckSettings, 'fsrs' | 'leitner'>> & {
  fsrs?: Partial<DeckSettings['fsrs']>
  leitner?: Partial<DeckSettings['leitner']>
}

export function deck(
  id: string,
  scheduler: Deck['scheduler'] = 'fsrs',
  patch: SettingsPatch = {},
  createdAt = paris('2026-01-10T10:00:00Z'),
): Deck {
  const model = scheduler === 'fsrs' ? 'fsrs' : 'seven'
  const d = makeDeck({ name: id, model: { model, custom: [] } }, id, createdAt)
  const { fsrs, leitner, ...rest } = patch
  d.settings = {
    ...d.settings,
    ...rest,
    fsrs: { ...d.settings.fsrs, ...fsrs },
    leitner: { ...d.settings.leitner, ...leitner },
  }
  return d
}

export function card(
  id: string,
  patch: Partial<Card> = {},
  noteId = `n-${id}`,
  deckId = 'd1',
): Card {
  return { ...makeCard({ id: noteId, deckId }, 0, id, paris('2026-01-10T10:00:00Z')), ...patch }
}

/** A review log row of `card` (a first answer, Good), for tests that only count or move rows. */
export function review(id: string, card: Pick<Card, 'id' | 'deckId'>, reviewedAt = 1000): Review {
  return {
    id,
    cardId: card.id,
    deckId: card.deckId,
    reviewedAt,
    rating: 3,
    scheduler: 'fsrs',
    durationMs: 3000,
    stateBefore: 0,
    dueBefore: reviewedAt,
    stabilityBefore: 0,
    difficultyBefore: 0,
    boxBefore: 0,
    learningStepsBefore: 0,
    lastReviewBefore: null,
    stateAfter: 1,
    dueAfter: reviewedAt,
    scheduledDays: 0,
    elapsedDays: 0,
    boxAfter: 0,
  }
}
