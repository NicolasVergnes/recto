import type { Card, Deck, Note, Rating } from '../domain/types'
import type { SessionQueue } from '../queue/session'

/** Snapshot needed to undo the last answer (card before, log row, queue before). */
export interface UndoEntry {
  previous: Card
  reviewId: string
  queue: SessionQueue
  rating: Rating
  durationMs: number
}

export interface SessionStats {
  answers: number
  again: number
  totalMs: number
  startedAt: number
}

/**
 * The running review session lives outside the screen so that editing a card (E) and coming
 * back resumes it (svelte5-conventions §2: in-memory queue, not reactive queries).
 */
export interface ActiveSession {
  key: string
  deckId: string | undefined
  queue: SessionQueue
  cards: Map<string, Card>
  notes: Map<string, Note>
  decks: Map<string, Deck>
  dueLimit: number
  dayStartHour: number
  stats: SessionStats
  undo: UndoEntry[]
}

export const session = $state<{ active: ActiveSession | null }>({ active: null })

export function endSession(): void {
  session.active = null
}
