import { describe, expect, it } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import { editOf } from '$lib/domain/note-types'
import type { Review } from '$lib/domain/types'
import { useTestDatabase } from '../../helpers/db'

const T0 = Date.UTC(2026, 9, 2, 10)
const env = useTestDatabase()

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof RepoError && e.code === code)
}

const PAYS = {
  name: 'Pays',
  fields: ['Pays', 'Capitale', 'Drapeau'],
  templates: [
    { name: 'Capitale', front: 'Capitale de {{Pays}} ?', back: '{{FrontSide}}<hr>{{Capitale}}' },
    { name: 'Pays', front: '{{Capitale}} est la capitale de ?', back: '{{Pays}}' },
    { name: 'Drapeau', front: '{{Drapeau}}', back: '{{Pays}}' },
  ],
}

async function setup() {
  const deck = await repo.createDeck({ name: 'Monde' }, T0)
  const type = await repo.createNoteType(PAYS, T0)
  const france = await repo.createNote(
    {
      deckId: deck.id,
      modelType: 'custom',
      noteTypeId: type.id,
      fields: ['France', 'Paris', '<img src="fr.png">'],
      tags: [],
    },
    T0,
  )
  return { deck, type, france }
}

const ords = async (noteId: string) => (await repo.getCardsOfNote(noteId)).map((c) => c.ord)

describe('custom note types', () => {
  it('a custom note gets one card per template whose question shows something', async () => {
    const { deck, type, france } = await setup()
    expect(france.note.noteTypeId).toBe(type.id)
    expect(france.cards.map((c) => c.ord)).toEqual([0, 1, 2])
    // No flag: no « Drapeau » card. Extra values are dropped, missing ones padded.
    const { note, cards } = await repo.createNote(
      {
        deckId: deck.id,
        modelType: 'custom',
        noteTypeId: type.id,
        fields: ['Italie', 'Rome'],
        tags: [],
      },
      T0,
    )
    expect(note.fields).toEqual(['Italie', 'Rome', ''])
    expect(cards.map((c) => c.ord)).toEqual([0, 1])
    // Adding the flag later adds its card.
    await repo.updateNote(
      note.id,
      {
        deckId: deck.id,
        modelType: 'custom',
        noteTypeId: type.id,
        fields: ['Italie', 'Rome', '<img src="it.png">'],
        tags: [],
      },
      T0 + 1,
    )
    expect(await ords(note.id)).toEqual([0, 1, 2])
  })

  it('refuses a note without its type or without any card', async () => {
    const { deck, type } = await setup()
    const input = { deckId: deck.id, modelType: 'custom' as const, fields: ['x'], tags: [] }
    await expectCode(repo.createNote(input, T0), 'noteTypeNotFound')
    await expectCode(
      repo.createNote({ ...input, noteTypeId: type.id, fields: ['', '', ''] }, T0),
      'noteNoCard',
    )
  })

  it('validates a type on creation', async () => {
    await expectCode(repo.createNoteType({ ...PAYS, name: '' }, T0), 'noteTypeName')
    await expectCode(repo.createNoteType({ ...PAYS, fields: ['A', 'A'] }, T0), 'noteTypeFields')
    await expectCode(repo.createNoteType({ ...PAYS, templates: [] }, T0), 'noteTypeTemplates')
  })

  it('removing a template deletes its cards, keeps their log, and shifts the others', async () => {
    const { type, france } = await setup()
    const [capitale, pays, drapeau] = france.cards
    if (!capitale || !pays || !drapeau) throw new Error('cards')
    const review: Review = {
      id: 'r1',
      cardId: capitale.id,
      deckId: capitale.deckId,
      reviewedAt: T0,
      rating: 3,
      scheduler: 'fsrs',
      durationMs: 1000,
      stateBefore: 0,
      dueBefore: T0,
      stabilityBefore: 0,
      difficultyBefore: 0,
      boxBefore: 0,
      learningStepsBefore: 0,
      lastReviewBefore: null,
      stateAfter: 1,
      dueAfter: T0,
      scheduledDays: 0,
      elapsedDays: 0,
      boxAfter: 0,
    }
    await env.db.reviews.add(review)
    await env.db.cards.update(pays.id, { reps: 4 })
    const edit = editOf(type)
    edit.templates.splice(0, 1)
    expect(await repo.previewNoteTypeEdit(type.id, edit)).toEqual({ added: 0, removed: 1 })
    await repo.updateNoteType(type.id, edit, T0 + 1)
    const cards = await repo.getCardsOfNote(france.note.id)
    expect(cards.map((c) => [c.id, c.ord])).toEqual([
      [pays.id, 0],
      [drapeau.id, 1],
    ])
    // The moved card keeps its schedule; the deleted card's log stays (P10).
    expect(cards[0]?.reps).toBe(4)
    expect(await env.db.reviews.get('r1')).toBeDefined()
    expect((await repo.getNoteType(type.id))?.templates.map((t) => t.name)).toEqual([
      'Pays',
      'Drapeau',
    ])
  })

  it('adds a field to every note and a template card where it applies', async () => {
    const { type, france } = await setup()
    const edit = editOf(type)
    edit.fields.push({ name: 'Langue', from: null })
    edit.templates.push({ name: 'Langue', front: 'Langue : {{Langue}}', back: '', from: null })
    await repo.updateNoteType(type.id, edit, T0 + 1)
    expect((await repo.getNote(france.note.id))?.fields).toEqual([
      'France',
      'Paris',
      '<img src="fr.png">',
      '',
    ])
    // The new template asks an empty field: no card yet.
    expect(await ords(france.note.id)).toEqual([0, 1, 2])
  })

  it('deletes a type only when no note uses it', async () => {
    const { type } = await setup()
    await expectCode(repo.deleteNoteType(type.id), 'noteTypeInUse')
    expect((await repo.noteTypeUsage()).get(type.id)).toBe(1)
    const unused = await repo.createNoteType({ ...PAYS, name: 'Vide' }, T0)
    await repo.deleteNoteType(unused.id)
    expect((await repo.listNoteTypes()).map((t) => t.name)).toEqual(['Pays'])
  })

  it('browser rows render custom cards, the answer without the question it repeats', async () => {
    await setup()
    const rows = await repo.loadBrowserRows()
    const capitale = rows.find((r) => r.card.ord === 0)
    expect(capitale?.question).toBe('Capitale de France ?')
    expect(capitale?.answer).toBe('Paris')
    expect(capitale?.noteType?.name).toBe('Pays')
  })
})
