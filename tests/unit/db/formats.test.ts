import { describe, expect, it } from 'vitest'
import * as repo from '$lib/db/repo'
import { editOf } from '$lib/domain/note-types'
import { useTestDatabase } from '../../helpers/db'
import { at } from '../../helpers/at'

const T0 = Date.UTC(2026, 9, 14, 10)
useTestDatabase()

/** A deck « Départements » and a type with three cards: Carte → Nom, Nom → Numéro, Numéro → Nom. */
async function setup() {
  const deck = await repo.createDeck({ name: 'Départements' }, T0)
  const type = await repo.createNoteType(
    {
      name: 'Département',
      fields: ['Nom', 'Numero', 'Carte'],
      templates: [
        { name: 'Carte → Nom', front: '{{Carte}}', back: '{{Nom}}' },
        { name: 'Nom → Numéro', front: '{{Nom}}', back: '{{Numero}}' },
        { name: 'Numéro → Nom', front: '{{Numero}}', back: '{{Nom}}' },
      ],
    },
    T0,
  )
  for (const [nom, numero] of [
    ['Ain', '01'],
    ['Aisne', '02'],
  ] as const)
    await repo.createNote(
      {
        deckId: deck.id,
        modelType: 'custom',
        noteTypeId: type.id,
        fields: [nom, numero, `<img src="${numero}.png">`],
        tags: [],
      },
      T0,
    )
  await repo.createNote(
    { deckId: deck.id, modelType: 'cloze', fields: ['{{c1::a}} {{c2::b}}', ''], tags: [] },
    T0,
  )
  return { deck, type }
}

describe('card formats of a deck (M17)', () => {
  it('lists the formats of a deck with their new and started cards', async () => {
    const { deck, type } = await setup()
    expect(await repo.deckFormats(deck.id)).toEqual([
      { key: 'cloze', rank: 0, modelType: 'cloze', fresh: 2, started: 0 },
      {
        key: `${type.id}:0`,
        rank: 0,
        noteType: 'Département',
        template: 'Carte → Nom',
        fresh: 2,
        started: 0,
      },
      {
        key: `${type.id}:1`,
        rank: 1,
        noteType: 'Département',
        template: 'Nom → Numéro',
        fresh: 2,
        started: 0,
      },
      {
        key: `${type.id}:2`,
        rank: 2,
        noteType: 'Département',
        template: 'Numéro → Nom',
        fresh: 2,
        started: 0,
      },
    ])
  })

  it('moves the paused formats with their templates, and drops those of removed templates', async () => {
    const { deck, type } = await setup()
    const settings = { ...deck.settings, pausedFormats: [`${type.id}:1`, `${type.id}:2`, 'cloze'] }
    await repo.updateDeck(deck.id, { settings }, T0)
    const edit = editOf(type)
    // « Numéro → Nom » goes first, « Nom → Numéro » is removed.
    edit.templates = [at(edit.templates, 2), at(edit.templates, 0)]
    await repo.updateNoteType(type.id, edit, T0 + 1)
    const after = await repo.getDeck(deck.id)
    expect(after?.settings.pausedFormats).toEqual([`${type.id}:0`, 'cloze'])
    expect(after?.updatedAt).toBe(T0 + 1)
  })

  it('forgets the paused formats of a deleted type', async () => {
    const deck = await repo.createDeck({ name: 'D' }, T0)
    const type = await repo.createNoteType(
      { name: 'T', fields: ['A'], templates: [{ name: 'A', front: '{{A}}', back: '' }] },
      T0,
    )
    const settings = { ...deck.settings, pausedFormats: [`${type.id}:0`, 'basic'] }
    await repo.updateDeck(deck.id, { settings }, T0)
    await repo.deleteNoteType(type.id, T0 + 1)
    expect((await repo.getDeck(deck.id))?.settings.pausedFormats).toEqual(['basic'])
  })
})
