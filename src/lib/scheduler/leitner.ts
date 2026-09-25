/**
 * Leitner "Memory Box" with seven boxes, faithful to the booklet (03-SCHEDULING §3).
 * Pure: `now` is a parameter; no Dexie, no DOM.
 */
import type { Card, CardState, Deck, Rating } from '../domain/types'
import { formatInterval } from '../i18n/format'
import { t } from '../i18n/t'
import { addDays, daysBetween, startOfDate, studyDate, type LocalDate } from './day'
import type { PreviewItem, Scheduler, SchedulerOptions, SchedulerOutcome } from './types'

export const MAX_BOX = 7
const DAY_MS = 86_400_000

export interface CalendarOrigin {
  year: number
  month: number
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * Booklet calendar (03 §3.2): C1 every day, C2 even days, C3 Mondays, C4 the 1st of the month,
 * C5/C6 the 1st every 3/6 months from the deck's creation month, C7 yearly from the next year.
 */
export function isBoxDue(box: number, date: LocalDate, origin: CalendarOrigin): boolean {
  const months = (date.year - origin.year) * 12 + (date.month - origin.month)
  switch (box) {
    case 1:
      return true
    case 2:
      return date.day % 2 === 0
    case 3:
      return date.weekday === 1
    case 4:
      return date.day === 1
    case 5:
      return date.day === 1 && mod(months, 3) === 0
    case 6:
      return date.day === 1 && mod(months, 6) === 0
    case 7:
      return date.day === 1 && date.month === origin.month && date.year > origin.year
    default:
      return false
  }
}

export function calendarOrigin(deck: Pick<Deck, 'createdAt'>): CalendarOrigin {
  const d = new Date(deck.createdAt)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** First study day strictly after today when `box` is due, as the start of that day. */
export function nextCalendarDue(
  box: number,
  now: number,
  origin: CalendarOrigin,
  dayStartHour: number,
): number {
  const today = studyDate(now, dayStartHour)
  // C7 recurs yearly: at most two years ahead.
  for (let offset = 1; offset <= 800; offset++) {
    const date = addDays(today, offset)
    if (isBoxDue(box, date, origin)) return startOfDate(date, dayStartHour)
  }
  return startOfDate(today, dayStartHour, 365)
}

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
    if (s.mode === 'calendar') return nextCalendarDue(box, now, calendarOrigin(deck), dayStartHour)
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
      // alternateSides: flip after each success only (ignored when rendering cloze notes).
      sideFlipped: success && s.alternateSides ? !card.sideFlipped : card.sideFlipped,
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
