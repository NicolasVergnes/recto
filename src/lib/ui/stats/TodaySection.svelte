<script lang="ts">
  import { t } from '$lib/i18n'
  import { formatInterval } from '$lib/i18n/format'
  import { todayStats } from '$lib/stats'
  import { pct } from './format'
  import StatTiles, { type StatTile } from './StatTiles.svelte'
  import type { StatsData } from './types'

  interface Props {
    data: StatsData
    now: number
  }
  let { data, now }: Props = $props()

  const fmt = new Intl.NumberFormat('fr-FR')
  const today = $derived(todayStats(data.reviews, now, data.dayStartHour))
  const tiles = $derived<StatTile[]>([
    {
      label: t('stats.dueToday'),
      figure: fmt.format(data.today.learning + data.today.review),
      detail: t('stats.dueDetail', { learning: data.today.learning, review: data.today.review }),
    },
    { label: t('stats.newToday'), figure: fmt.format(data.today.new) },
    {
      label: t('stats.done'),
      figure: fmt.format(today.done),
      detail: t('stats.time', {
        time: today.timeMs > 0 ? formatInterval(Math.max(60_000, today.timeMs)) : '0 min',
      }),
    },
    { label: t('stats.success'), figure: pct(today.successRate) },
  ])
</script>

<section aria-labelledby="today-title" class="stack">
  <h2 id="today-title">{t('common.today')}</h2>
  <StatTiles {tiles} />
</section>
