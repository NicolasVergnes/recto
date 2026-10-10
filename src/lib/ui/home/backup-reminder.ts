import { BACKUP_REMINDER_DAYS } from '$lib/config/app'
import type { Deck } from '$lib/domain/types'
import { DAY_MS } from '$lib/scheduler/day'

/**
 * P10: whole days without a backup once the reminder is due, otherwise null. The reminder comes
 * after `BACKUP_REMINDER_DAYS` days without export, counted from the oldest deck when the data
 * was never exported. Nothing to save, nothing to remind.
 */
export function backupReminderDays(
  lastBackupAt: number | null,
  decks: readonly Pick<Deck, 'createdAt'>[],
  now: number,
): number | null {
  if (decks.length === 0) return null
  const since = lastBackupAt ?? Math.min(...decks.map((d) => d.createdAt))
  const days = Math.floor((now - since) / DAY_MS)
  return days > BACKUP_REMINDER_DAYS ? days : null
}
