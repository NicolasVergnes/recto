/**
 * Typed data access (02-DATA-MODEL §4). Components never call Dexie directly. Every multi-table
 * write is a transaction; `reviews` is append-only except the explicit deletions listed below.
 */
import { buildRow, type BrowserRow } from '../domain/browse'
import { deckPath } from '../domain/decks'
import { makeCard, makeDeck, resetScheduling, type NewDeckInput } from '../domain/defaults'
import { cardOrds, normalizeFields, noteFront } from '../domain/notes'
import { normalizeText } from '../domain/text'
import type { Card, Deck, DeckSettings, Flag, ModelType, Note } from '../domain/types'
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
  emoji?: string
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
    if (patch.emoji !== undefined) next.emoji = patch.emoji
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
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await requireDeck(sourceId)
    const target = await requireDeck(targetId)
    if (target.parentId === sourceId) throw new RepoError('deckMergeSelf')
    const topLevel = target.parentId ?? target.id
    await db.decks.where('parentId').equals(sourceId).modify({ parentId: topLevel, updatedAt: now })
    await db.notes.where('deckId').equals(sourceId).modify({ deckId: targetId, updatedAt: now })
    await db.cards.where('deckId').equals(sourceId).modify({ deckId: targetId })
    await db.decks.delete(sourceId)
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
export async function deleteDeck(id: string): Promise<DeletionCounts> {
  return db.transaction('rw', [db.decks, db.notes, db.cards, db.reviews], async () => {
    const ids = await deckFamily(id)
    const cardIds = await db.cards.where('deckId').anyOf(ids).primaryKeys()
    const notes = await db.notes.where('deckId').anyOf(ids).delete()
    await db.reviews.where('cardId').anyOf(cardIds).delete()
    await db.cards.bulkDelete(cardIds)
    await db.decks.bulkDelete(ids)
    return { decks: ids.length, notes, cards: cardIds.length }
  })
}

export interface DeckCount {
  cards: number
  notes: number
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
  fields: string[]
  tags: string[]
  source?: string
}

function buildNoteFields(input: NoteInput): { fields: string[]; ords: number[] } {
  const fields = normalizeFields(input.modelType, input.fields)
  const ords = cardOrds(input.modelType, fields)
  if (ords.length === 0) throw new RepoError('noteNoCloze')
  return { fields, ords }
}

export async function createNote(
  input: NoteInput,
  now: number,
): Promise<{ note: Note; cards: Card[] }> {
  const { fields, ords } = buildNoteFields(input)
  const note: Note = {
    id: newId(),
    deckId: input.deckId,
    modelType: input.modelType,
    fields,
    tags: [...input.tags],
    createdAt: now,
    updatedAt: now,
  }
  if (input.source) note.source = input.source
  const cards = ords.map((ord) => makeCard(note, ord, newId(), now))
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await requireDeck(input.deckId)
    await db.notes.add(note)
    await db.cards.bulkAdd(cards)
  })
  return { note, cards }
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
  const { fields, ords } = buildNoteFields(input)
  return db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    const existing = await db.notes.get(id)
    if (!existing) throw new RepoError('noteNotFound')
    await requireDeck(input.deckId)
    const note: Note = {
      ...existing,
      deckId: input.deckId,
      modelType: input.modelType,
      fields,
      tags: [...input.tags],
      updatedAt: now,
    }
    if (input.source) note.source = input.source
    else delete note.source
    const cards = await db.cards.where('noteId').equals(id).toArray()
    const removed = cards.filter((c) => !ords.includes(c.ord)).map((c) => c.id)
    const present = new Set(cards.map((c) => c.ord))
    const added = ords.filter((o) => !present.has(o)).map((o) => makeCard(note, o, newId(), now))
    await db.notes.put(note)
    await db.cards.bulkDelete(removed)
    await db.cards.bulkAdd(added)
    if (existing.deckId !== note.deckId) {
      await db.cards.where('noteId').equals(id).modify({ deckId: note.deckId })
    }
    return { note, added, removed }
  })
}

/** Explicit user deletion: notes, their cards and their review log (invariant 3). */
export async function deleteNotes(noteIds: readonly string[]): Promise<number> {
  return db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
    const cardIds = await db.cards.where('noteId').anyOf(noteIds).primaryKeys()
    await db.reviews.where('cardId').anyOf(cardIds).delete()
    await db.cards.bulkDelete(cardIds)
    await db.notes.bulkDelete([...noteIds])
    return cardIds.length
  })
}

export async function moveNotes(noteIds: readonly string[], deckId: string, now: number) {
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await requireDeck(deckId)
    await db.notes.where('id').anyOf(noteIds).modify({ deckId, updatedAt: now })
    await db.cards.where('noteId').anyOf(noteIds).modify({ deckId })
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
  const key = normalizeText(front)
  if (!key) return undefined
  return db.notes
    .where('deckId')
    .equals(deckId)
    .filter((n) => n.id !== exceptNoteId && normalizeText(noteFront(n)) === key)
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

export async function setSuspended(cardIds: readonly string[], suspended: boolean) {
  await db.cards.where('id').anyOf(cardIds).modify({ suspended })
}

export async function setFlag(cardIds: readonly string[], flag: Flag) {
  await db.cards.where('id').anyOf(cardIds).modify({ flag })
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
  const [cards, notes, decks] = await Promise.all([
    db.cards.toArray(),
    db.notes.toArray(),
    db.decks.toArray(),
  ])
  const noteById = new Map(notes.map((n) => [n.id, n]))
  const deckById = new Map(decks.map((d) => [d.id, d]))
  const rows: BrowserRow[] = []
  for (const card of cards) {
    const note = noteById.get(card.noteId)
    const deck = deckById.get(card.deckId)
    if (note) rows.push(buildRow(card, note, deck ? deckPath(deck, deckById) : ''))
  }
  return rows
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
