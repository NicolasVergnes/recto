import { describe, expect, it } from 'vitest'
import {
  chunk,
  columnsFor,
  fitZoom,
  imageCap,
  MIN_FIT_ZOOM,
  tileHeightRem,
  tileMinWidthRem,
} from '$lib/ui/browser/grid'

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
    expect(tileHeightRem('both', 1, 'medium')).toBe(21)
    expect(tileHeightRem('both', 2, 'medium')).toBe(15)
    expect(tileHeightRem('flip', 1, 'medium')).toBe(15)
  })

  it('grows with the tile size; small tiles give two columns on a phone', () => {
    for (const mode of ['flip', 'both'] as const) {
      expect(tileMinWidthRem(mode, 'small')).toBeLessThan(tileMinWidthRem(mode, 'medium'))
      expect(tileMinWidthRem(mode, 'medium')).toBeLessThan(tileMinWidthRem(mode, 'large'))
      for (const columns of [1, 2]) {
        expect(tileHeightRem(mode, columns, 'small')).toBeLessThan(
          tileHeightRem(mode, columns, 'medium'),
        )
        expect(tileHeightRem(mode, columns, 'medium')).toBeLessThan(
          tileHeightRem(mode, columns, 'large'),
        )
      }
    }
    // Pixel 7: 412 px wide, about 380 px for the mosaic.
    expect(columnsFor(380, tileMinWidthRem('flip', 'small') * 16, 12)).toBe(2)
    expect(columnsFor(380, tileMinWidthRem('flip', 'medium') * 16, 12)).toBe(1)
  })

  it('zooms content out to fit its face, without a readable floor', () => {
    expect(fitZoom(100, 200)).toBe(1)
    expect(fitZoom(200, 200)).toBe(1)
    expect(fitZoom(300, 200)).toBe(0.66)
    expect(fitZoom(1000, 200)).toBe(0.2)
    expect(fitZoom(100_000, 200)).toBe(MIN_FIT_ZOOM)
    expect(fitZoom(0, 200)).toBe(1)
    expect(fitZoom(300, 0)).toBe(1)
    expect(fitZoom(Number.NaN, 200)).toBe(1)
    // Never rounds up past the available height.
    expect(fitZoom(3, 2) * 3).toBeLessThanOrEqual(2)
  })

  it('shrinks the images first, so that the text beside them fits', () => {
    // 200 px face, 50 px of text and one 300 px image: the image gets the remaining 150 px.
    expect(imageCap(200, 350, 300, 1)).toBe(150)
    // Two stacked images share it.
    expect(imageCap(200, 350, 300, 2)).toBe(75)
    // Too much text: the image keeps a fifth of the face (the zoom does the rest).
    expect(imageCap(200, 400, 100, 1)).toBe(40)
    expect(imageCap(0, 100, 50, 1)).toBe(0)
    expect(imageCap(200, 100, 50, 0)).toBe(200)
  })
})
