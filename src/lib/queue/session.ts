/**
 * In-memory session queue (03 §5.7): learning cards come back at their due time without
 * rebuilding the whole queue; failed Leitner cards come back ≥ 10 cards later (03 §3.4).
 */
import type { CardState } from '../domain/types'

export const REINSERT_GAP = 10

export interface SessionQueue {
  ids: string[]
  later: { id: string; due: number }[]
}

/** Moves learning cards whose due time has come to the head of the queue. */
export function takeDue(q: SessionQueue, now: number): SessionQueue {
  const ready = q.later.filter((l) => l.due <= now)
  if (ready.length === 0) return q
  return {
    ids: [...ready.map((l) => l.id), ...q.ids.filter((id) => !ready.some((l) => l.id === id))],
    later: q.later.filter((l) => l.due > now),
  }
}

export function currentId(q: SessionQueue): string | undefined {
  return q.ids[0]
}

export function removeCard(q: SessionQueue, id: string): SessionQueue {
  return { ids: q.ids.filter((x) => x !== id), later: q.later.filter((l) => l.id !== id) }
}

/** After an answer: the card leaves the head; a (re)learning card due today comes back. */
export function afterAnswer(
  q: SessionQueue,
  id: string,
  next: { state: CardState; due: number },
  now: number,
  dueLimit: number,
): SessionQueue {
  const rest = removeCard(q, id)
  if ((next.state === 1 || next.state === 3) && next.due < dueLimit) {
    if (next.due <= now) {
      const ids = [...rest.ids]
      ids.splice(Math.min(REINSERT_GAP, ids.length), 0, id)
      return { ids, later: rest.later }
    }
    const later = [...rest.later, { id, due: next.due }].sort((a, b) => a.due - b.due)
    return { ids: rest.ids, later }
  }
  return rest
}

/** Undo: the card is shown again first. */
export function putBack(q: SessionQueue, id: string): SessionQueue {
  const rest = removeCard(q, id)
  return { ids: [id, ...rest.ids], later: rest.later }
}

export function nextLaterDue(q: SessionQueue): number | null {
  return q.later[0]?.due ?? null
}
