/** Domain types (02-DATA-MODEL §2). All dates are epoch milliseconds (UTC). */
export type SchedulerKind = 'fsrs' | 'leitner'
export const MODEL_TYPES = ['basic', 'cloze', 'image_occlusion', 'custom'] as const
export type ModelType = (typeof MODEL_TYPES)[number]

export interface FsrsSettings {
  /** 0.80–0.97 in the UI, default 0.90 (P9). */
  requestRetention: number
  /** Days, default 365 (echo of box 7 "every year"). */
  maximumInterval: number
  /** Default ['10m', '10m'] (P11: new card → 10 min → ≥ 1 day; never '1m'). */
  learningSteps: string[]
  relearningSteps: string[]
  /** null = FSRS-6 defaults; otherwise 21 values. */
  params: number[] | null
  /** 4 buttons or 2 (Again/Good). */
  ratingMode: 4 | 2
}

export interface LeitnerSettings {
  /** Days per box, default [1, 2, 7, 30, 90, 180, 365]. */
  intervals: number[]
  /** Default true: "Sûr" button (+2 boxes). */
  allowSure: boolean
  /** Fixed in V0. */
  failToBox: 1
}

export interface DeckSettings {
  newPerDay: number
  reviewsPerDay: number
  newOrder: 'added' | 'random'
  typedAnswer: boolean
  autoplayAudio: boolean
  /** Default true: no two twin cards of a note the same day (03 §5.2, notes.ts `areTwins`). */
  burySiblings: boolean
  /** Default true: a success turns the card over, both schedulers (03 §1.1, scheduler/sides.ts). */
  alternateSides: boolean
  fsrs: FsrsSettings
  leitner: LeitnerSettings
}

export interface Deck {
  id: string
  name: string
  description?: string
  parentId?: string | null
  scheduler: SchedulerKind
  settings: DeckSettings
  createdAt: number
  updatedAt: number
}

/**
 * One card of a custom note type: question and answer templates (Anki syntax, templates.ts).
 * `twoWay` (M16): `front` and `back` are two faces, each asked in turn like a basic note's
 * sides (deck `alternateSides`); `back` then holds the second face only, without `{{FrontSide}}`.
 * Absent: asked one way, as before M16.
 */
export interface CardTemplate {
  name: string
  front: string
  back: string
  twoWay?: boolean
}

/** A note type with named fields and one card per template, like Anki's (02 §2.2, M8). */
/**
 * Styling of an Anki note type: Recto renders cards its own way (ADR-010) but keeps these so
 * that exporting the type back to Anki does not replace them (M10).
 */
export interface AnkiTypeExtras {
  css?: string
  latexPre?: string
  latexPost?: string
  /** Index of the field Anki sorts and searches by (`sortf`). */
  sortField?: number
}

export interface NoteType {
  id: string
  name: string
  /** Field names, in note field order (unique, non-empty). */
  fields: string[]
  /** At least one; a card's `ord` is its template index. */
  templates: CardTemplate[]
  /** Anki note type id on import (re-import reuses the type). */
  sourceId?: number
  /** What the Anki note type had and Recto does not use, given back by the .apkg export (M10). */
  anki?: AnkiTypeExtras
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  deckId: string
  modelType: ModelType
  /** custom only: its NoteType. */
  noteTypeId?: string
  /**
   * basic: [front, back, extra]; cloze: [text, extra]; image_occlusion: [image, masks JSON,
   * header, extra]; custom: one per field of its note type.
   */
  fields: string[]
  tags: string[]
  /** basic only: always asked front → back, even in a deck that alternates (M11). */
  oneWay?: boolean
  source?: string
  /** Anki guid on import (deduplication). */
  sourceGuid?: string
  createdAt: number
  updatedAt: number
}

/** New, Learning, Review, Relearning (same integers as ts-fsrs State). */
export type CardState = 0 | 1 | 2 | 3
export const CardStates = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const

export type Flag = 0 | 1 | 2 | 3 | 4

export interface Card {
  id: string
  noteId: string
  /** Denormalised copy of note.deckId for indexes. */
  deckId: string
  /**
   * basic: 0 (both sides through `sideFlipped`), cloze: index - 1, image_occlusion: mask
   * group - 1, custom: template index.
   */
  ord: number
  due: number
  state: CardState
  reps: number
  lapses: number
  lastReview: number | null
  suspended: boolean
  retired: boolean
  flag: Flag
  // FSRS
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  // Leitner
  /** 0 = not applicable / new, 1..7. */
  box: number
  /** Deck `alternateSides`: true = asks back→front (basic notes and two-way templates, M16). */
  sideFlipped: boolean
  createdAt: number
  /**
   * Last change of any kind (answer, undo, suspend, flag, retire, reset, move, ord…), M12: the
   * most recent copy of a card wins a merge between devices.
   */
  updatedAt: number
}

/** Again, Hard, Good, Easy (same integers as ts-fsrs Rating). Leitner: 1 forgot, 3 ok, 4 sure. */
export type Rating = 1 | 2 | 3 | 4

export interface Review {
  id: string
  cardId: string
  deckId: string
  reviewedAt: number
  rating: Rating
  scheduler: SchedulerKind
  /** Capped at 60 000 for stats. */
  durationMs: number
  // Snapshot before answering (rollback and recomputation)
  stateBefore: CardState
  dueBefore: number
  stabilityBefore: number
  difficultyBefore: number
  boxBefore: number
  learningStepsBefore: number
  lastReviewBefore: number | null
  // Result
  stateAfter: CardState
  dueAfter: number
  scheduledDays: number
  elapsedDays: number
  boxAfter: number
}

export interface Media {
  /** Unique file name, e.g. "a1b2c3d4-drapeau-france.webp". */
  name: string
  blob: Blob
  mime: string
  size: number
  sha256: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
  /** Shared settings only (M12): the most recent value wins a merge between devices. */
  updatedAt?: number
}

/** Tables whose deletions are recorded (M12): a merge never brings a deleted row back. */
export const DELETION_TABLES = ['decks', 'notes', 'cards', 'reviews', 'noteTypes', 'media'] as const
export type DeletionTable = (typeof DELETION_TABLES)[number]

/** A deleted row (« pierre tombale », 02-DATA-MODEL §5): `id` is `<table>:<recordId>`. */
export interface Deletion {
  id: string
  table: DeletionTable
  recordId: string
  deletedAt: number
}
