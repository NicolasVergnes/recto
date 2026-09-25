/**
 * Application-wide constants. The product name lives here only (SPEC header):
 * `vite.config.ts` (manifest, <title>) and `i18n/fr.ts` read it from this file.
 */
export const APP_NAME = 'Recto'
export const APP_DESCRIPTION = 'Flashcards à répétition espacée, hors ligne, sans compte.'
export const THEME_COLOR = '#0e6f66'

declare const __APP_VERSION__: string | undefined
/** Injected by Vite `define` from package.json; falls back when evaluated outside Vite. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** Local hour at which a new study day starts (SPEC §5.3, like Anki). */
export const DEFAULT_DAY_START_HOUR = 4
/** Global cap on reviews per day across all decks (02-DATA-MODEL, settings key). */
export const DEFAULT_GLOBAL_REVIEWS_PER_DAY = 500
/** Backup reminder threshold (SPEC §5.5). */
export const BACKUP_REMINDER_DAYS = 7
/** Storage usage ratio that triggers a warning (SPEC §6). */
export const QUOTA_WARNING_RATIO = 0.8
