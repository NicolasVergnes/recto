import { describe, expect, it } from 'vitest'
import { addDays, dayKey, dayStart, daysBetween, nextDayStart, studyDate } from '$lib/scheduler/day'

// tests/setup.ts sets TZ=Europe/Paris.
const paris = (iso: string) => new Date(iso).getTime()

describe('study days (Europe/Paris, day starts at 04:00)', () => {
  it('runs in the Paris time zone', () => {
    expect(new Date(paris('2026-01-15T12:00:00Z')).getHours()).toBe(13)
  })

  it('belongs to the previous day before 04:00', () => {
    expect(dayKey(paris('2026-09-25T01:59:00Z'), 4)).toBe('2026-09-24') // 03:59 local
    expect(dayKey(paris('2026-09-25T02:00:00Z'), 4)).toBe('2026-09-25') // 04:00 local
    expect(studyDate(paris('2026-09-28T10:00:00Z'), 4).weekday).toBe(1) // Monday
  })

  it('computes day bounds in local time', () => {
    const now = paris('2026-09-25T10:00:00Z')
    expect(new Date(dayStart(now, 4)).toISOString()).toBe('2026-09-25T02:00:00.000Z')
    expect(new Date(nextDayStart(now, 4)).toISOString()).toBe('2026-09-26T02:00:00.000Z')
    expect(new Date(dayStart(paris('2026-09-25T01:00:00Z'), 4)).toISOString()).toBe(
      '2026-09-24T02:00:00.000Z',
    )
  })

  it('handles daylight-saving changes (23 h and 25 h days)', () => {
    // 2026-03-29: clocks go 02:00 → 03:00 in Paris.
    const spring = paris('2026-03-28T12:00:00Z')
    expect(nextDayStart(spring, 4) - dayStart(spring, 4)).toBe(23 * 3_600_000)
    expect(new Date(nextDayStart(spring, 4)).toISOString()).toBe('2026-03-29T02:00:00.000Z')
    // 2026-10-25: clocks go 03:00 → 02:00.
    const autumn = paris('2026-10-24T12:00:00Z')
    expect(nextDayStart(autumn, 4) - dayStart(autumn, 4)).toBe(25 * 3_600_000)
    expect(new Date(nextDayStart(autumn, 4)).toISOString()).toBe('2026-10-25T03:00:00.000Z')
  })

  it('counts days and adds calendar days', () => {
    expect(daysBetween(paris('2026-09-25T10:00:00Z'), paris('2026-09-26T01:00:00Z'), 4)).toBe(0)
    expect(daysBetween(paris('2026-09-25T10:00:00Z'), paris('2026-09-26T03:00:00Z'), 4)).toBe(1)
    expect(daysBetween(paris('2026-03-01T10:00:00Z'), paris('2026-04-01T10:00:00Z'), 4)).toBe(31)
    expect(addDays({ year: 2026, month: 11, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 0,
      day: 1,
      weekday: 5,
    })
    expect(dayStart(paris('2026-09-25T10:00:00Z'), 0)).toBe(paris('2026-09-24T22:00:00Z'))
  })
})
