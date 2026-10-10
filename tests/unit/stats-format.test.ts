import { describe, expect, it } from 'vitest'
import { describeHeatDay, forecastColumns, pct } from '$lib/ui/stats/format'
import { card, paris } from '../helpers/fixtures'

const DAY = 86_400_000
const now = paris('2026-09-25T08:00:00Z') // Friday 10:00 local

describe('statistics screen formatting', () => {
  it('writes a share as a percentage, a dash without data', () => {
    expect(pct(null)).toBe('—')
    expect(pct(0)).toBe('0 %')
    expect(pct(0.666)).toBe('67 %')
    expect(pct(1)).toBe('100 %')
  })

  it('labels the 30 forecast columns: today, tomorrow, then dates; a tick every 5 days', () => {
    const cards = [
      card('a', { state: 2, due: now + 2 * DAY }),
      card('b', { state: 2, due: now - DAY }),
    ]
    const columns = forecastColumns(cards, now, 4)
    expect(columns.values).toHaveLength(30)
    expect(columns.values[0]).toBe(1) // overdue counts today
    expect(columns.values[2]).toBe(1)
    expect(columns.labels).toHaveLength(30)
    expect(columns.labels.slice(0, 3)).toEqual(['Aujourd’hui', 'Demain', 'dimanche 27 septembre'])
    expect(columns.labels[29]).toBe('samedi 24 octobre')
    expect(columns.ticks).toHaveLength(30)
    expect(columns.ticks.map((tick, i) => (tick ? i : -1)).filter((i) => i >= 0)).toEqual([
      0, 5, 10, 15, 20, 25,
    ])
    expect(columns.ticks[0]).toBe('25/09')
    expect(columns.ticks[5]).toBe('30/09')
    expect(columns.ticks[10]).toBe('05/10')
  })

  it('starts the forecast on the study day, not the calendar day, before the day start hour', () => {
    // 02:30 local on Friday still belongs to Thursday's study day (day starts at 04:00).
    const columns = forecastColumns([], paris('2026-09-25T00:30:00Z'), 4)
    expect(columns.ticks[0]).toBe('24/09')
    expect(columns.labels[2]).toBe('samedi 26 septembre')
  })

  it('describes a heatmap day for screen readers, in the singular up to one review', () => {
    expect(describeHeatDay({ key: '2026-09-25', weekday: 4, count: 3 })).toBe(
      '3 révisions le vendredi 25 septembre',
    )
    expect(describeHeatDay({ key: '2026-09-25', weekday: 4, count: 1 })).toBe(
      '1 révision le vendredi 25 septembre',
    )
    expect(describeHeatDay({ key: '2026-09-25', weekday: 4, count: 0 })).toBe(
      '0 révision le vendredi 25 septembre',
    )
  })
})
