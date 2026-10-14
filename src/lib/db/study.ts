/**
 * Reviewing on top of the repository: loads the daily queue, records answers atomically,
 * undoes the last answer, retires/suspends/flags cards, switches a deck's scheduler.
 */
import { convertCard } from '../scheduler/convert'
import { canRetire } from '../scheduler/retire'
import { getScheduler, type SchedulerOutcome } from '../scheduler'
import { dayStart, nextDayStart } from '../scheduler/day'
import { buildQueue, type QueueCounts, type QueueResult, type TodayReview } from '../queue/build'
import type { Card, Deck, Review, SchedulerKind } from '../domain/types'
import { deckTree } from '../domain/decks'
import { cardFormat, type CardFormat } from '../domain/formats'
import { recordDeletions } from './deletions'
import { RepoError } from './errors'
import { db, newId } from './schema'
import { getSetting } from './settings'

export const MAX_DURATION_MS = 60_000

/** One answer = one transaction: the card and its review log row (SPEC §6). */
export async function recordReview(outcome: SchedulerOutcome, durationMs: number): Promise<Review> {
  const review: Review = {
    ...outcome.review,
    id: newId(),
    durationMs: Math.max(0, Math.min(Math.round(durationMs), MAX_DURATION_MS)),
  }
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(outcome.card)
    await db.reviews.add(review)
  })
  return review
}

/**
 * Undo (04-UI §2.2): restores the card snapshot taken before the answer and deletes that single
 * review row — the only deletion of a log row besides explicit card/note deletion (invariant 3).
 * A card deleted since (its cloze or mask removed while editing) is not brought back
 * (invariant 2); a card whose note moved keeps its new deck (invariant 1) and one whose template
 * moved in the note type editor keeps its new `ord` (M10). Returns the card.
 */
export async function undoReview(previous: Card, reviewId: string, now: number): Promise<Card> {
  return db.transaction('rw', db.cards, db.reviews, db.deletions, async () => {
    const row = await db.reviews.get(reviewId)
    if (!row || row.cardId !== previous.id) throw new RepoError('noteNotFound')
    const current = await db.cards.get(previous.id)
    if (!current) throw new RepoError('undoGone')
    // The schedule of before the answer, dated now: undoing is a change (M12, merges).
    const restored: Card = { ...previous, deckId: current.deckId, ord: current.ord, updatedAt: now }
    await db.cards.put(restored)
    await db.reviews.delete(reviewId)
    await recordDeletions('reviews', [reviewId], now)
    return restored
  })
}

export function cardReviews(cardId: string): Promise<Review[]> {
  return db.reviews
    .where('[cardId+reviewedAt]')
    .between([cardId, -Infinity], [cardId, Infinity])
    .toArray()
}

/** P7: retiring requires three spaced successes; un-retiring is always possible. */
export async function setRetired(cardId: string, retired: boolean, now: number): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new RepoError('noteNotFound')
    if (retired && !canRetire(card, await cardReviews(cardId))) throw new RepoError('retireLocked')
    await db.cards.update(cardId, { retired, updatedAt: now })
  })
}

/** Decks included when studying `deckId`: the deck and its sub-decks; all decks otherwise. */
export function studyDecks(decks: readonly Deck[], deckId?: string): Deck[] {
  const ordered = deckTree(decks).flatMap((n) => [n.deck, ...n.children])
  if (!deckId) return ordered
  return ordered.filter((d) => d.id === deckId || d.parentId === deckId)
}

export interface TodayQueue {
  result: QueueResult
  decks: Deck[]
  cards: Map<string, Card>
  dayStartHour: number
}

/**
 * The formats of the new candidate cards (M17), read from their notes, only when a deck of the
 * session pauses formats or brings them in format after format: otherwise no note is read.
 */
async function newCardFormats(
  decks: readonly Deck[],
  candidates: readonly Card[],
): Promise<((card: Card) => CardFormat | undefined) | undefined> {
  const used = decks.some((d) => d.settings.pausedFormats.length > 0 || d.settings.newByFormat)
  if (!used) return undefined
  const noteIds = [...new Set(candidates.filter((c) => c.state === 0).map((c) => c.noteId))]
  const notes = new Map(
    (await db.notes.bulkGet(noteIds)).flatMap((n) => (n ? [[n.id, n] as const] : [])),
  )
  return (card) => {
    const note = notes.get(card.noteId)
    return note ? cardFormat(note, card) : undefined
  }
}

/** Loads candidates with indexed queries and builds the daily queue (03 §5). */
export async function loadTodayQueue(now: number, deckId?: string): Promise<TodayQueue> {
  const [allDecks, dayStartHour, globalReviewsPerDay] = await Promise.all([
    db.decks.toArray(),
    getSetting('dayStartHour'),
    getSetting('globalReviewsPerDay'),
  ])
  const decks = studyDecks(allDecks, deckId)
  const deckIds = new Set(decks.map((d) => d.id))
  const dueLimit = nextDayStart(now, dayStartHour)
  // New cards are due at their creation date, so one range query covers every candidate.
  const candidates = (await db.cards.where('due').below(dueLimit).toArray()).filter((c) =>
    deckIds.has(c.deckId),
  )
  const reviews = await db.reviews
    .where('reviewedAt')
    .aboveOrEqual(dayStart(now, dayStartHour))
    .toArray()
  const todayReviews: TodayReview[] = reviews.map((r) => ({
    cardId: r.cardId,
    deckId: r.deckId,
    stateBefore: r.stateBefore,
  }))
  const schedulers = {
    fsrs: getScheduler('fsrs', { dayStartHour }),
    leitner: getScheduler('leitner', { dayStartHour }),
  }
  const formatOf = await newCardFormats(decks, candidates)
  const result = buildQueue({
    now,
    dayStartHour,
    decks,
    cards: candidates,
    todayReviews,
    globalReviewsPerDay,
    retrievability: (card, deck) => schedulers[deck.scheduler].retrievability(card, now, deck),
    ...(formatOf ? { formatOf } : {}),
  })
  // Cards the session may show: the queue and the later learning cards.
  const wanted = new Set([...result.ids, ...result.later.map((l) => l.id)])
  const cards = new Map(candidates.filter((c) => wanted.has(c.id)).map((c) => [c.id, c]))
  return { result, decks, cards, dayStartHour }
}

/** Per-deck counts of a queue (home screen), sub-deck counts added to their parent. */
export function countsByDeck(queue: TodayQueue): Map<string, QueueCounts> {
  const out = new Map<string, QueueCounts>()
  const parentOf = new Map(queue.decks.map((d) => [d.id, d.parentId ?? null]))
  const bump = (deckId: string, card: Card) => {
    let c = out.get(deckId)
    if (!c) out.set(deckId, (c = { learning: 0, review: 0, new: 0 }))
    if (card.state === 0) c.new++
    else if (card.state === 2) c.review++
    else c.learning++
  }
  for (const id of queue.result.ids) {
    const card = queue.cards.get(id)
    if (!card) continue
    bump(card.deckId, card)
    const parent = parentOf.get(card.deckId)
    if (parent) bump(parent, card)
  }
  return out
}

/**
 * Changes a deck's scheduler (03 §4) in a single transaction. Leitner → FSRS replays each
 * card's history (the log is kept); FSRS → Leitner derives the box.
 */
export async function switchScheduler(
  deckId: string,
  to: SchedulerKind,
  now: number,
): Promise<number> {
  return db.transaction('rw', db.decks, db.cards, db.reviews, async () => {
    const deck = await db.decks.get(deckId)
    if (!deck) throw new RepoError('deckNotFound')
    if (deck.scheduler === to) return 0
    const target: Deck = { ...deck, scheduler: to, updatedAt: now }
    const cards = await db.cards.where('deckId').equals(deckId).toArray()
    const history = new Map<string, Review[]>()
    if (to === 'fsrs') {
      const rows = await db.reviews
        .where('cardId')
        .anyOf(cards.map((c) => c.id))
        .toArray()
      for (const r of rows) history.set(r.cardId, [...(history.get(r.cardId) ?? []), r])
    }
    const converted = cards.map((card) =>
      convertCard(card, to, target, history.get(card.id) ?? [], now),
    )
    await db.cards.bulkPut(converted)
    await db.decks.put(target)
    return converted.length
  })
}

/** Data of the statistics screen: cards and review log of a deck (with sub-decks) or all. */
export async function loadStatsData(now: number, deckId?: string) {
  const [allDecks, dayStartHour] = await Promise.all([
    db.decks.toArray(),
    getSetting('dayStartHour'),
  ])
  const decks = studyDecks(allDecks, deckId)
  const ids = new Set(decks.map((d) => d.id))
  const cards = deckId
    ? await db.cards
        .where('deckId')
        .anyOf([...ids])
        .toArray()
    : await db.cards.toArray()
  const cardIds = new Set(cards.map((c) => c.id))
  // One year of history is enough for the heatmap and retention windows.
  const since = now - 366 * 86_400_000
  const reviews = (await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray()).filter(
    (r) => !deckId || cardIds.has(r.cardId),
  )
  const queue = await loadTodayQueue(now, deckId)
  return { decks, cards, reviews, dayStartHour, today: queue.result.counts }
}
