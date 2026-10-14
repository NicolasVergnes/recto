import { describe, expect, it } from 'vitest'
import { cardFormat, parseFormat, remapFormats } from '$lib/domain/formats'
import { editOf, planNoteTypeEdit } from '$lib/domain/note-types'
import { customOrd } from '$lib/domain/templates'
import type { NoteType } from '$lib/domain/types'
import { at } from '../../helpers/at'

describe('card formats (M17)', () => {
  it('names the format of a card: its template, or the kind of a Basique card', () => {
    const custom = { modelType: 'custom' as const, noteTypeId: 'dept' }
    expect(cardFormat(custom, { ord: 2 })).toEqual({ key: 'dept:2', rank: 2 })
    // Every hole of a cloze template is the same format.
    expect(cardFormat(custom, { ord: customOrd(3, 4) })).toEqual({ key: 'dept:3', rank: 3 })
    expect(cardFormat({ modelType: 'cloze' }, { ord: 5 })).toEqual({ key: 'cloze', rank: 0 })
    expect(cardFormat({ modelType: 'basic' }, { ord: 0 })).toEqual({ key: 'basic', rank: 0 })
  })

  it('reads a format key back', () => {
    expect(parseFormat('dept:2')).toEqual({ noteTypeId: 'dept', template: 2 })
    expect(parseFormat('a:b:0')).toEqual({ noteTypeId: 'a:b', template: 0 })
    expect(parseFormat('image_occlusion')).toEqual({ modelType: 'image_occlusion' })
    expect(parseFormat('dept:x')).toBeNull()
    expect(parseFormat(':1')).toBeNull()
  })

  it('follows the templates of an edited type, leaving other keys alone', () => {
    const moves = new Map([
      [0, 1],
      [2, 0],
    ])
    expect(remapFormats(['dept:0', 'dept:1', 'dept:2', 'other:1', 'cloze'], 'dept', moves)).toEqual(
      ['dept:1', 'dept:0', 'other:1', 'cloze'],
    )
    expect(remapFormats(['dept:0', 'cloze'], 'dept', new Map())).toEqual(['cloze'])
  })

  it('gets the moves from the plan of a note type edit', () => {
    const type: NoteType = {
      id: 'dept',
      name: 'Département',
      fields: ['Nom', 'Numero'],
      templates: [
        { name: 'A', front: '{{Nom}}', back: '{{Numero}}' },
        { name: 'B', front: '{{Numero}}', back: '{{Nom}}' },
        { name: 'C', front: 'Où ? {{Nom}}', back: '{{Numero}}' },
      ],
      createdAt: 1,
      updatedAt: 1,
    }
    const edit = editOf(type)
    // C goes first, B is removed, A changes kind (its cards are replaced: no move).
    edit.templates = [
      at(edit.templates, 2),
      { ...at(edit.templates, 0), kind: 'cloze', field: 'Nom', front: '', back: '' },
    ]
    const plan = planNoteTypeEdit(type, edit, [], [], 2, () => 'id')
    expect([...plan.templateMoves]).toEqual([[2, 0]])
  })
})
