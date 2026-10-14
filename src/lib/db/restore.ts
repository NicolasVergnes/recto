/**
 * Restoring a `.recto.zip` (02-DATA-MODEL §5, 05 §3). « Remplacer » empties then refills every
 * table in ONE transaction (nothing is lost if it fails). « Fusionner » matches entities by `id`
 * (and `sourceGuid` for notes): the most recent `updatedAt` wins, review logs are unioned by id,
 * and the cards of every merged note are reconciled with the content that won (invariant 2).
 * Both keep this device's own settings (M12). The merge also follows the deletions of both
 * devices (M12): a deleted row never comes back unless it changed after its deletion.
 */
import { makeCard } from '../domain/defaults'
import { byRecency, cardOrds, reconcileCards } from '../domain/notes'
import { mediaRefs, normalizeText } from '../domain/text'
import type {
  Card,
  Deck,
  Deletion,
  DeletionTable,
  Media,
  Note,
  NoteType,
  Setting,
} from '../domain/types'
import type { ParsedBackup } from '../import/backup'
import { deletionId, deletionRows } from './deletions'
import { db, newId } from './schema'
import { SHARED_SETTINGS } from './settings'

export type RestoreMode = 'replace' | 'merge'

export interface RestoreReport {
  decks: number
  notes: number
  notesUpdated: number
  /** Cards added: the backup's for an ord the note lacked, and new ones for an ord no copy had. */
  cards: number
  /** Local cards deleted because the winning content of their note no longer generates them. */
  cardsRemoved: number
  reviews: number
  media: number
  missingFiles: number
  /** Local decks, notes and note types deleted because the other device deleted them (M12). */
  deleted: number
  /** Media of the backup kept out: a local file has its name with another content (M12). */
  mediaConflicts: number
}

function mediaRows(
  parsed: ParsedBackup,
  keep: (name: string, sha256: string) => boolean,
): { rows: Media[]; missing: number } {
  const rows: Media[] = []
  let missing = 0
  for (const meta of parsed.data.media) {
    if (!keep(meta.name, meta.sha256)) continue
    const bytes = parsed.files.get(meta.name)
    if (!bytes) {
      missing++
      continue
    }
    rows.push({ ...meta, blob: new Blob([bytes], { type: meta.mime }), size: bytes.byteLength })
  }
  return { rows, missing }
}

const ALL = () => [
  db.decks,
  db.noteTypes,
  db.notes,
  db.cards,
  db.reviews,
  db.media,
  db.settings,
  db.deletions,
]

/** Settings another device may give: the collection's, never this device's own (M12). */
const sharedOnly = (settings: readonly Setting[]) =>
  settings.filter((s) => SHARED_SETTINGS.has(s.key))

export async function restoreBackup(
  parsed: ParsedBackup,
  mode: RestoreMode,
  now = Date.now(),
): Promise<RestoreReport> {
  return mode === 'replace' ? replace(parsed) : merge(parsed, now)
}

async function replace(parsed: ParsedBackup): Promise<RestoreReport> {
  const { data } = parsed
  const media = mediaRows(parsed, () => true)
  await db.transaction('rw', ALL(), async () => {
    const own = (await db.settings.toArray()).filter((s) => !SHARED_SETTINGS.has(s.key))
    for (const table of ALL()) await table.clear()
    await db.decks.bulkAdd(data.decks)
    await db.noteTypes.bulkAdd(data.noteTypes)
    await db.notes.bulkAdd(data.notes)
    await db.cards.bulkAdd(data.cards)
    await db.reviews.bulkAdd(data.reviews)
    await db.settings.bulkPut([...sharedOnly(data.settings), ...own])
    await db.media.bulkAdd(media.rows)
    await db.deletions.bulkPut(data.deletions)
  })
  return {
    decks: data.decks.length,
    notes: data.notes.length,
    notesUpdated: 0,
    cards: data.cards.length,
    cardsRemoved: 0,
    reviews: data.reviews.length,
    media: media.rows.length,
    missingFiles: media.missing,
    deleted: 0,
    mediaConflicts: 0,
  }
}

/**
 * The deletions known after the merge: both devices', the latest per row. `gone(table, id, at)`
 * says whether a row dated `at` (its `updatedAt`, `reviewedAt` for a review, `createdAt` for a
 * media) was deleted afterwards (or at the same time): it is then neither kept nor brought back.
 */
function deletionIndex(local: readonly Deletion[], incoming: readonly Deletion[]) {
  const all = new Map(local.map((d) => [d.id, d]))
  for (const d of incoming) {
    const known = all.get(d.id)
    if (!known || d.deletedAt > known.deletedAt) all.set(d.id, d)
  }
  const gone = (table: DeletionTable, id: string, at: number) =>
    (all.get(deletionId(table, id))?.deletedAt ?? -Infinity) >= at
  return { all, gone }
}

/** Copies of one card: the most recently changed wins (M12), then the most recently reviewed. */
const newerCard = (a: Card, b: Card) => b.updatedAt - a.updatedAt || byRecency(a, b)

/**
 * The cards of the notes a merge kept or updated (`merged`: backup note id → the note as stored).
 * Every such note ends up with exactly the cards its winning content generates (invariant 2):
 * - candidates are its local cards and the backup's (minus those deleted after their last change),
 *   moved onto it when it was matched by Anki guid under another id (its deck follows the note,
 *   invariant 1); copies of one card, same id, resolve to the most recently changed one;
 * - then `reconcileCards`: a card whose ord the content no longer generates, or a second card for
 *   an ord (two devices made the card of the same new hole), is deleted unless it is the most
 *   recently reviewed, its review log kept; an ord left without any card gets a new one.
 * Returns the ids of the local cards this merge deletes for the first time (not those already deleted by the
 * other device, whose deletion is already known).
 */
async function mergeCards(
  parsed: ParsedBackup,
  merged: ReadonlyMap<string, Note>,
  types: ReadonlyMap<string, NoteType>,
  gone: (table: DeletionTable, id: string, at: number) => boolean,
  now: number,
  report: RestoreReport,
): Promise<{ removed: string[] }> {
  const localCards = await db.cards.toArray()
  const stored = new Map(localCards.map((c) => [c.id, c]))
  const notes = new Map([...merged.values()].map((n) => [n.id, n]))
  const candidates = new Map<string, Map<string, Card>>()
  const offer = (card: Card) => {
    const copies = candidates.get(card.noteId) ?? new Map<string, Card>()
    const have = copies.get(card.id)
    if (!have || newerCard(card, have) < 0) copies.set(card.id, card)
    candidates.set(card.noteId, copies)
  }
  const goneCards: string[] = []
  const removed: string[] = []
  for (const card of localCards) {
    // A local card deleted by the other device after its last change goes (its log is kept).
    if (gone('cards', card.id, card.updatedAt)) {
      goneCards.push(card.id)
      report.cardsRemoved++
    } else if (notes.has(card.noteId)) offer(card)
  }
  for (const raw of parsed.data.cards) {
    const note = merged.get(raw.noteId)
    if (!note) continue
    if (!gone('cards', raw.id, raw.updatedAt))
      offer({ ...raw, noteId: note.id, deckId: note.deckId })
  }

  const puts: Card[] = []
  for (const note of notes.values()) {
    const cards = [...(candidates.get(note.id)?.values() ?? [])]
    const type = note.noteTypeId ? types.get(note.noteTypeId) : undefined
    const wanted = cardOrds(note, type)
    // Content that generates no card is not something the app writes: its cards are left alone.
    const result =
      wanted.length > 0 ? reconcileCards(cards, wanted) : { keep: cards, create: [], remove: [] }
    for (const card of result.keep) {
      const was = stored.get(card.id)
      if (!was) report.cards++
      if (was !== card || card.deckId !== note.deckId) puts.push({ ...card, deckId: note.deckId })
    }
    for (const ord of result.create) {
      puts.push(makeCard(note, ord, newId(), now))
      report.cards++
    }
    for (const card of result.remove) {
      if (!stored.has(card.id)) continue
      removed.push(card.id)
      report.cardsRemoved++
    }
  }
  await db.cards.bulkDelete([...goneCards, ...removed])
  await db.cards.bulkPut(puts)
  return { removed }
}

async function merge(parsed: ParsedBackup, now: number): Promise<RestoreReport> {
  const { data } = parsed
  const report: RestoreReport = {
    decks: 0,
    notes: 0,
    notesUpdated: 0,
    cards: 0,
    cardsRemoved: 0,
    reviews: 0,
    media: 0,
    missingFiles: 0,
    deleted: 0,
    mediaConflicts: 0,
  }
  const localMedia = new Map((await db.media.toArray()).map((m) => [m.name, m.sha256]))
  const media = mediaRows(parsed, (name, sha256) => {
    const local = localMedia.get(name)
    if (local !== undefined && local !== sha256) report.mediaConflicts++
    return local === undefined
  })
  report.missingFiles = media.missing

  await db.transaction('rw', ALL(), async () => {
    const { all: deletions, gone } = deletionIndex(await db.deletions.toArray(), data.deletions)
    const removedHere: Deletion[] = []
    const remove = (table: DeletionTable, ids: readonly string[]) =>
      removedHere.push(...deletionRows(table, ids, now))

    // Decks: by id (newest wins), or by parent + name to respect unique sibling names. Decks
    // deleted on either side are settled at the end, once the notes are known.
    const decks = new Map((await db.decks.toArray()).map((d) => [d.id, d]))
    const deckIdMap = new Map<string, string>()
    const deletedDecks = new Map<string, Deck>()
    const nameKey = (parentId: string | null | undefined, name: string) =>
      `${parentId ?? ''}\u0000${normalizeText(name)}`
    const byName = new Map([...decks.values()].map((d) => [nameKey(d.parentId, d.name), d.id]))
    const incoming = [...data.decks].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))
    const deckPuts: Deck[] = []
    for (const deck of incoming) {
      const parentId = deck.parentId ? (deckIdMap.get(deck.parentId) ?? deck.parentId) : null
      const local = decks.get(deck.id)
      const sameName = byName.get(nameKey(parentId, deck.name))
      if (gone('decks', deck.id, deck.updatedAt)) {
        deckIdMap.set(deck.id, deck.id)
        deletedDecks.set(deck.id, { ...deck, parentId })
      } else if (local) {
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

    // Note types: by id, the most recently edited wins; deleted ones are settled at the end.
    const localTypes = new Map((await db.noteTypes.toArray()).map((t) => [t.id, t]))
    const deletedTypes = new Map<string, NoteType>()
    const typePuts: NoteType[] = []
    for (const t of data.noteTypes) {
      const local = localTypes.get(t.id)
      if (gone('noteTypes', t.id, t.updatedAt)) deletedTypes.set(t.id, t)
      else if (!local || t.updatedAt > local.updatedAt) typePuts.push(t)
    }
    await db.noteTypes.bulkPut(typePuts)
    for (const type of typePuts) localTypes.set(type.id, type)

    // Notes: a local note deleted by the other device after its last change goes, with its
    // cards (their log: see Reviews below). Then by id, then by Anki guid. `merged` maps
    // each backup note kept or used to update a local one to the note as stored; a note matched
    // by guid that is not newer is left out, with its cards.
    const goneNotes: string[] = []
    const localNotes = (await db.notes.toArray()).filter((n) => {
      if (!gone('notes', n.id, n.updatedAt)) return true
      goneNotes.push(n.id)
      return false
    })
    await db.notes.bulkDelete(goneNotes)
    report.deleted += goneNotes.length
    const notesById = new Map(localNotes.map((n) => [n.id, n]))
    const notesByGuid = new Map(
      localNotes.filter((n) => n.sourceGuid).map((n) => [n.sourceGuid, n]),
    )
    const merged = new Map<string, Note>()
    const leftOut = new Set<string>()
    const notePuts: Note[] = []
    for (const raw of data.notes) {
      const note: Note = { ...raw, deckId: deckOf(raw.deckId) }
      if (gone('notes', note.id, note.updatedAt)) continue
      const local =
        notesById.get(note.id) ?? (note.sourceGuid ? notesByGuid.get(note.sourceGuid) : undefined)
      if (!local) {
        notePuts.push(note)
        merged.set(note.id, note)
        report.notes++
      } else if (local.id === note.id) {
        const winner = note.updatedAt > local.updatedAt ? note : local
        if (winner === note) {
          notePuts.push(note)
          report.notesUpdated++
        }
        merged.set(note.id, winner)
      } else if (note.updatedAt > local.updatedAt) {
        // Same Anki note under another id: the newer content updates the local note.
        const next: Note = {
          ...local,
          fields: note.fields,
          tags: note.tags,
          updatedAt: note.updatedAt,
        }
        notePuts.push(next)
        merged.set(note.id, next)
        report.notesUpdated++
      } else leftOut.add(note.id)
    }
    await db.notes.bulkPut(notePuts)

    // Cards: of the merged notes only, reconciled with the content that won (invariant 2); the
    // cards of a note that no longer exists go.
    const { removed } = await mergeCards(parsed, merged, localTypes, gone, now, report)
    const noteIds = new Set(await db.notes.toCollection().primaryKeys())
    const orphans = (await db.cards.toArray())
      .filter((c) => !noteIds.has(c.noteId))
      .map((c) => c.id)
    await db.cards.bulkDelete(orphans)
    remove('cards', [...removed, ...orphans])

    // Reviews (P10): union by id, minus the answers deleted on either side (undone, or deleted
    // with their note by a device that knew them). An answer given on one device to a card the
    // other deleted, without knowing it, stays in the log of both, like the log of a removed
    // card: whatever the order of the merges, both devices end with the same log. The log of the
    // backup cards left out (a note matched by guid that is not newer) is not taken.
    const goneReviews = (await db.reviews.toArray())
      .filter((r) => gone('reviews', r.id, r.reviewedAt))
      .map((r) => r.id)
    await db.reviews.bulkDelete(goneReviews)
    const localReviews = new Set(await db.reviews.toCollection().primaryKeys())
    const leftOutCards = new Set(data.cards.filter((c) => leftOut.has(c.noteId)).map((c) => c.id))
    const reviews = data.reviews.filter(
      (r) =>
        !leftOutCards.has(r.cardId) &&
        !localReviews.has(r.id) &&
        !gone('reviews', r.id, r.reviewedAt),
    )
    await db.reviews.bulkAdd(reviews)
    report.reviews = reviews.length

    // Decks and note types deleted on either side: deleted unless a note still uses them, in
    // which case they are kept and dated now, so that every device keeps them from now on.
    const notes = await db.notes.toArray()
    const usedDecks = new Set(notes.map((n) => n.deckId))
    for (const id of [...usedDecks]) {
      const parent = (decks.get(id) ?? deletedDecks.get(id))?.parentId
      if (parent) usedDecks.add(parent)
    }
    const kept: Deck[] = []
    const goneDecks: string[] = []
    for (const deck of (await db.decks.toArray()).filter((d) => gone('decks', d.id, d.updatedAt)))
      if (usedDecks.has(deck.id)) kept.push({ ...deck, updatedAt: now })
      else goneDecks.push(deck.id)
    for (const [id, deck] of deletedDecks)
      if (usedDecks.has(id) && !decks.has(id)) kept.push({ ...deck, updatedAt: now })
    await db.decks.bulkDelete(goneDecks)
    await db.decks.bulkPut(kept)
    report.deleted += goneDecks.length

    const usedTypes = new Set(notes.map((n) => n.noteTypeId).filter((id) => id !== undefined))
    const keptTypes: NoteType[] = []
    const goneTypes: string[] = []
    for (const type of (await db.noteTypes.toArray()).filter((t) =>
      gone('noteTypes', t.id, t.updatedAt),
    ))
      if (usedTypes.has(type.id)) keptTypes.push({ ...type, updatedAt: now })
      else goneTypes.push(type.id)
    for (const [id, type] of deletedTypes)
      if (usedTypes.has(id) && !localTypes.has(id)) keptTypes.push({ ...type, updatedAt: now })
    await db.noteTypes.bulkDelete(goneTypes)
    await db.noteTypes.bulkPut(keptTypes)
    report.deleted += goneTypes.length

    // Settings: the collection's own (day start, daily limit), the most recent value wins;
    // this device's settings never come from another one.
    const localSettings = new Map((await db.settings.toArray()).map((s) => [s.key, s]))
    await db.settings.bulkPut(
      sharedOnly(data.settings).filter((s) => {
        const local = localSettings.get(s.key)
        return !local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)
      }),
    )

    // Media: only names missing locally, unless deleted after their creation and used by no
    // note (a file a note shows is kept: the note won).
    const used = new Set<string>()
    for (const note of notes)
      for (const field of note.fields) {
        const refs = mediaRefs(field)
        for (const name of [...refs.images, ...refs.sounds]) used.add(name)
      }
    const goneMedia: string[] = []
    const keptMedia: string[] = []
    for (const m of await db.media.toArray())
      if (gone('media', m.name, m.createdAt))
        (used.has(m.name) ? keptMedia : goneMedia).push(m.name)
    await db.media.bulkDelete(goneMedia)
    const added = media.rows.filter((m) => !gone('media', m.name, m.createdAt) || used.has(m.name))
    keptMedia.push(...added.map((m) => m.name))
    await db.media.bulkAdd(added)
    report.media = added.length

    // Every deletion either device knows, the latest per row, plus those this merge makes (rows
    // `gone` are already covered): a third device merging this one learns them too. A row kept
    // above is newer than its deletion, which then no longer applies.
    for (const d of removedHere) deletions.set(d.id, d)
    for (const deck of kept) deletions.delete(deletionId('decks', deck.id))
    for (const type of keptTypes) deletions.delete(deletionId('noteTypes', type.id))
    for (const name of keptMedia) deletions.delete(deletionId('media', name))
    await db.deletions.clear()
    await db.deletions.bulkPut([...deletions.values()])
  })
  return report
}
