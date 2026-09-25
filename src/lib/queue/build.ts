/**
 * Daily queue (03-SCHEDULING §5, srs-rules §4). Pure: every input is a parameter.
 * Order: learning due → reviews (overdue by increasing R / box, then today's in stable random
 * order) with new cards inserted every k items; decks interleaved round-robin (P5); caps per
 * deck and global (P6); siblings buried or spaced.
 */
import type { Card, CardState, Deck } from '../domain/types'
import { dayKey, dayStart, nextDayStart } from '../scheduler/day'
import { seededShuffle } from './random'

/** A review answered today (since the start of the study day). */
export interface TodayReview {
  cardId: string
  noteId: string
  deckId: string
  stateBefore: CardState
}

export interface QueueInput {
  now: number
  dayStartHour: number
  /** Selected decks, in display order (round-robin order). */
  decks: readonly Deck[]
  /** Candidate cards of those decks; suspended/retired ones are filtered here. */
  cards: readonly Card[]
  todayReviews: readonly TodayReview[]
  globalReviewsPerDay: number
  /** FSRS retrievability, null when not modelled. */
  retrievability: (card: Card, deck: Deck) => number | null
}

export interface QueueCounts {
  learning: number
  review: number
  new: number
}

export interface QueueResult {
  ids: string[]
  /** Learning cards due later today, re-inserted by the session at their due time. */
  later: { id: string; due: number }[]
  counts: QueueCounts
  dueLimit: number
}

/** Minimum distance between two cards of the same note (03 §5.6). */
export const SIBLING_GAP = 10

const isLearning = (c: Card) => c.state === 1 || c.state === 3

function roundRobin<T>(lists: readonly T[][]): T[] {
  const out: T[] = []
  const max = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < max; i++)
    for (const list of lists) if (i < list.length) out.push(list[i] as T)
  return out
}

/** New cards spread every k reviews, k = round(reviews / news) (03 §5.6). */
export function interleaveNew<T>(reviews: readonly T[], news: readonly T[]): T[] {
  if (news.length === 0) return [...reviews]
  if (reviews.length === 0) return [...news]
  const k = Math.max(1, Math.round(reviews.length / news.length))
  const out: T[] = []
  let n = 0
  reviews.forEach((r, i) => {
    out.push(r)
    if ((i + 1) % k === 0 && n < news.length) out.push(news[n++] as T)
  })
  while (n < news.length) out.push(news[n++] as T)
  return out
}

/** Moves cards so that two cards of the same note are at least `gap` positions apart. */
export function spaceSiblings(cards: readonly Card[], gap = SIBLING_GAP): Card[] {
  const pending = [...cards]
  const out: Card[] = []
  const lastIndex = new Map<string, number>()
  const fits = (c: Card) => out.length - (lastIndex.get(c.noteId) ?? -gap) >= gap
  while (pending.length > 0) {
    // When no card can respect the gap (only siblings left), keep the order.
    const i = Math.max(0, pending.findIndex(fits))
    for (const card of pending.splice(i, 1)) {
      lastIndex.set(card.noteId, out.length)
      out.push(card)
    }
  }
  return out
}

export function buildQueue(input: QueueInput): QueueResult {
  const { now, dayStartHour, decks } = input
  const todayStart = dayStart(now, dayStartHour)
  const dueLimit = nextDayStart(now, dayStartHour)
  const seed = dayKey(now, dayStartHour)
  const deckById = new Map(decks.map((d) => [d.id, d]))

  const answeredByNote = new Map<string, Set<string>>()
  const newSeen = new Map<string, Set<string>>()
  const reviewsDone = new Map<string, number>()
  let reviewsDoneTotal = 0
  for (const r of input.todayReviews) {
    let set = answeredByNote.get(r.noteId)
    if (!set) answeredByNote.set(r.noteId, (set = new Set()))
    set.add(r.cardId)
    if (r.stateBefore === 0) {
      let seen = newSeen.get(r.deckId)
      if (!seen) newSeen.set(r.deckId, (seen = new Set()))
      seen.add(r.cardId)
    } else if (r.stateBefore === 2) {
      reviewsDone.set(r.deckId, (reviewsDone.get(r.deckId) ?? 0) + 1)
      reviewsDoneTotal++
    }
  }

  const eligible = input.cards.filter((c) => deckById.has(c.deckId) && !c.suspended && !c.retired)
  const buryDecks = new Set(decks.filter((d) => d.settings.burySiblings).map((d) => d.id))
  const bury = (c: Card) => buryDecks.has(c.deckId)
  // Burying (03 §5.2): a sibling was already answered today.
  const siblingAnswered = (c: Card) =>
    [...(answeredByNote.get(c.noteId) ?? [])].some((id) => id !== c.id)

  // 1. Learning cards due now, by due date; later ones are handed to the session.
  const learning = eligible
    .filter((c) => isLearning(c) && c.due <= now)
    .sort((a, b) => a.due - b.due)
  const later = eligible
    .filter((c) => isLearning(c) && c.due > now && c.due < dueLimit)
    .sort((a, b) => a.due - b.due)
    .map((c) => ({ id: c.id, due: c.due }))

  // One card per note and per day when burying (learning cards keep their slot).
  const usedNotes = new Set(learning.map((c) => c.noteId))
  const take = (c: Card) => {
    if (!bury(c)) return true
    if (siblingAnswered(c) || usedNotes.has(c.noteId)) return false
    usedNotes.add(c.noteId)
    return true
  }

  // 2. Reviews per deck: overdue first by increasing R (FSRS) or box then due (Leitner),
  //    then today's in a stable random order; capped per deck (P6).
  const reviewLists = decks.map((deck) => {
    const due = eligible.filter((c) => c.deckId === deck.id && c.state === 2 && c.due < dueLimit)
    const overdue =
      deck.scheduler === 'fsrs'
        ? due
            .filter((c) => c.due < todayStart)
            .map((c) => ({ c, r: input.retrievability(c, deck) ?? 0 }))
            .sort((a, b) => a.r - b.r || a.c.due - b.c.due)
            .map((x) => x.c)
        : due.filter((c) => c.due < todayStart).sort((a, b) => a.box - b.box || a.due - b.due)
    const today = seededShuffle(
      due.filter((c) => c.due >= todayStart).sort((a, b) => (a.id < b.id ? -1 : 1)),
      `${seed}:${deck.id}`,
    )
    const cap = Math.max(0, deck.settings.reviewsPerDay - (reviewsDone.get(deck.id) ?? 0))
    const out: Card[] = []
    for (const c of [...overdue, ...today]) {
      if (out.length >= cap) break
      if (take(c)) out.push(c)
    }
    return out
  })
  const globalCap = Math.max(0, input.globalReviewsPerDay - reviewsDoneTotal)
  const reviews = roundRobin(reviewLists).slice(0, globalCap)

  // 3. New cards per deck, in the deck's order, capped by newPerDay minus those seen today.
  const newLists = decks.map((deck) => {
    const fresh = eligible
      .filter((c) => c.deckId === deck.id && c.state === 0)
      .sort((a, b) => a.createdAt - b.createdAt || a.ord - b.ord || (a.id < b.id ? -1 : 1))
    const ordered =
      deck.settings.newOrder === 'random' ? seededShuffle(fresh, `${seed}:new:${deck.id}`) : fresh
    const cap = Math.max(0, deck.settings.newPerDay - (newSeen.get(deck.id)?.size ?? 0))
    const out: Card[] = []
    for (const c of ordered) {
      if (out.length >= cap) break
      if (take(c)) out.push(c)
    }
    return out
  })
  const news = roundRobin(newLists)

  const ordered = spaceSiblings([...learning, ...interleaveNew(reviews, news)])
  return {
    ids: ordered.map((c) => c.id),
    later,
    counts: { learning: learning.length, review: reviews.length, new: news.length },
    dueLimit,
  }
}
