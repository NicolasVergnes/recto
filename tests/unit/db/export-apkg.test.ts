import { beforeAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { gatherApkgExport } from '$lib/db/export-apkg'
import * as repo from '$lib/db/repo'
import { setSetting } from '$lib/db/settings'
import { buildApkg } from '$lib/export/apkg'
import { readApkg } from '$lib/import/apkg'
import { NoteTypeDraft } from '$lib/ui/note-types/draft.svelte'
import { representativeCollection, PNG } from '../../helpers/apkg-collection'
import { useTestDatabase } from '../../helpers/db'

const now = Date.UTC(2026, 8, 25, 10)
const env = useTestDatabase()

let SQL: SqlJsStatic
beforeAll(async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  SQL = await initSqlJs()
})

/** Writes the representative collection (with its media as blobs) into the test database. */
async function seed() {
  const c = representativeCollection(now)
  await env.db.decks.bulkAdd([...c.decks])
  await env.db.notes.bulkAdd([...c.notes])
  await env.db.cards.bulkAdd([...c.cards])
  await env.db.reviews.bulkAdd([...c.reviews])
  await env.db.media.bulkAdd(
    c.media.map((m) => ({
      name: m.name,
      blob: new Blob([m.data], { type: 'image/png' }),
      mime: 'image/png',
      size: m.data.byteLength,
      sha256: '',
      createdAt: now,
    })),
  )
  return c
}

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort()

describe('gatherApkgExport', () => {
  it('reads the whole collection with the referenced media and the day start', async () => {
    const c = await seed()
    await setSetting('dayStartHour', 5)
    const { input, dayStartHour } = await gatherApkgExport()
    expect(dayStartHour).toBe(5)
    expect(ids(input.decks)).toEqual(ids(c.decks))
    expect(ids(input.notes)).toEqual(ids(c.notes))
    expect(ids(input.cards)).toEqual(ids(c.cards))
    expect(ids(input.reviews)).toEqual(ids(c.reviews))
    // Referenced and stored only: the orphan is left out, absent.png does not exist.
    expect(input.media.map((m) => m.name).sort()).toEqual(['bip.mp3', 'lune.png'])
    expect(input.media.find((m) => m.name === 'lune.png')?.data).toEqual(PNG)
  })

  it('reads a deck with its sub-decks, and a sub-deck with its parent', async () => {
    const c = await seed()
    const geo = await gatherApkgExport({ deckId: 'deck-geo' })
    expect(ids(geo.input.decks)).toEqual(['deck-dep', 'deck-geo'])
    expect(ids(geo.input.notes)).toEqual(['note-1', 'note-2', 'note-3', 'note-4'])
    expect(geo.input.cards).toHaveLength(6)
    const geoCards = new Set(geo.input.cards.map((x) => x.id))
    expect(ids(geo.input.reviews)).toEqual(ids(c.reviews.filter((r) => geoCards.has(r.cardId))))

    const dep = await gatherApkgExport({ deckId: 'deck-dep' })
    expect(ids(dep.input.decks)).toEqual(['deck-dep', 'deck-geo'])
    expect(ids(dep.input.notes)).toEqual(['note-2'])
    expect(dep.input.media).toEqual([])
  })

  it('reads a selection of notes, and the result builds a readable package', async () => {
    await seed()
    const { input, dayStartHour } = await gatherApkgExport({ noteIds: ['note-3', 'note-5', 'x'] })
    expect(ids(input.notes)).toEqual(['note-3', 'note-5'])
    expect(ids(input.decks)).toEqual(['deck-box', 'deck-geo'])
    expect(input.cards).toHaveLength(3)
    expect(input.reviews).toHaveLength(5)
    const { bytes, report } = await buildApkg(SQL, input, { now, dayStartHour })
    expect(report).toMatchObject({ notes: 2, cards: 3, reviews: 5, media: 2, retired: 1 })
    const pkg = readApkg(bytes, SQL)
    expect(pkg.decks.map((d) => d.name).sort()).toEqual(['Boîte', 'Default', 'Géo'])
    expect(pkg.media.map((m) => m.name)).toEqual(['lune.png', 'bip.mp3'])
  })
})

describe('a note type whose fields and cards were moved (M10)', () => {
  it('is written in its new order: model, notes and the ord of each card', async () => {
    const deck = await repo.createDeck({ name: 'Monde' }, now)
    const type = await repo.createNoteType(
      {
        name: 'Pays',
        fields: ['Pays', 'Capitale', 'Drapeau'],
        templates: [
          {
            name: 'Capitale',
            front: 'Capitale de {{Pays}} ?',
            back: '{{FrontSide}}<hr id=answer>{{Capitale}}',
          },
          { name: 'Pays', front: '{{Capitale}} est la capitale de ?', back: '{{Pays}}' },
          { name: 'Drapeau', front: '{{Drapeau}}', back: '{{Pays}}' },
        ],
      },
      now,
    )
    const note = (fields: string[]) =>
      repo.createNote(
        { deckId: deck.id, modelType: 'custom', noteTypeId: type.id, fields, tags: [] },
        now,
      )
    await note(['France', 'Paris', 'bleu blanc rouge'])
    await note(['Italie', 'Rome', ''])
    // « Drapeau » to the top of the fields and of the cards.
    const draft = new NoteTypeDraft()
    draft.load(type)
    draft.moveField(2, -1)
    draft.moveField(1, -1)
    draft.moveTemplate(2, -1)
    draft.moveTemplate(1, -1)
    await repo.updateNoteType(type.id, draft.snapshot(), now + 1)

    const { input, dayStartHour } = await gatherApkgExport()
    const { bytes } = await buildApkg(SQL, input, { now, dayStartHour })
    const pkg = readApkg(bytes, SQL)
    const model = pkg.models.find((m) => m.name === 'Pays')
    if (!model) throw new Error('model')
    expect(model.fields).toEqual(['Drapeau', 'Pays', 'Capitale'])
    expect(model.templates.map((t) => t.name)).toEqual(['Drapeau', 'Capitale', 'Pays'])
    expect(model.templates.map((t) => t.qfmt)).toEqual([
      '{{Drapeau}}',
      'Capitale de {{Pays}} ?',
      '{{Capitale}} est la capitale de ?',
    ])
    // Each note keeps its values under the same names, in the new order.
    const values = pkg.notes
      .map((n) => n.fields)
      .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
    expect(values).toEqual([
      ['bleu blanc rouge', 'France', 'Paris'],
      ['', 'Italie', 'Rome'],
    ])
    // The cards sit at the index of their template: Italie, without flag, has no card 0.
    const ordsOf = (country: string) => {
      const anki = pkg.notes.find((n) => n.fields[1] === country)
      return pkg.cards
        .filter((c) => c.nid === anki?.id)
        .map((c) => c.ord)
        .sort((a, b) => a - b)
    }
    expect(ordsOf('France')).toEqual([0, 1, 2])
    expect(ordsOf('Italie')).toEqual([1, 2])
  })
})
