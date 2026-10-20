import { DEFAULT_DAY_START_HOUR, DEFAULT_GLOBAL_REVIEWS_PER_DAY } from '../config/app'
import { isBox, LEITNER_PRESETS, type ModelChoice } from '../domain/leitner'
import { DECK_MODELS, type DeckModel } from '../domain/types'
import { db, newId } from './schema'

export type Theme = 'system' | 'light' | 'dark'
/** Card browser layout (SPEC §5.2): table, tiles showing one face, tiles showing both faces. */
export type BrowserView = 'list' | 'flip' | 'both'
/** Flip transition of the browser tiles (04-UI §4); `none` is always available. */
export type FlipStyle = 'none' | 'horizontal' | 'vertical' | 'fade' | 'slide'
/** Tile size of the browser mosaic (« Taille » in the mosaic bar). */
export type TileSize = 'small' | 'medium' | 'large'

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
  /** Card browser layout, remembered silently like `lastDeckId`. */
  browserView: BrowserView
  /** Flip animation of the browser tiles (Settings › Affichage). */
  flipStyle: FlipStyle
  /** Mosaic tile size, remembered silently like `browserView`. */
  tileSize: TileSize
  /** This device, in backups (M12): created on first use, renewed by « Tout effacer ». */
  deviceId: string | null
  /** M19: how new decks are scheduled, imports included (Paramètres › Planification). */
  newDeckModel: DeckModel
  /** M19: intervals of « Ma boîte », the user's own Leitner box (domain/leitner.ts). */
  leitnerCustom: readonly number[]
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
  browserView: 'list',
  flipStyle: 'horizontal',
  tileSize: 'medium',
  deviceId: null,
  newDeckModel: 'fsrs',
  leitnerCustom: LEITNER_PRESETS.seven,
}

export type SettingKey = keyof SettingsMap

/**
 * Settings of the collection, not of the device (M12): merged between devices (the most recent
 * value wins). All the others belong to this device and never come from another one.
 */
export const SHARED_SETTINGS: ReadonlySet<string> = new Set<SettingKey>([
  'dayStartHour',
  'globalReviewsPerDay',
  'newDeckModel',
  'leitnerCustom',
])

const THEMES: readonly string[] = ['system', 'light', 'dark']
const BROWSER_VIEWS: readonly string[] = ['list', 'flip', 'both']
const FLIP_STYLES: readonly string[] = ['none', 'horizontal', 'vertical', 'fade', 'slide']
const TILE_SIZES: readonly string[] = ['small', 'medium', 'large']
const MODELS: readonly string[] = DECK_MODELS

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
    case 'deviceId':
      return value === null || typeof value === 'string'
    case 'browserView':
      return typeof value === 'string' && BROWSER_VIEWS.includes(value)
    case 'flipStyle':
      return typeof value === 'string' && FLIP_STYLES.includes(value)
    case 'tileSize':
      return typeof value === 'string' && TILE_SIZES.includes(value)
    case 'newDeckModel':
      return typeof value === 'string' && MODELS.includes(value)
    case 'leitnerCustom':
      return isBox(value)
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
  now = Date.now(),
): Promise<void> {
  await db.settings.put(SHARED_SETTINGS.has(key) ? { key, value, updatedAt: now } : { key, value })
}

/** How a new deck is scheduled (M19): the chosen model, with the intervals of « Ma boîte ». */
export async function newDeckModel(): Promise<ModelChoice> {
  return { model: await getSetting('newDeckModel'), custom: await getSetting('leitnerCustom') }
}

/** This device's id, created and stored on first use. */
export async function getDeviceId(): Promise<string> {
  const known = await getSetting('deviceId')
  if (known) return known
  const id = newId()
  await setSetting('deviceId', id)
  return id
}
