import { describe, expect, it } from 'vitest'
import { makeCard } from '$lib/domain/defaults'
import {
  DEFAULT_NOTE_TYPE,
  editOf,
  planNoteTypeEdit,
  validateNoteType,
} from '$lib/domain/note-types'
import type { Note, NoteType } from '$lib/domain/types'

const TYPE: NoteType = {
  id: 't1',
  name: 'Pays',
  fields: ['Pays', 'Capitale', 'Drapeau'],
  templates: [
    { name: 'Capitale', front: 'Capitale de {{Pays}} ?', back: '{{Capitale}}' },
    { name: 'Pays', front: '{{Capitale}} est la capitale de ?', back: '{{Pays}}' },
    { name: 'Drapeau', front: '{{Drapeau}}', back: '{{Pays}}' },
  ],
  createdAt: 1,
  updatedAt: 1,
}
const note = (id: string, fields: string[]): Note => ({
  id,
  deckId: 'd1',
  modelType: 'custom',
  noteTypeId: 't1',
  fields,
  tags: [],
  createdAt: 1,
  updatedAt: 1,
})
const france = note('n1', ['France', 'Paris', '<img src="fr.png">'])
const italie = note('n2', ['Italie', 'Rome', ''])
const cards = [
  makeCard(france, 0, 'f0', 1),
  makeCard(france, 1, 'f1', 1),
  makeCard(france, 2, 'f2', 1),
  makeCard(italie, 0, 'i0', 1),
  makeCard(italie, 1, 'i1', 1),
]
let next = 0
const newId = () => `new${next++}`

describe('note types', () => {
  it('validates names, fields and templates', () => {
    expect(validateNoteType({ name: 'T', ...DEFAULT_NOTE_TYPE })).toBeNull()
    expect(validateNoteType({ ...TYPE, name: ' ' })).toBe('noteTypeName')
    expect(validateNoteType({ ...TYPE, fields: [] })).toBe('noteTypeFields')
    expect(validateNoteType({ ...TYPE, fields: ['A', 'a'] })).toBe('noteTypeFields')
    expect(validateNoteType({ ...TYPE, fields: ['A', ''] })).toBe('noteTypeFields')
    expect(validateNoteType({ ...TYPE, fields: ['A:B'] })).toBe('noteTypeFields')
    expect(validateNoteType({ ...TYPE, fields: ['#A'] })).toBe('noteTypeFields')
    expect(validateNoteType({ ...TYPE, templates: [] })).toBe('noteTypeTemplates')
    expect(
      validateNoteType({ ...TYPE, templates: [{ name: '', front: '{{Pays}}', back: '' }] }),
    ).toBe('noteTypeTemplates')
  })

  it('changes nothing when nothing is edited', () => {
    const plan = planNoteTypeEdit(TYPE, editOf(TYPE), [france, italie], cards, 2, newId)
    expect(plan).toMatchObject({ notes: [], moved: [], removed: [], added: [] })
    expect(plan.type.updatedAt).toBe(2)
  })

  it('removes a template: its cards go, the next ones keep their schedule under a new ord', () => {
    const edit = editOf(TYPE)
    edit.templates.splice(0, 1)
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], cards, 2, newId)
    expect(plan.removed.sort()).toEqual(['f0', 'i0'])
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['f1', 0],
      ['f2', 1],
      ['i1', 0],
    ])
    expect(plan.added).toEqual([])
    expect(plan.type.templates.map((t) => t.name)).toEqual(['Pays', 'Drapeau'])
  })

  it('adds a template: a card for every note whose new question is not empty', () => {
    const edit = editOf(TYPE)
    edit.templates.push({ name: 'Inverse', front: '{{Drapeau}} ?', back: '', from: null })
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], cards, 2, newId)
    expect(plan.added.map((c) => [c.noteId, c.ord])).toEqual([['n1', 3]])
    expect(plan.removed).toEqual([])
  })

  it('adds and removes fields, keeping the values of the others', () => {
    const edit = editOf(TYPE)
    // Remove « Drapeau », add « Langue » first.
    edit.fields = [{ name: 'Langue', from: null }, ...edit.fields.slice(0, 2)]
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], cards, 2, newId)
    expect(plan.notes.map((n) => n.fields)).toEqual([
      ['', 'France', 'Paris'],
      ['', 'Italie', 'Rome'],
    ])
    // The flag card asked a field that no longer exists: its question is empty.
    expect(plan.removed).toEqual(['f2'])
    expect(plan.type.fields).toEqual(['Langue', 'Pays', 'Capitale'])
  })
})
