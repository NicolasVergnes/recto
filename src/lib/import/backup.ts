/**
 * Reading a `.recto.zip` backup (02-DATA-MODEL §5, 05 §3). Pure: bytes in, validated data out.
 * Writing it back is `db/restore.ts`.
 */
import { strFromU8, unzipSync } from 'fflate'
import type { Card, Deck, Note, Review, Setting } from '../domain/types'
import type { BackupManifest } from '../export/backup'
import {
  readAll,
  readCard,
  readDeck,
  readMediaMeta,
  readNote,
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
  notes: Note[]
  cards: Card[]
  reviews: Review[]
  settings: Setting[]
  media: MediaMeta[]
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
 * (05 §3). 1 → 2 only adds a note type: version 1 data is valid as is.
 */
function migrate(data: Record<string, unknown>, _fromVersion: number): Record<string, unknown> {
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
  const notes = readAll(data.notes, readNote)
  const cards = readAll(data.cards, readCard)
  const reviews = readAll(data.reviews, readReview)
  const settings = readAll(data.settings, readSetting)
  const media = readAll(data.media, readMediaMeta)
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
      },
    },
    data: {
      decks: decks.rows,
      notes: notes.rows,
      cards: cards.rows,
      reviews: reviews.rows,
      settings: settings.rows,
      media: media.rows,
    },
    files,
    invalid:
      decks.invalid +
      notes.invalid +
      cards.invalid +
      reviews.invalid +
      settings.invalid +
      media.invalid,
  }
}
