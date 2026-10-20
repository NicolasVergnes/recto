import { describe, expect, it } from 'vitest'
import { makeDeck, migrateDeckSettingsM19 } from '$lib/domain/defaults'
import {
  boxError,
  boxFromStability,
  capBox,
  customBoxOf,
  deckModel,
  intervalsOf,
  LEITNER_PRESETS,
} from '$lib/domain/leitner'
import { card } from '../../helpers/fixtures'

const SEVEN = [1, 2, 7, 30, 90, 180, 365]
const FIVE = [1, 3, 7, 14, 30]

describe('Leitner models (M19, 03 §3.2)', () => {
  it('has a seven- and a five-compartment box, and « Ma boîte »', () => {
    expect(intervalsOf('seven', [])).toEqual(SEVEN)
    expect(intervalsOf('five', [])).toEqual(FIVE)
    expect(intervalsOf('custom', [1, 4, 10])).toEqual([1, 4, 10])
    const copy = intervalsOf('seven', [])
    copy[0] = 99
    expect(LEITNER_PRESETS.seven[0]).toBe(1)
  })

  it('accepts 2 to 10 compartments of whole days, never shorter than the one before', () => {
    expect(boxError([1, 4])).toBeNull()
    expect(boxError([1, 1, 7])).toBeNull()
    expect(boxError(Array.from({ length: 10 }, (_, i) => i + 1))).toBeNull()
    expect(boxError([1])).toBe('count')
    expect(boxError(Array.from({ length: 11 }, (_, i) => i + 1))).toBe('count')
    expect(boxError([0, 2])).toBe('days')
    expect(boxError([1, 2.5])).toBe('days')
    expect(boxError([1, 36_501])).toBe('days')
    expect(boxError([1, '2'])).toBe('days')
    expect(boxError([7, 2])).toBe('order')
  })

  it('makes a deck with the chosen model, FSRS by default', () => {
    expect(makeDeck({ name: 'D' }, 'd', 0)).toMatchObject({
      scheduler: 'fsrs',
      settings: { leitner: { model: 'seven', intervals: SEVEN } },
    })
    const five = makeDeck({ name: 'D', model: { model: 'five', custom: [1, 4] } }, 'd', 0)
    expect(five).toMatchObject({ scheduler: 'leitner', settings: { leitner: { model: 'five' } } })
    expect(five.settings.leitner.intervals).toEqual(FIVE)
    const mine = makeDeck({ name: 'D', model: { model: 'custom', custom: [1, 4, 10] } }, 'd', 0)
    expect(mine.settings.leitner).toMatchObject({ model: 'custom', intervals: [1, 4, 10] })
    expect(deckModel(mine)).toBe('custom')
    expect(deckModel(makeDeck({ name: 'D' }, 'd', 0))).toBe('fsrs')
    // An unusable « Ma boîte » never reaches a deck.
    const broken = makeDeck({ name: 'D', model: { model: 'custom', custom: [5] } }, 'd', 0)
    expect(broken.settings.leitner).toMatchObject({ model: 'seven', intervals: SEVEN })
  })
})

describe('changing box (03 §4)', () => {
  it('FSRS → Leitner: the compartment whose interval is closest to the stability', () => {
    const seven: [number, number][] = [
      [0, 1],
      [1.4, 1],
      [1.42, 2],
      [3.7, 2],
      [3.75, 3],
      [14, 3],
      [15, 4],
      [20, 4],
      [51, 4],
      [53, 5],
      [126, 5],
      [128, 6],
      [255, 6],
      [257, 7],
      [9000, 7],
    ]
    for (const [s, box] of seven) expect(boxFromStability(s, SEVEN), `S = ${s}`).toBe(box)
    const five: [number, number][] = [
      [1, 1],
      [2, 2],
      [5, 3],
      [9.8, 3],
      [10, 4],
      [20, 4],
      [21, 5],
      [400, 5],
    ]
    for (const [s, box] of five) expect(boxFromStability(s, FIVE), `S = ${s}`).toBe(box)
  })

  it('Leitner → Leitner: a card keeps its compartment, at most the last, and its due date', () => {
    const c = card('c', { box: 6, state: 2, due: 5000, updatedAt: 1 })
    expect(capBox(c, 5, 99)).toMatchObject({ box: 5, due: 5000, updatedAt: 99 })
    expect(capBox(c, 7, 99)).toBeNull()
    expect(capBox(card('n'), 2, 99)).toBeNull()
  })
})

describe('M19 migration', () => {
  const stored = (intervals: unknown, updatedAt = 1) => {
    const settings: Record<string, unknown> = { leitner: { intervals, allowSure: true } }
    migrateDeckSettingsM19(settings)
    return { updatedAt, settings: settings as { leitner: { model: string; intervals: unknown } } }
  }

  it('the seven-compartment intervals follow that box, changed ones « Ma boîte »', () => {
    expect(stored(SEVEN).settings.leitner.model).toBe('seven')
    expect(stored([1, 3, 7, 30, 90, 180, 365]).settings.leitner).toEqual({
      model: 'custom',
      intervals: [1, 3, 7, 30, 90, 180, 365],
      allowSure: true,
    })
    const none: Record<string, unknown> = {}
    migrateDeckSettingsM19(none)
    expect(none).toEqual({})
  })

  it('« Ma boîte » takes the intervals of the most recently changed deck', () => {
    expect(customBoxOf([stored(SEVEN)])).toBeNull()
    expect(
      customBoxOf([stored([2, 3, 7, 30, 90, 180, 365], 5), stored([1, 3, 7, 30, 90, 180, 365], 9)]),
    ).toEqual([1, 3, 7, 30, 90, 180, 365])
    // Intervals that « Ma boîte » cannot hold stay in their deck only.
    expect(customBoxOf([stored([9, 3, 7, 30, 90, 180, 365], 5)])).toBeNull()
  })
})
