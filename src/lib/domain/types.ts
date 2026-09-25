/** Domain types (02-DATA-MODEL §2). All dates are epoch milliseconds (UTC). */
export type SchedulerKind = 'fsrs' | 'leitner'
export type ModelType = 'basic' | 'basic_reverse' | 'cloze'

export interface FsrsSettings {
  /** 0.80–0.97 in the UI, default 0.90 (P9). */
  requestRetention: number
  /** Days, default 365 (echo of box 7 "every year"). */
  maximumInterval: number
  /** Default ['10m'] (P11: never '1m'). */
  learningSteps: string[]
  relearningSteps: string[]
  /** null = FSRS-6 defaults; otherwise 21 values. */
  params: number[] | null
  /** 4 buttons or 2 (Again/Good). */
  ratingMode: 4 | 2
}

export interface LeitnerSettings {
  mode: 'interval' | 'calendar'
  /** Days per box, default [1, 2, 7, 30, 90, 180, 365]. */
  intervals: number[]
  /** Default true (faithful to the booklet). */
  alternateSides: boolean
  /** Default true: "Sûr" button (+2 boxes). */
  allowSure: boolean
  /** Fixed in V0. */
  failToBox: 1
}

export interface DeckSettings {
  newPerDay: number
  reviewsPerDay: number
  newOrder: 'added' | 'random'
  typedAnswer: boolean
  autoplayAudio: boolean
  /** Default true: a single card per note and per day. */
  burySiblings: boolean
  fsrs: FsrsSettings
  leitner: LeitnerSettings
}

export interface Deck {
  id: string
  name: string
  description?: string
  parentId?: string | null
  emoji?: string
  scheduler: SchedulerKind
  settings: DeckSettings
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  deckId: string
  modelType: ModelType
  /** basic: [front, back, extra]; cloze: [text, extra]. */
  fields: string[]
  tags: string[]
  source?: string
  /** Anki guid on import (deduplication). */
  sourceGuid?: string
  createdAt: number
  updatedAt: number
}

/** New, Learning, Review, Relearning (same integers as ts-fsrs State). */
export type CardState = 0 | 1 | 2 | 3
export const CardStates = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const

export type Flag = 0 | 1 | 2 | 3 | 4

export interface Card {
  id: string
  noteId: string
  /** Denormalised copy of note.deckId for indexes. */
  deckId: string
  /** 0: front→back, 1: back→front, cloze: index - 1. */
  ord: number
  due: number
  state: CardState
  reps: number
  lapses: number
  lastReview: number | null
  suspended: boolean
  retired: boolean
  flag: Flag
  // FSRS
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  // Leitner
  /** 0 = not applicable / new, 1..7. */
  box: number
  /** Leitner alternateSides: true = asks back→front. */
  sideFlipped: boolean
  createdAt: number
}

/** Again, Hard, Good, Easy (same integers as ts-fsrs Rating). Leitner: 1 forgot, 3 ok, 4 sure. */
export type Rating = 1 | 2 | 3 | 4

export interface Review {
  id: string
  cardId: string
  deckId: string
  reviewedAt: number
  rating: Rating
  scheduler: SchedulerKind
  /** Capped at 60 000 for stats. */
  durationMs: number
  // Snapshot before answering (rollback and recomputation)
  stateBefore: CardState
  dueBefore: number
  stabilityBefore: number
  difficultyBefore: number
  boxBefore: number
  learningStepsBefore: number
  lastReviewBefore: number | null
  // Result
  stateAfter: CardState
  dueAfter: number
  scheduledDays: number
  elapsedDays: number
  boxAfter: number
}

export interface Media {
  /** Unique file name, e.g. "a1b2c3d4-drapeau-france.webp". */
  name: string
  blob: Blob
  mime: string
  size: number
  sha256: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}
