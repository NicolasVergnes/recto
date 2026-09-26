import { describe, expect, it, vi } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import {
  cardReviews,
  countsByDeck,
  loadTodayQueue,
  recordReview,
  setRetired,
  studyDecks,
  switchScheduler,
  undoReview,
} from '$lib/db/study'
import { getScheduler } from '$lib/scheduler'
import type { Card } from '$lib/domain/types'
import { paris } from '../../helpers/fixtures'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
const DAY = 86_400_000
const now = paris('2026-09-25T08:00:00Z')
const fsrs = getScheduler('fsrs', { fuzz: false })
const leitner = getScheduler('leitner')

async function setup(scheduler: 'fsrs' | 'leitner' = 'fsrs') {
  const deck = await repo.createDeck({ name: 'D', scheduler }, now - 30 * DAY)
  const { note, cards } = await repo.createNote(
    { deckId: deck.id, modelType: 'basic_reverse', fields: ['a', 'b'], tags: [] },
    now - 30 * DAY,
  )
  return { deck, note, cards: cards as [Card, Card] }
}

describe('recordReview / undoReview', () => {
  it('writes the card and one log row, duration capped at 60 s', async () => {
    const { deck, cards } = await setup()
    const outcome = fsrs.answer(cards[0], 3, now, deck)
    const review = await recordReview(outcome, 125_000)
    expect(review.durationMs).toBe(60_000)
    expect(await repo.getCard(cards[0].id)).toEqual(outcome.card)
    expect(await cardReviews(cards[0].id)).toEqual([review])
    expect((await recordReview(fsrs.answer(outcome.card, 3, now + 1, deck), -5)).durationMs).toBe(0)
  })

  it('is atomic: a failing log write leaves the card untouched', async () => {
    const { deck, cards } = await setup()
    const spy = vi.spyOn(env.db.reviews, 'add').mockRejectedValueOnce(new Error('disk full'))
    await expect(recordReview(fsrs.answer(cards[0], 3, now, deck), 1000)).rejects.toThrow(
      'disk full',
    )
    spy.mockRestore()
    expect(await repo.getCard(cards[0].id)).toEqual(cards[0])
    expect(await env.db.reviews.count()).toBe(0)
  })

  it('undo restores the exact snapshot and deletes only that row', async () => {
    const { deck, cards } = await setup()
    const first = await recordReview(fsrs.answer(cards[0], 3, now, deck), 1000)
    const afterFirst = await repo.getCard(cards[0].id)
    if (!afterFirst) throw new Error('missing')
    const second = await recordReview(fsrs.answer(afterFirst, 1, now + 600_000, deck), 1000)
    await undoReview(afterFirst, second.id)
    expect(await repo.getCard(cards[0].id)).toEqual(afterFirst)
    expect((await cardReviews(cards[0].id)).map((r) => r.id)).toEqual([first.id])
    await undoReview(cards[0], first.id)
    expect(await repo.getCard(cards[0].id)).toEqual(cards[0])
    await expect(undoReview(cards[0], first.id)).rejects.toBeInstanceOf(RepoError)
  })

  it('never brings back a card deleted since, and keeps the deck of a moved note', async () => {
    const { deck, note, cards } = await setup()
    const answer = await recordReview(fsrs.answer(cards[1], 3, now, deck), 1000)
    // The note becomes a plain basic note: its reverse card (ord 1) is deleted, log kept.
    await repo.updateNote(
      note.id,
      { deckId: deck.id, modelType: 'basic', fields: ['a', 'b'], tags: [] },
      now + 1,
    )
    await expect(undoReview(cards[1], answer.id)).rejects.toSatisfy(
      (e: unknown) => e instanceof RepoError && e.code === 'undoGone',
    )
    expect(await repo.getCard(cards[1].id)).toBeUndefined()
    expect(await cardReviews(cards[1].id)).toHaveLength(1)

    const other = await repo.createDeck({ name: 'Autre' }, now)
    const kept = await recordReview(fsrs.answer(cards[0], 3, now, deck), 1000)
    await repo.moveNotes([note.id], other.id, now + 2)
    const restored = await undoReview(cards[0], kept.id)
    expect(restored).toEqual({ ...cards[0], deckId: other.id })
    expect(await repo.getCard(cards[0].id)).toEqual(restored)
  })
})

describe('daily queue from the database', () => {
  it('loads the queue of all decks or of one deck with its sub-decks', async () => {
    const { deck, cards } = await setup()
    const sub = await repo.createDeck({ name: 'Sub', parentId: deck.id }, now)
    const other = await repo.createDeck({ name: 'Other' }, now)
    await repo.createNote(
      { deckId: sub.id, modelType: 'basic', fields: ['s'], tags: [] },
      now - DAY,
    )
    await repo.createNote(
      { deckId: other.id, modelType: 'basic', fields: ['o'], tags: [] },
      now - DAY,
    )
    const all = await loadTodayQueue(now)
    // basic_reverse siblings are buried: one of the two cards today.
    expect(all.result.ids).toHaveLength(3)
    expect(all.result.ids).toContain(cards[0].id)
    const one = await loadTodayQueue(now, deck.id)
    expect(one.result.ids).toHaveLength(2)
    expect(one.decks.map((d) => d.name)).toEqual(['D', 'Sub'])
    const counts = countsByDeck(all)
    expect(counts.get(deck.id)).toEqual({ learning: 0, review: 0, new: 2 })
    expect(counts.get(sub.id)).toEqual({ learning: 0, review: 0, new: 1 })
    expect(studyDecks(all.decks, 'nope')).toEqual([])
  })

  it('buries the sibling of a card answered today and counts it as seen', async () => {
    const { deck, cards } = await setup()
    const out = fsrs.answer(cards[0], 3, now - 3600_000, deck)
    await recordReview(out, 1000)
    const q = await loadTodayQueue(now)
    // cards[0] is in learning (due 10 min after), cards[1] is buried.
    expect(q.result.ids).toEqual([cards[0].id])
    expect(q.cards.get(cards[0].id)?.state).toBe(1)
  })
})

describe('retire (P7) and scheduler switch', () => {
  it('refuses to retire before three spaced successes', async () => {
    const { deck, cards } = await setup()
    await expect(setRetired(cards[0].id, true)).rejects.toSatisfy(
      (e) => e instanceof RepoError && e.code === 'retireLocked',
    )
    let c = cards[0]
    let t = now - 200 * DAY
    for (const gap of [0, 0.01, 8, 20, 50]) {
      t += gap * DAY
      const o = fsrs.answer(c, 3, t, deck)
      await recordReview(o, 1000)
      c = o.card
    }
    await setRetired(c.id, true)
    expect((await repo.getCard(c.id))?.retired).toBe(true)
    await setRetired(c.id, false)
    expect((await repo.getCard(c.id))?.retired).toBe(false)
    await expect(setRetired('missing', false)).rejects.toBeInstanceOf(RepoError)
  })

  it('converts Leitner → FSRS by replaying history, and back to boxes', async () => {
    const { deck, cards } = await setup('leitner')
    let c = cards[0]
    for (const [i, r] of [3, 3, 4].entries()) {
      const o = leitner.answer(c, r as 3 | 4, now - (20 - i * 5) * DAY, deck)
      await recordReview(o, 1000)
      c = o.card
    }
    expect(c.box).toBe(5)
    expect(await switchScheduler(deck.id, 'fsrs', now)).toBe(2)
    expect((await repo.getDeck(deck.id))?.scheduler).toBe('fsrs')
    const fsrsCard = await repo.getCard(c.id)
    expect(fsrsCard?.state).toBe(2)
    expect(fsrsCard?.stability).toBeGreaterThan(1)
    expect((await repo.getCard(cards[1].id))?.state).toBe(0)
    expect(await switchScheduler(deck.id, 'fsrs', now)).toBe(0)
    await switchScheduler(deck.id, 'leitner', now)
    expect((await repo.getCard(c.id))?.box).toBeGreaterThanOrEqual(2)
    expect((await repo.getCard(cards[1].id))?.box).toBe(0)
    await expect(switchScheduler('missing', 'fsrs', now)).rejects.toBeInstanceOf(RepoError)
  })
})

describe('loadStatsData', () => {
  it('scopes cards and reviews to a deck and its sub-decks', async () => {
    const { deck, cards } = await setup()
    const other = await repo.createDeck({ name: 'Autre' }, now)
    await repo.createNote({ deckId: other.id, modelType: 'basic', fields: ['x'], tags: [] }, now)
    await recordReview(fsrs.answer(cards[0], 3, now - 3600_000, deck), 1000)
    const { loadStatsData } = await import('$lib/db/study')
    const all = await loadStatsData(now)
    expect(all.cards).toHaveLength(3)
    expect(all.reviews).toHaveLength(1)
    const one = await loadStatsData(now, other.id)
    expect(one.cards).toHaveLength(1)
    expect(one.reviews).toHaveLength(0)
    expect(one.today).toEqual({ learning: 0, review: 0, new: 1 })
  })
})
