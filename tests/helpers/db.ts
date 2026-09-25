import { afterEach, beforeEach } from 'vitest'
import { RectoDB, useDatabase } from '$lib/db/schema'

/** Gives each test a fresh, uniquely named fake-indexeddb database (dexie-local-first §6). */
export function useTestDatabase(): { readonly db: RectoDB } {
  const holder: { db: RectoDB } = { db: new RectoDB(`test-${crypto.randomUUID()}`) }
  beforeEach(() => {
    holder.db = new RectoDB(`test-${crypto.randomUUID()}`)
    useDatabase(holder.db)
  })
  afterEach(async () => {
    await holder.db.delete()
  })
  return holder
}
