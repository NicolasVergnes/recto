import { describe, expect, it } from 'vitest'
import { makeCard } from '$lib/domain/defaults'
import { planNoteTypeEdit, unknownReference } from '$lib/domain/note-types'
import type { Note, NoteType } from '$lib/domain/types'
import { NoteTypeDraft } from '$lib/ui/note-types/draft.svelte'

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

function draftOf(type: NoteType): NoteTypeDraft {
  const draft = new NoteTypeDraft()
  draft.load(type)
  return draft
}
const names = (draft: NoteTypeDraft) => draft.edit.fields.map((f) => f.name)
const cardNames = (draft: NoteTypeDraft) => draft.edit.templates.map((t) => t.name)

describe('moving fields and cards in the note type editor (M10)', () => {
  it('moves a field one place, up or down, and says where it went', () => {
    const draft = draftOf(TYPE)
    expect(draft.moveField(1, -1)).toBe(0)
    expect(names(draft)).toEqual(['Capitale', 'Pays', 'Drapeau'])
    expect(draft.moveField(0, 1)).toBe(1)
    expect(names(draft)).toEqual(['Pays', 'Capitale', 'Drapeau'])
    // The preview and the validation read the new order.
    draft.moveField(2, -1)
    expect(draft.shape.fields).toEqual(['Pays', 'Drapeau', 'Capitale'])
  })

  it('leaves the ends where they are: the first cannot go up, the last cannot go down', () => {
    const draft = draftOf(TYPE)
    expect(draft.moveField(0, -1)).toBe(0)
    expect(draft.moveField(2, 1)).toBe(2)
    expect(draft.moveTemplate(0, -1)).toBe(0)
    expect(draft.moveTemplate(2, 1)).toBe(2)
    expect(draft.moveField(7, 1)).toBe(7)
    expect(names(draft)).toEqual(['Pays', 'Capitale', 'Drapeau'])
    expect(cardNames(draft)).toEqual(['Capitale', 'Pays', 'Drapeau'])
  })

  it('moves a card (template) with its text and its origin', () => {
    const draft = draftOf(TYPE)
    expect(draft.moveTemplate(2, -1)).toBe(1)
    expect(draft.edit.templates.map((t) => [t.name, t.from])).toEqual([
      ['Capitale', 0],
      ['Drapeau', 2],
      ['Pays', 1],
    ])
    expect(draft.edit.templates[1]?.front).toBe('{{Drapeau}}')
    expect(draft.shape.templates.map((t) => t.name)).toEqual(['Capitale', 'Drapeau', 'Pays'])
  })

  it('keeps working by position after a move: rename and remove hit the field shown there', () => {
    const draft = draftOf(TYPE)
    draft.moveField(2, -1) // Pays, Drapeau, Capitale
    draft.renameField(1, 'Flag')
    expect(names(draft)).toEqual(['Pays', 'Flag', 'Capitale'])
    // The templates followed the renamed field, not the one that used to be there.
    expect(draft.edit.templates.map((t) => t.front)).toEqual([
      'Capitale de {{Pays}} ?',
      '{{Capitale}} est la capitale de ?',
      '{{Flag}}',
    ])
    // A field a card uses stays (M11): « Flag » is asked by « Drapeau ».
    expect(draft.removeField(1)).toEqual(['Drapeau'])
    expect(names(draft)).toEqual(['Pays', 'Flag', 'Capitale'])
    draft.removeTemplate(2)
    expect(draft.removeField(1)).toEqual([])
    expect(draft.edit.fields.map((f) => [f.name, f.from])).toEqual([
      ['Pays', 0],
      ['Capitale', 1],
    ])
  })

  it('never lets a rename take the references of another field (M11)', () => {
    const draft = draftOf(TYPE)
    // « Drapeau » renamed to a name already taken (any case): nothing is rewritten …
    draft.renameField(2, 'pays')
    expect(draft.edit.templates.map((t) => t.front)).toEqual(TYPE.templates.map((t) => t.front))
    // … nor when the clash is renamed again: « Pays » keeps its references.
    draft.renameField(2, 'Flag')
    expect(draft.edit.templates.map((t) => [t.front, t.back])).toEqual(
      TYPE.templates.map((t) => [t.front, t.back]),
    )
    // The template still asks « Drapeau »: saving names what is left to fix.
    expect(unknownReference(draft.shape)).toEqual({ field: 'Drapeau', card: 'Drapeau' })
  })

  it('a field added at the end can be moved up; it still has no origin', () => {
    const draft = draftOf(TYPE)
    draft.addField()
    expect(draft.moveField(3, -1)).toBe(2)
    expect(draft.edit.fields.map((f) => f.from)).toEqual([0, 1, null, 2])
  })

  it('hands the repository an edit in the new order that saving understands', () => {
    const france: Note = {
      id: 'n1',
      deckId: 'd1',
      modelType: 'custom',
      noteTypeId: TYPE.id,
      fields: ['France', 'Paris', '<img src="fr.png">'],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    }
    const cards = [0, 1, 2].map((ord) => makeCard(france, ord, `c${ord}`, 1))
    const draft = draftOf(TYPE)
    draft.moveField(2, -1) // Pays, Drapeau, Capitale
    draft.moveTemplate(0, 1) // Pays, Capitale, Drapeau
    const edit = draft.snapshot()
    expect(edit.fields.map((f) => f.from)).toEqual([0, 2, 1])
    expect(edit.templates.map((t) => t.from)).toEqual([1, 0, 2])
    const plan = planNoteTypeEdit(TYPE, edit, [france], cards, 2, () => 'new')
    expect(plan.notes.map((n) => n.fields)).toEqual([['France', '<img src="fr.png">', 'Paris']])
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['c0', 1],
      ['c1', 0],
    ])
    expect(plan.removed).toEqual([])
    expect(plan.added).toEqual([])
  })
})
