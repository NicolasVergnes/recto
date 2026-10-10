/**
 * Anki package → Recto import plan (05-IMPORT-EXPORT §2.3). Pure (async only for sha256).
 */
import { makeCard } from '../domain/defaults'
import { cardOrds, reconcileCards, type ReconcilableCard } from '../domain/notes'
import { labelsFromAnkiComments, occlusionFromAnki, serializeOcclusion } from '../domain/occlusion'
import { mediaRefs, renameMediaRefs } from '../domain/text'
import type {
  Card,
  Deck,
  ModelType,
  Note,
  NoteType,
  Rating,
  Review,
  SchedulerKind,
} from '../domain/types'
import { sha256Hex } from '../media/hash'
import { mediaKind, mimeFromName } from '../media/mime'
import { getScheduler } from '../scheduler'
import { addDays, startOfDate, studyDate } from '../scheduler/day'
import { boxFromStability } from '../scheduler/leitner'
import type { ApkgCard, ApkgModel, ApkgNote, ApkgPackage } from './apkg-read'
import { DeckResolver } from './decks'
import { emptyReport, type ImportErrorCode, type ImportMedia, type ImportPlan } from './plan'

export * from './apkg-read'

const MAX_DURATION_MS = 60_000

export type ApkgTarget =
  { mode: 'anki' } | { mode: 'single'; deckId: string } | { mode: 'single'; newDeckName: string }

export interface ApkgImportOptions {
  target: ApkgTarget
  /** Rebuild the scheduling state by replaying the review log (05 §2.3). */
  importHistory: boolean
  /** Scheduler of the decks created by the import. */
  scheduler: SchedulerKind
  dayStartHour: number
}

export interface ApkgExisting {
  decks: readonly Deck[]
  notes: readonly Note[]
  /** Custom note types (a re-import reuses the one with the same Anki id and fields). */
  noteTypes?: readonly NoteType[]
  /** Cards of the existing notes: a re-import reconciles those of the notes it updates. */
  cards: readonly ReconcilableCard[]
  /** Stored media: name → sha256. */
  media: ReadonlyMap<string, string>
}

export interface ModelConversion {
  modelType: ModelType
  /** Fields merged into Extra (or unknown template layout): reported. */
  mergedFields: number
  converted: boolean
  map: (fields: readonly string[]) => string[]
  /** custom: the note type to create (or reuse), as Anki defines it. */
  noteType?: Pick<NoteType, 'name' | 'fields' | 'templates' | 'anki' | 'updatedAt'>
}

const joinRest = (fields: readonly string[], from: number) =>
  fields
    .slice(from)
    .filter((f) => f.trim() !== '')
    .join('<br>')

/**
 * Anki 23.10+ « Image Occlusion » note type: a cloze type whose template draws the masks
 * (`image-occlusion` in the question). Its field names are localised, so detection and field
 * order ([Occlusion, Image, Header, Back Extra, Comments]) rely on the template, not the names.
 */
export function isAnkiImageOcclusion(model: ApkgModel): boolean {
  return model.type === 1 && model.templates.some((t) => t.qfmt.includes('image-occlusion'))
}

/**
 * Note types (05 §2.3): image occlusion → [Image, masks, Header, Back Extra + Comments];
 * cloze → [Texte, Extra + rest]. A standard note type with at most 3 fields becomes basic when
 * its only template asks the first field, basic_reverse when its two templates ask the first
 * and the second; any other standard note type is kept as a custom note type (M8): same fields,
 * one card per template. Model CSS is ignored.
 */
export function convertModel(model: ApkgModel): ModelConversion {
  const n = model.fields.length
  if (isAnkiImageOcclusion(model)) {
    return {
      modelType: 'image_occlusion',
      mergedFields: Math.max(0, n - 4),
      converted: false,
      map: (f) => {
        const shapes = occlusionFromAnki(f[0] ?? '').occlusion
        // Answers exported by Recto come back from Comments; any other comment joins the extra.
        const labelled = labelsFromAnkiComments(shapes, f[4] ?? '')
        const extra = labelled ? joinRest([f[3] ?? '', ...f.slice(5)], 0) : joinRest(f, 3)
        return [f[1] ?? '', serializeOcclusion(labelled ?? shapes), f[2] ?? '', extra]
      },
    }
  }
  if (model.type === 1) {
    const merged = Math.max(0, n - 2)
    return {
      modelType: 'cloze',
      mergedFields: merged,
      converted: false,
      map: (f) => [f[0] ?? '', joinRest(f, 1)],
    }
  }
  const asks = (ord: number, field: number) => {
    const name = model.fields[field]
    return !!name && (model.templates[ord]?.qfmt.includes(`{{${name}}}`) ?? false)
  }
  const basic = model.templates.length === 1 && asks(0, 0)
  const reverse = model.templates.length === 2 && asks(0, 0) && asks(1, 1)
  if (n <= 3 && (basic || reverse)) {
    return {
      modelType: reverse ? 'basic_reverse' : 'basic',
      mergedFields: 0,
      converted: false,
      map: (f) => [f[0] ?? '', f[1] ?? '', joinRest(f, 2)],
    }
  }
  return {
    modelType: 'custom',
    mergedFields: 0,
    converted: false,
    map: (f) => model.fields.map((_, i) => f[i] ?? ''),
    noteType: {
      name: model.name || 'Anki',
      fields: model.fields.map((name, i) => name.trim() || `Champ ${i + 1}`),
      templates: model.templates.map((t, i) => ({
        name: t.name || `Carte ${i + 1}`,
        front: t.qfmt,
        back: t.afmt,
      })),
      // Kept for the export (M10): Anki updates its note type only from a more recent `mod`, so an
      // unchanged type keeps Anki's date, and an edited one gives back Anki's styling.
      updatedAt: (model.mod ?? 0) * 1000,
      anki: {
        ...(model.css !== undefined ? { css: model.css } : {}),
        ...(model.latexPre !== undefined ? { latexPre: model.latexPre } : {}),
        ...(model.latexPost !== undefined ? { latexPost: model.latexPost } : {}),
        ...(model.sortf !== undefined && model.sortf >= 0 && model.sortf < model.fields.length
          ? { sortField: model.sortf }
          : {}),
      },
    },
  }
}

/**
 * The note type of an imported custom model: the existing one with the same Anki id and the
 * same fields (a re-import), or a new one, named apart from the existing types.
 */
function resolveNoteType(
  ankiId: string,
  shape: NonNullable<ModelConversion['noteType']>,
  existing: readonly NoteType[],
  created: NoteType[],
  now: number,
  newId: () => string,
): NoteType {
  const sourceId = Number(ankiId)
  const same = [...existing, ...created].find(
    (t) => t.sourceId === sourceId && t.fields.join('\u001f') === shape.fields.join('\u001f'),
  )
  if (same) return same
  const taken = new Set([...existing, ...created].map((t) => t.name.toLowerCase()))
  let name = shape.name
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${shape.name} (${i})`
  const { anki, updatedAt, ...rest } = shape
  // Anki's date when it has one: re-exporting the unchanged type leaves Anki's own as it is.
  const type: NoteType = {
    id: newId(),
    ...rest,
    name,
    createdAt: now,
    updatedAt: updatedAt > 0 ? updatedAt : now,
  }
  if (anki && Object.keys(anki).length > 0) type.anki = anki
  if (Number.isSafeInteger(sourceId)) type.sourceId = sourceId
  created.push(type)
  return type
}

/**
 * Card state without history (05 §2.3). A review `due` counts days from the collection's day 0,
 * the local date of `crt`: calendar days are added to that date (a count of 86 400 s would move
 * the due by an hour across a daylight-saving change, a whole study day near the day start).
 */
function convertCardState(
  ac: ApkgCard,
  base: Card,
  crt: number,
  now: number,
  deck: Deck,
  dayStartHour: number,
): Card {
  const card: Card = { ...base, suspended: ac.queue === -1, reps: ac.reps, lapses: ac.lapses }
  if (ac.type === 2) {
    const ivl = Math.max(1, ac.ivl)
    const day0 = studyDate(crt * 1000, 0)
    const stability = ivl
    card.state = 2
    card.due = startOfDate(addDays(day0, ac.due), dayStartHour)
    card.scheduledDays = ivl
    card.stability = stability
    card.difficulty = Math.min(10, Math.max(1, 11 - (ac.factor / 1000) * 2))
    card.lastReview = startOfDate(addDays(day0, ac.due - ivl), dayStartHour)
    if (deck.scheduler === 'leitner') card.box = boxFromStability(stability)
  } else if (ac.type === 1 || ac.type === 3) {
    // Learning: due now; FSRS treats an empty memory state as a first review.
    card.state = 1
    card.due = now
    if (deck.scheduler === 'leitner') card.box = 1
  }
  return card
}

/** Why a note of this model has no card to make: no cloze, no readable mask, empty question. */
function noCardError(modelType: ModelType): ImportErrorCode {
  if (modelType === 'image_occlusion') return 'noMask'
  return modelType === 'custom' ? 'emptyFront' : 'noCloze'
}

function uniqueName(name: string, taken: (n: string) => boolean): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!taken(candidate)) return candidate
  }
}

export async function planApkgImport(
  pkg: ApkgPackage,
  options: ApkgImportOptions,
  existing: ApkgExisting,
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
  const resolver = new DeckResolver(existing.decks, now, newId, options.scheduler)
  const models = new Map(pkg.models.map((m) => [m.id, m]))
  const conversions = new Map(pkg.models.map((m) => [m.id, convertModel(m)]))
  const ankiDecks = new Map(pkg.decks.map((d) => [d.id, d.name]))
  const deckById = new Map(existing.decks.map((d) => [d.id, d]))
  const schedulers = {
    fsrs: getScheduler('fsrs', { dayStartHour: options.dayStartHour }),
    leitner: getScheduler('leitner', { dayStartHour: options.dayStartHour }),
  }
  // The guid a Recto export writes (05 §4): the Anki guid of imported notes, else the note id.
  const byGuid = new Map(existing.notes.map((n) => [n.sourceGuid ?? n.id, n]))
  // The cards Recto already has, by note: a re-import reconciles those of the notes it updates.
  const cardsOfNote = new Map<string, ReconcilableCard[]>()
  for (const c of existing.cards) {
    cardsOfNote.set(c.noteId, [...(cardsOfNote.get(c.noteId) ?? []), c])
  }
  const cardsByNote = new Map<number, ApkgCard[]>()
  for (const c of pkg.cards) cardsByNote.set(c.nid, [...(cardsByNote.get(c.nid) ?? []), c])
  const revlogByCard = new Map<number, { id: number; ease: number; time: number }[]>()
  for (const r of pkg.revlog) {
    // 3 = filtered deck, 4 = manual reschedule: not answers (05 §2.3).
    if (r.type > 2 || r.ease < 1 || r.ease > 4) continue
    revlogByCard.set(r.cid, [...(revlogByCard.get(r.cid) ?? []), r])
  }

  let single: Deck | null = null
  const targetDeck = (ankiDeckId: string): Deck | null => {
    const t = options.target
    if (t.mode === 'single') {
      if ('deckId' in t) return deckById.get(t.deckId) ?? null
      single ??= resolver.resolve(t.newDeckName)
      return single
    }
    return resolver.resolve(ankiDecks.get(ankiDeckId) ?? 'Anki')
  }

  /**
   * Adds to the plan the cards of `ords` for `note`, as for a new note: from Anki's card of the
   * same ord (its state, or its review log replayed when the history is imported), else a new one.
   */
  const addCards = (
    note: Note,
    deck: Deck,
    ords: readonly number[],
    an: ApkgNote,
    ankiCards: readonly ApkgCard[],
  ) => {
    const scheduler = schedulers[deck.scheduler]
    for (const ord of ords) {
      const base = makeCard(note, ord, newId(), an.id + ord)
      const ac = ankiCards.find((c) => c.ord === ord)
      if (!ac) {
        plan.cards.push(base)
        continue
      }
      const history = options.importHistory ? (revlogByCard.get(ac.id) ?? []) : []
      if (history.length === 0) {
        plan.cards.push(convertCardState(ac, base, pkg.crt, now, deck, options.dayStartHour))
        continue
      }
      // Replay: the same algorithm as ts-fsrs `reschedule` (replay = next) or Leitner answers.
      let card = base
      for (const r of history) {
        const rating: Rating = r.ease === 1 ? 1 : r.ease === 2 ? 2 : r.ease === 3 ? 3 : 4
        const outcome = scheduler.answer(card, rating, r.id, deck)
        const review: Review = {
          ...outcome.review,
          id: newId(),
          durationMs: Math.max(0, Math.min(r.time, MAX_DURATION_MS)),
        }
        plan.reviews.push(review)
        card = outcome.card
      }
      plan.cards.push({ ...card, suspended: ac.queue === -1 })
    }
  }

  const converted = new Set<string>()
  /** Known notes already updated by an earlier note of the package (one guid listed twice). */
  const updated = new Set<string>()
  const noteTypes: NoteType[] = []
  const typeOfModel = new Map<string, NoteType>()
  for (const an of pkg.notes) {
    const model = models.get(an.mid)
    const conversion = conversions.get(an.mid)
    if (!model || !conversion) {
      report.errors.push({ line: an.id, code: 'unknownModel' })
      continue
    }
    if (conversion.converted && !converted.has(model.id)) {
      converted.add(model.id)
      report.convertedModels.push({ name: model.name, mergedFields: conversion.mergedFields })
    }
    const fields = conversion.map(an.fields)
    let noteType: NoteType | undefined
    if (conversion.noteType) {
      noteType = typeOfModel.get(model.id)
      if (!noteType) {
        const shape = conversion.noteType
        noteType = resolveNoteType(model.id, shape, existing.noteTypes ?? [], noteTypes, now, newId)
        typeOfModel.set(model.id, noteType)
      }
    }
    // Occlusion shapes converted or left out, counted for the notes written (created or updated).
    const countShapes = () => {
      if (conversion.modelType !== 'image_occlusion') return
      const shapes = occlusionFromAnki(an.fields[0] ?? '')
      report.shapesConverted += shapes.converted
      report.shapesSkipped += shapes.skipped
    }
    const updatedAt = an.mod * 1000
    const known = byGuid.get(an.guid)
    const ankiCards = (cardsByNote.get(an.id) ?? []).sort((a, b) => a.ord - b.ord)
    if (known) {
      // Re-import (05 §2.3): Anki's copy replaces the fields and tags when it is more recent and
      // the note keeps its type (the fields would not mean the same thing otherwise); any other
      // note is left untouched and counted as skipped.
      if (
        updatedAt <= known.updatedAt ||
        conversion.modelType !== known.modelType ||
        known.noteTypeId !== noteType?.id ||
        updated.has(known.id)
      ) {
        report.skipped++
        continue
      }
      // Its cards follow the new content (invariant 2): a card whose ord is no longer generated
      // goes (its log stays), a new ord gets a card made as for a new note, in the deck of the
      // note; the cards that keep their ord are left as they are, schedule and log included.
      const knownDeck = deckById.get(known.deckId)
      if (!knownDeck) {
        report.errors.push({ line: an.id, code: 'orphanCard' })
        continue
      }
      const wanted = cardOrds(conversion.modelType, fields, noteType)
      if (wanted.length === 0) {
        report.errors.push({ line: an.id, code: noCardError(conversion.modelType) })
        countShapes()
        continue
      }
      const { create, remove } = reconcileCards(cardsOfNote.get(known.id) ?? [], wanted)
      updated.add(known.id)
      plan.updates.push({ ...known, fields, tags: an.tags, updatedAt })
      removedCards.push(...remove)
      addCards(known, knownDeck, create, an, ankiCards)
      countShapes()
      continue
    }
    const deck = targetDeck(ankiCards[0]?.did ?? '1')
    if (!deck) {
      report.errors.push({ line: an.id, code: 'orphanCard' })
      continue
    }
    const ords = cardOrds(conversion.modelType, fields, noteType)
    if (ords.length === 0) {
      report.errors.push({ line: an.id, code: noCardError(conversion.modelType) })
      countShapes()
      continue
    }
    countShapes()
    const note: Note = {
      id: newId(),
      deckId: deck.id,
      modelType: conversion.modelType,
      fields,
      tags: an.tags,
      sourceGuid: an.guid,
      // Anki note ids are creation times (ms): keeps the original order of new cards.
      createdAt: an.id,
      updatedAt,
    }
    if (noteType) note.noteTypeId = noteType.id
    plan.notes.push(note)
    report.skipped += ankiCards.filter((c) => !ords.includes(c.ord)).length
    addCards(note, deck, ords, an, ankiCards)
  }

  // Media: stored under their real names; a name taken by different content gets a suffix and
  // the references are rewritten (05 §2.3).
  const renames = new Map<string, string>()
  const imported = new Set<string>()
  const media: ImportMedia[] = []
  for (const m of pkg.media) {
    const mime = mimeFromName(m.name)
    if (!mime || !mediaKind(mime)) {
      report.skipped++
      continue
    }
    const sha = await sha256Hex(m.data)
    const known = existing.media.get(m.name)
    let name = m.name
    if (known === sha) continue
    if (known !== undefined) {
      name = uniqueName(m.name, (n) => existing.media.has(n) || imported.has(n))
      renames.set(m.name, name)
    }
    imported.add(name)
    media.push({ name, blob: new Blob([m.data], { type: mime }), mime })
  }
  if (renames.size > 0) {
    const rewrite = (note: Note): Note => {
      let fields = note.fields
      for (const [from, to] of renames) fields = fields.map((f) => renameMediaRefs(f, from, to))
      return { ...note, fields }
    }
    plan.notes = plan.notes.map(rewrite)
    plan.updates = plan.updates.map(rewrite)
  }
  plan.media = media

  const available = new Set([
    ...existing.media.keys(),
    ...imported,
    ...pkg.media.map((m) => renames.get(m.name) ?? m.name),
  ])
  const missing = new Set(pkg.missingMedia)
  for (const note of [...plan.notes, ...plan.updates]) {
    for (const field of note.fields) {
      const refs = mediaRefs(field)
      for (const name of [...refs.images, ...refs.sounds])
        if (!available.has(name)) missing.add(name)
    }
  }

  plan.decks = resolver.created
  // Only the types of the notes actually created.
  const used = new Set(plan.notes.map((n) => n.noteTypeId))
  plan.noteTypes = noteTypes.filter((t) => used.has(t.id))
  report.noteTypesCreated = plan.noteTypes.map((t) => t.name)
  report.decksCreated = resolver.created.map((d) => d.name)
  report.notesCreated = plan.notes.length
  report.cardsCreated = plan.cards.length
  report.notesUpdated = plan.updates.length
  report.cardsRemoved = removedCards.length
  report.reviewsImported = plan.reviews.length
  report.mediaImported = plan.media.length
  report.missingMedia = [...missing].sort()
  return plan
}

/** Summary shown before importing (04-UI §2.5 « analyse »). */
export function describePackage(pkg: ApkgPackage) {
  const cardsPerDeck = new Map<string, number>()
  for (const c of pkg.cards) cardsPerDeck.set(c.did, (cardsPerDeck.get(c.did) ?? 0) + 1)
  return {
    decks: pkg.decks
      .filter((d) => (cardsPerDeck.get(d.id) ?? 0) > 0)
      .map((d) => ({ name: d.name, cards: cardsPerDeck.get(d.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    models: pkg.models.map((m) => ({ name: m.name, ...convertModel(m) })),
    notes: pkg.notes.length,
    cards: pkg.cards.length,
    media: pkg.media.length,
    reviews: pkg.revlog.length,
    size: pkg.size,
  }
}
