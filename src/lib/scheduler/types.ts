import type { Card, Deck, Rating, Review, SchedulerKind } from '../domain/types'

/** Result of answering a card: the new card and the review log row (03 §1). */
export interface SchedulerOutcome {
  card: Card
  review: Omit<Review, 'id' | 'durationMs'>
}

export interface PreviewItem {
  due: number
  /** Human label under the rating button ("4 j", "→ C3 · dans 7 j"). */
  label: string
  /** Leitner target box. */
  box?: number
}

/** Common interface of both schedulers (03-SCHEDULING §1). Every method is pure. */
export interface Scheduler {
  kind: SchedulerKind
  preview(card: Card, now: number, deck: Deck): Partial<Record<Rating, PreviewItem>>
  answer(card: Card, rating: Rating, now: number, deck: Deck): SchedulerOutcome
  /** Probability of recall now (0–1), or null when not modelled (Leitner). */
  retrievability(card: Card, now: number, deck: Deck): number | null
  ratings(deck: Deck): Rating[]
}

export interface SchedulerOptions {
  /** Local hour at which the study day starts (Leitner calendar mode). */
  dayStartHour: number
  /** FSRS fuzz; disabled in tests for determinism. */
  fuzz: boolean
}
