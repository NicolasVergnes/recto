/**
 * CSV/TSV import (05-IMPORT-EXPORT §1). Pure: parsing, default mapping and the import plan;
 * the database writes are done by `db/importer.ts`.
 */
import Papa from 'papaparse'
import { makeCard } from '../domain/defaults'
import { cardOrds, noteFront } from '../domain/notes'
import { frontKey, mediaRefs, parseTags } from '../domain/text'
import type { Deck, ModelType, Note } from '../domain/types'
import { DeckResolver } from './decks'
import { emptyReport, type ImportPlan } from './plan'

export const MAX_CSV_ROWS = 50_000

export type CsvColumn = 'front' | 'back' | 'extra' | 'tags' | 'deck' | 'type' | 'ignore'
export type DuplicateStrategy = 'skip' | 'update' | 'duplicate'

export interface CsvData {
  /** Every non-empty row, header included. */
  rows: string[][]
  delimiter: string
  headerDetected: boolean
}

const HEADER_RE = /^(recto|front|question|texte|text|cloze)$/i

/** UTF-8 text → rows; BOM removed, CRLF accepted, delimiter detected among , ; tab |. */
export function parseCsv(text: string): CsvData {
  const clean = text.replace(/^\ufeff/, '')
  const result = Papa.parse<string[]>(clean, {
    header: false,
    skipEmptyLines: 'greedy',
    delimiter: '',
    delimitersToGuess: [',', ';', '\t', '|'],
  })
  const rows = result.data.map((row) => row.map((cell) => cell ?? ''))
  const first = rows[0] ?? []
  return {
    rows,
    delimiter: result.meta.delimiter,
    headerDetected: first.some((cell) => HEADER_RE.test(cell.trim())),
  }
}

const NAMED: Record<string, CsvColumn> = {
  recto: 'front',
  front: 'front',
  question: 'front',
  texte: 'front',
  text: 'front',
  cloze: 'front',
  verso: 'back',
  back: 'back',
  answer: 'back',
  réponse: 'back',
  reponse: 'back',
  extra: 'extra',
  tags: 'tags',
  tag: 'tags',
  deck: 'deck',
  paquet: 'deck',
  type: 'type',
}

/** Default mapping (05 §1): named columns when a header exists, else 1 → front, 2 → back, 3 → extra. */
export function defaultMapping(data: CsvData, hasHeader = data.headerDetected): CsvColumn[] {
  const width = Math.max(0, ...data.rows.slice(0, 20).map((r) => r.length))
  const header = hasHeader ? (data.rows[0] ?? []) : []
  const used = new Set<CsvColumn>()
  const mapping: CsvColumn[] = []
  for (let i = 0; i < width; i++) {
    const named = NAMED[(header[i] ?? '').trim().toLowerCase()]
    const positional: CsvColumn = (['front', 'back', 'extra'] as const)[i] ?? 'ignore'
    const column = hasHeader ? (named ?? 'ignore') : positional
    mapping.push(column !== 'ignore' && used.has(column) ? 'ignore' : column)
    used.add(column)
  }
  return mapping
}

const CLOZE_RE = /\{\{c\d+::/
const REMOTE_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*["']?(?:[a-z][a-z0-9+.-]*:|\/\/)/gi

/** `cloze` when a front uses the cloze syntax, `basic` otherwise (05 §1). */
export function detectModelType(data: CsvData, mapping: readonly CsvColumn[], hasHeader: boolean) {
  const front = mapping.indexOf('front')
  const rows = hasHeader ? data.rows.slice(1) : data.rows
  return rows.some((r) => CLOZE_RE.test(r[front] ?? '')) ? 'cloze' : 'basic'
}

const TYPE_VALUES: Record<string, ModelType> = {
  basic: 'basic',
  basique: 'basic',
  basic_reverse: 'basic_reverse',
  'basique + inverse': 'basic_reverse',
  cloze: 'cloze',
  'texte à trous': 'cloze',
}

export interface CsvImportOptions {
  mapping: readonly CsvColumn[]
  hasHeader: boolean
  modelType: ModelType
  /** Deck used when there is no deck column or it is empty… */
  deckId: string
  /** …or, when `deckId` is empty, a new deck created only if a row needs it. */
  newDeckName?: string
  duplicates: DuplicateStrategy
}

export interface ExistingCollection {
  decks: readonly Deck[]
  notes: readonly Note[]
  mediaNames: ReadonlySet<string>
}

/** Duplicate key (05 §1): deck + normalised front (text and media names). */
export function duplicateKey(deckId: string, front: string): string {
  return `${deckId}\u0000${frontKey(front)}`
}

export function planCsvImport(
  data: CsvData,
  options: CsvImportOptions,
  existing: ExistingCollection,
  now: number,
  newId: () => string,
): ImportPlan {
  const report = emptyReport()
  const plan: ImportPlan = {
    decks: [],
    notes: [],
    cards: [],
    reviews: [],
    updates: [],
    media: [],
    report,
  }
  const rows = options.hasHeader ? data.rows.slice(1) : data.rows
  if (rows.length === 0) {
    report.errors.push({ line: 0, code: 'emptyFile' })
    return plan
  }
  if (rows.length > MAX_CSV_ROWS) {
    report.errors.push({ line: 0, code: 'tooManyRows' })
    return plan
  }

  const col = (name: CsvColumn) => options.mapping.indexOf(name)
  const at = (row: readonly string[], name: CsvColumn) => {
    const i = col(name)
    return i === -1 ? '' : (row[i] ?? '').trim()
  }
  const resolver = new DeckResolver(existing.decks, now, newId)
  const known = new Map<string, Note>()
  for (const note of existing.notes) known.set(duplicateKey(note.deckId, noteFront(note)), note)
  const createdHere = new Set<string>()
  const updated = new Map<string, Note>()
  const missing = new Set<string>()

  rows.forEach((row, index) => {
    const line = index + 1 + (options.hasHeader ? 1 : 0)
    const front = at(row, 'front')
    if (!front) {
      report.errors.push({ line, code: 'emptyFront' })
      return
    }
    const back = at(row, 'back')
    const extra = at(row, 'extra')
    const explicit = TYPE_VALUES[at(row, 'type').toLowerCase()]
    const modelType: ModelType = explicit ?? (CLOZE_RE.test(front) ? 'cloze' : options.modelType)
    // Cloze notes have [text, extra]; a back column is merged into extra (05 §1).
    const fields =
      modelType === 'cloze'
        ? [front, [extra, back].filter(Boolean).join('<br>')]
        : [front, back, extra]
    const ords = cardOrds(modelType, fields)
    if (ords.length === 0) {
      report.errors.push({ line, code: 'noCloze' })
      return
    }
    const deckId =
      resolver.resolve(at(row, 'deck'))?.id ??
      (options.deckId || resolver.resolve(options.newDeckName || 'Import')?.id || '')
    const tags = parseTags(at(row, 'tags'))
    const key = duplicateKey(deckId, front)
    const duplicate = known.get(key)

    if (duplicate && options.duplicates === 'skip') {
      report.skipped++
      return
    }
    if (duplicate && options.duplicates === 'update') {
      // Replace back/extra/tags, keep the cards and their review log.
      const next: Note = {
        ...duplicate,
        fields:
          duplicate.modelType === 'cloze'
            ? [duplicate.fields[0] ?? front, fields[fields.length - 1] ?? '']
            : [duplicate.fields[0] ?? front, back, extra],
        tags,
        updatedAt: now,
      }
      known.set(key, next)
      if (createdHere.has(next.id)) {
        plan.notes = plan.notes.map((n) => (n.id === next.id ? next : n))
      } else {
        updated.set(next.id, next)
      }
    } else {
      // One millisecond per line keeps the file order for « ordre d'ajout » (newOrder).
      const createdAt = now + index
      const note: Note = {
        id: newId(),
        deckId,
        modelType,
        fields,
        tags,
        createdAt,
        updatedAt: createdAt,
      }
      plan.notes.push(note)
      createdHere.add(note.id)
      known.set(key, note)
      for (const ord of ords) plan.cards.push(makeCard(note, ord, newId(), createdAt))
    }
    for (const field of fields) {
      const refs = mediaRefs(field)
      for (const name of [...refs.images, ...refs.sounds]) {
        if (!existing.mediaNames.has(name)) missing.add(name)
      }
      report.remoteMedia += (field.match(REMOTE_IMG_RE) ?? []).length
    }
  })

  plan.decks = resolver.created
  plan.updates = [...updated.values()]
  report.decksCreated = resolver.created.map((d) => d.name)
  report.notesCreated = plan.notes.length
  report.cardsCreated = plan.cards.length
  report.notesUpdated = plan.updates.length
  report.missingMedia = [...missing].sort()
  return plan
}
