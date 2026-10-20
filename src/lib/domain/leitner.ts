/**
 * Boîte de Leitner models (M19, 03 §3): seven compartments (default, the periods of the Memory Box
 * booklet), five, or « Ma boîte », the user's own box. A deck keeps a copy of its model's
 * intervals (`DeckSettings.leitner`): scheduling only reads the deck. Pure.
 */
import type { Card, Deck, DeckModel, LeitnerModel } from './types'

export const LEITNER_PRESETS = {
  seven: [1, 2, 7, 30, 90, 180, 365],
  five: [1, 3, 7, 14, 30],
} as const satisfies Record<Exclude<LeitnerModel, 'custom'>, readonly number[]>

export const MIN_BOXES = 2
export const MAX_BOXES = 10
export const MAX_BOX_DAYS = 36_500

/** How new decks are scheduled (Paramètres): a model, and the intervals of « Ma boîte ». */
export interface ModelChoice {
  model: DeckModel
  custom: readonly number[]
}

/** The intervals of a model; « Ma boîte » has the user's own. */
export function intervalsOf(model: LeitnerModel, custom: readonly number[]): number[] {
  return [...(model === 'custom' ? custom : LEITNER_PRESETS[model])]
}

export function deckModel(deck: Pick<Deck, 'scheduler' | 'settings'>): DeckModel {
  return deck.scheduler === 'fsrs' ? 'fsrs' : deck.settings.leitner.model
}

export type BoxError = 'count' | 'days' | 'order'

/**
 * Why a box cannot be used, or null: 2 to 10 compartments, whole days from 1 to 36 500, each one
 * at least as long as the one before (spacing grows, P4).
 */
export function boxError(intervals: readonly unknown[]): BoxError | null {
  if (intervals.length < MIN_BOXES || intervals.length > MAX_BOXES) return 'count'
  let previous = 0
  for (const days of intervals) {
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_BOX_DAYS)
      return 'days'
    if (days < previous) return 'order'
    previous = days
  }
  return null
}

export function isBox(x: unknown): x is number[] {
  return Array.isArray(x) && boxError(x) === null
}

/**
 * FSRS → Leitner (03 §4), an approximation: the compartment whose interval is closest to the
 * stability on a log scale (thresholds: geometric mean of two neighbouring intervals).
 */
export function boxFromStability(stability: number, intervals: readonly number[]): number {
  let box = 1
  for (let i = 1; i < intervals.length; i++)
    if (stability >= Math.sqrt((intervals[i - 1] ?? 1) * (intervals[i] ?? 1))) box = i + 1
  return box
}

/**
 * A box with fewer compartments (another model, a shorter « Ma boîte »): the card keeps its
 * compartment, at most the last one, and its due date (03 §4). Null when nothing changes.
 */
export function capBox(card: Card, count: number, now: number): Card | null {
  return card.box > count ? { ...card, box: count, updatedAt: now } : null
}

/**
 * M19 migration (Dexie version 7, backups before schema 8): the intervals a deck changed by hand
 * (M9) become « Ma boîte », those of the most recently changed deck when several did. Null when
 * every deck kept the seven-compartment box.
 */
export function customBoxOf(
  decks: readonly {
    updatedAt: number
    settings: { leitner: { model: string; intervals: unknown } }
  }[],
): number[] | null {
  let found: { updatedAt: number; intervals: number[] } | null = null
  for (const deck of decks) {
    const { model, intervals } = deck.settings.leitner
    if (model !== 'custom' || !isBox(intervals)) continue
    if (!found || deck.updatedAt > found.updatedAt) found = { updatedAt: deck.updatedAt, intervals }
  }
  return found && [...found.intervals]
}

export function sameBox(a: unknown, b: readonly number[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((days, i) => days === b[i])
}
