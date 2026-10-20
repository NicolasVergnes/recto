import { intervalsOf, isBox, LEITNER_PRESETS, sameBox, type ModelChoice } from './leitner'
import type { Card, Deck, DeckSettings, Note } from './types'

export function defaultDeckSettings(): DeckSettings {
  return {
    newPerDay: 20,
    reviewsPerDay: 200,
    newOrder: 'random',
    typedAnswer: false,
    autoplayAudio: true,
    alternateSides: true,
    pausedFormats: [],
    newByFormat: false,
    fsrs: {
      requestRetention: 0.9,
      maximumInterval: 365,
      // P11 with ts-fsrs step semantics: Good on a new card → 10 min, then graduation (≥ 1 day).
      learningSteps: ['10m', '10m'],
      relearningSteps: ['10m'],
      params: null,
      ratingMode: 4,
    },
    leitner: {
      model: 'seven',
      intervals: [...LEITNER_PRESETS.seven],
      allowSure: true,
      failToBox: 1,
    },
  }
}

/**
 * M13 migration of stored deck settings (Dexie version 4 and backups before schema 5): twin
 * burying is gone and new cards come in random order, existing decks included. The deck's
 * `updatedAt` is kept: every device and every backup migrates the same way.
 */
export function migrateDeckSettingsM13(settings: Record<string, unknown>): void {
  delete settings.burySiblings
  settings.newOrder = 'random'
}

/**
 * M17 migration of stored deck settings (Dexie version 6): no format paused, new cards in the
 * deck's order as before. Backups get the same defaults when read (`readSettings`).
 */
export function migrateDeckSettingsM17(settings: Record<string, unknown>): void {
  if (!Array.isArray(settings.pausedFormats)) settings.pausedFormats = []
  if (typeof settings.newByFormat !== 'boolean') settings.newByFormat = false
}

/**
 * M19 migration of stored deck settings (Dexie version 7, backups before schema 8): a deck with
 * the seven-compartment intervals follows that box; one whose intervals were changed by hand (M9)
 * follows « Ma boîte » and keeps them (`customBoxOf` gives « Ma boîte » those intervals).
 */
export function migrateDeckSettingsM19(settings: Record<string, unknown>): void {
  const leitner = settings.leitner
  if (typeof leitner !== 'object' || leitner === null) return
  const box = leitner as Record<string, unknown>
  box.model = sameBox(box.intervals, LEITNER_PRESETS.seven) ? 'seven' : 'custom'
}

export interface NewDeckInput {
  name: string
  parentId?: string | null
  description?: string
  /** FSRS when absent (M19: the app passes the « planificateur des nouveaux paquets »). */
  model?: ModelChoice
}

export function makeDeck(input: NewDeckInput, id: string, now: number): Deck {
  const settings = defaultDeckSettings()
  const custom = input.model?.custom ?? []
  // An unusable « Ma boîte » never reaches a deck: the seven-compartment box instead.
  const chosen = input.model?.model ?? 'fsrs'
  const model = chosen === 'custom' && !isBox(custom) ? 'seven' : chosen
  if (model !== 'fsrs') {
    settings.leitner.model = model
    settings.leitner.intervals = intervalsOf(model, custom)
  }
  const deck: Deck = {
    id,
    name: input.name.trim(),
    parentId: input.parentId ?? null,
    scheduler: model === 'fsrs' ? 'fsrs' : 'leitner',
    settings,
    createdAt: now,
    updatedAt: now,
  }
  if (input.description) deck.description = input.description
  return deck
}

/** A brand-new card: state New, due at creation time (02-DATA-MODEL §2). */
export function makeCard(
  note: Pick<Note, 'id' | 'deckId'>,
  ord: number,
  id: string,
  now: number,
): Card {
  return {
    id,
    noteId: note.id,
    deckId: note.deckId,
    ord,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    suspended: false,
    retired: false,
    flag: 0,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    box: 0,
    sideFlipped: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Scheduling fields of a new card, used by "reset scheduling" (keeps the review log). */
export function resetScheduling(card: Card, now: number): Card {
  return {
    ...card,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    retired: false,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    box: 0,
    sideFlipped: false,
    updatedAt: now,
  }
}
