import { describe, expect, it } from 'vitest'
import { chunk, columnsFor, tileHeightRem } from '$lib/ui/browser/grid'

describe('mosaic grid', () => {
  it('counts the tiles that fit, at least one', () => {
    expect(columnsFor(0, 224, 12)).toBe(1)
    expect(columnsFor(223, 224, 12)).toBe(1)
    expect(columnsFor(224, 224, 12)).toBe(1)
    expect(columnsFor(460, 224, 12)).toBe(2)
    expect(columnsFor(1120, 224, 12)).toBe(4)
    expect(columnsFor(380, 384, 12)).toBe(1)
    expect(columnsFor(1120, 384, 12)).toBe(2)
    expect(columnsFor(500, 0, 12)).toBe(1)
    expect(columnsFor(500, Number.NaN, 12)).toBe(1)
    expect(columnsFor(500, 224, Number.NaN)).toBe(1)
    expect(columnsFor(Number.NaN, 224, 12)).toBe(1)
    expect(columnsFor(-100, 224, 12)).toBe(1)
  })

  it('chunks rows without empty rows and without losing items', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
    expect(chunk([1], 0)).toEqual([[1]])
    expect(chunk([1], Number.NaN)).toEqual([[1]])
    expect(chunk([1, 2, 3], 2.9)).toEqual([[1, 2], [3]])
    const items = Array.from({ length: 23 }, (_, i) => i)
    const rows = chunk(items, 4)
    expect(rows.every((r) => r.length > 0)).toBe(true)
    expect(rows.flat()).toEqual(items)
  })

  it('stacks the two faces when a « both » tile is alone on its row', () => {
    expect(tileHeightRem('both', 1)).toBe(21)
    expect(tileHeightRem('both', 2)).toBe(15)
    expect(tileHeightRem('flip', 1)).toBe(15)
  })
})
