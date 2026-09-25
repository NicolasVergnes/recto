import { SvelteMap } from 'svelte/reactivity'
import * as repo from '../db/repo'
import { getSetting } from '../db/settings'
import { loadTodayQueue } from '../db/study'
import type { Card, Deck, Note, Rating } from '../domain/types'
import { removeCard, type SessionQueue } from '../queue/session'
import { dayKey } from '../scheduler/day'

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

/**
 * Today's session for a deck (or all decks): the running one when it has cards left (coming
 * back from the editor, reloaded), otherwise a new one. The caller installs it in `session`.
 */
export async function loadSession(deckId: string | undefined, t0: number): Promise<ActiveSession> {
  const hour = await getSetting('dayStartHour')
  const key = `${deckId ?? '*'}:${dayKey(t0, hour)}`
  const active = session.active
  if (active && active.key === key && active.queue.ids.length + active.queue.later.length > 0) {
    await reload(active)
    return active
  }
  const q = await loadTodayQueue(t0, deckId)
  const notes = await notesOf(q.cards.values())
  return {
    key,
    deckId,
    queue: { ids: q.result.ids, later: q.result.later },
    cards: new SvelteMap(q.cards),
    notes: new SvelteMap(notes.map((n) => [n.id, n])),
    decks: new SvelteMap(q.decks.map((d) => [d.id, d])),
    dueLimit: q.result.dueLimit,
    dayStartHour: q.dayStartHour,
    stats: { answers: 0, again: 0, totalMs: 0, startedAt: t0 },
    undo: [],
  }
}

/** After editing a card elsewhere: reload the session's cards, notes and decks. */
async function reload(active: ActiveSession): Promise<void> {
  const ids = [...active.queue.ids, ...active.queue.later.map((l) => l.id)]
  const cards = (await repo.getCards(ids)).filter((c) => !c.suspended && !c.retired)
  const notes = await notesOf(cards)
  const decks = await repo.listDecks()
  const alive = new Set(cards.map((c) => c.id))
  let queue = active.queue
  for (const id of ids) if (!alive.has(id)) queue = removeCard(queue, id)
  active.queue = queue
  active.cards = new SvelteMap(cards.map((c) => [c.id, c]))
  active.notes = new SvelteMap(notes.map((n) => [n.id, n]))
  active.decks = new SvelteMap(decks.map((d) => [d.id, d]))
}

/** The notes of these cards, each read once. */
function notesOf(cards: Iterable<Card>): Promise<Note[]> {
  return repo.getNotes([...new Set(Array.from(cards, (c) => c.noteId))])
}
