import { describe, expect, it } from 'vitest'
import { boxFromStability, createLeitnerScheduler } from '$lib/scheduler/leitner'
import type { Rating } from '$lib/domain/types'
import { card, deck, paris } from '../../helpers/fixtures'

const DAY = 86_400_000
const leitner = createLeitnerScheduler({ dayStartHour: 4 })
const now = paris('2026-09-25T08:00:00Z') // Friday 25 September, 10:00 local
const interval = deck('d1', 'leitner')

function answer(box: number, rating: Rating, patch = {}) {
  return leitner.answer(
    card('c', { box, state: box === 0 ? 0 : 2, ...patch }),
    rating,
    now,
    interval,
  )
}

describe('Leitner transitions (03 §3.3)', () => {
  it('new card: success → C2, failure → C1 in relearning due now', () => {
    for (const r of [3, 4] as const) {
      const { card: c } = answer(0, r)
      expect(c).toMatchObject({ box: 2, state: 2, due: now + 2 * DAY, reps: 1, lapses: 0 })
    }
    const { card: failed, review } = answer(0, 1)
    expect(failed).toMatchObject({ box: 1, state: 3, due: now, lapses: 1, lastReview: now })
    expect(review).toMatchObject({
      stateBefore: 0,
      stateAfter: 3,
      boxBefore: 0,
      boxAfter: 1,
      scheduler: 'leitner',
    })
  })

  it('Réussi +1, Sûr +2, Oublié → C1, capped at C7', () => {
    const expected: [number, Rating, number][] = [
      [1, 3, 2],
      [1, 4, 3],
      [2, 3, 3],
      [3, 3, 4],
      [4, 4, 6],
      [5, 4, 7],
      [6, 3, 7],
      [6, 4, 7],
      [7, 3, 7],
      [7, 4, 7],
      [7, 1, 1],
      [4, 1, 1],
    ]
    for (const [from, rating, to] of expected) {
      const { card: c } = answer(from, rating)
      expect(c.box, `C${from} rating ${rating}`).toBe(to)
    }
  })

  it('uses the interval of the target box, and a year in C7', () => {
    const intervals = [1, 2, 7, 30, 90, 180, 365]
    for (let box = 1; box <= 6; box++) {
      const { card: c, review } = answer(box, 3)
      expect(c.due).toBe(now + (intervals[box] ?? 0) * DAY)
      expect(review.scheduledDays).toBe(intervals[box])
    }
    expect(answer(7, 3).card.due).toBe(now + 365 * DAY)
  })

  it('treats Sûr as +1 when allowSure is off, and Hard as a success', () => {
    const noSure = deck('d1', 'leitner', { leitner: { allowSure: false } })
    expect(leitner.ratings(noSure)).toEqual([1, 3])
    expect(leitner.ratings(interval)).toEqual([1, 3, 4])
    expect(leitner.answer(card('c', { box: 2, state: 2 }), 4, now, noSure).card.box).toBe(3)
    expect(answer(2, 2).card.box).toBe(3)
  })

  it('alternates sides on success only, when enabled', () => {
    expect(answer(2, 3).card.sideFlipped).toBe(true)
    expect(answer(2, 3, { sideFlipped: true }).card.sideFlipped).toBe(false)
    expect(answer(2, 1, { sideFlipped: true }).card.sideFlipped).toBe(true)
    const noAlt = deck('d1', 'leitner', { alternateSides: false })
    expect(leitner.answer(card('c', { box: 2, state: 2 }), 3, now, noAlt).card.sideFlipped).toBe(
      false,
    )
  })

  it('counts one lapse per forgetting episode and journals re-presentations', () => {
    const first = answer(3, 1).card
    expect(first.lapses).toBe(1)
    const again = leitner.answer(first, 1, now + 60_000, interval)
    expect(again.card.lapses).toBe(1)
    expect(again.review.stateBefore).toBe(3)
    const success = leitner.answer(again.card, 3, now + 120_000, interval)
    expect(success.card).toMatchObject({ box: 2, state: 2, due: now + 120_000 + 2 * DAY, reps: 3 })
  })

  it('records elapsed study days and keeps FSRS fields untouched', () => {
    const { card: c, review } = answer(3, 3, {
      lastReview: now - 7 * DAY,
      stability: 0,
      difficulty: 0,
    })
    expect(review.elapsedDays).toBe(7)
    expect(c.stability).toBe(0)
    expect(leitner.retrievability(c, now, interval)).toBeNull()
  })

  it('previews each rating with the target box', () => {
    const p = leitner.preview(card('c', { box: 2, state: 2 }), now, interval)
    expect(p[1]).toMatchObject({ box: 1, due: now, label: '→ C1 · maintenant' })
    expect(p[3]).toMatchObject({ box: 3, label: '→ C3 · dans 7 j' })
    expect(p[4]).toMatchObject({ box: 4, label: '→ C4 · dans 30 j' })
    expect(
      leitner.preview(
        card('c', { box: 1, state: 2 }),
        now,
        deck('d1', 'leitner', { leitner: { allowSure: false } }),
      )[3],
    ).toMatchObject({
      label: '→ C2 · dans 2 j',
    })
    const tomorrow = leitner.preview(
      card('c'),
      now,
      deck('d1', 'leitner', { leitner: { intervals: [1, 1, 7, 30, 90, 180, 365] } }),
    )
    expect(tomorrow[3]?.label).toBe('→ C2 · demain')
  })
})

describe('FSRS → Leitner conversion (03 §4)', () => {
  it('maps FSRS stability to a box', () => {
    const cases: [number, number][] = [
      [0, 1],
      [1.49, 1],
      [1.5, 2],
      [3.9, 2],
      [14, 3],
      [49, 4],
      [119, 5],
      [249, 6],
      [250, 7],
      [9000, 7],
    ]
    for (const [s, box] of cases) expect(boxFromStability(s)).toBe(box)
  })
})
