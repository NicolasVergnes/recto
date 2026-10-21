/**
 * Recto deck package `.rpkg` → Recto import plan (05-IMPORT-EXPORT §5, ADR-014). Pure (async
 * only for sha256): bytes in, validated package; package and collection in, `ImportPlan`.
 */
import { strFromU8, unzipSync } from 'fflate'
import { deckPath } from '../domain/decks'
import { makeCard } from '../domain/defaults'
import type { ModelChoice } from '../domain/leitner'
import { cardOrds, reconcileCards, type ReconcilableCard } from '../domain/notes'
import { normalizeText } from '../domain/text'
import type { Card, Deck, ModelType, Note, NoteType } from '../domain/types'
import type { PackageDeck, PackageNote, PackageSettings, RpkgManifest } from '../export/rpkg'
import { DeckResolver } from './decks'
import { planMedia, type PackageMedia } from './media-plan'
import { emptyReport, type ImportErrorCode, type ImportPlan, type PackageExisting } from './plan'
import {
  isBool,
  isNum,
  isObj,
  isStr,
  isStrArray,
  oneOf,
  readAll,
  readMediaMeta,
  readNote,
  readNoteType,
  readObject,
} from './validate'

export type RpkgErrorCode = 'notZip' | 'notPackage' | 'newerVersion' | 'invalidData'

export class RpkgError extends Error {
  constructor(readonly code: RpkgErrorCode) {
    super(code)
    this.name = 'RpkgError'
  }
}

export interface RpkgPackage {
  manifest: RpkgManifest
  decks: PackageDeck[]
  noteTypes: NoteType[]
  notes: PackageNote[]
  media: PackageMedia[]
  /** Media listed in `data.json` whose file is absent. */
  missingMedia: string[]
  /** Rows rejected by validation. */
  invalid: number
}

function readManifest(x: unknown): RpkgManifest | null {
  if (!isObj(x) || x.format !== 'recto-deck' || !isNum(x.schemaVersion) || !isStr(x.id)) return null
  const c = readObject(x.counts) ?? {}
  const count = (v: unknown) => (isNum(v) ? v : 0)
  const manifest: RpkgManifest = {
    format: 'recto-deck',
    schemaVersion: x.schemaVersion,
    id: x.id,
    title: isStr(x.title) ? x.title : '',
    appVersion: isStr(x.appVersion) ? x.appVersion : '',
    exportedAt: isNum(x.exportedAt) ? x.exportedAt : 0,
    counts: {
      decks: count(c.decks),
      noteTypes: count(c.noteTypes),
      notes: count(c.notes),
      cards: count(c.cards),
      media: count(c.media),
    },
  }
  for (const key of ['description', 'author', 'licence'] as const) {
    const value = x[key]
    if (isStr(value) && value.trim()) manifest[key] = value.trim()
  }
  return manifest
}

/** The settings a package carries (no scheduler): each one kept only when valid. */
function readPackageSettings(x: unknown): PackageSettings {
  const s = readObject(x) ?? {}
  const out: PackageSettings = {}
  const count = (v: unknown) => isNum(v) && Number.isInteger(v) && v >= 0
  if (count(s.newPerDay)) out.newPerDay = s.newPerDay as number
  if (count(s.reviewsPerDay)) out.reviewsPerDay = s.reviewsPerDay as number
  if (oneOf(['added', 'random'] as const, s.newOrder)) out.newOrder = s.newOrder
  if (isBool(s.typedAnswer)) out.typedAnswer = s.typedAnswer
  if (isBool(s.autoplayAudio)) out.autoplayAudio = s.autoplayAudio
  if (isBool(s.alternateSides)) out.alternateSides = s.alternateSides
  if (isStrArray(s.pausedFormats)) out.pausedFormats = s.pausedFormats
  if (isBool(s.newByFormat)) out.newByFormat = s.newByFormat
  return out
}

function readPackageDeck(x: unknown): PackageDeck | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.name) || !x.name.trim()) return null
  const deck: PackageDeck = {
    id: x.id,
    name: x.name.trim(),
    parentId: isStr(x.parentId) ? x.parentId : null,
    settings: readPackageSettings(x.settings),
  }
  if (isStr(x.description) && x.description.trim()) deck.description = x.description.trim()
  return deck
}

export function parseRpkg(bytes: Uint8Array, currentSchema: number): RpkgPackage {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new RpkgError('notZip')
  }
  const json = (name: string): unknown => {
    const entry = entries[name]
    if (!entry) throw new RpkgError('notPackage')
    try {
      return JSON.parse(strFromU8(entry))
    } catch {
      throw new RpkgError('invalidData')
    }
  }
  const manifest = readManifest(json('manifest.json'))
  if (!manifest) throw new RpkgError('notPackage')
  if (manifest.schemaVersion > currentSchema) throw new RpkgError('newerVersion')
  const data = readObject(json('data.json'))
  if (!data) throw new RpkgError('invalidData')

  const decks = readAll(data.decks, readPackageDeck)
  const deckIds = new Set(decks.rows.map((d) => d.id))
  // A sub-deck whose parent is not in the package becomes a top deck.
  for (const deck of decks.rows)
    if (deck.parentId && !deckIds.has(deck.parentId)) deck.parentId = null
  const noteTypes = readAll(data.noteTypes, readNoteType)
  const typeIds = new Set(noteTypes.rows.map((t) => t.id))
  const notes = readAll(data.notes, (x): PackageNote | null => {
    const note = readNote(x)
    if (!note || !deckIds.has(note.deckId)) return null
    // A custom note without its note type could not be rendered nor edited.
    if (note.modelType === 'custom' && !typeIds.has(note.noteTypeId ?? '')) return null
    return readObject(x)?.suspended === true ? { ...note, suspended: true } : note
  })
  const metas = readAll(data.media, readMediaMeta)
  const media: PackageMedia[] = []
  const missingMedia: string[] = []
  for (const meta of metas.rows) {
    const file = entries[`media/${meta.name}`]
    if (file) media.push({ name: meta.name, data: new Uint8Array(file) })
    else missingMedia.push(meta.name)
  }
  return {
    manifest,
    decks: decks.rows,
    noteTypes: noteTypes.rows,
    notes: notes.rows,
    media,
    missingMedia,
    invalid: decks.invalid + noteTypes.invalid + notes.invalid + metas.invalid,
  }
}

/** `Parent::Child` path of each package deck, parents first. */
function packagePaths(decks: readonly PackageDeck[]): { deck: PackageDeck; path: string }[] {
  const byId = new Map(decks.map((d) => [d.id, d]))
  return [...decks]
    .sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null))
    .map((deck) => {
      const parent = deck.parentId ? byId.get(deck.parentId) : undefined
      return { deck, path: parent ? `${parent.name}::${deck.name}` : deck.name }
    })
}

/** The identity of a note across collections (05 §5): its source's, else its own id. */
const identity = (note: Pick<Note, 'id' | 'sourceGuid'>) => note.sourceGuid ?? note.id

export interface RpkgSummary {
  manifest: RpkgManifest
  /** Each deck of the package, and whether Recto has a deck at that place already. */
  decks: { path: string; exists: boolean }[]
  notes: number
  /** Notes Recto has already: an import updates them when the package's copy is newer. */
  known: number
  media: number
}

/** Shown before importing (04-UI §2.5 bis). */
export function describeRpkg(pkg: RpkgPackage, existing: PackageExisting): RpkgSummary {
  const byId = new Map(existing.decks.map((d) => [d.id, d]))
  const paths = new Set(existing.decks.map((d) => normalizeText(deckPath(d, byId))))
  const ids = new Set(existing.notes.map(identity))
  return {
    manifest: pkg.manifest,
    decks: packagePaths(pkg.decks).map(({ path }) => ({
      path,
      exists: paths.has(normalizeText(path)),
    })),
    notes: pkg.notes.length,
    known: pkg.notes.filter((n) => ids.has(identity(n))).length,
    media: pkg.media.length,
  }
}

export interface RpkgImportOptions {
  /** How the decks created by the import are scheduled (M19, preset with Paramètres). */
  model: ModelChoice
}

function noCardError(modelType: ModelType): ImportErrorCode {
  if (modelType === 'image_occlusion') return 'noMask'
  return modelType === 'custom' ? 'emptyFront' : 'noCloze'
}

/** What a note says, as the package has it: fields, tags and the options of its kind. */
function content(note: PackageNote): Partial<Note> {
  const out: Partial<Note> = { fields: note.fields, tags: note.tags }
  if (note.oneWay !== undefined) out.oneWay = note.oneWay
  if (note.single !== undefined) out.single = note.single
  if (note.masks !== undefined) out.masks = note.masks
  if (note.source !== undefined) out.source = note.source
  return out
}

/**
 * The note types of the package in Recto: the type with the same id and fields when Recto has it
 * (the author, an earlier import), else a new one keeping the package's id when free, else a
 * copy under a new id; a new type is named apart from the existing ones. An existing type keeps
 * its own templates.
 */
function resolveNoteTypes(
  types: readonly NoteType[],
  existing: readonly NoteType[],
  now: number,
  newId: () => string,
): { byId: Map<string, NoteType>; created: NoteType[] } {
  const byId = new Map<string, NoteType>()
  const created: NoteType[] = []
  const local = new Map(existing.map((t) => [t.id, t]))
  const taken = new Set(existing.map((t) => t.name.toLowerCase()))
  for (const type of types) {
    const same = local.get(type.id)
    if (same && same.fields.join('\u001f') === type.fields.join('\u001f')) {
      byId.set(type.id, same)
      continue
    }
    let name = type.name
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${type.name} (${i})`
    taken.add(name.toLowerCase())
    const copy: NoteType = { ...type, id: same ? newId() : type.id, name, createdAt: now }
    created.push(copy)
    byId.set(type.id, copy)
  }
  return { byId, created }
}

export async function planRpkgImport(
  pkg: RpkgPackage,
  options: RpkgImportOptions,
  existing: PackageExisting,
  now: number,
  newId: () => string,
): Promise<ImportPlan> {
  const report = emptyReport()
  const removedCards: ReconcilableCard[] = []
  const plan: ImportPlan = {
    decks: [],
    notes: [],
    cards: [],
    reviews: [],
    updates: [],
    removedCards,
    media: [],
    report,
  }
  const types = resolveNoteTypes(pkg.noteTypes, existing.noteTypes ?? [], now, newId)

  // Decks: by path; a deck the import creates takes the package's settings and description.
  const resolver = new DeckResolver(existing.decks, now, newId, options.model)
  const known = new Set(existing.decks.map((d) => d.id))
  const deckOf = new Map<string, Deck>()
  for (const { deck, path } of packagePaths(pkg.decks)) {
    const target = resolver.resolve(path)
    if (!target) continue
    deckOf.set(deck.id, target)
    if (known.has(target.id)) continue
    // Formats name note types by id (M17): those of the package follow its types into Recto.
    const pausedFormats = (deck.settings.pausedFormats ?? []).flatMap((key) => {
      const [typeId, index] = key.split(':')
      if (index === undefined) return [key]
      const type = types.byId.get(typeId ?? '')
      return type ? [`${type.id}:${index}`] : []
    })
    target.settings = { ...target.settings, ...deck.settings, pausedFormats }
    if (deck.description) target.description = deck.description
  }

  const byIdentity = new Map(existing.notes.map((n) => [identity(n), n]))
  const cardsOfNote = new Map<string, ReconcilableCard[]>()
  for (const c of existing.cards)
    cardsOfNote.set(c.noteId, [...(cardsOfNote.get(c.noteId) ?? []), c])
  const existingDecks = new Map(existing.decks.map((d) => [d.id, d]))
  const updated = new Set<string>()
  const addCards = (note: Note, ords: readonly number[], createdAt: number, suspended: boolean) => {
    for (const ord of ords) {
      const card: Card = makeCard(note, ord, newId(), createdAt + ord)
      plan.cards.push(suspended ? { ...card, suspended: true } : card)
    }
  }

  pkg.notes.forEach((pn, line) => {
    const type = pn.noteTypeId ? types.byId.get(pn.noteTypeId) : undefined
    const suspended = pn.suspended === true
    const found = byIdentity.get(identity(pn))
    if (found) {
      // A known note (05 §5): the package's copy replaces its content when it is more recent and
      // the note keeps its kind and type; it stays in its deck, its cards follow (invariant 2).
      if (
        pn.updatedAt <= found.updatedAt ||
        pn.modelType !== found.modelType ||
        found.noteTypeId !== type?.id ||
        updated.has(found.id) ||
        !existingDecks.has(found.deckId)
      ) {
        report.skipped++
        return
      }
      const { oneWay: _o, single: _s, masks: _m, source: _src, ...rest } = found
      const next: Note = { ...rest, ...content(pn), updatedAt: pn.updatedAt }
      const wanted = cardOrds(next, type)
      if (wanted.length === 0) {
        report.errors.push({ line: line + 1, code: noCardError(pn.modelType) })
        return
      }
      const { create, remove } = reconcileCards(cardsOfNote.get(found.id) ?? [], wanted)
      updated.add(found.id)
      plan.updates.push(next)
      removedCards.push(...remove)
      addCards(next, create, now, suspended)
      return
    }
    const deck = deckOf.get(pn.deckId)
    if (!deck) {
      report.errors.push({ line: line + 1, code: 'orphanCard' })
      return
    }
    const note: Note = {
      ...content(pn),
      id: newId(),
      deckId: deck.id,
      modelType: pn.modelType,
      fields: pn.fields,
      tags: pn.tags,
      sourceGuid: identity(pn),
      createdAt: pn.createdAt,
      updatedAt: pn.updatedAt,
    }
    if (type) note.noteTypeId = type.id
    const ords = cardOrds(note, type)
    if (ords.length === 0) {
      report.errors.push({ line: line + 1, code: noCardError(pn.modelType) })
      return
    }
    plan.notes.push(note)
    addCards(note, ords, pn.createdAt, suspended)
  })

  await planMedia(plan, pkg.media, existing.media, pkg.missingMedia)

  plan.decks = resolver.created
  // Only the types of the notes actually created.
  const used = new Set(plan.notes.map((n) => n.noteTypeId))
  plan.noteTypes = types.created.filter((t) => used.has(t.id))
  report.noteTypesCreated = plan.noteTypes.map((t) => t.name)
  report.decksCreated = resolver.created.map((d) => d.name)
  report.notesCreated = plan.notes.length
  report.cardsCreated = plan.cards.length
  report.notesUpdated = plan.updates.length
  report.cardsRemoved = removedCards.length
  return plan
}
