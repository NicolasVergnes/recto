import { t } from './t'

const DAY = 86_400_000

/** Human delay: "maintenant", "10 min", "3 h", "demain", "dans 4 j", "dans 3 mois", "dans 1,2 an". */
export function formatInterval(ms: number): string {
  if (ms < 30_000) return t('common.now')
  if (ms < 60 * 60_000) return t('common.minutes', { n: Math.max(1, Math.round(ms / 60_000)) })
  if (ms < 20 * 3_600_000) return t('common.hours', { n: Math.round(ms / 3_600_000) })
  const days = Math.round(ms / DAY)
  if (days <= 1) return t('common.tomorrowLower')
  if (days < 60) return t('common.inDays', { n: days })
  if (days < 365) return t('common.inMonths', { n: Math.round(days / 30) })
  return t('common.inYears', { n: Math.round((days / 365) * 10) / 10 })
}
