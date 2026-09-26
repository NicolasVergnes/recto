/**
 * FSRS parameter optimisation (03 §2.4), pure part: the training set that fsrs-browser's
 * `computeParameters` expects, built from the review log, and an evaluation of parameter sets on
 * that same history (ts-fsrs reproduces fsrs-rs memory states, so the figures are exact).
 */
import { defaultDeckSettings, makeCard, makeDeck } from '../domain/defaults'
import type { FsrsSettings, Rating, Review } from '../domain/types'
import { daysBetween } from './day'
import { buildFsrs, createFsrsScheduler, DEFAULT_PARAMS, validateFsrsSettings } from './fsrs'

/** Usable reviews (see `usableReviewCount`) of a deck's own cards needed to optimise (M6). */
export const MIN_REVIEWS = 1000

export type TrainingReview = Pick<Review, 'id' | 'cardId' | 'reviewedAt' | 'rating' | 'stateBefore'>

/** One answer: its grade and the study days elapsed since the previous answer (0 for the first). */
export interface Step {
  rating: Rating
  delta: number
}

export interface TrainingSet {
  /** Items (every prefix of a history) flattened, as fsrs-browser expects them. */
  ratings: Uint32Array
  deltaTs: Uint32Array
  lengths: Uint32Array
  items: number
  /** Answers and cards that contribute at least one item. */
  reviews: number
  cards: number
  histories: Step[][]
}

/** Code-unit order (-1, 0, 1), independent of the locale. */
const compareIds = (a: string, b: string) => Number(a > b) - Number(a < b)

/**
 * One history per card, cut at the last answer given while the card was new (a reset or an
 * import starts it again), deltas counted in study days (04:00 boundary, DST-safe). Same-day
 * answers are kept (FSRS-6 short-term model). Leitner answers count too: 1/3/4 are FSRS grades.
 * Cards without a spaced answer teach nothing and are dropped; order is deterministic.
 */
function cardHistories(reviews: readonly TrainingReview[], dayStartHour: number): Step[][] {
  const byCard = new Map<string, TrainingReview[]>()
  for (const r of reviews) {
    const list = byCard.get(r.cardId)
    if (list) list.push(r)
    else byCard.set(r.cardId, [r])
  }
  const kept: { first: TrainingReview; steps: Step[] }[] = []
  for (const list of byCard.values()) {
    list.sort((a, b) => a.reviewedAt - b.reviewedAt || compareIds(a.id, b.id))
    const start = list.findLastIndex((r) => r.stateBefore === 0)
    const first = list[start]
    if (!first) continue
    let previous = first.reviewedAt
    const steps = list.slice(start).map((r) => {
      const delta = daysBetween(previous, r.reviewedAt, dayStartHour)
      previous = r.reviewedAt
      return { rating: r.rating, delta }
    })
    if (steps.some((s) => s.delta > 0)) kept.push({ first, steps })
  }
  kept.sort(
    (a, b) => a.first.reviewedAt - b.first.reviewedAt || compareIds(a.first.cardId, b.first.cardId),
  )
  return kept.map((k) => k.steps)
}

/**
 * Answers the optimizer learns from: those of cards followed since they were new in Recto and
 * answered again on a later study day (the `reviews` of `buildTrainingSet`, without its items).
 */
export function usableReviewCount(
  reviews: readonly TrainingReview[],
  dayStartHour: number,
): number {
  return cardHistories(reviews, dayStartHour).reduce((n, h) => n + h.length, 0)
}

/**
 * fsrs-browser items: every prefix (length ≥ 2) of each history holding at least one answer
 * given after a delay (fsrs-rs panics on the others); the last answer of an item is predicted.
 */
export function buildTrainingSet(
  reviews: readonly TrainingReview[],
  dayStartHour: number,
): TrainingSet {
  const histories = cardHistories(reviews, dayStartHour)
  const ratings: number[] = []
  const deltaTs: number[] = []
  const lengths: number[] = []
  for (const h of histories) {
    for (let end = h.findIndex((s) => s.delta > 0); end < h.length; end++) {
      for (const s of h.slice(0, end + 1)) {
        ratings.push(s.rating)
        deltaTs.push(s.delta)
      }
      lengths.push(end + 1)
    }
  }
  return {
    ratings: Uint32Array.from(ratings),
    deltaTs: Uint32Array.from(deltaTs),
    lengths: Uint32Array.from(lengths),
    items: lengths.length,
    reviews: histories.reduce((n, h) => n + h.length, 0),
    cards: histories.length,
    histories,
  }
}

export interface Evaluation {
  /** Mean binary cross-entropy of the predicted recall probability (lower is better). */
  logLoss: number
  /** RMSE between predicted and observed success over 20 probability bins (lower is better). */
  rmse: number
  /** Mean predicted and observed success rates of the evaluated answers. */
  predicted: number
  observed: number
  /** Answers given after a delay (the only ones the model predicts). */
  n: number
}

const BINS = 20
const EPSILON = 1e-4

/**
 * How well FSRS settings predict the success of every answer given after a delay. The whole
 * settings matter: ts-fsrs caps w17/w18 from the number of relearning steps, as when scheduling.
 */
export function evaluate(
  histories: readonly (readonly Step[])[],
  settings: FsrsSettings,
): Evaluation {
  const f = buildFsrs(settings, false)
  const bins = new Map<number, { n: number; p: number; y: number }>()
  let loss = 0
  let sumP = 0
  let sumY = 0
  let n = 0
  for (const history of histories) {
    let state: ReturnType<typeof f.next_state> | null = null
    for (const step of history) {
      if (state && step.delta > 0) {
        const p = Math.min(
          1 - EPSILON,
          Math.max(EPSILON, f.forgetting_curve(step.delta, state.stability)),
        )
        const y = step.rating > 1 ? 1 : 0
        loss -= y * Math.log(p) + (1 - y) * Math.log(1 - p)
        sumP += p
        sumY += y
        n++
        const key = Math.min(BINS - 1, Math.floor(p * BINS))
        const bin = bins.get(key) ?? { n: 0, p: 0, y: 0 }
        bins.set(key, { n: bin.n + 1, p: bin.p + p, y: bin.y + y })
      }
      state = f.next_state(state, step.delta, step.rating)
    }
  }
  if (n === 0) return { logLoss: 0, rmse: 0, predicted: 0, observed: 0, n: 0 }
  let squares = 0
  for (const b of bins.values()) squares += (b.p - b.y) ** 2 / b.n
  return {
    logLoss: loss / n,
    rmse: Math.sqrt(squares / n),
    predicted: sumP / n,
    observed: sumY / n,
    n,
  }
}

/** New parameters are only offered when they predict the history better. */
export function isImprovement(old: Evaluation, next: Evaluation): boolean {
  return next.n > 0 && next.logLoss < old.logLoss
}

/** Rounds the optimizer output (float32) to 4 decimals; null unless 21 finite numbers. */
export function roundParams(raw: ArrayLike<number>): number[] | null {
  const params = Array.from(raw, (x) => Math.round(x * 10_000) / 10_000)
  const settings = { ...defaultDeckSettings().fsrs, params }
  return validateFsrsSettings(settings).length === 0 ? params : null
}

/** Intervals (days) of a new card always answered Good; sub-day learning steps are skipped. */
export function sampleIntervals(settings: FsrsSettings, now: number, count = 4): number[] {
  const deck = makeDeck({ name: 'sample', scheduler: 'fsrs' }, 'sample', now)
  deck.settings.fsrs = settings
  // dayStartHour only feeds the log's elapsedDays, not the intervals.
  const scheduler = createFsrsScheduler({ dayStartHour: 4, fuzz: false })
  let card = makeCard({ id: 'sample', deckId: deck.id }, 0, 'sample', now)
  const out: number[] = []
  for (let i = 0; i < 20 && out.length < count; i++) {
    card = scheduler.answer(card, 3, card.due, deck).card
    if (card.scheduledDays > 0) out.push(card.scheduledDays)
  }
  return out
}

export interface ParamsSummary extends Evaluation {
  params: number[]
  intervals: number[]
}

export interface OptimizationReport {
  /** The rounded parameters to store in `settings.fsrs.params`. */
  params: number[]
  old: ParamsSummary
  next: ParamsSummary
  better: boolean
}

/**
 * Current vs computed parameters on the same history. `failed` when the output is invalid;
 * `notEnoughData` when it is the FSRS-6 defaults, which fsrs-rs returns unchanged when the data
 * is too scarce to learn from (nothing to offer, whatever the deck uses now).
 */
export function compareParams(
  histories: readonly (readonly Step[])[],
  settings: FsrsSettings,
  computed: ArrayLike<number>,
  now: number,
): OptimizationReport | 'notEnoughData' | 'failed' {
  const params = roundParams(computed)
  if (!params) return 'failed'
  if (params.every((x, i) => x === DEFAULT_PARAMS[i])) return 'notEnoughData'
  const summary = (p: number[] | null): ParamsSummary => ({
    ...evaluate(histories, { ...settings, params: p }),
    params: p ?? [...DEFAULT_PARAMS],
    intervals: sampleIntervals({ ...settings, params: p }, now),
  })
  const old = summary(settings.params)
  const next = summary(params)
  return { params, old, next, better: isImprovement(old, next) }
}
