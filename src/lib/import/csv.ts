/**
 * CSV/TSV import (05-IMPORT-EXPORT §1). Pure: parsing, default mapping and the import plan;
 * the database writes are done by `db/importer.ts`.
 */
import Papa from 'papaparse'
import { makeCard } from '../domain/defaults'
import {
  cardOrds,
  noteFront,
  normalizeFields,
  reconcileCards,
  type ReconcilableCard,
  type TypeShape,
} from '../domain/notes'
import { frontKey, mediaRefs, parseTags } from '../domain/text'
import type { Card, Deck, ModelType, Note, NoteType } from '../domain/types'
import { DeckResolver } from './decks'
import { emptyReport, type ImportPlan } from './plan'

export const MAX_CSV_ROWS = 50_000

/** Built-in targets, or `field:k`: field k of the custom note type being imported (M10). */
export type CsvColumn =
  'front' | 'back' | 'extra' | 'tags' | 'deck' | 'type' | 'ignore' | `field:${number}`

export const fieldColumn = (k: number): CsvColumn => `field:${k}`
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

const fold = (s: string) => s.trim().toLowerCase()

/** A custom type's first row names its fields: it is a header (M10). */
export function headerNamesFields(data: CsvData, type: TypeShape): boolean {
  const names = new Set(type.fields.map(fold))
  return (data.rows[0] ?? []).some((cell) => names.has(fold(cell)))
}

/**
 * Default mapping (05 §1): named columns when a header exists, else 1 → front, 2 → back,
 * 3 → extra. For a custom note type (M10): a header cell naming a field goes to that field
 * (« tags » and « paquet » as usual), else column k → field k.
 */
export function defaultMapping(
  data: CsvData,
  hasHeader = data.headerDetected,
  type?: TypeShape,
): CsvColumn[] {
  const width = Math.max(0, ...data.rows.slice(0, 20).map((r) => r.length))
  const header = hasHeader ? (data.rows[0] ?? []) : []
  const used = new Set<CsvColumn>()
  const mapping: CsvColumn[] = []
  for (let i = 0; i < width; i++) {
    const cell = fold(header[i] ?? '')
    const field = type ? type.fields.findIndex((f) => fold(f) === cell) : -1
    const known = NAMED[cell]
    const named: CsvColumn | undefined =
      field >= 0
        ? fieldColumn(field)
        : type && known !== 'tags' && known !== 'deck'
          ? undefined
          : known
    const positional: CsvColumn = type
      ? i < type.fields.length
        ? fieldColumn(i)
        : 'ignore'
      : ((['front', 'back', 'extra'] as const)[i] ?? 'ignore')
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
  /** custom: the note type of every row; columns map to its fields (`field:k`). */
  noteType?: NoteType
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
  /** Cards of the existing notes: updating a custom note reconciles its cards (M10). */
  cards?: readonly ReconcilableCard[]
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
  const rowDeck = (row: readonly string[]) =>
    resolver.resolve(at(row, 'deck'))?.id ??
    (options.deckId || resolver.resolve(options.newDeckName || 'Import')?.id || '')
  const type = options.modelType === 'custom' ? options.noteType : undefined
  const known = new Map<string, Note>()
  for (const note of existing.notes) {
    // A row matches only notes of its kind: a custom row the notes of its type, a built-in row
    // the built-in notes, never an occlusion (« update » would overwrite its masks, M6) nor a
    // custom note (its fields are not Recto, Verso, Extra, M10).
    const sameKind = type
      ? note.modelType === 'custom' && note.noteTypeId === type.id
      : note.modelType !== 'image_occlusion' && note.modelType !== 'custom'
    if (sameKind) known.set(duplicateKey(note.deckId, noteFront(note)), note)
  }
  const createdHere = new Set<string>()
  const updated = new Map<string, Note>()
  const missing = new Set<string>()

  // The cards of every note the plan touches, as they will be once it is written: a custom
  // update reconciles them with the new content (invariant 2); several rows may hit one note.
  const stored = new Map<string, ReconcilableCard[]>()
  for (const card of existing.cards ?? []) {
    stored.set(card.noteId, [...(stored.get(card.noteId) ?? []), card])
  }
  const current = new Map<string, ReconcilableCard[]>()
  const planned = new Set<string>()
  const removed: Pick<Card, 'id' | 'noteId'>[] = []
  const setCards = (note: Note, ords: readonly number[], at: number) => {
    const result = reconcileCards(current.get(note.id) ?? stored.get(note.id) ?? [], ords)
    const created = result.create.map((ord) => makeCard(note, ord, newId(), at))
    for (const card of result.remove) {
      if (planned.delete(card.id)) plan.cards = plan.cards.filter((c) => c.id !== card.id)
      else removed.push({ id: card.id, noteId: card.noteId })
    }
    for (const card of created) planned.add(card.id)
    plan.cards.push(...created)
    current.set(note.id, [...result.keep, ...created])
  }
  const keep = (key: string, note: Note) => {
    known.set(key, note)
    if (createdHere.has(note.id)) plan.notes = plan.notes.map((n) => (n.id === note.id ? note : n))
    else updated.set(note.id, note)
  }
  const create = (key: string, note: Note, ords: readonly number[]) => {
    plan.notes.push(note)
    createdHere.add(note.id)
    known.set(key, note)
    setCards(note, ords, note.createdAt)
  }

  rows.forEach((row, index) => {
    const line = index + 1 + (options.hasHeader ? 1 : 0)
    // One millisecond per line keeps the file order for « ordre d'ajout » (newOrder).
    const createdAt = now + index
    const tags = parseTags(at(row, 'tags'))
    let fields: string[]
    if (type) {
      // Custom: column k → field k; a field without a column is empty (kept as it was on update).
      const mapped = type.fields.map((_, k) => {
        const i = options.mapping.indexOf(fieldColumn(k))
        return i === -1 ? null : (row[i] ?? '').trim()
      })
      fields = mapped.map((v) => v ?? '')
      const first = fields[0] ?? ''
      if (!first) {
        report.errors.push({ line, code: 'emptyFront' })
        return
      }
      const ords = cardOrds('custom', fields, type)
      if (ords.length === 0) {
        report.errors.push({ line, code: 'noCard' })
        return
      }
      const deckId = rowDeck(row)
      const key = duplicateKey(deckId, first)
      const duplicate = known.get(key)
      if (duplicate && options.duplicates === 'skip') {
        report.skipped++
        return
      }
      if (duplicate && options.duplicates === 'update') {
        const before = normalizeFields('custom', duplicate.fields, type)
        const next: Note = {
          ...duplicate,
          fields: before.map((f, k) => (k === 0 ? f : (mapped[k] ?? f))),
          tags,
          updatedAt: now,
        }
        keep(key, next)
        setCards(next, cardOrds('custom', next.fields, type), now)
      } else {
        const note: Note = {
          id: newId(),
          deckId,
          modelType: 'custom',
          noteTypeId: type.id,
          fields,
          tags,
          createdAt,
          updatedAt: createdAt,
        }
        create(key, note, ords)
      }
    } else {
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
      fields =
        modelType === 'cloze'
          ? [front, [extra, back].filter(Boolean).join('<br>')]
          : [front, back, extra]
      const ords = cardOrds(modelType, fields)
      if (ords.length === 0) {
        report.errors.push({ line, code: 'noCloze' })
        return
      }
      const deckId = rowDeck(row)
      const key = duplicateKey(deckId, front)
      const duplicate = known.get(key)
      if (duplicate && options.duplicates === 'skip') {
        report.skipped++
        return
      }
      if (duplicate && options.duplicates === 'update') {
        // Replace back/extra/tags, keep the cards and their review log.
        keep(key, {
          ...duplicate,
          fields:
            duplicate.modelType === 'cloze'
              ? [duplicate.fields[0] ?? front, fields[fields.length - 1] ?? '']
              : [duplicate.fields[0] ?? front, back, extra],
          tags,
          updatedAt: now,
        })
      } else {
        create(
          key,
          { id: newId(), deckId, modelType, fields, tags, createdAt, updatedAt: createdAt },
          ords,
        )
      }
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
  plan.removedCards = removed
  report.decksCreated = resolver.created.map((d) => d.name)
  report.notesCreated = plan.notes.length
  report.cardsCreated = plan.cards.length
  report.notesUpdated = plan.updates.length
  report.missingMedia = [...missing].sort()
  return plan
}
