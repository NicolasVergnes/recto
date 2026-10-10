import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSetting } from '$lib/db/settings'
import { requestPersistenceOnce } from '$lib/db/storage'
import { useTestDatabase } from '../../helpers/db'

useTestDatabase()

function stubPersist(persist: () => Promise<boolean>) {
  vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
  return persist
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPersistenceOnce', () => {
  it('asks once and stores the answer', async () => {
    const persist = stubPersist(vi.fn(async () => true))
    expect(await requestPersistenceOnce()).toBe(true)
    expect(await getSetting('persistGranted')).toBe(true)
    expect(await requestPersistenceOnce()).toBeNull()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('records the request before an answer that never comes (Firefox prompt)', async () => {
    const persist = stubPersist(vi.fn(() => new Promise<boolean>(() => {})))
    void requestPersistenceOnce()
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
    expect(await getSetting('persistGranted')).toBe(false)
    expect(await requestPersistenceOnce()).toBeNull()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does nothing without the storage API', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined })
    expect(await requestPersistenceOnce()).toBeNull()
    expect(await getSetting('persistGranted')).toBeNull()
  })
})
