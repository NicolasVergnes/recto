/**
 * Restoring a `.recto.zip` (02-DATA-MODEL §5, 05 §3). « Remplacer » empties then refills every
 * table in ONE transaction (nothing is lost if it fails). « Fusionner » matches entities by `id`
 * (and `sourceGuid` for notes): the most recent `updatedAt` wins, review logs are unioned by id.
 */
import { normalizeText } from '../domain/text'
import type { Card, Deck, Media, Note, Review } from '../domain/types'
import type { ParsedBackup } from '../import/backup'
import { db } from './schema'

export type RestoreMode = 'replace' | 'merge'

export interface RestoreReport {
  decks: number
  notes: number
  notesUpdated: number
  cards: number
  reviews: number
  media: number
  missingFiles: number
}

function mediaRows(
  parsed: ParsedBackup,
  keep: (name: string) => boolean,
): { rows: Media[]; missing: number } {
  const rows: Media[] = []
  let missing = 0
  for (const meta of parsed.data.media) {
    if (!keep(meta.name)) continue
    const bytes = parsed.files.get(meta.name)
    if (!bytes) {
      missing++
      continue
    }
    rows.push({ ...meta, blob: new Blob([bytes], { type: meta.mime }), size: bytes.byteLength })
  }
  return { rows, missing }
}

const ALL = () => [db.decks, db.notes, db.cards, db.reviews, db.media, db.settings]

export async function restoreBackup(
  parsed: ParsedBackup,
  mode: RestoreMode,
): Promise<RestoreReport> {
  return mode === 'replace' ? replace(parsed) : merge(parsed)
}

async function replace(parsed: ParsedBackup): Promise<RestoreReport> {
  const { data } = parsed
  const media = mediaRows(parsed, () => true)
  await db.transaction('rw', ALL(), async () => {
    for (const table of ALL()) await table.clear()
    await db.decks.bulkAdd(data.decks)
    await db.notes.bulkAdd(data.notes)
    await db.cards.bulkAdd(data.cards)
    await db.reviews.bulkAdd(data.reviews)
    await db.settings.bulkPut(data.settings)
    await db.media.bulkAdd(media.rows)
  })
  return {
    decks: data.decks.length,
    notes: data.notes.length,
    notesUpdated: 0,
    cards: data.cards.length,
    reviews: data.reviews.length,
    media: media.rows.length,
    missingFiles: media.missing,
  }
}

const cardRecency = (c: Card) => [c.lastReview ?? -1, c.reps] as const

function newer(a: Card, b: Card): boolean {
  const [ra, na] = cardRecency(a)
  const [rb, nb] = cardRecency(b)
  return ra > rb || (ra === rb && na > nb)
}

async function merge(parsed: ParsedBackup): Promise<RestoreReport> {
  const { data } = parsed
  const report: RestoreReport = {
    decks: 0,
    notes: 0,
    notesUpdated: 0,
    cards: 0,
    reviews: 0,
    media: 0,
    missingFiles: 0,
  }
  const existingMedia = new Set(await db.media.toCollection().primaryKeys())
  const media = mediaRows(parsed, (name) => !existingMedia.has(name))
  report.missingFiles = media.missing

  await db.transaction('rw', ALL(), async () => {
    // Decks: by id (newest wins), or by parent + name to respect unique sibling names.
    const decks = new Map((await db.decks.toArray()).map((d) => [d.id, d]))
    const deckIdMap = new Map<string, string>()
    const nameKey = (parentId: string | null | undefined, name: string) =>
      `${parentId ?? ''}\u0000${normalizeText(name)}`
    const byName = new Map([...decks.values()].map((d) => [nameKey(d.parentId, d.name), d.id]))
    const incoming = [...data.decks].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))
    const deckPuts: Deck[] = []
    for (const deck of incoming) {
      const parentId = deck.parentId ? (deckIdMap.get(deck.parentId) ?? deck.parentId) : null
      const local = decks.get(deck.id)
      const sameName = byName.get(nameKey(parentId, deck.name))
      if (local) {
        deckIdMap.set(deck.id, deck.id)
        // Keep the local position in the tree (one nesting level must still hold).
        if (deck.updatedAt > local.updatedAt)
          deckPuts.push({ ...deck, parentId: local.parentId ?? null })
      } else if (sameName) {
        deckIdMap.set(deck.id, sameName)
      } else {
        const next: Deck = { ...deck, parentId }
        deckIdMap.set(deck.id, deck.id)
        decks.set(deck.id, next)
        byName.set(nameKey(parentId, deck.name), deck.id)
        deckPuts.push(next)
        report.decks++
      }
    }
    await db.decks.bulkPut(deckPuts)
    const deckOf = (id: string) => deckIdMap.get(id) ?? id

    // Notes: by id, then by Anki guid; the loser's cards are left out.
    const localNotes = await db.notes.toArray()
    const notesById = new Map(localNotes.map((n) => [n.id, n]))
    const notesByGuid = new Map(
      localNotes.filter((n) => n.sourceGuid).map((n) => [n.sourceGuid, n]),
    )
    const keptNotes = new Map<string, Note>()
    const notePuts: Note[] = []
    for (const raw of data.notes) {
      const note: Note = { ...raw, deckId: deckOf(raw.deckId) }
      const local =
        notesById.get(note.id) ?? (note.sourceGuid ? notesByGuid.get(note.sourceGuid) : undefined)
      if (!local) {
        notePuts.push(note)
        keptNotes.set(note.id, note)
        report.notes++
      } else if (local.id === note.id) {
        const winner = note.updatedAt > local.updatedAt ? note : local
        if (winner === note) {
          notePuts.push(note)
          report.notesUpdated++
        }
        keptNotes.set(note.id, winner)
      } else if (note.updatedAt > local.updatedAt) {
        // Same Anki note under another id: the newer content updates the local note.
        notePuts.push({ ...local, fields: note.fields, tags: note.tags, updatedAt: note.updatedAt })
        report.notesUpdated++
      }
    }
    await db.notes.bulkPut(notePuts)

    // Cards of kept notes: by id, the most recently reviewed wins; deckId follows the note
    // (invariant 1).
    const localCards = new Map((await db.cards.toArray()).map((c) => [c.id, c]))
    const cardPuts: Card[] = []
    const keptCards = new Set<string>()
    for (const raw of data.cards) {
      const note = keptNotes.get(raw.noteId)
      if (!note) continue
      const local = localCards.get(raw.id)
      const card: Card = { ...raw, deckId: note.deckId }
      if (!local) report.cards++
      if (!local || newer(card, local)) cardPuts.push(card)
      else if (local.deckId !== note.deckId) cardPuts.push({ ...local, deckId: note.deckId })
      keptCards.add(raw.id)
    }
    await db.cards.bulkPut(cardPuts)

    // Reviews: union by id, only for cards that exist.
    const localReviews = new Set(await db.reviews.toCollection().primaryKeys())
    const reviews: Review[] = data.reviews.filter(
      (r) => keptCards.has(r.cardId) && !localReviews.has(r.id),
    )
    await db.reviews.bulkAdd(reviews)
    report.reviews = reviews.length

    // Settings: only keys missing locally; media: only names missing locally.
    const localSettings = new Set(await db.settings.toCollection().primaryKeys())
    await db.settings.bulkAdd(data.settings.filter((s) => !localSettings.has(s.key)))
    await db.media.bulkAdd(media.rows)
    report.media = media.rows.length
  })
  return report
}
