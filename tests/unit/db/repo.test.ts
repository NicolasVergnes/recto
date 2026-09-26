import { describe, expect, it } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import type { Review } from '$lib/domain/types'
import { useTestDatabase } from '../../helpers/db'

const T0 = Date.UTC(2026, 8, 25, 10)
const env = useTestDatabase()

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof RepoError && e.code === code)
}

function fakeReview(cardId: string, deckId: string, reviewedAt: number): Review {
  return {
    id: crypto.randomUUID(),
    cardId,
    deckId,
    reviewedAt,
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
    dueAfter: T0 + 600_000,
    scheduledDays: 0,
    elapsedDays: 0,
    boxAfter: 0,
  }
}

describe('decks', () => {
  it('creates decks with unique sibling names and one nesting level', async () => {
    const geo = await repo.createDeck({ name: 'Géographie' }, T0)
    const dep = await repo.createDeck({ name: 'Départements', parentId: geo.id }, T0)
    expect(dep.parentId).toBe(geo.id)
    await expectCode(repo.createDeck({ name: '  géographie ' }, T0), 'deckNameTaken')
    await expectCode(repo.createDeck({ name: '   ' }, T0), 'deckNameEmpty')
    await expectCode(repo.createDeck({ name: 'X', parentId: dep.id }, T0), 'deckNesting')
    await expectCode(repo.createDeck({ name: 'X', parentId: 'missing' }, T0), 'deckNotFound')
    // Same name under another parent is fine.
    await repo.createDeck({ name: 'Départements' }, T0)
  })

  it('renames, moves and refuses invalid moves', async () => {
    const a = await repo.createDeck({ name: 'A' }, T0)
    const b = await repo.createDeck({ name: 'B' }, T0)
    const c = await repo.createDeck({ name: 'C', parentId: a.id }, T0)
    const renamed = await repo.updateDeck(
      b.id,
      { name: 'B2', emoji: '🌍', description: 'd' },
      T0 + 1,
    )
    expect(renamed).toMatchObject({ name: 'B2', emoji: '🌍', description: 'd', updatedAt: T0 + 1 })
    await expectCode(repo.moveDeck(a.id, b.id, T0), 'deckNesting') // a has a child
    await expectCode(repo.moveDeck(b.id, b.id, T0), 'deckNesting')
    await expectCode(repo.moveDeck(b.id, c.id, T0), 'deckNesting') // c is a sub-deck
    await repo.moveDeck(b.id, a.id, T0)
    expect((await repo.getDeck(b.id))?.parentId).toBe(a.id)
    await repo.moveDeck(c.id, null, T0)
    expect((await repo.getDeck(c.id))?.parentId).toBeNull()
    await expectCode(repo.updateDeck('nope', { name: 'x' }, T0), 'deckNotFound')
  })

  it('merges decks, keeping card/note deck ids consistent (invariant 1)', async () => {
    const src = await repo.createDeck({ name: 'Src' }, T0)
    const child = await repo.createDeck({ name: 'Child', parentId: src.id }, T0)
    const dst = await repo.createDeck({ name: 'Dst' }, T0)
    const { note } = await repo.createNote(
      { deckId: src.id, modelType: 'basic_reverse', fields: ['a', 'b'], tags: [] },
      T0,
    )
    await expectCode(repo.mergeDecks(src.id, src.id, T0), 'deckMergeSelf')
    await expectCode(repo.mergeDecks(src.id, child.id, T0), 'deckMergeSelf')
    await repo.mergeDecks(src.id, dst.id, T0 + 5)
    expect(await repo.getDeck(src.id)).toBeUndefined()
    expect((await repo.getDeck(child.id))?.parentId).toBe(dst.id)
    expect((await repo.getNote(note.id))?.deckId).toBe(dst.id)
    const cards = await repo.getCardsOfNote(note.id)
    expect(cards.map((c) => c.deckId)).toEqual([dst.id, dst.id])
  })

  it('deletes a deck with its sub-decks, notes, cards and reviews', async () => {
    const a = await repo.createDeck({ name: 'A' }, T0)
    const sub = await repo.createDeck({ name: 'Sub', parentId: a.id }, T0)
    const keep = await repo.createDeck({ name: 'Keep' }, T0)
    const n1 = await repo.createNote(
      { deckId: a.id, modelType: 'basic', fields: ['1', '1'], tags: [] },
      T0,
    )
    await repo.createNote(
      { deckId: sub.id, modelType: 'basic_reverse', fields: ['2', '2'], tags: [] },
      T0,
    )
    await repo.createNote({ deckId: keep.id, modelType: 'basic', fields: ['3', '3'], tags: [] }, T0)
    const card = n1.cards[0]
    if (!card) throw new Error('no card')
    await env.db.reviews.add(fakeReview(card.id, a.id, T0))
    expect(await repo.countDeckContents(a.id)).toEqual({ decks: 2, notes: 2, cards: 3 })
    expect(await repo.deleteDeck(a.id)).toEqual({ decks: 2, notes: 2, cards: 3 })
    expect(await repo.collectionCounts()).toEqual({
      decks: 1,
      notes: 1,
      cards: 1,
      reviews: 0,
      media: 0,
    })
    const counts = await repo.deckCounts()
    expect(counts.get(keep.id)).toEqual({ cards: 1, notes: 1 })
  })
})

describe('notes and cards', () => {
  it('creates one card per ord (invariant 2)', async () => {
    const d = await repo.createDeck({ name: 'D' }, T0)
    const basic = await repo.createNote(
      { deckId: d.id, modelType: 'basic', fields: ['a', 'b', 'c'], tags: ['x'], source: 'livre' },
      T0,
    )
    expect(basic.cards.map((c) => c.ord)).toEqual([0])
    expect(basic.note.source).toBe('livre')
    const rev = await repo.createNote(
      { deckId: d.id, modelType: 'basic_reverse', fields: ['a', 'b'], tags: [] },
      T0,
    )
    expect(rev.cards.map((c) => c.ord)).toEqual([0, 1])
    expect(rev.note.fields).toEqual(['a', 'b', ''])
    const cloze = await repo.createNote(
      { deckId: d.id, modelType: 'cloze', fields: ['{{c1::a}} {{c2::b}} {{c2::c}}', ''], tags: [] },
      T0,
    )
    expect(cloze.cards.map((c) => c.ord)).toEqual([0, 1])
    await expectCode(
      repo.createNote({ deckId: d.id, modelType: 'cloze', fields: ['rien'], tags: [] }, T0),
      'noteNoCloze',
    )
    await expectCode(
      repo.createNote({ deckId: 'missing', modelType: 'basic', fields: ['a'], tags: [] }, T0),
      'deckNotFound',
    )
    for (const card of [...basic.cards, ...rev.cards, ...cloze.cards]) {
      expect(card).toMatchObject({ state: 0, box: 0, stability: 0, difficulty: 0, deckId: d.id })
    }
  })

  it('reconciles occlusion cards by mask group and stores canonical masks', async () => {
    const d = await repo.createDeck({ name: 'D' }, T0)
    const masks = (list: object[]) => JSON.stringify({ v: 1, mode: 'hideAll', masks: list })
    const image = '<img src="carte.webp">'
    await expectCode(
      repo.createNote(
        { deckId: d.id, modelType: 'image_occlusion', fields: [image, masks([])], tags: [] },
        T0,
      ),
      'noteNoMask',
    )
    const { note, cards } = await repo.createNote(
      {
        deckId: d.id,
        modelType: 'image_occlusion',
        fields: [
          image,
          masks([
            { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
            { n: 2, x: 0.5, y: 0.5, w: 0.3333333, h: 0.9, label: ' B ' },
          ]),
        ],
        tags: [],
      },
      T0,
    )
    expect(cards.map((c) => c.ord)).toEqual([0, 1])
    expect(JSON.parse(note.fields[1] ?? '')).toEqual({
      v: 1,
      mode: 'hideAll',
      masks: [
        { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { n: 2, x: 0.5, y: 0.5, w: 0.3333, h: 0.5, label: 'B' },
      ],
    })
    expect(note.fields).toHaveLength(4)
    const [c1, c2] = cards
    if (!c1 || !c2) throw new Error('missing card')
    await env.db.reviews.add(fakeReview(c1.id, d.id, T0))
    // Group 1 deleted, group 2 moved: the card of group 2 keeps its identity.
    const res = await repo.updateNote(
      note.id,
      {
        deckId: d.id,
        modelType: 'image_occlusion',
        fields: [image, masks([{ n: 2, x: 0, y: 0, w: 0.4, h: 0.4 }]), 'Titre', ''],
        tags: [],
      },
      T0 + 10,
    )
    expect(res.removed).toEqual([c1.id])
    expect(res.added).toEqual([])
    expect((await repo.getCardsOfNote(note.id)).map((c) => c.id)).toEqual([c2.id])
    expect(await env.db.reviews.where('cardId').equals(c1.id).count()).toBe(1)
  })

  it('reconciles cloze cards on edit and keeps the review log of removed ones', async () => {
    const d = await repo.createDeck({ name: 'D' }, T0)
    const { note, cards } = await repo.createNote(
      { deckId: d.id, modelType: 'cloze', fields: ['{{c1::a}} {{c2::b}}', ''], tags: [] },
      T0,
    )
    const c2 = cards.find((c) => c.ord === 1)
    if (!c2) throw new Error('missing card')
    await env.db.reviews.add(fakeReview(c2.id, d.id, T0))
    const res = await repo.updateNote(
      note.id,
      { deckId: d.id, modelType: 'cloze', fields: ['{{c1::a}} {{c3::c}}', 'x'], tags: ['t'] },
      T0 + 10,
    )
    expect(res.removed).toEqual([c2.id])
    expect(res.added.map((c) => c.ord)).toEqual([2])
    expect((await repo.getCardsOfNote(note.id)).map((c) => c.ord)).toEqual([0, 2])
    expect(await env.db.reviews.where('cardId').equals(c2.id).count()).toBe(1)
    expect(res.note).toMatchObject({
      fields: ['{{c1::a}} {{c3::c}}', 'x'],
      tags: ['t'],
      updatedAt: T0 + 10,
    })
  })

  it('switches basic ↔ reverse and moves cards with the note (invariant 1)', async () => {
    const d1 = await repo.createDeck({ name: 'D1' }, T0)
    const d2 = await repo.createDeck({ name: 'D2' }, T0)
    const { note } = await repo.createNote(
      { deckId: d1.id, modelType: 'basic', fields: ['a', 'b'], tags: [], source: 's' },
      T0,
    )
    const res = await repo.updateNote(
      note.id,
      { deckId: d2.id, modelType: 'basic_reverse', fields: ['a', 'b'], tags: [] },
      T0 + 1,
    )
    expect(res.note.source).toBeUndefined()
    const cards = await repo.getCardsOfNote(note.id)
    expect(cards.map((c) => [c.ord, c.deckId])).toEqual([
      [0, d2.id],
      [1, d2.id],
    ])
    await repo.updateNote(
      note.id,
      { deckId: d2.id, modelType: 'basic', fields: ['a', 'b'], tags: [] },
      T0 + 2,
    )
    expect((await repo.getCardsOfNote(note.id)).map((c) => c.ord)).toEqual([0])
    await expectCode(
      repo.updateNote('missing', { deckId: d2.id, modelType: 'basic', fields: [], tags: [] }, T0),
      'noteNotFound',
    )
  })

  it('moves, tags, deletes notes and detects duplicates', async () => {
    const d1 = await repo.createDeck({ name: 'D1' }, T0)
    const d2 = await repo.createDeck({ name: 'D2' }, T0)
    const a = await repo.createNote(
      { deckId: d1.id, modelType: 'basic', fields: ['<b>Paris</b>', 'x'], tags: ['geo'] },
      T0,
    )
    const b = await repo.createNote(
      { deckId: d1.id, modelType: 'basic_reverse', fields: ['Lyon', 'y'], tags: [] },
      T0,
    )
    expect((await repo.findDuplicate(d1.id, ' paris '))?.id).toBe(a.note.id)
    expect(await repo.findDuplicate(d1.id, 'paris', a.note.id)).toBeUndefined()
    expect(await repo.findDuplicate(d2.id, 'paris')).toBeUndefined()
    expect(await repo.findDuplicate(d1.id, '  ')).toBeUndefined()

    await repo.addTags([a.note.id, b.note.id], ['france', 'geo'], T0 + 1)
    expect((await repo.getNote(a.note.id))?.tags).toEqual(['geo', 'france'])
    expect(await repo.allTags()).toEqual(['france', 'geo'])
    await repo.removeTags([a.note.id], ['geo'], T0 + 2)
    expect((await repo.getNote(a.note.id))?.tags).toEqual(['france'])

    await repo.moveNotes([b.note.id], d2.id, T0 + 3)
    const moved = await repo.getCardsOfNote(b.note.id)
    expect(moved.every((c) => c.deckId === d2.id)).toBe(true)

    const card = b.cards[0]
    if (!card) throw new Error('no card')
    await env.db.reviews.add(fakeReview(card.id, d2.id, T0))
    expect(await repo.deleteNotes([b.note.id])).toBe(2)
    expect(await repo.getNote(b.note.id)).toBeUndefined()
    expect(await env.db.reviews.count()).toBe(0)
  })

  it('suspends, flags and resets cards without touching the log', async () => {
    const d = await repo.createDeck({ name: 'D' }, T0)
    const { cards } = await repo.createNote(
      { deckId: d.id, modelType: 'basic_reverse', fields: ['a', 'b'], tags: [] },
      T0,
    )
    const ids = cards.map((c) => c.id)
    await repo.setSuspended(ids, true)
    await repo.setFlag(ids, 2)
    const first = ids[0] ?? ''
    await env.db.cards.update(first, { state: 2, stability: 10, difficulty: 5, reps: 3, box: 4 })
    await env.db.reviews.add(fakeReview(first, d.id, T0))
    await repo.resetCards([first], T0 + 100)
    const reset = await repo.getCard(first)
    expect(reset).toMatchObject({
      state: 0,
      stability: 0,
      difficulty: 0,
      reps: 0,
      box: 0,
      due: T0 + 100,
      suspended: true,
      flag: 2,
    })
    expect(await env.db.reviews.count()).toBe(1)
  })
})
