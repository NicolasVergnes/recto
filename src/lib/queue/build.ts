/**
 * Daily queue (03-SCHEDULING §5, srs-rules §4). Pure: every input is a parameter.
 * Order: learning due → overdue reviews → today's reviews, with new cards inserted every k items;
 * each batch in a stable random order (seed = study day); decks interleaved round-robin (P5);
 * caps per deck and global (P6), which keep the weakest overdue cards (lowest R / box).
 * Cards of a note are neither buried nor spaced (M13): the random order spreads them.
 */
import type { Card, CardState, Deck } from '../domain/types'
import { dayKey, dayStart, nextDayStart } from '../scheduler/day'
import { seededShuffle } from './random'

/** A review answered today (since the start of the study day). */
export interface TodayReview {
  cardId: string
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

const isLearning = (c: Card) => c.state === 1 || c.state === 3
const byId = (a: Card, b: Card) => (a.id < b.id ? -1 : 1)

/** A stable random order that does not depend on the input order. */
const shuffle = (cards: readonly Card[], seed: string) => seededShuffle([...cards].sort(byId), seed)

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

export function buildQueue(input: QueueInput): QueueResult {
  const { now, dayStartHour, decks } = input
  const todayStart = dayStart(now, dayStartHour)
  const dueLimit = nextDayStart(now, dayStartHour)
  const seed = dayKey(now, dayStartHour)
  const deckById = new Map(decks.map((d) => [d.id, d]))

  const newSeen = new Map<string, Set<string>>()
  const reviewsDone = new Map<string, number>()
  let reviewsDoneTotal = 0
  for (const r of input.todayReviews) {
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

  // 1. Learning cards due now, in random order; later ones are handed to the session.
  const learning = shuffle(
    eligible.filter((c) => isLearning(c) && c.due <= now),
    `${seed}:learning`,
  )
  const later = eligible
    .filter((c) => isLearning(c) && c.due > now && c.due < dueLimit)
    .sort((a, b) => a.due - b.due)
    .map((c) => ({ id: c.id, due: c.due }))

  // 2. Reviews per deck: overdue, then today's, each in random order. When the cap (P6) cuts,
  //    the overdue cards kept are the weakest: increasing R (FSRS) or box then due (Leitner).
  const reviewLists = decks.map((deck) => {
    const due = eligible.filter((c) => c.deckId === deck.id && c.state === 2 && c.due < dueLimit)
    const overdue =
      deck.scheduler === 'fsrs'
        ? due
            .filter((c) => c.due < todayStart)
            .map((c) => ({ c, r: input.retrievability(c, deck) ?? 0 }))
            .sort((a, b) => a.r - b.r || a.c.due - b.c.due || byId(a.c, b.c))
            .map((x) => x.c)
        : due
            .filter((c) => c.due < todayStart)
            .sort((a, b) => a.box - b.box || a.due - b.due || byId(a, b))
    const today = shuffle(
      due.filter((c) => c.due >= todayStart),
      `${seed}:${deck.id}`,
    )
    const cap = Math.max(0, deck.settings.reviewsPerDay - (reviewsDone.get(deck.id) ?? 0))
    const keptOverdue = overdue.slice(0, cap)
    return [
      ...shuffle(keptOverdue, `${seed}:overdue:${deck.id}`),
      ...today.slice(0, cap - keptOverdue.length),
    ]
  })
  const globalCap = Math.max(0, input.globalReviewsPerDay - reviewsDoneTotal)
  const reviews = roundRobin(reviewLists).slice(0, globalCap)

  // 3. New cards per deck, in the deck's order (random by default), capped by newPerDay minus
  //    those seen today.
  const newLists = decks.map((deck) => {
    const fresh = eligible
      .filter((c) => c.deckId === deck.id && c.state === 0)
      .sort((a, b) => a.createdAt - b.createdAt || a.ord - b.ord || byId(a, b))
    const ordered =
      deck.settings.newOrder === 'random' ? seededShuffle(fresh, `${seed}:new:${deck.id}`) : fresh
    const cap = Math.max(0, deck.settings.newPerDay - (newSeen.get(deck.id)?.size ?? 0))
    return ordered.slice(0, cap)
  })
  const news = roundRobin(newLists)

  const ordered = [...learning, ...interleaveNew(reviews, news)]
  return {
    ids: ordered.map((c) => c.id),
    later,
    counts: { learning: learning.length, review: reviews.length, new: news.length },
    dueLimit,
  }
}
