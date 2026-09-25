import { describe, expect, it } from 'vitest'
import { defaultDeckSettings } from '$lib/domain/defaults'
import type { Card, Rating } from '$lib/domain/types'
import {
  createFsrsScheduler,
  fromFsrsCard,
  parseSteps,
  rescheduleFromHistory,
  toFsrsCard,
  validateFsrsSettings,
  workloadFactor,
} from '$lib/scheduler/fsrs'
import { card, deck, paris } from '../../helpers/fixtures'

const MIN = 60_000
const DAY = 86_400_000
const f = createFsrsScheduler({ dayStartHour: 4, fuzz: false })
const d = deck('d1')
const now = paris('2026-09-25T08:00:00Z')

function run(c: Card, ratings: Rating[], start = now, gapMs = DAY): Card {
  let t = start
  let cur = c
  for (const r of ratings) {
    cur = f.answer(cur, r, t, d).card
    t = Math.max(t + gapMs, cur.due)
  }
  return cur
}

describe('FSRS adapter (03 §2)', () => {
  it('round-trips Card ↔ ts-fsrs Card', () => {
    const c = card('c', {
      state: 2,
      due: now,
      stability: 12.5,
      difficulty: 5.2,
      scheduledDays: 9,
      learningSteps: 0,
      reps: 4,
      lapses: 1,
      lastReview: now - 9 * DAY,
    })
    const f1 = toFsrsCard(c)
    expect(f1).toMatchObject({
      stability: 12.5,
      difficulty: 5.2,
      scheduled_days: 9,
      reps: 4,
      lapses: 1,
      state: 2,
    })
    expect(f1.last_review?.getTime()).toBe(now - 9 * DAY)
    expect(fromFsrsCard(c, f1)).toEqual(c)
    const fresh = toFsrsCard(card('n'))
    expect('last_review' in fresh).toBe(false)
    expect(fromFsrsCard(card('n'), fresh).lastReview).toBeNull()
  })

  it('P11: a new card is seen again after 10 min, then at least one day later', () => {
    const { card: learning, review } = f.answer(card('c'), 3, now, d)
    expect(learning).toMatchObject({ state: 1, due: now + 10 * MIN, reps: 1 })
    expect(review).toMatchObject({
      stateBefore: 0,
      stateAfter: 1,
      scheduler: 'fsrs',
      elapsedDays: 0,
    })
    const graduated = f.answer(learning, 3, now + 10 * MIN, d).card
    expect(graduated.state).toBe(2)
    expect(graduated.due - (now + 10 * MIN)).toBeGreaterThanOrEqual(DAY)
    expect(graduated.stability).toBeGreaterThan(0)
    expect(graduated.difficulty).toBeGreaterThanOrEqual(1)
    expect(graduated.difficulty).toBeLessThanOrEqual(10)
  })

  it('lapses go to relearning with a 10 min step', () => {
    const review = run(card('c'), [3, 3, 3])
    expect(review.state).toBe(2)
    const t = review.due + DAY
    const { card: lapsed, review: log } = f.answer(review, 1, t, d)
    expect(lapsed).toMatchObject({ state: 3, lapses: 1, due: t + 10 * MIN })
    expect(log.elapsedDays).toBeGreaterThanOrEqual(1)
    expect(log.stateBefore).toBe(2)
  })

  it('preview matches answer for every rating', () => {
    const cards = [card('new'), run(card('r'), [3, 3]), run(card('l'), [1])]
    for (const c of cards) {
      const p = f.preview(c, now + 3 * DAY, d)
      for (const r of [1, 2, 3, 4] as const) {
        expect(p[r]?.due).toBe(f.answer(c, r, now + 3 * DAY, d).card.due)
      }
    }
    expect(f.preview(card('n'), now, d)[3]?.label).toBe('10 min')
    const reviewCard = run(card('x'), [3, 3])
    expect(f.preview(reviewCard, reviewCard.due, d)[4]?.label).toMatch(/^dans \d+ (j|mois)$/)
  })

  it('offers 4 buttons, or Again/Good in 2-button mode', () => {
    expect(f.ratings(d)).toEqual([1, 2, 3, 4])
    const two = deck('d2', 'fsrs', { fsrs: { ratingMode: 2 } })
    expect(f.ratings(two)).toEqual([1, 3])
    expect(Object.keys(f.preview(card('c'), now, two))).toEqual(['1', '3'])
  })

  it('estimates retrievability, decreasing with time', () => {
    expect(f.retrievability(card('c'), now, d)).toBeNull()
    const c = run(card('c'), [3, 3, 3])
    const r1 = f.retrievability(c, c.due - DAY, d) ?? 0
    const r2 = f.retrievability(c, c.due + 30 * DAY, d) ?? 0
    expect(r1).toBeGreaterThan(r2)
    expect(r1).toBeLessThanOrEqual(1)
    expect(r2).toBeGreaterThan(0)
  })

  it('honours the retention target and maximum interval', () => {
    const strict = deck('d3', 'fsrs', { fsrs: { requestRetention: 0.97 } })
    const loose = deck('d4', 'fsrs', { fsrs: { requestRetention: 0.8 } })
    const c = run(card('c'), [3, 3])
    const t = c.due
    expect(f.answer(c, 3, t, strict).card.scheduledDays).toBeLessThan(
      f.answer(c, 3, t, loose).card.scheduledDays,
    )
    const capped = deck('d5', 'fsrs', { fsrs: { maximumInterval: 3 } })
    const mature = run(card('c'), [4, 4, 4])
    expect(f.answer(mature, 2, t + 100 * DAY, capped).card.scheduledDays).toBeLessThanOrEqual(3)
    // ts-fsrs keeps Hard < Good < Easy: Easy may exceed the cap by up to two days.
    expect(f.answer(mature, 4, t + 100 * DAY, capped).card.scheduledDays).toBeLessThanOrEqual(5)
  })

  it('validates settings at the boundary', () => {
    const ok = defaultDeckSettings().fsrs
    expect(validateFsrsSettings(ok)).toEqual([])
    expect(validateFsrsSettings({ ...ok, requestRetention: 0.5 })).toEqual(['requestRetention'])
    expect(validateFsrsSettings({ ...ok, maximumInterval: 0 })).toEqual(['maximumInterval'])
    expect(validateFsrsSettings({ ...ok, learningSteps: ['10x'] })).toEqual(['learningSteps'])
    expect(validateFsrsSettings({ ...ok, relearningSteps: ['m'] })).toEqual(['relearningSteps'])
    expect(validateFsrsSettings({ ...ok, params: [1, 2, 3] })).toEqual(['params'])
    expect(
      validateFsrsSettings({ ...ok, params: Array.from({ length: 21 }, () => Number.NaN) }),
    ).toEqual(['params'])
    expect(validateFsrsSettings({ ...ok, params: Array.from({ length: 21 }, () => 0.5) })).toEqual(
      [],
    )
    expect(parseSteps('10m, 1h 1d')).toEqual(['10m', '1h', '1d'])
    expect(parseSteps('10 minutes')).toBeNull()
    expect(parseSteps('')).toEqual([])
  })

  it('uses custom FSRS-6 parameters when valid', () => {
    const w = [
      0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261, 0.112, 1.0178, 1.849,
      0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536, 0.3332, 0.1437, 0.2,
    ]
    const custom = deck('d6', 'fsrs', { fsrs: { params: w } })
    expect(f.answer(card('c'), 4, now, custom).card.stability).toBeCloseTo(16.1507, 3)
  })

  it('replays a Leitner history into an FSRS state (03 §4)', () => {
    const settings = defaultDeckSettings().fsrs
    const history = [
      { rating: 3 as const, reviewedAt: now },
      { rating: 3 as const, reviewedAt: now + 2 * DAY },
      { rating: 4 as const, reviewedAt: now + 9 * DAY },
    ]
    const base = card('c', { box: 4, state: 2, due: now + 30 * DAY, reps: 3 })
    const out = rescheduleFromHistory(base, history, settings, now + 10 * DAY, false)
    expect(out.state).toBe(2)
    expect(out.reps).toBe(3)
    expect(out.stability).toBeGreaterThan(1)
    expect(out.lastReview).toBe(now + 9 * DAY)
    expect(out.box).toBe(4)
    const none = rescheduleFromHistory(card('n', { due: now - DAY }), [], settings, now, false)
    expect(none).toMatchObject({ state: 0, stability: 0, due: now - DAY })
  })

  it('P9: estimates the review load relative to 90 %', () => {
    expect(workloadFactor(0.9)).toBeCloseTo(1, 5)
    expect(workloadFactor(0.95)).toBeGreaterThan(1.6)
    expect(workloadFactor(0.8)).toBeLessThan(0.7)
    expect(workloadFactor(0.97)).toBeGreaterThan(workloadFactor(0.95))
    expect(
      workloadFactor(
        0.9,
        Array.from({ length: 21 }, () => 0.5),
      ),
    ).toBeCloseTo(1, 5)
  })
})
