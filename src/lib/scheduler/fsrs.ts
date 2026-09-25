/**
 * FSRS-6 through ts-fsrs 5 (03-SCHEDULING §2). The only module that imports ts-fsrs types;
 * dates cross the boundary as `Date`, everything else stays in epoch ms.
 */
import {
  createEmptyCard,
  default_w,
  fsrs,
  forgetting_curve,
  type Card as FCard,
  type FSRS,
  type FSRSHistory,
  type FSRSParameters,
  type Grade,
  type StepUnit,
} from 'ts-fsrs'
import type { Card, Deck, FsrsSettings, Rating, Review } from '../domain/types'
import { formatInterval } from '../i18n/format'
import { DAY_MS, daysBetween } from './day'
import type { PreviewItem, Scheduler, SchedulerOptions, SchedulerOutcome } from './types'

const STEP_RE = /^\d+(\.\d+)?[mhd]$/

function isStep(s: string): s is StepUnit {
  return STEP_RE.test(s)
}

/** Validation at the boundary (form, backup import): returns the list of problems. */
export function validateFsrsSettings(s: FsrsSettings): string[] {
  const errors: string[] = []
  if (!(s.requestRetention >= 0.7 && s.requestRetention <= 0.99)) errors.push('requestRetention')
  if (!(
    Number.isInteger(s.maximumInterval) &&
    s.maximumInterval >= 1 &&
    s.maximumInterval <= 36500
  )) {
    errors.push('maximumInterval')
  }
  if (!s.learningSteps.every(isStep)) errors.push('learningSteps')
  if (!s.relearningSteps.every(isStep)) errors.push('relearningSteps')
  if (s.params !== null && !(s.params.length === 21 && s.params.every(Number.isFinite))) {
    errors.push('params')
  }
  if (s.ratingMode !== 2 && s.ratingMode !== 4) errors.push('ratingMode')
  return errors
}

/** Parses "10m 1h" into steps; returns null when a step is invalid. */
export function parseSteps(text: string): string[] | null {
  const steps = text.split(/[\s,;]+/).filter(Boolean)
  return steps.every(isStep) ? steps : null
}

const cache = new Map<string, FSRS>()

export function buildFsrs(s: FsrsSettings, fuzz = true): FSRS {
  const key = JSON.stringify([
    s.requestRetention,
    s.maximumInterval,
    s.learningSteps,
    s.relearningSteps,
    s.params,
    fuzz,
  ])
  let f = cache.get(key)
  if (!f) {
    const params: Partial<FSRSParameters> = {
      request_retention: s.requestRetention,
      maximum_interval: s.maximumInterval,
      enable_fuzz: fuzz,
      enable_short_term: true,
      learning_steps: s.learningSteps.filter(isStep),
      relearning_steps: s.relearningSteps.filter(isStep),
    }
    if (s.params && s.params.length === 21) params.w = s.params
    f = fsrs(params)
    cache.set(key, f)
  }
  return f
}

export function toFsrsCard(c: Card): FCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: 0,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    ...(c.lastReview !== null ? { last_review: new Date(c.lastReview) } : {}),
  }
}

/** Copies the ts-fsrs scheduling fields onto our card (Leitner fields are kept). */
export function fromFsrsCard(base: Card, f: FCard): Card {
  return {
    ...base,
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    scheduledDays: f.scheduled_days,
    learningSteps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state,
    lastReview: f.last_review ? f.last_review.getTime() : null,
  }
}

function grade(rating: Rating): Grade {
  return rating
}

export function createFsrsScheduler(options: SchedulerOptions): Scheduler {
  const { dayStartHour, fuzz } = options
  const get = (deck: Deck) => buildFsrs(deck.settings.fsrs, fuzz)

  function answer(card: Card, rating: Rating, now: number, deck: Deck): SchedulerOutcome {
    const { card: f } = get(deck).next(toFsrsCard(card), new Date(now), grade(rating))
    const next = fromFsrsCard(card, f)
    return {
      card: next,
      review: {
        cardId: card.id,
        deckId: card.deckId,
        reviewedAt: now,
        rating,
        scheduler: 'fsrs',
        stateBefore: card.state,
        dueBefore: card.due,
        stabilityBefore: card.stability,
        difficultyBefore: card.difficulty,
        boxBefore: card.box,
        learningStepsBefore: card.learningSteps,
        lastReviewBefore: card.lastReview,
        stateAfter: next.state,
        dueAfter: next.due,
        scheduledDays: next.scheduledDays,
        elapsedDays: card.lastReview === null ? 0 : daysBetween(card.lastReview, now, dayStartHour),
        boxAfter: card.box,
      },
    }
  }

  return {
    kind: 'fsrs',
    ratings: (deck) => (deck.settings.fsrs.ratingMode === 2 ? [1, 3] : [1, 2, 3, 4]),
    answer,
    preview(card, now, deck) {
      const record = get(deck).repeat(toFsrsCard(card), new Date(now))
      const out: Partial<Record<Rating, PreviewItem>> = {}
      for (const rating of this.ratings(deck)) {
        const due = record[grade(rating)].card.due.getTime()
        out[rating] = { due, label: formatInterval(due - now) }
      }
      return out
    },
    retrievability(card, now, deck) {
      if (card.state === 0 || card.lastReview === null) return null
      // Direct forgetting curve (fast: the daily queue sorts thousands of overdue cards by R).
      const params = deck.settings.fsrs.params
      const w = params && params.length === 21 ? params : default_w
      return forgetting_curve(w, Math.max(0, now - card.lastReview) / DAY_MS, card.stability)
    },
  }
}

/**
 * Leitner → FSRS (03 §4): replays the card's history with `reschedule`. Leitner ratings 1/3/4 are
 * valid FSRS grades. Without history the card is new again, its due date kept.
 */
export function rescheduleFromHistory(
  card: Card,
  history: readonly Pick<Review, 'rating' | 'reviewedAt'>[],
  settings: FsrsSettings,
  now: number,
  fuzz = true,
): Card {
  if (history.length === 0) {
    return fromFsrsCard(card, { ...createEmptyCard(new Date(card.due)), due: new Date(card.due) })
  }
  const sorted = [...history].sort((a, b) => a.reviewedAt - b.reviewedAt)
  const reviews: FSRSHistory[] = sorted.map((r) => ({
    rating: grade(r.rating),
    review: new Date(r.reviewedAt),
  }))
  const first = sorted[0]?.reviewedAt ?? now
  const { collections } = buildFsrs(settings, fuzz).reschedule(
    createEmptyCard(new Date(first)),
    reviews,
    {
      now: new Date(now),
      first_card: createEmptyCard(new Date(first)),
    },
  )
  const last = collections[collections.length - 1]
  return last ? fromFsrsCard(card, last.card) : card
}

/**
 * P9: relative review load of a target retention compared with 0.90 (1 = same load). Uses the
 * FSRS-6 forgetting curve: intervals shrink when retention rises, and each lapse costs ~2 extra
 * reviews (relearning).
 */
export function workloadFactor(retention: number, params: readonly number[] | null = null): number {
  const w = params && params.length === 21 ? params : default_w
  const intervalFor = (r: number) => {
    // Invert R(t, S=1) = r by bisection on t (days).
    let lo = 0
    let hi = 1000
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (forgetting_curve(w, mid, 1) > r) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const load = (r: number) => (1 + 2 * (1 - r)) / intervalFor(r)
  return load(retention) / load(0.9)
}
