import { describe, expect, it } from 'vitest'
import { defaultDeckSettings } from '$lib/domain/defaults'
import type { Rating } from '$lib/domain/types'
import {
  buildTrainingSet,
  compareParams,
  evaluate,
  isImprovement,
  MIN_REVIEWS,
  roundParams,
  sampleIntervals,
  usableReviewCount,
  type TrainingReview,
} from '$lib/scheduler/optimizer'
import { buildFsrs, DEFAULT_PARAMS } from '$lib/scheduler/fsrs'
import { FORGETFUL_W, simulateReviews } from '../../helpers/fsrs-sim'

// tests/setup.ts sets TZ=Europe/Paris.
const paris = (iso: string) => new Date(iso).getTime()
const withParams = (params: number[] | null) => ({ ...defaultDeckSettings().fsrs, params })

let seq = 0
function review(
  cardId: string,
  iso: string,
  rating: Rating,
  stateBefore: TrainingReview['stateBefore'] = 2,
): TrainingReview {
  seq += 1
  return {
    id: `r${String(seq).padStart(4, '0')}`,
    cardId,
    reviewedAt: paris(iso),
    rating,
    stateBefore,
  }
}

/** Decodes the flattened items back into [rating, delta] pairs. */
function items(set: ReturnType<typeof buildTrainingSet>): [number, number][][] {
  const out: [number, number][][] = []
  let offset = 0
  for (const length of set.lengths) {
    const item: [number, number][] = []
    for (let i = offset; i < offset + length; i++)
      item.push([set.ratings[i] ?? -1, set.deltaTs[i] ?? -1])
    out.push(item)
    offset += length
  }
  return out
}

describe('buildTrainingSet (03 §2.4)', () => {
  it('emits every prefix of a card history as an item', () => {
    const set = buildTrainingSet(
      [
        review('a', '2026-09-01T10:00:00Z', 3, 0),
        review('a', '2026-09-02T10:00:00Z', 3),
        review('a', '2026-09-05T10:00:00Z', 1),
        review('a', '2026-09-05T10:10:00Z', 3, 3),
      ],
      4,
    )
    expect(items(set)).toEqual([
      [
        [3, 0],
        [3, 1],
      ],
      [
        [3, 0],
        [3, 1],
        [1, 3],
      ],
      [
        [3, 0],
        [3, 1],
        [1, 3],
        [3, 0],
      ],
    ])
    expect(set).toMatchObject({ items: 3, reviews: 4, cards: 1 })
    expect(set.lengths).toBeInstanceOf(Uint32Array)
    expect(set.ratings).toHaveLength(2 + 3 + 4)
    expect(set.histories).toEqual([
      [
        { rating: 3, delta: 0 },
        { rating: 3, delta: 1 },
        { rating: 1, delta: 3 },
        { rating: 3, delta: 0 },
      ],
    ])
  })

  it('sorts each history by date, whatever the input order', () => {
    const rows = [
      review('a', '2026-09-01T10:00:00Z', 3, 0),
      review('a', '2026-09-04T10:00:00Z', 4),
      review('a', '2026-09-02T10:00:00Z', 2),
    ]
    const set = buildTrainingSet(
      [rows[2], rows[0], rows[1]].filter((r) => r !== undefined),
      4,
    )
    expect(set.histories[0]?.map((s) => [s.rating, s.delta])).toEqual([
      [3, 0],
      [2, 1],
      [4, 2],
    ])
    // Two answers at the same instant (e.g. imported): the id decides.
    const at = '2026-09-03T10:00:00Z'
    const tie = [
      { ...review('t', at, 1, 0), id: 'b' },
      { ...review('t', at, 3, 0), id: 'a' },
      review('t', '2026-09-05T10:00:00Z', 4),
    ]
    expect(buildTrainingSet(tie, 4).histories[0]?.map((s) => s.rating)).toEqual([1, 4])
    expect(buildTrainingSet([...tie].reverse(), 4).histories[0]?.map((s) => s.rating)).toEqual([
      1, 4,
    ])
  })

  it('starts at the last answer given to a new card (reset, import)', () => {
    const set = buildTrainingSet(
      [
        review('a', '2026-06-01T10:00:00Z', 3, 0),
        review('a', '2026-06-10T10:00:00Z', 1),
        // The card was reset to New: the history starts again.
        review('a', '2026-09-01T10:00:00Z', 4, 0),
        review('a', '2026-09-08T10:00:00Z', 3),
      ],
      4,
    )
    expect(set.histories).toEqual([
      [
        { rating: 4, delta: 0 },
        { rating: 3, delta: 7 },
      ],
    ])
  })

  it('ignores cards whose history does not start with a new card', () => {
    // E.g. an Anki card imported without its history: every answer in Recto is a review.
    const rows = [review('a', '2026-09-01T10:00:00Z', 3), review('a', '2026-09-05T10:00:00Z', 3)]
    const set = buildTrainingSet(rows, 4)
    expect(set).toMatchObject({ items: 0, reviews: 0, cards: 0, histories: [] })
    expect(usableReviewCount(rows, 4)).toBe(0)
  })

  it('counts study days with the 04:00 boundary', () => {
    const set = buildTrainingSet(
      [
        review('a', '2026-09-01T20:00:00Z', 3, 0), // 22:00, Sept 1st
        review('a', '2026-09-02T01:30:00Z', 3), // 03:30: still Sept 1st's study day
        review('a', '2026-09-02T02:30:00Z', 3), // 04:30: next study day
      ],
      4,
    )
    expect(set.histories[0]?.map((s) => s.delta)).toEqual([0, 0, 1])
    const midnight = buildTrainingSet(
      [review('b', '2026-09-01T20:00:00Z', 3, 0), review('b', '2026-09-02T01:30:00Z', 3)],
      0,
    )
    expect(midnight.histories[0]?.map((s) => s.delta)).toEqual([0, 1])
  })

  it('counts calendar days across daylight-saving changes (Europe/Paris)', () => {
    const set = buildTrainingSet(
      [
        // 2026-03-29 has 23 hours, 2026-10-25 has 25 hours.
        review('a', '2026-03-28T23:00:00Z', 3, 0), // Mar 29, 00:00 → study day Mar 28
        review('a', '2026-03-29T02:00:00Z', 3), // Mar 29, 04:00 (summer time) → Mar 29
        review('a', '2026-10-24T02:00:00Z', 3), // Oct 24, 04:00
        review('a', '2026-10-25T03:00:00Z', 3), // Oct 25, 04:00 (winter time), 25 h later
      ],
      4,
    )
    expect(set.histories[0]?.map((s) => s.delta)).toEqual([0, 1, 209, 1])
  })

  it('keeps same-day answers but drops items without any spaced review', () => {
    const rows = [
      review('a', '2026-09-01T10:00:00Z', 1, 0),
      review('a', '2026-09-01T10:10:00Z', 3, 1),
      review('a', '2026-09-02T10:00:00Z', 3),
      // Only learnt today: no delay to learn from.
      review('b', '2026-09-01T10:00:00Z', 1, 0),
      review('b', '2026-09-01T10:10:00Z', 3, 1),
      // A single answer.
      review('c', '2026-09-01T10:00:00Z', 3, 0),
    ]
    const set = buildTrainingSet(rows, 4)
    expect(items(set)).toEqual([
      [
        [1, 0],
        [3, 0],
        [3, 1],
      ],
    ])
    expect(set).toMatchObject({ items: 1, reviews: 3, cards: 1 })
    expect(usableReviewCount(rows, 4)).toBe(3)
  })

  it('counts as usable the answers the training set keeps', () => {
    const rows = [
      ...simulateReviews(30, FORGETFUL_W, 11),
      // Before a reset, and a card imported without history: not usable.
      review('c0000', '2025-12-01T10:00:00Z', 3, 0),
      review('c0000', '2025-12-03T10:00:00Z', 3),
      review('imported', '2026-02-01T10:00:00Z', 3),
      review('imported', '2026-02-09T10:00:00Z', 3),
    ]
    const set = buildTrainingSet(rows, 4)
    expect(usableReviewCount(rows, 4)).toBe(set.reviews)
    expect(set.reviews).toBe(rows.length - 4)
  })

  it('orders cards by their first answer, then by id (deterministic input)', () => {
    const rows = [
      review('z', '2026-09-03T10:00:00Z', 3, 0),
      review('z', '2026-09-04T10:00:00Z', 3),
      review('m', '2026-09-01T10:00:00Z', 4, 0),
      review('m', '2026-09-02T10:00:00Z', 4),
      review('b', '2026-09-03T10:00:00Z', 2, 0),
      review('b', '2026-09-04T10:00:00Z', 2),
    ]
    const a = buildTrainingSet(rows, 4)
    const b = buildTrainingSet([...rows].reverse(), 4)
    expect(a.histories.map((h) => h[0]?.rating)).toEqual([4, 2, 3])
    expect(b).toEqual(a)
  })

  it('handles an empty log', () => {
    expect(buildTrainingSet([], 4)).toMatchObject({ items: 0, reviews: 0, cards: 0 })
  })
})

describe('evaluate', () => {
  const histories = buildTrainingSet(simulateReviews(400, FORGETFUL_W, 7), 4).histories

  it('prefers the parameters that generated the answers', () => {
    const truth = evaluate(histories, withParams(FORGETFUL_W))
    const defaults = evaluate(histories, withParams(null))
    expect(truth.n).toBe(defaults.n)
    expect(truth.n).toBeGreaterThan(1500)
    expect(truth.logLoss).toBeLessThan(defaults.logLoss)
    expect(truth.rmse).toBeLessThan(defaults.rmse)
    // The generating model predicts the success rate it produced.
    expect(Math.abs(truth.predicted - truth.observed)).toBeLessThan(0.03)
    expect(defaults.predicted).toBeGreaterThan(defaults.observed)
    expect(isImprovement(defaults, truth)).toBe(true)
    expect(isImprovement(truth, defaults)).toBe(false)
  })

  it('caps w17/w18 from the relearning steps, like the scheduler', () => {
    const w = [...DEFAULT_PARAMS]
    w[17] = 1.5
    const two = { ...withParams(w), relearningSteps: ['10m', '1h'] }
    const capped = evaluate(histories, two)
    expect(capped).not.toEqual(evaluate(histories, withParams(w)))
    // The figures describe the parameters ts-fsrs actually schedules with.
    const scheduled = [...buildFsrs(two, false).parameters.w]
    expect(scheduled[17]).toBeLessThan(1)
    expect(capped).toEqual(evaluate(histories, withParams(scheduled)))
  })

  it('returns neutral figures without any spaced review', () => {
    const none = { logLoss: 0, rmse: 0, predicted: 0, observed: 0, n: 0 }
    expect(evaluate([], withParams(null))).toEqual(none)
    expect(evaluate([[{ rating: 3, delta: 0 }]], withParams(null)).n).toBe(0)
  })

  it('stays finite for certain predictions', () => {
    const e = evaluate(
      [
        [
          { rating: 4, delta: 0 },
          { rating: 1, delta: 1 },
        ],
      ],
      withParams(null),
    )
    expect(e.n).toBe(1)
    expect(Number.isFinite(e.logLoss)).toBe(true)
    expect(e.observed).toBe(0)
  })
})

describe('parameters', () => {
  it('rounds to 4 decimals and validates 21 finite numbers', () => {
    const raw = Float32Array.from(DEFAULT_PARAMS)
    expect(roundParams(raw)).toEqual([...DEFAULT_PARAMS])
    expect(roundParams([0.123456, ...DEFAULT_PARAMS.slice(1)])?.[0]).toBe(0.1235)
    expect(roundParams([1, 2, 3])).toBeNull()
    expect(roundParams([Number.NaN, ...DEFAULT_PARAMS.slice(1)])).toBeNull()
  })

  it('needs a strictly lower log-loss', () => {
    const base = { logLoss: 0.3, rmse: 0.05, predicted: 0.9, observed: 0.88, n: 100 }
    expect(isImprovement(base, { ...base, logLoss: 0.29 })).toBe(true)
    expect(isImprovement(base, base)).toBe(false)
    expect(isImprovement(base, { ...base, logLoss: 0.2, n: 0 })).toBe(false)
  })

  it('shows the first intervals of a new card always answered Good', () => {
    const settings = defaultDeckSettings().fsrs
    const now = paris('2026-09-25T10:00:00Z')
    const usual = sampleIntervals(settings, now)
    expect(usual).toHaveLength(4)
    expect(usual[0]).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < usual.length; i++) {
      expect(usual[i]).toBeGreaterThan(usual[i - 1] ?? Infinity)
    }
    const forgetful = sampleIntervals({ ...settings, params: FORGETFUL_W }, now)
    expect(forgetful[3]).toBeLessThan(usual[3] ?? 0)
  })

  it('compares the current and computed parameters on the history', () => {
    const settings = defaultDeckSettings().fsrs
    const now = paris('2026-09-25T10:00:00Z')
    const { histories } = buildTrainingSet(simulateReviews(200, FORGETFUL_W, 3), 4)
    const report = compareParams(histories, settings, Float32Array.from(FORGETFUL_W), now)
    if (typeof report === 'string') throw new Error(report)
    expect(report.better).toBe(true)
    expect(report.params).toEqual(FORGETFUL_W)
    expect(report.old.params).toEqual([...DEFAULT_PARAMS])
    expect(report.next.intervals).toEqual(
      sampleIntervals({ ...settings, params: FORGETFUL_W }, now),
    )
    // Already the best parameters: nothing to apply.
    const custom = { ...settings, params: FORGETFUL_W }
    const again = compareParams(histories, custom, Float32Array.from(FORGETFUL_W), now)
    expect(typeof again === 'object' && again.better).toBe(false)
    expect(compareParams(histories, settings, [1, 2], now)).toBe('failed')
  })

  it('reports scarce data when the optimizer gives the defaults back', () => {
    // fsrs-rs returns DEFAULT_PARAMETERS unchanged when it cannot learn: never an « optimisation »,
    // even if the defaults happen to fit a few answers better than the deck's custom parameters.
    const now = paris('2026-09-25T10:00:00Z')
    const { histories } = buildTrainingSet(simulateReviews(4, FORGETFUL_W, 3), 4)
    const defaults = Float32Array.from(DEFAULT_PARAMS)
    const settings = defaultDeckSettings().fsrs
    expect(compareParams(histories, settings, defaults, now)).toBe('notEnoughData')
    expect(compareParams(histories, withParams(FORGETFUL_W), defaults, now)).toBe('notEnoughData')
  })

  it('asks for 1 000 reviews', () => {
    expect(MIN_REVIEWS).toBe(1000)
  })
})
