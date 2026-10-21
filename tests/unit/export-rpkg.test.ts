import { afterEach, describe, expect, it } from 'vitest'
import { applyImportPlan, existingForPackage } from '$lib/db/importer'
import { exportRpkg, gatherRpkg } from '$lib/db/export-rpkg'
import * as repo from '$lib/db/repo'
import { RectoDB, SCHEMA_VERSION, useDatabase } from '$lib/db/schema'
import { parseRpkg, planRpkgImport } from '$lib/import/rpkg'
import { sha256Hex } from '$lib/media/hash'
import { useTestDatabase } from '../helpers/db'

const env = useTestDatabase()
const now = Date.UTC(2026, 9, 21)
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9])
let seq = 0
const newId = () => `imported-${++seq}`

const others: RectoDB[] = []
afterEach(async () => {
  for (const db of others.splice(0)) await db.delete()
})

/** A deck with a sub-deck, a custom type, an image, settings of its own and some study. */
async function author() {
  const geo = await repo.createDeck({ name: 'Géographie', description: 'Le monde' }, now)
  const cap = await repo.createDeck({ name: 'Capitales', parentId: geo.id }, now)
  await repo.createDeck({ name: 'Ailleurs' }, now)
  const settings = { ...geo.settings, newPerDay: 7, typedAnswer: true }
  await repo.updateDeck(geo.id, { settings }, now)
  const type = await repo.createNoteType(
    {
      name: 'Pays',
      fields: ['Pays', 'Capitale'],
      templates: [
        { name: 'Capitale', front: '{{Pays}}', back: '{{FrontSide}}<hr id=answer>{{Capitale}}' },
      ],
    },
    now,
  )
  await env.db.media.add({
    name: 'carte.png',
    blob: new Blob([png], { type: 'image/png' }),
    mime: 'image/png',
    size: png.length,
    sha256: await sha256Hex(png),
    createdAt: now,
  })
  const basic = await repo.createNote(
    { deckId: geo.id, modelType: 'basic', fields: ['Soleil', 'Sun', ''], tags: ['astre'] },
    now,
  )
  await repo.createNote(
    {
      deckId: cap.id,
      modelType: 'custom',
      noteTypeId: type.id,
      fields: ['France <img src="carte.png">', 'Paris'],
      tags: [],
    },
    now,
  )
  // Progress never travels: a reviewed, suspended card of the author.
  const card = basic.cards[0]
  if (card) await env.db.cards.put({ ...card, state: 2, reps: 4, suspended: true })
  return { geo, cap, type }
}

async function intoAnotherDevice(bytes: Uint8Array) {
  const other = new RectoDB(`other-${crypto.randomUUID()}`)
  others.push(other)
  useDatabase(other)
  const pkg = parseRpkg(bytes, SCHEMA_VERSION)
  const model = { model: 'seven', custom: [] } as const
  const plan = await planRpkgImport(pkg, { model }, await existingForPackage(), now, newId)
  const report = await applyImportPlan(plan, { now })
  return { other, report }
}

describe('exporting a deck as .rpkg (05 §5)', () => {
  it('gathers the deck, its sub-deck, their notes, types and media, without progress', async () => {
    const { geo } = await author()
    const content = await gatherRpkg(geo.id)
    expect(content.decks.map((d) => d.name)).toEqual(['Géographie', 'Capitales'])
    expect(content.decks[0]).toMatchObject({
      description: 'Le monde',
      settings: { newPerDay: 7, typedAnswer: true },
    })
    expect(content.decks[0]?.settings).not.toHaveProperty('fsrs')
    expect(content.notes).toHaveLength(2)
    expect(content.noteTypes.map((t) => t.name)).toEqual(['Pays'])
    expect(content.media.map((m) => [m.meta.name, m.data.length])).toEqual([['carte.png', 9]])
    expect(content.cards).toBe(2)
    await expect(gatherRpkg('missing')).rejects.toMatchObject({ code: 'deckNotFound' })
  })

  it('imports on another device as it was, new cards, the scheduler chosen there', async () => {
    const { geo } = await author()
    const { blob } = await exportRpkg(geo.id, { title: 'Géo', author: 'Nicolas' }, now)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(parseRpkg(bytes, SCHEMA_VERSION).manifest).toMatchObject({
      id: geo.id,
      title: 'Géo',
      author: 'Nicolas',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now,
    })
    const { other, report } = await intoAnotherDevice(bytes)
    expect(report).toMatchObject({ notesCreated: 2, cardsCreated: 2, mediaImported: 1 })
    const decks = await other.decks.orderBy('name').toArray()
    expect(decks.map((d) => [d.name, d.scheduler, d.settings.newPerDay])).toEqual([
      ['Capitales', 'leitner', 20],
      ['Géographie', 'leitner', 7],
    ])
    const cards = await other.cards.toArray()
    expect(cards.every((c) => c.state === 0 && c.reps === 0 && !c.suspended)).toBe(true)
    expect((await other.media.get('carte.png'))?.size).toBe(9)
    expect((await other.noteTypes.toArray()).map((t) => t.name)).toEqual(['Pays'])

    // The same package again: nothing new.
    const again = parseRpkg(bytes, SCHEMA_VERSION)
    const plan = await planRpkgImport(
      again,
      { model: { model: 'fsrs', custom: [] } },
      await existingForPackage(),
      now,
      newId,
    )
    expect([plan.notes.length, plan.updates.length, plan.media.length]).toEqual([0, 0, 0])
  })

  it('brings the author an update of a deck shared earlier, without duplicates', async () => {
    const { geo } = await author()
    const first = new Uint8Array(
      await (await exportRpkg(geo.id, { title: 'Géo' }, now)).blob.arrayBuffer(),
    )
    const { other } = await intoAnotherDevice(first)
    // The author fixes a note and adds one, then shares the deck again.
    useDatabase(env.db)
    const [sun] = await env.db.notes.where('modelType').equals('basic').toArray()
    if (!sun) throw new Error('no note')
    await repo.updateNote(sun.id, { ...sun, fields: ['Soleil', 'The Sun', ''] }, now + 1000)
    await repo.createNote(
      { deckId: geo.id, modelType: 'basic', fields: ['Lune', 'Moon', ''], tags: [] },
      now + 1000,
    )
    const second = new Uint8Array(
      await (await exportRpkg(geo.id, { title: 'Géo' }, now + 2000)).blob.arrayBuffer(),
    )
    useDatabase(other)
    const plan = await planRpkgImport(
      parseRpkg(second, SCHEMA_VERSION),
      { model: { model: 'fsrs', custom: [] } },
      await existingForPackage(),
      now,
      newId,
    )
    expect(plan.updates.map((n) => n.fields[1])).toEqual(['The Sun'])
    expect(plan.notes.map((n) => n.fields[0])).toEqual(['Lune'])
    await applyImportPlan(plan, { now })
    expect(await other.notes.count()).toBe(3)
  })
})
