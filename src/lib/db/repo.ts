/**
 * Typed data access (02-DATA-MODEL §4). Components never call Dexie directly. Every multi-table
 * write is a transaction; `reviews` is append-only except the explicit deletions listed below.
 */
import { buildRow, type BrowserRow } from '../domain/browse'
import { deckPath, type DeckCount } from '../domain/decks'
import { makeCard, makeDeck, resetScheduling, type NewDeckInput } from '../domain/defaults'
import {
  planNoteTypeEdit,
  storedTemplate,
  validateNoteType,
  type NoteTypeEdit,
  type NoteTypeEditPlan,
} from '../domain/note-types'
import { cardOrds, normalizeFields, noteFront, reconcileCards } from '../domain/notes'
import { parseOcclusion, serializeOcclusion } from '../domain/occlusion'
import { frontKey, normalizeText } from '../domain/text'
import type {
  Card,
  CardTemplate,
  Deck,
  DeckSettings,
  Flag,
  ModelType,
  Note,
  NoteType,
} from '../domain/types'
import { recordDeletions } from './deletions'
import { RepoError } from './errors'
import { db, newId } from './schema'

// ─── Decks ──────────────────────────────────────────────────────────────────

export function listDecks(): Promise<Deck[]> {
  return db.decks.toArray()
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  return db.decks.get(id)
}

async function requireDeck(id: string): Promise<Deck> {
  const deck = await db.decks.get(id)
  if (!deck) throw new RepoError('deckNotFound')
  return deck
}

/** Sibling names are unique (case-insensitive) so that `Parent::Child` paths are unambiguous. */
async function assertNameFree(name: string, parentId: string | null, exceptId?: string) {
  const key = normalizeText(name)
  if (!key) throw new RepoError('deckNameEmpty')
  const siblings = await db.decks.filter((d) => (d.parentId ?? null) === parentId).toArray()
  if (siblings.some((d) => d.id !== exceptId && normalizeText(d.name) === key)) {
    throw new RepoError('deckNameTaken')
  }
}

/** One level of nesting only (SPEC §5.1): a parent must be a top-level deck. */
async function assertValidParent(parentId: string | null, childId?: string) {
  if (parentId === null) return
  if (parentId === childId) throw new RepoError('deckNesting')
  const parent = await requireDeck(parentId)
  if (parent.parentId) throw new RepoError('deckNesting')
  if (childId && (await db.decks.where('parentId').equals(childId).count()) > 0) {
    throw new RepoError('deckNesting')
  }
}

export async function createDeck(input: NewDeckInput, now: number): Promise<Deck> {
  const parentId = input.parentId ?? null
  return db.transaction('rw', db.decks, async () => {
    await assertValidParent(parentId)
    await assertNameFree(input.name, parentId)
    const deck = makeDeck({ ...input, parentId }, newId(), now)
    await db.decks.add(deck)
    return deck
  })
}

export interface DeckPatch {
  name?: string
  description?: string
  settings?: DeckSettings
}

export async function updateDeck(id: string, patch: DeckPatch, now: number): Promise<Deck> {
  return db.transaction('rw', db.decks, async () => {
    const deck = await requireDeck(id)
    const next: Deck = { ...deck, updatedAt: now }
    if (patch.name !== undefined) {
      await assertNameFree(patch.name, deck.parentId ?? null, id)
      next.name = patch.name.trim()
    }
    if (patch.description !== undefined) next.description = patch.description
    if (patch.settings !== undefined) next.settings = patch.settings
    await db.decks.put(next)
    return next
  })
}

export async function moveDeck(id: string, parentId: string | null, now: number): Promise<void> {
  await db.transaction('rw', db.decks, async () => {
    const deck = await requireDeck(id)
    await assertValidParent(parentId, id)
    await assertNameFree(deck.name, parentId, id)
    await db.decks.put({ ...deck, parentId, updatedAt: now })
  })
}

/**
 * Moves every note and card of `sourceId` into `targetId`, re-parents the source's sub-decks to
 * the target's top-level deck, then removes the source deck. Reviews keep their historical deckId.
 */
export async function mergeDecks(sourceId: string, targetId: string, now: number): Promise<void> {
  if (sourceId === targetId) throw new RepoError('deckMergeSelf')
  await db.transaction('rw', [db.decks, db.notes, db.cards, db.deletions], async () => {
    await requireDeck(sourceId)
    const target = await requireDeck(targetId)
    if (target.parentId === sourceId) throw new RepoError('deckMergeSelf')
    const topLevel = target.parentId ?? target.id
    await db.decks.where('parentId').equals(sourceId).modify({ parentId: topLevel, updatedAt: now })
    await db.notes.where('deckId').equals(sourceId).modify({ deckId: targetId, updatedAt: now })
    await db.cards.where('deckId').equals(sourceId).modify({ deckId: targetId, updatedAt: now })
    await db.decks.delete(sourceId)
    await recordDeletions('decks', [sourceId], now)
  })
}

export interface DeletionCounts {
  decks: number
  notes: number
  cards: number
}

/** Ids of a deck and its sub-decks. */
export async function deckFamily(id: string): Promise<string[]> {
  const children = await db.decks.where('parentId').equals(id).primaryKeys()
  return [id, ...children]
}

export async function countDeckContents(id: string): Promise<DeletionCounts> {
  const ids = await deckFamily(id)
  const [notes, cards] = await Promise.all([
    db.notes.where('deckId').anyOf(ids).count(),
    db.cards.where('deckId').anyOf(ids).count(),
  ])
  return { decks: ids.length, notes, cards }
}

/** Explicit user deletion: the deck, its sub-decks, their notes, cards and review log. */
export async function deleteDeck(id: string, now: number): Promise<DeletionCounts> {
  const tables = [db.decks, db.notes, db.cards, db.reviews, db.deletions]
  return db.transaction('rw', tables, async () => {
    const ids = await deckFamily(id)
    const noteIds = await db.notes.where('deckId').anyOf(ids).primaryKeys()
    const cardIds = await db.cards.where('deckId').anyOf(ids).primaryKeys()
    const reviewIds = await db.reviews.where('cardId').anyOf(cardIds).primaryKeys()
    await db.reviews.bulkDelete(reviewIds)
    await db.cards.bulkDelete(cardIds)
    await db.notes.bulkDelete(noteIds)
    await db.decks.bulkDelete(ids)
    await recordDeletions('reviews', reviewIds, now)
    await recordDeletions('cards', cardIds, now)
    await recordDeletions('notes', noteIds, now)
    await recordDeletions('decks', ids, now)
    return { decks: ids.length, notes: noteIds.length, cards: cardIds.length }
  })
}

export async function deckCounts(): Promise<Map<string, DeckCount>> {
  const counts = new Map<string, DeckCount>()
  const get = (id: string) => {
    let c = counts.get(id)
    if (!c) counts.set(id, (c = { cards: 0, notes: 0 }))
    return c
  }
  await db.cards.each((c) => {
    get(c.deckId).cards++
  })
  await db.notes.each((n) => {
    get(n.deckId).notes++
  })
  return counts
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export interface NoteInput {
  deckId: string
  modelType: ModelType
  /** custom notes only. */
  noteTypeId?: string
  fields: string[]
  tags: string[]
  /** basic notes only: never asked back → front (M11). */
  oneWay?: boolean
  /** cloze and image_occlusion notes only: one card for every index or group (M14). */
  single?: boolean
  /** custom notes only: occlusion masks of the image fields, aligned with `fields` (M14). */
  masks?: string[]
  source?: string
}

const NO_CARD: Record<ModelType, 'noteNoCloze' | 'noteNoMask' | 'noteNoCard'> = {
  basic: 'noteNoCard',
  cloze: 'noteNoCloze',
  image_occlusion: 'noteNoMask',
  custom: 'noteNoCard',
}

/** The note type of a custom note (read inside the caller's transaction). */
async function noteTypeOf(input: Pick<NoteInput, 'modelType' | 'noteTypeId'>) {
  if (input.modelType !== 'custom') return undefined
  const type = input.noteTypeId ? await db.noteTypes.get(input.noteTypeId) : undefined
  if (!type) throw new RepoError('noteTypeNotFound')
  return type
}

/** Occlusion masks in their canonical form (clamped, rounded, invalid ones dropped). */
const canonicalMasks = (json: string) => (json ? serializeOcclusion(parseOcclusion(json)) : '')

/** What a note stores from `input`, with the cards its content generates. */
function buildNoteContent(
  input: NoteInput,
  noteType: NoteType | undefined,
): { content: Pick<Note, 'fields' | 'single' | 'masks'>; ords: number[] } {
  const fields = normalizeFields(input.modelType, input.fields, noteType)
  const content: Pick<Note, 'fields' | 'single' | 'masks'> = { fields }
  if (input.modelType === 'image_occlusion') fields[1] = canonicalMasks(fields[1] ?? '')
  const kindOfCards = input.modelType === 'cloze' || input.modelType === 'image_occlusion'
  if (input.single && kindOfCards) content.single = true
  if (input.modelType === 'custom' && input.masks?.some((m) => m)) {
    content.masks = fields.map((_, i) => canonicalMasks(input.masks?.[i] ?? ''))
  }
  const ords = cardOrds({ modelType: input.modelType, ...content }, noteType)
  if (ords.length === 0) throw new RepoError(NO_CARD[input.modelType])
  return { content, ords }
}

export async function createNote(
  input: NoteInput,
  now: number,
): Promise<{ note: Note; cards: Card[] }> {
  return db.transaction('rw', db.decks, db.notes, db.cards, db.noteTypes, async () => {
    await requireDeck(input.deckId)
    const noteType = await noteTypeOf(input)
    const { content, ords } = buildNoteContent(input, noteType)
    const note: Note = {
      id: newId(),
      deckId: input.deckId,
      modelType: input.modelType,
      ...content,
      tags: [...input.tags],
      createdAt: now,
      updatedAt: now,
    }
    if (noteType) note.noteTypeId = noteType.id
    if (input.oneWay && input.modelType === 'basic') note.oneWay = true
    if (input.source) note.source = input.source
    const cards = ords.map((ord) => makeCard(note, ord, newId(), now))
    await db.notes.add(note)
    await db.cards.bulkAdd(cards)
    return { note, cards }
  })
}

export function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id)
}

export async function getNotes(ids: readonly string[]): Promise<Note[]> {
  return (await db.notes.bulkGet([...ids])).filter((n): n is Note => n !== undefined)
}

export async function getCards(ids: readonly string[]): Promise<Card[]> {
  return (await db.cards.bulkGet([...ids])).filter((c): c is Card => c !== undefined)
}

export function getCardsOfNote(noteId: string): Promise<Card[]> {
  return db.cards.where('noteId').equals(noteId).sortBy('ord')
}

/**
 * Saves a note and reconciles its cards (invariant 2): missing ords are created, cards of removed
 * ords (e.g. a deleted cloze index) are deleted while their review log is kept. A deck change
 * moves the cards in the same transaction (invariant 1).
 */
export async function updateNote(
  id: string,
  input: NoteInput,
  now: number,
): Promise<{ note: Note; added: Card[]; removed: string[] }> {
  const tables = [db.decks, db.notes, db.cards, db.noteTypes, db.deletions]
  return db.transaction('rw', tables, async () => {
    const existing = await db.notes.get(id)
    if (!existing) throw new RepoError('noteNotFound')
    await requireDeck(input.deckId)
    const noteType = await noteTypeOf(input)
    const { content, ords } = buildNoteContent(input, noteType)
    const note: Note = {
      ...existing,
      deckId: input.deckId,
      modelType: input.modelType,
      ...content,
      tags: [...input.tags],
      updatedAt: now,
    }
    if (!content.single) delete note.single
    if (!content.masks) delete note.masks
    if (noteType) note.noteTypeId = noteType.id
    else delete note.noteTypeId
    if (input.oneWay && input.modelType === 'basic') note.oneWay = true
    else delete note.oneWay
    if (input.source) note.source = input.source
    else delete note.source
    const cards = await db.cards.where('noteId').equals(id).toArray()
    const { create, remove } = reconcileCards(cards, ords)
    const removed = remove.map((c) => c.id)
    const added = create.map((o) => makeCard(note, o, newId(), now))
    await db.notes.put(note)
    await db.cards.bulkDelete(removed)
    await recordDeletions('cards', removed, now)
    await db.cards.bulkAdd(added)
    if (existing.deckId !== note.deckId) {
      await db.cards.where('noteId').equals(id).modify({ deckId: note.deckId, updatedAt: now })
    }
    return { note, added, removed }
  })
}

/** Explicit user deletion: notes, their cards and their review log (invariant 3). */
export async function deleteNotes(noteIds: readonly string[], now: number): Promise<number> {
  return db.transaction('rw', [db.notes, db.cards, db.reviews, db.deletions], async () => {
    const cardIds = await db.cards.where('noteId').anyOf(noteIds).primaryKeys()
    const reviewIds = await db.reviews.where('cardId').anyOf(cardIds).primaryKeys()
    const existing = await db.notes.where('id').anyOf(noteIds).primaryKeys()
    await db.reviews.bulkDelete(reviewIds)
    await db.cards.bulkDelete(cardIds)
    await db.notes.bulkDelete(existing)
    await recordDeletions('reviews', reviewIds, now)
    await recordDeletions('cards', cardIds, now)
    await recordDeletions('notes', existing, now)
    return cardIds.length
  })
}

export async function moveNotes(noteIds: readonly string[], deckId: string, now: number) {
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await requireDeck(deckId)
    await db.notes.where('id').anyOf(noteIds).modify({ deckId, updatedAt: now })
    await db.cards.where('noteId').anyOf(noteIds).modify({ deckId, updatedAt: now })
  })
}

export async function addTags(noteIds: readonly string[], tags: readonly string[], now: number) {
  if (tags.length === 0) return
  await db.notes
    .where('id')
    .anyOf(noteIds)
    .modify((note) => {
      for (const tag of tags) if (!note.tags.includes(tag)) note.tags.push(tag)
      note.updatedAt = now
    })
}

export async function removeTags(noteIds: readonly string[], tags: readonly string[], now: number) {
  if (tags.length === 0) return
  await db.notes
    .where('id')
    .anyOf(noteIds)
    .modify((note) => {
      note.tags = note.tags.filter((t) => !tags.includes(t))
      note.updatedAt = now
    })
}

/** Duplicate detection (SPEC §5.2): same normalised front in the same deck. */
export async function findDuplicate(
  deckId: string,
  front: string,
  exceptNoteId?: string,
): Promise<Note | undefined> {
  const key = frontKey(front)
  if (!key) return undefined
  return db.notes
    .where('deckId')
    .equals(deckId)
    .filter((n) => n.id !== exceptNoteId && frontKey(noteFront(n)) === key)
    .first()
}

export async function allTags(): Promise<string[]> {
  const keys = await db.notes.orderBy('tags').uniqueKeys()
  return keys.filter((k): k is string => typeof k === 'string')
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export function getCard(id: string): Promise<Card | undefined> {
  return db.cards.get(id)
}

export async function setSuspended(cardIds: readonly string[], suspended: boolean, now: number) {
  await db.cards.where('id').anyOf(cardIds).modify({ suspended, updatedAt: now })
}

export async function setFlag(cardIds: readonly string[], flag: Flag, now: number) {
  await db.cards.where('id').anyOf(cardIds).modify({ flag, updatedAt: now })
}

/** Puts cards back to "new" without touching the review log (SPEC §5.2). */
export async function resetCards(cardIds: readonly string[], now: number) {
  await db.cards
    .where('id')
    .anyOf(cardIds)
    .modify((card, ref) => {
      ref.value = resetScheduling(card, now)
    })
}

/** Every card with its note and deck path, for the card browser (filtered in memory). */
export async function loadBrowserRows(): Promise<BrowserRow[]> {
  const [cards, notes, decks, types] = await Promise.all([
    db.cards.toArray(),
    db.notes.toArray(),
    db.decks.toArray(),
    db.noteTypes.toArray(),
  ])
  const noteById = new Map(notes.map((n) => [n.id, n]))
  const deckById = new Map(decks.map((d) => [d.id, d]))
  const typeById = new Map(types.map((t) => [t.id, t]))
  const rows: BrowserRow[] = []
  for (const card of cards) {
    const note = noteById.get(card.noteId)
    const deck = deckById.get(card.deckId)
    const type = note?.noteTypeId ? typeById.get(note.noteTypeId) : undefined
    if (note) rows.push(buildRow(card, note, deck ? deckPath(deck, deckById) : '', type))
  }
  return rows
}

// --- Note types (M8) ---------------------------------------------------------

export function listNoteTypes(): Promise<NoteType[]> {
  return db.noteTypes.orderBy('name').toArray()
}

export function getNoteType(id: string): Promise<NoteType | undefined> {
  return db.noteTypes.get(id)
}

/** Note types by id (review sessions and exports render custom notes with them). */
export async function noteTypesById(): Promise<Map<string, NoteType>> {
  return new Map((await db.noteTypes.toArray()).map((t) => [t.id, t]))
}

/** A note of the type, for the preview of its templates. */
export function firstNoteOfType(id: string): Promise<Note | undefined> {
  return db.notes.where('noteTypeId').equals(id).first()
}

/** Number of notes of each note type. */
export async function noteTypeUsage(): Promise<Map<string, number>> {
  const usage = new Map<string, number>()
  await db.notes
    .where('modelType')
    .equals('custom')
    .each((n) => {
      if (n.noteTypeId) usage.set(n.noteTypeId, (usage.get(n.noteTypeId) ?? 0) + 1)
    })
  return usage
}

export interface NoteTypeInput {
  name: string
  fields: string[]
  templates: CardTemplate[]
}

export async function createNoteType(input: NoteTypeInput, now: number): Promise<NoteType> {
  const error = validateNoteType(input)
  if (error) throw new RepoError(error)
  const type: NoteType = {
    id: newId(),
    name: input.name.trim(),
    fields: input.fields.map((f) => f.trim()),
    templates: input.templates.map(storedTemplate),
    createdAt: now,
    updatedAt: now,
  }
  await db.noteTypes.add(type)
  return type
}

/** The edit's plan on the stored notes and cards (shown before saving, then applied). */
async function planEdit(id: string, edit: NoteTypeEdit, now: number) {
  const type = await db.noteTypes.get(id)
  if (!type) throw new RepoError('noteTypeNotFound')
  const error = validateNoteType(planNoteTypeEdit(type, edit, [], [], now, newId).type)
  if (error) throw new RepoError(error)
  const notes = await db.notes.where('noteTypeId').equals(id).toArray()
  const cards = await db.cards
    .where('noteId')
    .anyOf(notes.map((n) => n.id))
    .toArray()
  return planNoteTypeEdit(type, edit, notes, cards, now, newId)
}

/** Cards created and deleted, field contents lost, if `edit` were saved (nothing written). */
export async function previewNoteTypeEdit(id: string, edit: NoteTypeEdit) {
  const plan = await db.transaction('r', db.noteTypes, db.notes, db.cards, () =>
    planEdit(id, edit, 0),
  )
  return { added: plan.added.length, removed: plan.removed.length, lost: plan.lost }
}

/**
 * Saves a note type and reconciles its notes and cards in one transaction (invariant 2): fields
 * added or removed in every note, cards moved with their template, created or deleted (their
 * review log is kept, like a deleted cloze).
 */
export async function updateNoteType(
  id: string,
  edit: NoteTypeEdit,
  now: number,
): Promise<NoteTypeEditPlan> {
  return db.transaction('rw', [db.noteTypes, db.notes, db.cards, db.deletions], async () => {
    const plan = await planEdit(id, edit, now)
    await db.noteTypes.put(plan.type)
    await db.notes.bulkPut(plan.notes)
    await db.cards.bulkPut(plan.moved)
    await db.cards.bulkDelete(plan.removed)
    await recordDeletions('cards', plan.removed, now)
    await db.cards.bulkAdd(plan.added)
    return plan
  })
}

/** A note type is deleted only when no note uses it. */
export async function deleteNoteType(id: string, now: number): Promise<void> {
  await db.transaction('rw', db.noteTypes, db.notes, db.deletions, async () => {
    if ((await db.notes.where('noteTypeId').equals(id).count()) > 0)
      throw new RepoError('noteTypeInUse')
    await db.noteTypes.delete(id)
    await recordDeletions('noteTypes', [id], now)
  })
}

/** Whole-collection counts (home screen, settings, backups). */
export async function collectionCounts() {
  const [decks, notes, cards, reviews, media] = await Promise.all([
    db.decks.count(),
    db.notes.count(),
    db.cards.count(),
    db.reviews.count(),
    db.media.count(),
  ])
  return { decks, notes, cards, reviews, media }
}

/** "Tout effacer" (SPEC §5.7): deletes the whole database; the caller reloads the page. */
export async function wipeAll(): Promise<void> {
  await db.delete()
}

/** Notes to export as CSV: given notes, or a deck with its sub-decks, or everything. */
export async function exportRows(options: { noteIds?: readonly string[]; deckId?: string } = {}) {
  const decks = await db.decks.toArray()
  const byId = new Map(decks.map((d) => [d.id, d]))
  let notes: Note[]
  if (options.noteIds) notes = await getNotes(options.noteIds)
  else if (options.deckId)
    notes = await db.notes
      .where('deckId')
      .anyOf(await deckFamily(options.deckId))
      .toArray()
  else notes = await db.notes.toArray()
  notes.sort((a, b) => a.createdAt - b.createdAt)
  return notes.map((note) => {
    const deck = byId.get(note.deckId)
    return { note, deckPath: deck ? deckPath(deck, byId) : '' }
  })
}
