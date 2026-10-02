/**
 * Custom note types (02 §2.2, M8): validation, defaults and the effect of an edit on the notes
 * and cards of the type. Pure: the repository applies the plan in one transaction.
 */
import { makeCard } from './defaults'
import { templateOrds } from './templates'
import type { Card, CardTemplate, Note, NoteType } from './types'

export type NoteTypeErrorCode = 'noteTypeName' | 'noteTypeFields' | 'noteTypeTemplates'

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

/** Characters a field name cannot hold: they would end or change a `{{…}}` reference. */
const BAD_FIELD_NAME = /[{}:"]|^[#^/]/

/**
 * A type needs a name, at least one field, every field named once (case-insensitive, like Anki)
 * with a name usable in a template, and at least one named template.
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
  return null
}

/** The edit of a stored type that changes nothing (the editor's starting point). */
export function editOf(type: Pick<NoteType, 'name' | 'fields' | 'templates'>): NoteTypeEdit {
  return {
    name: type.name,
    fields: type.fields.map((name, i) => ({ name, from: i })),
    templates: type.templates.map((t, i) => ({
      name: t.name,
      front: t.front,
      back: t.back,
      from: i,
    })),
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
    templates: edit.templates.map(({ name, front, back }) => ({ name: name.trim(), front, back })),
    updatedAt: now,
  }
  const fieldsChanged =
    edit.fields.length !== type.fields.length || edit.fields.some((f, i) => f.from !== i)
  const newOrd = new Map<number, number>()
  edit.templates.forEach((t, i) => {
    if (t.from !== null) newOrd.set(t.from, i)
  })
  const cardsByNote = new Map<string, Card[]>()
  for (const c of cards) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c])

  const plan: NoteTypeEditPlan = { type: next, notes: [], moved: [], removed: [], added: [] }
  for (const note of notes) {
    const fields = fieldsChanged
      ? edit.fields.map((f) => (f.from === null ? '' : (note.fields[f.from] ?? '')))
      : note.fields
    if (fieldsChanged) plan.notes.push({ ...note, fields, updatedAt: now })
    const wanted = new Set(templateOrds(next, fields))
    const kept = new Set<number>()
    for (const card of cardsByNote.get(note.id) ?? []) {
      const ord = newOrd.get(card.ord)
      if (ord === undefined || !wanted.has(ord) || kept.has(ord)) {
        plan.removed.push(card.id)
        continue
      }
      kept.add(ord)
      if (ord !== card.ord) plan.moved.push({ ...card, ord })
    }
    for (const ord of wanted) if (!kept.has(ord)) plan.added.push(makeCard(note, ord, newId(), now))
  }
  return plan
}
