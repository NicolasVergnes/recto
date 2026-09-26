import { mediaRefs } from '../domain/text'
import type { Card, Deck, Media, Note, Review } from '../domain/types'
import type { ApkgExportInput } from '../export/apkg'
import { deckFamily, getNotes } from './repo'
import { db } from './schema'
import { getSetting } from './settings'

/** What to export: a deck with its sub-decks, a selection of notes, or (neither) everything. */
export interface ApkgExportScope {
  deckId?: string
  noteIds?: readonly string[]
}

interface Rows {
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  reviews: Review[]
  media: Media[]
}

/** Notes, their cards and reviews, their decks with parents and their media rows. */
async function readRows(scope: ApkgExportScope): Promise<Rows> {
  const allDecks = await db.decks.toArray()
  if (!scope.noteIds && !scope.deckId) {
    const [notes, cards, reviews] = await Promise.all([
      db.notes.toArray(),
      db.cards.toArray(),
      db.reviews.toArray(),
    ])
    return { decks: allDecks, notes, cards, reviews, media: await mediaOf(notes) }
  }
  const family = scope.deckId ? await deckFamily(scope.deckId) : []
  const notes = scope.noteIds
    ? await getNotes(scope.noteIds)
    : await db.notes.where('deckId').anyOf(family).toArray()
  const cards = await db.cards
    .where('noteId')
    .anyOf(notes.map((n) => n.id))
    .toArray()
  const reviews = await db.reviews
    .where('cardId')
    .anyOf(cards.map((c) => c.id))
    .toArray()
  // An exported deck keeps its (possibly empty) sub-decks; every deck keeps its parent.
  const used = new Set([...family, ...cards.map((c) => c.deckId)])
  const byId = new Map(allDecks.map((d) => [d.id, d]))
  for (const id of [...used]) {
    const parentId = byId.get(id)?.parentId
    if (parentId) used.add(parentId)
  }
  const decks = allDecks.filter((d) => used.has(d.id))
  return { decks, notes, cards, reviews, media: await mediaOf(notes) }
}

async function mediaOf(notes: readonly Note[]): Promise<Media[]> {
  const names = new Set<string>()
  for (const note of notes)
    for (const field of note.fields) {
      const refs = mediaRefs(field)
      for (const name of [...refs.images, ...refs.sounds]) names.add(name)
    }
  const rows = await db.media.bulkGet([...names])
  return rows.filter((m): m is Media => m !== undefined)
}

/**
 * Everything an Anki export needs (05 §4), read in one read-only transaction (a consistent
 * snapshot); media bytes are read afterwards, outside the transaction.
 */
export async function gatherApkgExport(
  scope: ApkgExportScope = {},
): Promise<{ input: ApkgExportInput; dayStartHour: number }> {
  const rows = await db.transaction('r', [db.decks, db.notes, db.cards, db.reviews, db.media], () =>
    readRows(scope),
  )
  const media = await Promise.all(
    rows.media.map(async (m) => ({
      name: m.name,
      data: new Uint8Array(await m.blob.arrayBuffer()),
    })),
  )
  return { input: { ...rows, media }, dayStartHour: await getSetting('dayStartHour') }
}
