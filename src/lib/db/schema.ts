import Dexie, { type EntityTable } from 'dexie'
import type { Card, Deck, Media, Note, NoteType, Review, Setting } from '../domain/types'

export const DB_NAME = 'recto'
/**
 * Current data schema version, written in backups (02-DATA-MODEL §5). 2 (V1) adds the
 * `image_occlusion` note type: older versions refuse such backups instead of dropping notes.
 * 3 (M8) adds the `noteTypes` table and `custom` notes (Dexie version 2).
 */
export const SCHEMA_VERSION = 3

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
  noteTypes!: EntityTable<NoteType, 'id'>

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
    // M8: custom note types. A new table and an index on an optional field: nothing to upgrade.
    this.version(2).stores({
      notes: 'id, deckId, modelType, noteTypeId, *tags, sourceGuid, updatedAt',
      noteTypes: 'id, name, sourceId',
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
