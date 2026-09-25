/**
 * Anki package → Recto import plan (05-IMPORT-EXPORT §2.3). Pure (async only for sha256).
 */
import { makeCard } from '../domain/defaults'
import { cardOrds } from '../domain/notes'
import { occlusionFromAnki, serializeOcclusion } from '../domain/occlusion'
import { mediaRefs, renameMediaRefs } from '../domain/text'
import type { Card, Deck, ModelType, Note, Rating, Review, SchedulerKind } from '../domain/types'
import { sha256Hex } from '../media/hash'
import { mediaKind, mimeFromName } from '../media/mime'
import { getScheduler } from '../scheduler'
import { boxFromStability } from '../scheduler/leitner'
import type { ApkgCard, ApkgModel, ApkgPackage } from './apkg-read'
import { DeckResolver } from './decks'
import { emptyReport, type ImportMedia, type ImportPlan } from './plan'

export * from './apkg-read'

const DAY_MS = 86_400_000
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
  /** Stored media: name → sha256. */
  media: ReadonlyMap<string, string>
}

export interface ModelConversion {
  modelType: ModelType
  /** Fields merged into Extra (or unknown template layout): reported. */
  mergedFields: number
  converted: boolean
  map: (fields: readonly string[]) => string[]
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
 * cloze → [Texte, Extra + rest]; standard with one template → basic; with two templates whose
 * second asks the second field → basic_reverse; otherwise basic and reported. Model CSS is
 * ignored.
 */
export function convertModel(model: ApkgModel): ModelConversion {
  const n = model.fields.length
  if (isAnkiImageOcclusion(model)) {
    return {
      modelType: 'image_occlusion',
      mergedFields: Math.max(0, n - 4),
      converted: false,
      map: (f) => [
        f[1] ?? '',
        serializeOcclusion(occlusionFromAnki(f[0] ?? '').occlusion),
        f[2] ?? '',
        joinRest(f, 3),
      ],
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
  const second = model.fields[1]
  const reverse =
    model.templates.length === 2 &&
    !!second &&
    (model.templates[1]?.qfmt.includes(`{{${second}}}`) ?? false)
  const merged = Math.max(0, n - 3)
  return {
    modelType: reverse ? 'basic_reverse' : 'basic',
    mergedFields: merged,
    converted: merged > 0 || (model.templates.length > 1 && !reverse),
    map: (f) => [f[0] ?? '', f[1] ?? '', joinRest(f, 2)],
  }
}

/** Card state without history (05 §2.3). */
function convertCardState(ac: ApkgCard, base: Card, crt: number, now: number, deck: Deck): Card {
  const card: Card = { ...base, suspended: ac.queue === -1, reps: ac.reps, lapses: ac.lapses }
  if (ac.type === 2) {
    const ivl = Math.max(1, ac.ivl)
    const due = (crt + ac.due * 86_400) * 1000
    const stability = ivl
    card.state = 2
    card.due = due
    card.scheduledDays = ivl
    card.stability = stability
    card.difficulty = Math.min(10, Math.max(1, 11 - (ac.factor / 1000) * 2))
    card.lastReview = due - ivl * DAY_MS
    if (deck.scheduler === 'leitner') card.box = boxFromStability(stability)
  } else if (ac.type === 1 || ac.type === 3) {
    // Learning: due now; FSRS treats an empty memory state as a first review.
    card.state = 1
    card.due = now
    if (deck.scheduler === 'leitner') card.box = 1
  }
  return card
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
  const plan: ImportPlan = {
    decks: [],
    notes: [],
    cards: [],
    reviews: [],
    updates: [],
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
  const byGuid = new Map(existing.notes.filter((n) => n.sourceGuid).map((n) => [n.sourceGuid, n]))
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

  const converted = new Set<string>()
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
    if (conversion.modelType === 'image_occlusion') {
      const shapes = occlusionFromAnki(an.fields[0] ?? '')
      report.shapesConverted += shapes.converted
      report.shapesSkipped += shapes.skipped
    }
    const updatedAt = an.mod * 1000
    const known = byGuid.get(an.guid)
    if (known) {
      // Re-import (05 §2.3): update the fields when Anki's copy is more recent — and of the same
      // note type, since fields of different types do not mean the same thing.
      if (updatedAt > known.updatedAt && known.modelType === conversion.modelType)
        plan.updates.push({ ...known, fields, tags: an.tags, updatedAt })
      else report.skipped++
      continue
    }
    const ankiCards = (cardsByNote.get(an.id) ?? []).sort((a, b) => a.ord - b.ord)
    const deck = targetDeck(ankiCards[0]?.did ?? '1')
    if (!deck) {
      report.errors.push({ line: an.id, code: 'orphanCard' })
      continue
    }
    const ords = cardOrds(conversion.modelType, fields)
    if (ords.length === 0) {
      const code = conversion.modelType === 'image_occlusion' ? 'noMask' : 'noCloze'
      report.errors.push({ line: an.id, code })
      continue
    }
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
    plan.notes.push(note)
    report.skipped += ankiCards.filter((c) => !ords.includes(c.ord)).length
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
        plan.cards.push(convertCardState(ac, base, pkg.crt, now, deck))
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
  report.decksCreated = resolver.created.map((d) => d.name)
  report.notesCreated = plan.notes.length
  report.cardsCreated = plan.cards.length
  report.notesUpdated = plan.updates.length
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
