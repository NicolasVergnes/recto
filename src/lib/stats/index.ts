/**
 * Statistics (SPEC §5.6): pure computations over cards and the review log.
 * Dates are study days (dayStartHour, local time); `now` is always a parameter.
 */
import { cardStatus, type CardStatus } from '../domain/browse'
import type { Card, Deck, Review } from '../domain/types'
import { addDays, dayKey, dayStart, startOfDate, studyDate } from '../scheduler/day'

export const MAX_STAT_DURATION_MS = 60_000

export interface TodayStats {
  done: number
  timeMs: number
  /** Share of answers other than Again, null without answers. */
  successRate: number | null
}

export function todayStats(
  reviews: readonly Review[],
  now: number,
  dayStartHour: number,
): TodayStats {
  const start = dayStart(now, dayStartHour)
  const today = reviews.filter((r) => r.reviewedAt >= start && r.reviewedAt <= now)
  const success = today.filter((r) => r.rating !== 1).length
  return {
    done: today.length,
    timeMs: today.reduce((s, r) => s + Math.min(r.durationMs, MAX_STAT_DURATION_MS), 0),
    successRate: today.length === 0 ? null : success / today.length,
  }
}

/**
 * Cards due per study day over `days` days (index 0 = today, overdue included). New,
 * suspended and retired cards are not forecast.
 */
export function forecast(
  cards: readonly Card[],
  now: number,
  dayStartHour: number,
  days = 30,
): number[] {
  const out = new Array<number>(days).fill(0)
  const today = studyDate(now, dayStartHour)
  const limits = Array.from({ length: days }, (_, i) => startOfDate(today, dayStartHour, i + 1))
  for (const card of cards) {
    if (card.state === 0 || card.suspended || card.retired) continue
    const index = limits.findIndex((limit) => card.due < limit)
    if (index !== -1) out[index] = (out[index] ?? 0) + 1
  }
  return out
}

export interface Retention {
  days: number
  /** Share of Review-state answers not rated Again (« true retention »), null without data. */
  rate: number | null
  count: number
}

/** SPEC §5.6: only answers given in Review state count (re-presentations excluded, 03 §3.4). */
export function trueRetention(
  reviews: readonly Review[],
  now: number,
  dayStartHour: number,
  days: number,
): Retention {
  const from = startOfDate(studyDate(now, dayStartHour), dayStartHour, -(days - 1))
  const scope = reviews.filter(
    (r) => r.stateBefore === 2 && r.reviewedAt >= from && r.reviewedAt <= now,
  )
  const kept = scope.filter((r) => r.rating !== 1).length
  return { days, rate: scope.length === 0 ? null : kept / scope.length, count: scope.length }
}

/** Average FSRS target retention of the decks (weighted by their cards), null if none. */
export function targetRetention(decks: readonly Deck[], cards: readonly Card[]): number | null {
  const counts = new Map<string, number>()
  for (const c of cards) counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1)
  let total = 0
  let weight = 0
  for (const deck of decks) {
    if (deck.scheduler !== 'fsrs') continue
    const n = counts.get(deck.id) ?? 0
    total += deck.settings.fsrs.requestRetention * n
    weight += n
  }
  return weight === 0 ? null : total / weight
}

export interface HeatDay {
  key: string
  /** 0 = Monday … 6 = Sunday (French weeks). */
  weekday: number
  count: number
}

/** Reviews per study day over the last `days` days, oldest first (SPEC §5.6 heatmap). */
export function heatmap(
  reviews: readonly Review[],
  now: number,
  dayStartHour: number,
  days = 365,
): HeatDay[] {
  const counts = new Map<string, number>()
  const from = startOfDate(studyDate(now, dayStartHour), dayStartHour, -(days - 1))
  for (const r of reviews) {
    if (r.reviewedAt < from || r.reviewedAt > now) continue
    const key = dayKey(r.reviewedAt, dayStartHour)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const today = studyDate(now, dayStartHour)
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1))
    const key = `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
    return { key, weekday: (date.weekday + 6) % 7, count: counts.get(key) ?? 0 }
  })
}

/** Heatmap level 0–4: 0 = none, 1–4 = quartiles of the busiest day. */
export function heatLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}

export type StateCounts = Record<CardStatus, number>

export function stateDistribution(cards: readonly Card[]): StateCounts {
  const out: StateCounts = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    suspended: 0,
    retired: 0,
  }
  for (const card of cards) out[cardStatus(card)]++
  return out
}

/** Cards per Leitner box 1–7 (index 0 = C1), for cards of Memory Box decks. */
export function boxDistribution(cards: readonly Card[], decks: readonly Deck[]): number[] {
  const leitner = new Set(decks.filter((d) => d.scheduler === 'leitner').map((d) => d.id))
  const out = new Array<number>(7).fill(0)
  for (const card of cards) {
    if (!leitner.has(card.deckId) || card.box < 1 || card.suspended || card.retired) continue
    const i = Math.min(7, card.box) - 1
    out[i] = (out[i] ?? 0) + 1
  }
  return out
}
