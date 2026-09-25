import type { Card } from '$lib/domain/types'
import { t } from '$lib/i18n'
import { formatInterval } from '$lib/i18n/format'

export { formatInterval }

const DAY = 86_400_000
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(ms: number): string {
  return dateFormat.format(ms)
}

export function formatDateTime(ms: number): string {
  return dateTimeFormat.format(ms)
}

/** Due column of the browser. Overdue cards are not shown as a debt (P6): just the date. */
export function formatDue(card: Pick<Card, 'state' | 'due'>, now: number): string {
  if (card.state === 0) return t('browser.dueNew')
  if (card.due <= now) return t('common.today')
  return card.due - now < 45 * DAY ? formatInterval(card.due - now) : formatDate(card.due)
}

export function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const n = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  })
  return `${n.format(value)}\u00a0${units[unit]}`
}
