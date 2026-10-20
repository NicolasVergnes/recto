import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getAllSettings,
  getSetting,
  isSettingKey,
  newDeckModel,
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
    // Browser view and flip style: enumerations, anything else falls back to the default.
    expect(await getSetting('browserView')).toBe('list')
    expect(await getSetting('flipStyle')).toBe('horizontal')
    expect(await getSetting('tileSize')).toBe('medium')
    await setSetting('tileSize', 'small')
    expect(await getSetting('tileSize')).toBe('small')
    await env.db.settings.put({ key: 'tileSize', value: 'huge' })
    await setSetting('flipStyle', 'none')
    await env.db.settings.put({ key: 'browserView', value: 'grid' })
    expect(await getSetting('browserView')).toBe('list')
    expect(await getSetting('flipStyle')).toBe('none')
    await env.db.settings.put({ key: 'flipStyle', value: 3 })
    const all = await getAllSettings()
    expect(all).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 6, theme: 'dark' })
    expect(isSettingKey('theme')).toBe(true)
    expect(isSettingKey('toString')).toBe(false)
  })

  it('schedules new decks with FSRS until another model is chosen (M19)', async () => {
    expect(await newDeckModel()).toEqual({ model: 'fsrs', custom: [1, 2, 7, 30, 90, 180, 365] })
    await setSetting('newDeckModel', 'custom', 5)
    await setSetting('leitnerCustom', [1, 4, 10], 5)
    expect(await newDeckModel()).toEqual({ model: 'custom', custom: [1, 4, 10] })
    expect(await env.db.settings.get('leitnerCustom')).toMatchObject({ updatedAt: 5 })
    // « Ma boîte » keeps 2 to 10 compartments of whole days, never shorter than the previous one.
    for (const value of [[1], [3, 2], [1, 2.5], 'x']) {
      await env.db.settings.put({ key: 'leitnerCustom', value })
      expect(await getSetting('leitnerCustom')).toEqual([1, 2, 7, 30, 90, 180, 365])
    }
    await env.db.settings.put({ key: 'newDeckModel', value: 'leitner' })
    expect(await getSetting('newDeckModel')).toBe('fsrs')
  })
})
