import type { Card, Deck, Note, NoteType, Review } from '../domain/types'

export type ImportErrorCode =
  | 'emptyFront'
  | 'noCloze'
  | 'noMask'
  | 'noCard'
  | 'tooManyRows'
  | 'emptyFile'
  | 'unknownModel'
  | 'orphanCard'

export interface ImportError {
  /** 1-based line (CSV) or Anki note id; 0 for the whole file. */
  line: number
  code: ImportErrorCode
}

/** What an import produced or skipped (05 §1, §2.3 « Rapport »). */
export interface ImportReport {
  decksCreated: string[]
  notesCreated: number
  /** Cards created: those of the new notes and those an updated note gains. */
  cardsCreated: number
  notesUpdated: number
  /** Cards deleted because the new content of an updated note no longer generates them. */
  cardsRemoved: number
  skipped: number
  reviewsImported: number
  mediaImported: number
  errors: ImportError[]
  missingMedia: string[]
  /** Images referenced by URL: kept as is, never downloaded in V0 (05 §1). */
  remoteMedia: number
  /** Anki note types converted to `basic` (05 §2.3), with the number of merged fields. */
  convertedModels: { name: string; mergedFields: number }[]
  /** Custom note types created (Anki note types kept with their fields and cards, M8). */
  noteTypesCreated: string[]
  /** Anki image occlusion shapes turned into rectangles (ellipses, polygons, rotations). */
  shapesConverted: number
  /** Anki image occlusion shapes left out (text, pixel coordinates, unreadable). */
  shapesSkipped: number
  cancelled: boolean
}

export interface ImportMedia {
  name: string
  blob: Blob
  mime: string
}

/**
 * Everything an importer wants to write; applied by `db/importer.ts` in batches of 500 notes,
 * one transaction per batch.
 *
 * Updating an existing note is more than overwriting its fields: its cards must follow the new
 * content (02-DATA-MODEL §3, invariant 2). A planner that updates notes (`.apkg` re-import, and
 * any importer that matches existing notes) therefore describes, per updated note:
 * - the cards its new content adds, in `cards` (with `noteId` and `deckId` of the updated note),
 *   and their replayed review log, if any, in `reviews`;
 * - the cards it no longer generates, in `removedCards`; their review log is never touched.
 * `reconcileCards` (`domain/notes.ts`) tells which is which. The note, its added cards, their
 * reviews and the removals are written together, in the transaction of the note's batch.
 */
export interface ImportPlan {
  decks: Deck[]
  /** New notes. */
  notes: Note[]
  /** Cards to create: those of the new notes and those the `updates` notes gain. */
  cards: Card[]
  /** Review log rows to add, of the cards in `cards`. */
  reviews: Review[]
  /** Existing notes to overwrite (fields/tags); cards that keep their `ord` and their log stay. */
  updates: Note[]
  /** Cards of the `updates` notes to delete (the review log stays, invariant 3). */
  removedCards?: Pick<Card, 'id' | 'noteId'>[]
  /** Custom note types to create (written before the notes). */
  noteTypes?: NoteType[]
  /** Existing decks whose settings change (M17: formats paused by the import). */
  deckUpdates?: Deck[]
  media: ImportMedia[]
  report: ImportReport
}

export function emptyReport(): ImportReport {
  return {
    decksCreated: [],
    notesCreated: 0,
    cardsCreated: 0,
    notesUpdated: 0,
    cardsRemoved: 0,
    skipped: 0,
    reviewsImported: 0,
    mediaImported: 0,
    errors: [],
    missingMedia: [],
    remoteMedia: 0,
    convertedModels: [],
    noteTypesCreated: [],
    shapesConverted: 0,
    shapesSkipped: 0,
    cancelled: false,
  }
}
