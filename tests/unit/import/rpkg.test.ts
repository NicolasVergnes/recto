import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { makeDeck } from '$lib/domain/defaults'
import type { Note, NoteType } from '$lib/domain/types'
import { buildRpkg, type PackageDeck, type PackageNote, type RpkgContent } from '$lib/export/rpkg'
import type { ImportPlan, PackageExisting } from '$lib/import/plan'
import { describeRpkg, parseRpkg, planRpkgImport, RpkgError } from '$lib/import/rpkg'

const now = Date.UTC(2026, 9, 21)
let seq = 0
const newId = () => `id-${++seq}`
const SCHEMA = 8
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

const COUNTRY: NoteType = {
  id: 'type-pays',
  name: 'Pays',
  fields: ['Pays', 'Capitale'],
  templates: [
    { name: 'Capitale', front: '{{Pays}}', back: '{{FrontSide}}<hr id=answer>{{Capitale}}' },
    { name: 'Pays', front: '{{Capitale}}', back: '{{FrontSide}}<hr id=answer>{{Pays}}' },
  ],
  createdAt: 1,
  updatedAt: 1,
}

const decks: PackageDeck[] = [
  {
    id: 'geo',
    name: 'Géographie',
    parentId: null,
    description: 'Le monde',
    settings: { newPerDay: 5, typedAnswer: true, pausedFormats: ['type-pays:1', 'cloze'] },
  },
  { id: 'cap', name: 'Capitales', parentId: 'geo', settings: {} },
]

function note(id: string, patch: Partial<PackageNote> = {}): PackageNote {
  return {
    id,
    deckId: 'geo',
    modelType: 'basic',
    fields: [`${id} recto`, `${id} verso`, ''],
    tags: ['t'],
    createdAt: 100,
    updatedAt: 200,
    ...patch,
  }
}

const paysNote = note('n-pays', {
  deckId: 'cap',
  modelType: 'custom',
  noteTypeId: 'type-pays',
  fields: ['France <img src="carte.png">', 'Paris'],
})

const notes: PackageNote[] = [
  note('n-basic', { oneWay: true }),
  note('n-cloze', { modelType: 'cloze', fields: ['{{c1::Paris}} et {{c2::Lyon}}', ''] }),
  paysNote,
  note('n-sus', { suspended: true }),
]

function content(patch: Partial<RpkgContent> = {}): RpkgContent {
  return {
    decks,
    noteTypes: [COUNTRY],
    notes,
    media: [
      {
        meta: { name: 'carte.png', mime: 'image/png', size: png.length, sha256: 'x', createdAt: 1 },
        data: png,
      },
    ],
    cards: 5,
    ...patch,
  }
}

const meta = { id: 'geo', title: 'Géographie', author: 'Nicolas', licence: 'CC BY 4.0' }
const pack = (patch: Partial<RpkgContent> = {}) =>
  parseRpkg(
    buildRpkg(content(patch), { ...meta, schemaVersion: SCHEMA, appVersion: '1', exportedAt: 9 }),
    SCHEMA,
  )
const empty: PackageExisting = { decks: [], notes: [], cards: [], media: new Map() }
const options = { model: { model: 'fsrs', custom: [] } } as const

/** What the planner sees once `plan` has been written, without the database. */
const after = (plan: ImportPlan, base: PackageExisting = empty): PackageExisting => ({
  decks: [...base.decks, ...plan.decks],
  notes: [...base.notes.map((n) => plan.updates.find((u) => u.id === n.id) ?? n), ...plan.notes],
  noteTypes: [...(base.noteTypes ?? []), ...(plan.noteTypes ?? [])],
  cards: [...base.cards, ...plan.cards],
  media: new Map([...base.media, ...plan.media.map((m) => [m.name, 'sha'] as const)]),
})

describe('reading a .rpkg (05 §5)', () => {
  it('reads what was written: manifest, decks, types, notes, media', () => {
    const pkg = pack()
    expect(pkg.manifest).toMatchObject({
      format: 'recto-deck',
      id: 'geo',
      title: 'Géographie',
      author: 'Nicolas',
      licence: 'CC BY 4.0',
      counts: { decks: 2, noteTypes: 1, notes: 4, cards: 5, media: 1 },
    })
    expect(pkg.decks).toEqual(decks)
    expect(pkg.noteTypes).toEqual([COUNTRY])
    expect(pkg.notes.map((n) => n.id)).toEqual(notes.map((n) => n.id))
    expect(pkg.notes[3]?.suspended).toBe(true)
    expect(pkg.media).toEqual([{ name: 'carte.png', data: png }])
    expect(pkg.invalid).toBe(0)
  })

  it('drops invalid rows and reports media listed without their file', () => {
    const pkg = pack({
      notes: [
        ...notes,
        note('n-nowhere', { deckId: 'missing' }),
        note('n-notype', { modelType: 'custom', noteTypeId: 'missing', fields: ['a', 'b'] }),
      ],
      media: [
        ...content().media,
        {
          meta: { name: 'son.mp3', mime: 'audio/mpeg', size: 1, sha256: 'y', createdAt: 1 },
          data: png,
        },
      ],
    })
    expect(pkg.notes).toHaveLength(4)
    expect(pkg.invalid).toBe(2)
    // Settings it cannot read are left out, never the deck.
    const odd = parseRpkg(
      zipSync({
        'manifest.json': strToU8(
          JSON.stringify({ format: 'recto-deck', schemaVersion: 8, id: 'x' }),
        ),
        'data.json': strToU8(
          JSON.stringify({
            decks: [
              { id: 'd', name: 'D', settings: { newPerDay: -1, newOrder: 'x', typedAnswer: 1 } },
            ],
            media: [{ name: 'gone.png', mime: 'image/png', size: 1, sha256: 'z', createdAt: 1 }],
          }),
        ),
      }),
      SCHEMA,
    )
    expect(odd.decks).toEqual([{ id: 'd', name: 'D', parentId: null, settings: {} }])
    expect(odd.missingMedia).toEqual(['gone.png'])
    expect(odd.manifest.title).toBe('')
  })

  it('refuses what is not a package, a damaged one and a newer one', () => {
    const code = (bytes: Uint8Array) => {
      try {
        parseRpkg(bytes, SCHEMA)
      } catch (e) {
        return e instanceof RpkgError ? e.code : 'other'
      }
      return 'none'
    }
    expect(code(new Uint8Array([1, 2, 3]))).toBe('notZip')
    expect(code(zipSync({ 'data.json': strToU8('{}') }))).toBe('notPackage')
    expect(
      code(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'recto-backup' })) })),
    ).toBe('notPackage')
    const manifest = (v: number) =>
      strToU8(JSON.stringify({ format: 'recto-deck', schemaVersion: v, id: 'x' }))
    expect(code(zipSync({ 'manifest.json': manifest(9), 'data.json': strToU8('{}') }))).toBe(
      'newerVersion',
    )
    expect(code(zipSync({ 'manifest.json': manifest(8), 'data.json': strToU8('{') }))).toBe(
      'invalidData',
    )
  })
})

describe('importing a .rpkg', () => {
  it('creates the decks with their settings, the types, the notes and their cards', async () => {
    const plan = await planRpkgImport(
      pack(),
      { model: { model: 'five', custom: [] } },
      empty,
      now,
      newId,
    )
    const [geo, cap] = plan.decks
    expect(plan.decks.map((d) => d.name)).toEqual(['Géographie', 'Capitales'])
    expect(cap?.parentId).toBe(geo?.id)
    // Settings and description of the package; the scheduler chosen at import (ADR-014).
    expect(geo).toMatchObject({
      description: 'Le monde',
      scheduler: 'leitner',
      settings: {
        newPerDay: 5,
        typedAnswer: true,
        pausedFormats: ['type-pays:1', 'cloze'],
        leitner: { model: 'five' },
      },
    })
    expect(cap?.settings.newPerDay).toBe(20)
    // The type keeps the package's id when it is free: the next import finds it.
    expect(plan.noteTypes).toEqual([{ ...COUNTRY, createdAt: now }])
    expect(plan.notes.map((n) => [n.sourceGuid, n.modelType, n.deckId])).toEqual([
      ['n-basic', 'basic', geo?.id],
      ['n-cloze', 'cloze', geo?.id],
      ['n-pays', 'custom', cap?.id],
      ['n-sus', 'basic', geo?.id],
    ])
    expect(plan.notes[0]?.oneWay).toBe(true)
    expect(plan.notes.every((n) => !('suspended' in n))).toBe(true)
    expect(
      plan.cards.map((c) => [plan.notes.find((n) => n.id === c.noteId)?.sourceGuid, c.ord]),
    ).toEqual([
      ['n-basic', 0],
      ['n-cloze', 0],
      ['n-cloze', 1],
      ['n-pays', 0],
      ['n-pays', 1],
      ['n-sus', 0],
    ])
    expect(plan.cards.filter((c) => c.suspended).length).toBe(1)
    expect(plan.media.map((m) => m.name)).toEqual(['carte.png'])
    expect(plan.report).toMatchObject({
      decksCreated: ['Géographie', 'Capitales'],
      noteTypesCreated: ['Pays'],
      notesCreated: 4,
      cardsCreated: 6,
      mediaImported: 1,
      missingMedia: [],
    })
  })

  it('updates the notes of a newer copy, adds the new ones and never deletes any', async () => {
    const first = await planRpkgImport(pack(), options, empty, now, newId)
    const existing = after(first)
    // Studying has nothing to do with it: the existing deck keeps its own settings.
    const changed = [
      note('n-basic', { fields: ['n-basic recto', 'nouveau verso', ''], updatedAt: 300 }),
      note('n-cloze', { modelType: 'cloze', fields: ['{{c1::Paris}}', ''], updatedAt: 300 }),
      note('n-new', { deckId: 'cap' }),
    ]
    const second = await planRpkgImport(pack({ notes: changed }), options, existing, now, newId)
    expect(second.decks).toEqual([])
    expect(second.deckUpdates).toBeUndefined()
    expect(second.updates.map((n) => [n.sourceGuid, n.fields[1]])).toEqual([
      ['n-basic', 'nouveau verso'],
      ['n-cloze', ''],
    ])
    // The cloze lost its second hole: that card goes, its log stays (invariant 3).
    expect(second.removedCards?.map((c) => first.cards.find((x) => x.id === c.id)?.ord)).toEqual([
      1,
    ])
    expect(second.notes.map((n) => n.sourceGuid)).toEqual(['n-new'])
    expect(second.report).toMatchObject({ notesUpdated: 2, notesCreated: 1, cardsRemoved: 1 })

    // The same copy again, or an older one: nothing to do.
    const again = await planRpkgImport(
      pack({ notes: changed }),
      options,
      after(second, existing),
      now,
      newId,
    )
    expect(again.updates).toEqual([])
    expect(again.notes).toEqual([])
    expect(again.report.skipped).toBe(3)
  })

  it('finds the notes of its author: a package of my own deck makes no duplicate', async () => {
    const mine: Note[] = notes.map(({ suspended: _s, ...n }) => ({ ...n, deckId: 'geo' }))
    const existing: PackageExisting = {
      decks: [makeDeck({ name: 'Géographie' }, 'geo', 0)],
      notes: mine,
      noteTypes: [COUNTRY],
      cards: [],
      media: new Map(),
    }
    const plan = await planRpkgImport(pack(), options, existing, now, newId)
    expect(plan.notes).toEqual([])
    expect(plan.noteTypes).toEqual([])
    expect(plan.report.skipped).toBe(4)
    expect(describeRpkg(pack(), existing)).toMatchObject({
      known: 4,
      notes: 4,
      decks: [
        { path: 'Géographie', exists: true },
        { path: 'Géographie::Capitales', exists: false },
      ],
    })
  })

  it('copies a type whose fields changed in Recto, and leaves its notes alone', async () => {
    const edited: NoteType = { ...COUNTRY, fields: ['Pays', 'Capitale', 'Drapeau'] }
    const known: Note = { ...note('n-pays'), modelType: 'custom', noteTypeId: 'type-pays' }
    const existing: PackageExisting = { ...empty, notes: [known], noteTypes: [edited] }
    const plan = await planRpkgImport(
      pack({
        notes: [
          { ...paysNote, updatedAt: 999 },
          { ...paysNote, id: 'n-pays-2' },
        ],
      }),
      options,
      existing,
      now,
      newId,
    )
    expect(plan.noteTypes?.map((t) => [t.name, t.id === 'type-pays'])).toEqual([
      ['Pays (2)', false],
    ])
    expect(plan.notes.map((n) => n.noteTypeId)).toEqual([plan.noteTypes?.[0]?.id])
    expect(plan.updates).toEqual([])
    expect(plan.report.skipped).toBe(1)
  })

  it('renames a media whose name Recto uses for another content, and its references', async () => {
    const existing: PackageExisting = { ...empty, media: new Map([['carte.png', 'autre']]) }
    const plan = await planRpkgImport(pack(), options, existing, now, newId)
    expect(plan.media.map((m) => m.name)).toEqual(['carte-2.png'])
    expect(plan.notes.find((n) => n.sourceGuid === 'n-pays')?.fields[0]).toContain('carte-2.png')
  })
})
