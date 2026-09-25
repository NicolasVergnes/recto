import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getAllSettings,
  getSetting,
  isSettingKey,
  setSetting,
} from '$lib/db/settings'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()

describe('settings', () => {
  it('returns defaults, stored values, and rejects invalid stored values', async () => {
    expect(await getSetting('dayStartHour')).toBe(4)
    await setSetting('dayStartHour', 6)
    await setSetting('theme', 'dark')
    expect(await getSetting('dayStartHour')).toBe(6)
    await env.db.settings.put({ key: 'fontScale', value: 'huge' })
    await env.db.settings.put({ key: 'unknown', value: 1 })
    expect(await getSetting('fontScale')).toBe(1)
    const all = await getAllSettings()
    expect(all).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 6, theme: 'dark' })
    expect(isSettingKey('theme')).toBe(true)
    expect(isSettingKey('toString')).toBe(false)
  })
})
