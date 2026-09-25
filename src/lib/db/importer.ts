/**
 * Writes an import plan (05 §1): batches of 500 notes, one transaction per batch (a failure
 * never leaves half a batch), progress between batches, cancellable — batches already written
 * stay, and the report says so.
 */
import type { ImportPlan, ImportReport } from '../import/plan'
import type { Media } from '../domain/types'
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
  await db.transaction('rw', db.decks, db.media, async () => {
    await db.decks.bulkAdd(plan.decks)
    await db.media.bulkPut(media)
  })
  report.mediaImported = media.length

  const cardsByNote = new Map<string, typeof plan.cards>()
  for (const card of plan.cards)
    cardsByNote.set(card.noteId, [...(cardsByNote.get(card.noteId) ?? []), card])
  const reviewsByCard = new Map<string, typeof plan.reviews>()
  for (const r of plan.reviews)
    reviewsByCard.set(r.cardId, [...(reviewsByCard.get(r.cardId) ?? []), r])

  const total = plan.notes.length + plan.updates.length
  let done = 0
  let notes = 0
  let cards = 0
  let reviews = 0
  options.onProgress?.(0, total)
  for (let i = 0; i < plan.notes.length; i += size) {
    if (options.signal?.aborted) {
      report.cancelled = true
      break
    }
    const batch = plan.notes.slice(i, i + size)
    const batchCards = batch.flatMap((n) => cardsByNote.get(n.id) ?? [])
    const batchReviews = batchCards.flatMap((c) => reviewsByCard.get(c.id) ?? [])
    await db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
      await db.notes.bulkAdd(batch)
      await db.cards.bulkAdd(batchCards)
      await db.reviews.bulkAdd(batchReviews)
    })
    notes += batch.length
    cards += batchCards.length
    reviews += batchReviews.length
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
    await db.notes.bulkPut(batch)
    updated += batch.length
    done += batch.length
    options.onProgress?.(done, total)
  }
  report.notesCreated = notes
  report.cardsCreated = cards
  report.reviewsImported = reviews
  report.notesUpdated = updated
  return report
}

/** Everything an import planner needs to know about the current collection. */
export async function existingCollection() {
  const [decks, notes, mediaNames] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.media.toCollection().primaryKeys(),
  ])
  return { decks, notes, mediaNames: new Set(mediaNames) }
}
