import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Note, Review } from '$lib/domain/types'
import { restoreBackup } from '$lib/db/restore'
import { RectoDB, SCHEMA_VERSION, useDatabase } from '$lib/db/schema'
import { createBackup } from '$lib/export/backup'
import { BackupError, parseBackup, type BackupData, type ParsedBackup } from '$lib/import/backup'
import { seededRandom } from '$lib/queue/random'
import { review } from '../../helpers/fixtures'
import { dumpDatabase, generateCollection } from '../../helpers/generate'
import { useTestDatabase } from '../../helpers/db'
import { cardProblems } from '../../helpers/invariants'

const env = useTestDatabase()
const now = Date.UTC(2026, 8, 25)

async function exportBytes() {
  return new Uint8Array(await (await createBackup(now)).arrayBuffer())
}

async function freshDatabase() {
  const next = new RectoDB(`restore-${crypto.randomUUID()}`)
  useDatabase(next)
  return next
}

describe('backup round trip (property: restore(export(db)) ≡ db)', () => {
  for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
    it(`restores seed ${seed} bit for bit`, async () => {
      await generateCollection(env.db, seed)
      const before = await dumpDatabase(env.db)
      const bytes = await exportBytes()
      const parsed = parseBackup(bytes, SCHEMA_VERSION)
      expect(parsed.invalid).toBe(0)
      expect(parsed.manifest.counts.cards).toBe(before.cards.length)

      const target = await freshDatabase()
      try {
        await target.settings.put({ key: 'theme', value: 'light' })
        const report = await restoreBackup(parsed, 'replace')
        expect(report.missingFiles).toBe(0)
        // Everything but this device's own settings (M12): they stay, the collection's come.
        const after = await dumpDatabase(target)
        const shared = (rows: typeof after.settings) => rows.filter((s) => s.key === 'dayStartHour')
        expect({ ...after, settings: shared(after.settings) }).toEqual({
          ...before,
          settings: shared(before.settings),
        })
        expect(after.settings.map((s) => [s.key, s.value])).toEqual([
          ['dayStartHour', 4],
          ['theme', 'light'],
        ])
      } finally {
        await target.delete()
      }
    })
  }

  it('replace wipes what was there before', async () => {
    await generateCollection(env.db, 'one')
    const bytes = await exportBytes()
    const target = await freshDatabase()
    try {
      await generateCollection(target, 'two')
      await restoreBackup(parseBackup(bytes, SCHEMA_VERSION), 'replace')
      expect((await target.decks.toArray()).every((d) => d.id.startsWith('one-'))).toBe(true)
    } finally {
      await target.delete()
    }
  })
})

describe('merge', () => {
  it('is idempotent on the same data', async () => {
    await generateCollection(env.db, 'same')
    const bytes = await exportBytes()
    const before = await dumpDatabase(env.db) // includes lastBackupAt written by the export
    const report = await restoreBackup(parseBackup(bytes, SCHEMA_VERSION), 'merge')
    expect(report).toMatchObject({
      decks: 0,
      notes: 0,
      notesUpdated: 0,
      cards: 0,
      reviews: 0,
      media: 0,
    })
    expect(await dumpDatabase(env.db)).toEqual(before)
  })

  it('adds what is missing and keeps the most recent version', async () => {
    await generateCollection(env.db, 'm')
    const bytes = await exportBytes()
    const parsed = parseBackup(bytes, SCHEMA_VERSION)
    const [first, second] = parsed.data.notes
    if (!first || !second) throw new Error('fixture')
    // Local edits: `first` newer locally, `second` older locally than the backup.
    await env.db.notes.update(first.id, {
      fields: ['local', 'x', ''],
      updatedAt: first.updatedAt + 10,
    })
    await env.db.notes.update(second.id, {
      fields: ['old', 'x', ''],
      updatedAt: second.updatedAt - 10,
    })
    const removedCard = parsed.data.cards.find((c) => c.noteId === first.id)
    if (!removedCard) throw new Error('fixture')
    await env.db.cards.delete(removedCard.id)
    await env.db.reviews.where('cardId').equals(removedCard.id).delete()
    const lostReviews = parsed.data.reviews.filter((r) => r.cardId === removedCard.id).length

    const report = await restoreBackup(parsed, 'merge')
    expect((await env.db.notes.get(first.id))?.fields[0]).toBe('local')
    expect((await env.db.notes.get(second.id))?.fields).toEqual(second.fields)
    expect(report.notesUpdated).toBe(1)
    expect(report.cards).toBe(1)
    expect(report.reviews).toBe(lostReviews)
    expect(await env.db.cards.get(removedCard.id)).toBeDefined()
  })

  it('merges decks by name and notes by Anki guid', async () => {
    await generateCollection(env.db, 'g')
    const parsed = parseBackup(await exportBytes(), SCHEMA_VERSION)
    const target = await freshDatabase()
    try {
      const deck = parsed.data.decks.find((d) => !d.parentId)
      const note = parsed.data.notes.find((n) => n.deckId === deck?.id)
      if (!deck || !note) throw new Error('fixture')
      // Same deck name under another id, same guid under another note id (older).
      await target.decks.add({ ...deck, id: 'local-deck' })
      await target.notes.add({
        ...note,
        id: 'local-note',
        deckId: 'local-deck',
        sourceGuid: 'shared',
        updatedAt: 0,
        fields: ['vieux', '', ''],
      })
      const withGuid = {
        ...parsed,
        data: {
          ...parsed.data,
          notes: parsed.data.notes.map((n) =>
            n.id === note.id ? { ...n, sourceGuid: 'shared' } : n,
          ),
        },
      }
      await restoreBackup(withGuid, 'merge')
      expect(await target.decks.get(deck.id)).toBeUndefined()
      expect((await target.notes.get('local-note'))?.fields).toEqual(note.fields)
      expect(await target.notes.get(note.id)).toBeUndefined()
      const cards = await target.cards.toArray()
      const notes = new Map((await target.notes.toArray()).map((n) => [n.id, n]))
      for (const c of cards) expect(c.deckId).toBe(notes.get(c.noteId)?.deckId)
    } finally {
      await target.delete()
    }
  })
})

/** A parsed backup holding exactly `data`, as `parseBackup` returns it (no media files). */
function backupOf(data: Partial<BackupData>): ParsedBackup {
  const full: BackupData = {
    decks: [],
    noteTypes: [],
    notes: [],
    cards: [],
    reviews: [],
    settings: [],
    media: [],
    deletions: [],
    ...data,
  }
  const counts = {
    decks: full.decks.length,
    noteTypes: full.noteTypes.length,
    notes: full.notes.length,
    cards: full.cards.length,
    reviews: full.reviews.length,
    settings: full.settings.length,
    media: full.media.length,
    deletions: full.deletions.length,
  }
  const manifest = {
    format: 'recto-backup' as const,
    schemaVersion: SCHEMA_VERSION,
    appVersion: 'test',
    exportedAt: now,
    device: '',
    deviceId: '',
    counts,
  }
  return { manifest, data: full, files: new Map(), invalid: 0 }
}

describe('merge: the cards follow the winning content of each note (invariant 2)', () => {
  const deck = makeDeck({ name: 'Paquet' }, 'deck', now)
  const cloze = (holes: readonly number[]) => holes.map((i) => `{{c${i}::mot${i}}}`).join(' ')
  const clozeNote = (id: string, holes: readonly number[], patch: Partial<Note> = {}): Note => ({
    id,
    deckId: deck.id,
    modelType: 'cloze',
    fields: [cloze(holes), ''],
    tags: [],
    createdAt: 1,
    updatedAt: 10,
    ...patch,
  })
  /** The card of `ord` (hole n°ord+1), id `<note>-<ord>` unless given. */
  const cardOf = (
    note: Note,
    ord: number,
    id = `${note.id}-${ord}`,
    patch: Partial<Card> = {},
  ) => ({
    ...makeCard(note, ord, id, 1),
    ...patch,
  })
  const cardsOf = (note: Note, ords: readonly number[]) => ords.map((o) => cardOf(note, o))

  async function seedLocal(notes: Note[], cards: Card[], reviews: Review[] = []) {
    await env.db.decks.add(deck)
    await env.db.notes.bulkAdd(notes)
    await env.db.cards.bulkAdd(cards)
    await env.db.reviews.bulkAdd(reviews)
  }
  const ordsOf = async (noteId: string) =>
    (await env.db.cards.where('noteId').equals(noteId).toArray())
      .map((c) => c.ord)
      .sort((a, b) => a - b)

  it('gives a note updated by its Anki guid the cards of the holes the newer copy gained', async () => {
    const mine = clozeNote('mine', [1, 2], { sourceGuid: 'anki', updatedAt: 10 })
    await seedLocal(
      [mine],
      [
        cardOf(mine, 0, 'm0', { lastReview: 500, reps: 2 }),
        cardOf(mine, 1, 'm1', { lastReview: 600 }),
      ],
    )
    // Imported under another id on the other device, where the hole n°3 was added and studied.
    const theirs = clozeNote('theirs', [1, 2, 3], { sourceGuid: 'anki', updatedAt: 20 })
    const gained = cardOf(theirs, 2, 't2', { state: 2, reps: 1, lastReview: 900 })
    const report = await restoreBackup(
      backupOf({
        decks: [deck],
        notes: [theirs],
        cards: [cardOf(theirs, 0), cardOf(theirs, 1), gained],
        reviews: [review('review-t2', gained)],
      }),
      'merge',
    )
    expect(await ordsOf('mine')).toEqual([0, 1, 2])
    // The card of the new hole is the other device's, moved to the note, with its log (P10).
    expect(await env.db.cards.get('t2')).toMatchObject({ noteId: 'mine', deckId: 'deck', reps: 1 })
    expect(await env.db.reviews.get('review-t2')).toBeDefined()
    // The cards both sides had stay the ones most recently reviewed: the local ones.
    expect(await env.db.cards.get('m0')).toMatchObject({ reps: 2, lastReview: 500 })
    expect(await env.db.cards.get('theirs-0')).toBeUndefined()
    expect(await env.db.notes.get('theirs')).toBeUndefined()
    expect((await env.db.notes.get('mine'))?.fields[0]).toBe(cloze([1, 2, 3]))
    expect(await cardProblems(env.db)).toEqual([])
    expect(report).toMatchObject({
      notes: 0,
      notesUpdated: 1,
      cards: 1,
      cardsRemoved: 0,
      reviews: 1,
    })
  })

  it('removes the local card of a hole the newer copy no longer has, its log kept', async () => {
    const mine = clozeNote('n', [1, 2, 3], { updatedAt: 10 })
    const doomed = cardOf(mine, 1)
    await seedLocal(
      [mine],
      [cardOf(mine, 0), doomed, cardOf(mine, 2)],
      [review('r1', doomed, 100), review('r2', doomed, 200)],
    )
    const theirs = clozeNote('n', [1, 3], { updatedAt: 20 })
    const report = await restoreBackup(
      backupOf({ decks: [deck], notes: [theirs], cards: cardsOf(theirs, [0, 2]) }),
      'merge',
    )
    expect(await ordsOf('n')).toEqual([0, 2])
    expect(await env.db.cards.get('n-1')).toBeUndefined()
    expect(await env.db.reviews.where('cardId').equals('n-1').count()).toBe(2)
    expect(await cardProblems(env.db)).toEqual([])
    expect(report).toMatchObject({ notesUpdated: 1, cards: 0, cardsRemoved: 1, reviews: 0 })
  })

  it('does not add the card of a hole the winning local copy no longer has, but keeps its log', async () => {
    const mine = clozeNote('n', [1, 3], { updatedAt: 20 })
    await seedLocal([mine], cardsOf(mine, [0, 2]))
    const theirs = clozeNote('n', [1, 2, 3], { updatedAt: 10 })
    const stale = cardOf(theirs, 1)
    const report = await restoreBackup(
      backupOf({
        decks: [deck],
        notes: [theirs],
        cards: [cardOf(theirs, 0), stale, cardOf(theirs, 2)],
        reviews: [review('review-stale', stale)],
      }),
      'merge',
    )
    expect(await ordsOf('n')).toEqual([0, 2])
    expect(await env.db.cards.get('n-1')).toBeUndefined()
    expect((await env.db.notes.get('n'))?.fields[0]).toBe(cloze([1, 3]))
    // What was answered on the other device stays in the log, like that of any removed card.
    expect(await env.db.reviews.get('review-stale')).toBeDefined()
    expect(await cardProblems(env.db)).toEqual([])
    expect(report).toMatchObject({ notesUpdated: 0, cards: 0, cardsRemoved: 0, reviews: 1 })
  })

  it.each([
    { label: 'the backup one when it was reviewed last', mine: 700, theirs: 900, kept: 't2' },
    { label: 'the local one when it was reviewed last', mine: 900, theirs: 700, kept: 'm2' },
  ])('keeps one card when both devices created that of a new hole: $label', async (c) => {
    const note = clozeNote('n', [1, 2, 3], { updatedAt: 20 })
    const common = cardsOf(note, [0, 1])
    const mine = cardOf(note, 2, 'm2', { lastReview: c.mine, reps: 1 })
    const theirs = cardOf(note, 2, 't2', { lastReview: c.theirs, reps: 1 })
    await seedLocal([note], [...common, mine], [review('review-m2', mine)])
    const report = await restoreBackup(
      backupOf({
        decks: [deck],
        notes: [note],
        cards: [...common, theirs],
        reviews: [review('review-t2', theirs)],
      }),
      'merge',
    )
    const withOrd2 = (await env.db.cards.where('noteId').equals('n').toArray()).filter(
      (card) => card.ord === 2,
    )
    expect(withOrd2.map((card) => card.id)).toEqual([c.kept])
    // The logs of both copies stay.
    expect((await env.db.reviews.toArray()).map((r) => r.id).sort()).toEqual([
      'review-m2',
      'review-t2',
    ])
    expect(await cardProblems(env.db)).toEqual([])
    expect(report.cardsRemoved).toBe(c.kept === 't2' ? 1 : 0)
    expect(report.cards).toBe(c.kept === 't2' ? 1 : 0)
  })

  it('makes a card for a hole of the winning content that no copy has a card for', async () => {
    // A note updated without its cards (before the cards followed the content).
    const mine = clozeNote('n', [1], { updatedAt: 10 })
    await seedLocal([mine], cardsOf(mine, [0]))
    const theirs = clozeNote('n', [1, 2], { updatedAt: 20 })
    const report = await restoreBackup(
      backupOf({ decks: [deck], notes: [theirs], cards: cardsOf(theirs, [0]) }),
      'merge',
      now,
    )
    expect(await ordsOf('n')).toEqual([0, 1])
    expect(
      await env.db.cards
        .where('noteId')
        .equals('n')
        .filter((c) => c.ord === 1)
        .first(),
    ).toMatchObject({
      state: 0,
      due: now,
      deckId: 'deck',
    })
    expect(report).toMatchObject({ notesUpdated: 1, cards: 1, cardsRemoved: 0 })
  })

  it('keeps every card of a winning content that generates none', async () => {
    // Not something the app writes: the cards are not deleted on such a note.
    const mine = clozeNote('n', [1, 2], { updatedAt: 10 })
    await seedLocal([mine], cardsOf(mine, [0, 1]))
    const theirs: Note = { ...mine, fields: ['plus de trou', ''], updatedAt: 20 }
    const report = await restoreBackup(backupOf({ decks: [deck], notes: [theirs] }), 'merge')
    expect(await ordsOf('n')).toEqual([0, 1])
    expect(report).toMatchObject({ notesUpdated: 1, cardsRemoved: 0 })
  })

  it('uses the note types of the merge: those of the backup when newer, to count custom cards', async () => {
    const type = {
      id: 'type',
      name: 'Pays',
      fields: ['Pays', 'Capitale'],
      templates: [
        { name: 'Pays', front: '{{Pays}}', back: '{{Capitale}}' },
        { name: 'Capitale', front: '{{Capitale}}', back: '{{Pays}}' },
      ],
      createdAt: 1,
      updatedAt: 10,
    }
    const custom = (fields: string[], updatedAt: number): Note => ({
      id: 'p',
      deckId: deck.id,
      modelType: 'custom',
      noteTypeId: type.id,
      fields,
      tags: [],
      createdAt: 1,
      updatedAt,
    })
    // Locally the type has one template; the backup's newer type has two, and the note's
    // new content fills the second question.
    const mine = custom(['France', ''], 10)
    await env.db.noteTypes.add({ ...type, templates: type.templates.slice(0, 1) })
    await seedLocal([mine], cardsOf(mine, [0]))
    const theirs = custom(['France', 'Paris'], 20)
    await restoreBackup(
      backupOf({
        decks: [deck],
        noteTypes: [{ ...type, updatedAt: 20 }],
        notes: [theirs],
        cards: cardsOf(theirs, [0, 1]),
      }),
      'merge',
    )
    expect(await ordsOf('p')).toEqual([0, 1])
    expect(await cardProblems(env.db)).toEqual([])
  })

  describe('whatever the two sides did to the holes of their notes', () => {
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']) {
      it(`leaves every note with exactly its cards (seed ${seed})`, async () => {
        const random = seededRandom(`merge-cards-${seed}`)
        const int = (n: number) => Math.floor(random() * n)
        /** The holes of a note after a device added or removed some (never none). */
        const edited = (before: readonly number[]) => {
          const toggled = () => random() < 0.25
          const next = [1, 2, 3, 4, 5].filter((h) => before.includes(h) !== toggled())
          return next.length > 0 ? next : [1]
        }
        const device = () => ({ notes: [] as Note[], cards: [] as Card[], reviews: [] as Review[] })
        const [mine, theirs] = [device(), device()]
        for (let i = 0; i < 30; i++) {
          const before = [1, 2, 3, 4, 5].filter(() => random() < 0.5)
          const kind = (['local', 'backup', 'id', 'id', 'guid', 'guid'] as const)[int(6)]
          const guid = kind === 'guid' ? { sourceGuid: `guid${i}` } : {}
          /** A device's copy of the note: edited holes, a card per hole, some of them studied. */
          const copy = (side: 'l' | 'r', id: string, updatedAt: number, to: typeof mine) => {
            const holes = edited(before)
            const note = clozeNote(id, holes, { ...guid, updatedAt })
            to.notes.push(note)
            for (const hole of holes) {
              // A card keeps its id on both devices when it existed before they diverged.
              const shared = kind === 'id' && before.includes(hole)
              const studied = random() < 0.5
              const card = cardOf(
                note,
                hole - 1,
                shared ? `c${i}-${hole}` : `${side}${i}-${hole}`,
                {
                  lastReview: studied ? 100 + int(900) : null,
                  reps: studied ? 1 : 0,
                },
              )
              to.cards.push(card)
              if (studied) to.reviews.push(review(`${side}-${card.id}`, card))
            }
          }
          // Even `updatedAt` locally, odd in the backup: never a tie.
          if (kind !== 'backup') copy('l', `n${i}`, 10 + 2 * int(10), mine)
          if (kind !== 'local')
            copy('r', kind === 'guid' ? `x${i}` : `n${i}`, 11 + 2 * int(10), theirs)
        }
        await seedLocal(mine.notes, mine.cards, mine.reviews)
        expect(await cardProblems(env.db)).toEqual([])

        await restoreBackup(backupOf({ decks: [deck], ...theirs }), 'merge')
        expect(await cardProblems(env.db)).toEqual([])
        // The log only grows: nothing local is lost.
        const log = new Set((await env.db.reviews.toArray()).map((r) => r.id))
        for (const r of mine.reviews) expect(log.has(r.id)).toBe(true)
      })
    }
  })
})

describe('parseBackup errors', () => {
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
  const code = (fn: () => unknown) => {
    try {
      fn()
    } catch (e) {
      return e instanceof BackupError ? e.code : 'other'
    }
    return 'none'
  }

  it('rejects non-zip, foreign zips, newer versions and broken JSON', () => {
    expect(code(() => parseBackup(strToU8('pas un zip'), 1))).toBe('notZip')
    expect(code(() => parseBackup(zip({ 'a.txt': 'x' }), 1))).toBe('notBackup')
    expect(code(() => parseBackup(zip({ 'manifest.json': '{"format":"autre"}' }), 1))).toBe(
      'notBackup',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': '[1]' }), 1))).toBe('notBackup')
    const manifest = JSON.stringify({ format: 'recto-backup', schemaVersion: 2 })
    expect(code(() => parseBackup(zip({ 'manifest.json': manifest }), 1))).toBe('newerVersion')
    const next = JSON.stringify({ format: 'recto-backup', schemaVersion: SCHEMA_VERSION + 1 })
    expect(code(() => parseBackup(zip({ 'manifest.json': next }), SCHEMA_VERSION))).toBe(
      'newerVersion',
    )
    const ok = JSON.stringify({ format: 'recto-backup', schemaVersion: 1 })
    expect(code(() => parseBackup(zip({ 'manifest.json': ok, 'data.json': '{' }), 1))).toBe(
      'invalidData',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': ok, 'data.json': '[]' }), 1))).toBe(
      'invalidData',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': ok }), 1))).toBe('notBackup')
  })

  it('drops invalid rows and fills missing deck settings with defaults', () => {
    const ok = JSON.stringify({ format: 'recto-backup', schemaVersion: 1 })
    const data = JSON.stringify({
      decks: [
        {
          id: 'd',
          name: 'D',
          scheduler: 'fsrs',
          createdAt: 1,
          updatedAt: 1,
          settings: { fsrs: {}, leitner: {} },
        },
        { id: 'bad', name: 'B', scheduler: 'sm2', createdAt: 1, updatedAt: 1 },
        {
          id: 'bad2',
          name: 'B',
          scheduler: 'fsrs',
          createdAt: 1,
          updatedAt: 1,
          settings: { fsrs: { requestRetention: 5 }, leitner: {} },
        },
      ],
      notes: [{ id: 'n' }],
      cards: 'nope',
      settings: [{ key: 'theme', value: 'dark' }, { nokey: 1 }],
      media: [{ name: 'm.png', mime: 'image/png', size: 3, sha256: 'x', createdAt: 1 }],
    })
    const parsed = parseBackup(
      zip({ 'manifest.json': ok, 'data.json': data, 'media/m.png': 'abc' }),
      1,
    )
    expect(parsed.data.decks).toHaveLength(1)
    expect(parsed.data.decks[0]?.settings.newPerDay).toBe(20)
    expect(parsed.data.decks[0]?.settings.fsrs.learningSteps).toEqual(['10m', '10m'])
    // 2 decks, 1 note, 1 setting (a non-array table is simply empty).
    expect(parsed.invalid).toBe(4)
    expect(parsed.files.get('m.png')).toEqual(strToU8('abc'))
    expect(parsed.manifest).toMatchObject({ appVersion: '', exportedAt: 0, device: '' })
  })

  it('reads a version 3 backup: cards dated by their last review, no deletions (M12)', () => {
    const v3 = JSON.stringify({ format: 'recto-backup', schemaVersion: 3, device: 'pc' })
    const { updatedAt: _u1, ...reviewed } = {
      ...makeCard({ id: 'n', deckId: 'd' }, 0, 'c1', 10),
      lastReview: 50,
    }
    const { updatedAt: _u2, ...fresh } = makeCard({ id: 'n', deckId: 'd' }, 1, 'c2', 20)
    const data = JSON.stringify({
      cards: [reviewed, fresh],
      settings: [{ key: 'dayStartHour', value: 5 }],
    })
    const parsed = parseBackup(zip({ 'manifest.json': v3, 'data.json': data }), SCHEMA_VERSION)
    expect(parsed.invalid).toBe(0)
    expect(parsed.data.cards.map((c) => [c.id, c.updatedAt])).toEqual([
      ['c1', 50],
      ['c2', 20],
    ])
    expect(parsed.data.deletions).toEqual([])
    expect(parsed.data.settings).toEqual([{ key: 'dayStartHour', value: 5 }])
    expect(parsed.manifest).toMatchObject({ device: 'pc', deviceId: '' })
  })

  it('reads a version 4 backup: no twin burying, new cards in random order (M13)', () => {
    const v4 = JSON.stringify({ format: 'recto-backup', schemaVersion: 4, deviceId: 'tel' })
    const deck = makeDeck({ name: 'D' }, 'd1', 10)
    const settings = { ...deck.settings, newOrder: 'added', burySiblings: false }
    const data = JSON.stringify({ decks: [{ ...deck, settings }, 'not a deck'] })
    const parsed = parseBackup(zip({ 'manifest.json': v4, 'data.json': data }), SCHEMA_VERSION)
    // Like the Dexie version 4 upgrade: the settings of a deck created today, dates kept.
    expect(parsed.data.decks).toEqual([deck])
    expect(parsed.invalid).toBe(1)
    // A current backup keeps the order it was given.
    const v5 = JSON.stringify({ format: 'recto-backup', schemaVersion: SCHEMA_VERSION })
    const added = { ...deck, settings: { ...deck.settings, newOrder: 'added' } }
    const kept = JSON.stringify({ decks: [added] })
    expect(
      parseBackup(zip({ 'manifest.json': v5, 'data.json': kept }), SCHEMA_VERSION).data.decks,
    ).toEqual([added])
  })

  it('reads deletions and setting dates (version 4), dropping malformed ones', () => {
    const v4 = JSON.stringify({ format: 'recto-backup', schemaVersion: 4, deviceId: 'tel' })
    const data = JSON.stringify({
      settings: [{ key: 'dayStartHour', value: 6, updatedAt: 9 }],
      deletions: [
        { id: 'ignored', table: 'notes', recordId: 'n1', deletedAt: 7 },
        { table: 'cartes', recordId: 'c1', deletedAt: 7 },
        { table: 'cards', recordId: 'c2' },
      ],
    })
    const parsed = parseBackup(zip({ 'manifest.json': v4, 'data.json': data }), SCHEMA_VERSION)
    expect(parsed.data.deletions).toEqual([
      { id: 'notes:n1', table: 'notes', recordId: 'n1', deletedAt: 7 },
    ])
    expect(parsed.invalid).toBe(2)
    expect(parsed.data.settings).toEqual([{ key: 'dayStartHour', value: 6, updatedAt: 9 }])
    expect(parsed.manifest.deviceId).toBe('tel')
  })

  it('reads two-way templates (version 5); older ones and other values are asked one way', () => {
    const type = (templates: unknown[]) => ({
      id: 't',
      name: 'T',
      fields: ['A', 'B'],
      templates,
      createdAt: 1,
      updatedAt: 1,
    })
    const oneWay = { name: 'A → B', front: '{{A}}', back: '{{FrontSide}}<hr id=answer>{{B}}' }
    const twoWay = { name: 'A ↔ B', front: '{{A}}', back: '{{B}}', twoWay: true }
    const read = (version: number, templates: unknown[]) =>
      parseBackup(
        zip({
          'manifest.json': JSON.stringify({ format: 'recto-backup', schemaVersion: version }),
          'data.json': JSON.stringify({ noteTypes: [type(templates)] }),
        }),
        SCHEMA_VERSION,
      ).data.noteTypes[0]?.templates
    expect(read(5, [oneWay, twoWay])).toEqual([oneWay, twoWay])
    expect(read(5, [{ ...twoWay, twoWay: 'yes' }])).toEqual([{ ...twoWay, twoWay: undefined }])
    expect(read(4, [oneWay])).toEqual([oneWay])
    // A version 4 Recto refuses a version 5 backup rather than asking its two-way cards one way.
    const v5 = JSON.stringify({ format: 'recto-backup', schemaVersion: 5 })
    expect(code(() => parseBackup(zip({ 'manifest.json': v5 }), 4))).toBe('newerVersion')
  })

  it('reads note types (version 3), and older backups without them', () => {
    const note = (id: string, noteTypeId?: string) => ({
      id,
      deckId: 'd',
      modelType: noteTypeId === undefined ? 'basic' : 'custom',
      ...(noteTypeId === undefined ? {} : { noteTypeId }),
      fields: ['a', 'b'],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const type = {
      id: 't',
      name: 'T',
      fields: ['A', 'B'],
      templates: [{ name: 'C', front: '{{A}}', back: '{{B}}' }],
      sourceId: 42,
      createdAt: 1,
      updatedAt: 1,
    }
    const v3 = JSON.stringify({ format: 'recto-backup', schemaVersion: 3 })
    const data = JSON.stringify({
      noteTypes: [type, { ...type, id: 'empty', templates: [] }],
      // A custom note needs its type: without it (or with an unknown one) it is dropped.
      notes: [note('n1', 't'), note('n2', 'missing'), { ...note('n3'), modelType: 'custom' }],
    })
    const parsed = parseBackup(zip({ 'manifest.json': v3, 'data.json': data }), 3)
    expect(parsed.data.noteTypes).toEqual([type])
    expect(parsed.data.notes.map((n) => [n.id, n.noteTypeId])).toEqual([['n1', 't']])
    expect(parsed.manifest.counts.noteTypes).toBe(1)
    expect(parsed.invalid).toBe(3)

    // A version 2 backup has no note types: nothing to migrate.
    const v2 = JSON.stringify({ format: 'recto-backup', schemaVersion: 2 })
    const old = parseBackup(
      zip({ 'manifest.json': v2, 'data.json': JSON.stringify({ notes: [note('n')] }) }),
      SCHEMA_VERSION,
    )
    expect(old.data.noteTypes).toEqual([])
    expect(old.data.notes).toHaveLength(1)
    expect(old.invalid).toBe(0)
  })
})

describe('card kinds (M14)', () => {
  const type = {
    id: 't',
    name: 'Mixte',
    fields: ['Image', 'Phrase'],
    templates: [
      { name: 'Où', kind: 'occlusion', field: 'Image', front: '', back: '', single: true },
      { name: 'Trous', kind: 'cloze', field: 'Phrase', front: '', back: '' },
    ],
    createdAt: 1,
    updatedAt: 1,
  }
  const masks = JSON.stringify({ v: 1, mode: 'hideAll', masks: [{ n: 1, x: 0, y: 0, w: 1, h: 1 }] })
  const custom = {
    id: 'n1',
    deckId: 'd',
    modelType: 'custom',
    noteTypeId: 't',
    fields: ['<img src="a.png">', '{{c1::x}}'],
    masks: [masks, ''],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  }
  const { masks: _masks, noteTypeId: _type, ...plain } = custom
  const cloze = { ...plain, id: 'n2', modelType: 'cloze', single: true, fields: ['{{c1::x}}', ''] }
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
  const manifest = (v: number) => JSON.stringify({ format: 'recto-backup', schemaVersion: v })

  it('reads the kinds of card, single notes and masks; unknown or incomplete kinds are classic', () => {
    const data = JSON.stringify({
      noteTypes: [
        {
          ...type,
          templates: [
            ...type.templates,
            { name: 'Autre', kind: 'flashy', field: 'Phrase', front: '{{Phrase}}', back: '' },
            { name: 'Sans champ', kind: 'cloze', front: '{{Phrase}}', back: '', single: true },
          ],
        },
      ],
      notes: [custom, cloze, { ...plain, id: 'n3', modelType: 'basic', single: true }],
    })
    const parsed = parseBackup(zip({ 'manifest.json': manifest(6), 'data.json': data }), 6)
    expect(parsed.data.noteTypes[0]?.templates).toEqual([
      ...type.templates,
      { name: 'Autre', front: '{{Phrase}}', back: '' },
      { name: 'Sans champ', front: '{{Phrase}}', back: '' },
    ])
    expect(parsed.data.notes.map((n) => [n.id, n.single, n.masks])).toEqual([
      ['n1', undefined, [masks, '']],
      ['n2', true, undefined],
      ['n3', undefined, undefined],
    ])
    expect(parsed.invalid).toBe(0)
  })

  it('is refused by a version that does not know them, and reads a version 5 backup as it is', () => {
    const data = JSON.stringify({ noteTypes: [type], notes: [custom] })
    expect(() => parseBackup(zip({ 'manifest.json': manifest(6), 'data.json': data }), 5)).toThrow(
      BackupError,
    )
    const v5 = JSON.stringify({ noteTypes: [{ ...type, templates: [type.templates[1]] }] })
    const parsed = parseBackup(zip({ 'manifest.json': manifest(5), 'data.json': v5 }), 6)
    expect(parsed.data.noteTypes[0]?.templates).toEqual([type.templates[1]])
  })

  it('goes through a backup and back', async () => {
    await env.db.decks.add(makeDeck({ name: 'D' }, 'd', 1))
    const noteType = {
      ...type,
      templates: type.templates.map((t) => ({ ...t, kind: t.kind as 'cloze' })),
    }
    await env.db.noteTypes.add(noteType)
    await env.db.notes.bulkAdd([custom as Note, cloze as Note])
    const before = await dumpDatabase(env.db)
    const parsed = parseBackup(await exportBytes(), SCHEMA_VERSION)
    const target = await freshDatabase()
    try {
      await restoreBackup(parsed, 'replace')
      const after = await dumpDatabase(target)
      expect(after.noteTypes).toEqual(before.noteTypes)
      expect(after.notes).toEqual(before.notes)
    } finally {
      await target.delete()
    }
  })
})
