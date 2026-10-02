/** Mosaic layout of the card browser: tiles per row from the viewport width (pure, unit-tested). */
import type { TileSize } from '$lib/db/settings'

export type MosaicMode = 'flip' | 'both'

export const GAP_REM = 0.75

interface TileDims {
  /** Narrowest tile: one face, or two faces side by side. */
  minWidth: Readonly<Record<MosaicMode, number>>
  height: number
  /** A « both » tile alone on its row stacks its faces and grows. */
  stackedHeight: number
}

/** « Petites » fit two columns on a phone; « Moyennes » is the M7 size. */
export const TILE_DIMS_REM: Readonly<Record<TileSize, TileDims>> = {
  small: { minWidth: { flip: 11, both: 20 }, height: 12, stackedHeight: 17 },
  medium: { minWidth: { flip: 18, both: 26 }, height: 15, stackedHeight: 21 },
  large: { minWidth: { flip: 24, both: 34 }, height: 20, stackedHeight: 28 },
}

/** Technical floor only: a face never scrolls, its content shrinks as much as needed. */
export const MIN_FIT_ZOOM = 0.05
/** Share of the face an image keeps at least when it makes room for the text. */
export const MIN_IMAGE_SHARE = 0.2

/** Tiles that fit in `width` px with `gap` px between them, at least 1. */
export function columnsFor(width: number, minTile: number, gap: number): number {
  if (!(minTile > 0) || !Number.isFinite(width) || !Number.isFinite(gap)) return 1
  return Math.max(1, Math.floor((width + gap) / (minTile + gap)))
}

export function tileMinWidthRem(mode: MosaicMode, size: TileSize): number {
  return TILE_DIMS_REM[size].minWidth[mode]
}

export function tileHeightRem(mode: MosaicMode, columns: number, size: TileSize): number {
  const dims = TILE_DIMS_REM[size]
  return mode === 'both' && columns === 1 ? dims.stackedHeight : dims.height
}

/**
 * Zoom that makes content of height `natural` fit in `available` (px, both measured at zoom 1):
 * 1 when it already fits, never below `MIN_FIT_ZOOM`. Zooming out also widens the text lines,
 * so the zoomed content is at most `available` high.
 */
export function fitZoom(natural: number, available: number): number {
  if (!(natural > 0) || !(available > 0) || natural <= available) return 1
  return Math.max(MIN_FIT_ZOOM, Math.floor((available / natural) * 100) / 100)
}

/**
 * Height cap (px) of each image of a face, so that the text beside them fits in `available`:
 * images shrink before anything else (they are assumed stacked). `content` and `images` are
 * heights measured with the images uncapped; never below `MIN_IMAGE_SHARE` of the face.
 */
export function imageCap(
  available: number,
  content: number,
  images: number,
  count: number,
): number {
  if (!(available > 0) || !(count >= 1)) return Math.max(0, available)
  const text = Math.max(0, content - images)
  return Math.max(available * MIN_IMAGE_SHARE, (available - text) / count)
}

/** Splits `items` into rows of `size` (the last one may be shorter); never an empty row. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n))
  return rows
}
