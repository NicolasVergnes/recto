import { DEFAULT_DAY_START_HOUR, DEFAULT_GLOBAL_REVIEWS_PER_DAY } from '../config/app'
import { db } from './schema'

export type Theme = 'system' | 'light' | 'dark'

/** Typed view of the `settings` table (02-DATA-MODEL §2, reserved keys + session additions). */
export interface SettingsMap {
  dayStartHour: number
  theme: Theme
  fontScale: number
  lastBackupAt: number | null
  persistGranted: boolean | null
  onboardingDone: boolean
  globalReviewsPerDay: number
  /** Editor remembers the last deck used (04-UI §2.3). */
  lastDeckId: string | null
  /** Local day (YYYY-MM-DD) when the sleep tip was last shown (srs-rules §1). */
  sleepTipDay: string | null
  /** Swipe gestures in review (04-UI §2.2), off by default. */
  swipeGestures: boolean
}

export const DEFAULT_SETTINGS: SettingsMap = {
  dayStartHour: DEFAULT_DAY_START_HOUR,
  theme: 'system',
  fontScale: 1,
  lastBackupAt: null,
  persistGranted: null,
  onboardingDone: false,
  globalReviewsPerDay: DEFAULT_GLOBAL_REVIEWS_PER_DAY,
  lastDeckId: null,
  sleepTipDay: null,
  swipeGestures: false,
}

export type SettingKey = keyof SettingsMap

const THEMES: readonly string[] = ['system', 'light', 'dark']

/** Runtime validation: settings come from IndexedDB or backups (`unknown`). */
function isValid<K extends SettingKey>(key: K, value: unknown): value is SettingsMap[K] {
  switch (key) {
    case 'dayStartHour':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23
    case 'fontScale':
      return typeof value === 'number' && value >= 0.75 && value <= 2
    case 'globalReviewsPerDay':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0
    case 'theme':
      return typeof value === 'string' && THEMES.includes(value)
    case 'lastBackupAt':
      return value === null || typeof value === 'number'
    case 'persistGranted':
      return value === null || typeof value === 'boolean'
    case 'onboardingDone':
    case 'swipeGestures':
      return typeof value === 'boolean'
    case 'lastDeckId':
    case 'sleepTipDay':
      return value === null || typeof value === 'string'
    default:
      return false
  }
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.settings.get(key)
  return row && isValid(key, row.value) ? row.value : DEFAULT_SETTINGS[key]
}

export async function getAllSettings(): Promise<SettingsMap> {
  const rows = await db.settings.toArray()
  const out: SettingsMap = { ...DEFAULT_SETTINGS }
  for (const row of rows) if (isSettingKey(row.key)) assign(out, row.key, row.value)
  return out
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(DEFAULT_SETTINGS, key)
}

function assign<K extends SettingKey>(out: SettingsMap, key: K, value: unknown) {
  if (isValid(key, value)) out[key] = value
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  await db.settings.put({ key, value })
}
