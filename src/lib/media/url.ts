import { db } from '../db/schema'

/** Object URLs for stored media, revoked on eviction (dexie-local-first §4). The mosaic of the
 * card browser can show up to ≈ 80 faces at once on a large screen: the cap stays well above. */
const MAX_URLS = 200
const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

export function mediaUrl(name: string): Promise<string | null> {
  const hit = cache.get(name)
  if (hit) {
    cache.delete(name)
    cache.set(name, hit)
    return Promise.resolve(hit)
  }
  let p = pending.get(name)
  if (!p) {
    p = load(name).finally(() => pending.delete(name))
    pending.set(name, p)
  }
  return p
}

async function load(name: string): Promise<string | null> {
  const media = await db.media.get(name)
  if (!media) return null
  const url = URL.createObjectURL(media.blob)
  cache.set(name, url)
  while (cache.size > MAX_URLS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    forgetMediaUrl(oldest)
  }
  return url
}

export function forgetMediaUrl(name: string): void {
  const url = cache.get(name)
  if (url) URL.revokeObjectURL(url)
  cache.delete(name)
}

export function clearMediaUrls(): void {
  for (const name of [...cache.keys()]) forgetMediaUrl(name)
}

export function cachedUrlCount(): number {
  return cache.size
}
