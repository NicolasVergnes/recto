/** Deterministic pseudo-random helpers: the same day gives the same order (03 §5 "graine = date"). */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 */
export function seededRandom(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed)
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}
