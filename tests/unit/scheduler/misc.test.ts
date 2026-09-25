import { describe, expect, it } from 'vitest'
import { getScheduler, canRetire } from '$lib/scheduler'
import { convertCard } from '$lib/scheduler/convert'
import { card, deck, paris } from '../../helpers/fixtures'

const DAY = 86_400_000
const now = paris('2026-09-25T08:00:00Z')

describe('getScheduler', () => {
  it('returns the scheduler of each kind', () => {
    expect(getScheduler('fsrs').kind).toBe('fsrs')
    expect(getScheduler('leitner', { dayStartHour: 5 }).kind).toBe('leitner')
  })
})

describe('P7 canRetire', () => {
  const spaced = { rating: 3 as const, elapsedDays: 7 }
  it('needs Review state and three spaced successes', () => {
    expect(canRetire({ state: 2 }, [spaced, spaced, spaced])).toBe(true)
    expect(canRetire({ state: 2 }, [spaced, spaced])).toBe(false)
    expect(canRetire({ state: 1 }, [spaced, spaced, spaced])).toBe(false)
    expect(canRetire({ state: 2 }, [spaced, spaced, { rating: 3, elapsedDays: 6 }])).toBe(false)
    expect(canRetire({ state: 2 }, [spaced, spaced, { rating: 1, elapsedDays: 30 }])).toBe(false)
    expect(
      canRetire({ state: 2 }, [
        spaced,
        spaced,
        { rating: 4, elapsedDays: 40 },
        { rating: 2, elapsedDays: 9 },
      ]),
    ).toBe(true)
  })
})

describe('scheduler switch (03 §4)', () => {
  it('Leitner → FSRS replays the history, keeping flags', () => {
    const d = deck('d1', 'fsrs')
    const c = card('c', { box: 3, state: 2, reps: 2, suspended: true, flag: 2, due: now + 7 * DAY })
    const out = convertCard(
      c,
      'fsrs',
      d,
      [
        { rating: 3, reviewedAt: now - 3 * DAY },
        { rating: 3, reviewedAt: now - DAY },
      ],
      now,
      false,
    )
    expect(out).toMatchObject({ state: 2, suspended: true, flag: 2, reps: 2 })
    expect(out.stability).toBeGreaterThan(0)
    const fresh = convertCard(card('n'), 'fsrs', d, [], now, false)
    expect(fresh.state).toBe(0)
  })

  it('FSRS → Leitner derives the box from stability and keeps due', () => {
    const d = deck('d1', 'leitner')
    expect(
      convertCard(card('c', { state: 2, stability: 20, due: now + DAY }), 'leitner', d, [], now),
    ).toMatchObject({ box: 4, due: now + DAY })
    expect(convertCard(card('n'), 'leitner', d, [], now).box).toBe(0)
  })
})
