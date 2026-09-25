import { describe, expect, it } from 'vitest'
import type { Review } from '$lib/domain/types'
import {
  boxDistribution,
  forecast,
  heatLevel,
  heatmap,
  stateDistribution,
  targetRetention,
  todayStats,
  trueRetention,
} from '$lib/stats'
import { card, deck, paris } from '../helpers/fixtures'

const DAY = 86_400_000
const now = paris('2026-09-25T08:00:00Z') // Friday 10:00 local

function review(
  at: number,
  rating: Review['rating'],
  stateBefore: Review['stateBefore'] = 2,
  durationMs = 5000,
): Review {
  return {
    id: `${at}-${rating}-${Math.random()}`,
    cardId: 'c',
    deckId: 'd1',
    reviewedAt: at,
    rating,
    scheduler: 'fsrs',
    durationMs,
    stateBefore,
    dueBefore: 0,
    stabilityBefore: 0,
    difficultyBefore: 0,
    boxBefore: 0,
    learningStepsBefore: 0,
    lastReviewBefore: null,
    stateAfter: 2,
    dueAfter: 0,
    scheduledDays: 0,
    elapsedDays: 0,
    boxAfter: 0,
  }
}

describe('statistics (SPEC §5.6)', () => {
  it('computes today: answers, capped time, success rate', () => {
    const reviews = [
      review(now - 3600_000, 3),
      review(now - 7200_000, 1, 0, 90_000),
      review(now - DAY, 3),
      review(paris('2026-09-25T01:00:00Z'), 3),
    ]
    expect(todayStats(reviews, now, 4)).toEqual({ done: 2, timeMs: 65_000, successRate: 0.5 })
    expect(todayStats([], now, 4).successRate).toBeNull()
  })

  it('forecasts due cards for 30 days, overdue counted today', () => {
    const cards = [
      card('a', { state: 2, due: now - 5 * DAY }),
      card('b', { state: 2, due: now + 3600_000 }),
      card('c', { state: 1, due: now + DAY }),
      card('d', { state: 2, due: now + 29 * DAY }),
      card('e', { state: 2, due: now + 40 * DAY }),
      card('f', { state: 0 }),
      card('g', { state: 2, due: now, suspended: true }),
      card('h', { state: 2, due: now, retired: true }),
    ]
    const f = forecast(cards, now, 4)
    expect(f).toHaveLength(30)
    expect(f[0]).toBe(2)
    expect(f[1]).toBe(1)
    expect(f[29]).toBe(1)
    expect(f.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('computes true retention on Review-state answers only', () => {
    const reviews = [
      review(now - DAY, 3),
      review(now - 2 * DAY, 1),
      review(now - 3 * DAY, 4),
      review(now - 3 * DAY, 1, 3), // relearning re-presentation: excluded
      review(now - 20 * DAY, 1),
      review(now - 200 * DAY, 3),
    ]
    expect(trueRetention(reviews, now, 4, 7)).toEqual({ days: 7, rate: 2 / 3, count: 3 })
    expect(trueRetention(reviews, now, 4, 30)).toEqual({ days: 30, rate: 2 / 4, count: 4 })
    expect(trueRetention([], now, 4, 90).rate).toBeNull()
  })

  it('weights the target retention by cards of FSRS decks', () => {
    const d1 = deck('d1', 'fsrs', { fsrs: { requestRetention: 0.9 } })
    const d2 = deck('d2', 'fsrs', { fsrs: { requestRetention: 0.8 } })
    const d3 = deck('d3', 'leitner')
    const cards = [
      card('a', {}, 'n', 'd1'),
      card('b', {}, 'n', 'd1'),
      card('c', {}, 'n', 'd1'),
      card('d', {}, 'n', 'd2'),
      card('e', {}, 'n', 'd3'),
    ]
    expect(targetRetention([d1, d2, d3], cards)).toBeCloseTo(0.875)
    expect(targetRetention([d3], cards)).toBeNull()
  })

  it('builds a 365-day heatmap in study days (Monday first)', () => {
    const reviews = [
      review(now, 3),
      review(now - 1000, 1),
      review(paris('2026-09-25T01:00:00Z'), 3),
      review(now - 400 * DAY, 3),
    ]
    const days = heatmap(reviews, now, 4)
    expect(days).toHaveLength(365)
    expect(days.at(-1)).toEqual({ key: '2026-09-25', weekday: 4, count: 2 })
    expect(days.at(-2)).toMatchObject({ key: '2026-09-24', count: 1 })
    expect(days[0]?.key).toBe('2025-09-26')
    expect(days.filter((d) => d.count > 0)).toHaveLength(2)
    expect([0, 1, 3, 5, 8, 20].map((n) => heatLevel(n, 8))).toEqual([0, 1, 2, 3, 4, 4])
    expect(heatLevel(3, 0)).toBe(0)
  })

  it('counts cards per state and per Leitner box', () => {
    const cards = [
      card('a'),
      card('b', { state: 1 }),
      card('c', { state: 2, box: 3 }, 'n', 'L'),
      card('d', { state: 3, box: 1 }, 'n', 'L'),
      card('e', { state: 2, suspended: true, box: 5 }, 'n', 'L'),
      card('f', { state: 2, retired: true }),
      card('g', { state: 2, box: 9 }, 'n', 'L'),
    ]
    expect(stateDistribution(cards)).toEqual({
      new: 1,
      learning: 1,
      review: 2,
      relearning: 1,
      suspended: 1,
      retired: 1,
    })
    expect(boxDistribution(cards, [deck('L', 'leitner')])).toEqual([1, 0, 1, 0, 0, 0, 1])
  })
})
