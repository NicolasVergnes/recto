import { getSetting, setSetting } from './settings'

export interface StorageInfo {
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

/** `navigator.storage` state for the Settings screen (06 §2). */
export async function storageInfo(): Promise<StorageInfo> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  const estimate = storage?.estimate ? await storage.estimate().catch(() => null) : null
  const persisted = storage?.persisted ? await storage.persisted().catch(() => null) : null
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted }
}

export function usageRatio(info: StorageInfo): number | null {
  return info.usage !== null && info.quota ? info.usage / info.quota : null
}

/** Asks the browser to keep our data under storage pressure; stores the answer. */
export async function requestPersistence(): Promise<boolean | null> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persist) return null
  const granted = await storage.persist().catch(() => false)
  await setSetting('persistGranted', granted)
  return granted
}

/**
 * SPEC §6: persistence is requested once, right after the first card is created. The request
 * is recorded before its answer: Firefox asks the user and settles `persist()` only when they
 * reply, maybe never, so callers must not wait for it (the editor does not).
 */
export async function requestPersistenceOnce(): Promise<boolean | null> {
  if ((await getSetting('persistGranted')) !== null) return null
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
  await setSetting('persistGranted', false)
  return requestPersistence()
}
