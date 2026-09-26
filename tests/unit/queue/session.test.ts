import { describe, expect, it } from 'vitest'
import {
  afterAnswer,
  currentId,
  nextLaterDue,
  putBack,
  removeCard,
  REINSERT_GAP,
  remainingByState,
  takeDue,
} from '$lib/queue/session'

const now = 1_000_000
const limit = now + 86_400_000

describe('session queue (03 §5.7, §3.4)', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `c${i}`)

  it('moves due learning cards to the head', () => {
    const q = takeDue(
      {
        ids: ['a', 'b'],
        later: [
          { id: 'l1', due: now - 1 },
          { id: 'l2', due: now + 5 },
        ],
      },
      now,
    )
    expect(q).toEqual({ ids: ['l1', 'a', 'b'], later: [{ id: 'l2', due: now + 5 }] })
    const same = { ids: ['a'], later: [] }
    expect(takeDue(same, now)).toBe(same)
    expect(currentId(q)).toBe('l1')
  })

  it('re-inserts a failed card due now at least 10 cards later, or at the end', () => {
    const q = afterAnswer({ ids, later: [] }, 'c0', { state: 3, due: now }, now, limit)
    expect(q.ids.indexOf('c0')).toBe(REINSERT_GAP)
    const short = afterAnswer(
      { ids: ['x', 'y', 'z'], later: [] },
      'x',
      { state: 3, due: now },
      now,
      limit,
    )
    expect(short.ids).toEqual(['y', 'z', 'x'])
  })

  it('keeps later learning cards aside, and drops graduated or tomorrow cards', () => {
    const q = afterAnswer(
      { ids: ['a', 'b'], later: [{ id: 'z', due: now + 900 }] },
      'a',
      { state: 1, due: now + 600 },
      now,
      limit,
    )
    expect(q).toEqual({
      ids: ['b'],
      later: [
        { id: 'a', due: now + 600 },
        { id: 'z', due: now + 900 },
      ],
    })
    expect(nextLaterDue(q)).toBe(now + 600)
    expect(
      afterAnswer({ ids: ['a'], later: [] }, 'a', { state: 2, due: now + 9e9 }, now, limit),
    ).toEqual({ ids: [], later: [] })
    expect(
      afterAnswer({ ids: ['a'], later: [] }, 'a', { state: 1, due: limit + 1 }, now, limit),
    ).toEqual({ ids: [], later: [] })
    expect(nextLaterDue({ ids: [], later: [] })).toBeNull()
  })

  it('removes and puts back cards', () => {
    const q = { ids: ['a', 'b'], later: [{ id: 'c', due: now }] }
    expect(removeCard(q, 'c')).toEqual({ ids: ['a', 'b'], later: [] })
    expect(putBack(q, 'c')).toEqual({ ids: ['c', 'a', 'b'], later: [] })
  })

  it('counts the cards left by state, learning cards set aside included', () => {
    const cards = new Map([
      ['n', { state: 0 as const }],
      ['l', { state: 1 as const }],
      ['r', { state: 2 as const }],
      ['rl', { state: 3 as const }],
      ['n2', { state: 0 as const }],
    ])
    const q = {
      ids: ['n', 'r', 'n2', 'gone'],
      later: [
        { id: 'l', due: now + 600 },
        { id: 'rl', due: now + 900 },
      ],
    }
    expect(remainingByState(q, cards)).toEqual({ learning: 2, review: 1, new: 2 })
    expect(remainingByState({ ids: [], later: [] }, cards)).toEqual({
      learning: 0,
      review: 0,
      new: 0,
    })
  })
})
