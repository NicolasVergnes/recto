/**
 * Recto deck package `.rpkg` (05-IMPORT-EXPORT §5, ADR-014): a deck and its sub-decks, their
 * notes, note types and media, without progress — to share a deck or bring it back. Pure:
 * content in, bytes out; `db/export-rpkg.ts` gathers the content.
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { DeckSettings, Note, NoteType } from '../domain/types'
import type { MediaMeta } from '../import/validate'

export const RPKG_EXTENSION = 'rpkg'

/** The deck settings a package carries: all but the scheduler's, chosen at import. */
export type PackageSettings = Partial<Omit<DeckSettings, 'fsrs' | 'leitner'>>

export interface PackageDeck {
  id: string
  name: string
  /** A sub-deck names its parent, a deck of the same package. */
  parentId: string | null
  description?: string
  settings: PackageSettings
}

/** A note as stored; `suspended` asks for its cards to be created suspended. */
export type PackageNote = Note & { suspended?: boolean }

/** `manifest.json` of a `.rpkg`. */
export interface RpkgManifest {
  format: 'recto-deck'
  /** The data schema of its notes and note types, as in backups (02-DATA-MODEL §5). */
  schemaVersion: number
  /** The id of its top deck: exporting the same deck again keeps it. */
  id: string
  title: string
  description?: string
  author?: string
  licence?: string
  appVersion: string
  exportedAt: number
  counts: { decks: number; noteTypes: number; notes: number; cards: number; media: number }
}

export interface RpkgContent {
  decks: PackageDeck[]
  noteTypes: NoteType[]
  notes: PackageNote[]
  media: { meta: MediaMeta; data: Uint8Array<ArrayBuffer> }[]
  /** Cards of the notes, for the summary only: an import makes them from the notes. */
  cards: number
}

export type RpkgMeta = Omit<RpkgManifest, 'format' | 'counts'>

export function packageSettings(settings: DeckSettings): PackageSettings {
  const { fsrs: _fsrs, leitner: _leitner, ...carried } = settings
  return carried
}

export function buildRpkg(content: RpkgContent, meta: RpkgMeta): Uint8Array {
  const manifest: RpkgManifest = {
    format: 'recto-deck',
    ...meta,
    counts: {
      decks: content.decks.length,
      noteTypes: content.noteTypes.length,
      notes: content.notes.length,
      cards: content.cards,
      media: content.media.length,
    },
  }
  const data = {
    decks: content.decks,
    noteTypes: content.noteTypes,
    notes: content.notes,
    media: content.media.map((m) => m.meta),
  }
  const files: Zippable = {
    'manifest.json': [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
    'data.json': [strToU8(JSON.stringify(data)), { level: 6 }],
  }
  // Images and sounds are compressed already: stored as they are.
  for (const m of content.media) files[`media/${m.meta.name}`] = [m.data, { level: 0 }]
  return zipSync(files)
}
