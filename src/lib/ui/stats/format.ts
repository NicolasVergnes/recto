import type { Card } from '$lib/domain/types'
import { t } from '$lib/i18n'
import { addDays, studyDate } from '$lib/scheduler/day'
import { forecast, type HeatDay } from '$lib/stats'

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'numeric' })
const longDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** « 67 % », or a dash when there was nothing to measure. */
export function pct(x: number | null): string {
  return x === null ? '—' : t('common.percent', { n: Math.round(x * 100) })
}

/**
 * The 30 columns of the forecast chart: cards due per study day, the full label of each day
 * (tooltip, table) and an axis tick under every fifth one.
 */
export function forecastColumns(cards: readonly Card[], now: number, dayStartHour: number) {
  const values = forecast(cards, now, dayStartHour)
  const start = studyDate(now, dayStartHour)
  const dates = values.map((_, i) => {
    const d = addDays(start, i)
    return new Date(d.year, d.month, d.day, 12)
  })
  return {
    values,
    labels: dates.map((d, i) =>
      i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : longDate.format(d),
    ),
    ticks: dates.map((d, i) => (i % 5 === 0 ? shortDate.format(d) : '')),
  }
}

/** Screen-reader text of one heatmap day: « 3 révisions le vendredi 25 septembre ». */
export function describeHeatDay(day: HeatDay): string {
  const [y = 0, m = 1, d = 1] = day.key.split('-').map(Number)
  return t('stats.heatDay', { n: day.count, date: longDate.format(new Date(y, m - 1, d, 12)) })
}
