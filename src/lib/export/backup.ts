import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { APP_VERSION } from '../config/app'
import { db, SCHEMA_VERSION } from '../db/schema'
import { setSetting } from '../db/settings'
import Dexie, { type IndexableType, type Table } from 'dexie'

/** `manifest.json` of a `.recto.zip` (02-DATA-MODEL §5). */
export interface BackupManifest {
  format: 'recto-backup'
  schemaVersion: number
  appVersion: string
  exportedAt: number
  device: string
  counts: Record<'decks' | 'notes' | 'cards' | 'reviews' | 'settings' | 'media', number>
}

export const BACKUP_EXTENSION = 'recto.zip'
const PAGE = 2000

/** Streams a table as a JSON array into a zip entry, page by page (dexie-local-first §5). */
async function pushTable<T extends object>(
  entry: ZipDeflate,
  key: string,
  table: Table<T>,
  map: (row: T) => unknown = (row) => row,
  first = false,
): Promise<number> {
  entry.push(strToU8(`${first ? '' : ','}${JSON.stringify(key)}:[`))
  const keyPath = String(table.schema.primKey.keyPath)
  let last: IndexableType | undefined
  let count = 0
  for (;;) {
    // Keyset pagination on the primary key: constant cost per page.
    const page = last === undefined ? table.orderBy(':id') : table.where(':id').above(last)
    const rows = await page.limit(PAGE).toArray()
    const tail = rows[rows.length - 1]
    if (tail === undefined) break
    last = Dexie.getByKeyPath(tail, keyPath)
    const json = rows.map((r) => JSON.stringify(map(r))).join(',')
    entry.push(strToU8(`${count > 0 ? ',' : ''}${json}`))
    count += rows.length
  }
  entry.push(strToU8(']'))
  return count
}

/**
 * Builds a complete backup: manifest.json, data.json (all tables, media without blobs) and
 * media/<name> (stored as is: media are already compressed). Updates `lastBackupAt`.
 */
export async function createBackup(now: number): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let done: (blob: Blob) => void = () => undefined
  let fail: (e: Error) => void = () => undefined
  const finished = new Promise<Blob>((resolve, reject) => {
    done = resolve
    fail = reject
  })
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err)
    chunks.push(new Uint8Array(chunk))
    if (final) done(new Blob(chunks, { type: 'application/zip' }))
  })

  const manifest: BackupManifest = {
    format: 'recto-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    device: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 120),
    counts: {
      decks: await db.decks.count(),
      notes: await db.notes.count(),
      cards: await db.cards.count(),
      reviews: await db.reviews.count(),
      settings: await db.settings.count(),
      media: await db.media.count(),
    },
  }
  const man = new ZipDeflate('manifest.json', { level: 6 })
  zip.add(man)
  man.push(strToU8(JSON.stringify(manifest, null, 2)), true)

  const data = new ZipDeflate('data.json', { level: 6 })
  zip.add(data)
  data.push(strToU8('{'))
  await pushTable(data, 'decks', db.decks, undefined, true)
  await pushTable(data, 'notes', db.notes)
  await pushTable(data, 'cards', db.cards)
  await pushTable(data, 'reviews', db.reviews)
  await pushTable(data, 'settings', db.settings)
  await pushTable(data, 'media', db.media, ({ name, mime, size, sha256, createdAt }) => ({
    name,
    mime,
    size,
    sha256,
    createdAt,
  }))
  data.push(strToU8('}'), true)

  const names = await db.media.toCollection().primaryKeys()
  for (const name of names) {
    const media = await db.media.get(name)
    if (!media) continue
    const entry = new ZipPassThrough(`media/${name}`)
    zip.add(entry)
    entry.push(new Uint8Array(await media.blob.arrayBuffer()), true)
  }

  zip.end()

  const blob = await finished
  await setSetting('lastBackupAt', now)
  return blob
}
