/**
 * Writes an import plan (05 §1): batches of 500 notes, one transaction per batch (a failure
 * never leaves half a batch), progress between batches, cancellable — batches already written
 * stay, and the report says so. A batch of updated notes is written with the cards they gain,
 * the reviews of those cards and the removal of the cards they lose, so that a note never stays
 * with cards that do not match its content (invariant 2); the review log of a removed card is
 * not touched (invariant 3).
 */
import type { ImportPlan, ImportReport } from '../import/plan'
import type { Media, Note } from '../domain/types'
import { sha256Hex } from '../media/hash'
import { db } from './schema'

export const IMPORT_BATCH = 500

export interface ApplyOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  batchSize?: number
  now?: number
}

export async function applyImportPlan(
  plan: ImportPlan,
  options: ApplyOptions = {},
): Promise<ImportReport> {
  const report: ImportReport = { ...plan.report, errors: [...plan.report.errors] }
  const size = options.batchSize ?? IMPORT_BATCH
  const now = options.now ?? Date.now()

  // Hashes are computed before opening a transaction (dexie-local-first §7).
  const media: Media[] = []
  for (const m of plan.media) {
    media.push({
      name: m.name,
      blob: m.blob,
      mime: m.mime,
      size: m.blob.size,
      sha256: await sha256Hex(m.blob),
      createdAt: now,
    })
  }
  await db.transaction('rw', db.decks, db.media, db.noteTypes, async () => {
    await db.decks.bulkAdd(plan.decks)
    await db.noteTypes.bulkAdd(plan.noteTypes ?? [])
    await db.media.bulkPut(media)
  })
  report.mediaImported = media.length

  const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
    const groups = new Map<string, T[]>()
    for (const row of rows) {
      const group = groups.get(key(row))
      if (group) group.push(row)
      else groups.set(key(row), [row])
    }
    return groups
  }
  const cardsByNote = groupBy(plan.cards, (c) => c.noteId)
  const reviewsByCard = groupBy(plan.reviews, (r) => r.cardId)
  const removedByNote = groupBy(plan.removedCards ?? [], (c) => c.noteId)
  /** What goes into the transaction of a batch of notes besides the notes themselves. */
  const rowsOf = (batch: readonly Note[]) => {
    const cards = batch.flatMap((n) => cardsByNote.get(n.id) ?? [])
    const reviews = cards.flatMap((c) => reviewsByCard.get(c.id) ?? [])
    const removed = batch.flatMap((n) => removedByNote.get(n.id) ?? []).map((c) => c.id)
    return { cards, reviews, removed }
  }

  const total = plan.notes.length + plan.updates.length
  let done = 0
  let notes = 0
  let cards = 0
  let reviews = 0
  let removed = 0
  options.onProgress?.(0, total)
  for (let i = 0; i < plan.notes.length; i += size) {
    if (options.signal?.aborted) {
      report.cancelled = true
      break
    }
    const batch = plan.notes.slice(i, i + size)
    const rows = rowsOf(batch)
    await db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
      await db.notes.bulkAdd(batch)
      await db.cards.bulkAdd(rows.cards)
      await db.reviews.bulkAdd(rows.reviews)
    })
    notes += batch.length
    cards += rows.cards.length
    reviews += rows.reviews.length
    done += batch.length
    options.onProgress?.(done, total)
  }
  let updated = 0
  for (let i = 0; i < plan.updates.length && !report.cancelled; i += size) {
    if (options.signal?.aborted) {
      report.cancelled = true
      break
    }
    const batch = plan.updates.slice(i, i + size)
    const rows = rowsOf(batch)
    await db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
      await db.notes.bulkPut(batch)
      await db.cards.bulkDelete(rows.removed)
      await db.cards.bulkAdd(rows.cards)
      await db.reviews.bulkAdd(rows.reviews)
    })
    updated += batch.length
    cards += rows.cards.length
    reviews += rows.reviews.length
    removed += rows.removed.length
    done += batch.length
    options.onProgress?.(done, total)
  }
  report.notesCreated = notes
  report.cardsCreated = cards
  report.cardsRemoved = removed
  report.reviewsImported = reviews
  report.notesUpdated = updated
  return report
}

/** Everything an import planner needs to know about the current collection. */
export async function existingCollection() {
  const [decks, notes, cards, mediaNames] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.media.toCollection().primaryKeys(),
  ])
  return { decks, notes, cards, mediaNames: new Set(mediaNames) }
}

/**
 * Current decks, notes, note types, cards (one query for all: a re-import reconciles those of
 * the notes it updates) and media hashes, for the `.apkg` planner.
 */
export async function existingForApkg() {
  const [decks, notes, noteTypes, cards, media] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.noteTypes.toArray(),
    db.cards.toArray(),
    db.media.toArray(),
  ])
  return { decks, notes, noteTypes, cards, media: new Map(media.map((m) => [m.name, m.sha256])) }
}
