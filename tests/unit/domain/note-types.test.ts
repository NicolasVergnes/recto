import { describe, expect, it } from 'vitest'
import { makeCard } from '$lib/domain/defaults'
import {
  DEFAULT_NOTE_TYPE,
  editOf,
  fieldUsers,
  planNoteTypeEdit,
  unknownReference,
  validateNoteType,
} from '$lib/domain/note-types'
import { renderCard } from '$lib/domain/notes'
import type { Card, Note, NoteType } from '$lib/domain/types'

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

  it('refuses a template that uses a field the type does not have (M11)', () => {
    // « Drapeau » removed while its card still asks it: that card would show nothing.
    const removed = { ...TYPE, fields: ['Pays', 'Capitale'] }
    expect(validateNoteType(removed)).toBe('noteTypeUnknownField')
    expect(unknownReference(removed)).toEqual({ field: 'Drapeau', card: 'Drapeau' })
    // Sections and filters count; Anki's special fields are always there.
    const special = {
      ...TYPE,
      templates: [
        {
          name: 'A',
          front: '{{#Pays}}{{text:Pays}}{{/Pays}} {{Tags}} {{Deck}}',
          back: '{{FrontSide}}',
        },
      ],
    }
    expect(unknownReference(special)).toBeNull()
    const hidden = {
      ...TYPE,
      templates: [{ name: 'B', front: '{{Pays}}', back: '{{^Langue}}-{{/Langue}}' }],
    }
    expect(unknownReference(hidden)).toEqual({ field: 'Langue', card: 'B' })
    expect(validateNoteType(TYPE)).toBeNull()
  })

  it('lists the templates that use a field, whatever the side', () => {
    expect(fieldUsers(TYPE.templates, 'Pays')).toEqual(['Capitale', 'Pays', 'Drapeau'])
    expect(fieldUsers(TYPE.templates, ' Drapeau ')).toEqual(['Drapeau'])
    expect(fieldUsers(TYPE.templates, 'Langue')).toEqual([])
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
    // The flag card asked a field that no longer exists: its question is empty (the editor now
    // refuses such a save, validateNoteType; the plan stays consistent all the same).
    expect(plan.removed).toEqual(['f2'])
    expect(plan.type.fields).toEqual(['Langue', 'Pays', 'Capitale'])
    // France had a flag, Italy none: one note loses something (announced before saving, M11).
    expect(plan.lost).toEqual([{ field: 'Drapeau', notes: 1 }])
  })
})

/** `list` in the order of `order` (indexes of the original): what moving entries up and down makes. */
function permute<T>(list: readonly T[], order: readonly number[]): T[] {
  return order.map((i) => {
    const entry = list[i]
    if (entry === undefined) throw new Error(`no entry ${i}`)
    return entry
  })
}
const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]
// Cards that have been studied: a reorder must leave their schedule alone.
const studied: Card[] = cards.map((c, i) => ({
  ...c,
  state: 2,
  reps: i + 2,
  stability: 10 + i,
  due: 1000 + i,
}))

describe('reordering fields and templates (M10)', () => {
  it('moves a field: each note takes its values in the new order, no card is touched', () => {
    const edit = editOf(TYPE)
    edit.fields = permute(edit.fields, [2, 0, 1]) // Drapeau, Pays, Capitale
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
    expect(plan.type.fields).toEqual(['Drapeau', 'Pays', 'Capitale'])
    expect(plan.notes.map((n) => [n.id, n.fields, n.updatedAt])).toEqual([
      ['n1', ['<img src="fr.png">', 'France', 'Paris'], 2],
      ['n2', ['', 'Italie', 'Rome'], 2],
    ])
    // Templates name their fields: they stay as they are, and so do the cards.
    expect(plan.type.templates).toEqual(TYPE.templates)
    expect(plan).toMatchObject({ moved: [], removed: [], added: [] })
  })

  it('moves a template: its cards follow under their new ord, with their schedule', () => {
    const edit = editOf(TYPE)
    edit.templates = permute(edit.templates, [2, 0, 1]) // Drapeau, Capitale, Pays
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
    expect(plan.type.templates.map((t) => t.name)).toEqual(['Drapeau', 'Capitale', 'Pays'])
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['f0', 1],
      ['f1', 2],
      ['f2', 0],
      ['i0', 1],
      ['i1', 2],
    ])
    // Same cards: only the ord differs, and the date of the change (M12).
    expect(plan.moved).toEqual(studied.map((c) => ({ ...c, ord: [1, 2, 0][c.ord], updatedAt: 2 })))
    expect(plan).toMatchObject({ notes: [], removed: [], added: [] })
  })

  it('moving back to the original order changes nothing', () => {
    const edit = editOf(TYPE)
    edit.fields = permute(permute(edit.fields, [1, 0, 2]), [1, 0, 2])
    edit.templates = permute(permute(edit.templates, [0, 2, 1]), [0, 2, 1])
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
    expect(plan).toMatchObject({ notes: [], moved: [], removed: [], added: [] })
  })

  it('combined with added and removed entries: values and cards follow what they were', () => {
    const edit = editOf(TYPE)
    // Fields: Drapeau, Langue (new), Pays; « Capitale » is removed.
    edit.fields = [
      ...permute(edit.fields, [2]),
      { name: 'Langue', from: null },
      ...permute(edit.fields, [0]),
    ]
    // Cards: Drapeau, Capitale; « Pays » is removed.
    edit.templates = permute(edit.templates, [2, 0])
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
    expect(plan.notes.map((n) => n.fields)).toEqual([
      ['<img src="fr.png">', '', 'France'],
      ['', '', 'Italie'],
    ])
    // The flag card moves to the top, the capital card to the second place; the removed
    // template takes its cards with it. Italie has no flag: no card for the first template.
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['f0', 1],
      ['f2', 0],
      ['i0', 1],
    ])
    expect(plan.removed.sort()).toEqual(['f1', 'i1'])
    expect(plan.added).toEqual([])
  })

  it('a template added then moved up shifts the cards after it and gets a card of its own', () => {
    const edit = editOf(TYPE)
    edit.templates.splice(1, 0, {
      name: 'Nom',
      front: '{{Pays}}',
      back: '{{Capitale}}',
      from: null,
    })
    const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['f1', 2],
      ['f2', 3],
      ['i1', 2],
    ])
    expect(plan.added.map((c) => [c.noteId, c.ord])).toEqual([
      ['n1', 1],
      ['n2', 1],
    ])
    expect(plan.removed).toEqual([])
  })

  it('whatever the order, every card asks and answers the same', () => {
    const noteOf = new Map([france, italie].map((n) => [n.id, n]))
    for (const fieldOrder of ORDERS) {
      for (const templateOrder of ORDERS) {
        const edit = editOf(TYPE)
        edit.fields = permute(edit.fields, fieldOrder)
        edit.templates = permute(edit.templates, templateOrder)
        const plan = planNoteTypeEdit(TYPE, edit, [france, italie], studied, 2, newId)
        expect(plan.added).toEqual([])
        expect(plan.removed).toEqual([])
        for (const card of studied) {
          const note = noteOf.get(card.noteId)
          if (!note) throw new Error(card.noteId)
          const rewritten = plan.notes.find((n) => n.id === note.id) ?? note
          const moved = plan.moved.find((c) => c.id === card.id) ?? card
          const ord = templateOrder.indexOf(card.ord)
          expect(moved).toEqual({ ...card, ord, updatedAt: ord === card.ord ? card.updatedAt : 2 })
          const before = renderCard(note, card, false, TYPE)
          const after = renderCard(rewritten, moved, false, plan.type)
          expect([after.question, after.answer]).toEqual([before.question, before.answer])
        }
      }
    }
  })
})

describe("Anki's sort field (M10)", () => {
  const styled: NoteType = { ...TYPE, anki: { css: '.card {}', sortField: 1 } }

  it('follows its field when fields move, and falls back to the first when removed', () => {
    const edit = editOf(styled)
    edit.fields = [edit.fields[1], edit.fields[2], edit.fields[0]].filter((f) => f !== undefined)
    expect(planNoteTypeEdit(styled, edit, [], [], 2, newId).type.anki).toEqual({
      css: '.card {}',
      sortField: 0,
    })
    const removed = editOf(styled)
    removed.fields.splice(1, 1)
    removed.fields.unshift({ name: 'Nouveau', from: null })
    expect(planNoteTypeEdit(styled, removed, [], [], 2, newId).type.anki?.sortField).toBe(0)
    const kept = editOf(styled)
    kept.fields.unshift({ name: 'Nouveau', from: null })
    expect(planNoteTypeEdit(styled, kept, [], [], 2, newId).type.anki?.sortField).toBe(2)
  })

  it('leaves a type without Anki styling as it is', () => {
    expect(planNoteTypeEdit(TYPE, editOf(TYPE), [], [], 2, newId).type.anki).toBeUndefined()
  })
})
