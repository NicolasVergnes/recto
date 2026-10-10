/**
 * Leitner "Memory Box" with seven boxes and an interval per box (03-SCHEDULING §3).
 * Pure: `now` is a parameter; no Dexie, no DOM.
 */
import type { Card, CardState, Deck, Rating } from '../domain/types'
import { formatInterval } from '../i18n/format'
import { t } from '../i18n/t'
import { daysBetween } from './day'
import { flipAfter } from './sides'
import type { PreviewItem, Scheduler, SchedulerOptions, SchedulerOutcome } from './types'

export const MAX_BOX = 7
const DAY_MS = 86_400_000

/** FSRS → Leitner conversion (03 §4): box from stability, an approximation. */
export function boxFromStability(stability: number): number {
  if (stability < 1.5) return 1
  if (stability < 4) return 2
  if (stability < 15) return 3
  if (stability < 50) return 4
  if (stability < 120) return 5
  if (stability < 250) return 6
  return 7
}

export function createLeitnerScheduler(options: Pick<SchedulerOptions, 'dayStartHour'>): Scheduler {
  const { dayStartHour } = options

  function dueFor(box: number, now: number, deck: Deck): number {
    const s = deck.settings.leitner
    const days = s.intervals[box - 1] ?? s.intervals[s.intervals.length - 1] ?? 1
    return now + days * DAY_MS
  }

  function answer(card: Card, rating: Rating, now: number, deck: Deck): SchedulerOutcome {
    const s = deck.settings.leitner
    // Hard does not exist in Leitner (03 §3.3); treated as "Réussi" if ever received.
    const success = rating >= 2
    let box: number
    if (!success) box = s.failToBox
    else if (card.box === 0)
      box = 2 // first answer of a new card, seen once and right
    else box = Math.min(card.box + (rating === 4 && s.allowSure ? 2 : 1), MAX_BOX)
    const state: CardState = success ? 2 : 3
    // "Replace the card in box 1, behind the others": re-presented in the session (03 §3.4).
    const due = success ? dueFor(box, now, deck) : now
    const elapsedDays =
      card.lastReview === null ? 0 : daysBetween(card.lastReview, now, dayStartHour)
    const scheduledDays = success ? daysBetween(now, due, dayStartHour) : 0
    const next: Card = {
      ...card,
      box,
      state,
      due,
      reps: card.reps + 1,
      // One lapse per forgetting episode: re-presentations of a failed card do not add more.
      lapses: !success && card.state !== 3 ? card.lapses + 1 : card.lapses,
      lastReview: now,
      scheduledDays,
      sideFlipped: flipAfter(card, rating, deck),
    }
    return {
      card: next,
      review: {
        cardId: card.id,
        deckId: card.deckId,
        reviewedAt: now,
        rating,
        scheduler: 'leitner',
        stateBefore: card.state,
        dueBefore: card.due,
        stabilityBefore: card.stability,
        difficultyBefore: card.difficulty,
        boxBefore: card.box,
        learningStepsBefore: card.learningSteps,
        lastReviewBefore: card.lastReview,
        stateAfter: state,
        dueAfter: due,
        scheduledDays,
        elapsedDays,
        boxAfter: box,
      },
    }
  }

  function when(due: number, now: number): string {
    const days = daysBetween(now, due, dayStartHour)
    if (due <= now || days <= 0) return formatInterval(Math.max(0, due - now))
    return days === 1 ? t('common.tomorrowLower') : formatInterval(days * DAY_MS)
  }

  return {
    kind: 'leitner',
    ratings: (deck) => (deck.settings.leitner.allowSure ? [1, 3, 4] : [1, 3]),
    answer,
    preview(card, now, deck) {
      const out: Partial<Record<Rating, PreviewItem>> = {}
      for (const rating of this.ratings(deck)) {
        const { card: next } = answer(card, rating, now, deck)
        out[rating] = {
          due: next.due,
          box: next.box,
          label: t('scheduler.boxTarget', { n: next.box, when: when(next.due, now) }),
        }
      }
      return out
    },
    retrievability: () => null,
  }
}
