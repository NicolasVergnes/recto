import type { Card, Deck, DeckSettings, Note, SchedulerKind } from './types'

export const DEFAULT_LEITNER_INTERVALS = [1, 2, 7, 30, 90, 180, 365] as const

export function defaultDeckSettings(): DeckSettings {
  return {
    newPerDay: 20,
    reviewsPerDay: 200,
    newOrder: 'added',
    typedAnswer: false,
    autoplayAudio: true,
    burySiblings: true,
    fsrs: {
      requestRetention: 0.9,
      maximumInterval: 365,
      // P11 with ts-fsrs step semantics: Good on a new card → 10 min, then graduation (≥ 1 day).
      learningSteps: ['10m', '10m'],
      relearningSteps: ['10m'],
      params: null,
      ratingMode: 4,
    },
    leitner: {
      mode: 'interval',
      intervals: [...DEFAULT_LEITNER_INTERVALS],
      alternateSides: true,
      allowSure: true,
      failToBox: 1,
    },
  }
}

export interface NewDeckInput {
  name: string
  parentId?: string | null
  description?: string
  emoji?: string
  scheduler?: SchedulerKind
}

export function makeDeck(input: NewDeckInput, id: string, now: number): Deck {
  const deck: Deck = {
    id,
    name: input.name.trim(),
    parentId: input.parentId ?? null,
    scheduler: input.scheduler ?? 'fsrs',
    settings: defaultDeckSettings(),
    createdAt: now,
    updatedAt: now,
  }
  if (input.description) deck.description = input.description
  if (input.emoji) deck.emoji = input.emoji
  return deck
}

/** A brand-new card: state New, due at creation time (02-DATA-MODEL §2). */
export function makeCard(
  note: Pick<Note, 'id' | 'deckId'>,
  ord: number,
  id: string,
  now: number,
): Card {
  return {
    id,
    noteId: note.id,
    deckId: note.deckId,
    ord,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    suspended: false,
    retired: false,
    flag: 0,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    box: 0,
    sideFlipped: false,
    createdAt: now,
  }
}

/** Scheduling fields of a new card, used by "reset scheduling" (keeps the review log). */
export function resetScheduling(card: Card, now: number): Card {
  return {
    ...card,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    retired: false,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    box: 0,
    sideFlipped: false,
  }
}
