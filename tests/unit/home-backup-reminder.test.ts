import { describe, expect, it } from 'vitest'
import { BACKUP_REMINDER_DAYS } from '$lib/config/app'
import { DAY_MS } from '$lib/scheduler/day'
import { backupReminderDays } from '$lib/ui/home/backup-reminder'

const NOW = Date.UTC(2026, 2, 15, 11, 0)
const deckCreatedDaysAgo = (days: number) => ({ createdAt: NOW - days * DAY_MS })

describe('home backup reminder (P10)', () => {
  it('stays silent without any deck: there is nothing to save yet', () => {
    expect(backupReminderDays(null, [], NOW)).toBeNull()
    expect(backupReminderDays(NOW - 30 * DAY_MS, [], NOW)).toBeNull()
  })

  it('counts from the last backup once there is one', () => {
    const decks = [deckCreatedDaysAgo(100)]
    expect(backupReminderDays(NOW - 2 * DAY_MS, decks, NOW)).toBeNull()
    expect(backupReminderDays(NOW - 12 * DAY_MS, decks, NOW)).toBe(12)
    expect(backupReminderDays(NOW, decks, NOW)).toBeNull()
  })

  it('counts from the oldest deck while the data was never exported', () => {
    const decks = [deckCreatedDaysAgo(2), deckCreatedDaysAgo(20), deckCreatedDaysAgo(9)]
    expect(backupReminderDays(null, decks, NOW)).toBe(20)
    expect(backupReminderDays(null, [deckCreatedDaysAgo(3)], NOW)).toBeNull()
  })

  it('reminds strictly after the threshold, in whole days', () => {
    const limit = BACKUP_REMINDER_DAYS
    const backedUp = (days: number, extraMs = 0) => NOW - days * DAY_MS - extraMs
    const decks = [deckCreatedDaysAgo(100)]
    expect(backupReminderDays(backedUp(limit), decks, NOW)).toBeNull()
    expect(backupReminderDays(backedUp(limit, DAY_MS - 1), decks, NOW)).toBeNull()
    expect(backupReminderDays(backedUp(limit + 1), decks, NOW)).toBe(limit + 1)
    expect(backupReminderDays(backedUp(limit + 1, DAY_MS - 1), decks, NOW)).toBe(limit + 1)
    expect(backupReminderDays(null, [deckCreatedDaysAgo(limit)], NOW)).toBeNull()
    expect(backupReminderDays(null, [deckCreatedDaysAgo(limit + 1)], NOW)).toBe(limit + 1)
  })

  it('ignores a backup dated in the future (clock set back)', () => {
    expect(backupReminderDays(NOW + 3 * DAY_MS, [deckCreatedDaysAgo(100)], NOW)).toBeNull()
  })
})
