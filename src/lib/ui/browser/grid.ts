/** Mosaic layout of the card browser: tiles per row from the viewport width (pure, unit-tested). */
export type MosaicMode = 'flip' | 'both'

export const GAP_REM = 0.75
/** Narrowest tile: one face, or two faces side by side. */
export const TILE_MIN_WIDTH_REM: Readonly<Record<MosaicMode, number>> = { flip: 18, both: 26 }
export const TILE_HEIGHT_REM = 15
/** A « both » tile alone on its row stacks its faces and grows. */
export const STACKED_TILE_HEIGHT_REM = 21

/** Tiles that fit in `width` px with `gap` px between them, at least 1. */
export function columnsFor(width: number, minTile: number, gap: number): number {
  if (!(minTile > 0)) return 1
  return Math.max(1, Math.floor((width + gap) / (minTile + gap)))
}

export function tileHeightRem(mode: MosaicMode, columns: number): number {
  return mode === 'both' && columns === 1 ? STACKED_TILE_HEIGHT_REM : TILE_HEIGHT_REM
}

/** Splits `items` into rows of `size` (the last one may be shorter); never an empty row. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n))
  return rows
}
