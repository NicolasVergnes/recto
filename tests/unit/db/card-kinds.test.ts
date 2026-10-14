import { describe, expect, it } from 'vitest'
import { at } from '../../helpers/at'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import { editOf } from '$lib/domain/note-types'
import { serializeOcclusion } from '$lib/domain/occlusion'
import { useTestDatabase } from '../../helpers/db'
import { cardProblems } from '../../helpers/invariants'

const T0 = Date.UTC(2026, 9, 14, 10)
const env = useTestDatabase()

/** M14: an occlusion, two classic cards and a cloze in one note type. */
const MIXTE = {
  name: 'Mixte',
  fields: ['Carte', 'Ville', 'Pays', 'Phrase'],
  templates: [
    { name: 'Où ?', kind: 'occlusion' as const, field: 'Carte', front: '{{Pays}}', back: '' },
    { name: 'Pays', front: '{{Ville}} ?', back: '{{FrontSide}}<hr>{{Pays}}' },
    { name: 'Ville', front: 'Ville de {{Pays}} ?', back: '{{FrontSide}}<hr>{{Ville}}' },
    { name: 'Trous', kind: 'cloze' as const, field: 'Phrase', front: '', back: '' },
  ],
}
const MASKS = serializeOcclusion({
  mode: 'hideAll',
  masks: [
    { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { n: 2, x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
  ],
})
const FIELDS = ['<img src="fr.png">', 'Paris', 'France', '{{c1::Paris}} sur la {{c2::Seine}}']

async function setup() {
  const deck = await repo.createDeck({ name: 'Monde' }, T0)
  const type = await repo.createNoteType(MIXTE, T0)
  const input = {
    deckId: deck.id,
    modelType: 'custom' as const,
    noteTypeId: type.id,
    fields: FIELDS,
    masks: [MASKS, '', '', ''],
    tags: [],
  }
  const { note, cards } = await repo.createNote(input, T0)
  return { deck, type, input, note, cards }
}

const ords = async (noteId: string) => (await repo.getCardsOfNote(noteId)).map((c) => c.ord)

describe('notes of a type with card kinds (M14)', () => {
  it('creates an occlusion card per group, the classic cards and a cloze card per hole', async () => {
    const { note, cards } = await setup()
    expect(cards.map((c) => c.ord)).toEqual([0, 1000, 1, 2, 3, 1003])
    expect(note.masks).toEqual([MASKS, '', '', ''])
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('reconciles the cards when the masks or the holes change', async () => {
    const { note, input } = await setup()
    const oneGroup = serializeOcclusion({
      mode: 'hideAll',
      masks: [{ n: 2, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }],
    })
    const fields = [...FIELDS.slice(0, 3), '{{c1::Paris}} sur la Seine, {{c3::Lutèce}}']
    const { removed, added } = await repo.updateNote(
      note.id,
      { ...input, fields, masks: [oneGroup, '', '', ''] },
      T0 + 1,
    )
    expect(removed).toHaveLength(2)
    expect(added.map((c) => c.ord)).toEqual([2003])
    expect(await ords(note.id)).toEqual([1, 2, 3, 1000, 2003])
    // Without masks, the note has no occlusion card and stores none.
    const { note: plain } = await repo.updateNote(note.id, { ...input, masks: [] }, T0 + 2)
    expect(plain.masks).toBeUndefined()
    expect(await ords(note.id)).toEqual([1, 2, 3, 1003])
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('replaces the cards of a template whose kind changes, its log kept, and moves masks with fields', async () => {
    const { type, note } = await setup()
    const edit = editOf(type)
    edit.templates[3] = { ...at(edit.templates, 3), kind: 'classic', front: '{{Phrase}}' }
    edit.fields = [1, 0, 2, 3].map((i) => at(edit.fields, i))
    const plan = await repo.updateNoteType(type.id, edit, T0 + 1)
    expect(plan.removed).toHaveLength(2)
    expect(plan.added.map((c) => c.ord)).toEqual([3])
    expect(plan.type.templates[3]).toEqual({ name: 'Trous', front: '{{Phrase}}', back: '' })
    expect((await repo.getNote(note.id))?.masks).toEqual(['', MASKS, '', ''])
    expect(await ords(note.id)).toEqual([0, 1, 2, 3, 1000])
    expect(await cardProblems(env.db)).toEqual([])
  })

  it('refuses a cloze card whose field does not exist', async () => {
    const bad = { ...MIXTE, templates: [{ ...at(MIXTE.templates, 3), field: 'Inconnu' }] }
    await expect(repo.createNoteType(bad, T0)).rejects.toSatisfy(
      (e: unknown) => e instanceof RepoError && e.code === 'noteTypeUnknownField',
    )
  })
})

describe('single Basique notes (M14)', () => {
  it('keeps the card of the first hole, history included, when the note becomes single and back', async () => {
    const deck = await repo.createDeck({ name: 'D' }, T0)
    const input = {
      deckId: deck.id,
      modelType: 'cloze' as const,
      fields: ['{{c1::a}} {{c2::b}}', ''],
      tags: [],
    }
    const { note, cards } = await repo.createNote(input, T0)
    const first = at(cards, 0)
    await env.db.cards.update(first.id, { reps: 4, lastReview: T0 })

    const single = await repo.updateNote(note.id, { ...input, single: true }, T0 + 1)
    expect(single.note.single).toBe(true)
    expect(single.added).toEqual([])
    expect(await repo.getCardsOfNote(note.id)).toMatchObject([{ id: first.id, reps: 4 }])

    const back = await repo.updateNote(note.id, input, T0 + 2)
    expect(back.note.single).toBeUndefined()
    expect(back.added.map((c) => c.ord)).toEqual([1])
    expect((await repo.getCardsOfNote(note.id)).map((c) => [c.id === first.id, c.ord])).toEqual([
      [true, 0],
      [false, 1],
    ])
  })

  it('stores single only for cloze and occlusion notes', async () => {
    const deck = await repo.createDeck({ name: 'D' }, T0)
    const { note } = await repo.createNote(
      { deckId: deck.id, modelType: 'basic', fields: ['a', 'b', ''], tags: [], single: true },
      T0,
    )
    expect(note.single).toBeUndefined()
  })
})
