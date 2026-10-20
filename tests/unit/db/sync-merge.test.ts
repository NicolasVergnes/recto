import { afterEach, describe, expect, it } from 'vitest'
import * as repo from '$lib/db/repo'
import { restoreBackup } from '$lib/db/restore'
import { RectoDB, SCHEMA_VERSION, useDatabase } from '$lib/db/schema'
import { getSetting, setSetting } from '$lib/db/settings'
import { recordReview, undoReview } from '$lib/db/study'
import { deleteMedia } from '$lib/media/store'
import { createBackup } from '$lib/export/backup'
import { parseBackup, type ParsedBackup } from '$lib/import/backup'
import { seededRandom } from '$lib/queue/random'
import { getScheduler } from '$lib/scheduler'
import { cardProblems } from '../../helpers/invariants'

// M12: merging the backup of another device follows the deletions of both (« pierres
// tombales »): a deleted row never comes back unless it changed after its deletion.

const T0 = Date.UTC(2026, 9, 12, 8)
const MIN = 60_000
const fsrs = getScheduler('fsrs', { fuzz: false })
const opened: RectoDB[] = []
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

function device(name: string): RectoDB {
  const db = new RectoDB(`${name}-${crypto.randomUUID()}`)
  opened.push(db)
  return db
}

/** Runs `fn` against `db` (the repository uses the swapped database). */
async function on<T>(db: RectoDB, fn: () => Promise<T>): Promise<T> {
  useDatabase(db)
  return fn()
}

const backupOf = (db: RectoDB, at: number): Promise<ParsedBackup> =>
  on(db, async () =>
    parseBackup(new Uint8Array(await (await createBackup(at)).arrayBuffer()), SCHEMA_VERSION),
  )

const mergeInto = async (db: RectoDB, parsed: ParsedBackup, at: number) =>
  on(db, () => restoreBackup(parsed, 'merge', at))

/** Device A with a deck, a basic note and a two-hole cloze; device B a copy of it. */
async function twoDevices() {
  const a = device('a')
  const ids = await on(a, async () => {
    const deck = await repo.createDeck({ name: 'Géo' }, T0)
    const basic = await repo.createNote(
      { deckId: deck.id, modelType: 'basic', fields: ['France', 'Paris'], tags: [] },
      T0,
    )
    const cloze = await repo.createNote(
      { deckId: deck.id, modelType: 'cloze', fields: ['{{c1::Lyon}} {{c2::Rhône}}', ''], tags: [] },
      T0,
    )
    return {
      deck: deck.id,
      basic: basic.note.id,
      cloze: cloze.note.id,
      card: basic.cards[0]?.id ?? '',
    }
  })
  const b = device('b')
  const copy = await backupOf(a, T0 + MIN)
  await on(b, () => restoreBackup(copy, 'replace'))
  return { a, b, ...ids }
}

/** What both devices must agree on after merging each other (settings and dates of now aside). */
async function content(db: RectoDB) {
  return on(db, async () => {
    const byId = <T extends { id: string }>(rows: T[]) =>
      rows.map((r) => r.id).sort((x, y) => x.localeCompare(y))
    return {
      decks: byId(await db.decks.toArray()),
      notes: (await db.notes.toArray())
        .map((n) => [n.id, n.fields.join('|'), n.updatedAt])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      cards: (await db.cards.toArray())
        .map((c) => [c.id, c.ord, c.reps, c.suspended, c.updatedAt])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      reviews: byId(await db.reviews.toArray()),
    }
  })
}

describe('merging another device follows its deletions (M12)', () => {
  it('a note deleted here does not come back from an older copy', async () => {
    const { a, b, basic } = await twoDevices()
    await on(a, () => repo.deleteNotes([basic], T0 + 2 * MIN))
    const report = await mergeInto(a, await backupOf(b, T0 + 3 * MIN), T0 + 4 * MIN)
    expect(report).toMatchObject({ notes: 0, notesUpdated: 0, cards: 0 })
    await on(a, async () => {
      expect(await repo.getNote(basic)).toBeUndefined()
      expect(await a.cards.where('noteId').equals(basic).count()).toBe(0)
    })
  })

  it('a note deleted there is deleted here, with its cards and their log', async () => {
    const { a, b, basic, card } = await twoDevices()
    await on(b, async () => {
      const c = await repo.getCard(card)
      if (!c) throw new Error('card')
      const deck = await repo.getDeck(c.deckId)
      if (!deck) throw new Error('deck')
      await recordReview(fsrs.answer(c, 3, T0 + 2 * MIN, deck), 3000)
    })
    await mergeInto(a, await backupOf(b, T0 + 3 * MIN), T0 + 3 * MIN) // A has the review too
    await on(b, () => repo.deleteNotes([basic], T0 + 4 * MIN))
    const report = await mergeInto(a, await backupOf(b, T0 + 5 * MIN), T0 + 6 * MIN)
    expect(report.deleted).toBe(1)
    await on(a, async () => {
      expect(await repo.getNote(basic)).toBeUndefined()
      expect(await a.cards.where('noteId').equals(basic).count()).toBe(0)
      expect(await a.reviews.where('cardId').equals(card).count()).toBe(0)
      // Learned: a third device merging A will not bring the note back either.
      expect(await a.deletions.get(`notes:${basic}`)).toMatchObject({ deletedAt: T0 + 4 * MIN })
      expect(await cardProblems(a)).toEqual([])
    })
  })

  it('a note changed after its deletion elsewhere is kept, on both sides', async () => {
    const { a, b, basic } = await twoDevices()
    await on(a, () => repo.deleteNotes([basic], T0 + 2 * MIN))
    await on(b, () =>
      repo
        .updateNote(
          basic,
          { deckId: '', modelType: 'basic', fields: ['France', 'Paris (75)'], tags: [] },
          T0 + 3 * MIN,
        )
        .catch(async () => {
          const note = await repo.getNote(basic)
          if (!note) throw new Error('note')
          return repo.updateNote(
            basic,
            { deckId: note.deckId, modelType: 'basic', fields: ['France', 'Paris (75)'], tags: [] },
            T0 + 3 * MIN,
          )
        }),
    )
    await mergeInto(a, await backupOf(b, T0 + 4 * MIN), T0 + 5 * MIN)
    await mergeInto(b, await backupOf(a, T0 + 6 * MIN), T0 + 7 * MIN)
    for (const db of [a, b]) {
      await on(db, async () => {
        expect((await repo.getNote(basic))?.fields).toEqual(['France', 'Paris (75)', ''])
        expect(await db.cards.where('noteId').equals(basic).count()).toBe(1)
      })
    }
  })

  it('a deck deleted here is kept when the other device added a note to it', async () => {
    const { a, b, deck } = await twoDevices()
    await on(a, () => repo.deleteDeck(deck, T0 + 2 * MIN))
    const added = await on(b, () =>
      repo.createNote(
        { deckId: deck, modelType: 'basic', fields: ['Italie', 'Rome'], tags: [] },
        T0 + 3 * MIN,
      ),
    )
    await mergeInto(a, await backupOf(b, T0 + 4 * MIN), T0 + 5 * MIN)
    await on(a, async () => {
      // The new note and its deck are there; the notes deleted with the deck are not.
      expect((await a.notes.toArray()).map((n) => n.id)).toEqual([added.note.id])
      expect(await repo.getDeck(deck)).toMatchObject({ name: 'Géo', updatedAt: T0 + 5 * MIN })
      expect(await a.deletions.get(`decks:${deck}`)).toBeUndefined()
    })
    // B learns the deletions of the other notes, and keeps the deck.
    await mergeInto(b, await backupOf(a, T0 + 6 * MIN), T0 + 7 * MIN)
    expect(await content(b)).toEqual(await content(a))
  })

  it('an answer undone here does not come back from the other device', async () => {
    const { a, b, card } = await twoDevices()
    const answer = await on(a, async () => {
      const c = await repo.getCard(card)
      const deck = c ? await repo.getDeck(c.deckId) : undefined
      if (!c || !deck) throw new Error('card')
      return { previous: c, review: await recordReview(fsrs.answer(c, 3, T0 + 2 * MIN, deck), 1) }
    })
    await mergeInto(b, await backupOf(a, T0 + 3 * MIN), T0 + 3 * MIN) // B got the answer
    await on(a, () => undoReview(answer.previous, answer.review.id, T0 + 4 * MIN))
    await mergeInto(a, await backupOf(b, T0 + 5 * MIN), T0 + 6 * MIN)
    await on(a, async () => {
      expect(await a.reviews.count()).toBe(0)
      expect((await repo.getCard(card))?.reps).toBe(0)
    })
    await mergeInto(b, await backupOf(a, T0 + 7 * MIN), T0 + 8 * MIN)
    await on(b, async () => {
      expect(await b.reviews.count()).toBe(0)
      expect((await repo.getCard(card))?.reps).toBe(0)
    })
  })

  it('the most recently changed copy of a card wins, whatever it was (suspended, reviewed)', async () => {
    const { a, b, card } = await twoDevices()
    await on(a, () => repo.setSuspended([card], true, T0 + 3 * MIN))
    await on(b, async () => {
      const c = await repo.getCard(card)
      const deck = c ? await repo.getDeck(c.deckId) : undefined
      if (!c || !deck) throw new Error('card')
      await recordReview(fsrs.answer(c, 3, T0 + 2 * MIN, deck), 1)
    })
    await mergeInto(a, await backupOf(b, T0 + 4 * MIN), T0 + 5 * MIN)
    await mergeInto(b, await backupOf(a, T0 + 6 * MIN), T0 + 7 * MIN)
    for (const db of [a, b])
      await on(db, async () => {
        expect(await repo.getCard(card)).toMatchObject({ suspended: true, updatedAt: T0 + 3 * MIN })
        // The answer is in both logs all the same (P10).
        expect(await db.reviews.count()).toBe(1)
      })
  })

  it('an answer given here to a note deleted there, without knowing it, stays in both logs', async () => {
    const { a, b, basic, card } = await twoDevices()
    await on(a, async () => {
      const c = await repo.getCard(card)
      const deck = c ? await repo.getDeck(c.deckId) : undefined
      if (!c || !deck) throw new Error('card')
      await recordReview(fsrs.answer(c, 3, T0 + 2 * MIN, deck), 1)
    })
    await on(b, () => repo.deleteNotes([basic], T0 + 3 * MIN))
    await mergeInto(a, await backupOf(b, T0 + 4 * MIN), T0 + 5 * MIN)
    await mergeInto(b, await backupOf(a, T0 + 6 * MIN), T0 + 7 * MIN)
    for (const db of [a, b])
      await on(db, async () => {
        expect(await repo.getNote(basic)).toBeUndefined()
        expect(await db.cards.where('noteId').equals(basic).count()).toBe(0)
        // P10: the log of an answer neither device deleted knowingly is kept, on both sides.
        expect(await db.reviews.where('cardId').equals(card).count()).toBe(1)
      })
  })

  it('a media deleted here does not come back, unless a note shows it', async () => {
    const { a, b, deck } = await twoDevices()
    const media = (name: string) => ({
      name,
      blob: new Blob([name], { type: 'image/png' }),
      mime: 'image/png',
      size: name.length,
      sha256: name.padEnd(64, '0'),
      createdAt: T0,
    })
    await on(a, () => a.media.bulkAdd([media('vieux.png'), media('drapeau.png')]))
    await mergeInto(b, await backupOf(a, T0 + MIN), T0 + MIN)
    await on(a, () => deleteMedia(['vieux.png', 'drapeau.png'], T0 + 2 * MIN))
    // B shows the flag in a new note meanwhile: the note wins, its image with it.
    await on(b, () =>
      repo.createNote(
        {
          deckId: deck,
          modelType: 'basic',
          fields: ['<img src="drapeau.png">', 'France'],
          tags: [],
        },
        T0 + 3 * MIN,
      ),
    )
    await mergeInto(a, await backupOf(b, T0 + 4 * MIN), T0 + 5 * MIN)
    await mergeInto(b, await backupOf(a, T0 + 6 * MIN), T0 + 7 * MIN)
    for (const db of [a, b])
      expect((await on(db, () => db.media.toCollection().primaryKeys())).sort()).toEqual([
        'drapeau.png',
      ])
  })

  it('keeps the local file when the other device has another content under the same name', async () => {
    const { a, b } = await twoDevices()
    const row = (sha: string) => ({
      name: 'carte.png',
      blob: new Blob([sha], { type: 'image/png' }),
      mime: 'image/png',
      size: sha.length,
      sha256: sha.padEnd(64, '0'),
      createdAt: T0,
    })
    await on(a, () => a.media.add(row('aaaa')))
    await on(b, () => b.media.add(row('bbbb')))
    const report = await mergeInto(a, await backupOf(b, T0 + MIN), T0 + 2 * MIN)
    expect(report).toMatchObject({ media: 0, mediaConflicts: 1 })
    expect((await on(a, () => a.media.get('carte.png')))?.sha256).toBe('aaaa'.padEnd(64, '0'))
  })

  it('shares the collection settings, never the settings of a device', async () => {
    const { a, b } = await twoDevices()
    await on(a, async () => {
      await setSetting('theme', 'dark')
      await setSetting('dayStartHour', 6, T0 + 2 * MIN)
      await setSetting('newDeckModel', 'five', T0 + 2 * MIN)
      await setSetting('leitnerCustom', [1, 4, 10], T0 + 2 * MIN)
    })
    await on(b, () => setSetting('dayStartHour', 5, T0 + MIN)) // older
    await mergeInto(b, await backupOf(a, T0 + 3 * MIN), T0 + 4 * MIN)
    await on(b, async () => {
      expect(await getSetting('dayStartHour')).toBe(6)
      expect(await getSetting('newDeckModel')).toBe('five')
      expect(await getSetting('leitnerCustom')).toEqual([1, 4, 10])
      expect(await getSetting('theme')).toBe('system')
      expect(await getSetting('deviceId')).not.toBe(await on(a, () => getSetting('deviceId')))
    })
  })

  it('is idempotent and agrees both ways after random edits on each device', async () => {
    for (const seed of ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit']) {
      const { a, b, deck } = await twoDevices()
      const random = seededRandom(seed)
      let at = T0 + 2 * MIN
      for (const db of [a, b]) {
        await on(db, async () => {
          for (let i = 0; i < 10; i++) {
            at += MIN
            const notes = await db.notes.toArray()
            const note = notes[Math.floor(random() * notes.length)]
            const roll = random()
            if (roll < 0.25 && note) await repo.deleteNotes([note.id], at)
            else if (roll < 0.5 && note && note.modelType === 'cloze')
              await repo.updateNote(
                note.id,
                {
                  deckId: note.deckId,
                  modelType: 'cloze',
                  fields: [`{{c${i + 1}::x${i}}}`, ''],
                  tags: [],
                },
                at,
              )
            else if (roll < 0.75) {
              const cards = await db.cards.toArray()
              const c = cards[Math.floor(random() * cards.length)]
              const d = c ? await repo.getDeck(c.deckId) : undefined
              if (c && d) await recordReview(fsrs.answer(c, 3, at, d), 1)
            } else if ((await repo.getDeck(deck)) !== undefined)
              await repo.createNote(
                { deckId: deck, modelType: 'basic', fields: [`Q${seed}${i}`, 'R'], tags: [] },
                at,
              )
          }
        })
      }
      const fromA = await backupOf(a, at + MIN)
      const fromB = await backupOf(b, at + MIN)
      await mergeInto(a, fromB, at + 2 * MIN)
      await mergeInto(b, fromA, at + 2 * MIN)
      expect(await content(b), seed).toEqual(await content(a))
      const once = await content(a)
      await mergeInto(a, fromB, at + 3 * MIN)
      expect(await content(a), seed).toEqual(once)
      for (const db of [a, b]) expect(await cardProblems(db), seed).toEqual([])
      for (const db of opened.splice(0)) await db.delete()
    }
  })
})
