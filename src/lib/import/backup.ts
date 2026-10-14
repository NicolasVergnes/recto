/**
 * Reading a `.recto.zip` backup (02-DATA-MODEL §5, 05 §3). Pure: bytes in, validated data out.
 * Writing it back is `db/restore.ts`.
 */
import { strFromU8, unzipSync } from 'fflate'
import { migrateDeckSettingsM13 } from '../domain/defaults'
import type { Card, Deck, Deletion, Note, NoteType, Review, Setting } from '../domain/types'
import type { BackupManifest } from '../export/backup'
import {
  readAll,
  readCard,
  readDeck,
  readDeletion,
  readMediaMeta,
  readNote,
  readNoteType,
  readManifest,
  readObject,
  readReview,
  readSetting,
  type MediaMeta,
} from './validate'

export type BackupErrorCode = 'notZip' | 'notBackup' | 'newerVersion' | 'invalidData'

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code)
    this.name = 'BackupError'
  }
}

export interface BackupData {
  decks: Deck[]
  noteTypes: NoteType[]
  notes: Note[]
  cards: Card[]
  reviews: Review[]
  settings: Setting[]
  media: MediaMeta[]
  /** Rows deleted on the exporting device (M12; none in older backups). */
  deletions: Deletion[]
}

export interface ParsedBackup {
  manifest: BackupManifest
  data: BackupData
  /** media/<name> contents. */
  files: Map<string, Uint8Array<ArrayBuffer>>
  /** Rows rejected by validation. */
  invalid: number
}

function json(entries: Record<string, Uint8Array>, name: string): unknown {
  const bytes = entries[name]
  if (!bytes) throw new BackupError('notBackup')
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    throw new BackupError('invalidData')
  }
}

/**
 * Older schema versions are migrated here with the same steps as the Dexie `upgrade()` functions
 * (05 §3). 1 → 2 only adds a note type and 2 → 3 the `noteTypes` table (absent: none); 3 → 4
 * (M12) dates the cards like the Dexie version 3 upgrade (`readCard`) and has no deletions
 * (absent: none); 4 → 5 (M13) puts the new cards of every deck in random order and drops
 * `burySiblings`, like the Dexie version 4 upgrade.
 */
function migrate(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  if (fromVersion < 5 && Array.isArray(data.decks))
    for (const deck of data.decks as unknown[]) {
      const settings = readObject(readObject(deck)?.settings)
      if (settings) migrateDeckSettingsM13(settings)
    }
  return data
}

export function parseBackup(bytes: Uint8Array, currentSchema: number): ParsedBackup {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new BackupError('notZip')
  }
  const m = readManifest(json(entries, 'manifest.json'))
  if (!m) throw new BackupError('notBackup')
  if (m.schemaVersion > currentSchema) throw new BackupError('newerVersion')
  const raw = readObject(json(entries, 'data.json'))
  if (!raw) throw new BackupError('invalidData')
  const data = migrate(raw, m.schemaVersion)
  const decks = readAll(data.decks, readDeck)
  const noteTypes = readAll(data.noteTypes, readNoteType)
  // A custom note without its note type could not be rendered nor edited.
  const typeIds = new Set(noteTypes.rows.map((t) => t.id))
  const notes = readAll(data.notes, (x) => {
    const note = readNote(x)
    return note && (note.modelType !== 'custom' || typeIds.has(note.noteTypeId ?? '')) ? note : null
  })
  const cards = readAll(data.cards, readCard)
  const reviews = readAll(data.reviews, readReview)
  const settings = readAll(data.settings, readSetting)
  const media = readAll(data.media, readMediaMeta)
  const deletions = readAll(data.deletions, readDeletion)
  const files = new Map<string, Uint8Array<ArrayBuffer>>()
  for (const [path, content] of Object.entries(entries)) {
    if (path.startsWith('media/') && path.length > 6)
      files.set(path.slice(6), new Uint8Array(content))
  }
  return {
    manifest: {
      format: 'recto-backup',
      ...m,
      counts: {
        decks: decks.rows.length,
        notes: notes.rows.length,
        cards: cards.rows.length,
        reviews: reviews.rows.length,
        settings: settings.rows.length,
        media: media.rows.length,
        noteTypes: noteTypes.rows.length,
        deletions: deletions.rows.length,
      },
    },
    data: {
      decks: decks.rows,
      noteTypes: noteTypes.rows,
      notes: notes.rows,
      cards: cards.rows,
      reviews: reviews.rows,
      settings: settings.rows,
      media: media.rows,
      deletions: deletions.rows,
    },
    files,
    invalid:
      noteTypes.invalid +
      decks.invalid +
      notes.invalid +
      cards.invalid +
      reviews.invalid +
      settings.invalid +
      media.invalid +
      deletions.invalid,
  }
}
