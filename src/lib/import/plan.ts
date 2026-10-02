import type { Card, Deck, Note, NoteType, Review } from '../domain/types'

export type ImportErrorCode =
  'emptyFront' | 'noCloze' | 'noMask' | 'tooManyRows' | 'emptyFile' | 'unknownModel' | 'orphanCard'

export interface ImportError {
  /** 1-based line (CSV) or Anki note id; 0 for the whole file. */
  line: number
  code: ImportErrorCode
}

/** What an import produced or skipped (05 §1, §2.3 « Rapport »). */
export interface ImportReport {
  decksCreated: string[]
  notesCreated: number
  cardsCreated: number
  notesUpdated: number
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

/** Everything an importer wants to write; applied by `db/importer.ts` in batches. */
export interface ImportPlan {
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  reviews: Review[]
  /** Existing notes to overwrite (fields/tags), their cards and log kept. */
  updates: Note[]
  /** Custom note types to create (written before the notes). */
  noteTypes?: NoteType[]
  media: ImportMedia[]
  report: ImportReport
}

export function emptyReport(): ImportReport {
  return {
    decksCreated: [],
    notesCreated: 0,
    cardsCreated: 0,
    notesUpdated: 0,
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
