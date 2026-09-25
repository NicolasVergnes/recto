import { describe, expect, it } from 'vitest'
import { applyImportPlan, existingCollection } from '$lib/db/importer'
import * as repo from '$lib/db/repo'
import { makeDeck } from '$lib/domain/defaults'
import { defaultMapping, detectModelType, parseCsv, planCsvImport } from '$lib/import/csv'
import { sampleText } from '../../helpers/samples'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
const now = Date.UTC(2026, 8, 25)

async function planDepartements(duplicates: 'skip' | 'update' = 'skip') {
  const target =
    (await repo.listDecks()).find((d) => d.name === 'Cible') ??
    (await repo.createDeck({ name: 'Cible' }, now))
  const data = parseCsv(sampleText('departements.csv'))
  const mapping = defaultMapping(data)
  return planCsvImport(
    data,
    {
      mapping,
      hasHeader: true,
      modelType: detectModelType(data, mapping, true),
      deckId: target.id,
      duplicates,
    },
    await existingCollection(),
    now,
    () => crypto.randomUUID(),
  )
}

describe('applyImportPlan', () => {
  it('writes decks, notes and cards in batches with progress', async () => {
    const plan = await planDepartements()
    const progress: [number, number][] = []
    const report = await applyImportPlan(plan, {
      batchSize: 40,
      onProgress: (d, t) => progress.push([d, t]),
    })
    expect(report).toMatchObject({ notesCreated: 101, cardsCreated: 101, cancelled: false })
    expect(progress).toEqual([
      [0, 101],
      [40, 101],
      [80, 101],
      [101, 101],
    ])
    expect(await repo.collectionCounts()).toMatchObject({ decks: 3, notes: 101, cards: 101 })
    // Invariant 1 holds for imported cards.
    const notes = new Map((await env.db.notes.toArray()).map((n) => [n.id, n]))
    for (const card of await env.db.cards.toArray())
      expect(card.deckId).toBe(notes.get(card.noteId)?.deckId)
  })

  it('skips duplicates on a second import and updates them when asked', async () => {
    await applyImportPlan(await planDepartements())
    const again = await planDepartements()
    expect(again.report.skipped).toBe(101)
    const upd = await planDepartements('update')
    const report = await applyImportPlan(upd)
    expect(report.notesUpdated).toBe(101)
    expect(await env.db.notes.count()).toBe(101)
  })

  it('stops between batches when cancelled, keeping written batches', async () => {
    const plan = await planDepartements()
    const controller = new AbortController()
    const report = await applyImportPlan(plan, {
      batchSize: 30,
      signal: controller.signal,
      onProgress: (done) => {
        if (done >= 60) controller.abort()
      },
    })
    expect(report.cancelled).toBe(true)
    expect(report.notesCreated).toBe(60)
    expect(await env.db.notes.count()).toBe(60)
  })

  it('stores media and reviews of a plan', async () => {
    const deck = makeDeck({ name: 'M' }, 'm', now)
    const report = await applyImportPlan({
      decks: [deck],
      notes: [],
      cards: [],
      reviews: [],
      updates: [],
      media: [{ name: 'a.png', blob: new Blob(['png']), mime: 'image/png' }],
      report: (await planDepartements()).report,
    })
    expect(report.mediaImported).toBe(1)
    expect((await env.db.media.get('a.png'))?.size).toBe(3)
  })
})
