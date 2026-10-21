import { APP_VERSION } from '../config/app'
import { mediaRefs } from '../domain/text'
import type { Deck, Media, NoteType } from '../domain/types'
import {
  buildRpkg,
  packageSettings,
  type PackageDeck,
  type RpkgContent,
  type RpkgManifest,
} from '../export/rpkg'
import { RepoError } from './errors'
import { db, SCHEMA_VERSION } from './schema'

/** What the author says about a package: shown before it is imported. */
export type RpkgDetails = Pick<RpkgManifest, 'title' | 'description' | 'author' | 'licence'>

function packageDeck(deck: Deck): PackageDeck {
  const out: PackageDeck = {
    id: deck.id,
    name: deck.name,
    parentId: deck.parentId ?? null,
    settings: packageSettings(deck.settings),
  }
  if (deck.description) out.description = deck.description
  return out
}

/**
 * A deck and its sub-decks, their notes, the note types and media those use (05 §5), read in
 * one read-only transaction (a consistent snapshot); media bytes are read afterwards.
 */
export async function gatherRpkg(deckId: string): Promise<RpkgContent> {
  const rows = await db.transaction(
    'r',
    [db.decks, db.notes, db.cards, db.noteTypes, db.media],
    async () => {
      const root = await db.decks.get(deckId)
      if (!root) throw new RepoError('deckNotFound')
      const decks = [root, ...(await db.decks.where('parentId').equals(deckId).toArray())]
      const notes = await db.notes
        .where('deckId')
        .anyOf(decks.map((d) => d.id))
        .toArray()
      const cards = await db.cards
        .where('noteId')
        .anyOf(notes.map((n) => n.id))
        .count()
      const typeIds = new Set(notes.flatMap((n) => (n.noteTypeId ? [n.noteTypeId] : [])))
      const noteTypes = await db.noteTypes.bulkGet([...typeIds])
      const names = new Set<string>()
      for (const note of notes)
        for (const field of note.fields) {
          const refs = mediaRefs(field)
          for (const name of [...refs.images, ...refs.sounds]) names.add(name)
        }
      const media = await db.media.bulkGet([...names])
      return {
        decks,
        notes,
        cards,
        noteTypes: noteTypes.filter((t): t is NoteType => t !== undefined),
        media: media.filter((m): m is Media => m !== undefined),
      }
    },
  )
  const media = await Promise.all(
    rows.media.map(async ({ name, mime, size, sha256, createdAt, blob }) => ({
      meta: { name, mime, size, sha256, createdAt },
      data: new Uint8Array(await blob.arrayBuffer()),
    })),
  )
  return {
    decks: rows.decks.map(packageDeck),
    noteTypes: rows.noteTypes,
    notes: rows.notes,
    media,
    cards: rows.cards,
  }
}

/** The `.rpkg` of a deck: its id names the package, so exporting it again keeps the same one. */
export async function exportRpkg(
  deckId: string,
  details: RpkgDetails,
  now: number,
): Promise<{ blob: Blob; notes: number }> {
  const content = await gatherRpkg(deckId)
  const meta = { ...details, id: deckId, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION }
  const bytes = buildRpkg(content, { ...meta, exportedAt: now })
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' })
  return { blob, notes: content.notes.length }
}
