import Dexie, { type EntityTable } from 'dexie'
import type { Card, Deck, Media, Note, Review, Setting } from '../domain/types'

export const DB_NAME = 'recto'
/**
 * Current data schema version, written in backups (02-DATA-MODEL §5). 2 (V1) adds the
 * `image_occlusion` note type: older versions refuse such backups instead of dropping notes.
 * The IndexedDB layout (Dexie `version()` below) did not change.
 */
export const SCHEMA_VERSION = 2

/**
 * IndexedDB schema (02-DATA-MODEL §1). Never edit a published `version()` block: add a new one
 * with an `upgrade()` and a test that opens a database created by the previous version.
 */
export class RectoDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<Review, 'id'>
  media!: EntityTable<Media, 'name'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({
      decks: 'id, parentId, name',
      notes: 'id, deckId, modelType, *tags, sourceGuid, updatedAt',
      cards: 'id, noteId, deckId, due, state, box, [deckId+due], [deckId+state], [noteId+ord]',
      reviews: 'id, cardId, reviewedAt, [cardId+reviewedAt]',
      media: 'name, sha256, createdAt',
      settings: 'key',
    })
  }
}

/** The application database. Tests swap it with `useDatabase()` (ES live binding). */
export let db = new RectoDB()

export function useDatabase(next: RectoDB): void {
  db = next
}

export function newId(): string {
  return crypto.randomUUID()
}
