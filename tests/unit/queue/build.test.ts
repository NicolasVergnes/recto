import { describe, expect, it } from 'vitest'
import type { Card, Deck } from '$lib/domain/types'
import { buildQueue, interleaveNew, type QueueInput, type TodayReview } from '$lib/queue/build'
import { seededShuffle } from '$lib/queue/random'
import { getScheduler } from '$lib/scheduler'
import { card, deck, paris } from '../../helpers/fixtures'

const DAY = 86_400_000
const MIN = 60_000
const now = paris('2026-09-25T08:00:00Z') // 10:00 local
const fsrs = getScheduler('fsrs', { fuzz: false })

function input(decks: Deck[], cards: Card[], extra: Partial<QueueInput> = {}): QueueInput {
  const byId = new Map(decks.map((d) => [d.id, d]))
  return {
    now,
    dayStartHour: 4,
    decks,
    cards,
    todayReviews: [],
    globalReviewsPerDay: 500,
    retrievability: (c) => fsrs.retrievability(c, now, byId.get(c.deckId) ?? decks[0] ?? deck('x')),
    ...extra,
  }
}

const review = (id: string, patch: Partial<Card> = {}, deckId = 'd1') =>
  card(
    id,
    {
      state: 2,
      due: now - 3600_000,
      stability: 10,
      difficulty: 5,
      lastReview: now - 10 * DAY,
      ...patch,
    },
    `n-${id}`,
    deckId,
  )
const fresh = (id: string, createdAt: number, deckId = 'd1', noteId = `n-${id}`, ord = 0) =>
  card(id, { createdAt, due: createdAt, ord }, noteId, deckId)
const pad = (i: number) => String(i).padStart(2, '0')
const sorted = (ids: readonly string[]) => [...ids].sort()

describe('buildQueue (03 §5)', () => {
  it('returns an empty queue for an empty deck', () => {
    const q = buildQueue(input([deck('d1')], []))
    expect(q).toMatchObject({ ids: [], later: [], counts: { learning: 0, review: 0, new: 0 } })
    expect(new Date(q.dueLimit).toISOString()).toBe('2026-09-26T02:00:00.000Z')
  })

  it('orders learning, then reviews, then new cards; later learning is handed over', () => {
    const cards = [
      fresh('new1', now - 5 * DAY),
      review('rev1'),
      card('learn2', { state: 1, due: now - 2 * MIN }),
      card('learn1', { state: 3, due: now - 5 * MIN }),
      card('learnLater', { state: 1, due: now + 10 * MIN }),
      card('learnTomorrow', { state: 1, due: now + DAY }),
    ]
    const q = buildQueue(input([deck('d1')], cards))
    expect(sorted(q.ids.slice(0, 2))).toEqual(['learn1', 'learn2'])
    expect(q.ids.slice(2)).toEqual(['rev1', 'new1'])
    expect(q.later).toEqual([{ id: 'learnLater', due: now + 10 * MIN }])
    expect(q.counts).toEqual({ learning: 2, review: 1, new: 1 })
  })

  it('never includes suspended or retired cards (invariant 4)', () => {
    const cards = [
      review('a', { suspended: true }),
      review('b', { retired: true }),
      fresh('c', 0, 'd1', 'n', 0),
    ]
    const q = buildQueue(input([deck('d1')], [...cards, { ...fresh('d', 0), suspended: true }]))
    expect(q.ids).toEqual(['c'])
  })

  it('ignores cards of unselected decks and future reviews', () => {
    const q = buildQueue(
      input([deck('d1')], [review('a', {}, 'other'), review('b', { due: now + 2 * DAY })]),
    )
    expect(q.ids).toEqual([])
  })

  it('P6: caps new cards per deck, minus those introduced today; 0 means none', () => {
    const d = deck('d1', 'fsrs', { newPerDay: 3, newOrder: 'added' })
    const cards = Array.from({ length: 10 }, (_, i) => fresh(`n${i}`, now - (10 - i) * DAY))
    expect(buildQueue(input([d], cards)).ids).toEqual(['n0', 'n1', 'n2'])
    const seen: TodayReview[] = [{ cardId: 'x', deckId: 'd1', stateBefore: 0 }]
    expect(buildQueue(input([d], cards, { todayReviews: seen })).ids).toEqual(['n0', 'n1'])
    expect(buildQueue(input([deck('d1', 'fsrs', { newPerDay: 0 })], cards)).ids).toEqual([])
  })

  it('P6: caps reviews per deck and globally, counting those done today', () => {
    const d = deck('d1', 'fsrs', { reviewsPerDay: 4 })
    const cards = Array.from({ length: 10 }, (_, i) => review(`r${i}`))
    expect(buildQueue(input([d], cards)).counts.review).toBe(4)
    const done: TodayReview[] = [{ cardId: 'z', deckId: 'd1', stateBefore: 2 }]
    expect(buildQueue(input([d], cards, { todayReviews: done })).counts.review).toBe(3)
    expect(buildQueue(input([deck('d1')], cards, { globalReviewsPerDay: 2 })).counts.review).toBe(2)
    expect(
      buildQueue(input([deck('d1')], cards, { globalReviewsPerDay: 1, todayReviews: done })).counts
        .review,
    ).toBe(0)
  })

  it('P6: a capped deck keeps its overdue FSRS reviews of lowest retrievability', () => {
    const cards = [
      review('fresh', { due: now - DAY, lastReview: now - 11 * DAY, stability: 10 }),
      review('late100', { due: now - 100 * DAY, lastReview: now - 110 * DAY, stability: 10 }),
      review('weak', { due: now - 2 * DAY, lastReview: now - 12 * DAY, stability: 3 }),
      review('today', { due: now - MIN }),
    ]
    const capped = buildQueue(input([deck('d1', 'fsrs', { reviewsPerDay: 2 })], cards)).ids
    expect(sorted(capped)).toEqual(['late100', 'weak'])
    const roomy = buildQueue(input([deck('d1', 'fsrs', { reviewsPerDay: 4 })], cards)).ids
    expect(sorted(roomy.slice(0, 3))).toEqual(['fresh', 'late100', 'weak'])
    expect(roomy[3]).toBe('today')
  })

  it('P6: a capped deck keeps its overdue Leitner reviews of lowest box, then due', () => {
    const cards = [
      review('b3', { box: 3, due: now - 3 * DAY }),
      review('b1late', { box: 1, due: now - 2 * DAY }),
      review('b1early', { box: 1, due: now - 5 * DAY }),
    ]
    const capped = buildQueue(input([deck('d1', 'leitner', { reviewsPerDay: 2 })], cards)).ids
    expect(sorted(capped)).toEqual(['b1early', 'b1late'])
  })

  it("M13: overdue reviews come first, then today's, each batch in a stable random order", () => {
    const overdue = Array.from({ length: 20 }, (_, i) =>
      review(`o${pad(i)}`, { due: now - (i + 1) * DAY, lastReview: now - (i + 30) * DAY, box: 1 }),
    )
    const today = Array.from({ length: 20 }, (_, i) => review(`t${pad(i)}`, { due: now - MIN }))
    for (const d of [deck('d1'), deck('d1', 'leitner')]) {
      const cards = [...today, ...overdue]
      const ids = buildQueue(input([d], cards)).ids
      expect(sorted(ids.slice(0, 20))).toEqual(overdue.map((c) => c.id))
      expect(sorted(ids.slice(20))).toEqual(today.map((c) => c.id))
      // Neither by retrievability, box nor due date: random, whatever the input order.
      expect(ids.slice(0, 20)).not.toEqual(overdue.map((c) => c.id))
      expect(ids.slice(0, 20)).not.toEqual(overdue.map((c) => c.id).reverse())
      expect(buildQueue(input([d], [...cards].reverse())).ids).toEqual(ids)
    }
  })

  it("shuffles today's reviews with a stable daily seed", () => {
    const cards = Array.from({ length: 30 }, (_, i) => review(`r${pad(i)}`, { due: now - MIN }))
    const a = buildQueue(input([deck('d1')], cards)).ids
    const b = buildQueue(input([deck('d1')], [...cards].reverse())).ids
    expect(a).toEqual(b)
    expect(a).not.toEqual(sorted(a))
    const tomorrow = buildQueue(
      input(
        [deck('d1')],
        cards.map((c) => ({ ...c, due: now + DAY - MIN })),
        { now: now + DAY },
      ),
    ).ids
    expect(tomorrow).not.toEqual(a)
  })

  it('M13: shuffles the learning cards due now with a stable daily seed', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`l${pad(i)}`, { state: 1, due: now - (i + 1) * MIN }),
    )
    const ids = buildQueue(input([deck('d1')], cards)).ids
    expect(sorted(ids)).toEqual(cards.map((c) => c.id))
    expect(ids).not.toEqual([...cards].sort((a, b) => a.due - b.due).map((c) => c.id))
    expect(buildQueue(input([deck('d1')], [...cards].reverse())).ids).toEqual(ids)
  })

  it('P5: interleaves decks round-robin and spreads new cards every k reviews', () => {
    const d1 = deck('d1')
    const d2 = deck('d2')
    const cards = [
      review('a1', { due: now - 3 * DAY, lastReview: now - 30 * DAY }, 'd1'),
      review('a2', { due: now - 2 * DAY, lastReview: now - 20 * DAY }, 'd1'),
      review('b1', { due: now - 3 * DAY, lastReview: now - 30 * DAY }, 'd2'),
      review('b2', { due: now - 2 * DAY, lastReview: now - 20 * DAY }, 'd2'),
      fresh('na', now - DAY, 'd1'),
      fresh('nb', now - DAY, 'd2'),
    ]
    const q = buildQueue(input([d1, d2], cards))
    expect(q.ids.map((id) => id.replace(/\d/, ''))).toEqual(['a', 'b', 'na', 'a', 'b', 'nb'])
  })

  it('M13: cards of a note share the day, neither buried nor spaced', () => {
    const cards = [
      fresh('c0', now - DAY, 'd1', 'note', 0),
      fresh('c1', now - DAY, 'd1', 'note', 1),
      fresh('c2', now - DAY, 'd1', 'note', 2),
    ]
    expect(sorted(buildQueue(input([deck('d1')], cards)).ids)).toEqual(['c0', 'c1', 'c2'])
    const answered: TodayReview[] = [{ cardId: 'c0', deckId: 'd1', stateBefore: 0 }]
    const rest = buildQueue(input([deck('d1')], cards.slice(1), { todayReviews: answered })).ids
    expect(sorted(rest)).toEqual(['c1', 'c2'])
    const mixed = [card('l', { state: 1, due: now - MIN }, 'note2'), review('r', {}, 'd1')]
    mixed[1] = { ...mixed[1], noteId: 'note2' } as Card
    expect(buildQueue(input([deck('d1')], mixed)).ids).toEqual(['l', 'r'])
  })

  it('M13: picks new cards at random by default, or by creation (seeded)', () => {
    const cards = Array.from({ length: 12 }, (_, i) => fresh(`n${pad(i)}`, now - (20 - i) * DAY))
    const added = buildQueue(input([deck('d1', 'fsrs', { newOrder: 'added' })], cards)).ids
    expect(added).toEqual(sorted(added))
    const random = buildQueue(input([deck('d1')], cards)).ids
    expect(random).not.toEqual(added)
    expect(sorted(random)).toEqual(sorted(added))
    expect(buildQueue(input([deck('d1')], [...cards].reverse())).ids).toEqual(random)
  })

  it('changes day at 04:00 local time', () => {
    const tomorrowEarly = paris('2026-09-26T01:30:00Z') // 03:30 local, still "today"
    const tomorrowDay = paris('2026-09-26T02:30:00Z') // 04:30 local
    const c = review('r', { due: tomorrowEarly })
    expect(buildQueue(input([deck('d1')], [c])).ids).toEqual(['r'])
    const beforeFour = paris('2026-09-26T01:59:00Z')
    const nextMorning = review('m', { due: tomorrowDay })
    expect(buildQueue(input([deck('d1')], [nextMorning], { now: beforeFour })).ids).toEqual([])
    expect(
      buildQueue(input([deck('d1')], [nextMorning], { now: paris('2026-09-26T02:00:00Z') })).ids,
    ).toEqual(['m'])
  })

  it('handles the daylight-saving night (Europe/Paris)', () => {
    const night = paris('2026-10-24T20:00:00Z') // Saturday 22:00 local, clocks go back at 03:00
    const q = buildQueue(
      input([deck('d1')], [review('r', { due: paris('2026-10-25T02:30:00Z') })], { now: night }),
    )
    // 25 Oct 02:30 UTC = 03:30 winter time, before 04:00: still Saturday's study day.
    expect(q.ids).toEqual(['r'])
    expect(new Date(q.dueLimit).toISOString()).toBe('2026-10-25T03:00:00.000Z')
  })

  it('builds the queue for 20 000 cards in less than 200 ms', () => {
    const decks = Array.from({ length: 5 }, (_, i) => deck(`d${i}`, i % 2 ? 'leitner' : 'fsrs'))
    const cards: Card[] = []
    for (let i = 0; i < 20_000; i++) {
      const deckId = `d${i % 5}`
      const kind = i % 4
      if (kind === 0) cards.push(fresh(`c${i}`, now - i * MIN, deckId))
      else
        cards.push(
          review(
            `c${i}`,
            {
              due: now + (i % 60) * DAY - 30 * DAY,
              lastReview: now - 40 * DAY,
              stability: 1 + (i % 50),
              box: 1 + (i % 7),
            },
            deckId,
          ),
        )
    }
    buildQueue(input(decks, cards)) // warm-up
    const t0 = performance.now()
    const q = buildQueue(input(decks, cards))
    const elapsed = performance.now() - t0
    expect(q.counts.review).toBe(500)
    expect(q.counts.new).toBe(100)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('queue helpers', () => {
  it('interleaves new cards every k reviews', () => {
    expect(interleaveNew(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2'])).toEqual([
      'r1',
      'r2',
      'n1',
      'r3',
      'r4',
      'n2',
    ])
    expect(interleaveNew(['r1'], ['n1', 'n2', 'n3'])).toEqual(['r1', 'n1', 'n2', 'n3'])
    expect(interleaveNew([], ['n1'])).toEqual(['n1'])
    expect(interleaveNew(['r1'], [])).toEqual(['r1'])
  })

  it('shuffles deterministically', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 'x')).toEqual(seededShuffle([1, 2, 3, 4, 5], 'x'))
    expect(seededShuffle([], 'x')).toEqual([])
  })
})

describe('buildQueue edge cases', () => {
  it('counts several answers per deck', () => {
    const d = deck('d1', 'fsrs', { newPerDay: 3, reviewsPerDay: 5 })
    const cards = [
      ...Array.from({ length: 5 }, (_, i) => fresh(`n${i}`, now - (10 - i) * DAY)),
      ...Array.from({ length: 6 }, (_, i) => review(`r${i}`)),
    ]
    const todayReviews: TodayReview[] = [
      { cardId: 'a', deckId: 'd1', stateBefore: 0 },
      { cardId: 'b', deckId: 'd1', stateBefore: 0 },
      { cardId: 'a', deckId: 'd1', stateBefore: 1 },
      { cardId: 'c', deckId: 'd1', stateBefore: 2 },
      { cardId: 'e', deckId: 'd1', stateBefore: 2 },
    ]
    const q = buildQueue(input([d], cards, { todayReviews }))
    expect(q.counts).toEqual({ learning: 0, review: 3, new: 1 })
  })

  it('sorts later learning cards and breaks ties deterministically', () => {
    const cards = [
      card('l2', { state: 1, due: now + 20 * MIN }),
      card('l1', { state: 3, due: now + 5 * MIN }),
      fresh('b', now - DAY, 'd1', 'nb', 0),
      fresh('a', now - DAY, 'd1', 'na', 0),
      review('noR', { lastReview: null, due: now - 3 * DAY }),
      review('withR', { due: now - 3 * DAY, lastReview: now - 4 * DAY, stability: 100 }),
    ]
    const d = deck('d1', 'fsrs', { newOrder: 'added', reviewsPerDay: 1 })
    const q = buildQueue(input([d], cards))
    expect(q.later.map((l) => l.id)).toEqual(['l1', 'l2'])
    // Unknown R counts as 0 under the cap; equal creation dates fall back to id; k = 1.
    expect(q.ids).toEqual(['noR', 'a', 'b'])
  })
})
