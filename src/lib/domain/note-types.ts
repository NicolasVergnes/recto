/**
 * Custom note types (02 §2.2, M8): validation, defaults and the effect of an edit on the notes
 * and cards of the type. Pure: the repository applies the plan in one transaction.
 */
import { makeCard } from './defaults'
import { isEmptyField, referencedFields, templateOrds } from './templates'
import type { Card, CardTemplate, Note, NoteType } from './types'

export type NoteTypeErrorCode =
  'noteTypeName' | 'noteTypeFields' | 'noteTypeTemplates' | 'noteTypeUnknownField'

/** A field or template of an edited type: `from` is its index in the stored type, null if new. */
export interface EditedField {
  name: string
  from: number | null
}
export interface EditedTemplate extends CardTemplate {
  from: number | null
}

export interface NoteTypeEdit {
  name: string
  fields: EditedField[]
  templates: EditedTemplate[]
}

/** A new type: « Recto » and « Verso », one card asking the front. */
export const DEFAULT_NOTE_TYPE: Pick<NoteType, 'fields' | 'templates'> = {
  fields: ['Recto', 'Verso'],
  templates: [
    { name: 'Carte 1', front: '{{Recto}}', back: '{{FrontSide}}<hr id=answer>{{Verso}}' },
  ],
}

/** Anki's special fields: a template may use them without a field of that name. */
const SPECIAL_FIELDS = new Set(['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'Card', 'CardFlag'])

const usesField = (template: CardTemplate, name: string) =>
  referencedFields(template.front).includes(name) || referencedFields(template.back).includes(name)

/** Names of the templates whose question or answer uses field `name` (M11: it cannot be removed). */
export function fieldUsers(templates: readonly CardTemplate[], name: string): string[] {
  return templates.filter((t) => usesField(t, name.trim())).map((t) => t.name)
}

/** The first template reference to a field the type does not have (a removed or renamed one). */
export function unknownReference(
  input: Pick<NoteType, 'fields' | 'templates'>,
): { field: string; card: string } | null {
  const known = new Set(input.fields.map((f) => f.trim()))
  for (const t of input.templates) {
    for (const field of [...referencedFields(t.front), ...referencedFields(t.back)]) {
      if (!known.has(field) && !SPECIAL_FIELDS.has(field)) return { field, card: t.name }
    }
  }
  return null
}

/** Characters a field name cannot hold: they would end or change a `{{…}}` reference. */
const BAD_FIELD_NAME = /[{}:"]|^[#^/]/

/**
 * A type needs a name, at least one field, every field named once (case-insensitive, like Anki)
 * with a name usable in a template, and at least one named template, using existing fields only.
 */
export function validateNoteType(
  input: Pick<NoteType, 'name' | 'fields' | 'templates'>,
): NoteTypeErrorCode | null {
  if (!input.name.trim()) return 'noteTypeName'
  const names = input.fields.map((f) => f.trim())
  const unique = new Set(names.map((n) => n.toLowerCase()))
  if (names.length === 0 || unique.size !== names.length) return 'noteTypeFields'
  if (names.some((n) => !n || BAD_FIELD_NAME.test(n))) return 'noteTypeFields'
  if (input.templates.length === 0 || input.templates.some((t) => !t.name.trim()))
    return 'noteTypeTemplates'
  if (unknownReference(input)) return 'noteTypeUnknownField'
  return null
}

/** A template as stored: `twoWay` only when set (M16), the name trimmed. */
export function storedTemplate({ name, front, back, twoWay }: CardTemplate): CardTemplate {
  return twoWay ? { name: name.trim(), front, back, twoWay } : { name: name.trim(), front, back }
}

/** The edit of a stored type that changes nothing (the editor's starting point). */
export function editOf(type: Pick<NoteType, 'name' | 'fields' | 'templates'>): NoteTypeEdit {
  return {
    name: type.name,
    fields: type.fields.map((name, i) => ({ name, from: i })),
    templates: type.templates.map((t, i) => ({ ...storedTemplate(t), name: t.name, from: i })),
  }
}

export interface NoteTypeEditPlan {
  type: NoteType
  /** Notes whose fields change (added or removed fields). */
  notes: Note[]
  /** Cards that keep their template under another index (with their new `ord`). */
  moved: Card[]
  /** Cards of a removed template, or whose question became empty; their review log is kept. */
  removed: string[]
  added: Card[]
  /** Removed fields that held something, with the number of notes losing that content. */
  lost: { field: string; notes: number }[]
}

/**
 * What saving `edit` does to the notes and cards of `type` (invariant 2: a note has one card per
 * template whose question is not empty). Cards follow their template when templates are removed
 * (their `ord` shifts), so a card's schedule and history stay with what it asks.
 */
export function planNoteTypeEdit(
  type: NoteType,
  edit: NoteTypeEdit,
  notes: readonly Note[],
  cards: readonly Card[],
  now: number,
  newId: () => string,
): NoteTypeEditPlan {
  const next: NoteType = {
    ...type,
    name: edit.name.trim(),
    fields: edit.fields.map((f) => f.name.trim()),
    templates: edit.templates.map(storedTemplate),
    updatedAt: now,
  }
  // Anki's sort field follows its field; a removed one falls back to the first (M10).
  const sorted = type.anki?.sortField
  if (next.anki && sorted !== undefined) {
    next.anki = {
      ...next.anki,
      sortField: Math.max(
        0,
        edit.fields.findIndex((f) => f.from === sorted),
      ),
    }
  }
  const fieldsChanged =
    edit.fields.length !== type.fields.length || edit.fields.some((f, i) => f.from !== i)
  const newOrd = new Map<number, number>()
  edit.templates.forEach((t, i) => {
    if (t.from !== null) newOrd.set(t.from, i)
  })
  const cardsByNote = new Map<string, Card[]>()
  for (const c of cards) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c])

  const plan: NoteTypeEditPlan = {
    type: next,
    notes: [],
    moved: [],
    removed: [],
    added: [],
    lost: [],
  }
  const kept = new Set(edit.fields.map((f) => f.from))
  type.fields.forEach((field, i) => {
    if (kept.has(i)) return
    const n = notes.filter((note) => !isEmptyField(note.fields[i] ?? '')).length
    if (n > 0) plan.lost.push({ field, notes: n })
  })
  for (const note of notes) {
    const fields = fieldsChanged
      ? edit.fields.map((f) => (f.from === null ? '' : (note.fields[f.from] ?? '')))
      : note.fields
    if (fieldsChanged) plan.notes.push({ ...note, fields, updatedAt: now })
    const wanted = new Set(templateOrds(next, fields))
    const keptOrds = new Set<number>()
    for (const card of cardsByNote.get(note.id) ?? []) {
      const ord = newOrd.get(card.ord)
      if (ord === undefined || !wanted.has(ord) || keptOrds.has(ord)) {
        plan.removed.push(card.id)
        continue
      }
      keptOrds.add(ord)
      if (ord !== card.ord) plan.moved.push({ ...card, ord, updatedAt: now })
    }
    for (const ord of wanted)
      if (!keptOrds.has(ord)) plan.added.push(makeCard(note, ord, newId(), now))
  }
  return plan
}
