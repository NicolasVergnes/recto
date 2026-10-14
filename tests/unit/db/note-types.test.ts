import { describe, expect, it } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import { loadTodayQueue } from '$lib/db/study'
import { editOf } from '$lib/domain/note-types'
import { renderCard } from '$lib/domain/notes'
import type { Card, Review } from '$lib/domain/types'
import { slotsFor } from '$lib/ui/editor/slots'
import { NoteTypeDraft } from '$lib/ui/note-types/draft.svelte'
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

/** A log row: the card was answered « Bien » for the first time. */
function reviewRow(card: Card, id: string): Review {
  return {
    id,
    cardId: card.id,
    deckId: card.deckId,
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
}

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
    await env.db.reviews.add(reviewRow(capitale, 'r1'))
    await env.db.cards.update(pays.id, { reps: 4 })
    const edit = editOf(type)
    edit.templates.splice(0, 1)
    expect(await repo.previewNoteTypeEdit(type.id, edit)).toEqual({
      added: 0,
      removed: 1,
      lost: [],
    })
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
    await expectCode(repo.deleteNoteType(type.id, T0), 'noteTypeInUse')
    expect((await repo.noteTypeUsage()).get(type.id)).toBe(1)
    const unused = await repo.createNoteType({ ...PAYS, name: 'Vide' }, T0)
    await repo.deleteNoteType(unused.id, T0)
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

/** The editor's work: the type opened in a draft, entries moved, the edit handed over to save. */
async function editing(typeId: string, moves: (draft: NoteTypeDraft) => void) {
  const type = await repo.getNoteType(typeId)
  if (!type) throw new Error('note type')
  const draft = new NoteTypeDraft()
  draft.load(type)
  moves(draft)
  return draft.snapshot()
}

/** Question and answer of every card, rendered like a review session or the browser does. */
async function rendered() {
  const [cards, notes, types] = await Promise.all([
    env.db.cards.toArray(),
    env.db.notes.toArray(),
    repo.noteTypesById(),
  ])
  const noteOf = new Map(notes.map((n) => [n.id, n]))
  return new Map(
    cards.map((card) => {
      const note = noteOf.get(card.noteId)
      if (!note) throw new Error(card.noteId)
      const { question, answer } = renderCard(note, card, false, types.get(note.noteTypeId ?? ''))
      return [card.id, { question, answer }]
    }),
  )
}

describe('moving fields and cards of a note type (M10)', () => {
  it('moving a field rewrites every note in the new order and leaves the cards alone', async () => {
    const { deck, type, france } = await setup()
    const italie = await repo.createNote(
      {
        deckId: deck.id,
        modelType: 'custom',
        noteTypeId: type.id,
        fields: ['Italie', 'Rome'],
        tags: [],
      },
      T0,
    )
    const [capitale] = france.cards
    if (!capitale) throw new Error('cards')
    await env.db.reviews.add(reviewRow(capitale, 'r1'))
    await env.db.cards
      .where('noteId')
      .anyOf([france.note.id, italie.note.id])
      .modify({ reps: 4, stability: 9 })
    const cardsBefore = await env.db.cards.orderBy('id').toArray()
    const rendersBefore = await rendered()

    // « Drapeau » to the top (two moves up), « Pays » and « Capitale » follow.
    const edit = await editing(type.id, (d) => {
      d.moveField(2, -1)
      d.moveField(1, -1)
    })
    expect(await repo.previewNoteTypeEdit(type.id, edit)).toEqual({
      added: 0,
      removed: 0,
      lost: [],
    })
    await repo.updateNoteType(type.id, edit, T0 + 1)

    const saved = await repo.getNoteType(type.id)
    expect(saved?.fields).toEqual(['Drapeau', 'Pays', 'Capitale'])
    expect(saved?.templates).toEqual(PAYS.templates)
    const note = await repo.getNote(france.note.id)
    expect(note?.fields).toEqual(['<img src="fr.png">', 'France', 'Paris'])
    const other = await repo.getNote(italie.note.id)
    expect(other?.fields).toEqual(['', 'Italie', 'Rome'])
    expect(other?.updatedAt).toBe(T0 + 1)
    // No card created, deleted or touched: same rows (id, ord, schedule), same log, same questions.
    expect(await env.db.cards.orderBy('id').toArray()).toEqual(cardsBefore)
    expect(await env.db.reviews.count()).toBe(1)
    expect(await rendered()).toEqual(rendersBefore)
    // The note form lists the fields in the new order, each with its value.
    expect(
      saved && note && slotsFor('custom', saved).map((s) => [s.text, note.fields[s.index]]),
    ).toEqual([
      ['Drapeau', '<img src="fr.png">'],
      ['Pays', 'France'],
      ['Capitale', 'Paris'],
    ])
  })

  it('moving a card moves its cards with it: same ids, schedule and log, new ords', async () => {
    const { type, france } = await setup()
    const [capitale, pays, drapeau] = france.cards
    if (!capitale || !pays || !drapeau) throw new Error('cards')
    await env.db.reviews.add(reviewRow(capitale, 'r1'))
    await env.db.cards.update(pays.id, { reps: 4 })
    const rendersBefore = await rendered()

    // « Drapeau » first, then « Capitale », then « Pays ».
    const edit = await editing(type.id, (d) => {
      d.moveTemplate(2, -1)
      d.moveTemplate(1, -1)
    })
    expect(await repo.previewNoteTypeEdit(type.id, edit)).toEqual({
      added: 0,
      removed: 0,
      lost: [],
    })
    await repo.updateNoteType(type.id, edit, T0 + 1)

    const saved = await repo.getNoteType(type.id)
    expect(saved?.templates.map((t) => t.name)).toEqual(['Drapeau', 'Capitale', 'Pays'])
    const cards = await repo.getCardsOfNote(france.note.id)
    expect(cards.map((c) => [c.id, c.ord])).toEqual([
      [drapeau.id, 0],
      [capitale.id, 1],
      [pays.id, 2],
    ])
    expect(cards[2]?.reps).toBe(4)
    expect(await env.db.cards.count()).toBe(3)
    expect(await env.db.reviews.get('r1')).toMatchObject({ cardId: capitale.id })
    // The note is as it was and every card still asks and answers what it did.
    expect((await repo.getNote(france.note.id))?.fields).toEqual([
      'France',
      'Paris',
      '<img src="fr.png">',
    ])
    expect(await rendered()).toEqual(rendersBefore)
  })

  it('the browser and the review queue use the template of each card', async () => {
    const { type, france } = await setup()
    const [capitale, pays, drapeau] = france.cards
    if (!capitale || !pays || !drapeau) throw new Error('cards')
    const rendersBefore = await rendered()
    const before = await loadTodayQueue(T0 + 1)
    expect([...before.result.ids].sort()).toEqual([capitale.id, pays.id, drapeau.id].sort())

    // « Pays » to the top: every card still asks what it did.
    await repo.updateNoteType(type.id, await editing(type.id, (d) => d.moveTemplate(1, -1)), T0 + 1)
    const row = (await repo.loadBrowserRows()).find((r) => r.card.id === pays.id)
    expect([row?.card.ord, row?.question, row?.answer]).toEqual([
      0,
      'Paris est la capitale de ?',
      'France',
    ])
    const queue = await loadTodayQueue(T0 + 2)
    expect([...queue.result.ids].sort()).toEqual([capitale.id, pays.id, drapeau.id].sort())
    const types = await repo.noteTypesById()
    for (const id of queue.result.ids) {
      const card = queue.cards.get(id)
      const note = card && (await repo.getNote(card.noteId))
      if (!card || !note) throw new Error(id)
      const { question, answer } = renderCard(note, card, false, types.get(note.noteTypeId ?? ''))
      expect({ question, answer }).toEqual(rendersBefore.get(id))
    }
  })

  it('saves moves with a rename, a new field and a removed card in one go', async () => {
    const { type, france } = await setup()
    const [capitale, pays, drapeau] = france.cards
    if (!capitale || !pays || !drapeau) throw new Error('cards')
    await env.db.reviews.add(reviewRow(pays, 'r-pays'))
    const rendersBefore = await rendered()
    const edit = await editing(type.id, (d) => {
      d.renameField(1, 'Ville') // the templates follow
      d.moveField(1, -1) // Ville, Pays, Drapeau
      d.addField()
      d.moveField(3, -1) // Ville, Pays, Champ 4, Drapeau
      d.removeTemplate(1) // « Pays », with its card
      d.moveTemplate(1, -1) // Drapeau, Capitale
    })
    expect(await repo.previewNoteTypeEdit(type.id, edit)).toEqual({
      added: 0,
      removed: 1,
      lost: [],
    })
    await repo.updateNoteType(type.id, edit, T0 + 1)

    const saved = await repo.getNoteType(type.id)
    expect(saved?.fields).toEqual(['Ville', 'Pays', 'Champ 4', 'Drapeau'])
    expect(saved?.templates.map((t) => t.name)).toEqual(['Drapeau', 'Capitale'])
    expect((await repo.getNote(france.note.id))?.fields).toEqual([
      'Paris',
      'France',
      '',
      '<img src="fr.png">',
    ])
    const cards = await repo.getCardsOfNote(france.note.id)
    expect(cards.map((c) => [c.id, c.ord])).toEqual([
      [drapeau.id, 0],
      [capitale.id, 1],
    ])
    // The deleted card keeps its log; the others still ask what they asked.
    expect(await env.db.reviews.get('r-pays')).toBeDefined()
    const after = await rendered()
    expect(after.get(capitale.id)).toEqual(rendersBefore.get(capitale.id))
    expect(after.get(drapeau.id)).toEqual(rendersBefore.get(drapeau.id))
  })
})
