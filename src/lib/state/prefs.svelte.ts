import { getAllSettings, setSetting, type SettingsMap, type Theme } from '../db/settings'

const THEME_KEY = 'recto.theme'

interface Prefs {
  theme: Theme
  fontScale: number
  dayStartHour: number
  swipeGestures: boolean
  loaded: boolean
}

/** Display preferences loaded from `settings` at start-up (SPEC §5.7). */
export const prefs = $state<Prefs>({
  theme: 'system',
  fontScale: 1,
  dayStartHour: 4,
  swipeGestures: false,
  loaded: false,
})

/** Applies the theme before the first paint using the localStorage mirror (IndexedDB is async). */
export function applyEarlyTheme(): void {
  try {
    const theme = localStorage.getItem(THEME_KEY)
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  } catch {
    // Storage unavailable (private mode): the system theme applies.
  }
}

function apply(): void {
  const root = document.documentElement
  if (prefs.theme === 'system') delete root.dataset.theme
  else root.dataset.theme = prefs.theme
  root.style.setProperty('--font-scale', String(prefs.fontScale))
  try {
    localStorage.setItem(THEME_KEY, prefs.theme)
  } catch {
    // Ignore: the mirror is only a convenience.
  }
}

export async function loadPrefs(): Promise<SettingsMap> {
  const all = await getAllSettings()
  prefs.theme = all.theme
  prefs.fontScale = all.fontScale
  prefs.dayStartHour = all.dayStartHour
  prefs.swipeGestures = all.swipeGestures
  prefs.loaded = true
  apply()
  return all
}

export async function setTheme(theme: Theme): Promise<void> {
  prefs.theme = theme
  apply()
  await setSetting('theme', theme)
}

export async function setFontScale(scale: number): Promise<void> {
  prefs.fontScale = scale
  apply()
  await setSetting('fontScale', scale)
}

export async function setDayStartHour(hour: number): Promise<void> {
  prefs.dayStartHour = hour
  await setSetting('dayStartHour', hour)
}

export async function setSwipeGestures(on: boolean): Promise<void> {
  prefs.swipeGestures = on
  await setSetting('swipeGestures', on)
}
