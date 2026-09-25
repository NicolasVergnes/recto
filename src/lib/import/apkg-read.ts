/**
 * Reading Anki `.apkg` packages, legacy formats only (05-IMPORT-EXPORT §2): zip (fflate) +
 * SQLite (sql.js, given as a parameter so that it is loaded on demand in a worker).
 */
import { strFromU8, unzipSync } from 'fflate'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'

/** The current zstd format (`collection.anki21b`) is refused with an explanation (ADR-005). */
export class Anki21bUnsupported extends Error {
  constructor() {
    super('anki21b')
    this.name = 'Anki21bUnsupported'
  }
}

export type ApkgErrorCode = 'notZip' | 'noCollection' | 'corrupt'

export class ApkgError extends Error {
  constructor(readonly code: ApkgErrorCode) {
    super(code)
    this.name = 'ApkgError'
  }
}

export interface ApkgModel {
  id: string
  name: string
  /** 0 standard, 1 cloze */
  type: number
  fields: string[]
  templates: { name: string; qfmt: string }[]
}

export interface ApkgNote {
  id: number
  guid: string
  mid: string
  /** Modification time, seconds. */
  mod: number
  tags: string[]
  fields: string[]
}

export interface ApkgCard {
  id: number
  nid: number
  did: string
  ord: number
  type: number
  queue: number
  due: number
  ivl: number
  factor: number
  reps: number
  lapses: number
}

export interface ApkgRevlog {
  id: number
  cid: number
  ease: number
  time: number
  type: number
}

export interface ApkgPackage {
  format: 'anki21' | 'anki2'
  /** Collection creation, seconds (base of review `due` in days). */
  crt: number
  models: ApkgModel[]
  decks: { id: string; name: string }[]
  notes: ApkgNote[]
  cards: ApkgCard[]
  revlog: ApkgRevlog[]
  media: { name: string; data: Uint8Array<ArrayBuffer> }[]
  /** Names listed in `media` whose numbered file is absent. */
  missingMedia: string[]
  size: number
}

interface Unpacked {
  format: 'anki21' | 'anki2'
  collection: Uint8Array
  entries: Record<string, Uint8Array>
  mediaMap: Record<string, string>
}

/** Detection order (05 §2.1): anki21b without anki21 → refused; else anki21, else anki2. */
export function unpackApkg(bytes: Uint8Array): Unpacked {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new ApkgError('notZip')
  }
  const anki21 = entries['collection.anki21']
  if (entries['collection.anki21b'] && !anki21) throw new Anki21bUnsupported()
  const collection = anki21 ?? entries['collection.anki2']
  if (!collection) throw new ApkgError('noCollection')
  return {
    format: anki21 ? 'anki21' : 'anki2',
    collection,
    entries,
    mediaMap: readMediaMap(entries.media),
  }
}

function readMediaMap(bytes: Uint8Array | undefined): Record<string, string> {
  if (!bytes) return {}
  try {
    const parsed: unknown = JSON.parse(strFromU8(bytes))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

type Row = Record<string, SqlValue>

function query(db: Database, sql: string): Row[] {
  const [result] = db.exec(sql)
  if (!result) return []
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((c, i) => [c, values[i] ?? null])),
  )
}

const num = (v: SqlValue | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0))
const str = (v: SqlValue | undefined): string =>
  typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)

function hasTable(db: Database, name: string): boolean {
  return (
    query(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`).length > 0
  )
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new ApkgError('corrupt')
  return Object.fromEntries(Object.entries(parsed))
}

function readModels(json: string): ApkgModel[] {
  const out: ApkgModel[] = []
  for (const [id, raw] of Object.entries(parseJsonObject(json))) {
    if (typeof raw !== 'object' || raw === null) continue
    const m = Object.fromEntries(Object.entries(raw))
    const list = (x: unknown) => (Array.isArray(x) ? x : [])
    const objects = (x: unknown) =>
      list(x).flatMap((item: unknown) =>
        typeof item === 'object' && item !== null ? [Object.fromEntries(Object.entries(item))] : [],
      )
    out.push({
      id,
      name: typeof m.name === 'string' ? m.name : id,
      type: typeof m.type === 'number' ? m.type : 0,
      fields: objects(m.flds)
        .sort((a, b) => Number(a.ord ?? 0) - Number(b.ord ?? 0))
        .map((f) => (typeof f.name === 'string' ? f.name : '')),
      templates: objects(m.tmpls)
        .sort((a, b) => Number(a.ord ?? 0) - Number(b.ord ?? 0))
        .map((t) => ({
          name: typeof t.name === 'string' ? t.name : '',
          qfmt: typeof t.qfmt === 'string' ? t.qfmt : '',
        })),
    })
  }
  return out
}

function readDecks(json: string): { id: string; name: string }[] {
  return Object.entries(parseJsonObject(json)).flatMap(([id, raw]) => {
    if (typeof raw !== 'object' || raw === null) return []
    const name = Object.fromEntries(Object.entries(raw)).name
    return typeof name === 'string' ? [{ id, name }] : []
  })
}

/** Reads the whole package; `progress` receives coarse steps (0–1). */
export function readApkg(
  bytes: Uint8Array,
  SQL: SqlJsStatic,
  progress?: (ratio: number) => void,
): ApkgPackage {
  const { format, collection, entries, mediaMap } = unpackApkg(bytes)
  let db: Database
  try {
    db = new SQL.Database(collection)
  } catch {
    throw new ApkgError('corrupt')
  }
  try {
    const col = query(db, 'SELECT crt, models, decks FROM col')[0]
    if (!col) throw new ApkgError('corrupt')
    progress?.(0.2)
    const notes = query(db, 'SELECT id, guid, mid, mod, tags, flds FROM notes').map((r) => ({
      id: num(r.id),
      guid: str(r.guid),
      mid: str(r.mid),
      mod: num(r.mod),
      tags: str(r.tags).split(/\s+/).filter(Boolean),
      fields: str(r.flds).split('\u001f'),
    }))
    progress?.(0.5)
    const cards = query(
      db,
      'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards',
    ).map((r) => ({
      id: num(r.id),
      nid: num(r.nid),
      did: str(r.did),
      ord: num(r.ord),
      type: num(r.type),
      queue: num(r.queue),
      due: num(r.due),
      ivl: num(r.ivl),
      factor: num(r.factor),
      reps: num(r.reps),
      lapses: num(r.lapses),
    }))
    const revlog = hasTable(db, 'revlog')
      ? query(db, 'SELECT id, cid, ease, time, type FROM revlog ORDER BY id').map((r) => ({
          id: num(r.id),
          cid: num(r.cid),
          ease: num(r.ease),
          time: num(r.time),
          type: num(r.type),
        }))
      : []
    progress?.(0.8)
    const media: ApkgPackage['media'] = []
    const missingMedia: string[] = []
    for (const [key, name] of Object.entries(mediaMap)) {
      const data = entries[key]
      if (data) media.push({ name, data: new Uint8Array(data) })
      else missingMedia.push(name)
    }
    progress?.(1)
    return {
      format,
      crt: num(col.crt),
      models: readModels(str(col.models)),
      decks: readDecks(str(col.decks)),
      notes,
      cards,
      revlog,
      media,
      missingMedia,
      size: bytes.byteLength,
    }
  } catch (e) {
    throw e instanceof ApkgError ? e : new ApkgError('corrupt')
  } finally {
    db.close()
  }
}
