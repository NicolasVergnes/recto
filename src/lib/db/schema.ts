import Dexie, { type EntityTable } from 'dexie'
import type { Card, Deck, Deletion, Media, Note, NoteType, Review, Setting } from '../domain/types'
import { migrateDeckSettingsM13 } from '../domain/defaults'

export const DB_NAME = 'recto'
/**
 * Current data schema version, written in backups (02-DATA-MODEL §5). 2 (V1) adds the
 * `image_occlusion` note type: older versions refuse such backups instead of dropping notes.
 * 3 (M8) adds the `noteTypes` table and `custom` notes (Dexie version 2). 4 (M12) adds
 * `card.updatedAt`, the `deletions` table and `setting.updatedAt` (Dexie version 3). 5 (M13) drops
 * `settings.burySiblings` of decks and puts their new cards in random order (Dexie version 4). 6
 * (M14, M16) adds the kinds of card of custom note types (`kind`, `field`, `single`), two-way
 * classic templates (`twoWay`), `note.single` and `note.masks` (Dexie version 5): older versions
 * refuse such backups instead of reading a cloze card as a classic one and deleting its cards, or
 * asking a two-way card one way only.
 */
export const SCHEMA_VERSION = 6

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
  deletions!: EntityTable<Deletion, 'id'>

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
    // M12: cards date their last change; deletions are recorded so that a merge between devices
    // never brings a deleted row back. Cards get `updatedAt = lastReview ?? createdAt`.
    this.version(3)
      .stores({
        cards:
          'id, noteId, deckId, due, state, box, updatedAt, [deckId+due], [deckId+state], [noteId+ord]',
        deletions: 'id, table, deletedAt',
      })
      .upgrade((tx) =>
        tx
          .table<Card>('cards')
          .toCollection()
          .modify((card) => {
            card.updatedAt ??= card.lastReview ?? card.createdAt
          }),
      )
    // M13: no more twin burying; new cards in random order, existing decks included.
    this.version(4).upgrade((tx) =>
      tx
        .table<{ settings: Record<string, unknown> }>('decks')
        .toCollection()
        .modify((deck) => migrateDeckSettingsM13(deck.settings)),
    )
    // M14: card kinds. Absent properties keep the previous behaviour: nothing to upgrade. The
    // version only keeps an older copy of the app (still cached) from opening this database and
    // reconciling the cards of a cloze or occlusion template as classic ones.
    this.version(5).stores({})
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
