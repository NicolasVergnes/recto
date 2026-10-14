import { describe, expect, it } from 'vitest'
import { at } from '../../helpers/at'
import { makeCard } from '$lib/domain/defaults'
import {
  editOf,
  fieldUsers,
  planNoteTypeEdit,
  unknownReference,
  validateNoteType,
} from '$lib/domain/note-types'
import { cardOrds, renderCard } from '$lib/domain/notes'
import { serializeOcclusion } from '$lib/domain/occlusion'
import { customOrd, ORD_STRIDE, sourceFields, subIndex, templateIndex } from '$lib/domain/templates'
import type { Card, Note, NoteType } from '$lib/domain/types'

/** M14: a note type whose cards are an occlusion, two classic cards and a cloze. */
const MIXTE: NoteType = {
  id: 't1',
  name: 'Mixte',
  fields: ['Carte', 'Ville', 'Pays', 'Phrase', 'Extra'],
  templates: [
    {
      name: 'Où ?',
      kind: 'occlusion',
      field: 'Carte',
      front: 'Villes de {{Pays}}',
      back: '{{Extra}}',
    },
    { name: 'Pays', front: '{{Ville}} est dans quel pays ?', back: '{{FrontSide}}<hr>{{Pays}}' },
    { name: 'Ville', front: 'Une ville de {{Pays}} ?', back: '{{FrontSide}}<hr>{{Ville}}' },
    { name: 'Trous', kind: 'cloze', field: 'Phrase', front: '', back: '{{Extra}}' },
  ],
  createdAt: 1,
  updatedAt: 1,
}
const MASKS = serializeOcclusion({
  mode: 'hideAll',
  masks: [
    { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'Paris' },
    { n: 2, x: 0.5, y: 0.5, w: 0.2, h: 0.2, label: 'Lyon' },
  ],
})
const note = (fields: string[], masks?: string[]): Note => ({
  id: 'n1',
  deckId: 'd1',
  modelType: 'custom',
  noteTypeId: 't1',
  fields,
  ...(masks ? { masks } : {}),
  tags: [],
  createdAt: 1,
  updatedAt: 1,
})
const FRANCE = note(
  [
    '<img src="fr.png" alt="France">',
    'Paris',
    'France',
    '{{c1::Paris}} est sur la {{c2::Seine}}.',
    'Note',
  ],
  [MASKS, '', '', '', ''],
)

describe('card ords of a custom note (M14)', () => {
  it('encodes the template and the index or group, leaving the ords stored before M14 as they are', () => {
    expect(customOrd(3)).toBe(3)
    expect(customOrd(3, 2)).toBe(3 + 2 * ORD_STRIDE)
    expect([templateIndex(2003), subIndex(2003)]).toEqual([3, 2])
    expect([templateIndex(1), subIndex(1)]).toEqual([1, 0])
  })

  it('makes one card per group, per classic template and per cloze index', () => {
    expect(cardOrds(FRANCE, MIXTE)).toEqual([0, 1000, 1, 2, 3, 1003])
    // No masks, no image or no deletion: no card of that kind.
    expect(cardOrds({ ...FRANCE, masks: [] }, MIXTE)).toEqual([1, 2, 3, 1003])
    expect(cardOrds({ ...FRANCE, fields: ['', 'Paris', 'France', '', ''] }, MIXTE)).toEqual([1, 2])
  })

  it('makes a single card of a single template', () => {
    const single: NoteType = {
      ...MIXTE,
      templates: MIXTE.templates.map((t) => (t.kind ? { ...t, single: true } : t)),
    }
    expect(cardOrds(FRANCE, single)).toEqual([0, 1, 2, 3])
  })

  it('lists the fields holding cloze texts and images', () => {
    expect(sourceFields(MIXTE, 'cloze')).toEqual([3])
    expect(sourceFields(MIXTE, 'occlusion')).toEqual([0])
  })
})

describe('rendering the cards of a custom note (M14)', () => {
  const render = (ord: number, type = MIXTE) =>
    renderCard(FRANCE, { ord, sideFlipped: false }, true, type)

  it('renders a cloze card from its field, with what its answer adds', () => {
    expect(render(1003)).toEqual({
      question: 'Paris est sur la <span class="cloze">[…]</span>.',
      answer: 'Paris est sur la <span class="cloze">Seine</span>.',
      extra: 'Note',
      answerReplacesQuestion: true,
      flipped: false,
      expected: 'Seine',
    })
  })

  it('renders an occlusion card from its image field and the masks of that field', () => {
    const r = render(1000)
    expect(r).toMatchObject({ question: 'Villes de France', answer: 'Lyon', extra: 'Note' })
    expect(r.occlusion).toMatchObject({ image: 'fr.png', alt: 'France', target: 2 })
    expect(r.occlusion?.masks).toHaveLength(2)
  })

  it('renders classic cards as before', () => {
    expect(render(2)).toMatchObject({ question: 'Une ville de France ?', expected: '' })
  })

  it('asks every deletion or group on a single card', () => {
    const single: NoteType = {
      ...MIXTE,
      templates: MIXTE.templates.map((t) => (t.kind ? { ...t, single: true } : t)),
    }
    expect(render(3, single)).toMatchObject({
      question: '<span class="cloze">[…]</span> est sur la <span class="cloze">[…]</span>.',
      expected: 'Paris, Seine',
    })
    const occlusion = render(0, single)
    expect(occlusion.occlusion?.target).toBeNull()
    expect(occlusion.answer).toBe('Paris, Lyon')
  })
})

describe('single built-in notes (M14)', () => {
  it('gives a cloze or occlusion note one card asking everything', () => {
    const cloze = {
      modelType: 'cloze' as const,
      fields: ['{{c1::a}} {{c3::b}}', 'x'],
      single: true,
    }
    expect(cardOrds(cloze)).toEqual([0])
    expect(cardOrds({ ...cloze, fields: ['rien', ''] })).toEqual([])
    expect(renderCard(cloze, { ord: 0, sideFlipped: false })).toMatchObject({
      question: '<span class="cloze">[…]</span> <span class="cloze">[…]</span>',
      answer: '<span class="cloze">a</span> <span class="cloze">b</span>',
      expected: 'a, b',
    })
    const occlusion = {
      modelType: 'image_occlusion' as const,
      fields: ['<img src="x.png">', MASKS, 'En-tête', ''],
      single: true,
    }
    expect(cardOrds(occlusion)).toEqual([0])
    const r = renderCard(occlusion, { ord: 0, sideFlipped: false })
    expect(r.occlusion?.target).toBeNull()
    expect(r.expected).toBe('Paris, Lyon')
  })
})

describe('editing a type with card kinds (M14)', () => {
  const cards: Card[] = cardOrds(FRANCE, MIXTE).map((ord) => ({
    ...makeCard(FRANCE, ord, `c${ord}`, 1),
    reps: 3,
  }))
  let next = 0
  const newId = () => `new${next++}`

  it('protects the source field of a cloze or occlusion card and requires it to exist', () => {
    expect(fieldUsers(MIXTE.templates, 'Phrase')).toEqual(['Trous'])
    expect(fieldUsers(MIXTE.templates, 'Carte')).toEqual(['Où ?'])
    const removed = { ...MIXTE, fields: ['Carte', 'Ville', 'Pays', 'Extra'] }
    expect(unknownReference(removed)).toEqual({ field: 'Phrase', card: 'Trous' })
    const noField = {
      ...MIXTE,
      templates: [{ name: 'T', kind: 'cloze' as const, front: '', back: '' }],
    }
    expect(validateNoteType(noField)).toBe('noteTypeUnknownField')
    expect(validateNoteType(MIXTE)).toBeNull()
  })

  it('moves the cards of every index or group with their template', () => {
    const edit = editOf(MIXTE)
    edit.templates = [3, 0, 1, 2].map((i) => at(edit.templates, i))
    const plan = planNoteTypeEdit(MIXTE, edit, [FRANCE], cards, 2, newId)
    expect(plan.moved.map((c) => [c.id, c.ord])).toEqual([
      ['c0', 1],
      ['c1000', 1001],
      ['c1', 2],
      ['c2', 3],
      ['c3', 0],
      ['c1003', 1000],
    ])
    expect(plan).toMatchObject({ removed: [], added: [] })
  })

  it('moves the masks with their image field', () => {
    const edit = editOf(MIXTE)
    edit.fields = [1, 0, 2, 3, 4].map((i) => at(edit.fields, i))
    const plan = planNoteTypeEdit(MIXTE, edit, [FRANCE], cards, 2, newId)
    expect(plan.notes[0]?.masks).toEqual(['', MASKS, '', '', ''])
    expect(plan).toMatchObject({ moved: [], removed: [], added: [] })
  })

  it('replaces the cards of a template whose kind or source field changes', () => {
    const edit = editOf(MIXTE)
    const trous = at(edit.templates, 3)
    edit.templates[3] = { name: 'Trous', front: '{{Phrase}}', back: '{{Extra}}', from: trous.from }
    const plan = planNoteTypeEdit(MIXTE, edit, [FRANCE], cards, 2, newId)
    expect(plan.removed.sort()).toEqual(['c1003', 'c3'])
    expect(plan.added.map((c) => c.ord)).toEqual([3])
    const field = editOf(MIXTE)
    field.templates[3] = { ...at(field.templates, 3), field: 'Extra' }
    expect(planNoteTypeEdit(MIXTE, field, [FRANCE], cards, 2, newId).removed.sort()).toEqual([
      'c1003',
      'c3',
    ])
  })

  it('keeps the first card when a template becomes single, and makes it the first again when it no longer is', () => {
    const single = editOf(MIXTE)
    single.templates[3] = { ...at(single.templates, 3), single: true }
    const plan = planNoteTypeEdit(MIXTE, single, [FRANCE], cards, 2, newId)
    expect(plan.removed).toEqual(['c1003'])
    expect(plan.added).toEqual([])
    expect(plan.type.templates[3]).toEqual({ ...MIXTE.templates[3], single: true })
  })
})
